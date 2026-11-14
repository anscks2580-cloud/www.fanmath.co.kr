'use strict';
/* ═══════════════════════════════════════════════════════════
   HCS 시험지 · 오답 시험지 현황 (관리부) — 「숙제 입력」 메뉴 아래쪽 카드
   - HCS에서 선생님이 출제한 시험지(sheetTasks)와 채점 결과(dailyTestResults)를 선생님별로 모아 봄
   - 요일을 고르면 그 요일에 수업이 있는 학생(학생 정보의 등원 요일)만 뜸 — 기본은 오늘 요일
   - 평촌관·산본관은 따로 봄 (학생의 소속 관 기준)
   - 관리부가 확인할 것: 답안을 냈는지, 오답 시험지가 학생에게 나갔는지(출제됐는지)
   - 이 화면을 열 때도 제출된 답안이 자동 채점됨 (sheet-core.js syncSubmitted)
   ═══════════════════════════════════════════════════════════ */
const SHS_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const shsEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let shsSC = null, shsDay = '', shsBranch = '', shsOnlyOpen = false, shsTasks = [], shsRes = {}, shsBusy = false;
const SHS_PILL = { done: 'background:rgba(46,158,91,0.12);color:#2E9E5B;', late: 'background:rgba(214,69,69,0.12);color:#D64545;', wait: 'background:rgba(30,24,56,0.06);color:var(--muted);',
  sent: 'background:rgba(46,158,91,0.12);color:#2E9E5B;', made: 'background:rgba(47,127,214,0.12);color:#2F7FD6;', todo: 'background:rgba(214,69,69,0.12);color:#D64545;',
  review: 'background:rgba(245,197,24,0.25);color:#8a6a00;', perfect: 'background:rgba(30,24,56,0.06);color:var(--muted);' };
const shsPill = (k, label) => `<span style="display:inline-block;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:99px;white-space:nowrap;${SHS_PILL[k] || 'color:var(--muted);'}">${shsEsc(label)}</span>`;
const shsYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

window.shsInit = async function () {
  const box = document.getElementById('shsBody'); if (!box || shsBusy) return;
  shsBusy = true;
  try {
    if (!shsSC) shsSC = await import('/sheet-core.js?v=1794640000');
    if (!studentsCache.length) await loadStudents();
    if (!shsDay) shsDay = SHS_DOW[new Date().getDay()];
    if (!shsBranch) { try { shsBranch = localStorage.getItem('swc_hl_branch') || ''; } catch (e) {} if (shsBranch !== '평촌관' && shsBranch !== '산본관') shsBranch = '평촌관'; }
    try { await shsSC.syncSubmitted(db, { admin: true }); } catch (e) { console.warn('[시험지 자동 채점]', e.message); }
    const lim = new Date(); lim.setDate(lim.getDate() - 28); const from = shsYmd(lim);
    const [ts, rs] = await Promise.all([
      getDocs(query(collection(db, 'sheetTasks'), where('date', '>=', from))),
      getDocs(query(collection(db, 'dailyTestResults'), where('date', '>=', from))),
    ]);
    shsTasks = []; ts.forEach((d) => shsTasks.push({ id: d.id, ...d.data() }));
    shsRes = {}; rs.forEach((d) => { const x = d.data(); if (x.source === 'worksheet') shsRes[d.id] = x; });
    shsRender();
  } catch (e) { box.innerHTML = `<div style="color:#D64545;padding:14px;">오류: ${shsEsc(e.message)}</div>`; }
  finally { shsBusy = false; }
};
window.shsPickDay = function (d) { shsDay = d; shsRender(); };
window.shsPickBranch = function (b) { shsBranch = b; shsRender(); };
window.shsToggleOpen = function (v) { shsOnlyOpen = !!v; shsRender(); };

function shsRender() {
  const SC = shsSC, todayDow = SHS_DOW[new Date().getDay()];
  const brSel = document.getElementById('shsBranch'); if (brSel) brSel.value = shsBranch;
  document.getElementById('shsDays').innerHTML = ['월', '화', '수', '목', '금', '토', '일', '전체'].map((d) =>
    `<button type="button" class="btn btn-sm ${shsDay === d ? 'btn-primary' : 'btn-secondary'}" onclick="shsPickDay('${d}')">${d === todayDow ? '● ' : ''}${d}${d === '전체' ? '' : '요일'}</button>`).join('');
  const stus = studentsCache.filter((s) => s.status !== '퇴원' && s.branch === shsBranch && (shsDay === '전체' || SC.daysOf(s).includes(shsDay)));
  const stuMap = Object.fromEntries(stus.map((s) => [s.id, s]));
  const rows = shsTasks.filter((t) => stuMap[t.studentId]);
  // 오답 시험지가 아직 안 나간 것: 채점은 됐고 오답이 있는데 학생에게 출제되지 않음 (원래 시험지 기준 — 오답 시험지 자체는 제외)
  const notSent = (t) => { const k = SC.wrongSheetState(shsRes[t.id]).key; return !t.retakeOf && (k === 'todo' || k === 'made' || k === 'review'); };
  const byTeacher = {};
  rows.forEach((t) => { const o = byTeacher[t.teacherUid] = byTeacher[t.teacherUid] || { name: t.teacherName || (teachersCache.find((x) => x.id === t.teacherUid) || {}).name || '(선생님)', list: [] }; o.list.push(t); });
  const teachers = Object.values(byTeacher).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const tot = { all: rows.length, sub: rows.filter((t) => t.submitted).length, notSent: rows.filter(notSent).length, sent: rows.filter((t) => SC.wrongSheetState(shsRes[t.id]).key === 'sent').length };
  document.getElementById('shsSummary').innerHTML =
    `<b>${shsEsc(shsBranch)}</b> · ${shsDay === '전체' ? '전체 학생' : shsDay + '요일 수업 학생'} ${stus.length}명 · 최근 4주 시험지 <b>${tot.all}</b>건 · 답안 제출 <b style="color:#2E9E5B;">${tot.sub}</b>/${tot.all} · 오답 시험지 <b style="color:#2E9E5B;">나감 ${tot.sent}</b> · <b style="color:${tot.notSent ? '#D64545' : 'var(--muted)'};">안 나감 ${tot.notSent}</b>`;
  const box = document.getElementById('shsBody');
  if (!teachers.length) { box.innerHTML = `<div style="color:var(--muted);padding:18px;text-align:center;">${shsEsc(shsBranch)} ${shsDay === '전체' ? '' : shsDay + '요일 수업 학생에게 '}최근 4주 동안 HCS에서 출제된 시험지가 없습니다.</div>`; return; }
  const th = 'padding:7px 8px;text-align:left;font-size:11.5px;color:var(--muted);font-weight:600;border-bottom:1px solid rgba(30,24,56,0.1);white-space:nowrap;';
  const td = 'padding:8px;border-bottom:1px solid rgba(30,24,56,0.06);font-size:12.5px;vertical-align:top;';
  box.innerHTML = teachers.map((t) => {
    const list = t.list.filter((x) => !shsOnlyOpen || notSent(x) || !x.submitted)
      .sort((a, b) => String(a.classGroup || '').localeCompare(String(b.classGroup || ''), 'ko') || (a.studentName || '').localeCompare(b.studentName || '', 'ko') || (b.date || '').localeCompare(a.date || ''));
    const ns = t.list.filter(notSent).length, un = t.list.filter((x) => !x.submitted).length;
    const head = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 4px;"><b style="color:var(--purple,#5B3FA6);font-size:14px;">${shsEsc(t.name)}T</b>
      <span style="font-size:12px;color:var(--muted);">${t.list.length}건</span>
      ${ns ? shsPill('todo', `오답 시험지 안 나감 ${ns}`) : shsPill('sent', '오답 시험지 모두 처리')}${un ? shsPill('wait', `답안 미제출 ${un}`) : ''}</div>`;
    if (!list.length) return head + '<div style="font-size:12px;color:var(--muted);padding:4px 0 8px;">확인할 것이 없습니다.</div>';
    return head + `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:760px;"><tr><th style="${th}">반</th><th style="${th}">학생</th><th style="${th}">시험지</th><th style="${th}">기한</th><th style="${th}">답안 제출</th><th style="${th}">점수 · 틀린 문제</th><th style="${th}">오답 시험지</th></tr>` +
      list.map((x) => {
        const r = shsRes[x.id] || {}, ss = SC.submitState(x), ws = SC.wrongSheetState(r), di = SC.dueInfo(x.dueDate, x.submitted);
        const score = r.absent ? '결석' : r.graded ? `<b>${r.score}/${r.total}</b>${(r.wrong || []).length ? ` <span style="color:#D64545;">· ${(r.wrong || []).join(', ')}번</span>` : ''}` : '<span style="color:var(--muted);">–</span>';
        let wsText = ws.key === 'none' ? '<span style="color:var(--muted);">–</span>' : shsPill(ws.key, ws.label);
        if (x.retakeOf) wsText = '<span style="font-size:11.5px;color:#2F7FD6;">(오답 시험지)</span>';
        else if (ws.key === 'sent' && r.wrongSheetSentAt) wsText += `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${shsEsc(SC.mdw(String(r.wrongSheetSentAt).slice(0, 10)))} 출제</div>`;
        return `<tr><td style="${td}white-space:nowrap;">${shsEsc(x.classGroup || '')}</td><td style="${td}font-weight:700;white-space:nowrap;">${shsEsc(x.studentName)}</td>
          <td style="${td}"><b>${shsEsc(x.title)}</b><div style="font-size:11.5px;color:var(--muted);">${SC.mdw(x.date)} 출제 · ${x.count}문제${x.logId ? ' · 숙제 연결' : ''}</div></td>
          <td style="${td}white-space:nowrap;${di && di.late ? 'color:#D64545;font-weight:700;' : ''}">${di ? di.text : '–'}</td>
          <td style="${td}">${shsPill(ss.key, ss.label)}</td><td style="${td}">${score}</td><td style="${td}">${wsText}</td></tr>`;
      }).join('') + '</table></div>';
  }).join('');
}
