/* 송우찬수학학원 앱(PWA)
 * - 설치 버튼/링크에 data-pwa-install 속성만 붙이면 앱스토어 같은 설치 화면이 뜸
 *   · 안드로이드 크롬·PC 크롬/엣지: 실제 설치 → 설치 진행 애니메이션 → 완료
 *   · 아이폰: 버전에 맞는 홈 화면 추가 안내 + 눌러야 할 위치를 화살표로 표시
 *   · 카카오톡: 외부 브라우저로 자동 전환 / 그 밖의 앱 안 브라우저: 다른 브라우저로 여는 법 안내
 * - 앱으로 실행 중일 때: 시작 로딩 화면(로고) 정리, 화면 이동 시 위쪽 로딩 바, 첫 실행 환영 인사
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
  var isIPhone = /iPhone|iPod/i.test(ua);
  var isAndroid = /Android/i.test(ua);
  var isKakao = /KAKAOTALK/i.test(ua);
  var isInApp = isKakao || /NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|BAND\/|wv\)/i.test(ua);
  var isSamsung = /SamsungBrowser/i.test(ua);
  var isIOSChrome = isIOS && /CriOS/i.test(ua);
  var isIOSOtherBrowser = isIOS && /FxiOS|EdgiOS|Whale|NAVER/i.test(ua);
  var safariVer = (function () { var m = ua.match(/Version\/(\d+)/); return m ? parseInt(m[1], 10) : 0; })();
  var isNewIOSSafari = isIOS && !isIOSChrome && safariVer >= 26; // iOS 26부터 공유 버튼이 ⋯ 메뉴 안으로 들어감

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  }

  var ICON = '/assets/icons/apple-touch-icon.png';
  var PROFILE_URL = 'https://asia-northeast3-songmath.cloudfunctions.net/appProfile';
  // 설치 파일은 학원 서버 함수(appProfile)에서 올바른 형식으로 내려줌 (깃허브는 형식 지정 불가)
  var USE_PROFILE = true;
  var deferredPrompt = null;

  // ── 스타일 ──
  var css = '' +
    /* 첫 화면 설치 버튼 (앱 배지 모양) */
    '.pwa-install-btn{display:inline-flex;align-items:center;gap:12px;margin:0 0 24px;padding:10px 22px 10px 10px;border-radius:16px;' +
    'background:linear-gradient(135deg,#5B3FA6,#3E2A7E);color:#fff;border:0;font-family:inherit;cursor:pointer;text-decoration:none;text-align:left;' +
    'box-shadow:0 8px 24px rgba(75,51,145,.35),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .15s,box-shadow .15s}' +
    '.pwa-install-btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(75,51,145,.42),inset 0 1px 0 rgba(255,255,255,.18)}' +
    '.pwa-install-btn:active{transform:scale(.97)}' +
    '.pwa-install-btn img{width:44px;height:44px;border-radius:11px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}' +
    '.pwa-install-btn .pwa-t{display:flex;flex-direction:column;line-height:1.25}' +
    '.pwa-install-btn .pwa-t small{font-size:11px;font-weight:600;color:#F5C518;letter-spacing:.2px}' +
    '.pwa-install-btn .pwa-t b{font-size:15.5px;font-weight:800;letter-spacing:-.4px}' +
    '.pwa-install-btn .pwa-dl{margin-left:6px;width:30px;height:30px;border-radius:50%;background:#F5C518;color:#2A1E55;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900}' +
    '.pwa-hidden{display:none!important}' +

    /* 공통 바탕 */
    '.pwa-ov{position:fixed;inset:0;z-index:100000;background:rgba(20,14,40,.55);display:flex;align-items:flex-end;justify-content:center;padding:12px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;animation:pwaFade .2s;-webkit-tap-highlight-color:transparent}' +
    '.pwa-ov.top{align-items:flex-start;padding-top:max(16px,env(safe-area-inset-top))}' +
    '@media(min-width:600px){.pwa-ov{align-items:center}}' +
    '.pwa-sheet{position:relative;background:#fff;color:#1E1838;width:100%;max-width:420px;border-radius:24px;padding:22px 20px 18px;box-shadow:0 24px 70px rgba(0,0,0,.3);animation:pwaUp .3s cubic-bezier(.2,.9,.3,1.2)}' +
    '.pwa-ov.top .pwa-sheet{animation:pwaDown .3s cubic-bezier(.2,.9,.3,1.2)}' +
    '.pwa-x{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(30,24,56,.07);color:#6B6489;font-size:15px;cursor:pointer}' +

    /* 앱스토어 카드 */
    '.pwa-app{display:flex;gap:14px;align-items:center;padding-right:28px}' +
    '.pwa-iconwrap{position:relative;width:76px;height:76px;flex-shrink:0}' +
    '.pwa-iconwrap img{width:76px;height:76px;border-radius:18px;box-shadow:0 4px 14px rgba(0,0,0,.15);display:block;transition:transform .3s,filter .3s}' +
    '.pwa-ring{position:absolute;inset:-7px;width:90px;height:90px;transform:rotate(-90deg);opacity:0;transition:opacity .2s}' +
    '.pwa-ring circle{fill:none;stroke-width:4;stroke-linecap:round}' +
    '.pwa-ring .bg{stroke:rgba(91,63,166,.15)}.pwa-ring .fg{stroke:#5B3FA6;stroke-dasharray:264;stroke-dashoffset:264}' +
    '.pwa-installing .pwa-ring{opacity:1}.pwa-installing .pwa-iconwrap img{transform:scale(.86);filter:brightness(.92)}' +
    '.pwa-check{position:absolute;right:-6px;bottom:-6px;width:28px;height:28px;border-radius:50%;background:#22B07D;color:#fff;font-size:16px;font-weight:900;display:none;align-items:center;justify-content:center;box-shadow:0 0 0 3px #fff;animation:pwaPop .4s cubic-bezier(.2,.9,.3,1.5)}' +
    '.pwa-done .pwa-check{display:flex}.pwa-done .pwa-ring{opacity:0}.pwa-done .pwa-iconwrap img{transform:none;filter:none}' +
    '.pwa-name b{display:block;font-size:19px;font-weight:800;letter-spacing:-.5px}' +
    '.pwa-name span{display:block;font-size:13px;color:#6B6489;margin-top:2px}' +
    '.pwa-meta{display:flex;margin:18px 0 16px;border-top:1px solid rgba(30,24,56,.08);border-bottom:1px solid rgba(30,24,56,.08);padding:10px 0}' +
    '.pwa-meta div{flex:1;text-align:center;font-size:11px;color:#8E88A8;line-height:1.35}' +
    '.pwa-meta div+div{border-left:1px solid rgba(30,24,56,.08)}' +
    '.pwa-meta b{display:block;font-size:14.5px;color:#1E1838;font-weight:800}' +
    '.pwa-feat{list-style:none;margin:0 0 18px;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.pwa-feat li{background:#F5F2FC;border-radius:12px;padding:10px 11px;font-size:12.5px;font-weight:600;color:#3E2A7E;line-height:1.35;word-break:keep-all}' +
    '.pwa-feat li span{display:block;font-size:18px;margin-bottom:3px}' +
    '.pwa-go{width:100%;padding:15px;border:0;border-radius:14px;background:#5B3FA6;color:#fff;font-size:16px;font-weight:800;font-family:inherit;cursor:pointer;letter-spacing:-.3px;transition:background .2s,transform .1s}' +
    '.pwa-go:active{transform:scale(.98)}' +
    '.pwa-go[disabled]{background:#B9ADDB;cursor:default}' +
    '.pwa-go.ok{background:#F5C518;color:#2A1E55}' +
    '.pwa-status{text-align:center;font-size:13px;color:#6B6489;margin:-6px 0 12px;min-height:18px}' +

    /* 안내 단계 */
    '.pwa-h{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-right:28px}' +
    '.pwa-h img{width:48px;height:48px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.12)}' +
    '.pwa-h b{display:block;font-size:17px;letter-spacing:-.4px}.pwa-h span{font-size:12.5px;color:#6B6489}' +
    '.pwa-steps{list-style:none;margin:0 0 16px;padding:0;counter-reset:s}' +
    '.pwa-steps li{counter-increment:s;position:relative;display:block;font-size:14.5px;line-height:1.6;padding:10px 0 10px 34px;border-top:1px solid rgba(30,24,56,.07);word-break:keep-all}' +
    '.pwa-steps li:before{content:counter(s);position:absolute;left:0;top:11px;width:24px;height:24px;border-radius:50%;background:#5B3FA6;color:#fff;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:center}' +
    '.pwa-steps em{font-style:normal;font-weight:800;color:#5B3FA6}' +
    '.pwa-key{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 6px;margin:0 2px;border-radius:8px;background:#F0EEF8;border:1px solid rgba(91,63,166,.18);vertical-align:-7px;font-weight:800;color:#2F7BF6}' +
    '.pwa-key svg{width:18px;height:18px}' +
    '.pwa-note{font-size:12px;color:#6B6489;margin:-4px 0 14px;line-height:1.55;word-break:keep-all}' +

    /* 아이폰: 눌러야 할 위치 화살표 */
    '.pwa-point{position:fixed;z-index:100001;bottom:calc(env(safe-area-inset-bottom) + 6px);transform:translateX(-50%);pointer-events:none}' +
    '.pwa-point-in{display:flex;flex-direction:column;align-items:center;animation:pwaBounce 1s ease-in-out infinite}' +
    '.pwa-point b{background:#F5C518;color:#2A1E55;font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap}' +
    '.pwa-point i{width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:16px solid #F5C518;margin-top:-1px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.2))}' +

    /* 알림 */
    '.pwa-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);z-index:100002;background:#1E1838;color:#fff;padding:13px 18px;border-radius:14px;font-size:14px;font-weight:600;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:calc(100% - 32px);text-align:center;animation:pwaUp .3s;word-break:keep-all}' +

    /* 앱 실행 중: 화면 이동 로딩 바 */
    '#pwaNavBar{position:fixed;top:0;left:0;height:3px;width:0;z-index:100003;background:linear-gradient(90deg,#F5C518,#FFDF6B);box-shadow:0 0 8px rgba(245,197,24,.7);transition:width 8s cubic-bezier(.1,.7,.2,1),opacity .3s;pointer-events:none}' +
    'html.pwa-app-mode{-webkit-tap-highlight-color:transparent}' +

    '@keyframes pwaFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes pwaUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}' +
    '@keyframes pwaDown{from{transform:translateY(-30px);opacity:0}to{transform:none;opacity:1}}' +
    '@keyframes pwaPop{from{transform:scale(0)}to{transform:scale(1)}}' +
    '@keyframes pwaBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}';
  var st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var svgShare = '<svg viewBox="0 0 24 24" fill="none" stroke="#2F7BF6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
  var keyShare = '<span class="pwa-key">' + svgShare + '</span>';
  var keyMore = '<span class="pwa-key">⋯</span>';
  var keyDots = '<span class="pwa-key" style="color:#1E1838">⋮</span>';

  // ── 공통 도구 ──
  function overlay(top) {
    var ov = document.createElement('div');
    ov.className = 'pwa-ov' + (top ? ' top' : '');
    ov.addEventListener('click', function (e) { if (e.target === ov) close(ov); });
    document.body.appendChild(ov);
    return ov;
  }
  function close(ov) {
    if (!ov || !ov.parentNode) return;
    ov.remove();
    var p = document.querySelector('.pwa-point');
    if (p) p.remove();
  }
  function toast(msg, ms) {
    var t = document.createElement('div');
    t.className = 'pwa-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3500);
  }
  function hideButtons() {
    document.querySelectorAll('[data-pwa-install]').forEach(function (el) { el.classList.add('pwa-hidden'); });
  }

  // ── 앱스토어 같은 설치 화면 ──
  function openInstallSheet() {
    var ov = overlay(false);
    ov.innerHTML =
      '<div class="pwa-sheet" role="dialog" aria-modal="true">' +
        '<button class="pwa-x" type="button" aria-label="닫기">✕</button>' +
        '<div class="pwa-app">' +
          '<div class="pwa-iconwrap"><img src="' + ICON + '" alt="">' +
            '<svg class="pwa-ring" viewBox="0 0 90 90"><circle class="bg" cx="45" cy="45" r="42"/><circle class="fg" cx="45" cy="45" r="42"/></svg>' +
            '<span class="pwa-check">✓</span></div>' +
          '<div class="pwa-name"><b>송우찬수학학원</b><span>평촌 · 산본 수학 전문학원</span></div>' +
        '</div>' +
        '<div class="pwa-meta">' +
          '<div><b>무료</b>가격</div><div><b>교육</b>분류</div><div><b>평촌·산본</b>지점</div><div><b>전체</b>이용가</div>' +
        '</div>' +
        '<ul class="pwa-feat">' +
          '<li><span>🎬</span>동영상강의 바로 보기</li>' +
          '<li><span>📝</span>주간 클리어 한 번에</li>' +
          '<li><span>📱</span>주소창 없는 앱 화면</li>' +
          '<li><span>⚡</span>홈 화면에서 바로 실행</li>' +
        '</ul>' +
        '<p class="pwa-status"></p>' +
        '<button class="pwa-go" type="button">설치</button>' +
      '</div>';
    var sheet = ov.querySelector('.pwa-sheet');
    var go = ov.querySelector('.pwa-go');
    var status = ov.querySelector('.pwa-status');
    ov.querySelector('.pwa-x').onclick = function () { close(ov); };

    go.onclick = function () {
      if (go.classList.contains('ok')) { close(ov); return; }

      // 1) 바로 설치 가능한 브라우저 (안드로이드 크롬, PC 크롬·엣지 등)
      if (deferredPrompt) {
        var p = deferredPrompt;
        deferredPrompt = null;
        go.disabled = true;
        go.textContent = '설치 준비 중…';
        p.prompt();
        p.userChoice.then(function (r) {
          if (r && r.outcome === 'accepted') runProgress(sheet, go, status, {});
          else close(ov);
        }).catch(function () { close(ov); });
        return;
      }
      // 2) 카카오톡 → 외부 브라우저로
      if (isKakao) {
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
        close(ov);
        return;
      }
      // 3) 아이폰·아이패드 사파리 → 설치 파일(설정 프로파일) 내려받기
      if (USE_PROFILE && isIOS && !isInApp && !isIOSChrome && !isIOSOtherBrowser) {
        location.href = PROFILE_URL;
        go.disabled = true;
        runProgress(sheet, go, status, {
          dur: 2200,
          working: '내려받는 중…',
          workingStatus: '설치 파일을 내려받고 있어요',
          onDone: function () { showProfileSteps(ov); }
        });
        return;
      }
      close(ov);
      // 4) 나머지는 기기에 맞는 안내
      if (isInApp) guideInApp();
      else if (isIOS) guideIOS();
      else if (isAndroid) guideAndroid();
      else guideDesktop();
    };
  }

  function runProgress(sheet, go, status, o) {
    var ring = sheet.querySelector('.pwa-ring .fg');
    sheet.classList.add('pwa-installing');
    go.textContent = o.working || '설치 중…';
    status.textContent = o.workingStatus || '앱을 휴대폰에 설치하고 있어요';
    var start = null, dur = o.dur || 2600;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 2.2);
      ring.style.strokeDashoffset = String(264 * (1 - eased));
      if (t < 1) { requestAnimationFrame(step); return; }
      sheet.classList.remove('pwa-installing');
      sheet.classList.add('pwa-done');
      if (o.onDone) { o.onDone(); return; }
      status.textContent = '홈 화면에서 송우찬수학학원 아이콘을 눌러 실행하세요';
      go.disabled = false;
      go.classList.add('ok');
      go.textContent = '설치 완료 ✓';
      hideButtons();
    }
    requestAnimationFrame(step);
  }

  // 아이폰: 설치 파일을 받은 뒤 설정 앱에서 마무리하는 단계
  function showProfileSteps(ov) {
    var sheet = ov.querySelector('.pwa-sheet');
    sheet.style.animation = 'none';
    sheet.innerHTML =
      '<button class="pwa-x" type="button" aria-label="닫기">✕</button>' +
      '<div class="pwa-app" style="margin-bottom:6px">' +
        '<div class="pwa-iconwrap"><img src="' + ICON + '" alt=""><span class="pwa-check" style="display:flex">✓</span></div>' +
        '<div class="pwa-name"><b>내려받기 완료</b><span>이제 설정에서 「설치」만 누르면 끝!</span></div>' +
      '</div>' +
      '<ol class="pwa-steps" style="margin-top:14px">' +
        '<li>방금 뜬 창에서 <em>허용</em> → <em>닫기</em>를 누르세요</li>' +
        '<li>아이폰 <span class="pwa-key" style="color:#6B6489">⚙️</span> <em>설정</em> 앱을 열고 맨 위 <em>iPhone 설정 제안</em>의 <em>더 보기</em>를 누르세요</li>' +
        '<li><em>프로파일이 다운로드됨</em> 아래 <em>프로파일 보기</em>를 누르세요</li>' +
        '<li>오른쪽 위 <em>설치</em> → 암호 입력 → <em>설치</em>를 누르세요</li>' +
        '<li>홈 화면에 생긴 <em>송우찬수학</em> 아이콘을 누르면 앱이 실행돼요 🎉</li>' +
      '</ol>' +
      '<p class="pwa-note">「서명되지 않음」이라고 보이는 건 학원에서 직접 배포하는 앱이라 그래요. 안심하고 설치하셔도 됩니다. 설정 맨 위에 안 보이면 설정 → 일반 → VPN 및 기기 관리에서 찾을 수 있어요.</p>' +
      '<button class="pwa-go ok" type="button">확인</button>' +
      '<p style="text-align:center;margin:12px 0 0;font-size:12.5px"><a href="' + PROFILE_URL + '" style="color:#5B3FA6;font-weight:700">다시 내려받기</a>' +
      ' <span style="color:#C9C4DA">|</span> <a href="#" class="pwa-alt" style="color:#6B6489">다른 방법으로 설치</a></p>';
    sheet.querySelector('.pwa-x').onclick = function () { close(ov); };
    sheet.querySelector('.pwa-go').onclick = function () { close(ov); };
    sheet.querySelector('.pwa-alt').onclick = function (e) { e.preventDefault(); close(ov); guideIOS(); };
  }

  // ── 기기별 안내 ──
  function guide(top, title, sub, steps, note, btnText) {
    var ov = overlay(top);
    ov.innerHTML =
      '<div class="pwa-sheet" role="dialog" aria-modal="true">' +
        '<button class="pwa-x" type="button" aria-label="닫기">✕</button>' +
        '<div class="pwa-h"><img src="' + ICON + '" alt=""><div><b>' + title + '</b><span>' + sub + '</span></div></div>' +
        '<ol class="pwa-steps">' + steps + '</ol>' +
        (note ? '<p class="pwa-note">' + note + '</p>' : '') +
        '<button class="pwa-go ok" type="button">' + (btnText || '확인') + '</button>' +
      '</div>';
    ov.querySelector('.pwa-x').onclick = function () { close(ov); };
    ov.querySelector('.pwa-go').onclick = function () { close(ov); };
    return ov;
  }

  function pointAt(leftCss, label) {
    // 바깥 상자는 위치만, 안쪽 상자가 위아래로 튀도록 나눔
    var w = document.createElement('div');
    w.className = 'pwa-point';
    w.style.left = leftCss;
    w.innerHTML = '<div class="pwa-point-in"><b>' + label + '</b><i></i></div>';
    document.body.appendChild(w);
  }

  function guideInApp() {
    if (isIOS) {
      guide(false, '사파리에서 열어 주세요', '지금 앱 안의 브라우저라 설치가 안 돼요',
        '<li>화면 아래나 오른쪽 위의 ' + keyMore + ' 또는 ' + keyShare + ' 버튼을 누르세요</li>' +
        '<li><em>Safari로 열기</em>(기본 브라우저로 열기)를 누르세요</li>' +
        '<li>사파리에서 <em>앱 설치</em> 버튼을 다시 눌러 주세요</li>');
    } else {
      guide(false, '크롬에서 열어 주세요', '지금 앱 안의 브라우저라 설치가 안 돼요',
        '<li>오른쪽 위 ' + keyDots + ' 또는 <em>더보기</em> 버튼을 누르세요</li>' +
        '<li><em>다른 브라우저로 열기</em>(Chrome으로 열기)를 누르세요</li>' +
        '<li>크롬에서 <em>앱 설치</em> 버튼을 다시 눌러 주세요</li>');
    }
  }

  function guideIOS() {
    var title = '아이폰에 앱 설치하기';
    var sub = '아래 순서대로 누르면 홈 화면에 앱이 생겨요';
    if (isIOSChrome) {
      guide(true, title, sub,
        '<li>주소창 오른쪽의 공유 버튼 ' + keyShare + ' 을 누르세요</li>' +
        '<li>목록에서 <em>홈 화면에 추가</em>를 누르세요</li>' +
        '<li>오른쪽 위 <em>추가</em>를 누르면 설치 끝!</li>',
        '잘 안 되면 사파리로 www.fanmath.co.kr 에 들어와서 설치해 주세요.', '알겠어요');
      return;
    }
    if (isIOSOtherBrowser) {
      guide(false, '사파리에서 설치해 주세요', '아이폰은 사파리에서 설치가 가장 잘 돼요',
        '<li>사파리를 열고 <em>www.fanmath.co.kr</em> 에 들어가세요</li>' +
        '<li>첫 화면의 <em>앱 설치하기</em> 버튼을 눌러 주세요</li>');
      return;
    }
    if (isNewIOSSafari) {
      guide(true, title, sub,
        '<li>화면 아래 오른쪽의 ' + keyMore + ' 버튼을 누르세요</li>' +
        '<li><em>공유</em> ' + keyShare + ' 를 누르세요</li>' +
        '<li>목록을 위로 올려 <em>홈 화면에 추가</em>를 누르세요</li>' +
        '<li><em>웹 앱으로 열기</em>가 켜져 있는지 보고 <em>추가</em>를 누르면 끝!</li>',
        '노란 화살표가 가리키는 곳부터 눌러 주세요.', '알겠어요');
      if (isIPhone) pointAt('calc(100% - 42px)', '여기 ⋯');
    } else {
      guide(true, title, sub,
        '<li>화면 아래 가운데의 공유 버튼 ' + keyShare + ' 을 누르세요</li>' +
        '<li>목록을 위로 올려 <em>홈 화면에 추가</em>를 누르세요</li>' +
        '<li>오른쪽 위 <em>추가</em>를 누르면 설치 끝!</li>',
        '아래 버튼이 안 보이면 화면을 살짝 아래로 내려 보세요.', '알겠어요');
      if (isIPhone) pointAt('50%', '여기를 누르세요');
    }
  }

  function guideAndroid() {
    if (isSamsung) {
      guide(false, '휴대폰에 앱 설치하기', '홈 화면에 송우찬수학학원 앱이 생겨요',
        '<li>화면 아래 <span class="pwa-key" style="color:#1E1838">≡</span> 메뉴를 누르세요</li>' +
        '<li><em>현재 페이지 추가</em> → <em>홈 화면</em>을 누르세요</li>' +
        '<li><em>추가</em>를 누르면 설치 끝!</li>');
    } else {
      guide(false, '휴대폰에 앱 설치하기', '홈 화면에 송우찬수학학원 앱이 생겨요',
        '<li>크롬 오른쪽 위 ' + keyDots + ' 버튼을 누르세요</li>' +
        '<li><em>앱 설치</em> 또는 <em>홈 화면에 추가</em>를 누르세요</li>' +
        '<li><em>설치</em>를 누르면 끝!</li>',
        '크롬이 아니라면 크롬에서 www.fanmath.co.kr 로 들어와 주세요.');
    }
  }

  function guideDesktop() {
    guide(false, '컴퓨터에 앱 설치하기', '바탕화면·작업표시줄에서 바로 열 수 있어요',
      '<li>크롬 또는 엣지로 홈페이지를 여세요</li>' +
      '<li>주소창 오른쪽 끝의 <em>설치 아이콘</em>을 누르세요</li>' +
      '<li><em>설치</em>를 누르면 끝!</li>',
      '아이콘이 없다면 오른쪽 위 ' + keyDots + ' 메뉴 → <em>앱 설치</em>(또는 저장 및 공유 → 앱 설치)를 눌러 주세요.');
  }

  function onInstallClick(e) {
    e.preventDefault();
    if (isStandalone()) { toast('이미 앱으로 실행 중이에요'); return; }
    var mm = document.getElementById('mobileMenu');
    if (mm && mm.classList.contains('open') && typeof window.toggleMenu === 'function') window.toggleMenu();
    openInstallSheet();
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideButtons();
  });

  // ── 앱으로 실행 중일 때 ──
  function appMode() {
    document.documentElement.classList.add('pwa-app-mode');

    // 시작 로딩 화면 정리 (index.html 머리 부분에서 띄움)
    var splash = document.getElementById('pwaSplash');
    if (splash) {
      var shownAt = window.__pwaSplashAt || Date.now();
      var hide = function () {
        var wait = Math.max(0, 1700 - (Date.now() - shownAt));
        setTimeout(function () {
          splash.classList.add('out');
          document.documentElement.classList.remove('pwa-splashing');
          setTimeout(function () {
            splash.remove();
            welcomeOnce();
          }, 550);
        }, wait);
      };
      if (document.readyState === 'complete') hide();
      else window.addEventListener('load', hide);
    } else {
      welcomeOnce();
    }

    // 화면 이동 시 위쪽 로딩 바
    var bar = document.createElement('div');
    bar.id = 'pwaNavBar';
    document.body.appendChild(bar);
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-pwa-install')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(javascript|tel|mailto|sms|kakaotalk):/i.test(href)) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      bar.style.transition = 'none';
      bar.style.opacity = '1';
      bar.style.width = '0';
      void bar.offsetWidth;
      bar.style.transition = '';
      bar.style.width = '85%';
    }, false);
    window.addEventListener('pageshow', function () {
      bar.style.transition = 'none';
      bar.style.width = '0';
      bar.style.opacity = '0';
    });
  }

  function welcomeOnce() {
    try {
      if (localStorage.getItem('pwaWelcomed')) return;
      localStorage.setItem('pwaWelcomed', '1');
    } catch (e) { return; }
    setTimeout(function () { toast('🎉 송우찬수학학원 앱 설치 완료! 환영합니다', 3800); }, 300);
  }

  function init() {
    if (isStandalone()) {
      hideButtons();
      appMode();
      return;
    }
    document.querySelectorAll('[data-pwa-install]').forEach(function (el) {
      el.addEventListener('click', onInstallClick);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
