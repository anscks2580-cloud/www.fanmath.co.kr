'use strict';
/* ═══════════════════════════════════════════════════════════
   관리자 메뉴 (왼쪽 사이드바 · 검색 · 최근 사용 · 역할별 노출)
   - 메뉴를 추가할 때: ① admin.html의 #legacyTabs에 기존 방식대로 버튼 한 줄
                     ② 아래 ADMIN_GROUPS의 알맞은 그룹에 항목 한 줄
   - 메뉴 열기는 항상 숨겨진 기존 탭 버튼을 클릭하는 방식 → switchTab + 초기화 함수가
     예전과 똑같이 실행됩니다.
   ═══════════════════════════════════════════════════════════ */
(function () {
  const ADMIN_GROUPS = [
    { id: 'home', label: '오늘', icon: '🏠', items: [
      { id: 'home', label: '오늘', desc: '할 일 · 제출 현황 · 상담 접수를 한눈에', keywords: ['홈', '대시보드', '오늘', '할일', '현황'] },
    ] },
    { id: 'student', label: '학생', icon: '👥', items: [
      { id: 'students',    label: '학생 관리',      desc: '학생 등록 · 정보 수정 · 계정', keywords: ['학생', '원생', '학생정보', '학생등록', '신규등록', '계정', '학생계정', '명단', '삭제'] },
      { id: 'classassign', label: '반 배정',        desc: '엑셀로 수업 반 일괄 배정', keywords: ['반', '반배정', '클래스', 'class', '반편성', '분반'] },
      { id: 'assign',      label: '강의 배정',      desc: '학생별 영상 접근 권한', keywords: ['강의배정', '배정', '수강', '권한', '강의권한', '태그'] },
      { id: 'excel',       label: '엑셀 일괄 등록', sub: '일괄 작업', desc: '엑셀 양식으로 학생 한꺼번에 등록', keywords: ['엑셀', 'excel', '일괄', '일괄등록', '대량등록', '업로드', 'xlsx'] },
      { id: 'promotion',   label: '일괄 진급',      sub: '일괄 작업', desc: '새 학기 학년 올리기', keywords: ['진급', '학년', '학년변경', '새학기', '승급'] },
      { id: 'parents',     label: '학부모 계정',    sub: '일괄 작업', desc: '학부모 전화번호 일괄 연결 · 미연결 확인', keywords: ['학부모', '학부모계정', '학부모 전화', '부모', '보호자', '학부모 로그인', '학부모 앱'] },
    ] },
    { id: 'reports', label: '수업 보고', icon: '📊', items: [
      { id: 'weekly',     label: '주간성취도', desc: '선생님이 제출한 중등부 주간성취도', keywords: ['성취도', '주간', '주간성취도', '테스트', '점수', '성적'] },
      { id: 'progress',   label: '반별진도',   desc: '반별 수업 진도', keywords: ['진도', '반별진도', '진도표', '수업진도'] },
      { id: 'monthly',    label: '월말보고서', desc: '선생님별 월말보고서 PDF', keywords: ['월말', '월말보고서', '보고서', '리포트', '학부모보고서', '월간'] },
      { id: 'studyreport', label: '학습보고서 생성', desc: '일일테스트 오답 → 학생별 월간 학습보고서', keywords: ['학습보고서', '보고서 생성', '일일테스트', '오답', '월간보고서', '성취도', '매쓰플랫', '등급'] },
      { id: 'satclinic',  label: '토요클리닉', desc: '토요 추가클리닉 보고', keywords: ['토요', '토요클리닉', '클리닉', '주말', '보충'] },
      { id: 'clinicroom', label: '클리닉실',   desc: '선생님 시간표 기반 클리닉실 배치', keywords: ['클리닉', '클리닉실', '보충', '질문', '시간표'] },
    ] },
    { id: 'video', label: '영상', icon: '🎬', items: [
      { id: 'videos',      label: '강의 목록',      desc: '영상 등록 · 태그 · 비메오 동기화 · 업로드', keywords: ['강의', '강의목록', '영상', '동영상', '폴더', '비메오', 'vimeo', '인강', '업로드'] },
      { id: 'videocode',   label: '영상 코드 조회', desc: '영상 고유 코드 검색', keywords: ['코드', '영상코드', '고유번호', '강의번호', '영상번호', '강의코드', '검색', '몇강'] },
      { id: 'watchstatus', label: '시청현황',       desc: '학생별 영상 시청 기록', keywords: ['시청', '시청현황', '수강현황', '시청기록', '학습현황', '영상시청'] },
      { id: 'apexvideo',   label: '에이펙스 영상',  desc: '에이펙스관 전용 영상', keywords: ['영상', '에이펙스', 'apex', '동영상'] },
      { id: 'promo',       label: '홍보영상',       desc: '로비 TV · 홈페이지 홍보영상', keywords: ['영상', '홍보', '홍보영상', '프로모션', '마케팅', '동영상', '로비'] },
    ] },
    { id: 'library', label: '자료실', icon: '📚', items: [
      { id: 'pastexams',   label: '기출문제', desc: '시험명 › 학년 › 지역 PDF (선생님 열람)', keywords: ['기출', '기출문제', '시험지', '내신', '중간고사', '기말고사', '학교시험', 'pdf', '군포', '안양', '의왕', '과천', '선생님 자료'] },
      { id: 'textbooks',   label: '시중교재', desc: '학교급 › 학년 › 교재 PDF (선생님 열람)', keywords: ['시중교재', '교재', '문제집', '교재pdf', '쎈', '개념원리', '블랙라벨', 'pdf', '선생님 자료'] },
      { id: 'tamaterials', label: '조교 자료', desc: '숙제 업로드 · 답지 · 조교 작업물', keywords: ['조교', '조교자료', '자료', 'ta', '첨부', '숙제', '답지'] },
    ] },
    { id: 'consult', label: '상담', icon: '📥', items: [
      { id: 'consult',     label: '상담 신청',     desc: '홈페이지 · QR 상담 접수와 기록', keywords: ['상담', '상담신청', '문의', '입학', '신규상담', '접수', '상담지', '태블릿', '방문상담', 'qr', 'QR', '큐알', '상담 기록', '설문', '학부모 설문', '학생 설문', '학습 성향', '라운지', '상담 링크'] },
      { id: 'consultdeck', label: '상담자료 관리', desc: '학부모 상담 프레젠테이션(중등·고등)', keywords: ['상담자료', '상담 자료', '프레젠테이션', '학부모 상담', '중등 상담', '고등 상담', '설명회'] },
      { id: 'seminar',     label: '설명회 신청',   desc: '설명회 안내 설정 · 참석 신청자 명단 · 엑셀', keywords: ['설명회', '설명회 신청', '참석', '참석 신청', '참석자', '예비고1', '신청자', '명단', '예약', '입학설명회', 'rsvp', 'seminar'] },
    ] },
    { id: 'office', label: '관리부', icon: '🗂', items: [
      { id: 'attendance',  label: '학생 출결',    desc: '출석 코드 · 출결 입력', keywords: ['출결', '출석', '결석', '지각', '조퇴', '출석부', '출석코드'] },
      { id: 'dailyreport', label: '관리부 마감',  desc: '일일업무보고서 이미지 만들기', keywords: ['마감', '관리부', '일일', '일일업무', '업무보고', '일일보고'] },
      { id: 'weeklylog',   label: '주간업무일지', desc: '주간 업무일지 작성', keywords: ['업무일지', '주간', '일지', '업무', '주간업무'] },
      { id: 'records',     label: '기록 조회',    desc: '지난 마감 · 일지 · 출결 기록', keywords: ['기록', '조회', '기록조회', '히스토리', '이력', '지난기록'] },
    ] },
    { id: 'notice', label: '공지 · 일정', icon: '📢', items: [
      { id: 'notice',    label: '공지사항',      desc: '학부모 앱 공지 발송', keywords: ['공지', '공지사항', '안내', '알림', '학부모', '앱'] },
      { id: 'schedule',  label: '학원 일정',     desc: '휴무 · 시험기간 · 선생님 할 일', keywords: ['일정', '달력', '캘린더', '스케줄', '회의', '휴무', '휴강', '설명회', '시험기간', '할일', '할 일', '선생님 일정', '공휴일'] },
      { id: 'homepopup', label: '홈페이지 팝업', desc: '홈페이지 첫 화면 팝업', keywords: ['팝업', '홈페이지', '메인', '배너', 'popup', '공지팝업', '이벤트'] },
    ] },
    { id: 'settings', label: '설정', icon: '⚙️', items: [
      { id: 'teachers',  label: '선생님 관리', desc: '선생님 · 조교 계정', keywords: ['선생님', '강사', '조교', '교사', '선생님계정', '강사계정', 'teacher'] },
      { id: 'adminmgmt', label: '관리자 계정', desc: '관리자 계정 · 역할 · 비밀번호', keywords: ['관리자', '관리자계정', '비밀번호', '비번', '암호', '계정', '권한', '설정', '역할', 'admin'] },
    ] },
  ];

  // 역할별 기본 노출 그룹 (null = 전체). 계정마다 menuGroups로 직접 지정하면 그게 우선.
  const ROLE_PRESETS = {
    master: null,
    office: ['home', 'student', 'consult', 'office', 'notice'],
  };
  const ROLE_LABELS = { master: '원장', office: '관리부' };

  const RECENT_KEY = 'swc_admin_recent_menus';
  const RECENT_MAX = 6;
  const $ = (id) => document.getElementById(id);

  const legacy = $('legacyTabs'), groupsEl = $('adGroups'), side = $('adSide');
  if (!legacy || !groupsEl || !side) return;

  const items = [];
  const itemById = {};
  const groupById = {};
  ADMIN_GROUPS.forEach((g) => { groupById[g.id] = g; g.items.forEach((m) => { m.group = g.id; items.push(m); itemById[m.id] = m; }); });

  function legacyBtn(id) {
    return legacy.querySelector('.admin-tab[onclick^="switchTab(\'' + id + '\'"]');
  }
  // 등록 안 된 기존 버튼이 있으면 '설정' 그룹에 임시로 추가 (누락 방지)
  legacy.querySelectorAll('.admin-tab').forEach((btn) => {
    const mt = (btn.getAttribute('onclick') || '').match(/switchTab\('([^']+)'/);
    if (!mt || itemById[mt[1]]) return;
    const m = { id: mt[1], label: btn.textContent.replace(/^[^가-힣A-Za-z0-9]+/, '').trim(), keywords: [], group: 'settings' };
    groupById.settings.items.push(m); items.push(m); itemById[m.id] = m;
    console.warn('[메뉴] ADMIN_GROUPS에 없는 탭을 설정 그룹에 임시 배치:', m.id);
  });

  let visibleGroups = null; // null = 전체
  let current = 'home';
  const btnById = {}, groupElById = {};

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function isVisible(groupId) { return groupId === 'home' || !visibleGroups || visibleGroups.includes(groupId); }

  // ── 사이드바 그리기 ──
  function render() {
    groupsEl.innerHTML = '';
    ADMIN_GROUPS.forEach((g) => {
      const wrap = document.createElement('div');
      wrap.className = 'ad-group' + (g.items.length === 1 && g.items[0].id === g.id ? ' single' : '');
      wrap.dataset.group = g.id;
      wrap.hidden = !isVisible(g.id);
      const head = document.createElement('button');
      head.type = 'button'; head.className = 'ad-group-btn';
      head.innerHTML = '<span class="ic">' + g.icon + '</span><span class="lb">' + esc(g.label) + '</span>' +
        (wrap.classList.contains('single') ? '' : '<span class="ct">' + g.items.length + '</span><span class="ar">▶</span>');
      head.addEventListener('click', () => {
        if (wrap.classList.contains('single')) { openMenu(g.items[0].id); return; }
        const willOpen = !wrap.classList.contains('open');
        groupsEl.querySelectorAll('.ad-group.open').forEach((o) => { if (o !== wrap) o.classList.remove('open'); });
        wrap.classList.toggle('open', willOpen);
      });
      wrap.appendChild(head);
      if (!wrap.classList.contains('single')) {
        const list = document.createElement('div'); list.className = 'ad-items';
        let lastSub = null;
        g.items.forEach((m) => {
          if (m.sub && m.sub !== lastSub) { const s = document.createElement('div'); s.className = 'ad-sub'; s.textContent = m.sub; list.appendChild(s); lastSub = m.sub; }
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'ad-item'; b.dataset.menu = m.id;
          b.innerHTML = '<span>' + esc(m.label) + '</span>';
          b.addEventListener('click', () => openMenu(m.id));
          list.appendChild(b); btnById[m.id] = b;
        });
        wrap.appendChild(list);
      }
      groupsEl.appendChild(wrap); groupElById[g.id] = wrap;
    });
    syncActive();
  }

  function syncActive() {
    const m = itemById[current]; if (!m) return;
    Object.values(btnById).forEach((b) => b.classList.toggle('active', b.dataset.menu === current));
    Object.values(groupElById).forEach((w) => w.classList.toggle('has-active', w.dataset.group === m.group));
    const gw = groupElById[m.group];
    if (gw && !gw.classList.contains('single')) {
      groupsEl.querySelectorAll('.ad-group.open').forEach((o) => { if (o !== gw) o.classList.remove('open'); });
      gw.classList.add('open');
    }
    const g = groupById[m.group];
    const title = $('adTopTitle'); if (title) title.textContent = m.id === 'home' ? '오늘' : (g.label + ' › ' + m.label);
    const crumb = $('adCrumb');
    if (crumb) crumb.innerHTML = m.id === 'home' ? '' :
      '<b>' + esc(g.label) + '</b><span class="sep">›</span><span class="now">' + esc(m.label) + '</span>' + (m.desc ? '<span class="desc">· ' + esc(m.desc) + '</span>' : '');
    document.title = (m.id === 'home' ? '관리자' : m.label + ' | 관리자') + ' | 송우찬수학학원';
  }

  // ── 메뉴 열기: 숨겨진 기존 탭 버튼 클릭 → 기존 onclick(switchTab + 초기화) 실행 ──
  function openMenu(id, opts = {}) {
    const m = itemById[id]; if (!m) return;
    if (!isVisible(m.group) && !opts.force) { showToastSafe('이 계정에서는 열 수 없는 메뉴입니다'); return; }
    const btn = legacyBtn(id); if (!btn) return;
    btn.click();
    closeDrawer();
    if (!opts.keepScroll) window.scrollTo({ top: 0 });
  }

  // switchTab을 감싸서 어떤 경로로 탭이 바뀌어도 사이드바가 따라오게
  const origSwitch = window.switchTab;
  window.switchTab = function (id, btn) {
    origSwitch(id, btn || legacyBtn(id));
    current = id;
    syncActive();
    if (id !== 'home') pushRecent(id);
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  };
  window.adminOpenMenu = (id) => openMenu(id);
  window.adminMenuLabel = (id) => { const m = itemById[id]; return m ? (groupById[m.group].label + ' › ' + m.label) : id; };
  window.adminMenuVisible = (id) => { const m = itemById[id]; return !!m && isVisible(m.group); };
  window.adminGroupVisible = (gid) => isVisible(gid);
  window.adminGroupList = () => ADMIN_GROUPS.filter((g) => g.id !== 'home').map((g) => ({ id: g.id, label: g.label, icon: g.icon, items: g.items.map((m) => m.label) }));
  window.adminRolePresets = () => ROLE_PRESETS;
  window.adminRoleLabel = (r) => ROLE_LABELS[r] || ROLE_LABELS.master;

  // ── 최근 사용 ──
  function readRecent() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => itemById[x]) : []; } catch (e) { return []; } }
  function pushRecent(id) {
    const list = [id].concat(readRecent().filter((x) => x !== id)).slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  }
  window.adminRecentMenus = () => readRecent().filter((id) => isVisible(itemById[id].group)).map((id) => ({ id, label: itemById[id].label, group: groupById[itemById[id].group].label }));

  // ── 역할별 노출 (로그인 확인 직후 core에서 admin:profile 이벤트) ──
  function applyProfile() {
    const a = window.currentAdmin || {};
    const role = ROLE_LABELS[a.role] ? a.role : 'master';
    const custom = Array.isArray(a.menuGroups) ? a.menuGroups.filter((g) => groupById[g]) : [];
    visibleGroups = custom.length ? custom : ROLE_PRESETS[role];
    render();
    const badge = $('adRoleBadge'); if (badge) badge.textContent = ROLE_LABELS[role] + (custom.length ? ' · 직접 지정' : '');
    const who = $('adSideWho'); if (who) who.textContent = a.name || a.email || '';
    const nameEl = $('adminName'); if (nameEl) nameEl.textContent = (a.name ? a.name + ' · ' : '') + ROLE_LABELS[role];
    document.querySelectorAll('#tab-home [data-group]').forEach((card) => { card.hidden = !isVisible(card.dataset.group); });
    // 지금 열려 있는 메뉴가 숨겨졌다면 홈으로
    if (!isVisible(itemById[current].group)) openMenu('home', { force: true });
  }
  window.addEventListener('admin:profile', applyProfile);

  // 로그인 확인 뒤 데이터까지 준비되면: 주소의 #메뉴로 이동 (새로고침해도 같은 메뉴 유지)
  window.addEventListener('admin:ready', () => {
    const want = (location.hash || '').replace('#', '');
    if (want && want !== 'home' && itemById[want] && isVisible(itemById[want].group)) openMenu(want, { keepScroll: true });
  });

  // ── 검색 ──
  const searchEl = $('menuSearch'), resultsEl = $('menuResults');
  let results = [], activeIdx = -1;
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function runSearch() {
    const raw = searchEl.value.trim(), q = norm(raw);
    if (!q) { resultsEl.hidden = true; resultsEl.innerHTML = ''; results = []; groupsEl.hidden = false; return; }
    results = items.filter((m) => m.id !== 'home' && isVisible(m.group)).map((m) => {
      const label = norm(m.label), g = norm(groupById[m.group].label);
      let score = 0;
      if (label.startsWith(q)) score = 100; else if (label.includes(q)) score = 80;
      else if ((m.keywords || []).some((k) => norm(k).startsWith(q))) score = 60;
      else if ((m.keywords || []).some((k) => norm(k).includes(q))) score = 40;
      else if (g.includes(q) || norm(m.desc).includes(q)) score = 20;
      return { m, score };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
    groupsEl.hidden = true; resultsEl.hidden = false; activeIdx = results.length ? 0 : -1;
    if (!results.length) { resultsEl.innerHTML = '<div class="ad-result-empty">일치하는 메뉴가 없어요</div>'; return; }
    resultsEl.innerHTML = results.map((r, i) => {
      const lb = esc(r.m.label), hi = raw ? lb.replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), (x) => '<mark>' + x + '</mark>') : lb;
      return '<div class="ad-result' + (i === activeIdx ? ' active' : '') + '" data-i="' + i + '"><span>' + hi + '<small>' + esc(groupById[r.m.group].label) + (r.m.desc ? ' · ' + esc(r.m.desc) : '') + '</small></span></div>';
    }).join('');
  }
  function clearSearch() { searchEl.value = ''; runSearch(); }
  searchEl.addEventListener('input', runSearch);
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSearch(); searchEl.blur(); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % results.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + results.length) % results.length; }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0) { openMenu(results[activeIdx].m.id); clearSearch(); } return; }
    else return;
    resultsEl.querySelectorAll('.ad-result').forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  });
  resultsEl.addEventListener('click', (e) => { const el = e.target.closest('.ad-result'); if (!el) return; openMenu(results[+el.dataset.i].m.id); clearSearch(); });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault(); openDrawer(); searchEl.focus(); searchEl.select();
    }
  });

  // ── 모바일 드로어 ──
  const menuBtn = $('adMenuBtn'), backdrop = $('adBackdrop');
  function openDrawer() { if (window.innerWidth < 1024) document.body.classList.add('ad-side-open'); }
  function closeDrawer() { document.body.classList.remove('ad-side-open'); }
  menuBtn && menuBtn.addEventListener('click', () => document.body.classList.toggle('ad-side-open'));
  backdrop && backdrop.addEventListener('click', closeDrawer);
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) closeDrawer(); });

  // 홈 카드의 "… ›" 버튼
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b && b.dataset.open) openMenu(b.dataset.open); });

  function showToastSafe(msg) { if (typeof window.showToast === 'function') window.showToast(msg); else alert(msg); }

  render();
})();
