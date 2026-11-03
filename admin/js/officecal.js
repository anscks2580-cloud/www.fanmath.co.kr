'use strict';
/* ═══════════════════════════════════════════════════════════
   관리부 이번 주 달력 (홈 화면 맨 위)
   - 컬렉션: officeCalendar (관리자만 읽기·쓰기)
     { branch:'평촌관'|'산본관', type:'상담'|'회의'|'설명회'|'행사'|'기타',
       date:'YYYY-MM-DD', startTime:'HH:MM', endTime:'HH:MM', title, memo, done,
       studentName, grade, school, method, parentPhone, counselor,   ← 상담일 때
       attendees,                                                    ← 회의일 때
       createdAt, createdBy, updatedAt, updatedBy }
   - 학원 일정(scheduleEvents)도 같은 주에 있으면 읽기 전용으로 함께 표시
   - 평촌관 = 보라색, 산본관 = 노란색 글씨로 구분 / 왼쪽 위 펼침 메뉴로 관 선택
   ═══════════════════════════════════════════════════════════ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const TYPES = ['상담', '회의', '설명회', '행사', '기타'];
  const GRADES = ['초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', 'N수', '기타'];
  const BR_KEY = 'ocBranchFilter';

  let weekOffset = 0;          // 0 = 이번 주
  let branchFilter = '전체';
  try { const b = localStorage.getItem(BR_KEY); if (['전체', '평촌관', '산본관'].includes(b)) branchFilter = b; } catch (e) {}
  let events = [];             // 이번 주 officeCalendar
  let schedules = [];          // 이번 주 학원 일정
  let editingId = null;
  let loadedOnce = false;
  let teacherBranch = {};      // 선생님 uid → 관 (학원 일정 '선생님 지정' 구분용)
  let dayOpen = null;          // 지금 크게 열어 둔 날짜

  function weekStart(offset) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + 7 * offset);   // 일요일 시작
    return d;
  }
  const brClass = (b) => (String(b || '').includes('산본') ? 'sb' : 'pc');
  const norm = (b) => (String(b || '').includes('산본') ? '산본관' : String(b || '').includes('평촌') ? '평촌관' : '');
  const pass = (b) => branchFilter === '전체' || norm(b) === branchFilter;
  // 학원 일정이 어느 관 것인지: 관 지정 → 그 관 / 선생님 지정 → 선생님 소속 관 / 전체 → 제목에 관 이름이 있으면 그 관, 없으면 두 관 공통
  function schedBranches(x) {
    if (x.target === 'branch' && norm(x.branch)) return [norm(x.branch)];
    if (x.target === 'teachers' && Array.isArray(x.teacherUids) && x.teacherUids.length) {
      const set = new Set(x.teacherUids.map((u) => teacherBranch[u]).filter(Boolean));
      if (set.size) return [...set];
    }
    const t = String(x.title || '') + ' ' + String(x.memo || '');
    const hasS = /산본/.test(t), hasP = /평촌/.test(t);
    if (hasS && !hasP) return ['산본관'];
    if (hasP && !hasS) return ['평촌관'];
    return ['평촌관', '산본관'];
  }
  const schedPass = (x) => branchFilter === '전체' || schedBranches(x).includes(branchFilter);
  const schedCls = (x) => { const b = schedBranches(x); return b.length === 1 ? brClass(b[0]) : ''; };
  const schedTag = (x) => { const b = schedBranches(x); return b.length === 1 ? b[0].replace('관', '') : '공통'; };
  const dayEventsOf = (key) => events.filter((x) => x.date === key && pass(x.branch)).sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'));
  const daySchOf = (key) => schedules.filter((x) => (x.start || '') <= key && (x.end || x.start || '') >= key && schedPass(x));

  // ── 불러오기 ──
  async function load() {
    const box = $('ocCal'); if (!box) return;
    const s = weekStart(weekOffset), e = new Date(s); e.setDate(s.getDate() + 6);
    const from = ymd(s), to = ymd(e);
    try {
      const [snap, sch] = await Promise.all([
        getDocs(query(collection(db, 'officeCalendar'), where('date', '>=', from), where('date', '<=', to))),
        getDocs(collection(db, 'scheduleEvents')).catch(() => null),
        Object.keys(teacherBranch).length ? null : getDocs(collection(db, 'teachers')).catch(() => null),
      ]).then((r) => { if (r[2]) r[2].forEach((d) => { const b = norm(d.data().branch); if (b) teacherBranch[d.id] = b; }); return r; });
      events = []; snap.forEach((d) => events.push({ id: d.id, ...d.data() }));
      schedules = [];
      if (sch) sch.forEach((d) => {
        const x = d.data(); const st = x.start || ''; const en = x.end || st;
        if (!st || en < from || st > to) return;
        schedules.push({ id: d.id, ...x });
      });
      loadedOnce = true;
      render();
    } catch (err) {
      box.innerHTML = `<div class="hm-empty">달력을 불러오지 못했습니다 (${esc(err.message)})<br>Firestore 규칙에 officeCalendar 항목이 올라갔는지 확인해주세요.</div>`;
    }
  }

  // ── 그리기 ──
  function render() {
    const box = $('ocCal'); if (!box) return;
    const s = weekStart(weekOffset), e = new Date(s); e.setDate(s.getDate() + 6);
    const today = ymd(new Date());
    const lbl = $('ocWeekLabel');
    if (lbl) lbl.textContent = `${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일` + (weekOffset === 0 ? ' · 이번 주' : weekOffset === 1 ? ' · 다음 주' : weekOffset === -1 ? ' · 지난주' : '');
    const todayBtn = $('ocThisWeek'); if (todayBtn) todayBtn.hidden = weekOffset === 0;
    renderBranchMenu();

    let html = '<div class="oc-grid">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(s); d.setDate(s.getDate() + i);
      const key = ymd(d);
      const isToday = key === today;
      const dayEvents = dayEventsOf(key);
      const daySch = daySchOf(key);
      const cnt = dayEvents.length;
      html += `<div class="oc-day${isToday ? ' today' : ''}${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}${key < today ? ' past' : ''}" data-date="${key}">
        <div class="oc-dh"><span class="dw">${DOW[i]}</span><span class="dn">${d.getMonth() + 1}/${d.getDate()}</span>${isToday ? '<span class="oc-today-tag">오늘</span>' : ''}${cnt ? `<span class="oc-cnt">${cnt}</span>` : ''}<button type="button" class="oc-add" title="이 날짜에 일정 추가" onclick="event.stopPropagation();ocOpen(null,'${key}')">＋</button></div>
        <div class="oc-items">
          ${daySch.map((x) => `<div class="oc-sch ${schedCls(x)}" title="학원 일정">📌 ${esc(x.title || '')} <small>${esc(schedTag(x))}</small></div>`).join('')}
          ${dayEvents.map(itemHtml).join('')}
          ${!cnt && !daySch.length ? '<div class="oc-none">일정 없음</div>' : ''}
        </div>
      </div>`;
    }
    html += '</div>';
    box.innerHTML = html;
    if (dayOpen && $('ocDayModal')?.classList.contains('show')) renderDay();
    box.querySelectorAll('.oc-day').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('.oc-add')) return;
        const evEl = ev.target.closest('.oc-ev');
        ocDay(el.dataset.date, evEl ? evEl.dataset.id : null);
      });
    });
  }

  function itemHtml(x) {
    const time = x.startTime ? `${x.startTime}${x.endTime ? '~' + x.endTime : ''}` : '';
    let main = '', sub = '';
    if (x.type === '상담') {
      main = [x.grade, x.studentName].filter(Boolean).join(' ') || x.title || '상담';
      sub = [x.school, x.method, x.counselor ? '담당 ' + x.counselor : ''].filter(Boolean).join(' · ');
      if (x.title && (x.grade || x.studentName)) sub = [x.title, sub].filter(Boolean).join(' · ');
    } else if (x.type === '회의') {
      main = x.title || '회의';
      sub = x.attendees ? '참석 ' + x.attendees : '';
    } else {
      main = x.title || x.type || '일정';
    }
    return `<div class="oc-ev ${brClass(x.branch)}${x.done ? ' done' : ''}" data-id="${esc(x.id)}" title="${esc((x.branch || '') + ' · ' + (x.type || '') + (x.memo ? '\n' + x.memo : ''))}">
      <div class="l1"><span class="ty">${esc(x.type || '기타')}</span>${time ? `<span class="tm">${esc(time)}</span>` : ''}${branchFilter === '전체' ? `<span class="br">${esc((x.branch || '').replace('관', ''))}</span>` : ''}</div>
      <div class="l2">${esc(main)}</div>
      ${sub ? `<div class="l3">${esc(sub)}</div>` : ''}
    </div>`;
  }

  // ── 왼쪽 위 관 선택 (펼침 메뉴) ──
  function renderBranchMenu() {
    const btn = $('ocBrBtn'), list = $('ocBrList'); if (!btn || !list) return;
    const n = (b) => events.filter((x) => b === '전체' || String(x.branch || '').includes(b.replace('관', ''))).length;
    btn.className = 'oc-br-btn ' + (branchFilter === '평촌관' ? 'pc' : branchFilter === '산본관' ? 'sb' : '');
    btn.innerHTML = `<span>${esc(branchFilter)}</span><small>${n(branchFilter)}건</small><i>▾</i>`;
    list.innerHTML = ['전체', '평촌관', '산본관'].map((b) => `<button type="button" class="${b === '평촌관' ? 'pc' : b === '산본관' ? 'sb' : ''}${b === branchFilter ? ' on' : ''}" onclick="ocSetBranch('${b}')"><span class="sw"></span>${b}<small>${n(b)}건</small></button>`).join('');
  }
  window.ocToggleBranch = function (force) {
    const wrap = $('ocBr'); if (!wrap) return;
    const open = typeof force === 'boolean' ? force : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
  };
  window.ocSetBranch = function (b) {
    branchFilter = b;
    try { localStorage.setItem(BR_KEY, b); } catch (e) {}
    ocToggleBranch(false);
    render();
    window.dispatchEvent(new CustomEvent('oc:branch', { detail: b }));
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('#ocBr')) { const w = $('ocBr'); if (w) w.classList.remove('open'); } });

  window.ocBranch = () => branchFilter;
  window.ocMoveWeek = function (step) { weekOffset = step === 0 ? 0 : weekOffset + step; load(); };

  // ── 날짜 크게 보기 (날짜 칸이나 일정을 누르면) ──
  function detailRows(x) {
    const rows = [];
    const add = (k, v) => { if (v) rows.push(`<div><span>${k}</span><b>${esc(v)}</b></div>`); };
    if (x.type === '상담') {
      add('학교', x.school); add('상담 방식', x.method); add('학부모 연락처', x.parentPhone); add('상담 담당', x.counselor);
      add('내용', x.title);
    } else {
      if (x.type === '회의') add('참석자', x.attendees);
    }
    return rows.join('');
  }
  function renderDay() {
    const m = $('ocDayModal'); if (!m || !dayOpen) return;
    const d = parse(dayOpen), today = ymd(new Date());
    const list = dayEventsOf(dayOpen), sch = daySchOf(dayOpen);
    m.querySelector('.oc-dtitle').innerHTML = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일${dayOpen === today ? ' <span class="oc-today-tag">오늘</span>' : ''}<small>${esc(branchFilter)} · ${list.length}건</small>`;
    m.querySelector('.oc-dbody').innerHTML =
      (sch.length ? `<div class="oc-dsch">${sch.map((x) => `<div class="oc-sch ${schedCls(x)}">📌 ${esc(x.title || '')} <small>${esc(schedTag(x))} · 학원 일정${x.time ? ' · ' + esc(x.time) : ''}</small></div>`).join('')}</div>` : '') +
      (list.length ? list.map((x) => `
        <div class="oc-dcard ${brClass(x.branch)}${x.done ? ' done' : ''}" id="ocd-${esc(x.id)}">
          <div class="oc-dtop">
            <span class="tm">${esc(x.startTime ? x.startTime + (x.endTime ? ' ~ ' + x.endTime : '') : '시간 미정')}</span>
            <span class="ty">${esc(x.type || '기타')}</span>
            <span class="br">${esc(norm(x.branch) || x.branch || '')}</span>
            ${x.done ? '<span class="dn">완료</span>' : ''}
            <span style="flex:1"></span>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ocToggleDone('${esc(x.id)}')">${x.done ? '완료 취소' : '완료'}</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ocOpen('${esc(x.id)}')">수정</button>
          </div>
          <div class="oc-dhead">${esc(x.type === '상담' ? ([x.grade, x.studentName].filter(Boolean).join(' ') || x.title || '상담') : (x.title || x.type || '일정'))}</div>
          <div class="oc-dgrid">${detailRows(x)}</div>
          ${x.memo ? `<div class="oc-dmemo">${esc(x.memo)}</div>` : ''}
        </div>`).join('') : `<div class="oc-dempty">${esc(branchFilter === '전체' ? '' : branchFilter + ' ')}등록된 일정이 없습니다.</div>`);
  }
  window.ocDay = function (date, focusId) {
    let m = $('ocDayModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'ocDayModal';
      m.innerHTML = `<div class="oc-dbox" role="dialog" aria-modal="true">
          <div class="oc-mh"><b class="oc-dtitle"></b><button type="button" class="oc-x" onclick="ocDayClose()">✕</button></div>
          <div class="oc-dbody"></div>
          <div class="oc-mf"><span style="flex:1"></span><button type="button" class="btn btn-secondary btn-sm" onclick="ocDayClose()">닫기</button><button type="button" class="btn btn-primary btn-sm" onclick="ocOpen(null, document.getElementById('ocDayModal').dataset.date)">＋ 이 날 일정 추가</button></div>
        </div>`;
      m.addEventListener('click', (e) => { if (e.target === m) ocDayClose(); });
      document.body.appendChild(m);
    }
    dayOpen = date; m.dataset.date = date;
    renderDay();
    m.classList.add('show');
    if (focusId) setTimeout(() => { const c = $('ocd-' + focusId); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('focus'); setTimeout(() => c.classList.remove('focus'), 1600); } }, 30);
  };
  window.ocDayClose = function () { $('ocDayModal')?.classList.remove('show'); dayOpen = null; };
  window.ocToggleDone = async function (id) {
    const x = events.find((e) => e.id === id); if (!x) return;
    try { await updateDoc(doc(db, 'officeCalendar', id), { done: !x.done, updatedAt: Timestamp.now(), updatedBy: auth.currentUser?.email || '' }); x.done = !x.done; render(); }
    catch (e) { alert('저장 실패: ' + e.message); }
  };

  // ── 등록 / 수정 창 ──
  function ensureModal() {
    if ($('ocModal')) return;
    const m = document.createElement('div');
    m.id = 'ocModal';
    m.innerHTML = `
      <div class="oc-box" role="dialog" aria-modal="true">
        <div class="oc-mh"><b id="ocMTitle">일정 등록</b><button type="button" class="oc-x" onclick="ocClose()">✕</button></div>
        <div class="oc-mb">
          <div class="oc-f"><label>관</label>
            <div class="oc-seg" id="ocFBranch">
              <button type="button" data-v="평촌관" class="pc">평촌관</button>
              <button type="button" data-v="산본관" class="sb">산본관</button>
            </div>
          </div>
          <div class="oc-f"><label>종류</label>
            <div class="oc-seg" id="ocFType">${TYPES.map((t) => `<button type="button" data-v="${t}">${t}</button>`).join('')}</div>
          </div>
          <div class="oc-row3">
            <div class="oc-f"><label>날짜</label><input type="date" id="ocFDate"></div>
            <div class="oc-f"><label>시작 시간</label><input type="time" id="ocFStart" step="600"></div>
            <div class="oc-f"><label>끝 시간 <small>(선택)</small></label><input type="time" id="ocFEnd" step="600"></div>
          </div>
          <div id="ocConsultBox" class="oc-sub">
            <div class="oc-row3">
              <div class="oc-f"><label>학생 이름</label><input type="text" id="ocFStudent" maxlength="30" placeholder="홍길동"></div>
              <div class="oc-f"><label>학년</label><select id="ocFGrade"><option value="">선택</option>${GRADES.map((g) => `<option>${g}</option>`).join('')}</select></div>
              <div class="oc-f"><label>학교</label><input type="text" id="ocFSchool" maxlength="30" placeholder="평촌중"></div>
            </div>
            <div class="oc-row3">
              <div class="oc-f"><label>상담 방식</label><select id="ocFMethod"><option>방문</option><option>전화</option><option>온라인</option></select></div>
              <div class="oc-f"><label>학부모 연락처</label><input type="tel" id="ocFPhone" maxlength="20" inputmode="numeric" placeholder="01012345678"></div>
              <div class="oc-f"><label>상담 담당</label><input type="text" id="ocFCounselor" maxlength="20" placeholder="원장님 / 실장님"></div>
            </div>
          </div>
          <div id="ocMeetBox" class="oc-sub">
            <div class="oc-f"><label>참석자</label><input type="text" id="ocFAttendees" maxlength="80" placeholder="예: 원장님, 관리부, 중등부 선생님"></div>
          </div>
          <div class="oc-f"><label id="ocFTitleLb">내용</label><input type="text" id="ocFTitle" maxlength="60" placeholder="예: 신규 상담 / 기말고사 대비 회의"></div>
          <div class="oc-f"><label>메모 <small>(선택)</small></label><textarea id="ocFMemo" rows="3" maxlength="500" placeholder="상담 내용, 준비할 것 등"></textarea></div>
          <label class="oc-done"><input type="checkbox" id="ocFDone"> 완료로 표시</label>
          <div class="oc-msg" id="ocMsg"></div>
        </div>
        <div class="oc-mf">
          <button type="button" class="btn btn-danger btn-sm" id="ocDelBtn" onclick="ocDelete()">삭제</button>
          <span style="flex:1"></span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="ocClose()">취소</button>
          <button type="button" class="btn btn-primary btn-sm" id="ocSaveBtn" onclick="ocSave()">등록</button>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target === m) ocClose(); });
    document.body.appendChild(m);
    m.querySelectorAll('.oc-seg').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      setSeg(seg.id, b.dataset.v);
    }));
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if ($('ocModal')?.classList.contains('show')) ocClose(); else if ($('ocDayModal')?.classList.contains('show')) ocDayClose(); });
  }
  function setSeg(id, v) {
    const seg = $(id); if (!seg) return;
    seg.dataset.value = v;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    if (id === 'ocFType') {
      $('ocConsultBox').style.display = v === '상담' ? '' : 'none';
      $('ocMeetBox').style.display = v === '회의' ? '' : 'none';
      $('ocFTitleLb').innerHTML = v === '상담' ? '내용 <small>(선택)</small>' : '내용';
      $('ocFTitle').placeholder = v === '상담' ? '예: 신규 상담 / 재원생 성적 상담' : v === '회의' ? '예: 기말고사 대비 회의' : '예: 설명회 준비';
    }
  }
  const val = (id) => ($(id)?.value || '').trim();

  window.ocOpen = function (id, date) {
    ensureModal();
    editingId = id || null;
    const x = id ? events.find((e) => e.id === id) : null;
    const defBranch = branchFilter !== '전체' ? branchFilter : '평촌관';
    setSeg('ocFBranch', x ? (x.branch || '평촌관') : defBranch);
    setSeg('ocFType', x ? (x.type || '기타') : '상담');
    $('ocFDate').value = x ? x.date : (date || ymd(new Date()));
    $('ocFStart').value = x?.startTime || '';
    $('ocFEnd').value = x?.endTime || '';
    $('ocFStudent').value = x?.studentName || '';
    $('ocFGrade').value = x?.grade || '';
    $('ocFSchool').value = x?.school || '';
    $('ocFMethod').value = x?.method || '방문';
    $('ocFPhone').value = x?.parentPhone || '';
    $('ocFCounselor').value = x?.counselor || '';
    $('ocFAttendees').value = x?.attendees || '';
    $('ocFTitle').value = x?.title || '';
    $('ocFMemo').value = x?.memo || '';
    $('ocFDone').checked = !!x?.done;
    $('ocMsg').textContent = '';
    $('ocMTitle').textContent = x ? '일정 수정' : '일정 등록';
    $('ocSaveBtn').textContent = x ? '수정 저장' : '등록';
    $('ocDelBtn').style.display = x ? '' : 'none';
    $('ocModal').classList.add('show');
    setTimeout(() => { (x ? $('ocFTitle') : $('ocFStart'))?.focus(); }, 50);
  };
  window.ocClose = function () { $('ocModal')?.classList.remove('show'); editingId = null; };

  window.ocSave = async function () {
    const msg = $('ocMsg');
    const branch = $('ocFBranch').dataset.value, type = $('ocFType').dataset.value;
    const data = {
      branch, type,
      date: val('ocFDate'), startTime: val('ocFStart'), endTime: val('ocFEnd'),
      title: val('ocFTitle'), memo: val('ocFMemo'), done: $('ocFDone').checked,
      studentName: '', grade: '', school: '', method: '', parentPhone: '', counselor: '', attendees: '',
    };
    if (type === '상담') {
      Object.assign(data, { studentName: val('ocFStudent'), grade: val('ocFGrade'), school: val('ocFSchool'), method: val('ocFMethod'), parentPhone: val('ocFPhone').replace(/[^0-9-]/g, ''), counselor: val('ocFCounselor') });
    }
    if (type === '회의') data.attendees = val('ocFAttendees');
    if (!['평촌관', '산본관'].includes(branch)) { msg.textContent = '평촌관 / 산본관을 골라주세요.'; return; }
    if (!data.date) { msg.textContent = '날짜를 골라주세요.'; return; }
    if (data.endTime && data.startTime && data.endTime < data.startTime) { msg.textContent = '끝 시간이 시작 시간보다 빠릅니다.'; return; }
    if (type === '상담' && !data.studentName && !data.title) { msg.textContent = '학생 이름이나 내용 중 하나는 입력해주세요.'; return; }
    if (type !== '상담' && !data.title) { msg.textContent = '내용을 입력해주세요.'; return; }
    const who = auth.currentUser?.email || '';
    const btn = $('ocSaveBtn'); btn.disabled = true;
    try {
      if (editingId) await updateDoc(doc(db, 'officeCalendar', editingId), { ...data, updatedAt: Timestamp.now(), updatedBy: who });
      else await addDoc(collection(db, 'officeCalendar'), { ...data, createdAt: Timestamp.now(), createdBy: who });
      const wasEdit = !!editingId;
      ocClose();
      if (dayOpen) { dayOpen = data.date; $('ocDayModal').dataset.date = data.date; }
      // 저장한 날짜가 보고 있는 주가 아니면 그 주로 이동
      const ws = weekStart(0); const diff = Math.floor((parse(data.date) - ws) / 86400000);
      weekOffset = Math.floor(diff / 7);
      if (branchFilter !== '전체' && branchFilter !== branch) { branchFilter = '전체'; try { localStorage.setItem(BR_KEY, '전체'); } catch (e) {} }
      await load();
      if (typeof showToast === 'function') showToast(wasEdit ? '일정을 수정했습니다' : '일정을 등록했습니다');
    } catch (e) { msg.textContent = '저장 실패: ' + e.message; }
    finally { btn.disabled = false; }
  };

  window.ocDelete = async function () {
    if (!editingId) return;
    const x = events.find((e) => e.id === editingId);
    if (!confirm(`이 일정을 삭제할까요?\n${x ? `${x.branch} · ${x.type} · ${x.date}` : ''}`)) return;
    try {
      await deleteDoc(doc(db, 'officeCalendar', editingId));
      ocClose(); await load();
      if (typeof showToast === 'function') showToast('일정을 삭제했습니다');
    } catch (e) { $('ocMsg').textContent = '삭제 실패: ' + e.message; }
  };

  // 홈이 열릴 때마다 새로 불러오기 (home.js refresh와 같은 시점)
  window.ocRefresh = function () { if (!$('ocCal')) return; if (!loadedOnce) render(); load(); };
  window.addEventListener('admin:ready', () => window.ocRefresh());
  // 자정이 지나면 오늘 표시가 바뀌도록 1분마다 확인
  let lastDay = ymd(new Date());
  setInterval(() => { const t = ymd(new Date()); if (t !== lastDay) { lastDay = t; if (weekOffset === 0) load(); } }, 60 * 1000);
})();
