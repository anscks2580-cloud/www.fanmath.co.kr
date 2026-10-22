// ══ 월말 학습 보고서 집계 (학원 자체 기준) ══
// 입력: 한 달치 dailyTests(시험지, items=[{n,type,natRate}]) + dailyTestResults(학생별 wrong[])
// 출력: 학생 한 명의 보고서 데이터(studentReports 문서 형태). 화면(report.html)과 생성기(admin)가 같이 씀.
// 판단 기준은 전부 CRITERIA 한 곳에 — 관리자 설정으로 옮길 때 이 값만 바꾸면 됨.

export const CRITERIA = {
  // 정답률 → 등급
  gradeBands: [[90, 1], [80, 2], [70, 3], [50, 4], [0, 5]],
  // 전국 정답률 → 난이도 1(하)~5(최상). 전국 정답률 없으면 기본 3
  diffBands: [[90, 1], [80, 2], [70, 3], [60, 4], [0, 5]],
  diffDefault: 3,
  diffLabel: { 1: '하', 2: '중하', 3: '중', 4: '상', 5: '최상' },
  // 유형 판정: 그 유형을 minItems문항 이상 풀었을 때만
  strongPct: 90, weakPct: 70, minItems: 2,
  topN: 3,
};

export const gradeOf = (pct) => (CRITERIA.gradeBands.find(([min]) => pct >= min) || [0, 5])[1];
export const diffOf = (natRate) => natRate == null ? CRITERIA.diffDefault : (CRITERIA.diffBands.find(([min]) => natRate >= min) || [0, 5])[1];
const pctOf = (c, t) => t ? Math.round(c / t * 100) : null;

// ── 유형명 → 단원명 (키워드 우선순위 순서대로 첫 일치). 없으면 시험지 범위(range) 또는 '기타' ──
export const UNIT_RULES = [
  // 중3-2 원
  ['접선과 현이 이루는 각', '원주각의 활용'],
  ['원주각', '원주각'], ['원에 내접하는', '원주각'], ['내접하기 위한', '원주각'],
  ['현의 수직이등분선', '원과 직선'], ['현의 길이', '원과 직선'], ['접선', '원과 직선'], ['내접원', '원과 직선'], ['외접하는 사각형', '원과 직선'],
  // 중3-2 삼각비
  ['삼각비', '삼각비'], ['삼각형의 높이', '삼각비의 활용'], ['삼각형의 넓이', '삼각비의 활용'], ['사각형의 넓이', '삼각비의 활용'],
  // 중3-2 통계
  ['대푯값', '대푯값과 산포도'], ['산포도', '대푯값과 산포도'], ['평균', '대푯값과 산포도'], ['분산', '대푯값과 산포도'], ['표준편차', '대푯값과 산포도'],
  ['산점도', '상관관계'], ['상관관계', '상관관계'],
  // 중3-1
  ['제곱근', '제곱근과 실수'], ['무리수', '제곱근과 실수'], ['근호', '근호를 포함한 식의 계산'],
  ['곱셈 공식', '다항식의 곱셈'], ['인수분해', '인수분해'], ['이차방정식', '이차방정식'], ['이차함수', '이차함수'],
  // 중2
  ['유리수와 순환소수', '유리수와 순환소수'], ['순환소수', '유리수와 순환소수'], ['지수법칙', '식의 계산'], ['단항식', '식의 계산'], ['다항식', '식의 계산'],
  ['일차부등식', '일차부등식'], ['연립', '연립방정식'], ['일차함수', '일차함수'],
  ['이등변삼각형', '삼각형의 성질'], ['직각삼각형의 합동', '삼각형의 성질'], ['외심', '삼각형의 성질'], ['내심', '삼각형의 성질'],
  ['평행사변형', '사각형의 성질'], ['직사각형', '사각형의 성질'], ['마름모', '사각형의 성질'], ['등변사다리꼴', '사각형의 성질'],
  ['닮음', '도형의 닮음'], ['피타고라스', '피타고라스 정리'], ['경우의 수', '경우의 수'], ['확률', '확률'],
  // 중1
  ['소인수분해', '소인수분해'], ['최대공약수', '최대공약수와 최소공배수'], ['최소공배수', '최대공약수와 최소공배수'],
  ['정수와 유리수', '정수와 유리수'], ['문자의 사용', '문자와 식'], ['일차식', '문자와 식'], ['일차방정식', '일차방정식'],
  ['좌표평면', '좌표평면과 그래프'], ['정비례', '정비례와 반비례'], ['반비례', '정비례와 반비례'],
  ['작도', '기본 도형'], ['위치 관계', '기본 도형'], ['평행선', '기본 도형'], ['다각형', '평면도형'], ['부채꼴', '평면도형'],
  ['다면체', '입체도형'], ['회전체', '입체도형'], ['겉넓이', '입체도형'], ['부피', '입체도형'],
  ['줄기와 잎', '자료의 정리와 해석'], ['도수분포', '자료의 정리와 해석'], ['히스토그램', '자료의 정리와 해석'], ['상대도수', '자료의 정리와 해석'],
];
export function unitOf(type, fallback) {
  const t = String(type || '');
  for (const [kw, unit] of UNIT_RULES) if (t.includes(kw)) return unit;
  return fallback || '기타';
}

// 날짜 → 그 달의 몇째 주 (월요일 시작)
function weekIndex(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // 월=0
  return Math.floor((d.getDate() - 1 + offset) / 7) + 1;
}

// ── 핵심: 학생 한 명 집계 ──
// tests: [{id,date,title,range,grade,classGroup,questionCount,items}], results: 그 학생의 [{testId,wrong,absent,total}]
export function buildStudentReport({ student, month, tests, results, classResults }) {
  const testById = Object.fromEntries(tests.map((t) => [t.id, t]));
  const mine = results.filter((r) => !r.absent && testById[r.testId]);
  const acc = { total: 0, correct: 0, diffSum: 0 };
  const weeks = {}, units = {}, types = {}, diffs = {};
  const bump = (bag, key, ok, extra) => { const b = bag[key] || (bag[key] = { total: 0, correct: 0, ...extra }); b.total++; if (ok) b.correct++; };
  const testRows = [];

  mine.forEach((r) => {
    const t = testById[r.testId];
    const N = t.questionCount || r.total || 0;
    const wrong = new Set(r.wrong || []);
    const itemMap = Object.fromEntries((t.items || []).map((it) => [it.n, it]));
    let tc = 0;
    for (let n = 1; n <= N; n++) {
      const ok = !wrong.has(n); if (ok) tc++;
      const it = itemMap[n];
      const type = it?.type || '';
      const natRate = it?.natRate ?? null;
      const diff = diffOf(natRate);
      const unit = type ? unitOf(type, t.range) : (t.range || '기타');
      acc.total++; if (ok) acc.correct++; acc.diffSum += diff;
      bump(weeks, weekIndex(t.date), ok, { week: weekIndex(t.date) });
      bump(units, unit, ok, { name: unit });
      if (type) bump(types, type, ok, { name: type, unit, natRate, diff });
      bump(diffs, diff, ok, { diff });
    }
    testRows.push({ testId: t.id, date: t.date, title: t.title || '', range: t.range || '', total: N, correct: tc, pct: pctOf(tc, N) });
  });

  const fin = (bag, sortFn) => Object.values(bag).map((b) => ({ ...b, pct: pctOf(b.correct, b.total) })).sort(sortFn);
  const typeList = fin(types, (a, b) => b.total - a.total);
  const eligible = typeList.filter((x) => x.total >= CRITERIA.minItems);
  const strong = eligible.filter((x) => x.pct >= CRITERIA.strongPct).sort((a, b) => b.pct - a.pct || b.total - a.total).slice(0, CRITERIA.topN);
  const weak = eligible.filter((x) => x.pct < CRITERIA.weakPct).sort((a, b) => a.pct - b.pct || b.total - a.total).slice(0, CRITERIA.topN);
  const pct = pctOf(acc.correct, acc.total);

  // 반 평균 (같은 반 학생들의 전체 정답률 평균)
  let classAvg = null;
  if (classResults && classResults.length) {
    const per = {};
    classResults.filter((r) => !r.absent && testById[r.testId]).forEach((r) => {
      const N = testById[r.testId].questionCount || r.total || 0;
      const p = per[r.studentId] || (per[r.studentId] = { t: 0, c: 0 });
      p.t += N; p.c += N - (r.wrong || []).length;
    });
    const vals = Object.values(per).filter((p) => p.t).map((p) => p.c / p.t * 100);
    if (vals.length) classAvg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  return {
    studentId: student.id, studentName: student.name || '', grade: student.grade || '', classGroup: student.classGroup || '',
    month,
    summary: {
      tests: mine.length, total: acc.total, correct: acc.correct, pct,
      gradeBand: pct == null ? null : gradeOf(pct),
      avgDiff: acc.total ? Math.round(acc.diffSum / acc.total * 10) / 10 : null,
      classAvgPct: classAvg,
      absent: results.filter((r) => r.absent).length,
    },
    tests: testRows.sort((a, b) => a.date.localeCompare(b.date)),
    weekly: fin(weeks, (a, b) => a.week - b.week),
    units: fin(units, (a, b) => b.total - a.total),
    types: typeList,
    diffs: fin(diffs, (a, b) => a.diff - b.diff),
    strong, weak,
    comment: '',
    // Firestore는 배열 안의 배열을 못 넣으므로 문자열로 보관
    criteria: { gradeBands: CRITERIA.gradeBands.map((b) => b.join(':')).join(','), diffBands: CRITERIA.diffBands.map((b) => b.join(':')).join(',') },
  };
}

// ── 선생님 의견 초안 (규칙 기반). 선생님이 검수하며 고침 ──
export function draftComment(rep) {
  const s = rep.summary, name = rep.studentName.replace(/^[가-힣]/, '') || rep.studentName; // 성 빼고 이름
  if (!s.total) return `${rep.studentName} 학생은 이번 달 채점된 일일테스트가 없어 집계되지 않았습니다.`;
  const parts = [];
  parts.push(`${name}(이)는 이번 달 일일테스트 ${s.tests}회, 총 ${s.total}문항을 풀어 정답률 ${s.pct}%(${s.gradeBand}등급)를 기록했습니다.`);
  if (s.classAvgPct != null) {
    const d = s.pct - s.classAvgPct;
    parts.push(d >= 5 ? `반 평균(${s.classAvgPct}%)보다 높은 정답률로 안정적인 흐름을 보였습니다.` : d <= -5 ? `반 평균(${s.classAvgPct}%)에는 다소 못 미쳐 보완이 필요합니다.` : `반 평균(${s.classAvgPct}%)과 비슷한 수준을 유지했습니다.`);
  }
  const w = rep.weekly.filter((x) => x.pct != null);
  if (w.length >= 2) {
    const d = w[w.length - 1].pct - w[0].pct;
    if (d >= 8) parts.push(`월초보다 월말 정답률이 ${d}%p 올라 성장 흐름이 분명합니다.`);
    else if (d <= -8) parts.push(`월말로 갈수록 정답률이 ${-d}%p 내려가 집중도 점검이 필요합니다.`);
  }
  if (rep.strong.length) parts.push(`'${rep.strong.map((x) => x.name).join("', '")}' 유형은 안정적으로 해결했습니다.`);
  if (rep.weak.length) parts.push(`반면 '${rep.weak.map((x) => x.name).join("', '")}' 유형은 정답률이 낮아 다음 달 클리닉에서 집중 보완하겠습니다.`);
  else parts.push(`특별히 취약한 유형 없이 고르게 해결하고 있어 다음 달에는 난이도를 한 단계 높여 가겠습니다.`);
  return parts.join(' ');
}
