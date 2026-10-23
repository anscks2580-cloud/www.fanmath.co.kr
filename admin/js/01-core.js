'use strict';
/* ═══════════════════════════════════════════════════════════
   공통: 태그 체계 · 로그인 확인 · 탭 전환 · 로그아웃
   (admin.html에서 분리 — 원본 2781~3007줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// 학년별 자동 배정 태그 맵
// ══════════════════════════════════════════
// 영상 접근 태그 시스템 (실제 영상 tag 기준, 학생별 직접 배정)
// ══════════════════════════════════════════
// 고1/고2/고3/중등 등 - 이 태그들은 업로드 드롭다운에서 고정된 값만 쓰므로 안전하게 고정 목록 사용
const FIXED_TAG_CATEGORIES = [
  { label: '고1', tags: [
      {v:'공통수학1', l:'공통수학1'},
      {v:'공통수학2', l:'공통수학2'},
      {v:'송팁_공통수학1', l:"Song's Tip 공통수학1"},
      {v:'송팁_공통수학2', l:"Song's Tip 공통수학2"},
      {v:'대수_세쌍둥이라이트', l:'대수 (라이트·예습)'},
      {v:'기출_고1_', l:'기출해설 (고1 전체)'},
  ]},
  { label: '고2', tags: [
      {v:'대수_세쌍둥이개념', l:'대수 개념'},
      {v:'대수_세쌍둥이심화', l:'대수 심화'},
      {v:'대수_세쌍둥이파이널', l:'대수 파이널'},
      {v:'미적분1', l:'미적분1'},
      {v:'확통', l:'확통'},
      {v:'미적분2_세쌍둥이라이트', l:'미적분2 (라이트·예습)'},
      {v:'기출_고2_', l:'기출해설 (고2 전체)'},
  ]},
  { label: '고3 / N수', tags: [
      {v:'미적분2_세쌍둥이개념', l:'미적분2 개념'},
      {v:'미적분2_세쌍둥이심화', l:'미적분2 심화'},
      {v:'미적분2_세쌍둥이파이널', l:'미적분2 파이널'},
      {v:'기하', l:'기하'},
      {v:'수리논술', l:'수리논술'},
      {v:'기출_고3_', l:'기출해설 (고3 전체)'},
  ]},
  { label: '중등', tags: [
      {v:'중1', l:'중1'}, {v:'중2', l:'중2'}, {v:'중3', l:'중3'},
  ]},
];

// 보충강의실 선생님 고정 목록 — 영상이 아직 하나도 없어도 배정 탭에 항상 노출됨
// (여기 등록된 이름/표기가 실제 정답 태그 형식. 영상 업로드 시에도 이 표기를 그대로 써야 함)
const SUBBANG_TEACHERS = {
  '평촌관': ['송우찬 원장T','송문찬 원장T','조현주 부원장T','김영진T','신민훈T','장미현T','공민정T'],
  '산본관': ['송우찬 원장T','송문찬 원장T','조현주 부원장T','공민정T','장미현T','김영진T','신민훈T'],
};

// 보충강의실 태그 목록: 고정 선생님 목록을 기본으로 항상 보여주고,
// 혹시 고정 목록에 없는 태그로 실제 영상이 올라와 있으면 그것도 추가로 병합해서 보여준다
function getSubbangTagGroups() {
  const seen = { 평촌관: new Set(), 산본관: new Set() };
  SUBBANG_TEACHERS['평촌관'].forEach(t => seen.평촌관.add(`보충_평촌_${t}`));
  SUBBANG_TEACHERS['산본관'].forEach(t => seen.산본관.add(`보충_산본_${t}`));
  videosCache.forEach(v => {
    const tag = (v.tag || '').trim();
    if (tag.startsWith('보충_평촌_')) seen.평촌관.add(tag);
    else if (tag.startsWith('보충_산본_')) seen.산본관.add(tag);
  });
  const toGroup = (branchLabel, set) => ({
    label: `보충강의실 — ${branchLabel}`,
    tags: [...set].sort().map(tag => ({ v: tag, l: tag.replace(/^보충_(평촌|산본)_/, '') }))
  });
  const groups = [];
  if (seen.평촌관.size) groups.push(toGroup('평촌관', seen.평촌관));
  if (seen.산본관.size) groups.push(toGroup('산본관', seen.산본관));
  return groups;
}

// 실제 렌더링에 쓸 전체 카테고리 (호출 시점에 videosCache 기준으로 재계산)
function getTagCategories() {
  return [...FIXED_TAG_CATEGORIES, ...getSubbangTagGroups()];
}

// 담당 선생님 이름으로 정확한 보충강의실 태그를 찾아준다.
// 고정 목록(SUBBANG_TEACHERS)을 우선 기준으로 삼아 "원장" 등 표기를 정확히 맞추고,
// 혹시 고정 목록에 없는 이름이면 실제 영상 태그에서 찾아보고, 그것도 없으면 기본 추정값 사용.
function findTeacherTag(branch, teacherName) {
  if (!teacherName) return null;
  const branchPrefix = branch === '평촌관' ? '보충_평촌_' : branch === '산본관' ? '보충_산본_' : null;
  if (!branchPrefix) return null;

  const fixedList = SUBBANG_TEACHERS[branch] || [];
  const fixedMatch = fixedList.find(t => t.includes(teacherName));
  if (fixedMatch) return `${branchPrefix}${fixedMatch}`;

  const candidates = videosCache
    .map(v => (v.tag || '').trim())
    .filter(t => t.startsWith(branchPrefix) && t.includes(teacherName));
  if (candidates.length) return candidates[0];
  // 고정 목록에도 없고 실제 영상도 없으면 기본 추정값으로 폴백
  return `${branchPrefix}${teacherName}T`;
}

// 학년/관/담당쌤 기준 추천 태그 (체크박스 초기값 제안용, 강제 아님)
function recommendTags(grade, branch, teacherName) {
  const byGrade = {
    '고1': ['공통수학1','공통수학2','송팁_공통수학1','송팁_공통수학2','기출_고1_',
            '대수_세쌍둥이라이트'],
    '고2': ['대수_세쌍둥이개념','대수_세쌍둥이심화','대수_세쌍둥이파이널',
            '미적분1','확통','기출_고2_',
            '미적분2_세쌍둥이라이트'],
    '고3': ['미적분2_세쌍둥이개념','미적분2_세쌍둥이심화','미적분2_세쌍둥이파이널',
            '기하','수리논술','기출_고3_'],
    'N수': ['미적분2_세쌍둥이개념','미적분2_세쌍둥이심화','미적분2_세쌍둥이파이널',
            '기하','수리논술','기출_고3_'],
    '중1': ['중1'], '중2': ['중2'], '중3': ['중3'],
  };
  const tags = [...(byGrade[grade] || [])];
  const teacherTag = findTeacherTag(branch, teacherName);
  if (teacherTag) tags.push(teacherTag);
  return tags;
}

// 체크박스 목록 렌더링
function renderTagChecklist(containerId, checkedTags) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const checked = new Set(checkedTags || []);
  el.innerHTML = getTagCategories().map(cat => `
    <div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--purple, #5B3FA6);margin-bottom:4px;">${cat.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${cat.tags.map(t => `
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--off-white);cursor:pointer;text-transform:none;letter-spacing:0;">
            <input type="checkbox" class="${containerId}-tag" value="${t.v}" ${checked.has(t.v) ? 'checked' : ''} style="accent-color:var(--gold);width:14px;height:14px;">
            ${t.l}
          </label>`).join('')}
      </div>
    </div>`).join('');
}

function collectCheckedTags(containerId) {
  return [...document.querySelectorAll(`.${containerId}-tag:checked`)].map(c => c.value);
}

// 추천 태그 자동 선택 버튼
window.applyRecommendedTags = function(prefix) {
  const grade = document.getElementById(prefix + '-grade').value;
  const branch = document.getElementById(prefix + '-branch').value;
  const teacherUid = document.getElementById(prefix + '-teacher').value;
  const teacherName = teacherUid ? (teachersCache.find(t => t.id === teacherUid)?.name || '') : '';
  const rec = new Set(recommendTags(grade, branch, teacherName));
  document.querySelectorAll(`.${prefix}-tagChecklist-tag`).forEach(c => { c.checked = rec.has(c.value); });
};

let studentsCache = [];
let videosCache = [];
window.videosCache = videosCache;

function resetLoginBtn() {
  const btn = document.getElementById('a-loginBtn');
  if (btn) { btn.textContent = '로그인'; btn.disabled = false; }
}
// 로그인은 통합 로그인 페이지(login.html)에서 — 로그인 안 된 상태로 들어오면 그쪽으로 이동
function showLogin()  { document.getElementById('portalScreen').style.display='none'; resetLoginBtn(); location.replace('login.html'); }
function showPortal() { document.getElementById('loginScreen').style.display='none';  document.getElementById('portalScreen').style.display='block'; }

// 관리자 확인
onAuthStateChanged(auth, async (user) => {
  if (!user) { showLogin(); return; }
  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (!adminDoc.exists()) {
      // 같은 브라우저에서 선생님/학생 페이지에 로그인돼 있던 세션이 넘어온 경우:
      // 에러를 띄우거나 로그아웃시키지 않고 조용히 로그인 화면만 보여줌
      // (여기서 로그아웃하면 다른 탭의 선생님 페이지까지 같이 로그아웃됨)
      if (window.__adminLoginAttempt) {
        const err = document.getElementById('a-err');
        err.textContent = '관리자 권한이 없는 계정입니다.';
        err.style.display = 'block';
        window.__adminLoginAttempt = false;
        await signOut(auth);
      }
      showLogin();
      return;
    }
    window.__adminLoginAttempt = false;
    document.getElementById('adminName').textContent = user.email;
    // 역할·메뉴 노출 (admin/js/nav.js) — admins 문서의 role('master'|'office') · menuGroups[]
    window.currentAdmin = { uid: user.uid, email: user.email, ...adminDoc.data() };
    window.dispatchEvent(new CustomEvent('admin:profile'));
    showPortal();
    await loadStudents();
    await loadVideos();
    await loadGroupNames();
    renderFolderAccordion();
    await loadTeachers();
    renderTagChecklist('n-tagChecklist', []);
    setupExcelDrop();
    setupTeacherExcelDrop();
    // 기본 데이터 준비 끝 → 홈 대시보드(admin/js/home.js) · 주소의 #메뉴 열기(admin/js/nav.js)
    window.dispatchEvent(new CustomEvent('admin:ready'));
  } catch(e) {
    console.error('관리자 확인 중 오류:', e);
    const err = document.getElementById('a-err');
    err.textContent = '관리자 확인 중 오류가 발생했습니다: ' + e.code + ' / ' + e.message;
    err.style.display = 'block';
    showLogin();
  }
});

// ── 엔터키 로그인 ──
['a-email','a-pw'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.loginAdmin();
  });
});

// 관리자 로그인
window.loginAdmin = async function() {
  const email = document.getElementById('a-email').value.trim();
  const pw    = document.getElementById('a-pw').value;
  const err   = document.getElementById('a-err');
  const btn   = document.getElementById('a-loginBtn');
  if (!email || !pw) { err.textContent = '이메일과 비밀번호를 입력해주세요.'; err.style.display='block'; return; }
  btn.textContent = '로그인 중...'; btn.disabled = true;
  err.style.display = 'none';
  window.__adminLoginAttempt = true;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch(e) {
    window.__adminLoginAttempt = false;
    err.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.'; err.style.display='block';
    btn.textContent = '로그인'; btn.disabled = false;
  }
};

window.switchTab = (id, btn) => {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
};

window.doLogout = async () => { await signOut(auth); };

