/* ═══════════════════════════════════════════════════════════
   HCS 시험지 ↔ 학원 시스템 연동 공용 모듈 (2026.11)
   ───────────────────────────────────────────────────────────
   · sheetTasks/{시험id}_{학생uid}
       HCS에서 「출제하기」를 하면 학생마다 1건 생김. 정답은 들어 있지 않음(학생·학부모가 읽는 문서).
       { testId, worksheetId, studentId, studentName, studentGrade, teacherUid, teacherName, branch, classGroup,
         date(출제일), title, range, count, kinds['o'|'s'](객관식/주관식), retakeOf(오답 시험지면 원래 결과 id),
         logId·dueDate(선생님이 숙제 입력에서 연결·지정), answers[](학생 답), submitted, submittedAt, synced }
   · dailyTestResults/{시험id}_{학생uid}  (선생님·관리자만 읽음 — 채점 결과)
       기존 필드(wrong, score, percentage, graded …)에 더해
       submitted, submittedAt, studentAnswers[], autoGraded, needReview[](주관식 확인 필요 번호),
       wrongSheetId·wrongSheetAt(오답 시험지 생성), wrongSheetTestId·wrongSheetSentAt(오답 시험지 출제), logId, dueDate
   · 채점은 정답을 읽을 수 있는 화면(선생님 페이지·HCS·관리자·원장)이 열릴 때 syncSubmitted()가 자동으로 함
   ═══════════════════════════════════════════════════════════ */
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const CIRC = '①②③④⑤';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const mdw = (s) => { if (!s) return ''; const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };

// 등원 요일(students.days: ['월','수','금'] 또는 '월수금') → 요일 글자 배열
export function daysOf(stu) {
  const d = stu && stu.days;
  const arr = Array.isArray(d) ? d : String(d || '').split(/[\s,·/]+/);
  const out = [];
  arr.forEach((x) => String(x).trim().split('').forEach((ch) => { if (DOW.includes(ch) && !out.includes(ch)) out.push(ch); }));
  return out;
}
// from(YYYY-MM-DD) 다음 날부터 가장 가까운 수업일. 요일 정보가 없으면 이틀 뒤
export function nextClassDate(days, from) {
  const base = parseYmd(from || ymd(new Date()));
  if (days && days.length) for (let i = 1; i <= 8; i++) { const d = new Date(base); d.setDate(d.getDate() + i); if (days.includes(DOW[d.getDay()])) return ymd(d); }
  const d = new Date(base); d.setDate(d.getDate() + 2); return ymd(d);
}
// 기한 표시: { text:'11/16(월)까지', late:true|false, dday:'D-2' }
export function dueInfo(due, done) {
  if (!due) return null;
  const today = ymd(new Date());
  const diff = Math.round((parseYmd(due) - parseYmd(today)) / 86400000);
  return { text: `${mdw(due)}까지`, late: !done && diff < 0, dday: diff === 0 ? '오늘까지' : diff > 0 ? `D-${diff}` : `${-diff}일 지남` };
}

// ── 답 비교 ──
export const isChoiceAnswer = (a) => /^\s*[①②③④⑤](\s*,\s*[①②③④⑤])*\s*$/.test(String(a || ''));
// 시험지의 문항별 종류: 'o' 객관식(①~⑤) / 's' 주관식
export function kindsOf(test) {
  const ans = test.answers || [];
  if (Array.isArray(test.kinds) && test.kinds.length === ans.length) return test.kinds;
  return ans.map((a) => (isChoiceAnswer(a) ? 'o' : 's'));
}
function texToPlain(s) {
  s = String(s ?? '').replace(/\$/g, '');
  s = s.replace(/\\left|\\right|\\displaystyle|\\,|\\;|\\!|\\quad|\\qquad/g, '');
  s = s.replace(/\\(text|mathrm|mathbf|textbf)\{([^{}]*)\}/g, '$2');
  for (let i = 0; i < 6; i++) {
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)').replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/_\{([^{}]*)\}/g, '_($1)');
  }
  const map = { times: '×', div: '÷', pm: '±', mp: '∓', pi: 'π', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', cdot: '×', circ: '°', square: '□', triangle: '△', angle: '∠', therefore: '', '%': '%' };
  s = s.replace(/\\([a-zA-Z]+|%)/g, (m, k) => (k in map ? map[k] : ''));
  return s.replace(/[{}]/g, '');
}
export function canon(s) {
  return texToPlain(s).toLowerCase().replace(/\s+/g, '').replace(/[()[\]]/g, '').replace(/[−–—]/g, '-').replace(/\*/g, '×')
    .replace(/<=|≦/g, '≤').replace(/>=|≧/g, '≥').replace(/!=/g, '≠').replace(/루트/g, '√').replace(/파이/g, 'π')
    .replace(/(^|[,=])\+/g, '$1').replace(/[.。]$/, '');
}
const parts = (c) => c.split(',').filter(Boolean).sort().join(',');
export function sameAnswer(correct, given) {
  const a = canon(correct), b = canon(given);
  if (!b) return false;
  if (a === b || parts(a) === parts(b)) return true;
  // 단위·말(「276명」 ↔ 「276」, 「x=3」 ↔ 「3」)만 다른 경우
  const strip = (t) => t.replace(/[가-힣]/g, '').replace(/^[a-z]=/, '');
  const a2 = strip(a), b2 = strip(b);
  return !!a2 && !!b2 && /\d/.test(a2) && (a2 === b2 || parts(a2) === parts(b2));
}
const choiceSet = (t) => { const s = new Set(); String(t || '').split('').forEach((ch) => { const i = CIRC.indexOf(ch); if (i >= 0) s.add(i + 1); else if (/[1-5]/.test(ch)) s.add(+ch); }); return [...s].sort().join(''); };
// 학생 답(given[]) 채점 → wrong: 틀림(확인 필요 포함), review: 주관식이라 선생님이 한 번 봐야 하는 번호
export function gradeAnswers(test, given) {
  const ans = test.answers || [], kinds = kindsOf(test), wrong = [], review = [];
  ans.forEach((a, i) => {
    const g = String((given || [])[i] ?? '').trim(), n = i + 1;
    if (!g) { wrong.push(n); return; }
    if (kinds[i] === 'o') { if (choiceSet(a) !== choiceSet(g)) wrong.push(n); return; }
    if (!sameAnswer(a, g)) { wrong.push(n); review.push(n); }
  });
  return { wrong, review };
}

// ── 제출된 답안 자동 채점 ──
// who: { teacherUid } 선생님(본인 출제분) / { admin:true } 관리자·원장(전체)
// 돌려주는 값: 이번에 새로 채점한 건수
export async function syncSubmitted(db, who) {
  let snap;
  try {
    snap = await getDocs(who.admin ? query(collection(db, 'sheetTasks'), where('submitted', '==', true))
      : query(collection(db, 'sheetTasks'), where('teacherUid', '==', who.teacherUid)));
  } catch (e) { console.warn('[시험지 연동] 목록', e.message); return 0; }
  const todo = []; snap.forEach((d) => { const x = d.data(); if (x.submitted && !x.synced) todo.push({ id: d.id, ...x }); });
  if (!todo.length) return 0;
  const tests = {}; let n = 0;
  for (const t of todo) {
    try {
      if (!(t.testId in tests)) { const s = await getDoc(doc(db, 'dailyTests', t.testId)); tests[t.testId] = s.exists() ? s.data() : null; }
      const test = tests[t.testId]; if (!test) continue;
      const rs = await getDoc(doc(db, 'dailyTestResults', t.id));
      const old = rs.exists() ? rs.data() : {};
      const total = (test.answers || []).length || t.count || 0;
      const patch = { submitted: true, submittedAt: t.submittedAt || null, studentAnswers: t.answers || [], updatedAt: serverTimestamp() };
      if (!(old.graded && !old.autoGraded)) {   // 선생님이 이미 손으로 채점한 건 그대로 둠
        const g = gradeAnswers(test, t.answers || []);
        const score = total - g.wrong.length;
        Object.assign(patch, { wrong: g.wrong, needReview: g.review, autoGraded: true, graded: true, absent: false, total, score, percentage: total ? Math.round(score / total * 100) : null });
      }
      const b = writeBatch(db);
      b.set(doc(db, 'dailyTestResults', t.id), patch, { merge: true });
      b.update(doc(db, 'sheetTasks', t.id), { synced: true });
      await b.commit(); n++;
    } catch (e) { console.warn('[시험지 연동] 채점', t.id, e.message); }
  }
  return n;
}

// ── 화면 표시용 상태 ──
// 제출: { key:'done'|'late'|'wait', label }
export function submitState(task) {
  if (task.submitted) return { key: 'done', label: '제출 완료' };
  const di = dueInfo(task.dueDate, false);
  return di && di.late ? { key: 'late', label: '미제출 · 기한 지남' } : { key: 'wait', label: '미제출' };
}
// 오답 시험지: none(대상 아님) / review(채점 확인 필요) / todo(아직 안 만듦) / made(만들어짐) / sent(학생에게 출제함)
export function wrongSheetState(res) {
  if (!res || !res.graded || res.absent) return { key: 'none', label: '–' };
  if (!(res.wrong || []).length) return { key: 'perfect', label: '오답 없음' };
  if (res.wrongSheetTestId) return { key: 'sent', label: '오답 시험지 출제함' };
  if ((res.needReview || []).length) return { key: 'review', label: '채점 확인 필요' };
  if (res.wrongSheetId) return { key: 'made', label: '오답 시험지 생성됨' };
  return { key: 'todo', label: '오답 시험지 미생성' };
}
export const HCS_URL = 'https://www.fanmath.co.kr/hcs/';
