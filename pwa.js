/* 송우찬수학학원 앱 설치(PWA)
 * 사용법: 설치 버튼/링크에 data-pwa-install 속성만 붙이면 됨
 *  - 안드로이드 크롬·삼성인터넷·PC 크롬/엣지: 바로 설치 창
 *  - 아이폰·아이패드: 홈 화면에 추가 방법 안내
 *  - 카카오톡: 외부 브라우저로 자동 전환 / 그 밖의 앱 안 브라우저: 다른 브라우저로 여는 방법 안내
 *  - 이미 앱으로 실행 중이면 설치 버튼 자동 숨김
 */
(function () {
  'use strict';

  // ── 서비스워커 등록 ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  }

  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var isKakao = /KAKAOTALK/i.test(ua);
  var isInApp = isKakao || /NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|BAND\/|wv\)/i.test(ua);
  var isSamsung = /SamsungBrowser/i.test(ua);
  var isStandalone = function () {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  };

  var deferredPrompt = null;

  // ── 스타일 ──
  var css = '' +
    '.pwa-install-btn{display:inline-flex;align-items:center;gap:8px;margin:0 0 22px;padding:11px 20px;border-radius:999px;' +
    'background:#fff;color:#5B3FA6;border:1.5px solid rgba(91,63,166,.35);font-size:14px;font-weight:700;letter-spacing:-.3px;' +
    'font-family:inherit;cursor:pointer;text-decoration:none;box-shadow:0 4px 18px rgba(91,63,166,.12);transition:transform .15s,box-shadow .15s}' +
    '.pwa-install-btn:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(91,63,166,.2)}' +
    '.pwa-install-btn img{width:24px;height:24px;border-radius:6px}' +
    '.pwa-install-btn .pwa-sub{font-size:11.5px;font-weight:600;color:#6B6489}' +
    '@media(max-width:400px){.pwa-install-btn .pwa-sub{display:none}}' +
    '.pwa-hidden{display:none!important}' +
    '.pwa-ov{position:fixed;inset:0;z-index:10000;background:rgba(20,14,40,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;' +
    'font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;animation:pwaFade .2s}' +
    '@media(min-width:600px){.pwa-ov{align-items:center}}' +
    '.pwa-box{background:#fff;color:#1E1838;width:100%;max-width:400px;border-radius:20px;padding:26px 22px 20px;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:pwaUp .25s}' +
    '.pwa-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}' +
    '.pwa-head img{width:52px;height:52px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.12)}' +
    '.pwa-head b{display:block;font-size:16.5px;letter-spacing:-.4px}.pwa-head span{font-size:12.5px;color:#6B6489}' +
    '.pwa-steps{list-style:none;margin:0 0 18px;padding:0;counter-reset:s}' +
    '.pwa-steps li{counter-increment:s;position:relative;display:block;font-size:14px;line-height:1.6;padding:9px 0 9px 32px;border-top:1px solid rgba(30,24,56,.07);word-break:keep-all}' +
    '.pwa-steps li:before{content:counter(s);position:absolute;left:0;top:10px;width:22px;height:22px;border-radius:50%;background:#5B3FA6;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}' +
    '.pwa-steps em{font-style:normal;font-weight:700;color:#5B3FA6}' +
    '.pwa-ico{display:inline-block;vertical-align:-4px;width:20px;height:20px}' +
    '.pwa-close{width:100%;padding:13px;border:0;border-radius:12px;background:#F5C518;color:#2A1E55;font-size:14.5px;font-weight:800;font-family:inherit;cursor:pointer}' +
    '.pwa-note{font-size:12px;color:#6B6489;margin:-6px 0 14px;line-height:1.5}' +
    '.pwa-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:10001;background:#1E1838;color:#fff;padding:12px 18px;border-radius:12px;font-size:13.5px;font-family:inherit;box-shadow:0 8px 30px rgba(0,0,0,.25)}' +
    '@keyframes pwaFade{from{opacity:0}to{opacity:1}}@keyframes pwaUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}';
  var st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var shareIcon = '<svg class="pwa-ico" viewBox="0 0 24 24" fill="none" stroke="#2F7BF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
  var dotsIcon = '<b style="font-size:17px;line-height:1">⋮</b>';

  function modal(title, sub, stepsHtml, note) {
    var ov = document.createElement('div');
    ov.className = 'pwa-ov';
    ov.innerHTML =
      '<div class="pwa-box" role="dialog" aria-modal="true">' +
        '<div class="pwa-head"><img src="/assets/icons/apple-touch-icon.png" alt=""><div><b>' + title + '</b><span>' + sub + '</span></div></div>' +
        '<ol class="pwa-steps">' + stepsHtml + '</ol>' +
        (note ? '<p class="pwa-note">' + note + '</p>' : '') +
        '<button class="pwa-close" type="button">확인</button>' +
      '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.classList.contains('pwa-close')) ov.remove(); });
    document.body.appendChild(ov);
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'pwa-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function hideButtons() {
    document.querySelectorAll('[data-pwa-install]').forEach(function (el) { el.classList.add('pwa-hidden'); });
  }

  function guideInApp() {
    if (isIOS) {
      modal('사파리에서 열어 주세요', '지금 앱 안의 브라우저라 설치가 안 돼요',
        '<li>화면 아래나 오른쪽 위의 <em>더보기(⋯ 또는 ' + shareIcon + ')</em> 버튼을 누르세요</li>' +
        '<li><em>Safari로 열기</em>(또는 기본 브라우저로 열기)를 누르세요</li>' +
        '<li>사파리에서 열리면 <em>앱 설치</em> 버튼을 다시 눌러 주세요</li>');
    } else {
      modal('크롬에서 열어 주세요', '지금 앱 안의 브라우저라 설치가 안 돼요',
        '<li>오른쪽 위 ' + dotsIcon + ' 또는 <em>더보기</em> 버튼을 누르세요</li>' +
        '<li><em>다른 브라우저로 열기</em>(또는 Chrome으로 열기)를 누르세요</li>' +
        '<li>크롬에서 열리면 <em>앱 설치</em> 버튼을 다시 눌러 주세요</li>');
    }
  }

  function guideIOS() {
    modal('아이폰에 앱 설치하기', '홈 화면에 송우찬수학학원 아이콘이 생겨요',
      '<li>화면 아래(또는 주소창 옆)의 <em>공유 버튼</em> ' + shareIcon + ' 을 누르세요</li>' +
      '<li>목록을 위로 올려 <em>홈 화면에 추가</em>를 누르세요</li>' +
      '<li>오른쪽 위 <em>추가</em>를 누르면 설치 끝!</li>',
      '사파리에서 하는 것을 권장합니다. 공유 버튼이 안 보이면 화면을 살짝 아래로 내려 보세요.');
  }

  function guideAndroid() {
    if (isSamsung) {
      modal('휴대폰에 앱 설치하기', '홈 화면에 송우찬수학학원 아이콘이 생겨요',
        '<li>화면 아래 <em>메뉴(≡)</em> 버튼을 누르세요</li>' +
        '<li><em>현재 페이지 추가</em> → <em>홈 화면</em>을 누르세요</li>' +
        '<li><em>추가</em>를 누르면 설치 끝!</li>');
    } else {
      modal('휴대폰에 앱 설치하기', '홈 화면에 송우찬수학학원 아이콘이 생겨요',
        '<li>크롬 오른쪽 위 ' + dotsIcon + ' 버튼을 누르세요</li>' +
        '<li><em>앱 설치</em> 또는 <em>홈 화면에 추가</em>를 누르세요</li>' +
        '<li><em>설치</em>를 누르면 끝!</li>',
        '크롬이 아니라면 크롬에서 www.fanmath.co.kr 로 들어와 주세요.');
    }
  }

  function guideDesktop() {
    modal('컴퓨터에 앱 설치하기', '바탕화면·작업표시줄에서 바로 열 수 있어요',
      '<li>크롬 또는 엣지로 홈페이지를 여세요</li>' +
      '<li>주소창 오른쪽 끝의 <em>설치 아이콘(⊕ 또는 모니터 모양)</em>을 누르세요</li>' +
      '<li><em>설치</em>를 누르면 끝!</li>',
      '아이콘이 없다면 오른쪽 위 ' + dotsIcon + ' 메뉴 → <em>앱 설치</em>(또는 저장 및 공유 → 앱 설치)를 눌러 주세요.');
  }

  function onInstallClick(e) {
    e.preventDefault();
    if (isStandalone()) { toast('이미 앱으로 실행 중이에요'); return; }

    if (deferredPrompt) {
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') toast('설치 중이에요. 잠시 뒤 홈 화면을 확인해 주세요');
      }).catch(function () {});
      return;
    }

    if (isKakao) {
      // 카카오톡 → 외부 기본 브라우저로 열기
      location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
      return;
    }
    if (isInApp) { guideInApp(); return; }
    if (isIOS) { guideIOS(); return; }
    if (isAndroid) { guideAndroid(); return; }
    guideDesktop();
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideButtons();
    toast('설치가 완료됐어요! 홈 화면에서 송우찬수학학원을 열어 보세요');
  });

  function init() {
    if (isStandalone()) { hideButtons(); return; }
    document.querySelectorAll('[data-pwa-install]').forEach(function (el) {
      el.addEventListener('click', onInstallClick);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
