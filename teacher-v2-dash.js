'use strict';
/* ═══════════════════════════════════════════════════════════
   선생님 홈(일정) — 내 반 한눈에 (디자인 V2: 수치 · 그래프)
   - 달력 아래에 붙음 (달력은 그대로)
   - 읽기 전용: 내 담당 학생 · 지난주 주간성취도/반별 진도 · 전월 월말보고서 제출 여부
   - 평촌관(보라) · 산본관(노랑) 구분
   - teacher.html 이 로그인 후 window.__v2T 를 넘겨주면 그림
   ═══════════════════════════════════════════════════════════ */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BR = ['평촌관', '산본관'];
  const COLOR = { '평촌관': '#5B3FA6', '산본관': '#F5C518' };
  const normBr = (b) => (String(b || '').includes('산본') ? '산본관' : '평촌관');
  const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3', 'N수'];
  const gradeOf = (s) => { const g = String(s?.grade || '').trim(); if (g.startsWith('초')) return '초등'; if (/N수|재수|졸업/.test(g)) return 'N수'; return GRADES.includes(g) ? g : ''; };
  const isWeeklyTarget = (s) => { const g = String(s?.grade || '').trim(); return !(g.startsWith('고') || /N수|재수|졸업/.test(g)) && !/과외/.test(String(s?.classGroup || '')); };

  let busy = false, lastAt = 0;

  function ensureBox() {
    let box = document.getElementById('v2TDash'); if (box) return box;
    const tab = document.getElementById('tab-calendar'); if (!tab) return null;
    box = document.createElement('div');
    box.className = 'card v2d'; box.id = 'v2TDash'; box.style.marginTop = '16px';
    const lay = tab.querySelector('.cal-layout');
    if (lay) lay.after(box); else tab.appendChild(box);
    return box;
  }

  async function draw() {
    const T = window.__v2T; if (!T || busy) return;
    if (Date.now() - lastAt < 30 * 1000 && document.getElementById('v2TDash')?.dataset.ok) return;
    const box = ensureBox(); if (!box) return;
    busy = true;
    try {
      const st = (T.students || []).filter((s) => s.status !== '퇴원');
      const by = { '평촌관': 0, '산본관': 0 };
      const grade = {}; GRADES.forEach((g) => (grade[g] = { '평촌관': 0, '산본관': 0 }));
      st.forEach((s) => { const b = normBr(s.branch); by[b]++; const g = gradeOf(s); if (g) grade[g][b]++; });
      const mid = st.filter(isWeeklyTarget);
      const showBr = BR.filter((b) => by[b] > 0); if (!showBr.length) showBr.push('평촌관');

      // 제출 현황 (내 것만, 읽기 전용)
      const { db, getDocs, collection, query, where } = T.fb;
      const lastKey = T.weekKey(new Date(), 1);
      const now = new Date(); const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
      const safe = (p) => p.then((x) => x).catch(() => null);
      const [wk, pg, mo] = await Promise.all([
        mid.length ? safe(getDocs(query(collection(db, 'weeklyReports'), where('teacherUid', '==', T.uid), where('weekKey', '==', lastKey)))) : Promise.resolve(null),
        safe(getDocs(query(collection(db, 'progressReports'), where('teacherUid', '==', T.uid), where('weekKey', '==', lastKey)))),
        safe(getDocs(query(collection(db, 'monthlyReports'), where('teacherUid', '==', T.uid), where('month', '==', prevKey)))),
      ]);
      const wkSet = new Set(); if (wk) wk.forEach((d) => wkSet.add(d.data().studentId));
      const wkDone = mid.filter((s) => wkSet.has(s.id)).length;
      const pgDone = pg ? pg.size > 0 : null, moDone = mo ? mo.size > 0 : null;

      const split = BR.filter((b) => by[b]).map((b) => `${b.replace('관', '')} ${by[b]}`).join(' · ') || '배정된 학생 없음';
      const ring = (pct, color) => { const C = 2 * Math.PI * 22; return `<svg viewBox="0 0 56 56" width="56" height="56"><circle cx="28" cy="28" r="22" stroke="#F2EEDD"/><circle class="seg" cx="28" cy="28" r="22" stroke="${color}" stroke-dasharray="${C * pct} ${C}"/></svg>`; };
      const sub = (title, done, total, open, note) => {
        const pct = total ? done / total : 0, ok = total && done >= total;
        return `<div class="v2d-sub${ok ? ' ok' : ''}" data-tnav="${open}"><div class="ring">${ring(pct, ok ? '#2E9E5B' : '#F5C518')}<b>${total ? Math.round(pct * 100) : 0}%</b></div><div><div class="t">${esc(title)}</div><div class="s">${esc(note)}</div></div></div>`;
      };
      const gMax = Math.max(1, ...GRADES.map((g) => showBr.reduce((a, b) => a + grade[g][b], 0)));
      const bars = '<div class="v2d-bars">' + GRADES.map((g) => {
        const tot = showBr.reduce((a, b) => a + grade[g][b], 0);
        const segs = showBr.map((b) => grade[g][b] ? `<i style="height:${grade[g][b] / gMax * 100}%;background:${COLOR[b]}" title="${b} ${grade[g][b]}"></i>` : '').join('');
        return `<div class="v2d-bar"><b>${tot || ''}</b><div class="stk">${segs}</div><span>${g}</span></div>`;
      }).join('') + '</div>';

      box.innerHTML = `
        <h3 style="display:flex;align-items:center;gap:8px">📊 내 반 한눈에</h3>
        <div class="v2d-kpis">
          <div class="v2d-tile"><div class="ic">👥</div><div class="n" data-count="${st.length}">${st.length}</div><div class="lb">담당 학생</div><div class="sub">${esc(split)}</div></div>
          <div class="v2d-tile"><div class="ic">🏫</div><div class="n" data-count="${mid.length}">${mid.length}<small> / ${st.length - mid.length}</small></div><div class="lb">중등 / 고등</div><div class="sub">주간성취도 대상 ${mid.length}명</div></div>
          ${mid.length ? `<div class="v2d-tile${wkDone < mid.length ? ' warn' : ''}" data-tnav="weekly"><div class="ic">📊</div><div class="n">${wkDone}<small> / ${mid.length}</small></div><div class="lb">지난주 주간성취도</div><div class="sub">${wkDone >= mid.length ? '전원 제출' : `${mid.length - wkDone}명 남음 · 금요일까지`}</div></div>` : ''}
          <div class="v2d-tile${pgDone === false ? ' warn' : ''}" data-tnav="progress"><div class="ic">📍</div><div class="n" style="font-size:22px">${pgDone == null ? '-' : pgDone ? '제출' : '미제출'}</div><div class="lb">지난주 반별 진도</div><div class="sub">금요일까지</div></div>
        </div>
        <div class="v2d-row">
          <div class="v2d-panel"><div class="hd">학년별 담당 학생</div>${bars}
            <div class="v2d-legend sm">${BR.map((b) => `<span><i style="background:${COLOR[b]}"></i>${b} ${by[b]}명</span>`).join('')}</div></div>
          <div class="v2d-panel"><div class="hd">제출 현황</div><div class="v2d-subs">
            ${mid.length ? sub('주간성취도 (지난주)', wkDone, mid.length, 'weekly', `${wkDone}/${mid.length}명 제출`) : ''}
            ${pgDone != null ? sub('반별 진도 (지난주)', pgDone ? 1 : 0, 1, 'progress', pgDone ? '제출 완료' : '아직 제출 전') : ''}
            ${moDone != null ? sub(`${prev.getMonth() + 1}월 월말보고서`, moDone ? 1 : 0, 1, 'monthly', moDone ? '제출 완료' : '다음 달 3일까지') : ''}
          </div></div>
        </div>`;
      box.dataset.ok = '1'; lastAt = Date.now();
      box.querySelectorAll('[data-count]').forEach((el) => {
        const to = +el.dataset.count, small = el.querySelector('small'); if (!to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const t0 = performance.now(), tail = small ? small.outerHTML : '';
        (function f(t) { const p = Math.min(1, Math.max(0, (t - t0) / 900)); el.innerHTML = Math.round(to * (1 - Math.pow(1 - p, 3))) + tail; if (p < 1) requestAnimationFrame(f); })(t0);
      });
    } catch (e) {
      box.innerHTML = `<div class="cal-empty">내 반 한눈에를 불러오지 못했습니다 (${esc(e.message)})</div>`;
    } finally { busy = false; }
  }

  // 타일·제출 현황을 누르면 해당 메뉴 열기 (기존 숨긴 탭 버튼을 누르는 방식 그대로)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#v2TDash [data-tnav]'); if (!b) return;
    const id = b.dataset.tnav;
    const btn = [...document.querySelectorAll('#tnavLegacy button')].find((x) => (x.getAttribute('onclick') || '').includes(`switchTab('${id}'`));
    if (btn) btn.click();
  });

  window.addEventListener('v2:teacher', () => { lastAt = 0; draw(); });
  // 일정 화면으로 돌아올 때마다 새로 (30초 간격)
  document.addEventListener('click', (e) => { if (e.target.closest('.ad-item, #tnavLegacy button')) setTimeout(() => { if (document.getElementById('tab-calendar')?.classList.contains('active')) draw(); }, 200); });
})();
