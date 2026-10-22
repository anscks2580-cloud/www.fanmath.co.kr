'use strict';
/* ═══════════════════════════════════════════════════════════
   학습보고서 생성 (관리자)
   - 일일테스트(dailyTests) + 학생별 오답(dailyTestResults)을 월 단위로 모아
     학생별 보고서(studentReports/{월}_{학생uid})를 만든다. 집계·판정 기준은 report-calc.js 한 곳.
   - 상태: draft(초안) → reviewed(선생님 검수 완료) → sent(학부모 발송)
   - 다시 생성하면 숫자는 새로 계산하되, 선생님이 고친 의견(reviewed 이상)은 유지한다.
   ═══════════════════════════════════════════════════════════ */
let srCalc = null;        // report-calc.js 모듈
let srRows = [];          // 현재 조회된 보고서들
let srInited = false;

const srEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const srIsMiddle = (s) => { const g = String(s?.grade || '').trim(); return !(g.startsWith('고') || /N수|재수|졸업/.test(g)); };
// Firestore는 배열 안의 배열을 못 받으므로, 혹시 남아 있으면 문자열로 바꿔 저장
function srSanitize(v, inArray) {
  if (Array.isArray(v)) return inArray ? JSON.stringify(v) : v.map((x) => srSanitize(x, true));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = srSanitize(v[k], false); return o; }
  return v;
}
function srMsg(text, type) { showMsg('srMsg', text, type || 'success'); }
function srMonthRange(month) { const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`]; }

window.initStudyReportTab = async function () {
  if (!srInited) {
    srInited = true;
    // 기본값: 매달 1~5일에는 지난달, 그 뒤로는 이번 달
    const d = new Date(); if (d.getDate() <= 5) d.setDate(0);
    document.getElementById('srMonth').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // 동적 import는 문서(admin.html) 기준으로 경로가 잡히므로 사이트 루트의 report-calc.js를 절대 경로로
    try { srCalc = await import(new URL('report-calc.js?v=' + Date.now(), location.href).href); } catch (e) { srMsg('집계 모듈(report-calc.js)을 불러오지 못했습니다: ' + e.message, 'error'); }
    try {
      const ts = await getDocs(collection(db, 'teachers'));
      const sel = document.getElementById('srTeacher');
      const opts = []; ts.forEach((t) => opts.push({ id: t.id, name: t.data().name || '' }));
      opts.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      sel.innerHTML = '<option value="">전체</option>' + opts.map((t) => `<option value="${t.id}">${srEsc(t.name)}</option>`).join('');
    } catch (e) { /* 무시 */ }
  }
  srLoad();
};

// ── 그 달 원본 데이터 읽기 ──
async function srFetchMonth(month) {
  const [from, to] = srMonthRange(month);
  const tSnap = await getDocs(query(collection(db, 'dailyTests'), where('date', '>=', from), where('date', '<=', to)));
  const tests = []; tSnap.forEach((d) => tests.push({ id: d.id, ...d.data() }));
  const rSnap = await getDocs(query(collection(db, 'dailyTestResults'), where('date', '>=', from), where('date', '<=', to)));
  const results = []; rSnap.forEach((d) => results.push({ id: d.id, ...d.data() }));
  const sSnap = await getDocs(collection(db, 'students'));
  const students = []; sSnap.forEach((d) => { const s = { id: d.id, ...d.data() }; if (srIsMiddle(s)) students.push(s); });
  return { tests, results, students };
}

// ── ① 생성 ──
window.srGenerate = async function () {
  const month = document.getElementById('srMonth').value;
  const teacherUid = document.getElementById('srTeacher').value;
  if (!month) { srMsg('보고 월을 골라주세요.', 'error'); return; }
  if (!srCalc) { srMsg('집계 모듈이 준비되지 않았습니다. 새로고침 후 다시 시도해 주세요.', 'error'); return; }
  if (!confirm(`${month} 보고서를 생성할까요?\n이미 있는 초안은 숫자가 다시 계산됩니다. (검수 완료된 의견은 유지)`)) return;
  srMsg('집계 중...', 'success');
  try {
    const { tests, results, students } = await srFetchMonth(month);
    if (!tests.length) { srMsg(`${month}에 등록된 일일테스트가 없습니다.`, 'error'); return; }
    const byStudent = {};
    results.forEach((r) => (byStudent[r.studentId] = byStudent[r.studentId] || []).push(r));
    const byClass = {};
    results.forEach((r) => { const t = tests.find((x) => x.id === r.testId); const c = t?.classGroup || ''; (byClass[c] = byClass[c] || []).push(r); });
    const existing = {};
    const eSnap = await getDocs(query(collection(db, 'studentReports'), where('month', '==', month)));
    eSnap.forEach((d) => { existing[d.id] = d.data(); });

    let made = 0, skipped = 0, kept = 0;
    const targets = students.filter((s) => byStudent[s.id] && (!teacherUid || s.teacherUid === teacherUid));
    for (const s of targets) {
      const myRes = byStudent[s.id];
      const myTests = tests.filter((t) => myRes.some((r) => r.testId === t.id));
      const cls = myTests[0]?.classGroup || s.classGroup || '';
      const rep = srCalc.buildStudentReport({ student: s, month, tests, results: myRes, classResults: byClass[cls] || [] });
      const id = `${month}_${s.id}`;
      const prev = existing[id];
      if (prev && prev.status === 'sent') { skipped++; continue; }
      const keepComment = prev && prev.status === 'reviewed' && prev.comment;
      const data = {
        ...rep,
        classGroup: cls || rep.classGroup,
        teacherUid: s.teacherUid || myTests[0]?.teacherUid || '',
        teacherName: s.teacherName || myTests[0]?.teacherName || '',
        comment: keepComment ? prev.comment : srCalc.draftComment(rep),
        commentAuto: keepComment ? (prev.commentAuto || '') : srCalc.draftComment(rep),
        status: keepComment ? 'reviewed' : 'draft',
        generatedAt: new Date().toISOString(),
        createdAt: prev?.createdAt || new Date().toISOString(),
      };
      await setDoc(doc(db, 'studentReports', id), srSanitize(data));
      made++; if (keepComment) kept++;
    }
    srMsg(`✅ ${month} 보고서 ${made}명 생성 (검수 의견 유지 ${kept}명 · 발송 완료라 건너뜀 ${skipped}명)`, 'success');
    srLoad();
  } catch (e) {
    srMsg('생성 오류: ' + e.message, 'error');
  }
};

// ── 현황 조회 ──
window.srLoad = async function () {
  const month = document.getElementById('srMonth').value;
  const teacherUid = document.getElementById('srTeacher').value;
  const body = document.getElementById('srBody');
  if (!month) return;
  body.innerHTML = '<tr><td colspan="9" style="color:var(--muted);padding:20px;text-align:center;">불러오는 중...</td></tr>';
  try {
    const snap = await getDocs(query(collection(db, 'studentReports'), where('month', '==', month)));
    srRows = []; snap.forEach((d) => srRows.push({ id: d.id, ...d.data() }));
    if (teacherUid) srRows = srRows.filter((r) => r.teacherUid === teacherUid);
    srRows.sort((a, b) => (a.classGroup || '').localeCompare(b.classGroup || '', 'ko') || (a.studentName || '').localeCompare(b.studentName || '', 'ko'));
    const st = { draft: 0, reviewed: 0, sent: 0 };
    srRows.forEach((r) => { st[r.status] = (st[r.status] || 0) + 1; });
    document.getElementById('srStat').innerHTML = srRows.length
      ? `<span>전체 <b>${srRows.length}</b>명</span><span>초안 <b>${st.draft}</b></span><span>검수 완료 <b>${st.reviewed}</b></span><span>발송 <b>${st.sent}</b></span>`
      : '';
    if (!srRows.length) { body.innerHTML = '<tr><td colspan="9" style="color:var(--muted);padding:20px;text-align:center;">아직 생성된 보고서가 없습니다. ① 버튼으로 만들어 주세요.</td></tr>'; return; }
    const stLabel = { draft: '초안', reviewed: '검수 완료', sent: '발송됨' };
    body.innerHTML = srRows.map((r) => `
      <tr>
        <td style="font-weight:600;color:var(--off-white);">${srEsc(r.studentName)} <span style="font-size:11px;color:var(--muted);">${srEsc(r.grade)}</span></td>
        <td>${srEsc(r.classGroup || '-')}</td>
        <td>${srEsc(r.teacherName || '-')}</td>
        <td class="r">${r.summary?.tests ?? 0}회</td>
        <td class="r">${r.summary?.total ?? 0}</td>
        <td class="r">${r.summary?.pct ?? '-'}%</td>
        <td class="r">${r.summary?.gradeBand ?? '-'}</td>
        <td><span class="sr-st ${r.status || 'none'}">${stLabel[r.status] || r.status || '-'}</span></td>
        <td style="white-space:nowrap;"><a class="sr-link" href="report.html?id=${encodeURIComponent(r.id)}" target="_blank">미리보기</a>${r.status === 'sent' ? ` <a class="sr-link" href="#" style="color:#ff9090;border-color:rgba(255,80,80,0.3);" onclick="srUnpublish('${r.id}');return false;">공개 취소</a>` : ''}</td>
      </tr>`).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="9" style="color:#ff9090;padding:20px;text-align:center;">오류: ${srEsc(e.message)}</td></tr>`;
  }
};

// ── ④ 학부모 공개: 검수 완료(reviewed) → 발송(sent). 학부모 페이지·학생 계정에서 열람 가능해짐 ──
window.srPublish = async function () {
  const targets = srRows.filter((r) => r.status === 'reviewed');
  const drafts = srRows.filter((r) => r.status === 'draft').length;
  if (!targets.length) { srMsg(`공개할 검수 완료 보고서가 없습니다.${drafts ? ` (초안 ${drafts}명은 선생님 검수가 먼저 필요합니다)` : ''}`, 'error'); return; }
  if (!confirm(`검수 완료된 ${targets.length}명의 보고서를 학부모에게 공개할까요?${drafts ? `\n(초안 ${drafts}명은 제외됩니다)` : ''}`)) return;
  let n = 0;
  for (const r of targets) {
    await updateDoc(doc(db, 'studentReports', r.id), { status: 'sent', sentAt: new Date().toISOString() });
    n++;
  }
  srMsg(`✅ ${n}명 보고서를 학부모에게 공개했습니다.`, 'success');
  srLoad();
};
window.srUnpublish = async function (id) {
  if (!confirm('이 보고서의 학부모 공개를 취소할까요? (검수 완료 상태로 돌아갑니다)')) return;
  await updateDoc(doc(db, 'studentReports', id), { status: 'reviewed' });
  srLoad();
};

// ── ② 내보내기: Claude에게 줄 파일 (숫자 요약 + 자동 의견) ──
window.srExport = function () {
  const month = document.getElementById('srMonth').value;
  if (!srRows.length) { srMsg('먼저 조회해서 목록을 띄워주세요.', 'error'); return; }
  const out = srRows.map((r) => ({
    id: r.id, month: r.month, studentName: r.studentName, grade: r.grade, classGroup: r.classGroup, teacherName: r.teacherName, status: r.status,
    summary: r.summary, weekly: r.weekly, units: r.units, strong: r.strong, weak: r.weak, diffs: r.diffs, tests: r.tests,
    comment: r.comment,
  }));
  const blob = new Blob([JSON.stringify({ month, exportedAt: new Date().toISOString(), reports: out }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `학습보고서_${month}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ── ③ 가져오기: { reports:[{id, comment}] } 형태면 의견만 반영 ──
window.srImport = async function (file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : (data.reports || []);
    let n = 0;
    for (const r of list) {
      if (!r.id || typeof r.comment !== 'string' || !r.comment.trim()) continue;
      await updateDoc(doc(db, 'studentReports', r.id), { comment: r.comment.trim(), commentImportedAt: new Date().toISOString() });
      n++;
    }
    srMsg(`✅ ${n}명의 선생님 의견을 반영했습니다.`, 'success');
    srLoad();
  } catch (e) {
    srMsg('가져오기 오류: ' + e.message, 'error');
  }
};
