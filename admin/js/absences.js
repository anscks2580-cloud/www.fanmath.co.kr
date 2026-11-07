'use strict';
/* ═══════════════════════════════════════════════════════════
   결석 사유서
   - 학부모가 학부모 앱(출결 탭)에서 제출 → absences 컬렉션
   - 전화로만 연락 온 경우 여기서 관리부가 직접 입력 (source: 'phone')
   - 제출된 날짜는 출결 체크(attendance.js)에서 자동 결석, 등원·하원 표(checkinout.js)에 「결석」 표시
   - 관리자 홈 카드(home.js), 담당 선생님 「오늘 할 일」(teacher.html)에도 표시
   - 평촌관 · 산본관 구분
   모든 파일은 같은 전역 범위를 공유합니다 (db, studentsCache, Timestamp 등)
   ═══════════════════════════════════════════════════════════ */
let absAll = [];            // 전체 사유서 (최근 것부터)
let absLoadedAt = 0;
let absFormSel = new Set(); // 수동 입력 — 선택한 날짜
let absFormMonth = null;
let absFormStudent = null;
let absFormReason = '';

function absToday() {
  const k = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
}
function absMD(ds) { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`; }
function absEsc(t) { return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// 다른 화면에서도 쓰는 공용: 사유서 불러오기 + 날짜별 조회
window.absLoad = async function (force) {
  if (!force && absAll.length && Date.now() - absLoadedAt < 30 * 1000) return absAll;
  try {
    const snap = await getDocs(query(collection(db, 'absences'), orderBy('createdAt', 'desc')));
    absAll = []; snap.forEach((d) => absAll.push({ id: d.id, ...d.data() }));
    absLoadedAt = Date.now();
  } catch (e) { console.warn('결석 사유서 불러오기 실패', e); }
  return absAll;
};
// 그 날짜의 결석 사유서 { 학생uid: 사유서 }
window.absMapFor = function (dateStr) {
  const m = {};
  absAll.forEach((a) => { if ((a.dates || []).includes(dateStr) && !m[a.studentId]) m[a.studentId] = a; });
  return m;
};

window.initAbsences = async function () {
  await absLoad(true);
  renderAbsences();
};

window.renderAbsences = function () {
  const el = document.getElementById('absList'); if (!el) return;
  const br = document.getElementById('absBranch')?.value || '';
  const showPast = document.getElementById('absShowPast')?.checked;
  const today = absToday();
  const rows = absAll.filter((a) => (!br || a.branch === br) && (showPast || (a.dates || []).some((d) => d >= today)));
  const newCnt = absAll.filter((a) => !a.readByAdmin && (a.dates || []).some((d) => d >= today)).length;
  const badge = document.getElementById('absNewBadge'); if (badge) badge.textContent = newCnt ? `새로 ${newCnt}건` : '';
  if (!rows.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px 0;">${showPast ? '결석 사유서가 없습니다.' : '앞으로 예정된 결석이 없습니다.'}</div>`; return; }
  const bc = (b) => b === '산본관' ? '#C99A0A' : '#5B3FA6';
  el.innerHTML = rows.map((a) => {
    const ds = [...(a.dates || [])].sort();
    const dt = a.createdAt?.toDate ? a.createdAt.toDate() : null;
    return `<div style="padding:12px 14px;border:1px solid ${a.readByAdmin ? 'rgba(30,24,56,0.1)' : 'rgba(200,84,31,0.45)'};background:${a.readByAdmin ? '#fff' : '#FFF7F2'};border-radius:12px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${a.readByAdmin ? '' : '<span style="background:#C8541F;color:#fff;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:999px;">NEW</span>'}
        <b style="color:${bc(a.branch)};font-size:12px;">${absEsc(a.branch || '')}</b>
        <b>${absEsc(a.studentName)}</b><span style="font-size:12px;color:var(--muted);">${absEsc(a.grade || '')} · ${absEsc(a.classGroup || '-')} · ${absEsc(a.teacherName || '')} 선생님</span>
        <span style="margin-left:auto;font-size:11.5px;color:var(--muted);">${a.source === 'phone' ? '📞 전화 접수' : '📱 학부모 앱'}${dt ? ` · ${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : ''}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px;">${ds.map((d) => `<span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:${d === today ? '#C8541F' : '#FBE9E0'};color:${d === today ? '#fff' : '#C8541F'};">${absMD(d)}${d === today ? ' 오늘' : ''}</span>`).join('')}</div>
      <div style="font-size:13px;margin-top:6px;"><b>${absEsc(a.reason || '')}</b>${a.detail ? ` — <span style="white-space:pre-wrap;">${absEsc(a.detail)}</span>` : ''}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;font-size:12px;">
        ${a.readByAdmin ? '<span style="color:#2E9E5B;">✓ 확인함</span>' : `<a href="#" onclick="absMarkRead('${a.id}');return false;" style="color:#5B3FA6;font-weight:700;">확인</a>`}
        <a href="#" onclick="absDelete('${a.id}');return false;" style="color:var(--muted);">삭제</a>
      </div>
    </div>`;
  }).join('');
};

window.absMarkRead = async function (id) {
  try { await updateDoc(doc(db, 'absences', id), { readByAdmin: true }); const a = absAll.find((x) => x.id === id); if (a) a.readByAdmin = true; renderAbsences(); if (typeof window.refreshHomeTab === 'function') window.refreshHomeTab(); }
  catch (e) { alert('처리 실패: ' + e.message); }
};
window.absDelete = async function (id) {
  const a = absAll.find((x) => x.id === id); if (!a) return;
  if (!confirm(`${a.studentName} 학생의 결석 사유서(${(a.dates || []).map(absMD).join(', ')})를 삭제할까요?\n출결 체크의 자동 결석도 같이 풀립니다.`)) return;
  try { await deleteDoc(doc(db, 'absences', id)); absAll = absAll.filter((x) => x.id !== id); renderAbsences(); afterAbsChange(); }
  catch (e) { alert('삭제 실패: ' + e.message); }
};
function afterAbsChange() {
  if (typeof window.renderAttendance === 'function') { try { window.attAbsDate = ''; window.renderAttendance(); } catch (e) {} }
  if (typeof window.renderCheckInOut === 'function') { try { window.renderCheckInOut(); } catch (e) {} }
}

// ── 전화 접수 수동 입력 ──
window.absOpenForm = function () {
  absFormSel = new Set(); absFormStudent = null; absFormReason = '';
  const k = new Date(absToday() + 'T00:00:00'); absFormMonth = new Date(k.getFullYear(), k.getMonth(), 1);
  document.getElementById('absForm').style.display = 'block';
  document.getElementById('absFormSearch').value = '';
  document.getElementById('absFormDetail').value = '';
  absRenderForm();
  document.getElementById('absFormSearch').focus();
};
window.absCloseForm = function () { document.getElementById('absForm').style.display = 'none'; };
window.absFormPick = function (sid) { absFormStudent = studentsCache.find((s) => s.id === sid) || null; document.getElementById('absFormSearch').value = ''; absRenderForm(); };
window.absFormDay = function (ds) { if (absFormSel.has(ds)) absFormSel.delete(ds); else absFormSel.add(ds); absRenderForm(); };
window.absFormMonthMove = function (d) { absFormMonth = new Date(absFormMonth.getFullYear(), absFormMonth.getMonth() + d, 1); absRenderForm(); };
window.absFormSetReason = function (r) { absFormReason = r; absRenderForm(); };
window.absRenderForm = function () {
  // 학생 고르기 (이름 검색)
  const q = (document.getElementById('absFormSearch').value || '').trim();
  const pick = document.getElementById('absFormPick');
  if (absFormStudent) {
    pick.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;background:#F3EFFC;border-radius:999px;padding:6px 12px;font-size:13px;"><b style="color:${absFormStudent.branch === '산본관' ? '#C99A0A' : '#5B3FA6'};">${absEsc(absFormStudent.branch || '')}</b><b>${absEsc(absFormStudent.name)}</b> ${absEsc(absFormStudent.grade || '')} · ${absEsc(absFormStudent.classGroup || '')}<a href="#" onclick="absFormStudent=null;absRenderForm();return false;" style="color:var(--muted);">✕</a></span>`;
  } else if (q) {
    const hits = studentsCache.filter((s) => (s.name || '').includes(q)).slice(0, 12);
    pick.innerHTML = hits.length ? hits.map((s) => `<button type="button" class="btn btn-sm btn-secondary" style="margin:0 6px 6px 0;" onclick="absFormPick('${s.id}')"><b style="color:${s.branch === '산본관' ? '#C99A0A' : '#5B3FA6'};">${absEsc(s.branch || '')}</b> ${absEsc(s.name)} <small>${absEsc(s.grade || '')} ${absEsc(s.classGroup || '')}</small></button>`).join('') : '<span style="font-size:12px;color:var(--muted);">검색 결과가 없습니다.</span>';
  } else pick.innerHTML = '<span style="font-size:12px;color:var(--muted);">학생 이름을 입력하세요.</span>';
  // 달력
  const y = absFormMonth.getFullYear(), m = absFormMonth.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), today = absToday();
  let cells = ['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<div style="font-size:11px;font-weight:700;color:${i === 0 ? '#D64545' : i === 6 ? '#2F7FD6' : 'var(--muted)'};text-align:center;">${w}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
  for (let d = 1; d <= last.getDate(); d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const on = absFormSel.has(ds);
    cells += `<button type="button" onclick="absFormDay('${ds}')" style="height:34px;border-radius:8px;border:${ds === today ? '1.5px solid #5B3FA6' : '1px solid transparent'};background:${on ? '#C8541F' : 'transparent'};color:${on ? '#fff' : '#1E1838'};font-weight:${on ? 800 : 500};cursor:pointer;font-family:inherit;">${d}</button>`;
  }
  document.getElementById('absFormCal').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:800;">
      <button type="button" class="btn btn-sm btn-secondary" onclick="absFormMonthMove(-1)">‹</button><span>${y}년 ${m + 1}월</span><button type="button" class="btn btn-sm btn-secondary" onclick="absFormMonthMove(1)">›</button></div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">${cells}</div>`;
  const sel = [...absFormSel].sort();
  document.getElementById('absFormSel').textContent = sel.length ? `선택 ${sel.length}일: ${sel.map(absMD).join(', ')}` : '결석 날짜를 눌러서 고르세요 (여러 날 가능)';
  document.querySelectorAll('#absFormReasons [data-r]').forEach((b) => { const on = b.dataset.r === absFormReason; b.style.background = on ? '#5B3FA6' : ''; b.style.color = on ? '#fff' : ''; });
};
window.absSubmitForm = async function () {
  const s = absFormStudent; const dates = [...absFormSel].sort();
  if (!s) { alert('학생을 골라 주세요.'); return; }
  if (!dates.length) { alert('결석 날짜를 골라 주세요.'); return; }
  if (!absFormReason) { alert('결석 사유를 골라 주세요.'); return; }
  const btn = document.getElementById('absFormGo'); btn.disabled = true;
  try {
    await addDoc(collection(db, 'absences'), {
      studentId: s.id, studentName: s.name || '', branch: s.branch || '', grade: s.grade || '', classGroup: s.classGroup || '',
      teacherUid: s.teacherUid || '', teacherName: s.teacherName || '',
      dates, reason: absFormReason, detail: (document.getElementById('absFormDetail').value || '').trim().slice(0, 1000),
      source: 'phone', submittedBy: (window.currentAdmin && window.currentAdmin.uid) || '', readByAdmin: true, readByTeacher: false, createdAt: Timestamp.now(),
    });
    absCloseForm();
    await absLoad(true); renderAbsences(); afterAbsChange();
    alert(`${s.name} 학생 결석 입력 완료 (${dates.map(absMD).join(', ')})`);
  } catch (e) { alert('입력 실패: ' + e.message); }
  finally { btn.disabled = false; }
};
