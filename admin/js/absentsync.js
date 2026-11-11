'use strict';
/* ═══════════════════════════════════════════════════════════
   결석 현황 자동 연동 (출결 체크 → 일일 업무보고 → 주간 업무일지)
   - 결석 판단 근거 (관별 · 날짜별)
       1) 출결 체크 저장본: dailyDrafts/att_{관}_{날짜}, att_all_{날짜}
          (출결 체크에서 결석·사유를 바꾸면 att_{학생 관}_{날짜}에 자동 저장 — attendance.js)
       2) 지금 화면에서 바꾼 출결 (같은 날짜를 보고 있을 때)
       3) 결석 사유서 absences (학부모 앱 제출 · 관리부 전화 접수) — 사유서가 있으면 결석
   - 학부모 앱으로 제출된 사유서는 verified(관리부 사실 확인)가 될 때까지 경고 표시
   - 결과 형식 (일일 업무보고 「출결 현황(결석자)」 칸)
       송문찬T
       김근우 - 병결
   모든 파일은 같은 전역 범위를 공유합니다 (db, studentsCache, absMapFor 등)
   ═══════════════════════════════════════════════════════════ */
const ABS_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const absSyncEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function absTeacherLabel(n) {
  const t = String(n || '').trim();
  if (!t) return '담당 미지정';
  return /[Tt]$/.test(t) ? t.replace(/t$/, 'T') : t + 'T';
}
// 결석 사유서 → 보고서용 사유 (예: 병결 / 병결(장염))
function absReasonText(a) {
  const r = String(a.reason || '').trim();
  const d = String(a.detail || '').replace(/\s+/g, ' ').trim();
  if (!d) return r || '사유서';
  const short = d.length > 20 ? d.slice(0, 20) + '…' : d;
  return r ? `${r}(${short})` : short;
}
// 학부모가 앱으로 낸 사유서인데 관리부가 아직 사실 확인 안 함
const absNeedsCheck = (a) => !!a && a.source !== 'phone' && !a.verified;

// 관·날짜의 결석 학생 목록
//  → [{ sid, name, grade, cls, teacher, reason, abs(사유서|null), warn(학부모 입력·미확인) }]
window.absentBuild = async function (branch, dateStr) {
  if ((typeof studentsCache === 'undefined' || !studentsCache.length) && typeof loadStudents === 'function') {
    try { await loadStudents(); } catch (e) {}
  }
  if (typeof absLoad === 'function') { try { await absLoad(); } catch (e) {} }
  const dayName = ABS_DOW[new Date(dateStr + 'T00:00:00').getDay()];
  const status = {}, reasons = {};
  try {
    const [all, br] = await Promise.all([
      getDoc(doc(db, 'dailyDrafts', `att_all_${dateStr}`)),
      getDoc(doc(db, 'dailyDrafts', `att_${branch}_${dateStr}`)),
    ]);
    [all, br].forEach((s) => {
      if (!s.exists()) return;
      const d = s.data();
      Object.assign(status, d.status || {});
      Object.entries(d.reasons || {}).forEach(([k, v]) => { if (String(v || '').trim()) reasons[k] = v; });
    });
  } catch (e) { console.warn('출결 저장본 불러오기 실패', e); }
  // 지금 출결 화면에서 같은 날짜를 보고 있으면, 손댄 학생은 화면 상태가 최신
  try {
    if (typeof attCurrentDate !== 'undefined' && toLocalDateStr(attCurrentDate) === dateStr) {
      (window.attTouched || new Set()).forEach((uid) => { if (attStatus[uid]) status[uid] = attStatus[uid]; });
      Object.entries((attReasons || {})[dateStr] || {}).forEach(([k, v]) => { if (String(v || '').trim()) reasons[k] = v; });
    }
  } catch (e) {}
  const absMap = typeof absMapFor === 'function' ? absMapFor(dateStr) : {};
  const out = [];
  (studentsCache || []).forEach((s) => {
    if (s.branch !== branch || s.status === '퇴원') return;
    const abs = absMap[s.id] || null;
    const st = status[s.id];
    const scheduled = (s.days || []).includes(dayName);
    if (!scheduled && !abs) return;
    const isAbsent = abs ? st !== 'none' : st === 'absent';
    if (!isAbsent) return;
    out.push({
      sid: s.id, name: s.name || '', grade: s.grade || '', cls: s.classGroup || '',
      teacher: absTeacherLabel(s.teacherName),
      reason: abs ? absReasonText(abs) : String(reasons[s.id] || '').trim(),
      abs, warn: absNeedsCheck(abs),
    });
  });
  out.sort((a, b) => a.teacher.localeCompare(b.teacher, 'ko') || a.cls.localeCompare(b.cls, 'ko') || a.name.localeCompare(b.name, 'ko'));
  return out;
};

// 일일 업무보고 칸 형식 — 선생님별 묶음
window.absentText = function (items) {
  const groups = {};
  items.forEach((it) => { (groups[it.teacher] = groups[it.teacher] || []).push(it); });
  return Object.keys(groups).sort((a, b) => (a === '담당 미지정') - (b === '담당 미지정') || a.localeCompare(b, 'ko'))
    .map((t) => [t, ...groups[t].map((it) => `${it.name} - ${it.reason || '사유 미입력'}`)].join('\n'))
    .join('\n');
};

// 경고 상자 — 학부모가 앱으로 입력한 결석(미확인)
//  items: absentBuild 결과(여러 날이면 date 붙여서), onDone: 확인 후 다시 그리기
window.absentWarnHtml = function (items, refreshFn) {
  const w = items.filter((it) => it.warn);
  if (!w.length) return '';
  const seen = new Set();
  const rows = w.filter((it) => { const k = it.abs.id; if (seen.has(k)) return false; seen.add(k); return true; });
  return `<div style="margin-top:8px;padding:10px 12px;border:1.5px solid #E8A33D;background:#FFF8E8;border-radius:10px;font-size:12.5px;line-height:1.6;color:#1E1838;">
    <div style="font-weight:800;color:#B26A00;margin-bottom:4px;">⚠ 학부모가 앱으로 입력한 결석 ${rows.length}건 — 관리부에서 사실인지 꼭 확인해 주세요</div>
    ${rows.map((it) => `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0;">
      <span>${it.date ? `<b>${absSyncEsc(it.date)}</b> · ` : ''}<b>${absSyncEsc(it.name)}</b> <span style="color:var(--muted);">${absSyncEsc(it.cls || it.grade)} · ${absSyncEsc(it.teacher)}</span> — ${absSyncEsc(it.reason)}</span>
      <button type="button" onclick="absVerify('${it.abs.id}', ${refreshFn})" style="margin-left:auto;background:#2E9E5B;color:#fff;border:0;border-radius:6px;padding:4px 10px;font-size:12px;font-family:inherit;cursor:pointer;">✓ 확인 완료</button>
    </div>`).join('')}
  </div>`;
};

// 관리부 사실 확인 — verified 표시 (읽음 표시도 같이)
window.absVerify = async function (id, after) {
  try {
    const a = window.currentAdmin || {};
    await updateDoc(doc(db, 'absences', id), { verified: true, verifiedBy: a.name || a.email || '', verifiedAt: new Date().toISOString(), readByAdmin: true });
    const x = (typeof absAll !== 'undefined') ? absAll.find((r) => r.id === id) : null;
    if (x) { x.verified = true; x.readByAdmin = true; }
    if (typeof renderAbsences === 'function') { try { renderAbsences(); } catch (e) {} }
    if (typeof renderAttReasons === 'function') { try { renderAttReasons(); } catch (e) {} }
    if (typeof after === 'function') after();
  } catch (e) { alert('확인 표시 실패: ' + e.message); }
};
