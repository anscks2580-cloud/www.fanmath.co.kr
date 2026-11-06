/* ═══════════════════════════════════════════════════════════
   🔖 영상 구간 인덱스 (유튜브 챕터처럼)
   - 영상 문서(Firestore videos/{id})의 chapters = [{ t: 초, label: '1번' }, ...]
   - VideoChapters.mount(넣을 칸, 비메오 iframe, chapters)
       → 영상 아래에 구간 막대 + 번호 버튼을 그리고, 누르면 그 위치로 이동
   - VideoChapters.parse(글) / VideoChapters.format(chapters) : 관리자 입력칸용
       한 줄에 하나:  "0:00 1번"  /  "1번 3:25"  /  "12:40 - 3번 서술형"  /  "1:02:03 7번"
   (videos.html · teacher.html · admin 주간 클리어 공용)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VideoChapters) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 초 → 3:25 / 1:02:03
  function fmt(t) {
    t = Math.max(0, Math.floor(Number(t) || 0));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  // 글 → [{t,label}]  (시간 없는 줄은 건너뜀)
  function parse(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach((line) => {
      const m = line.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
      if (!m) return;
      const t = m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
      let label = (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
        .replace(/^[\s\-–—~|:·,.]+|[\s\-–—~|:·,.]+$/g, '').replace(/\s+/g, ' ').trim();
      if (/^\d{1,3}$/.test(label)) label += '번';
      if (!label) label = fmt(t);
      out.push({ t, label: label.slice(0, 40) });
    });
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  function format(chapters) {
    return (Array.isArray(chapters) ? chapters : []).slice().sort((a, b) => a.t - b.t).map((c) => `${fmt(c.t)} ${c.label}`).join('\n');
  }

  function injectStyle() {
    if (document.getElementById('vc-style')) return;
    const st = document.createElement('style');
    st.id = 'vc-style';
    st.textContent = `
.vc-box{background:#fff;color:#1E1838;border-top:1px solid rgba(30,24,56,0.08);padding:12px 16px 14px;font-family:inherit;text-align:left;}
.vc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:#5B3FA6;margin-bottom:8px;}
.vc-head small{font-weight:500;color:#8A84A3;}
.vc-bar{position:relative;display:flex;gap:2px;height:10px;margin-bottom:10px;cursor:pointer;}
.vc-seg{position:relative;height:100%;background:rgba(91,63,166,0.16);border-radius:3px;overflow:hidden;transition:transform .12s;}
.vc-seg:hover{transform:scaleY(1.5);}
.vc-seg.on{background:rgba(91,63,166,0.28);}
.vc-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:#5B3FA6;}
.vc-tip{position:absolute;bottom:16px;transform:translateX(-50%);background:#1E1838;color:#fff;font-size:11px;padding:3px 8px;border-radius:6px;white-space:nowrap;pointer-events:none;display:none;}
.vc-list{display:flex;flex-wrap:wrap;gap:6px;max-height:132px;overflow-y:auto;}
.vc-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;border:1px solid rgba(91,63,166,0.25);background:#fff;color:#1E1838;font-size:13px;cursor:pointer;font-family:inherit;line-height:1.2;transition:all .15s;}
.vc-chip b{font-weight:700;}
.vc-chip span{font-size:11px;color:#8A84A3;font-family:'SF Mono',Menlo,Consolas,monospace;}
.vc-chip:hover{border-color:#5B3FA6;background:rgba(91,63,166,0.06);}
.vc-chip.on{background:#5B3FA6;border-color:#5B3FA6;color:#fff;}
.vc-chip.on span{color:#F5C518;}
`;
    document.head.appendChild(st);
  }

  // 이전에 붙인 것 정리용
  const mounted = new WeakMap();

  function unmount(box) {
    const old = box && mounted.get(box);
    if (old) { try { old(); } catch (e) {} mounted.delete(box); }
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
  }

  /**
   * @param {HTMLElement} box     인덱스를 넣을 칸 (영상 바로 아래)
   * @param {HTMLIFrameElement} iframe  비메오 iframe
   * @param {Array} chapters      [{t,label}]
   * @param {Object} [opt]        { autoplay: true }  누르면 바로 재생
   */
  function mount(box, iframe, chapters, opt) {
    if (!box) return;
    unmount(box);
    const list = (Array.isArray(chapters) ? chapters : []).filter((c) => c && isFinite(c.t)).slice().sort((a, b) => a.t - b.t);
    if (!list.length || !iframe || !window.Vimeo || !window.Vimeo.Player) return;
    injectStyle();
    opt = opt || {};

    let player;
    try { player = new Vimeo.Player(iframe); } catch (e) { return; }
    let duration = 0, cur = -1, alive = true;

    box.style.display = 'block';
    box.className = (box.className.replace(/\bvc-box\b/g, '') + ' vc-box').trim();
    box.innerHTML = `
      <div class="vc-head"><span>🔖 문제별 해설 바로가기</span><small>번호를 누르면 그 부분으로 이동해요</small></div>
      <div class="vc-bar"></div>
      <div class="vc-list">${list.map((c, i) => `<button type="button" class="vc-chip" data-i="${i}"><b>${esc(c.label)}</b><span>${fmt(c.t)}</span></button>`).join('')}</div>`;
    const bar = box.querySelector('.vc-bar');
    const chips = [...box.querySelectorAll('.vc-chip')];

    function go(i) {
      const c = list[i]; if (!c) return;
      player.setCurrentTime(Math.max(0, c.t)).then(() => {
        if (opt.autoplay !== false) player.play().catch(() => {});
      }).catch(() => {});
      setActive(i);
    }
    chips.forEach((b) => b.addEventListener('click', () => go(+b.dataset.i)));

    function drawBar() {
      if (!duration) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      // 첫 구간 앞(0초 ~ 첫 번호)도 회색 칸으로 표시
      const segs = [];
      if (list[0].t > 1) segs.push({ from: 0, to: list[0].t, i: -1 });
      list.forEach((c, i) => segs.push({ from: c.t, to: i + 1 < list.length ? list[i + 1].t : duration, i }));
      bar.innerHTML = segs.filter((s) => s.to > s.from).map((s) =>
        `<div class="vc-seg" data-i="${s.i}" data-from="${s.from}" data-to="${s.to}" style="flex:${(s.to - s.from).toFixed(2)} 0 0;${s.i < 0 ? 'opacity:.55;' : ''}"><div class="vc-fill"></div></div>`).join('')
        + '<div class="vc-tip"></div>';
      const tip = bar.querySelector('.vc-tip');
      bar.querySelectorAll('.vc-seg').forEach((seg) => {
        const i = +seg.dataset.i;
        seg.addEventListener('mouseenter', () => {
          tip.textContent = i < 0 ? `시작 · ${fmt(0)}` : `${list[i].label} · ${fmt(list[i].t)}`;
          tip.style.left = (seg.offsetLeft + seg.offsetWidth / 2) + 'px'; tip.style.display = 'block';
        });
        seg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
        seg.addEventListener('click', (e) => {
          // 구간 안에서 누른 위치로 이동
          const r = seg.getBoundingClientRect();
          const from = +seg.dataset.from, to = +seg.dataset.to;
          const t = from + (to - from) * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          player.setCurrentTime(t).then(() => { if (opt.autoplay !== false) player.play().catch(() => {}); }).catch(() => {});
        });
      });
    }

    function setActive(i) {
      if (i === cur) return;
      cur = i;
      chips.forEach((b, k) => b.classList.toggle('on', k === i));
      bar.querySelectorAll('.vc-seg').forEach((s) => s.classList.toggle('on', +s.dataset.i === i));
      const on = chips[i];
      if (on) {
        const lst = on.parentElement;
        if (on.offsetTop < lst.scrollTop || on.offsetTop + on.offsetHeight > lst.scrollTop + lst.clientHeight) lst.scrollTop = on.offsetTop - 4;
      }
    }

    function onTime(d) {
      if (!alive) return;
      const sec = d.seconds || 0;
      if (!duration && d.duration) { duration = d.duration; drawBar(); }
      let i = -1;
      for (let k = 0; k < list.length; k++) if (sec >= list[k].t - 0.5) i = k;
      setActive(i);
      bar.querySelectorAll('.vc-seg').forEach((s) => {
        const from = +s.dataset.from, to = +s.dataset.to;
        const p = sec >= to ? 100 : sec <= from ? 0 : (sec - from) / (to - from) * 100;
        s.firstElementChild.style.width = p + '%';
      });
    }

    player.on('timeupdate', onTime);
    player.getDuration().then((d) => { if (alive && d) { duration = d; drawBar(); } }).catch(() => {});
    drawBar();

    mounted.set(box, () => { alive = false; try { player.off('timeupdate', onTime); } catch (e) {} });
  }

  window.VideoChapters = { mount, unmount, parse, format, fmt };
})();
