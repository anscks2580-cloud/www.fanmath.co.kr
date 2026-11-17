/* ═══════════════════════════════════════════════════════════
   송우찬수학학원 정식 앱(앱스토어·플레이스토어) 연결 — 2026.11
   · 정식 앱은 이 홈페이지 화면을 그대로 불러와서 보여줌 → 홈페이지를 고치면 앱에도 바로 반영
   · 이 파일은 정식 앱 안에서만 동작하고, 인터넷 창·홈 화면 앱(PWA)에서는 아무 일도 하지 않음
   · 하는 일
       1) 정식 앱인지 알려줌 (window.SWCNative.is)
       2) 휴대폰 기본 알림 켜기·알림 주소(토큰) 받기 — 학생 앱(app.html)·학부모 페이지(parent.html)가 사용
       3) 알림을 누르면 해당 화면으로 이동, 앱을 보는 중에 온 알림은 화면에 알려줌(swc-push 신호)
   ═══════════════════════════════════════════════════════════ */
(function () {
  var C = window.Capacitor;
  var byUA = /SongmathApp/.test(navigator.userAgent || '');   // 정식 앱은 사용자 정보 끝에 SongmathApp 이 붙음 (capacitor.config appendUserAgent)
  var is = byUA || !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  var platform = is ? ((C && C.getPlatform && C.getPlatform() !== 'web') ? C.getPlatform() : (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'android')) : 'web';
  function plugin() {
    if (!is) return null;
    C = window.Capacitor;
    if (!C) return null;
    try { return (C.Plugins && C.Plugins.FirebaseMessaging) || (C.registerPlugin ? C.registerPlugin('FirebaseMessaging') : null); } catch (e) { return null; }
  }
  if (is && 'serviceWorker' in navigator) {
    try { navigator.serviceWorker.getRegistrations().then(function (rs) { if (!rs.length) return; Promise.all(rs.map(function (r) { return r.unregister(); })).then(function () { try { if (!sessionStorage.getItem('swcSwCleared')) { sessionStorage.setItem('swcSwCleared', '1'); location.reload(); } } catch (e) {} }); }).catch(function () {}); } catch (e) {}
  }
  if (is) {
    try { document.documentElement.classList.add('swc-native', 'swc-native-' + platform); } catch (e) {}
    try { sessionStorage.setItem('swcNative', '1'); } catch (e) {}
  }

  // 알림 주소(링크)를 이 앱 안의 화면 주소로 바꿈
  function goLink(link) {
    if (!link) return;
    try {
      var u = new URL(link, location.href);
      if (u.hostname.replace(/^www\./, '') !== location.hostname.replace(/^www\./, '')) return;
      location.href = u.pathname + u.search + u.hash;
    } catch (e) {}
  }
  function dataOf(n) { var d = (n && n.data) || {}; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } } return d; }

  var listening = false;
  function listen() {
    var FM = plugin(); if (!FM || listening) return; listening = true;
    try {
      // 알림을 눌러서 앱이 열림 → 그 화면으로
      FM.addListener('notificationActionPerformed', function (ev) {
        var n = (ev && ev.notification) || {}; var d = dataOf(n);
        goLink(d.link || n.link || n.clickAction);
      });
      // 앱을 보는 중에 알림 도착 → 화면에 신호 (학생 앱·학부모 페이지가 새로 불러오고 팝업)
      FM.addListener('notificationReceived', function (ev) {
        var n = (ev && ev.notification) || {}; var d = dataOf(n);
        try { window.dispatchEvent(new CustomEvent('swc-push', { detail: { title: n.title || d.title || '알림', body: n.body || d.body || '', link: d.link || '' } })); } catch (e) {}
      });
    } catch (e) {}
  }

  window.SWCNative = {
    is: is,
    platform: platform,
    // 'granted' | 'denied' | 'prompt' | 'unsupported'
    permission: async function () {
      var FM = plugin(); if (!FM) return 'unsupported';
      try { var p = await FM.checkPermissions(); return p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'prompt'; } catch (e) { return 'unsupported'; }
    },
    // 알림 주소(토큰) — ask=true면 처음 한 번 허용을 물어봄. 허용 안 되면 null
    token: async function (ask) {
      var FM = plugin(); if (!FM) return null;
      var p = await FM.checkPermissions();
      if (p.receive !== 'granted' && ask) p = await FM.requestPermissions();
      if (p.receive !== 'granted') return null;
      listen();
      var r = await FM.getToken();
      return (r && r.token) || null;
    },
    listen: listen,
  };
  if (is) listen();
})();
