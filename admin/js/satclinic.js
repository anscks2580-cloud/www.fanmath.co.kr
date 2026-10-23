'use strict';
/* ═══════════════════════════════════════════════════════════
   토요 추가클리닉 (관리자 조회 · 엑셀)
   - 관(평촌관/산본관)별로 따로 조회: 학생이 속한 관 기준 (학생 없는 '클리닉 없음'은 선생님 관)
   - 분류: (여러 토요일이면 날짜) › 시간대(시작 시간) › 선생님
   - 필터: 관 · 날짜 범위 · 시간대 · 선생님 · 학년 — 날짜만 다시 불러오고 나머지는 바로 다시 그림
   - 학년(중1·중2…)은 제출 때 저장된 값 → 없으면 현재 학생 정보
   ═══════════════════════════════════════════════════════════ */
let satClinicData = [];   // 날짜 범위로 불러온 전체 기록 (가공된 행)
let satClinicView = [];   // 필터를 적용해 화면에 보이는 기록
let scBranch = '평촌관';
try { const b = localStorage.getItem('swc_sc_branch'); if (b === '평촌관' || b === '산본관') scBranch = b; } catch (e) {}

const scEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SC_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const scYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const scDateLabel = (ymd) => { const d = new Date(ymd + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${SC_DOW[d.getDay()]})`; };
const SC_GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', 'N수'];
const scGradeKey = (g) => { const i = SC_GRADE_ORDER.indexOf(g); return i < 0 ? 99 : i; };

// 시간 문자열에서 시작 시간 뽑기 → { key:'10:00', min:600 } / 못 읽으면 { key:'시간 미기재', min:9999 }
function scStartOf(r) {
  if (r.startTime && /^\d{1,2}:\d{2}$/.test(r.startTime)) {
    const [h, m] = r.startTime.split(':').map(Number);
    return { key: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, min: h * 60 + m };
  }
  const t = String(r.time || '').trim();
  const mt = t.match(/(오전|오후)?\s*(\d{1,2})\s*(?::|시)?\s*(\d{2})?/);
  if (!mt) return { key: '시간 미기재', min: 9999 };
  let h = parseInt(mt[2], 10); const m = mt[3] ? parseInt(mt[3], 10) : 0;
  if (mt[1] === '오후' && h < 12) h += 12;
  else if (!mt[1] && h >= 1 && h <= 7) h += 12;   // 토요일 클리닉: 1~7시는 오후로 봄
  if (h > 23 || m > 59) return { key: '시간 미기재', min: 9999 };
  return { key: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, min: h * 60 + m };
}
function scBranchOf(r) {
  if (r.branch) return r.branch;
  const s = r.studentId ? studentsCache.find((x) => x.id === r.studentId) : null;
  if (s?.branch) return s.branch;
  return teachersCache.find((t) => t.id === r.teacherUid)?.branch || '';
}
function scGradeOf(r) {
  if (r.studentGrade) return r.studentGrade;
  const s = r.studentId ? studentsCache.find((x) => x.id === r.studentId) : null;
  return s?.grade || '';
}

window.initSatClinicTab = async function () {
  if (typeof loadStudents === 'function' && !studentsCache.length) { try { await loadStudents(); } catch (e) {} }
  const today = new Date();
  const lastSat = new Date(today);
  lastSat.setDate(today.getDate() - ((today.getDay() + 1) % 7));   // 가장 최근 토요일
  const fromInput = document.getElementById('clinicDateFrom');
  const toInput = document.getElementById('clinicDateTo');
  if (!fromInput.value) fromInput.value = scYmd(lastSat);
  if (!toInput.value) toInput.value = scYmd(lastSat);
  document.getElementById('clinicBranch').value = scBranch;
  scFillTeachers();
};

// 선생님 목록: 고른 관에 학생이 있는(또는 그 관 소속) 선생님
function scFillTeachers() {
  const sel = document.getElementById('clinicTeacherFilter');
  const keep = sel.value;
  const ts = teachingTeachers()
    .filter((t) => studentsCache.some((s) => s.teacherUid === t.id && s.branch === scBranch) || t.branch === scBranch)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  sel.innerHTML = '<option value="">전체 선생님</option>' + ts.map((t) => `<option value="${t.id}">${scEsc(t.name)}</option>`).join('');
  if (ts.some((t) => t.id === keep)) sel.value = keep;
}
// 시간대·학년 목록: 불러온 기록에서 (고른 관 기준)
function scFillSlotsAndGrades() {
  const rows = satClinicData.filter((r) => r.branch === scBranch && !r.isNone);
  const slotSel = document.getElementById('clinicSlotFilter'), gradeSel = document.getElementById('clinicGradeFilter');
  const keepS = slotSel.value, keepG = gradeSel.value;
  const slots = [...new Map(rows.map((r) => [r.slot.key, r.slot])).values()].sort((a, b) => a.min - b.min);
  const grades = [...new Set(rows.map((r) => r.grade || '학년 미기재'))].sort((a, b) => scGradeKey(a) - scGradeKey(b) || a.localeCompare(b, 'ko'));
  slotSel.innerHTML = '<option value="">전체 시간대</option>' + slots.map((s) => `<option value="${scEsc(s.key)}">${scEsc(s.key === '시간 미기재' ? s.key : s.key + ' 시작')}</option>`).join('');
  gradeSel.innerHTML = '<option value="">전체 학년</option>' + grades.map((g) => `<option value="${scEsc(g)}">${scEsc(g)}</option>`).join('');
  if (slots.some((s) => s.key === keepS)) slotSel.value = keepS;
  if (grades.includes(keepG)) gradeSel.value = keepG;
}

window.scOnBranch = function () {
  scBranch = document.getElementById('clinicBranch').value;
  try { localStorage.setItem('swc_sc_branch', scBranch); } catch (e) {}
  document.getElementById('clinicTeacherFilter').value = '';
  document.getElementById('clinicSlotFilter').value = '';
  document.getElementById('clinicGradeFilter').value = '';
  scFillTeachers();
  if (satClinicData.length) { scFillSlotsAndGrades(); scRender(); }
};
window.scOnFilter = function () { if (satClinicData.length) scRender(); };

window.loadSatClinicAdmin = async function () {
  const fromVal = document.getElementById('clinicDateFrom').value;
  const toVal = document.getElementById('clinicDateTo').value;
  const resEl = document.getElementById('clinicAdminResult');
  if (!fromVal || !toVal) { showMsg('clinicAdminMsg', '날짜 범위를 선택해주세요.', 'error'); return; }
  showMsg('clinicAdminMsg', '조회 중...', 'success');
  resEl.innerHTML = '';
  try {
    if (typeof loadStudents === 'function' && !studentsCache.length) await loadStudents();
    const snap = await getDocs(query(
      collection(db, 'satClinicReports'),
      where('date', '>=', fromVal),
      where('date', '<=', toVal),
      orderBy('date', 'asc')
    ));
    satClinicData = [];
    snap.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      r.branch = scBranchOf(r);
      r.grade = r.isNone ? '' : scGradeOf(r);
      r.slot = r.isNone ? { key: '', min: 0 } : scStartOf(r);
      satClinicData.push(r);
    });
    scFillSlotsAndGrades();
    scRender();
  } catch (e) {
    showMsg('clinicAdminMsg', '오류: ' + e.message, 'error');
  }
};

function scRender() {
  const resEl = document.getElementById('clinicAdminResult');
  const tUid = document.getElementById('clinicTeacherFilter').value;
  const slot = document.getElementById('clinicSlotFilter').value;
  const grade = document.getElementById('clinicGradeFilter').value;
  const inBranch = satClinicData.filter((r) => r.branch === scBranch);
  const none = inBranch.filter((r) => r.isNone && (!tUid || r.teacherUid === tUid));
  satClinicView = inBranch.filter((r) => !r.isNone
    && (!tUid || r.teacherUid === tUid)
    && (!slot || r.slot.key === slot)
    && (!grade || (r.grade || '학년 미기재') === grade));
  // 정렬: 날짜 › 시작 시간 › 선생님 › 학년 › 학생
  satClinicView.sort((a, b) => a.date.localeCompare(b.date) || a.slot.min - b.slot.min
    || (a.teacherName || '').localeCompare(b.teacherName || '', 'ko')
    || scGradeKey(a.grade) - scGradeKey(b.grade) || (a.studentName || '').localeCompare(b.studentName || '', 'ko'));

  const filterNote = [tUid && (teachersCache.find((t) => t.id === tUid)?.name || '') + 'T', slot && (slot === '시간 미기재' ? slot : slot + ' 시작'), grade].filter(Boolean).join(' · ');
  if (!satClinicView.length && !none.length) {
    resEl.innerHTML = '';
    showMsg('clinicAdminMsg', `${scBranch}${filterNote ? ' (' + filterNote + ')' : ''} — 해당 기간에 제출된 토요클리닉이 없습니다.`, 'error');
    document.getElementById('clinicExcelBtn').style.display = 'none';
    return;
  }

  const dates = [...new Set(satClinicView.map((r) => r.date))];
  const multiDate = dates.length > 1;
  let html = '';
  dates.forEach((date) => {
    const dayRows = satClinicView.filter((r) => r.date === date);
    const slots = [...new Map(dayRows.map((r) => [r.slot.key, r.slot])).values()].sort((a, b) => a.min - b.min);
    html += `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:14px;">🏥 ${scEsc(scBranch)} · ${scEsc(scDateLabel(date))} <span style="font-size:12px;color:var(--muted);font-weight:400;">${dayRows.length}명</span></h3>`;
    slots.forEach((s) => {
      const sRows = dayRows.filter((r) => r.slot.key === s.key);
      const teachers = [...new Set(sRows.map((r) => r.teacherName || ''))];
      html += `<div style="margin:0 0 18px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:rgba(245,197,24,0.16);border:1px solid rgba(245,197,24,0.4);margin-bottom:10px;">
          <b style="font-size:15px;color:var(--purple, #5B3FA6);">🕘 ${scEsc(s.key === '시간 미기재' ? s.key : s.key + ' 시작')}</b>
          <span style="font-size:12px;color:var(--muted);">${sRows.length}명 · 선생님 ${teachers.length}명</span>
        </div>`;
      teachers.forEach((tn) => {
        const tRows = sRows.filter((r) => (r.teacherName || '') === tn);
        html += `<div style="margin:0 0 12px 8px;">
          <div style="font-weight:700;font-size:13.5px;color:var(--off-white);margin-bottom:6px;">👩‍🏫 ${scEsc(tn)}T <span style="font-weight:400;color:var(--muted);font-size:12px;">${tRows.length}명</span></div>
          <div style="overflow-x:auto;">
            <table class="preview-table" style="width:100%;min-width:640px;">
              <thead><tr><th style="width:90px;">학생명</th><th style="width:60px;">학년</th><th style="width:120px;">시간</th><th style="width:160px;">지참교재</th><th>클리닉 내용</th></tr></thead>
              <tbody>${tRows.map((r) => `<tr>
                <td style="font-weight:600;">${scEsc(r.studentName)}</td>
                <td>${scEsc(r.grade || '-')}</td>
                <td>${scEsc(r.time)}</td>
                <td>${scEsc(r.book)}</td>
                <td style="max-width:320px;white-space:pre-wrap;">${scEsc(r.content)}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  });
  if (none.length) {
    const byDate = {};
    none.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push((r.teacherName || '') + 'T'); });
    html += `<div class="card" style="margin-bottom:16px;"><h4 style="font-size:13.5px;margin-bottom:8px;">🚫 클리닉 없음 제출 (${scEsc(scBranch)})</h4>
      ${Object.keys(byDate).sort().map((d) => `<div style="font-size:13px;color:var(--muted);margin-bottom:4px;">${scEsc(scDateLabel(d))} — ${byDate[d].map(scEsc).join(', ')}</div>`).join('')}</div>`;
  }
  resEl.innerHTML = html;
  showMsg('clinicAdminMsg', `✅ ${scBranch}${filterNote ? ' (' + filterNote + ')' : ''} — 클리닉 ${satClinicView.length}명${multiDate ? ` · 토요일 ${dates.length}회` : ''}${none.length ? ` · 없음 제출 ${none.length}건` : ''}`, 'success');
  document.getElementById('clinicExcelBtn').style.display = satClinicView.length ? 'inline-flex' : 'none';
}

window.downloadClinicExcel = function () {
  if (!satClinicView.length) return;
  const fromVal = document.getElementById('clinicDateFrom').value;
  const toVal = document.getElementById('clinicDateTo').value;
  const rows = satClinicView.map((r) => ({
    관: r.branch,
    날짜: r.date,
    시작시간: r.slot.key,
    선생님: r.teacherName,
    학생명: r.studentName,
    학년: r.grade,
    시간: r.time,
    지참교재: r.book,
    클리닉내용: r.content,
    제출일시: r.submittedAt?.toDate?.()?.toLocaleDateString('ko-KR') || '',
  }));
  const header = ['관', '날짜', '시작시간', '선생님', '학생명', '학년', '시간', '지참교재', '클리닉내용', '제출일시'];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 9 }, { wch: 10 }, { wch: 8 }, { wch: 6 }, { wch: 16 }, { wch: 20 }, { wch: 50 }, { wch: 12 }];
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cell]) continue;
    ws[cell].s = { font: { bold: true, color: { rgb: '1A1230' } }, fill: { fgColor: { rgb: 'F0C040' } }, alignment: { horizontal: 'center' } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '토요클리닉');
  XLSX.writeFile(wb, `토요클리닉_${scBranch}_${fromVal}_${toVal}.xlsx`);
};
