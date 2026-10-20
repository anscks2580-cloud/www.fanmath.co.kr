'use strict';
/* ═══════════════════════════════════════════════════════════
   오늘 (홈 대시보드)
   - 일정: scheduleEvents (오늘 · 이번 주)
   - 상담: consultForms (오늘 접수 · 진행 중)
   - 선생님 제출 현황: weeklyReports(지난주, 중등 담당만) · progressReports(지난주)
                      · monthlyReports(전월, 매달 3일 마감) · satClinicReports(직전 토요일)
   - 바로가기: 최근 사용 메뉴
   ═══════════════════════════════════════════════════════════ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const TYPE_COLOR = { '휴무': '#ff7a7a', '회의': '#7ab8ff', '설명회': '#c58bff', '시험기간': '#ffb35c', '행사': '#5fd98a', '할 일': '#f0c040', '기타': '#b9b2cf' };

  let loadedAt = 0;
  let loading = false;

  // 주간성취도 대상 학생: 중등부(초·중)만 (teacher.html과 같은 기준)
  function isWeeklyTarget(s) {
    const g = String(s?.grade || '').trim();
    return !(g.startsWith('고') || /N수|재수|졸업/.test(g));
  }
  function targetMonday(d, offsetWeeks) {
    const day = d.getDay();
    const m = new Date(d); m.setHours(0, 0, 0, 0);
    m.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    m.setDate(m.getDate() - 7 * offsetWeeks);
    return m;
  }
  function weekKey(d, offsetWeeks) {
    const monday = targetMonday(d, offsetWeeks);
    const y = monday.getFullYear();
    const start = new Date(y, 0, 1);
    const w = Math.ceil(((monday - start) / 86400000 + start.getDay() + 1) / 7);
    return `${y}-W${String(w).padStart(2, '0')}`;
  }
  function weekRange(d, offsetWeeks) {
    const m = targetMonday(d, offsetWeeks), s = new Date(m); s.setDate(m.getDate() + 6);
    return `${m.getMonth() + 1}/${m.getDate()}~${s.getMonth() + 1}/${s.getDate()}`;
  }

  function renderHeader() {
    const now = new Date();
    const dateEl = $('hmDate'); if (dateEl) dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일`;
    const a = window.currentAdmin || {};
    const h = now.getHours();
    const hello = h < 11 ? '좋은 아침이에요' : h < 17 ? '안녕하세요' : '수고 많으셨어요';
    const g = $('hmGreeting'); if (g) g.innerHTML = esc(hello) + (a.name ? ', ' + esc(a.name) + '님' : '') + '<small>송우찬수학학원 관리자</small>';
    const quick = $('hmQuick');
    if (quick) {
      const recent = typeof window.adminRecentMenus === 'function' ? window.adminRecentMenus() : [];
      quick.innerHTML = recent.length
        ? '<span class="lb">최근 사용</span>' + recent.map((r) => `<button type="button" class="hm-chip" data-open="${esc(r.id)}">${esc(r.label)}</button>`).join('')
        : '<span class="lb">왼쪽 메뉴에서 작업을 고르세요. 자주 쓰는 메뉴가 여기에 쌓입니다.</span>';
    }
  }

  // ── 일정 ──
  async function loadSchedule() {
    const el = $('hmSchedule'); if (!el || el.closest('[hidden]')) return;
    try {
      const snap = await getDocs(collection(db, 'scheduleEvents'));
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const today = ymd(now);
      const until = new Date(now); until.setDate(now.getDate() + 7);
      const untilStr = ymd(until);
      const rows = [];
      snap.forEach((d) => {
        const e = d.data(); const s = e.start || '', en = e.end || s;
        if (!s) return;
        if (en < today || s > untilStr) return;
        rows.push(e);
      });
      rows.sort((a, b) => (a.start || '').localeCompare(b.start || '') || (a.time || '').localeCompare(b.time || ''));
      if (!rows.length) { el.innerHTML = '<div class="hm-empty">이번 주 등록된 일정이 없습니다.</div>'; return; }
      el.innerHTML = '<div class="hm-list">' + rows.slice(0, 8).map((e) => {
        const isToday = (e.start || '') <= today && (e.end || e.start || '') >= today;
        const color = TYPE_COLOR[e.type] || TYPE_COLOR['기타'];
        const [y, m, d] = (e.start || '').split('-').map(Number); const sd = new Date(y, m - 1, d);
        const when = isToday ? '오늘' : md(sd);
        const span = e.end && e.end !== e.start ? ` ~ ${e.end.slice(5).replace('-', '/')}` : '';
        const who = e.target === 'teachers' && Array.isArray(e.teacherNames) && e.teacherNames.length ? ' · ' + e.teacherNames.join(', ') : e.target === 'branch' && e.branch ? ' · ' + e.branch : '';
        return `<div class="hm-row${isToday ? ' today' : ''}"><span class="dot" style="background:${color}"></span><span class="t"><b>${esc(e.title || '(제목 없음)')}</b><small>${esc(e.type || '기타')}${esc(who)}${e.memo ? ' · ' + esc(e.memo) : ''}</small></span><span class="r">${esc(when)}${esc(span)}${e.time ? ' ' + esc(e.time) : ''}</span></div>`;
      }).join('') + '</div>' + (rows.length > 8 ? `<div class="hm-foot">외 ${rows.length - 8}건 — 학원 일정에서 확인</div>` : '');
    } catch (e) {
      el.innerHTML = `<div class="hm-empty">일정을 불러오지 못했습니다 (${esc(e.message)})</div>`;
    }
  }

  // ── 상담 ──
  async function loadConsult() {
    const el = $('hmConsult'); if (!el || el.closest('[hidden]')) return;
    try {
      const snap = await getDocs(query(collection(db, 'consultForms'), orderBy('createdAt', 'desc')));
      const now = new Date(); const today = ymd(now);
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      let todayN = 0, weekN = 0, openN = 0; const recent = [];
      snap.forEach((d) => {
        const x = d.data();
        const created = x.createdAt?.toDate ? x.createdAt.toDate() : null;
        const done = x.stage === 'consultation_completed';
        if (created && ymd(created) === today) todayN++;
        if (created && created >= weekAgo) weekN++;
        if (!done) openN++;
        if (recent.length < 4) recent.push({ name: x.studentName || '(이름 없음)', grade: x.grade || x.studentGrade || '', created, done, stage: x.stage || '' });
      });
      el.innerHTML = `
        <div class="hm-stat">
          <div class="box" data-open="consult"><span class="n">${todayN}</span><span class="k">오늘 접수</span></div>
          <div class="box" data-open="consult"><span class="n">${weekN}</span><span class="k">최근 7일</span></div>
          <div class="box${openN ? ' warn' : ''}" data-open="consult"><span class="n">${openN}</span><span class="k">상담 진행 전</span></div>
        </div>
        ${recent.length ? '<div class="hm-list">' + recent.map((r) => `<div class="hm-row"><span class="dot" style="background:${r.done ? '#5fd98a' : '#f0c040'}"></span><span class="t"><b>${esc(r.name)}${r.grade ? ' <small style="display:inline">' + esc(r.grade) + '</small>' : ''}</b><small>${r.done ? '상담 완료' : '상담 전'}</small></span><span class="r">${r.created ? esc(md(r.created)) : ''}</span></div>`).join('') + '</div>' : '<div class="hm-empty">접수된 상담이 없습니다.</div>'}`;
    } catch (e) {
      el.innerHTML = `<div class="hm-empty">상담 현황을 불러오지 못했습니다 (${esc(e.message)})</div>`;
    }
  }

  // ── 선생님 제출 현황 ──
  async function loadSubmissions() {
    const el = $('hmSubmit'); if (!el || el.closest('[hidden]')) return;
    try {
      let teachers = (typeof teachersCache !== 'undefined' && Array.isArray(teachersCache) && teachersCache.length) ? teachersCache : null;
      if (!teachers) { const ts = await getDocs(collection(db, 'teachers')); teachers = []; ts.forEach((d) => teachers.push({ id: d.id, ...d.data() })); }
      let students = (typeof studentsCache !== 'undefined' && Array.isArray(studentsCache) && studentsCache.length) ? studentsCache : null;
      if (!students) { const ss = await getDocs(collection(db, 'students')); students = []; ss.forEach((d) => students.push({ id: d.id, ...d.data() })); }
      const byTeacher = {};
      students.forEach((s) => { if (!s.teacherUid) return; (byTeacher[s.teacherUid] = byTeacher[s.teacherUid] || []).push(s); });
      const active = teachers.filter((t) => t.role !== 'ta' && (byTeacher[t.id] || []).length);
      if (!active.length) { el.innerHTML = '<div class="hm-empty">담당 학생이 배정된 선생님이 없습니다.</div>'; return; }

      const now = new Date(); now.setHours(0, 0, 0, 0);
      const dow = now.getDay(), d = now.getDate();
      const lastKey = weekKey(now, 1), lastRange = weekRange(now, 1);
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
      const sat = new Date(now); sat.setDate(now.getDate() - ((dow + 1) % 7)); const satStr = ymd(sat);
      const monday = targetMonday(now, 0); const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
      const weeklyDue = now > friday ? '마감 지남' : ymd(now) === ymd(friday) ? '오늘 마감' : `${md(friday)}까지`;
      const monthlyDue = d > 3 ? '마감 지남' : d === 3 ? '오늘 마감' : `${now.getMonth() + 1}/3까지`;

      const [wk, pg, mo, sc] = await Promise.all([
        getDocs(query(collection(db, 'weeklyReports'), where('weekKey', '==', lastKey))),
        getDocs(query(collection(db, 'progressReports'), where('weekKey', '==', lastKey))),
        getDocs(query(collection(db, 'monthlyReports'), where('month', '==', prevKey))),
        getDocs(query(collection(db, 'satClinicReports'), where('date', '==', satStr))),
      ]);
      const wkDone = {}; wk.forEach((x) => { const r = x.data(); (wkDone[r.teacherUid] = wkDone[r.teacherUid] || new Set()).add(r.studentId); });
      const pgDone = new Set(); pg.forEach((x) => pgDone.add(x.data().teacherUid));
      const moDone = new Set(); mo.forEach((x) => moDone.add(x.data().teacherUid));
      const scDone = new Set(); sc.forEach((x) => scDone.add(x.data().teacherUid));

      const box = (title, due, done, total, missing, openId, extra) => {
        const pct = total ? Math.round(done / total * 100) : 100;
        const ok = done >= total;
        return `<div class="hm-sub-box"><div class="hd"><span>${esc(title)}</span><span class="st ${ok ? 'ok' : 'bad'}">${ok ? '전원 제출' : `${total - done}명 미제출 · ${esc(due)}`}</span></div>
          <div class="bar"><i class="${ok ? 'full' : ''}" style="width:${pct}%"></i></div>
          <div class="names">${extra ? esc(extra) + ' · ' : ''}${done}/${total} 제출${missing.length ? ' · 미제출: <b>' + missing.map(esc).join(', ') + '</b>' : ''} <span class="hm-link" data-open="${openId}">열기</span></div></div>`;
      };

      // 주간성취도: 중등 담당 선생님만, 학생 단위
      const wkTeachers = active.filter((t) => (byTeacher[t.id] || []).some(isWeeklyTarget));
      let wkTotal = 0, wkCnt = 0; const wkMissing = [];
      wkTeachers.forEach((t) => {
        const targets = (byTeacher[t.id] || []).filter(isWeeklyTarget);
        const done = targets.filter((s) => wkDone[t.id] && wkDone[t.id].has(s.id)).length;
        wkTotal += targets.length; wkCnt += done;
        if (done < targets.length) wkMissing.push(`${t.name}(${targets.length - done}명)`);
      });
      const pgMissing = active.filter((t) => !pgDone.has(t.id)).map((t) => t.name);
      const moMissing = active.filter((t) => !moDone.has(t.id)).map((t) => t.name);
      const scMissing = active.filter((t) => !scDone.has(t.id)).map((t) => t.name);
      const daysSinceSat = Math.round((now - sat) / 86400000);

      el.innerHTML = '<div class="hm-sub">' +
        (wkTeachers.length ? `<div class="hm-sub-box"><div class="hd"><span>주간성취도 (${esc(lastRange)})</span><span class="st ${wkCnt >= wkTotal ? 'ok' : 'bad'}">${wkCnt >= wkTotal ? '전원 제출' : `${wkTotal - wkCnt}명분 남음 · ${esc(weeklyDue)}`}</span></div>
            <div class="bar"><i class="${wkCnt >= wkTotal ? 'full' : ''}" style="width:${wkTotal ? Math.round(wkCnt / wkTotal * 100) : 100}%"></i></div>
            <div class="names">학생 ${wkCnt}/${wkTotal}명 제출${wkMissing.length ? ' · 미제출: <b>' + wkMissing.map(esc).join(', ') + '</b>' : ''} <span class="hm-link" data-open="weekly">열기</span></div></div>` : '') +
        box(`반별 진도 (${lastRange})`, weeklyDue, active.length - pgMissing.length, active.length, pgMissing, 'progress') +
        box(`${prev.getMonth() + 1}월 월말보고서`, monthlyDue, active.length - moMissing.length, active.length, moMissing, 'monthly') +
        (daysSinceSat <= 4 ? box(`토요클리닉 (${md(sat)})`, daysSinceSat === 0 ? '오늘' : '다음 주 수요일까지', active.length - scMissing.length, active.length, scMissing, 'satclinic') : '') +
        '</div><div class="hm-foot">기준: 주간성취도·반별 진도는 지난주분(금요일 마감), 월말보고서는 전월분(매달 3일 마감). 담당 학생이 있는 선생님만 집계 (조교 제외).</div>';
    } catch (e) {
      el.innerHTML = `<div class="hm-empty">제출 현황을 불러오지 못했습니다 (${esc(e.message)})</div>`;
    }
  }

  // ── 관리부 오늘 업무 (바로가기) ──
  function renderOffice() {
    const el = $('hmOffice'); if (!el) return;
    const now = new Date(); const dow = now.getDay();
    const rows = [
      { id: 'attendance', title: '학생 출결', sub: '오늘 출석 코드 · 출결 입력' },
      { id: 'dailyreport', title: '관리부 마감', sub: '일일업무보고서 작성' },
      ...(dow === 5 || dow === 6 ? [{ id: 'weeklylog', title: '주간업무일지', sub: '이번 주 일지 정리' }] : []),
      { id: 'consult', title: '상담 접수 확인', sub: '새 상담 신청 · QR 상담지' },
    ];
    el.innerHTML = '<div class="hm-list">' + rows.map((r) => `<div class="hm-row" data-open="${r.id}" style="cursor:pointer"><span class="dot" style="background:var(--gold)"></span><span class="t"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span><span class="r">열기 ›</span></div>`).join('') + '</div>';
  }

  // ── 학생 · 선생님 요약 ──
  async function loadStudentsSummary() {
    const el = $('hmStudent'); if (!el || el.closest('[hidden]')) return;
    try {
      let students = (typeof studentsCache !== 'undefined' && Array.isArray(studentsCache) && studentsCache.length) ? studentsCache : null;
      if (!students) { const ss = await getDocs(collection(db, 'students')); students = []; ss.forEach((d) => students.push({ id: d.id, ...d.data() })); }
      let teachers = (typeof teachersCache !== 'undefined' && Array.isArray(teachersCache) && teachersCache.length) ? teachersCache : null;
      if (!teachers) { const ts = await getDocs(collection(db, 'teachers')); teachers = []; ts.forEach((d) => teachers.push({ id: d.id, ...d.data() })); }
      const byBranch = {}; students.forEach((s) => { const b = s.branch || '미지정'; byBranch[b] = (byBranch[b] || 0) + 1; });
      const mid = students.filter(isWeeklyTarget).length, high = students.length - mid;
      const noTeacher = students.filter((s) => !s.teacherUid).length;
      el.innerHTML = `<div class="hm-stat">
          <div class="box" data-open="students"><span class="n">${students.length}</span><span class="k">학생 전체</span></div>
          <div class="box" data-open="students"><span class="n">${mid}<small style="font-size:12px;color:var(--muted)"> / ${high}</small></span><span class="k">중등 / 고등</span></div>
          <div class="box" data-open="teachers"><span class="n">${teachers.filter((t) => t.role !== 'ta').length}</span><span class="k">선생님 (조교 ${teachers.filter((t) => t.role === 'ta').length})</span></div>
        </div>
        <div class="hm-foot">${Object.keys(byBranch).map((b) => esc(b) + ' ' + byBranch[b] + '명').join(' · ')}${noTeacher ? ` · <span style="color:#ff9c9c">담당 선생님 미지정 ${noTeacher}명</span>` : ''}</div>`;
    } catch (e) {
      el.innerHTML = `<div class="hm-empty">학생 현황을 불러오지 못했습니다 (${esc(e.message)})</div>`;
    }
  }

  async function refresh(force) {
    if (loading) return;
    if (!force && Date.now() - loadedAt < 60 * 1000) { renderHeader(); return; }
    loading = true;
    renderHeader(); renderOffice();
    await Promise.all([loadSchedule(), loadConsult(), loadSubmissions(), loadStudentsSummary()]);
    loadedAt = Date.now(); loading = false;
  }

  window.initHomeTab = function () { refresh(false); };
  window.refreshHomeTab = function () { refresh(true); };
  // 로그인 확인 + 기본 데이터 로드가 끝나면 (core에서 admin:ready) 홈을 채움
  window.addEventListener('admin:ready', () => { if (document.getElementById('tab-home')?.classList.contains('active')) refresh(true); });
})();
