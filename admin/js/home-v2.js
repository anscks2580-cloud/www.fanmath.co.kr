'use strict';
/* ═══════════════════════════════════════════════════════════
   관리자 홈 — 한눈에 보기 (디자인 V2: 수치 · 그래프)
   - 맨 위 이번 주 일정 달력 바로 아래에 붙음 (달력은 그대로 맨 위·가장 크게)
   - 읽기 전용: 학생 명단 · 상담 신청 · 결석 사유서를 읽어서 숫자·그래프로만 보여줌
   - 달력의 전체/평촌관/산본관 선택을 그대로 따름 (평촌 = 보라, 산본 = 노랑)
   ═══════════════════════════════════════════════════════════ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const BR = ['평촌관', '산본관'];
  const COLOR = { '평촌관': '#5B3FA6', '산본관': '#F5C518' };
  const normBr = (b) => (String(b || '').includes('산본') ? '산본관' : '평촌관');
  const brFilter = () => (typeof window.ocBranch === 'function' ? window.ocBranch() : '전체');
  const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3', 'N수'];
  function gradeOf(s) {
    const g = String(s?.grade || '').trim();
    if (g.startsWith('초')) return '초등';
    if (/N수|재수|졸업/.test(g)) return 'N수';
    return GRADES.includes(g) ? g : '';
  }

  let data = null, loadedAt = 0, loading = false;

  function ensureBox() {
    let box = $('v2Dash');
    if (box) return box;
    const grid = document.querySelector('#tab-home .hm-grid'); if (!grid) return null;
    box = document.createElement('section');
    box.className = 'card hm-card hm-wide v2d'; box.id = 'v2Dash';
    box.innerHTML = '<div class="hm-loading">한눈에 보기 불러오는 중...</div>';
    const cal = $('ocCard');
    if (cal && cal.parentNode === grid) cal.after(box); else grid.prepend(box);
    return box;
  }

  async function load(force) {
    if (loading) return;
    if (!force && data && Date.now() - loadedAt < 60 * 1000) { render(); return; }
    const box = ensureBox(); if (!box || typeof getDocs !== 'function') return;
    loading = true;
    try {
      let students = (typeof studentsCache !== 'undefined' && Array.isArray(studentsCache) && studentsCache.length) ? studentsCache : null;
      if (!students) { const ss = await getDocs(collection(db, 'students')); students = []; ss.forEach((d) => { if (d.data().status !== '퇴원') students.push({ id: d.id, ...d.data() }); }); }
      const cs = await getDocs(query(collection(db, 'consultForms'), orderBy('createdAt', 'desc')));
      const consults = [];
      cs.forEach((d) => { const x = d.data(); consults.push({ br: normBr(x.branch), at: x.createdAt?.toDate ? x.createdAt.toDate() : null, done: x.stage === 'consultation_completed', hidden: x.hidden === true }); });
      let abs = [];
      try { abs = typeof window.absLoad === 'function' ? (await window.absLoad()) || [] : []; } catch (e) { abs = []; }
      data = { students: students.filter((s) => s.status !== '퇴원'), consults, abs };
      loadedAt = Date.now();
      render();
    } catch (e) {
      box.innerHTML = `<div class="hm-empty">한눈에 보기를 불러오지 못했습니다 (${esc(e.message)})</div>`;
    } finally { loading = false; }
  }

  function render() {
    const box = ensureBox(); if (!box || !data) return;
    const bf = brFilter();
    const showBr = bf === '전체' ? BR : [bf];
    const inBr = (b) => bf === '전체' || b === bf;
    const now = new Date(); const today = ymd(now);
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);

    // ── 숫자 ──
    const stu = { '평촌관': 0, '산본관': 0 };
    const grade = {}; GRADES.forEach((g) => (grade[g] = { '평촌관': 0, '산본관': 0 }));
    data.students.forEach((s) => { const b = normBr(s.branch); stu[b]++; const g = gradeOf(s); if (g) grade[g][b]++; });
    const stuN = showBr.reduce((a, b) => a + stu[b], 0);
    const cWeek = data.consults.filter((c) => inBr(c.br) && c.at && c.at >= weekAgo).length;
    const cOpen = data.consults.filter((c) => inBr(c.br) && !c.done && !c.hidden).length;
    const absUp = data.abs.filter((a) => (a.dates || []).some((d) => d >= today) && inBr(normBr(a.branch)));
    const absNew = absUp.filter((a) => !a.readByAdmin).length;
    const split = (obj) => bf === '전체' ? `평촌 ${obj['평촌관']} · 산본 ${obj['산본관']}` : bf;
    const cntBy = (arr) => { const o = { '평촌관': 0, '산본관': 0 }; arr.forEach((x) => o[x.br]++); return o; };

    // ── 최근 8주 상담 신청 ──
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weeks = [];
    for (let i = 7; i >= 0; i--) { const s = new Date(monday); s.setDate(monday.getDate() - 7 * i); const e = new Date(s); e.setDate(s.getDate() + 7); weeks.push({ s, e, c: { '평촌관': 0, '산본관': 0 } }); }
    data.consults.forEach((c) => { if (!c.at) return; const w = weeks.find((w) => c.at >= w.s && c.at < w.e); if (w) w.c[c.br]++; });

    const tile = (ic, n, lb, sub, open, warn) =>
      `<div class="v2d-tile${warn ? ' warn' : ''}" data-open="${open}"><div class="ic">${ic}</div><div class="n" data-count="${n}">${n}</div><div class="lb">${esc(lb)}</div><div class="sub">${esc(sub)}</div></div>`;

    const bars = (rows, labelOf, totalMax) => {
      const max = Math.max(1, totalMax);
      return '<div class="v2d-bars">' + rows.map((r) => {
        const tot = showBr.reduce((a, b) => a + r.c[b], 0);
        const segs = showBr.map((b) => r.c[b] ? `<i style="height:${r.c[b] / max * 100}%;background:${COLOR[b]}" title="${b} ${r.c[b]}"></i>` : '').join('');
        return `<div class="v2d-bar"><b>${tot || ''}</b><div class="stk" style="--h:${tot / max * 100}%">${segs}</div><span>${esc(labelOf(r))}</span></div>`;
      }).join('') + '</div>';
    };
    const gradeRows = GRADES.map((g) => ({ g, c: grade[g] }));
    const gMax = Math.max(...gradeRows.map((r) => showBr.reduce((a, b) => a + r.c[b], 0)));
    const wMax = Math.max(...weeks.map((w) => showBr.reduce((a, b) => a + w.c[b], 0)));

    // ── 관별 도넛 ──
    const C = 2 * Math.PI * 62, tot = stu['평촌관'] + stu['산본관'] || 1, pR = stu['평촌관'] / tot;
    const dim = (b) => (bf !== '전체' && bf !== b ? 0.25 : 1);
    const donut = `<div class="v2d-donut"><svg viewBox="0 0 160 160" width="150" height="150">
        <circle cx="80" cy="80" r="62" stroke="#EEEAF7"/>
        <circle class="seg" cx="80" cy="80" r="62" stroke="${COLOR['평촌관']}" style="opacity:${dim('평촌관')}" stroke-dasharray="${C * pR} ${C}" />
        <circle class="seg" cx="80" cy="80" r="62" stroke="${COLOR['산본관']}" style="opacity:${dim('산본관')}" stroke-dasharray="${C * (1 - pR)} ${C}" stroke-dashoffset="${-C * pR}" />
      </svg><div class="ctr"><div><b data-count="${stuN}">${stuN}</b><small>${esc(bf === '전체' ? '전체 재원생' : bf + ' 재원생')}</small></div></div></div>`;
    const legend = '<div class="v2d-legend">' + BR.map((b) => `<span><i style="background:${COLOR[b]}"></i>${b} ${stu[b]}명</span>`).join('') + '</div>';

    box.innerHTML = `
      <h3><span>📊 한눈에 보기 ${bf !== '전체' ? `<small style="margin-left:6px;font-size:12px;font-weight:800;color:${bf === '산본관' ? '#A87A00' : '#5B3FA6'}">${bf}</small>` : ''}</span><button class="go" type="button" onclick="v2DashRefresh()">새로고침 ↻</button></h3>
      <div class="v2d-kpis">
        ${tile('👥', stuN, '재원생', split(stu), 'students')}
        ${tile('📥', cWeek, '최근 7일 상담 신청', split(cntBy(data.consults.filter((c) => c.at && c.at >= weekAgo))), 'consult')}
        ${tile('⏳', cOpen, '상담 진행 전', split(cntBy(data.consults.filter((c) => !c.done && !c.hidden))), 'consult', cOpen > 0)}
        ${tile('📝', absUp.length, '예정 결석 (사유서)', absNew ? `새로 ${absNew}건 확인 필요` : '모두 확인함', 'attendance', absNew > 0)}
      </div>
      <div class="v2d-row">
        <div class="v2d-panel"><div class="hd">학년별 재원생</div>${bars(gradeRows, (r) => r.g, gMax)}</div>
        <div class="v2d-panel"><div class="hd">관별 재원생</div>${donut}${legend}</div>
      </div>
      <div class="v2d-panel" style="margin-top:12px"><div class="hd">최근 8주 상담 신청 <small>(주 단위 · 월요일 시작)</small></div>${bars(weeks, (w) => `${w.s.getMonth() + 1}/${w.s.getDate()}`, wMax)}</div>
      ${bf === '전체' ? legend.replace('v2d-legend', 'v2d-legend sm') : ''}`;
    box.querySelectorAll('[data-count]').forEach(countUp);
  }

  function countUp(el) {
    const to = +el.dataset.count; if (!to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(), dur = 900;
    (function f(t) { const p = Math.min(1, Math.max(0, (t - t0) / dur)); el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(f); })(t0);
  }

  window.v2DashRefresh = () => load(true);
  window.addEventListener('oc:branch', render);
  window.addEventListener('admin:ready', () => { if ($('tab-home')?.classList.contains('active')) load(true); });
  // 기존 홈 열기/새로고침이 불릴 때 같이 갱신 (기존 함수는 그대로 실행)
  function wrap(name, force) {
    const orig = window[name]; if (typeof orig !== 'function' || orig._v2) return;
    const w = function () { const r = orig.apply(this, arguments); load(force); return r; }; w._v2 = true; window[name] = w;
  }
  function hook() { wrap('initHomeTab', false); wrap('refreshHomeTab', true); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
