'use strict';
/* ═══════════════════════════════════════════════════════════
   📕 교재 표지 · 안내문 편집
   - 배경(글자를 지운 표지 이미지)은 그대로 두고, 그 위의 글자만 수정·추가·삭제
   - 배경 이미지: assets/covers/ (교재 종류를 늘릴 때 COVER_TEMPLATES에 한 덩어리 추가)
   - 저장: Firestore coverDesigns/{id}
       { template, name, branch('공용'|'평촌관'|'산본관'), pages:{ front:[...], back:[...] },
         updatedAt, updatedBy }
     (coverDesigns는 firestore.rules의 "그 외 컬렉션 = 관리자만" 규칙으로 보호 → 규칙 수정 필요 없음)
   - 내려받기: 면별 PNG(원본의 2배 해상도) · 앞+뒤 PDF(A4)
   - 글자 안에서 [ ]로 감싼 부분은 강조색(+굵게 선택)으로 그려짐
   ═══════════════════════════════════════════════════════════ */
(function () {
  const W = 1191, H = 1684;           // 표지 기준 크기 (A4 비율)
  const EXPORT_SCALE = 2;             // 내려받기 해상도 배수
  const COL = 'coverDesigns';

  const FONTS = [
    'Noto Sans KR', 'Noto Serif KR', 'Jua', 'Gowun Dodum', 'Gowun Batang', 'Do Hyeon', 'Black Han Sans',
    'Song Myung', 'Nanum Gothic', 'Nanum Myeongjo', 'Nanum Pen Script', 'Gothic A1', 'IBM Plex Sans KR', 'Hahmlet', 'Sunflower',
  ];
  const FONT_CSS = 'https://fonts.googleapis.com/css2?' + [
    'Noto+Sans+KR:wght@300;400;500;700;900', 'Noto+Serif+KR:wght@400;500;700;900', 'Jua', 'Gowun+Dodum', 'Gowun+Batang:wght@400;700',
    'Do+Hyeon', 'Black+Han+Sans', 'Song+Myung', 'Nanum+Gothic:wght@400;700;800', 'Nanum+Myeongjo:wght@400;700;800', 'Nanum+Pen+Script',
    'Gothic+A1:wght@300;400;500;700;900', 'IBM+Plex+Sans+KR:wght@300;400;500;700', 'Hahmlet:wght@300;400;500;700;900', 'Sunflower:wght@300;500;700',
  ].map((f) => 'family=' + f).join('&') + '&display=swap';

  // ── 교재(표지) 종류 ──
  const COVER_TEMPLATES = {
    sucal: {
      label: '기출문제 변형 교재 · 수컬',
      pages: {
        front: { label: '앞표지', bg: 'assets/covers/sucal-front.jpg' },
        back:  { label: '뒤표지', bg: 'assets/covers/sucal-back.jpg' },
      },
      images: { sucal_title: { src: 'assets/covers/sucal-title.png', label: '수컬 로고 글자', w: 357, h: 230 } },
      defaults: {
        front: [
          { type: 'image', key: 'sucal_title', x: 735, y: 103, w: 357, h: 230, rot: 0 },
          { type: 'text', text: '[수]학점수 수직상승 에스[컬]레이터', x: 265, y: 279, align: 'left', font: 'Jua', size: 32, weight: 400, color: '#3d5c9a', accent: '#1e2b3b', accentBold: false, ls: 0, lh: 1.3, rot: 0 },
          { type: 'text', text: '기말고사대비', x: 1113, y: 634, align: 'right', font: 'Noto Sans KR', size: 30, weight: 400, color: '#1f1f1f', accent: '#1f1f1f', accentBold: true, ls: 0, lh: 1.3, rot: 0 },
          { type: 'text', text: '고등', x: 932, y: 747, align: 'right', font: 'Noto Sans KR', size: 44, weight: 500, color: '#1a1a1a', accent: '#1a1a1a', accentBold: true, ls: 0, lh: 1.3, rot: 0 },
          { type: 'text', text: '2·2', x: 933, y: 676, align: 'left', font: 'Noto Sans KR', size: 146, weight: 400, color: '#1a1a1a', accent: '#1a1a1a', accentBold: true, ls: -4, lh: 1.2, rot: 0 },
          { type: 'text', text: 'YOU SHOULD BREAK YOUR BACK', x: 101, y: 1032, align: 'left', font: 'Noto Serif KR', size: 19, weight: 400, color: '#4f5a6b', accent: '#4f5a6b', accentBold: true, ls: 1, lh: 1.3, rot: -90 },
          { type: 'text', text: 'TO IMPROVE YOUR SCORE.', x: 135, y: 1140, align: 'left', font: 'Noto Serif KR', size: 19, weight: 400, color: '#4f5a6b', accent: '#4f5a6b', accentBold: true, ls: 1, lh: 1.3, rot: -90 },
          { type: 'text', text: '도서출판  판수학', x: 590, y: 1615, align: 'center', font: 'Noto Sans KR', size: 25, weight: 500, color: '#2b2b2b', accent: '#2b2b2b', accentBold: true, ls: 12, lh: 1.3, rot: 0 },
        ],
        back: [
          { type: 'text', text: '중등 내신대비스타트의 변신, 수컬', x: 595, y: 960, align: 'center', font: 'Gowun Dodum', size: 28, weight: 400, color: '#2f3d38', accent: '#2f3d38', accentBold: true, ls: 0, lh: 1.3, rot: 0 },
          { type: 'text', text: '[평촌관]  031-386-8899      [산본관]  031-346-8899', x: 1110, y: 1596, align: 'right', font: 'Noto Sans KR', size: 23, weight: 400, color: '#1a1a1a', accent: '#1a1a1a', accentBold: true, ls: 0, lh: 1.3, rot: 0 },
        ],
      },
    },
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Math.random().toString(36).slice(2, 10);
  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); else alert(m); }
  function msg(text, type) {
    const el = $('cv-msg'); if (!el) return;
    if (!text) { el.style.display = 'none'; return; }
    el.className = 'msg ' + (type || 'success'); el.innerHTML = text; el.style.display = 'block';
  }

  // ── 상태 ──
  const st = {
    inited: false, template: 'sucal', list: [], filter: '',
    design: null,          // { id|null, template, name, branch, pages }
    page: 'front', sel: -1, dirty: false,
    hist: [], future: [],
    imgs: {},              // src → HTMLImageElement
    drag: null,
  };

  // ── 글꼴 · 이미지 불러오기 ──
  let fontCssReady = null;
  function ensureFontCss() {
    if (fontCssReady) return fontCssReady;
    fontCssReady = new Promise((res) => {
      const l = document.createElement('link'); l.id = 'cv-fontcss'; l.rel = 'stylesheet'; l.href = FONT_CSS;
      l.onload = res; l.onerror = res; document.head.appendChild(l);
      setTimeout(res, 6000);
    });
    return fontCssReady;
  }
  async function loadFontsFor(items) {
    await ensureFontCss();
    const jobs = [];
    items.forEach((it) => {
      if (it.type !== 'text') return;
      jobs.push(document.fonts.load(`${it.weight || 400} 40px "${it.font}"`, it.text || '가'));
      if (it.accentBold) jobs.push(document.fonts.load(`700 40px "${it.font}"`, it.text || '가'));
    });
    try { await Promise.all(jobs); } catch (e) {}
  }
  function loadImg(src) {
    if (st.imgs[src]) return st.imgs[src].ready;
    const im = new Image();
    const ready = new Promise((res) => { im.onload = () => res(im); im.onerror = () => res(null); });
    im.src = src;
    st.imgs[src] = { im, ready };
    return ready;
  }
  function imgNow(src) { const r = st.imgs[src]; return r && r.im.complete && r.im.naturalWidth ? r.im : null; }

  // ── 글자 그리기 ──
  function parseRuns(line) {
    const runs = []; let buf = '', acc = false;
    for (const ch of line) {
      if (ch === '[' && !acc) { if (buf) runs.push({ t: buf, a: false }); buf = ''; acc = true; continue; }
      if (ch === ']' && acc) { if (buf) runs.push({ t: buf, a: true }); buf = ''; acc = false; continue; }
      buf += ch;
    }
    if (buf) runs.push({ t: buf, a: acc });
    return runs;
  }
  function fontStr(it, accent) { return `${accent && it.accentBold ? 700 : (it.weight || 400)} ${it.size}px "${it.font}", "Noto Sans KR", sans-serif`; }
  function lineWidth(ctx, it, runs) {
    let w = 0, n = 0;
    runs.forEach((r) => { ctx.font = fontStr(it, r.a); for (const ch of r.t) { w += ctx.measureText(ch).width; n++; } });
    return w + Math.max(0, n - 1) * (it.ls || 0);
  }
  function textBox(ctx, it) {
    const lines = String(it.text || '').split('\n').map(parseRuns);
    const widths = lines.map((r) => lineWidth(ctx, it, r));
    const w = Math.max(1, ...widths), lh = it.size * (it.lh || 1.3);
    const h = it.size + (lines.length - 1) * lh;
    const ox = it.align === 'center' ? -w / 2 : it.align === 'right' ? -w : 0;
    return { lines, widths, w, h, lh, ox };
  }
  function itemBox(ctx, it) {      // 회전 전 기준 좌표계의 상자 (anchor 기준)
    if (it.type === 'image') return { x: 0, y: 0, w: it.w, h: it.h };
    const b = textBox(ctx, it); return { x: b.ox, y: 0, w: b.w, h: b.h };
  }
  function drawItem(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    if (it.rot) ctx.rotate(it.rot * Math.PI / 180);
    ctx.globalAlpha = it.opacity == null ? 1 : it.opacity;
    if (it.type === 'image') {
      const im = imgNow(imageSrc(it));
      if (im) ctx.drawImage(im, 0, 0, it.w, it.h);
    } else {
      const b = textBox(ctx, it);
      ctx.textBaseline = 'top';
      b.lines.forEach((runs, li) => {
        const lw = b.widths[li];
        let x = it.align === 'center' ? -lw / 2 : it.align === 'right' ? -lw : 0;
        const y = li * b.lh;
        runs.forEach((r) => {
          ctx.font = fontStr(it, r.a);
          ctx.fillStyle = r.a ? (it.accent || it.color) : it.color;
          for (const ch of r.t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + (it.ls || 0); }
        });
      });
    }
    ctx.restore();
  }
  function imageSrc(it) { const t = COVER_TEMPLATES[st.design?.template || st.template]; return (t.images[it.key] || {}).src || ''; }

  function renderPage(ctx, pageKey, scale, withUi) {
    const t = COVER_TEMPLATES[st.design.template];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const bg = imgNow(t.pages[pageKey].bg);
    if (bg) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bg, 0, 0, W, H); }
    else { ctx.fillStyle = '#bcc8db'; ctx.fillRect(0, 0, W, H); }
    const items = st.design.pages[pageKey] || [];
    items.forEach((it) => drawItem(ctx, it));
    if (withUi && st.sel >= 0 && items[st.sel]) {
      const it = items[st.sel], b = itemBox(ctx, it);
      ctx.save(); ctx.translate(it.x, it.y); if (it.rot) ctx.rotate(it.rot * Math.PI / 180);
      ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2 / scale * 1.5; ctx.setLineDash([8, 6]);
      ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      ctx.setLineDash([]); ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ── 편집 화면 캔버스 ──
  let cv = null, cctx = null, viewScale = 0.4;
  function setupCanvas() {
    cv = $('cv-canvas'); if (!cv || cv.dataset.ready) return;
    cv.dataset.ready = '1';
    cctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cv.addEventListener('dblclick', () => { const ta = $('cv-p-text'); if (ta) { ta.focus(); ta.select(); } });
    window.addEventListener('resize', () => { if (st.design) draw(); });
    document.addEventListener('keydown', onKey);
  }
  function draw() {
    if (!cv || !st.design) return;
    const wrap = $('cv-stage');
    const avail = Math.max(260, Math.min(wrap.clientWidth - 4, 640));
    viewScale = avail / W;
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = Math.round(W * viewScale) + 'px'; cv.style.height = Math.round(H * viewScale) + 'px';
    cv.width = Math.round(W * viewScale * dpr); cv.height = Math.round(H * viewScale * dpr);
    renderPage(cctx, st.page, viewScale * dpr, true);
  }
  function toLocal(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function hit(p) {
    const items = st.design.pages[st.page];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], b = itemBox(cctx, it);
      const a = -(it.rot || 0) * Math.PI / 180, dx = p.x - it.x, dy = p.y - it.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (lx >= b.x - 8 && lx <= b.x + b.w + 8 && ly >= b.y - 8 && ly <= b.y + b.h + 8) return i;
    }
    return -1;
  }
  function onDown(e) {
    if (!st.design) return;
    const p = toLocal(e), i = hit(p);
    select(i);
    if (i >= 0) {
      const it = st.design.pages[st.page][i];
      st.drag = { i, sx: p.x, sy: p.y, ox: it.x, oy: it.y, moved: false };
      cv.setPointerCapture(e.pointerId);
    }
  }
  function onMove(e) {
    if (!st.design) return;
    const p = toLocal(e);
    if (!st.drag) { cv.style.cursor = hit(p) >= 0 ? 'move' : 'default'; return; }
    const it = st.design.pages[st.page][st.drag.i];
    if (!st.drag.moved) { pushHist(); st.drag.moved = true; }
    let nx = Math.round(st.drag.ox + p.x - st.drag.sx), ny = Math.round(st.drag.oy + p.y - st.drag.sy);
    if (e.shiftKey) { if (Math.abs(nx - st.drag.ox) > Math.abs(ny - st.drag.oy)) ny = st.drag.oy; else nx = st.drag.ox; }
    it.x = nx; it.y = ny; markDirty(); draw(); syncXY();
  }
  function onUp() { st.drag = null; }
  function onKey(e) {
    if (!st.design || !document.getElementById('tab-covers')?.classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); window.cvSave(); return; }
    if (typing || st.sel < 0) return;
    const it = st.design.pages[st.page][st.sel];
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); pushHist(); it.x += mv[0]; it.y += mv[1]; markDirty(); draw(); syncXY(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); window.cvDelete(); }
  }

  // ── 되돌리기 ──
  function pushHist() { st.hist.push(JSON.stringify(st.design.pages)); if (st.hist.length > 60) st.hist.shift(); st.future = []; }
  function undo() { if (!st.hist.length) return; st.future.push(JSON.stringify(st.design.pages)); st.design.pages = JSON.parse(st.hist.pop()); afterHist(); }
  function redo() { if (!st.future.length) return; st.hist.push(JSON.stringify(st.design.pages)); st.design.pages = JSON.parse(st.future.pop()); afterHist(); }
  function afterHist() { if (st.sel >= st.design.pages[st.page].length) st.sel = -1; markDirty(); renderLayers(); renderProps(); draw(); }
  window.cvUndo = undo; window.cvRedo = redo;

  function markDirty() { st.dirty = true; const b = $('cv-dirty'); if (b) b.textContent = '● 저장 안 됨'; }
  function markClean() { st.dirty = false; const b = $('cv-dirty'); if (b) b.textContent = ''; }

  // ── 선택 · 레이어 목록 ──
  function select(i) { st.sel = i; renderLayers(); renderProps(); draw(); }
  function itemLabel(it) {
    if (it.type === 'image') return '🖼 ' + ((COVER_TEMPLATES[st.design.template].images[it.key] || {}).label || '이미지');
    const t = String(it.text || '').replace(/[\[\]]/g, '').replace(/\n/g, ' / ').trim();
    return '✏️ ' + (t.length > 22 ? t.slice(0, 22) + '…' : (t || '(빈 글자)'));
  }
  function renderLayers() {
    const box = $('cv-layers'); if (!box || !st.design) return;
    const items = st.design.pages[st.page];
    box.innerHTML = items.length ? items.map((it, i) => `
      <div class="cv-layer${i === st.sel ? ' on' : ''}" onclick="cvSelect(${i})">${esc(itemLabel(it))}</div>`).reverse().join('')
      : '<div style="color:var(--muted);font-size:12.5px;padding:6px 2px;">글자가 없습니다. 「+ 글자 추가」를 눌러주세요.</div>';
  }
  window.cvSelect = (i) => select(i);

  // ── 속성 패널 ──
  function renderProps() {
    const box = $('cv-props'); if (!box) return;
    const it = st.design && st.sel >= 0 ? st.design.pages[st.page][st.sel] : null;
    if (!it) { box.innerHTML = '<div style="color:var(--muted);font-size:13px;line-height:1.8;">표지에서 글자를 누르면 여기서 고칠 수 있어요.<br>· 드래그로 위치 이동 (Shift = 가로/세로만)<br>· 방향키 1칸, Shift+방향키 10칸<br>· Ctrl+Z 되돌리기 · Ctrl+S 저장</div>'; return; }
    const num = (k, label, step, min, max) => `<div class="form-group"><label>${label}</label><input type="number" id="cv-p-${k}" value="${it[k] ?? 0}" step="${step}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} oninput="cvSet('${k}', this.value, true)"></div>`;
    const common = `
      <div class="form-row">${num('x', '가로 위치', 1)}${num('y', '세로 위치', 1)}${num('rot', '회전(도)', 1, -180, 180)}</div>
      <div class="form-row"><div class="form-group"><label>투명도</label><input type="range" min="0.1" max="1" step="0.05" value="${it.opacity == null ? 1 : it.opacity}" oninput="cvSet('opacity', this.value, true)"></div></div>`;
    if (it.type === 'image') {
      box.innerHTML = `
        <div style="font-weight:700;margin-bottom:8px;">${esc(itemLabel(it))}</div>
        <div class="form-row">${num('w', '너비', 1, 10)}<div class="form-group"><label>크기 비율</label><input type="range" min="0.3" max="2" step="0.01" value="${(it.w / (COVER_TEMPLATES[st.design.template].images[it.key]?.w || it.w)).toFixed(2)}" oninput="cvScaleImg(this.value)"></div></div>
        ${common}`;
      return;
    }
    const fontOpts = FONTS.map((f) => `<option value="${esc(f)}" ${f === it.font ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('');
    const wOpts = [[300, '가늘게'], [400, '보통'], [500, '중간'], [700, '굵게'], [900, '아주 굵게']].map(([v, l]) => `<option value="${v}" ${+it.weight === v ? 'selected' : ''}>${l}</option>`).join('');
    const al = (v, l) => `<button type="button" class="btn btn-sm ${it.align === v ? 'btn-primary' : 'btn-secondary'}" onclick="cvSet('align','${v}')">${l}</button>`;
    box.innerHTML = `
      <div class="form-group"><label>글자 <span style="font-weight:400;color:var(--muted);">— 줄바꿈 가능 · <b>[ ]</b>로 감싼 글자는 강조색</span></label>
        <textarea id="cv-p-text" rows="3" style="font-size:15px;" oninput="cvSet('text', this.value)">${esc(it.text)}</textarea></div>
      <div class="form-row">
        <div class="form-group" style="flex:2;"><label>글꼴</label><select onchange="cvSet('font', this.value)">${fontOpts}</select></div>
        <div class="form-group"><label>굵기</label><select onchange="cvSet('weight', this.value, true)">${wOpts}</select></div>
      </div>
      <div class="form-row">${num('size', '글자 크기', 1, 6, 600)}${num('ls', '자간', 0.5, -30, 80)}${num('lh', '줄 간격', 0.05, 0.6, 4)}</div>
      <div class="form-row">
        <div class="form-group"><label>글자색</label><input type="color" value="${esc(it.color)}" oninput="cvSet('color', this.value)" style="height:38px;padding:2px;"></div>
        <div class="form-group"><label>강조색 [ ]</label><input type="color" value="${esc(it.accent || it.color)}" oninput="cvSet('accent', this.value)" style="height:38px;padding:2px;"></div>
        <div class="form-group"><label>강조 굵게</label><select onchange="cvSet('accentBold', this.value==='1')"><option value="1" ${it.accentBold ? 'selected' : ''}>예</option><option value="0" ${!it.accentBold ? 'selected' : ''}>아니오</option></select></div>
      </div>
      <div class="form-group"><label>정렬 <span style="font-weight:400;color:var(--muted);">(보라 점 기준으로 왼쪽·가운데·오른쪽 맞춤)</span></label>
        <div style="display:flex;gap:6px;">${al('left', '왼쪽')}${al('center', '가운데')}${al('right', '오른쪽')}</div></div>
      ${common}`;
  }
  let typingTimer = null;
  window.cvSet = (k, v, isNum) => {
    const it = st.design.pages[st.page][st.sel]; if (!it) return;
    if (k === 'text') { if (!typingTimer) pushHist(); clearTimeout(typingTimer); typingTimer = setTimeout(() => { typingTimer = null; }, 800); }
    else pushHist();
    if (isNum || ['size', 'ls', 'lh', 'x', 'y', 'rot', 'w', 'opacity', 'weight'].includes(k)) { v = parseFloat(v); if (isNaN(v)) return; }
    if (k === 'w' && it.type === 'image') { it.h = Math.round(v * it.h / it.w); }
    it[k] = v; markDirty();
    if (k === 'font' || k === 'weight' || k === 'accentBold') loadFontsFor([it]).then(draw);
    if (k === 'align') renderProps();
    if (k === 'text') renderLayers();
    draw();
  };
  window.cvScaleImg = (r) => {
    const it = st.design.pages[st.page][st.sel]; if (!it || it.type !== 'image') return;
    const base = COVER_TEMPLATES[st.design.template].images[it.key]; if (!base) return;
    pushHist(); it.w = Math.round(base.w * r); it.h = Math.round(base.h * r); markDirty(); draw();
    const wi = $('cv-p-w'); if (wi) wi.value = it.w;
  };
  function syncXY() {
    const it = st.design.pages[st.page][st.sel]; if (!it) return;
    const x = $('cv-p-x'), y = $('cv-p-y'); if (x) x.value = it.x; if (y) y.value = it.y;
  }

  // ── 글자 추가 · 복제 · 삭제 · 순서 ──
  window.cvAddText = () => {
    if (!st.design) return;
    pushHist();
    const it = { type: 'text', text: '새 글자', x: Math.round(W / 2), y: Math.round(H / 2), align: 'center', font: 'Noto Sans KR', size: 40, weight: 500, color: '#1a1a1a', accent: '#3d5c9a', accentBold: true, ls: 0, lh: 1.3, rot: 0 };
    st.design.pages[st.page].push(it); markDirty();
    loadFontsFor([it]).then(() => { select(st.design.pages[st.page].length - 1); const ta = $('cv-p-text'); if (ta) { ta.focus(); ta.select(); } });
  };
  window.cvAddImage = (key) => {
    const t = COVER_TEMPLATES[st.design.template], im = t.images[key]; if (!im) return;
    pushHist();
    st.design.pages[st.page].push({ type: 'image', key, x: Math.round((W - im.w) / 2), y: Math.round((H - im.h) / 2), w: im.w, h: im.h, rot: 0 });
    markDirty(); loadImg(im.src).then(() => select(st.design.pages[st.page].length - 1));
  };
  window.cvDuplicate = () => {
    const items = st.design?.pages[st.page]; if (!items || st.sel < 0) return;
    pushHist(); const c = clone(items[st.sel]); c.x += 20; c.y += 20; items.push(c); markDirty(); select(items.length - 1);
  };
  window.cvDelete = () => {
    const items = st.design?.pages[st.page]; if (!items || st.sel < 0) return;
    pushHist(); items.splice(st.sel, 1); st.sel = -1; markDirty(); renderLayers(); renderProps(); draw();
  };
  window.cvOrder = (d) => {
    const items = st.design?.pages[st.page]; if (!items || st.sel < 0) return;
    const j = st.sel + d; if (j < 0 || j >= items.length) return;
    pushHist(); [items[st.sel], items[j]] = [items[j], items[st.sel]]; markDirty(); select(j);
  };
  window.cvResetPage = () => {
    if (!st.design) return;
    if (!confirm(`${COVER_TEMPLATES[st.design.template].pages[st.page].label}의 글자를 처음 문구로 되돌릴까요?`)) return;
    pushHist(); st.design.pages[st.page] = clone(COVER_TEMPLATES[st.design.template].defaults[st.page]); st.sel = -1; markDirty();
    loadFontsFor(st.design.pages[st.page]).then(() => { renderLayers(); renderProps(); draw(); });
  };
  window.cvPage = (p) => {
    st.page = p; st.sel = -1;
    document.querySelectorAll('#cv-pagebtns button').forEach((b) => { b.className = 'btn btn-sm ' + (b.dataset.p === p ? 'btn-primary' : 'btn-secondary'); });
    renderLayers(); renderProps(); draw();
  };

  // ── 목록 ──
  function fmtTime(ts) {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null); if (!d) return '';
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  async function loadList() {
    const box = $('cv-list'); if (box) box.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
    try {
      const snap = await getDocs(collection(db, COL));
      st.list = []; snap.forEach((d) => st.list.push({ id: d.id, ...d.data() }));
      st.list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    } catch (e) { if (box) box.innerHTML = `<div style="color:#D97B1A;font-size:13px;">목록을 불러오지 못했습니다 (${esc(e.code || e.message)})</div>`; return; }
    renderList();
  }
  function renderList() {
    const box = $('cv-list'); if (!box) return;
    const rows = st.list.filter((d) => d.template === st.template && (!st.filter || (d.branch || '공용') === st.filter));
    const color = { '평촌관': '#7c3aed', '산본관': '#c99a06', '공용': '#64748b' };
    box.innerHTML = rows.length ? rows.map((d) => `
      <div class="cv-row${st.design && st.design.id === d.id ? ' on' : ''}">
        <span class="cv-badge" style="color:${color[d.branch || '공용']};border-color:${color[d.branch || '공용']};">${esc(d.branch || '공용')}</span>
        <span class="cv-name" onclick="cvOpen('${d.id}')">${esc(d.name || '(이름 없음)')}</span>
        <small>${esc(fmtTime(d.updatedAt))}${d.updatedBy ? ' · ' + esc(d.updatedBy) : ''}</small>
        <span class="cv-act">
          <button class="btn btn-secondary btn-sm" onclick="cvOpen('${d.id}')">열기</button>
          <button class="btn btn-secondary btn-sm" onclick="cvCopy('${d.id}')">복사</button>
          <button class="btn btn-secondary btn-sm" style="color:#dc2626;" onclick="cvRemove('${d.id}')">삭제</button>
        </span>
      </div>`).join('')
      : '<div style="color:var(--muted);font-size:13px;padding:4px 0;">저장된 안내문이 없습니다. 「+ 새로 만들기」로 시작하세요.</div>';
  }
  window.cvFilter = (v) => { st.filter = v; renderList(); };
  window.cvTemplate = (v) => { if (st.dirty && !confirm('저장하지 않은 수정이 있습니다. 그래도 바꿀까요?')) { $('cv-template').value = st.template; return; } st.template = v; st.design = null; showEditor(false); renderList(); };

  function showEditor(on) { const e = $('cv-editor'); if (e) e.style.display = on ? '' : 'none'; }
  async function openDesign(d) {
    st.design = d; st.page = 'front'; st.sel = -1; st.hist = []; st.future = []; markClean();
    const t = COVER_TEMPLATES[d.template];
    $('cv-name').value = d.name || ''; $('cv-branch').value = d.branch || '공용';
    $('cv-title').textContent = t.label + (d.id ? '' : ' · 새 안내문');
    $('cv-pagebtns').innerHTML = Object.entries(t.pages).map(([k, p]) => `<button type="button" data-p="${k}" class="btn btn-sm ${k === 'front' ? 'btn-primary' : 'btn-secondary'}" onclick="cvPage('${k}')">${esc(p.label)}</button>`).join('');
    $('cv-imgbtns').innerHTML = Object.entries(t.images).map(([k, im]) => `<button type="button" class="btn btn-secondary btn-sm" onclick="cvAddImage('${k}')">+ ${esc(im.label)}</button>`).join('');
    showEditor(true); setupCanvas();
    msg('');
    const all = Object.values(d.pages).flat();
    await Promise.all([
      ...Object.values(t.pages).map((p) => loadImg(p.bg)),
      ...Object.values(t.images).map((im) => loadImg(im.src)),
      loadFontsFor(all),
    ]);
    renderLayers(); renderProps(); renderList(); draw();
    $('cv-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.cvNew = () => {
    if (st.dirty && !confirm('저장하지 않은 수정이 있습니다. 그래도 새로 만들까요?')) return;
    const t = COVER_TEMPLATES[st.template];
    openDesign({ id: null, template: st.template, name: '', branch: '공용', pages: clone(t.defaults) });
    setTimeout(() => $('cv-name')?.focus(), 300);
  };
  window.cvOpen = (id) => {
    if (st.dirty && !confirm('저장하지 않은 수정이 있습니다. 그래도 다른 안내문을 열까요?')) return;
    const d = st.list.find((x) => x.id === id); if (!d) return;
    const t = COVER_TEMPLATES[d.template]; if (!t) { alert('지원하지 않는 교재 종류입니다.'); return; }
    const pages = clone(d.pages || {});
    Object.keys(t.pages).forEach((k) => { if (!Array.isArray(pages[k])) pages[k] = clone(t.defaults[k]); });
    openDesign({ id: d.id, template: d.template, name: d.name, branch: d.branch || '공용', pages });
  };
  window.cvCopy = (id) => {
    if (st.dirty && !confirm('저장하지 않은 수정이 있습니다. 그래도 복사할까요?')) return;
    const d = st.list.find((x) => x.id === id); if (!d) return;
    openDesign({ id: null, template: d.template, name: (d.name || '') + ' 복사본', branch: d.branch || '공용', pages: clone(d.pages) }).then(markDirty);
  };
  window.cvRemove = async (id) => {
    const d = st.list.find((x) => x.id === id); if (!d) return;
    if (!confirm(`"${d.name}" 안내문을 삭제할까요?`)) return;
    try {
      await deleteDoc(doc(db, COL, id));
      if (st.design && st.design.id === id) { st.design = null; markClean(); showEditor(false); }
      await loadList(); toast('삭제했습니다');
    } catch (e) { alert('삭제 실패: ' + (e.code || e.message)); }
  };

  // ── 저장 ──
  window.cvSave = async () => {
    if (!st.design) return;
    const name = $('cv-name').value.trim();
    if (!name) { alert('안내문 이름을 입력해주세요. (예: 고2-2 기말고사 수컬)'); $('cv-name').focus(); return; }
    const data = {
      template: st.design.template, name, branch: $('cv-branch').value,
      pages: st.design.pages, updatedAt: Timestamp.now(),
      updatedBy: (window.currentAdmin && (window.currentAdmin.name || window.currentAdmin.email)) || '',
    };
    const btn = $('cv-savebtn'); if (btn) btn.disabled = true;
    try {
      if (st.design.id) await setDoc(doc(db, COL, st.design.id), data);
      else { const r = await addDoc(collection(db, COL), data); st.design.id = r.id; $('cv-title').textContent = COVER_TEMPLATES[st.design.template].label; }
      st.design.name = name; st.design.branch = data.branch;
      markClean(); msg('✓ 저장했습니다.', 'success'); setTimeout(() => msg(''), 2500);
      await loadList();
    } catch (e) { msg('저장 실패: ' + esc(e.code || e.message), 'error'); }
    finally { if (btn) btn.disabled = false; }
  };

  // ── 내려받기 ──
  async function pageCanvas(pageKey) {
    await loadFontsFor(st.design.pages[pageKey]);
    const c = document.createElement('canvas'); c.width = W * EXPORT_SCALE; c.height = H * EXPORT_SCALE;
    renderPage(c.getContext('2d'), pageKey, EXPORT_SCALE, false);
    return c;
  }
  function fileBase() { return ($('cv-name').value.trim() || COVER_TEMPLATES[st.design.template].label).replace(/[\\/:*?"<>|]/g, '_'); }
  function downloadBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  window.cvDownloadPng = async () => {
    if (!st.design) return;
    const c = await pageCanvas(st.page);
    c.toBlob((b) => downloadBlob(b, `${fileBase()}_${COVER_TEMPLATES[st.design.template].pages[st.page].label}.png`), 'image/png');
  };
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = () => rej(new Error('PDF 도구를 불러오지 못했습니다')); document.head.appendChild(s);
    });
  }
  window.cvDownloadPdf = async () => {
    if (!st.design) return;
    msg('PDF 만드는 중...', 'success');
    try {
      await loadJsPdf();
      const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const keys = Object.keys(COVER_TEMPLATES[st.design.template].pages);
      for (let i = 0; i < keys.length; i++) {
        const c = await pageCanvas(keys[i]);
        if (i) pdf.addPage('a4', 'portrait');
        pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      }
      pdf.save(`${fileBase()}.pdf`);
      msg('');
    } catch (e) { msg('PDF 만들기 실패: ' + esc(e.message), 'error'); }
  };

  // ── 탭 열기 ──
  window.initCoversTab = async () => {
    ensureFontCss();
    if (!st.inited) {
      st.inited = true;
      const sel = $('cv-template');
      sel.innerHTML = Object.entries(COVER_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('');
      sel.value = st.template;
      window.addEventListener('beforeunload', (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } });
    }
    await loadList();
    if (st.design) draw();
  };
})();
