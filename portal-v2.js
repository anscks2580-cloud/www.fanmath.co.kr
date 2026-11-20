/* ═══════════════════════════════════════════════════════════
   포털 디자인 V2 — 화면 설정(글꼴·글자 크기·굵기) · 메뉴 선택 표시 모션 · 숫자 올라가기
   - 기존 기능 코드는 건드리지 않음 (보이는 모습만 담당)
   - 화면 설정은 이 기기·이 브라우저에만 저장 (관리자/선생님 따로)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement;
  var isTeacher = root.classList.contains('pv2-teacher');
  if (!isTeacher && !root.classList.contains('pv2-admin')) return;

  var KEY = isTeacher ? 'swc_v2_ui_teacher' : 'swc_v2_ui_admin';
  var DEF = { fz: 0.9, ff: 'Gowun Dodum', wt: 'n' };   // 기본: 고운돋움 · 작게
  var S = Object.assign({}, DEF);
  try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}

  function applyVars() {
    root.style.setProperty('--v2-fz', S.fz);
    root.style.setProperty('--v2-ff', '"' + S.ff + '"');
    root.classList.toggle('v2-wt-b', S.wt === 'b');
  }
  applyVars();   // 화면 그리기 전에 먼저 적용 (깜빡임 방지)

  var FONTS = [
    ['Gowun Dodum', '고운돋움 (기본)'],
    ['Pretendard', '프리텐다드'],
    ['Noto Sans KR', '본고딕'],
    ['Nanum Gothic', '나눔고딕'],
    ['Nanum Myeongjo', '나눔명조'],
  ];
  var SIZES = [[0.9, '작게'], [1, '보통'], [1.12, '크게'], [1.25, '아주 크게']];

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    /* 배경 빛 번짐 */
    ['a', 'b'].forEach(function (c) { var o = document.createElement('div'); o.className = 'v2-orb ' + c; document.body.appendChild(o); });

    /* ── 화면 설정 창 ── */
    var p = document.createElement('div');
    p.className = 'v2-setp'; p.id = 'v2Setp';
    p.innerHTML =
      '<h4>⚙️ 화면 설정<button type="button" data-x>×</button></h4>' +
      '<span class="lb">글자 크기</span>' +
      '<div class="steps">' + SIZES.map(function (s) { return '<button type="button" class="opt" data-fz="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
      '<div class="rw"><input type="range" min="80" max="140" step="1" data-range><span class="val" data-val></span></div>' +
      '<span class="lb">글꼴</span>' +
      '<div class="fonts">' + FONTS.map(function (f) { return '<button type="button" class="opt" data-ff="' + f[0] + '" style="font-family:\'' + f[0] + '\'">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<span class="lb">글자 굵기</span>' +
      '<div class="steps" style="grid-template-columns:1fr 1fr"><button type="button" class="opt" data-wt="n">보통</button><button type="button" class="opt" data-wt="b">굵게</button></div>' +
      '<div class="prev">미리보기 — 송우찬수학학원 평촌관 · 산본관 123</div>' +
      '<button type="button" class="reset" data-reset>처음 설정으로 되돌리기</button>';
    document.body.appendChild(p);

    function sync(save) {
      applyVars();
      p.querySelectorAll('[data-fz]').forEach(function (b) { b.classList.toggle('on', Math.abs(+b.dataset.fz - S.fz) < 0.001); });
      p.querySelectorAll('[data-ff]').forEach(function (b) { b.classList.toggle('on', b.dataset.ff === S.ff); });
      p.querySelectorAll('[data-wt]').forEach(function (b) { b.classList.toggle('on', b.dataset.wt === S.wt); });
      p.querySelector('[data-range]').value = Math.round(S.fz * 100);
      p.querySelector('[data-val]').textContent = Math.round(S.fz * 100) + '%';
      if (save) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
      setTimeout(moveInd, 30);
    }
    p.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) { p.classList.remove('on'); return; }
      if (b.hasAttribute('data-reset')) { S = Object.assign({}, DEF); sync(true); return; }
      if (b.dataset.fz) S.fz = +b.dataset.fz;
      if (b.dataset.ff) S.ff = b.dataset.ff;
      if (b.dataset.wt) S.wt = b.dataset.wt;
      sync(true);
    });
    p.querySelector('[data-range]').addEventListener('input', function (e) { S.fz = e.target.value / 100; sync(true); });

    var right = document.querySelector('nav.ad-top .ad-top-right');
    if (right) {
      var g = document.createElement('button');
      g.type = 'button'; g.className = 'v2-setbtn'; g.title = '화면 설정 (글꼴 · 글자 크기)'; g.textContent = '⚙️';
      g.addEventListener('click', function (e) { e.stopPropagation(); p.classList.toggle('on'); });
      right.insertBefore(g, right.firstChild);
    }
    document.addEventListener('click', function (e) { if (p.classList.contains('on') && !p.contains(e.target)) p.classList.remove('on'); });
    sync(false);

    /* ── 사이드바: 선택 표시가 미끄러지듯 이동 ── */
    var groups = document.querySelector('.ad-side .ad-groups');
    var ind = null;
    function pickActive() {
      if (!groups) return null;
      var all = groups.querySelectorAll('.ad-item.active');
      for (var i = 0; i < all.length; i++) if (!all[i].closest('.ad-recent') && all[i].offsetParent) return all[i];
      for (var j = 0; j < all.length; j++) if (all[j].offsetParent) return all[j];
      return null;
    }
    function offsetIn(el) {
      var t = 0, l = 0, n = el;
      while (n && n !== groups) { t += n.offsetTop; l += n.offsetLeft; n = n.offsetParent; }
      return n === groups ? { t: t, l: l } : null;
    }
    function moveInd() {
      if (!ind) return;
      var a = pickActive(), o = a && offsetIn(a);
      if (!o) { ind.style.opacity = 0; root.classList.remove('v2-ind-on'); return; }
      ind.style.top = o.t + 'px'; ind.style.left = o.l + 'px';
      ind.style.width = a.offsetWidth + 'px'; ind.style.height = a.offsetHeight + 'px';
      ind.style.opacity = 1; root.classList.add('v2-ind-on');
    }
    if (groups) {
      ind = document.createElement('div'); ind.className = 'v2-ind';
      groups.insertBefore(ind, groups.firstChild);
      var mt = null;
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) if (list[i].target === ind) return;
        clearTimeout(mt); mt = setTimeout(function () {
          if (ind.parentNode !== groups) groups.insertBefore(ind, groups.firstChild);   // 메뉴를 다시 그려도 표시 유지
          moveInd();
        }, 20);
      }).observe(groups, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
      window.addEventListener('resize', moveInd);
      setTimeout(moveInd, 300);
    }

    /* ── 홈 숫자: 0부터 올라가기 (숫자만 있는 칸, 처음 한 번) ── */
    function countUp(el) {
      if (el.dataset.v2c) return;
      var txt = (el.textContent || '').trim();
      if (!/^\d{1,6}$/.test(txt)) return;
      el.dataset.v2c = '1';
      var to = +txt; if (to === 0) return;
      var t0 = performance.now(), dur = 900, last = txt;
      (function f(t) {
        if (!el.isConnected || el.textContent !== last) return;   // 다른 코드가 숫자를 바꾸면 즉시 멈춤
        var pr = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - pr, 3);
        last = pr < 1 ? String(Math.round(to * e)) : txt;
        el.textContent = last;
        if (pr < 1) requestAnimationFrame(f);
      })(t0);
    }
    var home = document.getElementById('tab-home');
    if (home && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var ht = null;
      new MutationObserver(function () {
        clearTimeout(ht); ht = setTimeout(function () { home.querySelectorAll('.hm-stat .n').forEach(countUp); }, 30);
      }).observe(home, { subtree: true, childList: true });
    }
  });
})();
