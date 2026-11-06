// ══════════════════════════════════════
// 로그인 4시간 제한 — 관리자·선생님·조교·원장 화면 공용
// - 로그인한 시각(Firebase 계정의 마지막 로그인 시각)부터 4시간이 지나면 자동 로그아웃
// - 페이지를 열어둔 채로 4시간이 지나도 로그아웃되고, 다음에 들어올 때는 무조건 다시 로그인
// - 학생은 원래대로 브라우저를 닫으면 로그아웃, 학부모(앱)는 로그인 유지 — 이 파일과 무관
// - 휴대폰에 설치한 학원 앱(홈 화면 아이콘)으로 연 경우에는 시간 제한 없이 로그인 유지 (개인 휴대폰이라서)
// 사용: 각 페이지 onAuthStateChanged 안에서
//   if (window.swcSessionGuard && swcSessionGuard(user, () => signOut(auth))) return;
//   → 만료됐으면 로그아웃을 시작하고 true를 돌려줌 (이후 처리는 각 페이지의 로그아웃 흐름이 그대로 함)
// ══════════════════════════════════════
(function () {
  var MAX = 4 * 60 * 60 * 1000;   // 4시간
  var current = null;             // { user, signOut }

  function signedAt(user) {
    var t = Date.parse((user && user.metadata && user.metadata.lastSignInTime) || '');
    return isNaN(t) ? 0 : t;
  }
  function left(user) { return signedAt(user) + MAX - Date.now(); }

  function expire(withAlert) {
    var c = current;
    if (!c) return;
    current = null;
    clearTimeout(window.__swcSessionT);
    try { sessionStorage.setItem('swc_session_expired', '1'); } catch (e) {}
    if (withAlert) alert('로그인한 지 4시간이 지나 자동으로 로그아웃되었습니다.\n다시 로그인해 주세요.');
    Promise.resolve().then(c.signOut).catch(function () {});
  }

  function check() {
    if (!current) return;
    var l = left(current.user);
    if (l <= 0) { expire(true); return; }
    clearTimeout(window.__swcSessionT);
    window.__swcSessionT = setTimeout(check, Math.min(l + 500, 60000));
  }

  window.SWC_SESSION_MAX = MAX;
  window.swcSessionLeft = left;
  window.swcSessionGuard = function (user, doSignOut) {
    clearTimeout(window.__swcSessionT);
    current = null;
    var inApp = false;
    try { inApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) {}
    if (inApp) return false; // 앱에서는 자동 로그아웃 안 함
    if (!user || user.isAnonymous) return false;
    current = { user: user, signOut: doSignOut };
    if (left(user) <= 0) { expire(false); return true; }
    check();
    return false;
  };

  // 다른 창을 보다가 돌아오거나 컴퓨터가 절전에서 깨어났을 때 바로 확인
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
})();
