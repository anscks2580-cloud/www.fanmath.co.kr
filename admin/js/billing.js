'use strict';
/* ═══════════════════════════════════════════════════════════
   수납 (원장·관리부 전용) — 아카(ACA2000) 대체
   메뉴: 수납 현황 · 학생 수납 · 납입/미납 조회 · 현금영수증 · 반·수강료 · 교재

   [파이어베이스 컬렉션 — 모두 관리자만 읽기·쓰기 (firestore.rules 맨 아래 기본 규칙)]
   billSettings/main   : 자동 발생 시작 월 · 미리 발생 일수 · 카드사 · 기타 청구 항목
   billingClasses      : 반(관·반형태·반명·담임·수강료)
   billingStudents     : 수납용 학생(홈페이지 학생과 studentId로 연결) · 매월 납입일 · 수강반(enrollments)
   billCharges         : 청구(수강료·교재비·기타) — 납입기한·청구액·납입액·상태
   billPayments        : 납입·환불 기록 — 형태·카드사·현금영수증 발행 여부
   billBooks           : 교재(구매가·판매가·재고)
   billBookMoves       : 교재 입고·판매·판매취소 기록

   [수강료 자동 발생]
   - 재원 학생 + 매월 납입일 + 수강반(자동 켜짐, 수강료>0)이면 매달 납입일 기준으로 청구가 생김
   - 납입일 [미리 발생 일수]일 전에 미리 생김 (기본 14일)
   - 관리자 화면에서 수납 메뉴를 열 때마다 빠진 달을 채움 (같은 달 두 번 안 생김)
   - 과외처럼 1회성은 학생 수납 › 청구 추가로 직접 발생
   ═══════════════════════════════════════════════════════════ */
(function () {
  const FS_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
  let FS = null;
  async function fsx() { if (!FS) FS = await import(FS_URL); return FS; }

  // 테스트 모드: 페이지에서 window.BL_PREFIX = 'test_' 로 두면 모든 수납 데이터가 test_ 컬렉션에 따로 저장됨
  // (홈페이지 학생 명단은 읽기만 함 → 실제 데이터는 건드리지 않음)
  const P = window.BL_PREFIX || '';
  const C = { settings: P + 'billSettings', classes: P + 'billingClasses', students: P + 'billingStudents', charges: P + 'billCharges',
              payments: P + 'billPayments', books: P + 'billBooks', moves: P + 'billBookMoves' };
  window.BL_COLLECTIONS = C;
  const METHODS = ['현금', '카드', '계좌이체', '결제선생', '기타'];
  const CASH_METHODS = ['현금', '계좌이체'];
  const ITEMS = ['수강료', '교재비', '기타'];
  const DEFAULT_SETTINGS = {
    autoStartMonth: '', genDay: 20, notifyDays: 4,
    cardCompanies: ['국민', '신한', '삼성', '현대', '롯데', '하나', '우리', '농협', '비씨', '인터넷카드', '기타'],
    etcItems: ['특강비', '겨울특강비', '여름특강비', '수리논술', '적성고사', '교통비', '기타'],
  };

  const S = {
    loaded: false, loading: null,
    settings: { ...DEFAULT_SETTINGS },
    classes: [], students: [], charges: new Map(), books: [],
    lastAuto: null,
    cur: { student: null, book: null },
    ui: { today: {}, student: { filter: '재원', branch: '', q: '', chargeView: 'open' }, unpaid: {}, receipt: {}, books: {} },
  };
  const BL = window.BL = {};

  // ── 공통 도구 ──────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? Math.round(n) : 0; };
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const ymOf = (d) => String(d || '').slice(0, 7);
  function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function addMonths(ym, n) { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); }
  function lastDay(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function dueOf(ym, day) { return ym + '-' + String(Math.min(Math.max(1, day), lastDay(ym))).padStart(2, '0'); }
  function monthsBetween(a, b) { const out = []; let m = a; let guard = 0; while (m <= b && guard++ < 60) { out.push(m); m = addMonths(m, 1); } return out; }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400e3); }
  const shortD = (d) => d ? d.slice(2).replace(/-/g, '.') : '';
  const who = () => { const a = window.currentAdmin || {}; return a.name || (a.email || '').split('@')[0] || '관리자'; };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const remain = (c) => Math.max(0, (Number(c.amount) || 0) - (Number(c.paid) || 0));
  function statusOf(amount, paid, canceled) {
    if (canceled) return '취소';
    if (paid <= 0) return amount > 0 ? '미납' : '완납';
    return paid >= amount ? '완납' : '부분납';
  }
  function stBadge(c, ref) {
    const st = c.status || statusOf(c.amount, c.paid);
    if (st === '취소') return '<span class="bl-st cancel">취소</span>';
    if (st === '완납') return '<span class="bl-st paid">완납</span>';
    const over = c.dueDate && c.dueDate < (ref || today());
    if (st === '부분납') return '<span class="bl-st ' + (over ? 'over' : 'part') + '">부분납</span>';
    return '<span class="bl-st ' + (over ? 'over' : 'unpaid') + '">' + (over ? '미납' : '대기') + '</span>';
  }
  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); else alert(m); }
  function fail(e) { console.error('[수납]', e); alert('처리 중 오류가 났어요.\n' + (e && (e.code || e.message) || e)); }
  const classById = (id) => S.classes.find((c) => c.id === id);
  const studentById = (id) => S.students.find((s) => s.id === id);
  function branchShort(b) { return b === '평촌관' ? '평촌' : b === '산본관' ? '산본' : (b || ''); }
  function sortKo(a, b) { return String(a).localeCompare(String(b), 'ko'); }
  function activeEnrolls(s, on) { const d = on || today(); return (s.enrollments || []).filter((e) => (!e.start || e.start <= d) && (!e.end || e.end >= d)); }
  function classNames(s) { const a = activeEnrolls(s).map((e) => e.className); return a.length ? a.join(', ') : '수강반 없음'; }

  // ── 창(모달) ───────────────────────────────────────────────
  function modal(opt) {
    const bg = document.createElement('div');
    bg.className = 'bl-modal-bg';
    bg.innerHTML = '<div class="bl-modal' + (opt.wide ? ' wide' : '') + '"><header><h4>' + esc(opt.title) + '</h4><button type="button" data-x>×</button></header>' +
      '<div class="bd">' + opt.body + '</div><footer></footer></div>';
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.querySelector('[data-x]').onclick = close;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg._down = true; });
    bg.addEventListener('mouseup', (e) => { if (e.target === bg && bg._down) close(); bg._down = false; });
    const foot = bg.querySelector('footer');
    (opt.buttons || [{ label: '닫기', cls: 'btn-secondary' }]).forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'btn btn-sm ' + (b.cls || 'btn-secondary'); el.textContent = b.label;
      el.onclick = async () => {
        if (!b.onClick) { close(); return; }
        el.disabled = true; const t = el.textContent; el.textContent = '처리 중...';
        try { const r = await b.onClick(bg.querySelector('.bl-modal')); if (r !== false) close(); }
        catch (e) { fail(e); }
        finally { el.disabled = false; el.textContent = t; }
      };
      foot.appendChild(el);
    });
    document.body.appendChild(bg);
    const first = bg.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    if (opt.onOpen) opt.onOpen(bg.querySelector('.bl-modal'));
    return { root: bg.querySelector('.bl-modal'), close };
  }
  const val = (root, sel) => { const el = root.querySelector(sel); return el ? el.value.trim() : ''; };
  const chk = (root, sel) => { const el = root.querySelector(sel); return !!(el && el.checked); };
  function opts(list, cur, empty) {
    return (empty != null ? '<option value="">' + esc(empty) + '</option>' : '') +
      list.map((o) => { const v = typeof o === 'object' ? o.v : o; const l = typeof o === 'object' ? o.l : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  }
  function classOpts(cur, empty, branch) {
    const list = S.classes.filter((c) => c.active !== false && (!branch || c.branch === branch))
      .sort((a, b) => sortKo(a.branch + a.name, b.branch + b.name))
      .map((c) => ({ v: c.id, l: branchShort(c.branch) + ' · ' + c.name + (c.fee ? ' (' + won(c.fee) + ')' : '') }));
    return opts(list, cur, empty);
  }

  // ── 불러오기 ───────────────────────────────────────────────
  async function loadAll(force) {
    if (S.loaded && !force) return;
    if (S.loading) return S.loading;
    S.loading = (async () => {
      const F = await fsx();
      const [st, cl, bs, bk] = await Promise.all([
        getDoc(doc(db, C.settings, 'main')),
        getDocs(collection(db, C.classes)),
        getDocs(collection(db, C.students)),
        getDocs(collection(db, C.books)),
      ]);
      S.settings = { ...DEFAULT_SETTINGS, ...(st.exists() ? st.data() : {}) };
      if (!S.settings.autoStartMonth) {
        S.settings.autoStartMonth = ymOf(today());
        await setDoc(doc(db, C.settings, 'main'), { autoStartMonth: S.settings.autoStartMonth, genDay: S.settings.genDay, notifyDays: S.settings.notifyDays,
          cardCompanies: S.settings.cardCompanies, etcItems: S.settings.etcItems }, { merge: true });
      }
      S.classes = cl.docs.map((d) => ({ id: d.id, ...d.data() }));
      S.students = bs.docs.map((d) => ({ id: d.id, ...d.data() }));
      S.books = bk.docs.map((d) => ({ id: d.id, ...d.data() }));
      // 청구: 아직 안 낸 것 전부 + 최근 4개월
      S.charges = new Map();
      const from = addMonths(ymOf(today()), -3);
      const [open, recent] = await Promise.all([
        getDocs(query(collection(db, C.charges), where('status', 'in', ['미납', '부분납']))),
        getDocs(query(collection(db, C.charges), where('month', '>=', from))),
      ]);
      open.forEach((d) => S.charges.set(d.id, { id: d.id, ...d.data() }));
      recent.forEach((d) => S.charges.set(d.id, { id: d.id, ...d.data() }));
      S.loaded = true;
      try { S.lastSync = await syncWithHomepage(F); const m = syncMsg(S.lastSync); if (m) setTimeout(() => toast(m), 300); } catch (e) { console.error('[수납] 홈페이지 연동 실패', e); }
      try { S.lastAuto = await autoGenerate(F); } catch (e) { console.error('[수납] 자동 발생 실패', e); S.lastAuto = { error: e.message || String(e) }; }
    })();
    try { await S.loading; } finally { S.loading = null; }
  }
  BL.reload = async (rerender) => { await loadAll(true); if (rerender) rerender(); };

  // ── 수강료 자동 발생 ──────────────────────────────────────
  function autoTargets() {
    const t = today();
    // 매월 genDay일(기본 20일)이 되면 다음 달 수강료까지 미리 만듦 (아카와 같은 방식)
    const gd = Math.min(28, Math.max(1, Number(S.settings.genDay) || 20));
    const limit = Number(t.slice(8, 10)) >= gd ? dueOf(addMonths(ymOf(t), 1), 31) : dueOf(ymOf(t), 31);
    const lower = [S.settings.autoStartMonth || ymOf(t), addMonths(ymOf(t), -2)].sort().pop();
    const out = [];
    S.students.forEach((s) => {
      if (s.status !== '재원' || !s.payDay) return;
      // 아카에서 옮겨 온 학생은 아카 마지막 청구 다음 달부터 (autoFrom)
      const low = s.autoFrom && s.autoFrom > lower ? s.autoFrom : lower;
      (s.enrollments || []).forEach((e) => {
        if (e.auto === false) return;
        const amount = (Number(e.fee) || 0) - (Number(e.discount) || 0);
        if (amount <= 0) return;
        const startM = e.start ? ymOf(e.start) : low;
        monthsBetween(startM > low ? startM : low, ymOf(limit)).forEach((m) => {
          const due = dueOf(m, Number(s.payDay));
          if (due > limit) return;
          if (e.start && due < e.start) return;
          if (e.end && due > e.end) return;
          // 아카에서 가져온 날까지의 청구는 아카 자료가 기준 → 그 날짜 이후 납입기한만 새로 만듦
          if (s.autoAfter && due <= s.autoAfter) return;
          const id = 'auto_' + s.id + '_' + e.id + '_' + m;
          if (S.charges.has(id)) return;
          out.push({ id, data: {
            bsId: s.id, studentName: s.name, branch: s.branch || '', classId: e.classId || '', className: e.className || '',
            item: '수강료', title: '(수강료) ' + (e.className || ''), month: m, dueDate: due,
            amount, paid: 0, status: '미납', auto: true, enrollId: e.id,
            note: e.discount ? ('할인 ' + won(e.discount) + (e.discountReason ? ' · ' + e.discountReason : '')) : '',
          } });
        });
      });
    });
    return out;
  }
  async function autoGenerate(F) {
    const list = autoTargets();
    let made = 0;
    const one = async (t) => {
      const ref = doc(db, C.charges, t.id);
      // 같은 청구가 이미 있으면 건드리지 않음 (두 사람이 동시에 열어도 한 번만 생김)
      const existing = await F.runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        if (cur.exists()) return cur.data();
        tx.set(ref, { ...t.data, createdAt: F.serverTimestamp(), createdBy: '자동 발생' });
        return null;
      });
      if (existing) S.charges.set(t.id, { id: t.id, ...existing });
      else { S.charges.set(t.id, { id: t.id, ...t.data }); made++; }
    };
    for (let i = 0; i < list.length; i += 10) await Promise.all(list.slice(i, i + 10).map(one));
    S.autoMade = (S.autoMade || 0) + made;
    return { made, at: new Date() };
  }
  BL.runAuto = async () => {
    try { await loadAll(); const r = await autoGenerate(await fsx()); S.lastAuto = r; toast(r.made ? '수강료 ' + r.made + '건을 새로 발생했어요' : '새로 발생할 수강료가 없어요'); rerenderAll(); }
    catch (e) { fail(e); }
  };

  // ── 청구 · 납입 처리 (공용) ───────────────────────────────
  async function addCharge(s, d) {
    const F = await fsx();
    const amount = num(d.amount);
    const data = {
      bsId: s.id, studentName: s.name, branch: s.branch || '', classId: d.classId || '', className: d.className || '',
      item: d.item, title: d.title, month: ymOf(d.dueDate), dueDate: d.dueDate, amount, paid: 0,
      status: statusOf(amount, 0), auto: false, note: d.note || '', createdAt: F.serverTimestamp(), createdBy: who(),
    };
    if (d.bookId) { data.bookId = d.bookId; data.qty = d.qty || 1; }
    if (d.enrollId) data.enrollId = d.enrollId;
    const ref = d.id ? doc(db, C.charges, d.id) : doc(collection(db, C.charges));
    await setDoc(ref, data);
    S.charges.set(ref.id, { id: ref.id, ...data });
    return ref.id;
  }

  async function payCharges(s, charges, p) {
    const F = await fsx();
    const total = num(p.amount);
    if (total <= 0) throw new Error('납입액을 입력해 주세요');
    const payRef = doc(collection(db, C.payments));
    await F.runTransaction(db, async (tx) => {
      const refs = charges.map((c) => doc(db, C.charges, c.id));
      const snaps = [];
      for (const r of refs) snaps.push(await tx.get(r));
      let left = total;
      const alloc = [];
      snaps.forEach((sn) => {
        if (!sn.exists() || left <= 0) return;
        const c = sn.data();
        if (c.status === '취소') return;
        const need = Math.max(0, (c.amount || 0) - (c.paid || 0));
        const a = Math.min(need, left);
        if (a <= 0) return;
        left -= a;
        const paid = (c.paid || 0) + a;
        tx.update(sn.ref, { paid, status: statusOf(c.amount || 0, paid), lastPaidAt: p.date });
        alloc.push({ chargeId: sn.id, amount: a, title: c.title || '', month: c.month || '', dueDate: c.dueDate || '' });
      });
      if (!alloc.length) throw new Error('납입할 청구가 없어요 (이미 완납이거나 취소됨)');
      if (left > 0) { alloc[alloc.length - 1].amount += left; const last = alloc[alloc.length - 1];
        const sn = snaps.find((x) => x.id === last.chargeId); const c = sn.data();
        const paid = (c.paid || 0) + last.amount; tx.update(sn.ref, { paid, status: statusOf(c.amount || 0, paid), lastPaidAt: p.date }); }
      tx.set(payRef, {
        bsId: s.id, studentName: s.name, branch: s.branch || '', kind: '납입', date: p.date, amount: total,
        method: p.method, cardCompany: p.method === '카드' ? (p.cardCompany || '') : '',
        allocations: alloc, memo: p.memo || '',
        cash: { need: !!p.cashNeed, issued: !!p.cashIssued, issuedDate: p.cashIssued ? (p.cashDate || p.date) : '', approvalNo: p.cashNo || '' },
        by: who(), createdAt: F.serverTimestamp(), canceled: false,
      });
    });
    // 화면용 갱신
    for (const c of charges) { const sn = await getDoc(doc(db, C.charges, c.id)); if (sn.exists()) S.charges.set(c.id, { id: c.id, ...sn.data() }); }
    return payRef.id;
  }

  async function cancelPayment(pay) {
    const F = await fsx();
    await F.runTransaction(db, async (tx) => {
      const pRef = doc(db, C.payments, pay.id);
      const pSn = await tx.get(pRef);
      if (!pSn.exists() || pSn.data().canceled) throw new Error('이미 취소된 납입이에요');
      const p = pSn.data();
      const snaps = [];
      for (const a of (p.allocations || [])) snaps.push([a, await tx.get(doc(db, C.charges, a.chargeId))]);
      snaps.forEach(([a, sn]) => {
        if (!sn.exists()) return;
        const c = sn.data();
        const paid = Math.max(0, (c.paid || 0) - (a.amount || 0));
        tx.update(sn.ref, { paid, status: c.status === '취소' ? '취소' : statusOf(c.amount || 0, paid) });
      });
      tx.update(pRef, { canceled: true, canceledAt: today(), canceledBy: who() });
    });
    for (const a of (pay.allocations || [])) { const sn = await getDoc(doc(db, C.charges, a.chargeId)); if (sn.exists()) S.charges.set(sn.id, { id: sn.id, ...sn.data() }); }
  }

  async function cancelCharge(c, reason) {
    const F = await fsx();
    if ((c.paid || 0) > 0) throw new Error('납입된 금액이 있어요. 납입 이력에서 납입 취소를 먼저 해 주세요');
    const hist = (c.history || []).concat([{ at: today(), by: who(), text: '청구 취소' + (reason ? ' · ' + reason : '') }]);
    await updateDoc(doc(db, C.charges, c.id), { status: '취소', history: hist });
    if (c.bookId) {
      await updateDoc(doc(db, C.books, c.bookId), { stock: F.increment(c.qty || 1) });
      await addDoc(collection(db, C.moves), { bookId: c.bookId, bookName: c.title || '', type: '판매취소', qty: c.qty || 1, date: today(),
        bsId: c.bsId, studentName: c.studentName || '', chargeId: c.id, memo: reason || '', by: who(), createdAt: F.serverTimestamp() });
      const b = S.books.find((x) => x.id === c.bookId); if (b) b.stock = (b.stock || 0) + (c.qty || 1);
    }
    S.charges.set(c.id, { ...c, status: '취소', history: hist });
  }

  function payModal(s, charges, after) {
    const sum = charges.reduce((a, c) => a + remain(c), 0);
    const cards = S.settings.cardCompanies || [];
    const body =
      '<div class="bl-box"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">' + esc(s.name) + ' · 선택한 청구 ' + charges.length + '건</div>' +
      charges.map((c) => '<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0;"><span>' + esc(c.title) + ' <small style="color:var(--muted)">' + shortD(c.dueDate) + '</small></span><b>' + won(remain(c)) + '원</b></div>').join('') +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;border-top:1px solid var(--bl-line);padding-top:8px;"><span>남은 금액 합계</span><span class="bl-total">' + won(sum) + '원</span></div></div>' +
      '<div class="row"><label class="bl-f"><span>납입일</span><input type="date" class="bl-in" data-k="date" value="' + today() + '"></label>' +
      '<label class="bl-f"><span>납입액</span><input class="bl-in num" data-k="amount" value="' + won(sum) + '" inputmode="numeric"></label></div>' +
      '<div class="bl-f"><span>납입 형태</span><div class="bl-chips" data-k="method">' + METHODS.map((m, i) => '<button type="button" class="bl-chip' + (i === 0 ? ' on' : '') + '" data-v="' + m + '">' + m + '</button>').join('') + '</div></div>' +
      '<label class="bl-f" data-k="cardwrap" hidden><span>카드사</span><select class="bl-in" data-k="card">' + opts(cards, '', '선택') + '</select></label>' +
      '<div class="bl-box gold" data-k="cashwrap"><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">' +
      '<label class="bl-chk"><input type="checkbox" data-k="cashNeed" checked> 현금영수증 발행 대상</label>' +
      '<label class="bl-chk"><input type="checkbox" data-k="cashIssued"> 카드기에서 이미 발행함</label>' +
      '<input class="bl-in w140" data-k="cashNo" placeholder="승인번호 (선택)"></div>' +
      '<div class="bl-note" style="margin-top:6px;">발행 대상인데 아직 발행 안 했으면 현금영수증 메뉴의 "미발행"에 남아요.</div></div>' +
      '<label class="bl-f"><span>메모</span><input class="bl-in" data-k="memo" placeholder="예: 10월분 · 어머님 계좌이체"></label>' +
      '<div class="bl-note">납입액이 합계보다 적으면 기한이 빠른 청구부터 채우고 나머지는 부분납으로 남아요.</div>';
    modal({ title: '납입 처리', body,
      onOpen: (root) => {
        const chips = root.querySelector('[data-k=method]');
        const sync = () => {
          const m = chips.querySelector('.on').dataset.v;
          root.querySelector('[data-k=cardwrap]').hidden = m !== '카드';
          root.querySelector('[data-k=cashwrap]').hidden = m === '카드' || m === '결제선생';
          root.querySelector('[data-k=cashNeed]').checked = CASH_METHODS.includes(m);
        };
        chips.addEventListener('click', (e) => { const b = e.target.closest('.bl-chip'); if (!b) return; chips.querySelectorAll('.bl-chip').forEach((x) => x.classList.toggle('on', x === b)); sync(); });
        const amt = root.querySelector('[data-k=amount]');
        amt.addEventListener('blur', () => { amt.value = won(num(amt.value)); });
        sync();
      },
      buttons: [{ label: '취소' }, { label: '납입 처리', cls: 'btn-primary', onClick: async (root) => {
        const method = root.querySelector('[data-k=method] .on').dataset.v;
        const cashShown = !root.querySelector('[data-k=cashwrap]').hidden;
        const p = { date: val(root, '[data-k=date]'), amount: val(root, '[data-k=amount]'), method, cardCompany: val(root, '[data-k=card]'),
          memo: val(root, '[data-k=memo]'), cashNeed: cashShown && chk(root, '[data-k=cashNeed]'), cashIssued: cashShown && chk(root, '[data-k=cashIssued]'), cashNo: val(root, '[data-k=cashNo]') };
        if (!p.date) { alert('납입일을 넣어 주세요'); return false; }
        if (num(p.amount) > sum && !confirm('납입액이 남은 금액보다 ' + won(num(p.amount) - sum) + '원 많아요. 그대로 처리할까요?')) return false;
        await payCharges(s, charges, p);
        toast(s.name + ' ' + won(num(p.amount)) + '원 납입 처리했어요');
        after && after();
      } }] });
  }

  function chargeModal(s, after, preset) {
    const pre = preset || {};
    const etc = S.settings.etcItems || [];
    const en = activeEnrolls(s);
    const body =
      '<div class="bl-f"><span>청구 항목</span><div class="bl-chips" data-k="item">' + ITEMS.map((m) => '<button type="button" class="bl-chip' + ((pre.item || '수강료') === m ? ' on' : '') + '" data-v="' + m + '">' + m + '</button>').join('') + '</div></div>' +
      '<div class="row"><label class="bl-f" data-k="classwrap"><span>반</span><select class="bl-in" data-k="classId">' + classOpts(pre.classId || (en[0] && en[0].classId) || '', '반 선택 안 함') + '</select></label>' +
      '<label class="bl-f" data-k="etcwrap" hidden><span>기타 항목</span><select class="bl-in" data-k="etc">' + opts(etc, etc[0] || '') + '</select></label>' +
      '<label class="bl-f"><span>내용 (영수 내역에 표시)</span><input class="bl-in" data-k="title" placeholder="비우면 자동으로 채워요"></label></div>' +
      '<div class="row"><label class="bl-f"><span>청구 금액</span><input class="bl-in num" data-k="amount" inputmode="numeric" value="' + (pre.amount ? won(pre.amount) : '') + '"></label>' +
      '<label class="bl-f"><span>납입 기한</span><input type="date" class="bl-in" data-k="due" value="' + (pre.dueDate || today()) + '"></label></div>' +
      '<label class="bl-f"><span>메모</span><input class="bl-in" data-k="note" placeholder="예: 과외 1회분 · 11월 특강"></label>' +
      '<div class="bl-note">과외처럼 한 번만 받는 수강료도 여기서 발생시키면 돼요. 매달 자동 발생과는 따로 관리돼요.</div>';
    modal({ title: '청구 추가 · ' + s.name, body,
      onOpen: (root) => {
        const chips = root.querySelector('[data-k=item]');
        const cls = root.querySelector('[data-k=classId]');
        const amt = root.querySelector('[data-k=amount]');
        const sync = () => { const it = chips.querySelector('.on').dataset.v; root.querySelector('[data-k=etcwrap]').hidden = it !== '기타'; };
        chips.addEventListener('click', (e) => { const b = e.target.closest('.bl-chip'); if (!b) return; chips.querySelectorAll('.bl-chip').forEach((x) => x.classList.toggle('on', x === b)); sync(); });
        cls.addEventListener('change', () => {
          if (amt.value) return;
          const e = (s.enrollments || []).find((x) => x.classId === cls.value);
          const c = classById(cls.value);
          const fee = e ? (Number(e.fee) || 0) - (Number(e.discount) || 0) : (c ? c.fee : 0);
          if (fee) amt.value = won(fee);
        });
        amt.addEventListener('blur', () => { if (amt.value) amt.value = won(num(amt.value)); });
        sync();
        if (!pre.amount) cls.dispatchEvent(new Event('change'));
      },
      buttons: [{ label: '취소' }, { label: '청구 발생', cls: 'btn-primary', onClick: async (root) => {
        const item = root.querySelector('[data-k=item] .on').dataset.v;
        const c = classById(val(root, '[data-k=classId]'));
        const amount = num(val(root, '[data-k=amount]'));
        const due = val(root, '[data-k=due]');
        if (!amount) { alert('청구 금액을 넣어 주세요'); return false; }
        if (!due) { alert('납입 기한을 넣어 주세요'); return false; }
        let title = val(root, '[data-k=title]');
        if (!title) title = item === '기타' ? '(' + val(root, '[data-k=etc]') + ')' + (c ? ' ' + c.name : '') : '(' + item + ') ' + (c ? c.name : '');
        await addCharge(s, { item, title, amount, dueDate: due, classId: c ? c.id : '', className: c ? c.name : '', note: val(root, '[data-k=note]') });
        toast(title + ' ' + won(amount) + '원 청구했어요');
        after && after();
      } }] });
  }

  // ═════════════════════════════════════════════════════════
  // 1) 수납 현황
  // ═════════════════════════════════════════════════════════
  window.initBillToday = async function () {
    const root = $('blToday'); if (!root) return;
    const u = S.ui.today;
    u.date = u.date || today(); u.branch = u.branch == null ? '' : u.branch;
    root.innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); await renderToday(); } catch (e) { root.innerHTML = '<div class="bl-empty">불러오지 못했어요: ' + esc(e.message) + '</div>'; console.error(e); }
  };
  async function renderToday() {
    const root = $('blToday'); const u = S.ui.today;
    const d = u.date, prev = addDays(d, -1), mStart = ymOf(d) + '-01';
    const from = prev < mStart ? prev : mStart;
    const ps = await getDocs(query(collection(db, C.payments), where('date', '>=', from)));
    const inB = (x) => !u.branch || x.branch === u.branch;
    const pays = ps.docs.map((x) => ({ id: x.id, ...x.data() })).filter((p) => !p.canceled && p.date <= d && inB(p));
    const sumOn = (fn) => { const l = pays.filter(fn); return { n: l.filter((p) => p.kind !== '환불').length, a: l.reduce((a, p) => a + (p.amount || 0), 0) }; };
    const pPrev = sumOn((p) => p.date === prev), pDay = sumOn((p) => p.date === d), pMon = sumOn((p) => p.date >= mStart);
    const charges = [...S.charges.values()].filter((c) => c.status !== '취소' && inB(c));
    const open = charges.filter((c) => remain(c) > 0);
    const before = open.filter((c) => c.dueDate < d), onDay = open.filter((c) => c.dueDate === d);
    const sumR = (l) => l.reduce((a, c) => a + remain(c), 0);
    const monC = charges.filter((c) => c.month === ymOf(d));
    const monAmt = monC.reduce((a, c) => a + (c.amount || 0), 0), monPaid = monC.reduce((a, c) => a + Math.min(c.paid || 0, c.amount || 0), 0);
    const studs = S.students.filter(inB);
    const cnt = (st) => studs.filter((s) => s.status === st).length;
    const joined = studs.filter((s) => s.joinDate && ymOf(s.joinDate) === ymOf(d)).length;
    const left = studs.filter((s) => s.leaveDate && ymOf(s.leaveDate) === ymOf(d)).length;
    const noPayDay = studs.filter((s) => s.status === '재원' && !s.payDay).length;
    const cashWait = pays.filter((p) => p.cash && p.cash.need && !p.cash.issued).length;
    const nd = Number(S.settings.notifyDays) || 4;
    const notify = open.filter((c) => c.dueDate === addDays(d, nd)).sort((a, b) => sortKo(a.studentName, b.studentName));
    const upcoming = open.filter((c) => c.dueDate > d && c.dueDate <= addDays(d, 7)).sort((a, b) => sortKo(a.dueDate + a.studentName, b.dueDate + b.studentName));
    const overdue = before.slice().sort((a, b) => sortKo(a.dueDate, b.dueDate));
    const dayPays = pays.filter((p) => p.date === d).sort((a, b) => sortKo(a.studentName, b.studentName));
    const auto = S.lastAuto;

    $('blToday').innerHTML =
      '<div class="bl-bar">' +
      '<label class="bl-f"><span>기준일</span><input type="date" class="bl-in" id="blTdDate" value="' + d + '"></label>' +
      '<div class="bl-f"><span>관</span><div class="bl-seg" id="blTdBranch">' + ['', '평촌관', '산본관'].map((b) => '<button type="button" data-v="' + b + '" class="' + (u.branch === b ? 'on' : '') + '">' + (b || '전체') + '</button>').join('') + '</div></div>' +
      '<div class="sp"></div><button class="btn btn-secondary btn-sm" onclick="BL.reload(initBillToday)">↻ 새로고침</button></div>' +
      '<h3 style="margin:0 0 12px;font-size:18px;">' + d.replace(/^(\d+)-(\d+)-(\d+)$/, (m, y, mo, da) => y + '년 ' + Number(mo) + '월 ' + Number(da) + '일') + ' 수납 현황' + (u.branch ? ' · ' + u.branch : '') + '</h3>' +
      '<div class="bl-kpis">' +
      '<div class="bl-kpi"><h4>납부 현황<button type="button" onclick="adminOpenMenu(\'billreceipt\')">현금영수증 ›</button></h4><table><tr><th></th><th>전일</th><th>당일</th><th>월누계</th></tr>' +
      '<tr><td>건수</td><td>' + pPrev.n + '</td><td>' + pDay.n + '</td><td>' + pMon.n + '</td></tr>' +
      '<tr><td>금액</td><td>' + won(pPrev.a) + '</td><td class="big">' + won(pDay.a) + '</td><td class="big">' + won(pMon.a) + '</td></tr></table></div>' +
      '<div class="bl-kpi"><h4>미납 현황<button type="button" onclick="adminOpenMenu(\'billunpaid\')">미납 조회 ›</button></h4><table><tr><th></th><th>이전 미납</th><th>당일 미납</th></tr>' +
      '<tr><td>건수</td><td class="red">' + before.length + '</td><td>' + onDay.length + '</td></tr>' +
      '<tr><td>금액</td><td class="red big">' + won(sumR(before)) + '</td><td>' + won(sumR(onDay)) + '</td></tr></table></div>' +
      '<div class="bl-kpi"><h4>' + Number(ymOf(d).slice(5)) + '월 청구 대비 납입</h4><table><tr><th></th><th>청구</th><th>납입</th><th>납입률</th></tr>' +
      '<tr><td>건수</td><td>' + monC.length + '</td><td>' + monC.filter((c) => c.status === '완납').length + '</td><td></td></tr>' +
      '<tr><td>금액</td><td>' + won(monAmt) + '</td><td>' + won(monPaid) + '</td><td class="big">' + (monAmt ? (monPaid / monAmt * 100).toFixed(1) : '0.0') + '%</td></tr></table></div>' +
      '<div class="bl-kpi"><h4>학생 인원<button type="button" onclick="adminOpenMenu(\'billstudent\')">학생 수납 ›</button></h4><table><tr><th></th><th>재원</th><th>휴원</th><th>이번달 신규</th><th>이번달 퇴원</th></tr>' +
      '<tr><td>인원</td><td class="big">' + cnt('재원') + '</td><td>' + cnt('휴원') + '</td><td>' + joined + '</td><td>' + left + '</td></tr></table>' +
      (noPayDay ? '<div class="bl-note" style="margin-top:8px;color:var(--bl-amber);">⚠ 납입일이 없는 재원생 ' + noPayDay + '명 — 자동 발생이 안 돼요</div>' : '') + '</div>' +
      '<div class="bl-kpi"><h4>현금영수증</h4><table><tr><th></th><th>이번 달 미발행</th></tr><tr><td>건수</td><td class="' + (cashWait ? 'red ' : '') + 'big">' + cashWait + '</td></tr></table></div>' +
      '<div class="bl-kpi"><h4>수강료 자동 발생<button type="button" onclick="BL.runAuto()">지금 실행</button></h4><div class="bl-note">' +
      (auto && auto.error ? '<span style="color:var(--bl-red)">실패: ' + esc(auto.error) + '</span>' : auto ? '이번 접속에서 ' + (S.autoMade || 0) + '건 새로 발생' : '아직 실행 전') +
      '<br>매월 ' + (S.settings.genDay || 20) + '일에 다음 달 수강료가 생겨요 · 시작 월 ' + esc(S.settings.autoStartMonth) + '</div></div>' +
      '</div>' +
      '<div class="card"><h3>오늘 납입 (' + dayPays.length + '건)</h3>' + payTable(dayPays, true) + '</div>' +
      '<div class="card"><h3>기한 지난 미납 (' + overdue.length + '건 · ' + won(sumR(overdue)) + '원)</h3>' + chargeList(overdue, d) + '</div>' +
      '<div class="card"><h3>납입 안내 카톡 대상 — 납입일 ' + nd + '일 전 (' + notify.length + '건)</h3><div class="bl-note" style="margin-bottom:8px;">' + shortD(addDays(d, nd)) + ' 납입 예정인 미납 청구예요. 카카오 알림톡·결제 연동 뒤에는 이 학생들에게 납입 안내와 인터넷 결제 링크가 자동으로 가요.</div>' + chargeList(notify, d) + '</div>' +
      '<div class="card"><h3>7일 안에 납입 예정 (' + upcoming.length + '건)</h3>' + chargeList(upcoming, d) + '</div>';

    $('blTdDate').onchange = (e) => { u.date = e.target.value || today(); renderToday(); };
    $('blTdBranch').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; u.branch = b.dataset.v; renderToday(); };
  }
  function payTable(list, showStudent) {
    if (!list.length) return '<div class="bl-empty">없어요</div>';
    return '<div class="bl-tw mid"><table class="bl-t"><thead><tr>' + (showStudent ? '<th>학생</th>' : '') + '<th>납입기한</th><th>납입일</th><th>구분</th><th class="r">금액</th><th>형태</th><th>내역</th><th>현금영수증</th><th>처리자</th>' + (showStudent ? '' : '<th></th>') + '</tr></thead><tbody>' +
      list.map((p) => '<tr class="' + (p.canceled ? 'off' : '') + '">' +
        (showStudent ? '<td><button class="lnk" onclick="BL.openStudent(\'' + p.bsId + '\')">' + esc(p.studentName) + '</button> <small style="color:var(--muted)">' + branchShort(p.branch) + '</small></td>' : '') +
        '<td>' + dueCell(p) + '</td><td>' + shortD(p.date) + paidLate(p) + '</td><td>' + (p.kind === '환불' ? '<span class="bl-st unpaid">환불</span>' : p.canceled ? '<span class="bl-st cancel">취소</span>' : '납입') + '</td>' +
        '<td class="r"><b>' + won(p.amount) + '</b></td><td>' + esc(p.method || '') + (p.cardCompany ? ' · ' + esc(p.cardCompany) : '') + '</td>' +
        '<td class="wrap">' + esc((p.allocations || []).map((a) => a.title).join(', ') || p.memo || '') + '</td>' +
        '<td>' + cashCell(p) + '</td><td>' + esc(p.by || '') + '</td>' +
        (showStudent ? '' : '<td>' + (p.canceled ? '<small style="color:var(--muted)">' + esc(p.canceledBy || '') + ' 취소</small>' : '<button class="bl-mini red" onclick="BL.cancelPay(\'' + p.id + '\')">납입 취소</button>') + '</td>') +
        '</tr>').join('') + '</tbody></table></div>';
  }
  // 납입 기록의 납입기한 (연결된 청구에서 · 여러 건이면 가장 빠른 것)
  function payDues(p) {
    return (p.allocations || []).map((a) => a.dueDate || (S.charges.get(a.chargeId) || {}).dueDate || '').filter(Boolean).sort();
  }
  function dueCell(p) {
    const d = payDues(p);
    if (!d.length) return '<span style="color:var(--muted)">-</span>';
    return shortD(d[0]) + (d.length > 1 && d[d.length - 1] !== d[0] ? ' <small style="color:var(--muted)">외 ' + (new Set(d).size - 1) + '</small>' : '');
  }
  function paidLate(p) {
    const d = payDues(p)[0];
    if (!d || !p.date || p.kind === '환불') return '';
    const n = daysBetween(d, p.date);
    if (n > 0) return ' <small style="color:var(--bl-red);font-weight:700">(' + n + '일 늦음)</small>';
    if (n < 0) return ' <small style="color:var(--bl-green)">(' + (-n) + '일 먼저)</small>';
    return ' <small style="color:var(--bl-green)">(당일)</small>';
  }
  function cashCell(p) {
    if (p.canceled || p.kind === '환불') return '';
    const c = p.cash || {};
    if (!c.need) return '<button class="bl-mini" title="현금영수증 발행 대상으로 표시" onclick="BL.cashToggleNeed(\'' + p.id + '\',true)">대상 아님</button>';
    if (c.issued) return '<button class="bl-mini" title="' + esc(c.approvalNo || '') + '" onclick="BL.cashUnissue(\'' + p.id + '\')"><span style="color:var(--bl-green);font-weight:700">발행 ✓</span> ' + shortD(c.issuedDate) + '</button>';
    return '<button class="bl-mini red" onclick="BL.cashIssue(\'' + p.id + '\')"><span style="color:var(--bl-red);font-weight:700">미발행</span> → 발행 완료</button>';
  }
  function chargeList(list, ref) {
    if (!list.length) return '<div class="bl-empty">없어요</div>';
    const ph = (id) => { const s = studentById(id); return s ? (s.parentPhone || s.phone || '') : ''; };
    return '<div class="bl-tw mid"><table class="bl-t"><thead><tr><th>학생</th><th>관</th><th>내역</th><th>납입기한</th><th class="r">청구액</th><th class="r">남은 금액</th><th>상태</th><th>미납 사유</th><th>학부모 연락처</th></tr></thead><tbody>' +
      list.map((c) => '<tr><td><button class="lnk" onclick="BL.openStudent(\'' + c.bsId + '\')">' + esc(c.studentName) + '</button></td><td>' + branchShort(c.branch) + '</td><td>' + esc(c.title) + '</td>' +
        '<td>' + shortD(c.dueDate) + (c.dueDate < ref ? ' <small style="color:var(--bl-red)">(' + daysBetween(c.dueDate, ref) + '일)</small>' : '') + '</td>' +
        '<td class="r">' + won(c.amount) + '</td><td class="r"><b>' + won(remain(c)) + '</b></td><td>' + stBadge(c, ref) + '</td>' +
        '<td class="wrap">' + esc(c.unpaidReason || '') + '</td><td>' + esc(ph(c.bsId)) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  // ── 현금영수증 표시 (여러 화면 공용) ──
  async function payDoc(id) { const sn = await getDoc(doc(db, C.payments, id)); if (!sn.exists()) throw new Error('납입 기록이 없어요'); return { id, ...sn.data() }; }
  BL.cashIssue = (id) => {
    modal({ title: '현금영수증 발행 완료', body:
      '<div class="row"><label class="bl-f"><span>발행일</span><input type="date" class="bl-in" data-k="d" value="' + today() + '"></label>' +
      '<label class="bl-f"><span>승인번호 (선택)</span><input class="bl-in" data-k="no"></label></div>' +
      '<div class="bl-note">카드기에서 발행한 뒤 여기 표시만 해 두면 돼요.</div>',
      buttons: [{ label: '취소' }, { label: '발행 완료로 표시', cls: 'btn-primary', onClick: async (r) => {
        const p = await payDoc(id);
        await updateDoc(doc(db, C.payments, id), { cash: { ...(p.cash || {}), need: true, issued: true, issuedDate: val(r, '[data-k=d]') || today(), approvalNo: val(r, '[data-k=no]'), issuedBy: who() } });
        toast('현금영수증 발행 완료로 표시했어요'); rerenderAll();
      } }] });
  };
  BL.cashUnissue = async (id) => {
    if (!confirm('발행 완료 표시를 되돌릴까요?')) return;
    try { const p = await payDoc(id); await updateDoc(doc(db, C.payments, id), { cash: { ...(p.cash || {}), issued: false, issuedDate: '', approvalNo: '' } }); rerenderAll(); } catch (e) { fail(e); }
  };
  BL.cashToggleNeed = async (id, need) => {
    try { const p = await payDoc(id); await updateDoc(doc(db, C.payments, id), { cash: { ...(p.cash || {}), need: !!need, issued: need ? !!(p.cash && p.cash.issued) : false } }); rerenderAll(); } catch (e) { fail(e); }
  };
  BL.cancelPay = async (id) => {
    try {
      const p = await payDoc(id);
      if (!confirm(p.studentName + ' ' + won(p.amount) + '원 ' + (p.kind === '환불' ? '환불 기록' : '납입') + '을 취소할까요?\n연결된 청구는 다시 미납으로 돌아가요.')) return;
      await cancelPayment(p); toast('취소했어요'); rerenderAll();
    } catch (e) { fail(e); }
  };

  // ═════════════════════════════════════════════════════════
  // 2) 학생 수납
  // ═════════════════════════════════════════════════════════
  window.initBillStudent = async function () {
    const root = $('blStudent'); if (!root) return;
    if (!root.dataset.built) {
      root.dataset.built = '1';
      root.innerHTML =
        '<div class="bl-split"><aside class="bl-side">' +
        '<input class="bl-in" id="blSq" placeholder="이름 · 전화번호 · 반 검색">' +
        '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"><div class="bl-seg" id="blSf">' + ['재원', '휴원', '퇴원', '전체'].map((x) => '<button type="button" data-v="' + x + '">' + x + '</button>').join('') + '</div>' +
        '<select class="bl-in" id="blSb" style="flex:1;"><option value="">전체 관</option><option>평촌관</option><option>산본관</option></select></div>' +
        '<div class="bl-slist" id="blSlist"></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">' +
        '<button class="btn btn-secondary btn-sm" onclick="BL.newStudent()">+ 수납 학생 직접 추가</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="BL.importFromHomepage()">⇣ 홈페이지 학생 불러오기</button></div>' +
        '</aside><div id="blScard"><div class="card"><div class="bl-empty">왼쪽에서 학생을 고르세요.</div></div></div></div>';
      $('blSq').oninput = (e) => { S.ui.student.q = e.target.value; renderSlist(); };
      $('blSf').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.ui.student.filter = b.dataset.v; renderSlist(); };
      $('blSb').onchange = (e) => { S.ui.student.branch = e.target.value; renderSlist(); };
    }
    $('blSlist').innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); renderSlist(); if (S.cur.student) renderScard(); } catch (e) { fail(e); }
  };
  function renderSlist() {
    const u = S.ui.student;
    $('blSf').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === u.filter));
    const q = (u.q || '').replace(/\s+/g, '').toLowerCase();
    const openBy = {};
    S.charges.forEach((c) => { if (c.status !== '취소' && remain(c) > 0 && c.dueDate < today()) openBy[c.bsId] = true; });
    const list = S.students.filter((s) => (u.filter === '전체' || s.status === u.filter) && (!u.branch || s.branch === u.branch) &&
      (!q || (s.name + (s.parentPhone || '') + (s.phone || '') + classNames(s) + (s.acaNo || '')).replace(/[\s-]/g, '').toLowerCase().includes(q.replace(/-/g, ''))))
      .sort((a, b) => sortKo(a.name, b.name));
    $('blSlist').innerHTML = (list.length ? list.map((s) =>
      '<div class="bl-sitem' + (S.cur.student === s.id ? ' on' : '') + (s.status !== '재원' ? ' off' : '') + '" onclick="BL.openStudent(\'' + s.id + '\',true)">' +
      '<span class="n">' + esc(s.name) + '</span><span class="m">' + esc(branchShort(s.branch)) + ' · ' + esc(classNames(s)) + '</span>' + (openBy[s.id] ? '<span class="d" title="기한 지난 미납"></span>' : '') + '</div>').join('')
      : '<div class="bl-empty">' + (S.students.length ? '해당하는 학생이 없어요' : '아직 수납 학생이 없어요.<br>아래 "홈페이지 학생 불러오기"를 눌러 주세요.') + '</div>');
  }
  BL.openStudent = async (id, inPlace) => {
    S.cur.student = id;
    if (!inPlace) { adminOpenMenu('billstudent'); return; }
    renderSlist(); renderScard();
  };
  async function renderScard() {
    const s = studentById(S.cur.student);
    const box = $('blScard'); if (!s) { box.innerHTML = '<div class="card"><div class="bl-empty">학생을 찾을 수 없어요.</div></div>'; return; }
    box.innerHTML = '<div class="card"><div class="bl-empty">불러오는 중...</div></div>';
    const [cs, ps] = await Promise.all([
      getDocs(query(collection(db, C.charges), where('bsId', '==', s.id))),
      getDocs(query(collection(db, C.payments), where('bsId', '==', s.id))),
    ]);
    if (S.cur.student !== s.id) return;
    const charges = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
    charges.forEach((c) => S.charges.set(c.id, c));
    charges.sort((a, b) => sortKo(b.dueDate || '', a.dueDate || ''));
    const pays = ps.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => sortKo((b.date || '') + (b.createdAt ? b.createdAt.seconds : ''), (a.date || '') + (a.createdAt ? a.createdAt.seconds : '')));
    const u = S.ui.student;
    const openC = charges.filter((c) => c.status !== '취소' && remain(c) > 0);
    const shown = u.chargeView === 'open' ? openC.slice().sort((a, b) => sortKo(a.dueDate, b.dueDate)) : charges;
    const totPaid = pays.filter((p) => !p.canceled).reduce((a, p) => a + (p.amount || 0), 0);
    const hp = (window.studentsCache || (typeof studentsCache !== 'undefined' ? studentsCache : [])).find((x) => x.id === s.studentId);
    const t = today();
    S.cur.charges = charges; S.cur.pays = pays;

    box.innerHTML =
      // 기본 정보
      '<div class="card"><div class="bl-head"><h3>' + esc(s.name) + '</h3><span class="bl-tag">' + esc(s.branch || '관 미지정') + '</span>' +
      '<span class="bl-tag ' + (s.status === '재원' ? 'gold' : 'gray') + '">' + esc(s.status || '') + '</span>' +
      (s.payDay ? '<span class="bl-tag">매월 ' + s.payDay + '일 납입</span>' : '<span class="bl-tag gray" style="color:var(--bl-red)">납입일 없음 · 자동 발생 안 됨</span>') +
      (hp ? '<span class="bl-tag gray">' + (hp.status === '퇴원' ? '홈페이지 퇴원' : '홈페이지 계정 연결됨') + '</span>' : '') +
      '<div class="sum"><span>미납 <b style="color:var(--bl-red)">' + won(openC.reduce((a, c) => a + remain(c), 0)) + '원</b></span><span>총 납입 <b>' + won(totPaid) + '원</b></span></div></div>' +
      '<div class="bl-profile" id="blProf">' +
      fld('이름', 'name', s.name) + fldSel('관', 'branch', ['평촌관', '산본관'], s.branch) + fld('학년', 'grade', s.grade, '예: 고2') + fld('학교', 'school', s.school) +
      fld('학부모 연락처', 'parentPhone', s.parentPhone) + fld('학생 연락처', 'phone', s.phone) + fldSel('상태', 'status', ['재원', '휴원', '퇴원'], s.status) + fld('매월 납입일', 'payDay', s.payDay || '', '1~31', 'num') +
      fld('입학일', 'joinDate', s.joinDate, '', 'date') + fld('퇴원일', 'leaveDate', s.leaveDate, '', 'date') + fld('아카 학생번호', 'acaNo', s.acaNo, '아카 이전 때 사용') +
      '<label class="bl-f"><span>홈페이지 학생 연결</span><select class="bl-in" data-p="studentId">' + hpOptions(s.studentId) + '</select></label>' +
      '<label class="bl-f span4"><span>메모</span><textarea class="bl-in" rows="2" data-p="memo">' + esc(s.memo || '') + '</textarea></label></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-primary btn-sm" onclick="BL.saveProfile()">기본 정보 저장</button>' +
      '<span class="sp" style="flex:1"></span><button class="btn btn-danger btn-sm" onclick="BL.deleteStudent()">수납 학생 삭제</button></div></div>' +
      // 수강반
      '<div class="card"><div class="bl-head"><h3>수강반</h3><span class="bl-note">수강료 − 할인 = 매달 청구액. 자동이 켜져 있으면 납입일 기준으로 매달 청구가 생겨요.</span>' +
      '<div class="sum"><button class="btn btn-secondary btn-sm" onclick="BL.addEnroll()">+ 수강반 추가</button></div></div>' +
      enrollTable(s) + '</div>' +
      // 청구
      '<div class="card"><div class="bl-head"><h3>청구 · 미납</h3><div class="bl-seg" id="blCv"><button type="button" data-v="open" class="' + (u.chargeView === 'open' ? 'on' : '') + '">남은 것 (' + openC.length + ')</button><button type="button" data-v="all" class="' + (u.chargeView !== 'open' ? 'on' : '') + '">전체 (' + charges.length + ')</button></div>' +
      '<div class="sum"><button class="btn btn-primary btn-sm" onclick="BL.paySelected()">선택 납입 처리</button><button class="btn btn-secondary btn-sm" onclick="BL.addChargeCur()">+ 청구 추가</button><button class="btn btn-secondary btn-sm" onclick="BL.refund()">환불 기록</button></div></div>' +
      (shown.length ? '<div class="bl-tw mid"><table class="bl-t"><thead><tr><th class="c"><input type="checkbox" id="blCall"></th><th>내역</th><th>납입기한</th><th>납입일</th><th class="r">청구액</th><th class="r">납입액</th><th class="r">남은 금액</th><th>상태</th><th>미납 사유 · 메모</th><th></th></tr></thead><tbody>' +
        shown.map((c) => { const can = c.status !== '취소' && remain(c) > 0; return '<tr class="' + (c.status === '취소' ? 'off' : '') + '">' +
          '<td class="c">' + (can ? '<input type="checkbox" class="blCk" value="' + c.id + '">' : '') + '</td>' +
          '<td>' + esc(c.title) + (c.auto ? ' <small class="bl-tag gray">자동</small>' : '') + '</td><td>' + shortD(c.dueDate) + '</td>' +
          '<td>' + (c.lastPaidAt && (c.paid || 0) > 0 ? shortD(c.lastPaidAt) + (c.lastPaidAt > c.dueDate ? ' <small style="color:var(--bl-red)">(' + daysBetween(c.dueDate, c.lastPaidAt) + '일 늦음)</small>' : '') : '') + '</td>' +
          '<td class="r">' + won(c.amount) + '</td><td class="r">' + won(c.paid) + '</td><td class="r"><b>' + won(c.status === '취소' ? 0 : remain(c)) + '</b></td><td>' + stBadge(c, t) + '</td>' +
          '<td class="wrap">' + esc([c.unpaidReason, c.note].filter(Boolean).join(' · ')) + '</td>' +
          '<td>' + (c.status === '취소' ? '' : '<button class="bl-mini" onclick="BL.editCharge(\'' + c.id + '\')">변경</button> <button class="bl-mini" onclick="BL.reasonCharge(\'' + c.id + '\')">사유</button> ' + ((c.paid || 0) > 0 ? '' : '<button class="bl-mini red" onclick="BL.cancelChargeUI(\'' + c.id + '\')">취소</button>')) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="bl-empty">' + (u.chargeView === 'open' ? '남은 청구가 없어요 👍' : '청구 기록이 없어요') + '</div>') + '</div>' +
      // 납입 이력
      '<div class="card"><div class="bl-head"><h3>납입 이력</h3></div>' + payTable(pays, false) + '</div>';
    // 홈페이지와 연결된 학생: 기본 정보는 홈페이지 학생 정보에서만 고침 (여기서는 잠금)
    if (hp) {
      HP_FIELDS.forEach((k) => { const el = box.querySelector('#blProf [data-p="' + k + '"]'); if (el) { el.disabled = true; el.title = '홈페이지 학생 정보(관리자 화면)에서 고치면 자동으로 바뀌어요'; } });
      const pr = $('blProf'); if (pr) pr.insertAdjacentHTML('afterbegin', '<div class="bl-note span4" style="margin-bottom:4px;">이름·관·학년·학교·연락처는 홈페이지 학생 정보가 기준이라 여기서는 잠겨 있어요. 관리자 화면 학생 관리에서 고치면 자동으로 맞춰져요.' + (hp.status === '퇴원' ? ' <b style="color:var(--bl-red)">홈페이지에서 퇴원 처리된 학생이에요.</b>' : '') + '</div>');
    }

    $('blCv').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; u.chargeView = b.dataset.v; renderScard(); };
    const all = $('blCall'); if (all) all.onchange = () => box.querySelectorAll('.blCk').forEach((x) => { x.checked = all.checked; });
  }
  function fld(label, key, v, ph, type) {
    return '<label class="bl-f"><span>' + label + '</span><input class="bl-in' + (type === 'num' ? ' num' : '') + '" ' + (type === 'date' ? 'type="date" ' : '') + 'data-p="' + key + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"></label>';
  }
  function fldSel(label, key, list, v) { return '<label class="bl-f"><span>' + label + '</span><select class="bl-in" data-p="' + key + '">' + opts(list, v || '', '선택') + '</select></label>'; }
  // ── 홈페이지 ↔ 수납 연동 ───────────────────────────────────
  //  · 학생 기본 정보(이름·관·학년·학교·연락처)는 홈페이지 학생 정보가 기준 → 수납에 자동 반영
  //    (연결된 학생은 수납 화면에서 이 칸들을 고칠 수 없게 잠금 — 한 곳에서만 고치면 됨)
  //  · 홈페이지에 새로 등록된 학생 → 수납 학생으로 자동 추가 (아카에서 가져온 같은 이름 학생이 있으면 그 학생에 연결)
  //  · 홈페이지에서 퇴원 → 수납도 퇴원 / 수납에서 퇴원 → 홈페이지도 퇴원 (기록 보존, 로그인만 막힘)
  //  · 이미 발생한 청구·미납은 퇴원해도 그대로 남음
  //  · 테스트 모드(test_)에서는 홈페이지 쪽은 바꾸지 않음 (홈페이지 → 수납 방향만 반영)
  const HP_FIELDS = ['name', 'branch', 'grade', 'school', 'phone', 'parentPhone'];
  function hpAll() { try { return (typeof studentsCache !== 'undefined' ? studentsCache : []) || []; } catch (e) { return []; } }
  function hpList() { return hpAll().filter((x) => x.status !== '퇴원'); }   // 재원 홈페이지 학생
  function hpById(id) { return id ? hpAll().find((x) => x.id === id) : null; }
  function hpFieldsOf(x) { const o = {}; HP_FIELDS.forEach((k) => { o[k] = String(x[k] == null ? '' : x[k]); }); return o; }

  async function applyLeave(s, date, extra) {
    if (!window.billLeave) throw new Error('퇴원 처리 코드를 불러오지 못했어요. 새로고침해 주세요');
    Object.assign(s, await window.billLeave.leaveBillStudent(P, s, date, extra));
  }
  async function applyRestore(s) {
    if (!window.billLeave) throw new Error('퇴원 처리 코드를 불러오지 못했어요. 새로고침해 주세요');
    Object.assign(s, await window.billLeave.restoreBillStudent(P, s));
  }
  // 수납에서 퇴원/복귀 → 홈페이지 학생도 같이 (실제 운영일 때만)
  async function pushHomepageStatus(s, leave, date) {
    const hp = hpById(s.studentId);
    if (!hp) return '';
    if (P) return ' · 테스트 모드라 홈페이지는 그대로';
    if (leave ? hp.status === '퇴원' : hp.status !== '퇴원') return '';
    try {
      await httpsCallable(functionsInstance, leave ? 'withdrawStudent' : 'restoreStudent')({ uid: hp.id, leaveDate: date });
      hp.status = leave ? '퇴원' : '재원'; if (leave) hp.leaveDate = date;
      return leave ? ' · 홈페이지도 퇴원 처리' : ' · 홈페이지도 복귀';
    } catch (e) { alert('홈페이지 ' + (leave ? '퇴원' : '복귀') + ' 처리 실패: ' + (e.message || e) + '\n관리자 화면 학생 관리에서 직접 해 주세요.'); return ''; }
  }

  // 수납 메뉴를 처음 열 때(새로고침 포함) 홈페이지 명단과 자동으로 맞춤
  async function syncWithHomepage(F) {
    const all = hpAll();
    if (!all.length) return null;
    const r = { added: 0, linked: 0, left: 0, updated: 0, unsure: [] };
    const hpIds = new Map(all.map((x) => [x.id, x]));
    const linkedIds = new Set(S.students.map((s) => s.studentId).filter(Boolean));
    const norm = (n) => String(n || '').replace(/\s+/g, '');
    // 1) 연결된 학생: 퇴원·삭제 반영 + 기본 정보 맞추기
    for (const s of S.students) {
      if (!s.studentId) continue;
      const hp = hpIds.get(s.studentId);
      try {
        if (!hp) {   // 홈페이지에서 완전 삭제됨 → 수납은 퇴원 + 연결 끊기 (수납 기록은 그대로)
          const ex = { studentId: '', hpLeftId: s.studentId, hpLeftAt: today() };
          if (s.status !== '퇴원') { await applyLeave(s, today(), ex); r.left++; }
          else { await updateDoc(doc(db, C.students, s.id), ex); Object.assign(s, ex); }
          continue;
        }
        if (hp.status === '퇴원' && s.status !== '퇴원') { await applyLeave(s, hp.leaveDate || today()); r.left++; }
        const want = hpFieldsOf(hp), patch = {};
        HP_FIELDS.forEach((k) => { if (want[k] && String(s[k] == null ? '' : s[k]) !== want[k]) patch[k] = want[k]; });
        if (Object.keys(patch).length) { await updateDoc(doc(db, C.students, s.id), patch); Object.assign(s, patch); r.updated++; }
      } catch (e) { console.warn('[수납 연동]', s.name, e); }
    }
    // 2) 홈페이지 재원 학생인데 수납에 없음 → 같은 이름(연결 안 된) 학생에 연결, 없으면 새로 추가
    const todo = all.filter((x) => x.status !== '퇴원' && !linkedIds.has(x.id));
    for (const x of todo) {
      try {
        const cand = S.students.filter((s) => !s.studentId && norm(s.name) === norm(x.name) && (!s.branch || !x.branch || s.branch === x.branch));
        if (cand.length === 1) {
          const s = cand[0];
          const patch = { studentId: x.id };
          Object.entries(hpFieldsOf(x)).forEach(([k, v]) => { if (v) patch[k] = v; });
          await updateDoc(doc(db, C.students, s.id), patch); Object.assign(s, patch); r.linked++;
          continue;
        }
        if (cand.length > 1) { r.unsure.push(x.name); continue; }   // 동명이인 → 학생 수납에서 직접 연결
        let cls = x.classGroup ? S.classes.find((c) => c.name === x.classGroup && c.branch === x.branch) : null;
        if (x.classGroup && !cls) {
          const cd = { name: x.classGroup, branch: x.branch || '', category: guessCategory(x.branch, x.classGroup), teacherName: x.teacherName || '', fee: 0, active: true, createdAt: F.serverTimestamp() };
          const cref = await addDoc(collection(db, C.classes), cd); cls = { id: cref.id, ...cd }; S.classes.push(cls);
        }
        const data = { ...hpFieldsOf(x), studentId: x.id, status: '재원', payDay: null, acaNo: '', memo: '', joinDate: today(),
          enrollments: cls ? [{ id: uid(), classId: cls.id, className: cls.name, fee: cls.fee || 0, discount: 0, discountReason: '', start: today(), end: '', auto: true }] : [],
          createdAt: F.serverTimestamp(), createdBy: '홈페이지 자동 연동' };
        const ref = await addDoc(collection(db, C.students), data);
        S.students.push({ id: ref.id, ...data }); r.added++;
      } catch (e) { console.warn('[수납 연동] 추가 실패', x.name, e); }
    }
    return r;
  }
  function syncMsg(r) {
    if (!r) return '';
    const a = [];
    if (r.added) a.push('새 학생 ' + r.added + '명 추가');
    if (r.linked) a.push(r.linked + '명 홈페이지 계정 연결');
    if (r.left) a.push(r.left + '명 퇴원 반영');
    if (r.updated) a.push(r.updated + '명 정보 맞춤');
    if (r.unsure.length) a.push('동명이인 직접 연결 필요: ' + r.unsure.join(', '));
    return a.length ? '홈페이지 연동 · ' + a.join(' · ') : '';
  }

  function hpOptions(cur) {
    const base = hpList(); const curHp = hpById(cur); if (curHp && !base.includes(curHp)) base.push(curHp);   // 퇴원한 연결 학생도 목록에 유지
    const list = base.slice().sort((a, b) => sortKo(a.name, b.name)).map((x) => ({ v: x.id, l: x.name + ' · ' + (x.grade || '') + ' · ' + branchShort(x.branch) + (x.classGroup ? ' · ' + x.classGroup : '') + (x.status === '퇴원' ? ' · 퇴원' : '') }));
    return opts(list, cur || '', '연결 안 함');
  }
  function enrollTable(s) {
    const list = (s.enrollments || []).slice().sort((a, b) => sortKo(b.start || '', a.start || ''));
    if (!list.length) return '<div class="bl-empty">수강반이 없어요. "+ 수강반 추가"로 반과 수강료를 넣어 주세요.</div>';
    const t = today();
    return '<div class="bl-tw"><table class="bl-t"><thead><tr><th>반</th><th>시작</th><th>종료</th><th class="r">수강료</th><th class="r">할인</th><th>할인 사유</th><th class="r">매달 청구</th><th class="c">자동</th><th></th></tr></thead><tbody>' +
      list.map((e) => { const ended = e.end && e.end < t; return '<tr class="' + (ended ? 'off' : '') + '"><td><b>' + esc(e.className) + '</b></td><td>' + shortD(e.start) + '</td><td>' + (e.end ? '<span style="color:var(--bl-red)">' + shortD(e.end) + '</span>' : '수강 중') + '</td>' +
        '<td class="r">' + won(e.fee) + '</td><td class="r">' + (e.discount ? won(e.discount) : '') + '</td><td>' + esc(e.discountReason || '') + '</td>' +
        '<td class="r"><b>' + won((e.fee || 0) - (e.discount || 0)) + '</b></td><td class="c">' + (e.auto === false ? '꺼짐' : '<span style="color:var(--bl-green);font-weight:700">켜짐</span>') + '</td>' +
        '<td><button class="bl-mini" onclick="BL.editEnroll(\'' + e.id + '\')">수정</button> ' + (e.end ? '' : '<button class="bl-mini" onclick="BL.endEnroll(\'' + e.id + '\')">수강 종료</button> ') + '<button class="bl-mini" onclick="BL.chargeForEnroll(\'' + e.id + '\')">수강료 발생</button></td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  async function saveStudent(s, patch) {
    const F = await fsx();
    await updateDoc(doc(db, C.students, s.id), { ...patch, updatedAt: F.serverTimestamp(), updatedBy: who() });
    Object.assign(s, patch);
  }
  BL.saveProfile = async () => {
    const s = studentById(S.cur.student); if (!s) return;
    const root = $('blProf'); const p = {};
    root.querySelectorAll('[data-p]').forEach((el) => { p[el.dataset.p] = el.value.trim(); });
    if (!p.name) { alert('이름을 넣어 주세요'); return; }
    p.payDay = p.payDay ? Math.min(31, Math.max(1, num(p.payDay))) : null;
    if (p.status === '퇴원' && !p.leaveDate) p.leaveDate = today();
    // 홈페이지와 연결된 학생의 기본 정보는 홈페이지가 기준 (여기서는 안 바꿈)
    const linkedHp = hpById(s.studentId);
    if (linkedHp) HP_FIELDS.forEach((k) => { delete p[k]; });
    const becomingLeft = p.status === '퇴원' && s.status !== '퇴원';
    const becomingBack = s.status === '퇴원' && p.status === '재원';
    if (becomingLeft && !confirm(s.name + ' 학생을 ' + p.leaveDate + '에 퇴원 처리할까요?\n\n' +
      '· 수강 중인 반이 모두 종료돼 다음 달부터 수강료가 생기지 않아요\n' +
      '· 이미 발생한 청구·미납 금액은 그대로 남아요\n' +
      (linkedHp ? (P ? '· (테스트 모드라 홈페이지 계정은 그대로예요)' : '· 홈페이지에서도 퇴원 처리돼요 (로그인만 막히고 기록은 모두 보존)') : '· 홈페이지와 연결되지 않은 학생이에요'))) return;
    if (becomingBack && !confirm(s.name + ' 학생을 다시 재원으로 되돌릴까요?\n\n· 퇴원 때 종료된 반을 오늘부터 다시 수강해요\n' +
      (linkedHp ? (P ? '· (테스트 모드라 홈페이지 계정은 그대로예요)' : '· 홈페이지 계정도 다시 열려요') : ''))) return;
    try {
      let extra = '';
      if (becomingLeft) { delete p.status; await saveStudent(s, p); await applyLeave(s, p.leaveDate); extra = await pushHomepageStatus(s, true, p.leaveDate); }
      else if (becomingBack) { delete p.status; delete p.leaveDate; await saveStudent(s, p); await applyRestore(s); extra = await pushHomepageStatus(s, false); }
      else await saveStudent(s, p);
      toast('저장했어요' + extra);
      if (p.payDay && s.status === '재원') { const r = await autoGenerate(await fsx()); if (r.made) toast('수강료 ' + r.made + '건 자동 발생'); }
      renderSlist(); renderScard();
    } catch (e) { fail(e); }
  };
  BL.deleteStudent = async () => {
    const s = studentById(S.cur.student); if (!s) return;
    const cs = await getDocs(query(collection(db, C.charges), where('bsId', '==', s.id)));
    if (!cs.empty) { alert('청구·납입 기록이 있는 학생은 삭제할 수 없어요.\n상태를 "퇴원"으로 바꿔 주세요.'); return; }
    if (!confirm(s.name + ' 수납 학생을 삭제할까요? (홈페이지 계정은 그대로예요)')) return;
    try { await deleteDoc(doc(db, C.students, s.id)); S.students = S.students.filter((x) => x.id !== s.id); S.cur.student = null; renderSlist(); $('blScard').innerHTML = '<div class="card"><div class="bl-empty">삭제했어요.</div></div>'; } catch (e) { fail(e); }
  };
  BL.newStudent = () => {
    modal({ title: '수납 학생 직접 추가', body:
      '<div class="row">' + fld('이름', 'name', '') + fldSel('관', 'branch', ['평촌관', '산본관'], '평촌관') + '</div>' +
      '<div class="row">' + fld('학년', 'grade', '', '예: 고2') + fld('학교', 'school', '') + '</div>' +
      '<div class="row">' + fld('학부모 연락처', 'parentPhone', '') + fld('매월 납입일', 'payDay', '', '1~31', 'num') + '</div>' +
      '<div class="bl-note">홈페이지 계정이 없는 과외 학생 등을 넣을 때 써요. 홈페이지 학생은 "홈페이지 학생 불러오기"로 가져오세요.</div>',
      buttons: [{ label: '취소' }, { label: '추가', cls: 'btn-primary', onClick: async (r) => {
        const d = {}; r.querySelectorAll('[data-p]').forEach((el) => { d[el.dataset.p] = el.value.trim(); });
        if (!d.name) { alert('이름을 넣어 주세요'); return false; }
        const F = await fsx();
        const data = { ...d, payDay: d.payDay ? num(d.payDay) : null, status: '재원', joinDate: today(), enrollments: [], studentId: '', createdAt: F.serverTimestamp(), createdBy: who() };
        const ref = await addDoc(collection(db, C.students), data);
        S.students.push({ id: ref.id, ...data });
        S.cur.student = ref.id; renderSlist(); renderScard();
      } }] });
  };

  // 홈페이지 학생 → 수납 학생 (반·수강료도 같이)
  BL.importFromHomepage = async () => {
    await loadAll();
    const hp = hpList();
    if (!hp.length) { alert('홈페이지 학생 명단을 아직 못 불러왔어요. 잠시 뒤 다시 눌러 주세요.'); return; }
    const linked = new Set(S.students.map((s) => s.studentId).filter(Boolean));
    const todo = hp.filter((x) => !linked.has(x.id));
    if (!todo.length) { alert('홈페이지 학생이 모두 이미 들어와 있어요.'); return; }
    // 반이 없으면 만들기
    const needCls = [];
    todo.forEach((x) => { if (x.classGroup && !S.classes.some((c) => c.name === x.classGroup && c.branch === x.branch) && !needCls.some((c) => c.name === x.classGroup && c.branch === x.branch)) needCls.push({ name: x.classGroup, branch: x.branch || '', teacherName: x.teacherName || '' }); });
    if (!confirm('홈페이지 학생 ' + todo.length + '명을 수납 학생으로 가져올까요?' + (needCls.length ? '\n새 반 ' + needCls.length + '개도 같이 만들어요 (수강료는 반·수강료 메뉴에서 넣어 주세요).' : '') + '\n\n납입일은 비어 있어서 넣기 전까지 자동 발생은 안 돼요.')) return;
    try {
      const F = await fsx();
      for (const c of needCls) {
        const data = { name: c.name, branch: c.branch, category: guessCategory(c.branch, c.name), teacherName: c.teacherName, fee: 0, active: true, createdAt: F.serverTimestamp() };
        const ref = await addDoc(collection(db, C.classes), data);
        S.classes.push({ id: ref.id, ...data });
      }
      let n = 0;
      for (let i = 0; i < todo.length; i += 400) {
        const batch = F.writeBatch(db);
        const add = [];
        todo.slice(i, i + 400).forEach((x) => {
          const cls = x.classGroup ? S.classes.find((c) => c.name === x.classGroup && c.branch === x.branch) : null;
          const ref = doc(collection(db, C.students));
          const data = { name: x.name || '', studentId: x.id, branch: x.branch || '', grade: x.grade || '', school: x.school || '',
            phone: x.phone || '', parentPhone: x.parentPhone || '', status: '재원', payDay: null, acaNo: '', memo: '', joinDate: '',
            enrollments: cls ? [{ id: uid(), classId: cls.id, className: cls.name, fee: cls.fee || 0, discount: 0, discountReason: '', start: '', end: '', auto: true }] : [],
            createdAt: F.serverTimestamp(), createdBy: who() + ' (홈페이지 불러오기)' };
          batch.set(ref, data); add.push({ id: ref.id, ...data });
        });
        await batch.commit(); S.students.push(...add); n += add.length;
      }
      toast(n + '명을 가져왔어요'); renderSlist();
    } catch (e) { fail(e); }
  };
  function guessCategory(branch, name) {
    const b = branchShort(branch) || '';
    const m = String(name).match(/(중|고)\s*([123])/);
    if (/과외/.test(name)) return b + ' 과외';
    if (m) return b + ' ' + (m[1] === '중' ? '중등' : '고등') + ' ' + m[2];
    return b + ' 기타';
  }

  // 수강반
  function enrollModal(s, e, after) {
    const isNew = !e; e = e || { auto: true, start: today() };
    modal({ title: (isNew ? '수강반 추가 · ' : '수강반 수정 · ') + s.name, body:
      '<label class="bl-f"><span>반</span><select class="bl-in" data-k="cls">' + classOpts(e.classId, '반 선택') + '</select></label>' +
      '<div class="row three"><label class="bl-f"><span>수강료</span><input class="bl-in num" data-k="fee" value="' + (e.fee != null ? won(e.fee) : '') + '"></label>' +
      '<label class="bl-f"><span>할인</span><input class="bl-in num" data-k="dc" value="' + (e.discount ? won(e.discount) : '') + '"></label>' +
      '<label class="bl-f"><span>할인 사유</span><input class="bl-in" data-k="dr" value="' + esc(e.discountReason || '') + '" placeholder="예: 장기할인"></label></div>' +
      '<div class="row"><label class="bl-f"><span>수강 시작일</span><input type="date" class="bl-in" data-k="st" value="' + esc(e.start || '') + '"></label>' +
      '<label class="bl-f"><span>수강 종료일 (비우면 수강 중)</span><input type="date" class="bl-in" data-k="en" value="' + esc(e.end || '') + '"></label></div>' +
      '<label class="bl-chk"><input type="checkbox" data-k="auto"' + (e.auto === false ? '' : ' checked') + '> 매달 납입일에 수강료 자동 발생</label>' +
      (isNew ? '<div class="bl-box gold"><label class="bl-chk"><input type="checkbox" data-k="first"> 첫 수강료 지금 발생</label> <input type="date" class="bl-in w140" data-k="fd" value="' + today() + '"> <span class="bl-note">납입 기한</span>' +
        '<div class="bl-note" style="margin-top:6px;">중간에 들어온 학생처럼 이번 달 수강료를 바로 받아야 할 때 체크하세요. 같은 달은 자동 발생과 겹치지 않아요.</div></div>' : ''),
      onOpen: (r) => { const cls = r.querySelector('[data-k=cls]'); const fee = r.querySelector('[data-k=fee]');
        cls.onchange = () => { const c = classById(cls.value); if (c && (isNew || !fee.value)) fee.value = won(c.fee || 0); };
        r.querySelectorAll('.num').forEach((x) => x.addEventListener('blur', () => { if (x.value) x.value = won(num(x.value)); })); },
      buttons: [{ label: '취소' }, { label: isNew ? '추가' : '저장', cls: 'btn-primary', onClick: async (r) => {
        const c = classById(val(r, '[data-k=cls]'));
        if (!c) { alert('반을 골라 주세요'); return false; }
        const ne = { id: e.id || uid(), classId: c.id, className: c.name, fee: num(val(r, '[data-k=fee]')), discount: num(val(r, '[data-k=dc]')),
          discountReason: val(r, '[data-k=dr]'), start: val(r, '[data-k=st]'), end: val(r, '[data-k=en]'), auto: chk(r, '[data-k=auto]') };
        const list = (s.enrollments || []).filter((x) => x.id !== ne.id).concat([ne]);
        await saveStudent(s, { enrollments: list });
        if (isNew && chk(r, '[data-k=first]')) {
          const due = val(r, '[data-k=fd]') || today();
          await addCharge(s, { id: 'auto_' + s.id + '_' + ne.id + '_' + ymOf(due), item: '수강료', title: '(수강료) ' + c.name, amount: ne.fee - ne.discount, dueDate: due, classId: c.id, className: c.name, enrollId: ne.id,
            note: ne.discount ? '할인 ' + won(ne.discount) + (ne.discountReason ? ' · ' + ne.discountReason : '') : '' });
        }
        const a = await autoGenerate(await fsx());
        toast('저장했어요' + (a.made ? ' · 수강료 ' + a.made + '건 자동 발생' : ''));
        after && after();
      } }] });
  }
  BL.addEnroll = () => { const s = studentById(S.cur.student); if (s) enrollModal(s, null, () => { renderSlist(); renderScard(); }); };
  BL.editEnroll = (id) => { const s = studentById(S.cur.student); const e = s && (s.enrollments || []).find((x) => x.id === id); if (e) enrollModal(s, { ...e }, () => { renderSlist(); renderScard(); }); };
  BL.endEnroll = (id) => {
    const s = studentById(S.cur.student); const e = s && (s.enrollments || []).find((x) => x.id === id); if (!e) return;
    modal({ title: '수강 종료 · ' + s.name + ' · ' + e.className, body:
      '<label class="bl-f"><span>종료일</span><input type="date" class="bl-in" data-k="d" value="' + today() + '"></label>' +
      '<div class="bl-note">종료일 뒤로는 이 반 수강료가 자동 발생하지 않아요. 이미 생긴 다음 달 청구는 청구 목록에서 "취소"하세요.</div>',
      buttons: [{ label: '취소' }, { label: '수강 종료', cls: 'btn-primary', onClick: async (r) => {
        const list = s.enrollments.map((x) => x.id === id ? { ...x, end: val(r, '[data-k=d]') || today() } : x);
        await saveStudent(s, { enrollments: list }); renderSlist(); renderScard();
      } }] });
  };
  BL.chargeForEnroll = (id) => {
    const s = studentById(S.cur.student); const e = s && (s.enrollments || []).find((x) => x.id === id); if (!e) return;
    chargeModal(s, () => renderScard(), { item: '수강료', classId: e.classId, amount: (e.fee || 0) - (e.discount || 0), dueDate: today() });
  };

  // 청구 · 납입
  BL.addChargeCur = () => { const s = studentById(S.cur.student); if (s) chargeModal(s, () => renderScard()); };
  BL.paySelected = () => {
    const s = studentById(S.cur.student); if (!s) return;
    const ids = [...document.querySelectorAll('#blScard .blCk:checked')].map((x) => x.value);
    const list = (S.cur.charges || []).filter((c) => ids.includes(c.id)).sort((a, b) => sortKo(a.dueDate, b.dueDate));
    if (!list.length) { alert('납입할 청구를 체크해 주세요'); return; }
    payModal(s, list, () => { renderSlist(); renderScard(); });
  };
  const curCharge = (id) => (S.cur.charges || []).find((c) => c.id === id) || S.charges.get(id);
  BL.editCharge = (id) => {
    const c = curCharge(id); if (!c) return;
    modal({ title: '금액 · 기한 변경', body:
      '<div class="bl-note">' + esc(c.studentName) + ' · ' + esc(c.title) + ' (납입액 ' + won(c.paid) + '원)</div>' +
      '<div class="row"><label class="bl-f"><span>청구 금액</span><input class="bl-in num" data-k="a" value="' + won(c.amount) + '"></label>' +
      '<label class="bl-f"><span>납입 기한</span><input type="date" class="bl-in" data-k="d" value="' + esc(c.dueDate) + '"></label></div>' +
      '<label class="bl-f"><span>변경 사유</span><input class="bl-in" data-k="r" placeholder="예: 형제 할인 · 중간 입학 일할 계산"></label>',
      buttons: [{ label: '취소' }, { label: '저장', cls: 'btn-primary', onClick: async (r) => {
        const a = num(val(r, '[data-k=a]')), d = val(r, '[data-k=d]');
        if (a < (c.paid || 0)) { alert('이미 낸 금액(' + won(c.paid) + '원)보다 작게 할 수 없어요'); return false; }
        const hist = (c.history || []).concat([{ at: today(), by: who(), text: '금액 ' + won(c.amount) + '→' + won(a) + (d !== c.dueDate ? ' · 기한 ' + c.dueDate + '→' + d : '') + (val(r, '[data-k=r]') ? ' · ' + val(r, '[data-k=r]') : '') }]);
        const patch = { amount: a, dueDate: d, month: ymOf(d) || c.month, status: statusOf(a, c.paid || 0), history: hist };
        await updateDoc(doc(db, C.charges, c.id), patch); S.charges.set(c.id, { ...c, ...patch }); renderScard();
      } }] });
  };
  BL.reasonCharge = (id) => {
    const c = curCharge(id); if (!c) return;
    modal({ title: '미납 사유 · 메모', body: '<div class="bl-note">' + esc(c.studentName) + ' · ' + esc(c.title) + '</div>' +
      '<label class="bl-f"><span>미납 사유</span><input class="bl-in" data-k="u" value="' + esc(c.unpaidReason || '') + '" placeholder="예: 11/10 입금 약속"></label>' +
      '<label class="bl-f"><span>메모</span><input class="bl-in" data-k="n" value="' + esc(c.note || '') + '"></label>',
      buttons: [{ label: '취소' }, { label: '저장', cls: 'btn-primary', onClick: async (r) => {
        const patch = { unpaidReason: val(r, '[data-k=u]'), note: val(r, '[data-k=n]') };
        await updateDoc(doc(db, C.charges, c.id), patch); S.charges.set(c.id, { ...c, ...patch }); renderScard();
      } }] });
  };
  BL.cancelChargeUI = (id) => {
    const c = curCharge(id); if (!c) return;
    modal({ title: '청구 취소', body: '<div>' + esc(c.studentName) + ' · ' + esc(c.title) + ' · ' + won(c.amount) + '원</div>' +
      '<label class="bl-f"><span>취소 사유</span><input class="bl-in" data-k="r" placeholder="예: 퇴원 · 잘못 발생"></label>' +
      (c.bookId ? '<div class="bl-note">교재 청구라 취소하면 재고가 ' + (c.qty || 1) + '권 다시 늘어나요.</div>' : '') +
      (c.auto ? '<div class="bl-note">자동 발생 청구는 취소해도 같은 달에 다시 생기지 않아요.</div>' : ''),
      buttons: [{ label: '닫기' }, { label: '청구 취소', cls: 'btn-danger', onClick: async (r) => { await cancelCharge(c, val(r, '[data-k=r]')); renderSlist(); renderScard(); } }] });
  };
  BL.refund = () => {
    const s = studentById(S.cur.student); if (!s) return;
    modal({ title: '환불 기록 · ' + s.name, body:
      '<div class="row"><label class="bl-f"><span>환불일</span><input type="date" class="bl-in" data-k="d" value="' + today() + '"></label>' +
      '<label class="bl-f"><span>환불액</span><input class="bl-in num" data-k="a"></label></div>' +
      '<div class="row"><label class="bl-f"><span>환불 형태</span><select class="bl-in" data-k="m">' + opts(METHODS, '계좌이체') + '</select></label>' +
      '<label class="bl-f"><span>카드사 (카드 취소일 때)</span><select class="bl-in" data-k="c">' + opts(S.settings.cardCompanies || [], '', '-') + '</select></label></div>' +
      '<label class="bl-f"><span>환불 사유</span><input class="bl-in" data-k="r" placeholder="예: 10/20 퇴원 · 잔여 수업분"></label>' +
      '<div class="bl-note">환불은 납입 합계에서 빠져요. 청구 자체는 그대로 두고, 앞으로 받을 청구는 "취소"하세요.</div>',
      buttons: [{ label: '취소' }, { label: '환불 기록', cls: 'btn-danger', onClick: async (r) => {
        const a = num(val(r, '[data-k=a]')); if (!a) { alert('환불액을 넣어 주세요'); return false; }
        const F = await fsx();
        await addDoc(collection(db, C.payments), { bsId: s.id, studentName: s.name, branch: s.branch || '', kind: '환불', date: val(r, '[data-k=d]') || today(), amount: -a,
          method: val(r, '[data-k=m]'), cardCompany: val(r, '[data-k=c]'), allocations: [], memo: val(r, '[data-k=r]'), cash: { need: false, issued: false }, by: who(), createdAt: F.serverTimestamp(), canceled: false });
        toast('환불 ' + won(a) + '원 기록했어요'); renderScard();
      } }] });
  };

  // ═════════════════════════════════════════════════════════
  // 3) 납입 · 미납 조회
  // ═════════════════════════════════════════════════════════
  window.initBillUnpaid = async function () {
    const root = $('blUnpaid'); if (!root) return;
    const u = S.ui.unpaid;
    const m = ymOf(today());
    u.from = u.from || m + '-01'; u.to = u.to || dueOf(m, 31); u.branch = u.branch || ''; u.cls = u.cls || ''; u.teacher = u.teacher || ''; u.view = u.view || 'class'; u.excludeLeft = u.excludeLeft !== false; u.item = u.item || '';
    root.innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); await renderUnpaid(); } catch (e) { fail(e); }
  };
  async function renderUnpaid() {
    const u = S.ui.unpaid;
    const teachers = [...new Set(S.classes.map((c) => c.teacherName).filter(Boolean))].sort(sortKo);
    $('blUnpaid').innerHTML =
      '<div class="card"><div class="bl-bar">' +
      '<label class="bl-f"><span>납입기한 시작</span><input type="date" class="bl-in" id="blUf" value="' + u.from + '"></label>' +
      '<label class="bl-f"><span>끝</span><input type="date" class="bl-in" id="blUt" value="' + u.to + '"></label>' +
      '<div class="bl-f"><span>&nbsp;</span><div style="display:flex;gap:4px;"><button class="bl-mini" id="blUprev">◀ 이전 달</button><button class="bl-mini" id="blUnext">다음 달 ▶</button></div></div>' +
      '<label class="bl-f"><span>관</span><select class="bl-in" id="blUb">' + opts(['평촌관', '산본관'], u.branch, '전체') + '</select></label>' +
      '<label class="bl-f"><span>담임</span><select class="bl-in" id="blUtc">' + opts(teachers, u.teacher, '전체') + '</select></label>' +
      '<label class="bl-f"><span>반</span><select class="bl-in w180" id="blUc">' + classOpts(u.cls, '전체 반', u.branch) + '</select></label>' +
      '<label class="bl-f"><span>구분</span><select class="bl-in" id="blUi">' + opts(ITEMS, u.item, '수강료+교재+기타') + '</select></label>' +
      '<label class="bl-chk" style="padding-bottom:8px;"><input type="checkbox" id="blUx"' + (u.excludeLeft ? ' checked' : '') + '> 퇴원생 제외</label>' +
      '</div><div class="bl-bar" style="margin-bottom:0;"><div class="bl-seg" id="blUv">' +
      [['class', '반별 종합'], ['grid', '학생별 월 표'], ['list', '미납 목록'], ['paid', '납입 상세']].map(([v, l]) => '<button type="button" data-v="' + v + '" class="' + (u.view === v ? 'on' : '') + '">' + l + '</button>').join('') +
      '</div><div class="sp"></div><button class="btn btn-secondary btn-sm" id="blUxl">엑셀로 저장</button></div></div>' +
      '<div class="card" id="blUout"><div class="bl-empty">불러오는 중...</div></div>';
    const re = () => renderUnpaid();
    $('blUf').onchange = (e) => { u.from = e.target.value; re(); };
    $('blUt').onchange = (e) => { u.to = e.target.value; re(); };
    $('blUprev').onclick = () => { const m = addMonths(ymOf(u.from), -1); u.from = m + '-01'; u.to = dueOf(m, 31); re(); };
    $('blUnext').onclick = () => { const m = addMonths(ymOf(u.from), 1); u.from = m + '-01'; u.to = dueOf(m, 31); re(); };
    $('blUb').onchange = (e) => { u.branch = e.target.value; u.cls = ''; re(); };
    $('blUtc').onchange = (e) => { u.teacher = e.target.value; re(); };
    $('blUc').onchange = (e) => { u.cls = e.target.value; re(); };
    $('blUx').onchange = (e) => { u.excludeLeft = e.target.checked; re(); };
    $('blUi').onchange = (e) => { u.item = e.target.value; re(); };
    $('blUv').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; u.view = b.dataset.v; re(); };

    if (!u.from || !u.to || u.from > u.to) { $('blUout').innerHTML = '<div class="bl-empty">기간을 확인해 주세요</div>'; return; }
    const snap = await getDocs(query(collection(db, C.charges), where('dueDate', '>=', u.from)));
    const clsT = (c) => { const k = classById(c.classId); return k ? (k.teacherName || '') : ''; };
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.dueDate <= u.to && c.status !== '취소' &&
      (!u.branch || c.branch === u.branch) && (!u.cls || c.classId === u.cls) && (!u.teacher || clsT(c) === u.teacher) && (!u.item || c.item === u.item));
    if (u.excludeLeft) list = list.filter((c) => { const s = studentById(c.bsId); return !s || s.status !== '퇴원'; });
    list.forEach((c) => S.charges.set(c.id, c));
    const t = today();
    let html = '', sheet = [];
    if (u.view === 'class') {
      const g = new Map();
      list.forEach((c) => { const nm = c.className || '(교재·기타)'; const k = nm + '|' + c.branch; if (!g.has(k)) g.set(k, { name: nm, branch: c.branch, teacher: clsT(c), n: 0, pn: 0, pa: 0, un: 0, ua: 0, amt: 0 }); const x = g.get(k);
        x.n++; x.amt += c.amount || 0; x.pa += Math.min(c.paid || 0, c.amount || 0); if (remain(c) <= 0) x.pn++; else { x.un++; x.ua += remain(c); } });
      const rows = [...g.values()].sort((a, b) => sortKo(a.branch + a.name, b.branch + b.name));
      const tot = rows.reduce((a, x) => { ['n', 'pn', 'pa', 'un', 'ua', 'amt'].forEach((k) => { a[k] += x[k]; }); return a; }, { n: 0, pn: 0, pa: 0, un: 0, ua: 0, amt: 0 });
      const rate = (x) => x.amt ? (x.pa / x.amt * 100).toFixed(1) : '';
      sheet = [['관', '반명', '담임', '총건수', '납입건수', '납입총액', '미납건수', '미납총액', '납입률(%)']].concat(rows.map((x) => [x.branch, x.name, x.teacher, x.n, x.pn, x.pa, x.un, x.ua, rate(x)]), [['', '계', '', tot.n, tot.pn, tot.pa, tot.un, tot.ua, rate(tot)]]);
      html = rows.length ? '<div class="bl-tw tall"><table class="bl-t"><thead><tr><th>관</th><th>반명</th><th>담임</th><th class="r">총건수</th><th class="r">납입건수</th><th class="r">납입총액</th><th class="r">미납건수</th><th class="r">미납총액</th><th class="r">납입률</th></tr></thead><tbody>' +
        rows.map((x) => '<tr><td>' + branchShort(x.branch) + '</td><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.teacher) + '</td><td class="r">' + x.n + '</td><td class="r">' + x.pn + '</td><td class="r">' + won(x.pa) + '</td><td class="r' + (x.un ? ' bl-cell-m' : '') + '">' + (x.un || '') + '</td><td class="r' + (x.ua ? ' bl-cell-m' : '') + '">' + (x.ua ? won(x.ua) : '') + '</td><td class="r">' + rate(x) + '%</td></tr>').join('') +
        '</tbody><tfoot><tr><td></td><td>계</td><td></td><td class="r">' + tot.n + '</td><td class="r">' + tot.pn + '</td><td class="r">' + won(tot.pa) + '</td><td class="r">' + tot.un + '</td><td class="r">' + won(tot.ua) + '</td><td class="r">' + rate(tot) + '%</td></tr></tfoot></table></div>' : '<div class="bl-empty">해당 기간 청구가 없어요</div>';
    } else if (u.view === 'grid') {
      const months = monthsBetween(ymOf(u.from), ymOf(u.to));
      const g = new Map();
      list.filter((c) => c.item === '수강료').forEach((c) => { const k = (c.className || '(반 없음)') + '|' + c.bsId; if (!g.has(k)) g.set(k, { cls: c.className || '(반 없음)', branch: c.branch, bsId: c.bsId, name: c.studentName, m: {} }); const x = g.get(k);
        const cell = x.m[c.month] || (x.m[c.month] = { a: 0, r: 0 }); cell.a += c.amount || 0; cell.r += remain(c); });
      const rows = [...g.values()].sort((a, b) => sortKo(a.branch + a.cls + a.name, b.branch + b.cls + b.name));
      const mark = (cell) => !cell ? '' : cell.r <= 0 ? '납' : cell.r < cell.a ? '부' : '미';
      sheet = [['관', '반', '학생', '납입일', '학부모 연락처'].concat(months.map((m) => m.slice(2).replace('-', '.')), ['미납 건수'])].concat(rows.map((x) => { const s = studentById(x.bsId) || {}; return [x.branch, x.cls, x.name, s.payDay || '', s.parentPhone || ''].concat(months.map((m) => mark(x.m[m])), [months.filter((m) => x.m[m] && x.m[m].r > 0).length]); }));
      let lastCls = '';
      html = rows.length ? '<div class="bl-tw tall"><table class="bl-t"><thead><tr><th>반</th><th>학생</th><th class="c">납입일</th><th>학부모 연락처</th>' + months.map((m) => '<th class="c">' + m.slice(2).replace('-', '.') + '</th>').join('') + '<th class="r">미납</th></tr></thead><tbody>' +
        rows.map((x) => { const s = studentById(x.bsId) || {}; const showCls = x.branch + x.cls !== lastCls; lastCls = x.branch + x.cls; const un = months.filter((m) => x.m[m] && x.m[m].r > 0).length;
          return '<tr><td>' + (showCls ? '<b>' + esc(x.cls) + '</b> <small style="color:var(--muted)">' + branchShort(x.branch) + '</small>' : '') + '</td><td><button class="lnk" onclick="BL.openStudent(\'' + x.bsId + '\')">' + esc(x.name) + '</button></td><td class="c">' + (s.payDay || '') + '</td><td>' + esc(s.parentPhone || '') + '</td>' +
            months.map((m) => { const k = mark(x.m[m]); return '<td class="c ' + (k === '납' ? 'bl-cell-p' : k === '미' ? 'bl-cell-m' : k === '부' ? 'bl-cell-h' : '') + '">' + k + '</td>'; }).join('') + '<td class="r">' + (un || '') + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="bl-note" style="margin-top:8px;">수강료만 표시 · 납 = 완납 · 미 = 미납 · 부 = 부분납 · 빈칸 = 청구 없음</div>' : '<div class="bl-empty">해당 기간 청구가 없어요</div>';
    } else if (u.view === 'list') {
      const rows = list.filter((c) => remain(c) > 0).sort((a, b) => sortKo(a.dueDate + a.studentName, b.dueDate + b.studentName));
      sheet = [['학생', '관', '반', '내역', '납입기한', '청구액', '납입액', '남은 금액', '경과일', '미납 사유', '학부모 연락처']].concat(rows.map((c) => { const s = studentById(c.bsId) || {}; return [c.studentName, c.branch, c.className, c.title, c.dueDate, c.amount, c.paid || 0, remain(c), c.dueDate < t ? daysBetween(c.dueDate, t) : '', c.unpaidReason || '', s.parentPhone || '']; }));
      html = '<div class="bl-head"><h3>미납 ' + rows.length + '건 · ' + won(rows.reduce((a, c) => a + remain(c), 0)) + '원</h3><div class="sum"><span class="bl-note">문자 보내기는 문자 연동 뒤에 이 화면에 붙어요</span></div></div>' + chargeList(rows, t);
    } else {
      const ps = await getDocs(query(collection(db, C.payments), where('date', '>=', u.from)));
      const pays = ps.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.canceled && p.date <= u.to && (!u.branch || p.branch === u.branch) &&
        (!u.cls || (p.allocations || []).some((a) => { const c = S.charges.get(a.chargeId); return c && c.classId === u.cls; }))).sort((a, b) => sortKo(a.date + a.studentName, b.date + b.studentName));
      const byM = {}; pays.forEach((p) => { const k = p.kind === '환불' ? '환불' : (p.method || '기타') + (p.cardCompany ? '(' + p.cardCompany + ')' : ''); byM[k] = (byM[k] || 0) + (p.amount || 0); });
      sheet = [['납입기한', '납입일', '학생', '관', '구분', '금액', '형태', '카드사', '내역', '현금영수증', '처리자']].concat(pays.map((p) => [payDues(p)[0] || '', p.date, p.studentName, p.branch, p.kind, p.amount, p.method, p.cardCompany || '', (p.allocations || []).map((a) => a.title).join(', ') || p.memo || '', p.cash && p.cash.need ? (p.cash.issued ? '발행' : '미발행') : '', p.by || '']));
      html = '<div class="bl-head"><h3>납입 ' + pays.length + '건 · ' + won(pays.reduce((a, p) => a + (p.amount || 0), 0)) + '원</h3></div>' +
        '<div class="bl-chips" style="margin-bottom:10px;">' + Object.keys(byM).sort(sortKo).map((k) => '<span class="bl-tag">' + esc(k) + ' ' + won(byM[k]) + '</span>').join('') + '</div>' + payTable(pays, true);
    }
    $('blUout').innerHTML = html;
    $('blUxl').onclick = () => exportXlsx(sheet, '납입미납_' + u.from + '_' + u.to + '_' + ({ class: '반별', grid: '학생별', list: '미납목록', paid: '납입상세' }[u.view]) + '.xlsx');
  }
  function exportXlsx(aoa, name) {
    if (!aoa || aoa.length < 2) { alert('저장할 내용이 없어요'); return; }
    if (typeof XLSX === 'undefined') { alert('엑셀 도구를 아직 못 불러왔어요'); return; }
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '시트1'); XLSX.writeFile(wb, name);
  }

  // ═════════════════════════════════════════════════════════
  // 4) 현금영수증
  // ═════════════════════════════════════════════════════════
  window.initBillReceipt = async function () {
    const root = $('blReceipt'); if (!root) return;
    const u = S.ui.receipt;
    u.from = u.from || addMonths(ymOf(today()), -1) + '-01'; u.to = u.to || today(); u.view = u.view || 'wait'; u.branch = u.branch || '';
    root.innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); await renderReceipt(); } catch (e) { fail(e); }
  };
  async function renderReceipt() {
    const u = S.ui.receipt;
    const ps = await getDocs(query(collection(db, C.payments), where('date', '>=', u.from)));
    const all = ps.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.canceled && p.kind !== '환불' && p.date <= u.to && (!u.branch || p.branch === u.branch));
    const wait = all.filter((p) => p.cash && p.cash.need && !p.cash.issued);
    const done = all.filter((p) => p.cash && p.cash.need && p.cash.issued);
    const cashAll = all.filter((p) => CASH_METHODS.includes(p.method) || (p.cash && p.cash.need));
    const list = (u.view === 'wait' ? wait : u.view === 'done' ? done : cashAll).sort((a, b) => sortKo(a.date + a.studentName, b.date + b.studentName));
    $('blReceipt').innerHTML =
      '<div class="card"><div class="bl-bar">' +
      '<label class="bl-f"><span>납입일 시작</span><input type="date" class="bl-in" id="blRf" value="' + u.from + '"></label>' +
      '<label class="bl-f"><span>끝</span><input type="date" class="bl-in" id="blRt" value="' + u.to + '"></label>' +
      '<label class="bl-f"><span>관</span><select class="bl-in" id="blRb">' + opts(['평촌관', '산본관'], u.branch, '전체') + '</select></label>' +
      '<div class="bl-f"><span>보기</span><div class="bl-seg" id="blRv">' + [['wait', '미발행 ' + wait.length], ['done', '발행 완료 ' + done.length], ['all', '현금·계좌 전체 ' + cashAll.length]].map(([v, l]) => '<button type="button" data-v="' + v + '" class="' + (u.view === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="sp"></div><button class="btn btn-secondary btn-sm" id="blRxl">엑셀로 저장</button></div>' +
      '<div class="bl-note">현금영수증은 카드기에서 발행하고, 여기서는 발행했는지만 표시해요. 현금·계좌이체 납입은 처리할 때 자동으로 "발행 대상"이 돼요. 대상이 아니면 "현금·계좌 전체"에서 바꿀 수 있어요.</div></div>' +
      '<div class="card">' + (list.length ? '<div class="bl-tw tall"><table class="bl-t"><thead><tr><th>납입일</th><th>학생</th><th>관</th><th class="r">금액</th><th>형태</th><th>내역</th><th>학부모 연락처</th><th>현금영수증</th><th>승인번호</th><th></th></tr></thead><tbody>' +
        list.map((p) => { const s = studentById(p.bsId) || {}; const c = p.cash || {}; return '<tr><td>' + shortD(p.date) + '</td><td><button class="lnk" onclick="BL.openStudent(\'' + p.bsId + '\')">' + esc(p.studentName) + '</button></td><td>' + branchShort(p.branch) + '</td>' +
          '<td class="r"><b>' + won(p.amount) + '</b></td><td>' + esc(p.method) + '</td><td class="wrap">' + esc((p.allocations || []).map((a) => a.title).join(', ')) + '</td><td>' + esc(s.parentPhone || '') + '</td>' +
          '<td>' + cashCell(p) + '</td><td>' + esc(c.approvalNo || '') + '</td>' +
          '<td>' + (c.need && !c.issued ? '<button class="bl-mini" onclick="BL.cashToggleNeed(\'' + p.id + '\',false)">대상 아님</button>' : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="bl-empty">' + (u.view === 'wait' ? '미발행 현금영수증이 없어요 👍' : '없어요') + '</div>') + '</div>';
    $('blRf').onchange = (e) => { u.from = e.target.value; renderReceipt(); };
    $('blRt').onchange = (e) => { u.to = e.target.value; renderReceipt(); };
    $('blRb').onchange = (e) => { u.branch = e.target.value; renderReceipt(); };
    $('blRv').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; u.view = b.dataset.v; renderReceipt(); };
    $('blRxl').onclick = () => exportXlsx([['납입일', '학생', '관', '금액', '형태', '내역', '학부모 연락처', '현금영수증', '발행일', '승인번호']].concat(list.map((p) => { const s = studentById(p.bsId) || {}; const c = p.cash || {};
      return [p.date, p.studentName, p.branch, p.amount, p.method, (p.allocations || []).map((a) => a.title).join(', '), s.parentPhone || '', c.need ? (c.issued ? '발행' : '미발행') : '대상 아님', c.issuedDate || '', c.approvalNo || '']; })), '현금영수증_' + u.from + '_' + u.to + '.xlsx');
  }

  // ═════════════════════════════════════════════════════════
  // 5) 반 · 수강료 (+ 반 이동·퇴원 일괄, 수납 설정)
  // ═════════════════════════════════════════════════════════
  window.initBillClasses = async function () {
    const root = $('blClasses'); if (!root) return;
    root.innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); renderClasses(); } catch (e) { fail(e); }
  };
  function renderClasses() {
    const u = S.ui.classes || (S.ui.classes = { branch: '', moveCls: '' });
    const t = today();
    const cnt = {}; S.students.forEach((s) => { if (s.status === '퇴원') return; activeEnrolls(s, t).forEach((e) => { cnt[e.classId] = (cnt[e.classId] || 0) + 1; }); });
    const list = S.classes.filter((c) => !u.branch || c.branch === u.branch).sort((a, b) => sortKo((a.active === false ? 'z' : 'a') + a.branch + (a.category || '') + a.name, (b.active === false ? 'z' : 'a') + b.branch + (b.category || '') + b.name));
    const mv = classById(u.moveCls);
    const mvStudents = mv ? S.students.filter((s) => s.status !== '퇴원' && activeEnrolls(s, t).some((e) => e.classId === mv.id)).sort((a, b) => sortKo(a.name, b.name)) : [];
    const st = S.settings;
    $('blClasses').innerHTML =
      '<div class="card"><div class="bl-head"><h3>반 · 수강료</h3><select class="bl-in" id="blCb">' + opts(['평촌관', '산본관'], u.branch, '전체 관') + '</select>' +
      '<div class="sum"><button class="btn btn-secondary btn-sm" onclick="BL.importClasses()">⇣ 홈페이지 반 불러오기</button><button class="btn btn-primary btn-sm" onclick="BL.editClass()">+ 반 추가</button></div></div>' +
      '<div class="bl-note" style="margin-bottom:10px;">수강료를 바꾸면 <b>앞으로 새로 넣는 수강반</b>에 적용돼요. 이미 다니는 학생 수강료를 같이 바꾸려면 수정 창에서 "현재 수강생에게도 적용"을 체크하세요.</div>' +
      (list.length ? '<div class="bl-tw tall"><table class="bl-t"><thead><tr><th>관</th><th>반형태</th><th>반명</th><th>담임</th><th class="r">수강료</th><th class="r">수강생</th><th>사용</th><th></th></tr></thead><tbody>' +
        list.map((c) => '<tr class="' + (c.active === false ? 'off' : '') + '"><td>' + branchShort(c.branch) + '</td><td>' + esc(c.category || '') + '</td><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.teacherName || '') + '</td>' +
          '<td class="r">' + (c.fee ? won(c.fee) : '<span style="color:var(--bl-red)">미입력</span>') + '</td><td class="r">' + (cnt[c.id] || 0) + '</td><td>' + (c.active === false ? '안 씀' : '씀') + '</td>' +
          '<td><button class="bl-mini" onclick="BL.editClass(\'' + c.id + '\')">수정</button> <button class="bl-mini" onclick="BL.pickMove(\'' + c.id + '\')">반 이동·퇴원</button></td></tr>').join('') + '</tbody></table></div>'
        : '<div class="bl-empty">반이 없어요. "홈페이지 반 불러오기"를 누르면 홈페이지 학생들의 반으로 만들어져요.</div>') + '</div>' +

      '<div class="card" id="blMove"><div class="bl-head"><h3>반 이동 · 퇴원 일괄 처리</h3><select class="bl-in w180" id="blMc">' + classOpts(u.moveCls, '반 선택') + '</select></div>' +
      (mv ? (mvStudents.length ? '<div class="bl-chips" style="margin-bottom:12px;">' + mvStudents.map((s) => '<label class="bl-chip" style="display:inline-flex;gap:5px;align-items:center;"><input type="checkbox" class="blMk" value="' + s.id + '" checked style="accent-color:var(--purple,#5B3FA6)"> ' + esc(s.name) + '</label>').join('') + '</div>' +
        '<div class="bl-bar" style="margin-bottom:0;"><label class="bl-f"><span>처리일</span><input type="date" class="bl-in" id="blMd" value="' + t + '"></label>' +
        '<label class="bl-f"><span>옮길 반</span><select class="bl-in w180" id="blMto">' + classOpts('', '반 선택') + '</select></label>' +
        '<label class="bl-chk" style="padding-bottom:8px;"><input type="checkbox" id="blMkeep" checked> 기존 할인 유지</label>' +
        '<button class="btn btn-primary btn-sm" onclick="BL.bulkMove()">선택 학생 반 이동</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="BL.bulkEnd(false)">선택 학생 이 반 수강 종료</button>' +
        '<button class="btn btn-danger btn-sm" onclick="BL.bulkEnd(true)">선택 학생 퇴원</button></div>'
        : '<div class="bl-empty">이 반에 수강 중인 학생이 없어요</div>') : '<div class="bl-empty">반을 고르면 수강생이 나와요</div>') + '</div>' +

      '<div class="card"><div class="bl-head"><h3>수납 설정</h3></div><div class="bl-profile" id="blSet">' +
      '<label class="bl-f"><span>자동 발생 시작 월</span><input type="month" class="bl-in" data-s="autoStartMonth" value="' + esc(st.autoStartMonth) + '"></label>' +
      '<label class="bl-f"><span>매월 며칠에 다음 달 수강료 발생</span><input class="bl-in num" data-s="genDay" value="' + esc(st.genDay || 20) + '"></label>' +
      '<label class="bl-f"><span>납입일 며칠 전에 안내 카톡</span><input class="bl-in num" data-s="notifyDays" value="' + esc(st.notifyDays || 4) + '"></label>' +
      '<label class="bl-f span2"><span>카드사 (쉼표로 구분)</span><input class="bl-in" data-s="cardCompanies" value="' + esc((st.cardCompanies || []).join(', ')) + '"></label>' +
      '<label class="bl-f span4"><span>기타 청구 항목 (쉼표로 구분)</span><input class="bl-in" data-s="etcItems" value="' + esc((st.etcItems || []).join(', ')) + '"></label></div>' +
      '<div class="bl-note" style="margin-top:8px;">시작 월보다 이전 달 수강료는 자동으로 만들지 않아요. 아카에서 데이터를 옮긴 뒤 시작 월을 정하면 겹치지 않아요.</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-primary btn-sm" onclick="BL.saveSettings()">설정 저장</button><button class="btn btn-secondary btn-sm" onclick="BL.runAuto()">지금 자동 발생 실행</button></div></div>';
    $('blCb').onchange = (e) => { u.branch = e.target.value; renderClasses(); };
    $('blMc').onchange = (e) => { u.moveCls = e.target.value; renderClasses(); };
  }
  BL.pickMove = (id) => { S.ui.classes.moveCls = id; renderClasses(); setTimeout(() => { const el = $('blMove'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); };
  BL.editClass = (id) => {
    const c = id ? classById(id) : null; const isNew = !c; const x = c || { branch: '평촌관', active: true };
    modal({ title: isNew ? '반 추가' : '반 수정 · ' + x.name, body:
      '<div class="row"><label class="bl-f"><span>관</span><select class="bl-in" data-k="b">' + opts(['평촌관', '산본관'], x.branch) + '</select></label>' +
      '<label class="bl-f"><span>반형태 (아카의 반형태)</span><input class="bl-in" data-k="cat" value="' + esc(x.category || '') + '" placeholder="예: 평촌 고등 2"></label></div>' +
      '<div class="row"><label class="bl-f"><span>반명 (홈페이지 반 이름과 같게)</span><input class="bl-in" data-k="n" value="' + esc(x.name || '') + '" placeholder="예: 고2 3-B"></label>' +
      '<label class="bl-f"><span>담임</span><input class="bl-in" data-k="t" value="' + esc(x.teacherName || '') + '"></label></div>' +
      '<div class="row"><label class="bl-f"><span>수강료 (한 달)</span><input class="bl-in num" data-k="fee" value="' + (x.fee ? won(x.fee) : '') + '"></label>' +
      '<label class="bl-f"><span>사용</span><select class="bl-in" data-k="a">' + opts([{ v: '1', l: '씀' }, { v: '0', l: '안 씀 (목록에서 숨김)' }], x.active === false ? '0' : '1') + '</select></label></div>' +
      (isNew ? '' : '<label class="bl-chk"><input type="checkbox" data-k="apply"> 현재 수강생에게도 새 수강료 적용 (할인은 그대로)</label>'),
      onOpen: (r) => r.querySelectorAll('.num').forEach((el) => el.addEventListener('blur', () => { if (el.value) el.value = won(num(el.value)); })),
      buttons: [{ label: '취소' }, { label: isNew ? '추가' : '저장', cls: 'btn-primary', onClick: async (r) => {
        const d = { branch: val(r, '[data-k=b]'), category: val(r, '[data-k=cat]'), name: val(r, '[data-k=n]'), teacherName: val(r, '[data-k=t]'), fee: num(val(r, '[data-k=fee]')), active: val(r, '[data-k=a]') !== '0' };
        if (!d.name) { alert('반명을 넣어 주세요'); return false; }
        if (!d.category) d.category = guessCategory(d.branch, d.name);
        if (S.classes.some((k) => k.id !== (c && c.id) && k.name === d.name && k.branch === d.branch)) { alert('같은 관에 같은 이름의 반이 이미 있어요'); return false; }
        if (isNew) { const ref = await addDoc(collection(db, C.classes), d); S.classes.push({ id: ref.id, ...d }); }
        else {
          await updateDoc(doc(db, C.classes, c.id), d); Object.assign(c, d);
          const apply = chk(r, '[data-k=apply]');
          const F = await fsx(); const batch = F.writeBatch(db); let n = 0;
          S.students.forEach((s) => {
            let ch = false;
            const list = (s.enrollments || []).map((e) => { if (e.classId !== c.id) return e; const ne = { ...e, className: d.name }; if (apply && !e.end) ne.fee = d.fee; if (ne.className !== e.className || ne.fee !== e.fee) ch = true; return ne; });
            if (ch) { batch.update(doc(db, C.students, s.id), { enrollments: list }); s.enrollments = list; n++; }
          });
          if (n) await batch.commit();
          if (n) toast('수강생 ' + n + '명 수강반 정보도 바꿨어요');
        }
        renderClasses();
      } }] });
  };
  BL.importClasses = async () => {
    const hp = hpList();
    const need = [];
    hp.forEach((x) => { if (x.classGroup && !S.classes.some((c) => c.name === x.classGroup && c.branch === (x.branch || '')) && !need.some((c) => c.name === x.classGroup && c.branch === (x.branch || ''))) need.push({ name: x.classGroup, branch: x.branch || '', teacherName: x.teacherName || '' }); });
    if (!need.length) { alert('새로 만들 반이 없어요 (홈페이지 반이 모두 들어와 있어요)'); return; }
    if (!confirm('홈페이지 학생들의 반 ' + need.length + '개를 만들까요?\n' + need.map((c) => branchShort(c.branch) + ' ' + c.name).join(', '))) return;
    try {
      for (const c of need) { const d = { ...c, category: guessCategory(c.branch, c.name), fee: 0, active: true }; const ref = await addDoc(collection(db, C.classes), d); S.classes.push({ id: ref.id, ...d }); }
      toast(need.length + '개 반을 만들었어요. 수강료를 넣어 주세요'); renderClasses();
    } catch (e) { fail(e); }
  };
  function moveTargets() { return [...document.querySelectorAll('#blMove .blMk:checked')].map((x) => studentById(x.value)).filter(Boolean); }
  BL.bulkMove = async () => {
    const from = classById(S.ui.classes.moveCls), to = classById(val(document, '#blMto')), d = val(document, '#blMd') || today(), keep = chk(document, '#blMkeep');
    const list = moveTargets();
    if (!to) { alert('옮길 반을 골라 주세요'); return; }
    if (to.id === from.id) { alert('같은 반이에요'); return; }
    if (!list.length) { alert('학생을 체크해 주세요'); return; }
    if (!confirm(list.length + '명을 ' + from.name + ' → ' + to.name + '(으)로 ' + d + '에 옮길까요?\n' + from.name + ' 수강은 전날로 종료되고, ' + to.name + ' 수강료(' + won(to.fee) + '원)로 새로 시작해요.')) return;
    try {
      const F = await fsx(); const batch = F.writeBatch(db);
      list.forEach((s) => {
        let disc = 0, reason = '';
        const enr = (s.enrollments || []).map((e) => { if (e.classId === from.id && !e.end) { disc = e.discount || 0; reason = e.discountReason || ''; return { ...e, end: addDays(d, -1) }; } return e; });
        enr.push({ id: uid(), classId: to.id, className: to.name, fee: to.fee || 0, discount: keep ? disc : 0, discountReason: keep ? reason : '', start: d, end: '', auto: true });
        batch.update(doc(db, C.students, s.id), { enrollments: enr }); s.enrollments = enr;
      });
      await batch.commit(); toast(list.length + '명 반 이동했어요'); renderClasses();
    } catch (e) { fail(e); }
  };
  BL.bulkEnd = async (leave) => {
    const from = classById(S.ui.classes.moveCls), d = val(document, '#blMd') || today();
    const list = moveTargets();
    if (!list.length) { alert('학생을 체크해 주세요'); return; }
    if (!confirm(list.length + '명을 ' + d + '에 ' + (leave ? '퇴원 처리할까요?\n모든 수강반이 종료되고 상태가 "퇴원"으로 바뀌어요.' : from.name + ' 수강 종료할까요?'))) return;
    try {
      const F = await fsx(); const batch = F.writeBatch(db);
      list.forEach((s) => {
        const enr = (s.enrollments || []).map((e) => (!e.end && (leave || e.classId === from.id)) ? { ...e, end: d } : e);
        const patch = { enrollments: enr }; if (leave) { patch.status = '퇴원'; patch.leaveDate = d; }
        batch.update(doc(db, C.students, s.id), patch); Object.assign(s, patch);
      });
      await batch.commit();
      // 종료일 뒤 미납 청구 안내
      const after = [...S.charges.values()].filter((c) => list.some((s) => s.id === c.bsId) && c.status !== '취소' && (c.paid || 0) === 0 && c.dueDate > d && (leave || c.classId === from.id));
      let hpMsg = '';
      if (leave) { let h = 0; for (const st of list) { if ((await pushHomepageStatus(st, true, d)).includes('홈페이지도')) h++; } if (h) hpMsg = ' · 홈페이지 ' + h + '명도 퇴원'; else if (P) hpMsg = ' · 테스트 모드라 홈페이지는 그대로'; }
      toast(list.length + '명 처리했어요' + hpMsg + (after.length ? ' · 종료일 뒤 청구 ' + after.length + '건은 남아 있어요 (필요하면 학생 수납에서 취소)' : ''));
      renderClasses();
    } catch (e) { fail(e); }
  };
  BL.saveSettings = async () => {
    const r = $('blSet'); const g = (k) => r.querySelector('[data-s=' + k + ']').value.trim();
    const d = { autoStartMonth: g('autoStartMonth') || ymOf(today()), genDay: Math.max(1, Math.min(28, num(g('genDay')) || 20)), notifyDays: Math.max(0, Math.min(15, num(g('notifyDays')))),
      cardCompanies: g('cardCompanies').split(',').map((x) => x.trim()).filter(Boolean), etcItems: g('etcItems').split(',').map((x) => x.trim()).filter(Boolean) };
    try { await setDoc(doc(db, C.settings, 'main'), d, { merge: true }); Object.assign(S.settings, d); toast('설정을 저장했어요'); renderClasses(); } catch (e) { fail(e); }
  };

  // ═════════════════════════════════════════════════════════
  // 6) 교재
  // ═════════════════════════════════════════════════════════
  window.initBillBooks = async function () {
    const root = $('blBooks'); if (!root) return;
    const u = S.ui.books; u.q = u.q || ''; u.showOff = !!u.showOff; u.from = u.from || ymOf(today()) + '-01'; u.to = u.to || today();
    root.innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); await renderBooks(); } catch (e) { fail(e); }
  };
  async function renderBooks() {
    const u = S.ui.books;
    const q = u.q.replace(/\s+/g, '').toLowerCase();
    const list = S.books.filter((b) => (u.showOff || b.active !== false) && (!q || (b.name || '').replace(/\s+/g, '').toLowerCase().includes(q))).sort((a, b) => sortKo(a.name, b.name));
    const b = S.books.find((x) => x.id === S.cur.book);
    let moves = [];
    if (b) { const ms = await getDocs(query(collection(db, C.moves), where('bookId', '==', b.id))); moves = ms.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => sortKo(y.date + (y.createdAt ? y.createdAt.seconds : ''), x.date + (x.createdAt ? x.createdAt.seconds : ''))).slice(0, 80); }
    $('blBooks').innerHTML =
      '<div class="bl-split"><aside class="bl-side"><input class="bl-in" id="blBq" placeholder="교재 검색" value="' + esc(u.q) + '">' +
      '<label class="bl-chk" style="margin-top:6px;"><input type="checkbox" id="blBoff"' + (u.showOff ? ' checked' : '') + '> 안 쓰는 교재도 보기</label>' +
      '<div class="bl-slist">' + (list.length ? list.map((x) => '<div class="bl-sitem' + (S.cur.book === x.id ? ' on' : '') + (x.active === false ? ' off' : '') + '" onclick="BL.pickBook(\'' + x.id + '\')"><span class="n" style="font-weight:600;font-size:12.5px;flex:1;">' + esc(x.name) + '</span><span class="m" style="flex:none;' + ((x.stock || 0) <= (x.safeStock || 0) ? 'color:var(--bl-red);font-weight:700;' : '') + '">' + (x.stock || 0) + '권</span></div>').join('') : '<div class="bl-empty">교재가 없어요</div>') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;"><button class="btn btn-secondary btn-sm" onclick="BL.editBook()">+ 교재 추가</button><button class="btn btn-secondary btn-sm" onclick="BL.importBooks()">⇣ 엑셀로 교재 한꺼번에 넣기</button></div></aside><div>' +
      (b ? '<div class="card"><div class="bl-head"><h3>' + esc(b.name) + '</h3>' + (b.active === false ? '<span class="bl-tag gray">안 씀</span>' : '') +
        '<div class="sum"><span>재고 <b style="font-size:18px;' + ((b.stock || 0) <= (b.safeStock || 0) ? 'color:var(--bl-red)' : '') + '">' + (b.stock || 0) + '권</b></span><span>구매가 <b>' + won(b.buyPrice) + '</b></span><span>판매가 <b>' + won(b.sellPrice) + '</b></span></div></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="BL.sellBook()">판매 (학생 청구)</button><button class="btn btn-secondary btn-sm" onclick="BL.stockBook(\'입고\')">입고</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="BL.stockBook(\'반품\')">반품</button><button class="btn btn-secondary btn-sm" onclick="BL.stockBook(\'폐기\')">폐기</button><button class="btn btn-secondary btn-sm" onclick="BL.stockBook(\'증정\')">증정 · 강사 지급</button>' +
        '<span style="flex:1"></span><button class="btn btn-secondary btn-sm" onclick="BL.editBook(\'' + b.id + '\')">교재 정보 수정</button></div></div>' +
        '<div class="card"><h3>입출고 기록</h3>' + (moves.length ? '<div class="bl-tw mid"><table class="bl-t"><thead><tr><th>날짜</th><th>구분</th><th class="r">권수</th><th>학생 · 거래처</th><th>메모</th><th>처리자</th></tr></thead><tbody>' +
          moves.map((m) => '<tr><td>' + shortD(m.date) + '</td><td><span class="bl-st ' + (m.type === '입고' || m.type === '판매취소' ? 'paid' : m.type === '판매' ? 'wait' : 'part') + '">' + esc(m.type) + '</span></td><td class="r">' + (m.qty || 0) + '</td><td>' + (m.bsId ? '<button class="lnk" onclick="BL.openStudent(\'' + m.bsId + '\')">' + esc(m.studentName) + '</button>' : esc(m.vendor || '')) + '</td><td class="wrap">' + esc(m.memo || '') + '</td><td>' + esc(m.by || '') + '</td></tr>').join('') +
          '</tbody></table></div>' : '<div class="bl-empty">기록이 없어요</div>') + '</div>'
        : '<div class="card"><div class="bl-empty">왼쪽에서 교재를 고르세요.</div></div>') +
      '<div class="card"><div class="bl-head"><h3>판매 집계</h3><input type="date" class="bl-in" id="blBf" value="' + u.from + '"> ~ <input type="date" class="bl-in" id="blBt" value="' + u.to + '">' +
      '<button class="btn btn-secondary btn-sm" id="blBsum">조회</button><div class="sum"><button class="btn btn-secondary btn-sm" id="blBxl">엑셀로 저장</button></div></div><div id="blBsumOut"><div class="bl-empty">기간을 정하고 조회를 누르세요</div></div></div>' +
      '</div></div>';
    $('blBq').oninput = (e) => { u.q = e.target.value; const pos = e.target.selectionStart; renderBooks().then(() => { const el = $('blBq'); el.focus(); el.setSelectionRange(pos, pos); }); };
    $('blBoff').onchange = (e) => { u.showOff = e.target.checked; renderBooks(); };
    $('blBf').onchange = (e) => { u.from = e.target.value; };
    $('blBt').onchange = (e) => { u.to = e.target.value; };
    $('blBsum').onclick = () => bookSummary();
    $('blBxl').onclick = () => bookSummary(true);
  }
  BL.pickBook = (id) => { S.cur.book = id; renderBooks(); };
  async function bookSummary(excel) {
    const u = S.ui.books;
    const ms = await getDocs(query(collection(db, C.moves), where('date', '>=', u.from)));
    const g = {};
    ms.docs.forEach((d) => { const m = d.data(); if (m.date > u.to) return; const x = g[m.bookId] || (g[m.bookId] = { 입고: 0, 판매: 0, 판매취소: 0, 반품: 0, 폐기: 0, 증정: 0 }); x[m.type] = (x[m.type] || 0) + (m.qty || 0); });
    const rows = S.books.filter((b) => g[b.id]).sort((a, b) => sortKo(a.name, b.name)).map((b) => { const x = g[b.id]; const sold = x.판매 - x.판매취소; return [b.name, x.입고, x.반품, x.폐기, sold, x.증정, b.stock || 0, b.sellPrice || 0, sold * (b.sellPrice || 0)]; });
    const head = ['교재명', '입고', '반품', '폐기', '판매(취소 뺌)', '증정', '현재 재고', '판매가', '판매 금액'];
    if (excel) { exportXlsx([head].concat(rows), '교재판매집계_' + u.from + '_' + u.to + '.xlsx'); return; }
    const tot = rows.reduce((a, r) => a + r[8], 0);
    $('blBsumOut').innerHTML = rows.length ? '<div class="bl-tw mid"><table class="bl-t"><thead><tr>' + head.map((h, i) => '<th' + (i ? ' class="r"' : '') + '>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((v, i) => '<td' + (i ? ' class="r"' : '') + '>' + (i >= 7 ? won(v) : esc(v)) + '</td>').join('') + '</tr>').join('') +
      '</tbody><tfoot><tr><td>계</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="r">' + won(tot) + '</td></tr></tfoot></table></div>' : '<div class="bl-empty">이 기간 입출고가 없어요</div>';
  }
  BL.editBook = (id) => {
    const b = id ? S.books.find((x) => x.id === id) : null; const isNew = !b; const x = b || { active: true, stock: 0, safeStock: 0 };
    modal({ title: isNew ? '교재 추가' : '교재 정보 수정', body:
      '<label class="bl-f"><span>교재명</span><input class="bl-in" data-k="n" value="' + esc(x.name || '') + '" placeholder="예: (P) 1일 20제 미적분 기본"></label>' +
      '<div class="row three"><label class="bl-f"><span>구매가</span><input class="bl-in num" data-k="bp" value="' + (x.buyPrice ? won(x.buyPrice) : '') + '"></label>' +
      '<label class="bl-f"><span>판매가</span><input class="bl-in num" data-k="sp" value="' + (x.sellPrice ? won(x.sellPrice) : '') + '"></label>' +
      '<label class="bl-f"><span>안전 재고 (이하면 빨간색)</span><input class="bl-in num" data-k="ss" value="' + (x.safeStock || 0) + '"></label></div>' +
      (isNew ? '<label class="bl-f"><span>지금 재고</span><input class="bl-in num" data-k="st" value="0"></label>' : '') +
      '<label class="bl-f"><span>사용</span><select class="bl-in" data-k="a">' + opts([{ v: '1', l: '씀' }, { v: '0', l: '안 씀' }], x.active === false ? '0' : '1') + '</select></label>',
      buttons: [{ label: '취소' }, { label: isNew ? '추가' : '저장', cls: 'btn-primary', onClick: async (r) => {
        const d = { name: val(r, '[data-k=n]'), buyPrice: num(val(r, '[data-k=bp]')), sellPrice: num(val(r, '[data-k=sp]')), safeStock: num(val(r, '[data-k=ss]')), active: val(r, '[data-k=a]') !== '0' };
        if (!d.name) { alert('교재명을 넣어 주세요'); return false; }
        if (isNew) { d.stock = num(val(r, '[data-k=st]')); const ref = await addDoc(collection(db, C.books), d); S.books.push({ id: ref.id, ...d }); S.cur.book = ref.id; }
        else { await updateDoc(doc(db, C.books, b.id), d); Object.assign(b, d); }
        renderBooks();
      } }] });
  };
  BL.stockBook = (type) => {
    const b = S.books.find((x) => x.id === S.cur.book); if (!b) return;
    modal({ title: type + ' · ' + b.name, body:
      '<div class="row"><label class="bl-f"><span>날짜</span><input type="date" class="bl-in" data-k="d" value="' + today() + '"></label>' +
      '<label class="bl-f"><span>권수</span><input class="bl-in num" data-k="q"></label></div>' +
      (type === '입고' || type === '반품' ? '<label class="bl-f"><span>거래처</span><input class="bl-in" data-k="v" placeholder="예: 학원 · 판수학"></label>' : '') +
      '<label class="bl-f"><span>메모</span><input class="bl-in" data-k="m"></label>',
      buttons: [{ label: '취소' }, { label: type, cls: 'btn-primary', onClick: async (r) => {
        const q = num(val(r, '[data-k=q]')); if (q <= 0) { alert('권수를 넣어 주세요'); return false; }
        const F = await fsx(); const delta = type === '입고' ? q : -q;
        await updateDoc(doc(db, C.books, b.id), { stock: F.increment(delta) });
        await addDoc(collection(db, C.moves), { bookId: b.id, bookName: b.name, type, qty: q, date: val(r, '[data-k=d]') || today(), vendor: val(r, '[data-k=v]'), memo: val(r, '[data-k=m]'), by: who(), createdAt: F.serverTimestamp() });
        b.stock = (b.stock || 0) + delta; toast(type + ' ' + q + '권 처리했어요'); renderBooks();
      } }] });
  };
  BL.sellBook = () => {
    const b = S.books.find((x) => x.id === S.cur.book); if (!b) return;
    const pick = new Set();
    const body =
      '<div class="bl-note">' + esc(b.name) + ' · 재고 ' + (b.stock || 0) + '권 · 판매가 ' + won(b.sellPrice) + '원</div>' +
      '<div class="row"><label class="bl-f"><span>반으로 고르기</span><select class="bl-in" data-k="cls">' + classOpts('', '반 선택') + '</select></label>' +
      '<label class="bl-f"><span>이름으로 찾기</span><input class="bl-in" data-k="q" placeholder="이름 입력"></label></div>' +
      '<div data-k="found" class="bl-chips"></div>' +
      '<div class="bl-box"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">판매할 학생 <b data-k="cnt">0</b>명</div><div data-k="picked" class="bl-chips"></div></div>' +
      '<div class="row three"><label class="bl-f"><span>1인 권수</span><input class="bl-in num" data-k="qty" value="1"></label>' +
      '<label class="bl-f"><span>1권 가격</span><input class="bl-in num" data-k="price" value="' + won(b.sellPrice) + '"></label>' +
      '<label class="bl-f"><span>납입 기한</span><input type="date" class="bl-in" data-k="due" value="' + today() + '"></label></div>' +
      '<div class="bl-note">학생마다 교재비 청구가 생기고 재고가 줄어요. 돈은 학생 수납에서 납입 처리하세요.</div>';
    modal({ title: '교재 판매', wide: true, body,
      onOpen: (r) => {
        const found = r.querySelector('[data-k=found]'), picked = r.querySelector('[data-k=picked]');
        const draw = () => {
          picked.innerHTML = [...pick].map((id) => { const s = studentById(id); return s ? '<button type="button" class="bl-chip on" data-del="' + id + '">' + esc(s.name) + ' ×</button>' : ''; }).join('') || '<span class="bl-note">아직 없어요</span>';
          r.querySelector('[data-k=cnt]').textContent = pick.size;
        };
        const show = (list) => { found.innerHTML = list.slice(0, 60).map((s) => '<button type="button" class="bl-chip' + (pick.has(s.id) ? ' on' : '') + '" data-add="' + s.id + '">' + esc(s.name) + ' <small>' + esc(classNames(s)) + '</small></button>').join(''); };
        r.querySelector('[data-k=cls]').onchange = (e) => { const list = S.students.filter((s) => s.status === '재원' && activeEnrolls(s).some((x) => x.classId === e.target.value)); list.forEach((s) => pick.add(s.id)); show(list); draw(); };
        r.querySelector('[data-k=q]').oninput = (e) => { const q = e.target.value.trim(); show(q ? S.students.filter((s) => s.status !== '퇴원' && s.name.includes(q)) : []); };
        found.onclick = (e) => { const x = e.target.closest('[data-add]'); if (!x) return; const id = x.dataset.add; if (pick.has(id)) pick.delete(id); else pick.add(id); x.classList.toggle('on', pick.has(id)); draw(); };
        picked.onclick = (e) => { const x = e.target.closest('[data-del]'); if (!x) return; pick.delete(x.dataset.del); draw(); const f = found.querySelector('[data-add="' + x.dataset.del + '"]'); if (f) f.classList.remove('on'); };
        draw();
      },
      buttons: [{ label: '취소' }, { label: '판매', cls: 'btn-primary', onClick: async (r) => {
        const qty = Math.max(1, num(val(r, '[data-k=qty]'))), price = num(val(r, '[data-k=price]')), due = val(r, '[data-k=due]') || today();
        if (!pick.size) { alert('학생을 골라 주세요'); return false; }
        const need = pick.size * qty;
        if (need > (b.stock || 0) && !confirm('재고(' + (b.stock || 0) + '권)보다 많이 팔아요 (' + need + '권). 그대로 할까요?')) return false;
        const F = await fsx();
        for (const id of pick) {
          const s = studentById(id); if (!s) continue;
          const cid = await addCharge(s, { item: '교재비', title: b.name + (qty > 1 ? ' ×' + qty : ''), amount: price * qty, dueDate: due, bookId: b.id, qty });
          await addDoc(collection(db, C.moves), { bookId: b.id, bookName: b.name, type: '판매', qty, date: today(), bsId: s.id, studentName: s.name, chargeId: cid, memo: '', by: who(), createdAt: F.serverTimestamp() });
        }
        await updateDoc(doc(db, C.books, b.id), { stock: F.increment(-need) });
        b.stock = (b.stock || 0) - need;
        toast(pick.size + '명에게 판매했어요 (교재비 청구 생성)'); renderBooks();
      } }] });
  };
  BL.importBooks = () => {
    modal({ title: '엑셀로 교재 한꺼번에 넣기', body:
      '<div class="bl-note">첫 줄 제목: <b>교재명 · 구매가 · 판매가 · 재고</b> (아카 판매집계 엑셀을 그대로 써도 돼요 — "교재명", "현재재고", "판매가격" 칸을 찾아 읽어요). 같은 이름 교재는 가격·재고를 덮어써요.</div>' +
      '<input type="file" accept=".xlsx,.xls,.csv" class="bl-in" data-k="f">',
      buttons: [{ label: '취소' }, { label: '넣기', cls: 'btn-primary', onClick: async (r) => {
        const f = r.querySelector('[data-k=f]').files[0]; if (!f) { alert('파일을 골라 주세요'); return false; }
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const pickCol = (row, names) => { for (const k of Object.keys(row)) { const kk = k.replace(/\s+/g, ''); if (names.some((n) => kk === n)) return row[k]; } return ''; };
        let add = 0, upd = 0;
        for (const row of rows) {
          const name = String(pickCol(row, ['교재명', '책제목', '교재'])).trim(); if (!name) continue;
          const d = { name, buyPrice: num(pickCol(row, ['구매가', '구매가격'])), sellPrice: num(pickCol(row, ['판매가', '판매가격'])), stock: num(pickCol(row, ['재고', '현재재고', '재고권수'])), active: true };
          const ex = S.books.find((b) => b.name === name);
          if (ex) { const p = {}; ['buyPrice', 'sellPrice', 'stock'].forEach((k) => { if (d[k] || k === 'stock') p[k] = d[k]; }); await updateDoc(doc(db, C.books, ex.id), p); Object.assign(ex, p); upd++; }
          else { d.safeStock = 0; const ref = await addDoc(collection(db, C.books), d); S.books.push({ id: ref.id, ...d }); add++; }
        }
        toast('새 교재 ' + add + '개 · 바뀐 교재 ' + upd + '개'); renderBooks();
      } }] });
  };


  // ═════════════════════════════════════════════════════════
  // 7) 아카 데이터 가져오기 (전환)
  //    아카에서 받은 엑셀 여러 개를 한 번에 넣으면 종류를 알아서 구분:
  //      재원생(이름·부모폰·학생폰·반·상담일·학교·학년) · 납입건(이름·반·항목·납입기한·납입일·처리자·예정·납입·수수료·형태·비고)
  //      미납건(이름·반·항목·납입기한·미납액·비고·부모폰) · 퇴원생(입학일·퇴원일·이름·부모폰·학생폰·반·메모·학교·학년·상담일·담임)
  //      신규생(입학일·이름·부모폰·학생폰·반·상담일) — 입학상담 엑셀은 수납과 무관해서 건너뜀
  //    · 재원생: 아카 반별 마지막 수강료 = 매달 청구액, 납입기한 날짜 = 매월 납입일, 아카 마지막 수강료 다음 달부터 자동 발생
  //    · 같은 엑셀을 다시 넣어도 이미 들어간 줄은 건너뜀
  // ═════════════════════════════════════════════════════════
  function hash(str) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36); }
  function xlDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (typeof v === 'number') { if (v < 20000 || v > 80000) return ''; return new Date(Math.round((v - 25569) * 86400e3)).toISOString().slice(0, 10); }
    const m = String(v).trim().match(/^(\d{2,4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
    if (!m) return '';
    const y = m[1].length === 2 ? '20' + m[1] : m[1];
    return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }
  const isDate = (v) => !!xlDate(v);
  const isNum = (v) => typeof v === 'number' || (/^-?[\d,]+$/.test(String(v || '').trim()) && String(v).trim() !== '');
  const isPhone = (v) => /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(String(v || '').trim());
  const normName = (n) => String(n || '').replace(/\s+/g, '');
  const baseName = (n) => normName(n).replace(/\((s|p|S|P)\)$/i, '');
  const splitCls = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const isBookCls = (c) => /교재/.test(c);
  const isTutorCls = (c) => /과외|첨삭/.test(c);
  // 아카 반 이름 → 관 · 홈페이지 반 이름 ("(S)중3 5-A" → 산본관 "중3 5-A")
  function clsBranch(c) { return /^\(S\)|^S교재/i.test(String(c || '').trim()) ? '산본관' : '평촌관'; }
  function clsName(c) { return String(c || '').trim().replace(/^\((S|P)\)\s*/i, ''); }
  function mapItem(raw) {
    const t = String(raw || '').trim() || '수강료';
    if (t === '수강료') return { item: '수강료', label: '수강료' };
    if (/특강|모의|적성|논술|교통|기타/.test(t) && !/교재|문제집|워크북/.test(t)) return { item: '기타', label: t };
    return { item: '교재비', label: t };
  }
  function mapMethod(raw) {
    const t = String(raw || '').trim();
    if (!t) return { method: '기타', card: '' };
    if (/현금/.test(t)) return { method: '현금', card: '' };
    if (/카드/.test(t)) return { method: '카드', card: t };
    if (/계좌|이체|무통장|가상/.test(t)) return { method: '계좌이체', card: '' };
    if (/결제선생|모바일|링크/.test(t)) return { method: '결제선생', card: '' };
    return { method: '기타', card: t };
  }
  async function readRows(file) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  }
  // 엑셀 종류 알아내기 (첫 줄부터 데이터 — 아카 기본 내보내기 형식)
  function detectKind(rows, fname) {
    const n = fname || '';
    if (/입학상담/.test(n)) return 'consult';
    if (/납입/.test(n) && !/미납/.test(n)) return 'paid';
    if (/미납/.test(n)) return 'unpaid';
    if (/퇴원/.test(n)) return 'left';
    if (/신규/.test(n)) return 'new';
    if (/재원/.test(n)) return 'current';
    const r = rows.find((x) => x && x.filter((v) => v !== '').length >= 5) || [];
    if (isDate(r[0]) && isDate(r[1]) && typeof r[2] === 'string') return 'left';
    if (isDate(r[0]) && typeof r[1] === 'string' && isPhone(r[2])) return 'new';
    if (typeof r[0] === 'string' && isDate(r[3]) && isNum(r[6]) && isNum(r[7])) return 'paid';
    if (typeof r[0] === 'string' && isDate(r[3]) && isNum(r[4])) return 'unpaid';
    if (typeof r[0] === 'string' && isPhone(r[1])) return 'current';
    return '';
  }
  const KIND_LABEL = { current: '재원생', paid: '납입건', unpaid: '미납건', left: '퇴원생', new: '신규생', consult: '입학상담 (수납과 무관 · 건너뜀)' };
  const dataRow = (r) => r && typeof r[0] !== 'undefined' && String(r[0]).trim() !== '' && r.filter((v) => v !== '').length >= 3;

  window.initBillImport = async function () {
    const root = $('blImport'); if (!root) return;
    root.innerHTML = '<div class="bl-empty">불러오는 중...</div>';
    try { await loadAll(); renderImport(); } catch (e) { fail(e); }
  };
  function renderImport() {
    $('blImport').innerHTML =
      '<div class="card"><h3>아카 데이터 가져오기</h3>' +
      '<div class="bl-note" style="margin-bottom:12px;">아카에서 받은 엑셀(<b>재원생 · 납입건 · 미납건 · 퇴원생 · 신규생</b>)을 한꺼번에 골라 넣으세요. 종류는 알아서 구분해요.<br>' +
      '재원생은 아카 반별 <b>마지막 수강료</b>가 매달 청구액이 되고, 그 <b>납입기한 날짜</b>가 매월 납입일이 돼요. 자동 발생은 아카에서 마지막으로 만든 수강료 <b>다음 달</b>부터예요.<br>' +
      '같은 엑셀을 다시 넣어도 이미 들어간 줄은 건너뛰어요. 먼저 "학생 수납 › 홈페이지 학생 불러오기"를 해 두면 홈페이지 계정과 연결돼요.</div>' +
      '<div class="bl-bar"><label class="bl-f" style="flex:1;"><span>아카 엑셀 (여러 개 선택)</span><input type="file" class="bl-in full" id="blImF" accept=".xlsx,.xls" multiple></label>' +
      '<div class="bl-f"><span>&nbsp;</span><button class="btn btn-primary btn-sm" id="blImPrev">미리 보기</button></div></div></div>' +
      '<div id="blImOut"></div>';
    $('blImPrev').onclick = previewImport;
    if (S.imp && S.imp.plan) drawPlan();
  }

  async function previewImport() {
    const files = [...$('blImF').files];
    if (!files.length) { alert('엑셀을 골라 주세요'); return; }
    $('blImOut').innerHTML = '<div class="card"><div class="bl-empty">엑셀을 읽는 중...</div></div>';
    try {
      const got = { current: [], paid: [], unpaid: [], left: [], new: [] };
      const found = [];
      for (const f of files) {
        const rows = (await readRows(f)).filter(dataRow);
        // 맨 아래 합계 줄 빼기 (첫 칸이 숫자)
        const body = rows.filter((r) => !(typeof r[0] === 'number' && r.slice(1).filter((v) => v !== '').length <= 4 && !isDate(r[0])));
        const k = detectKind(body, f.name);
        found.push({ name: f.name, kind: k, n: body.length });
        if (got[k]) got[k].push(...body);
      }
      // ── 학생 목록 ──
      const studs = new Map(); // 이름 → 학생
      const put = (name, patch) => { const k = normName(name); if (!k) return null; const cur = studs.get(k) || { name: String(name).trim(), classes: [], rows: [] }; Object.keys(patch).forEach((x) => { if (patch[x] !== '' && patch[x] != null && (cur[x] == null || cur[x] === '' || x === 'status' || x === 'classes')) cur[x] = patch[x]; }); studs.set(k, cur); return cur; };
      got.left.forEach((r) => put(r[2], { status: '퇴원', joinDate: xlDate(r[0]), leaveDate: xlDate(r[1]), parentPhone: String(r[3] || ''), phone: String(r[4] || ''), school: String(r[7] || ''), grade: r[8] || '', allClasses: splitCls(r[5]) }));
      got.current.forEach((r) => put(r[0], { status: '재원', parentPhone: String(r[1] || ''), phone: String(r[2] || ''), classes: splitCls(r[3]), school: String(r[5] || ''), grade: r[6] || '' }));
      got.new.forEach((r) => { const s = studs.get(normName(r[1])); if (s && !s.joinDate) s.joinDate = xlDate(r[0]); else if (!s) put(r[1], { joinDate: xlDate(r[0]), parentPhone: String(r[2] || ''), phone: String(r[3] || ''), allClasses: splitCls(r[4]) }); });
      // ── 청구 줄 ──
      const lines = [];
      got.paid.forEach((r) => {
        const it = mapItem(r[2]); const claim = num(r[6]), paid = num(r[7]);
        const mm = mapMethod(r[9]);
        const L = { kind: 'paid', name: String(r[0]).trim(), cls: String(r[1] || '').trim(), ...it, due: xlDate(r[3]), paidDate: xlDate(r[4]), claim: Math.max(0, claim), paid: 0, refund: 0, method: mm.method, card: mm.card, note: String(r[10] || '').trim(), by: String(r[5] || '').trim() };
        if (paid < 0) L.refund = -paid; else { L.paid = Math.min(paid, claim || paid); if (!L.claim) L.claim = L.paid; }
        if (!L.claim && !L.refund) return;
        lines.push(L);
      });
      got.unpaid.forEach((r) => {
        if (!r[1] || !isNum(r[4]) || !isDate(r[3])) return; // 비고가 여러 줄로 나뉜 줄은 건너뜀
        const it = mapItem(r[2]); const amt = num(r[4]); if (!amt) return;
        lines.push({ kind: 'unpaid', name: String(r[0]).trim(), cls: String(r[1] || '').trim(), ...it, due: xlDate(r[3]), paidDate: '', claim: amt, paid: 0, refund: 0, method: '', card: '', note: String(r[5] || '').replace(/^:직접입력:/, '').trim(), phone: String(r[6] || '') });
      });
      const seen = {};
      lines.forEach((L) => { const k = [L.kind, normName(L.name), L.cls, L.label, L.claim, L.paid, L.refund, L.due, L.paidDate, L.card].join('|'); seen[k] = (seen[k] || 0) + 1; L.key = hash(k + '#' + seen[k]); const s = studs.get(normName(L.name)) || put(L.name, {}); s.rows.push(L); if (!s.parentPhone && L.phone) s.parentPhone = L.phone; });
      // ── 학생별 계획 ──
      const t = today();
      const plan = [...studs.values()].map((s) => {
        const all = [...(s.classes || []), ...(s.allClasses || []), ...s.rows.map((L) => L.cls)].filter(Boolean);
        const branch = all.length ? (all.some((c) => clsBranch(c) === '산본관') ? '산본관' : '평촌관') : '';
        const status = s.status || '퇴원';
        // 재원생: 수강 중인 반별 마지막 수강료 · 납입일
        const enr = [];
        let payDay = null, autoFrom = '';
        if (status === '재원') {
          (s.classes || []).filter((c) => !isBookCls(c)).forEach((c) => {
            const tu = s.rows.filter((L) => L.item === '수강료' && L.cls === c && L.due && L.claim).sort((a, b) => sortKo(a.due, b.due));
            const last = tu[tu.length - 1];
            const days = {}; tu.slice(-4).forEach((L) => { const d = Number(L.due.slice(8, 10)); days[d] = (days[d] || 0) + 1; });
            const day = last ? Number(Object.keys(days).sort((a, b) => days[b] - days[a] || (Number(b) === Number(last.due.slice(8, 10)) ? 1 : -1))[0]) : null;
            if (!payDay && day) payDay = day;
            if (last && (!autoFrom || addMonths(ymOf(last.due), 1) > autoFrom)) autoFrom = addMonths(ymOf(last.due), 1);
            // 한 달 수강료를 여러 번 나눠 낸 경우(같은 납입기한 여러 줄)는 합쳐서 한 달 청구액으로
            const fee = last ? tu.filter((L) => L.due === last.due).reduce((x, L) => x + L.claim, 0) : 0;
            enr.push({ aca: c, branch: clsBranch(c), className: clsName(c), fee, lastDue: last ? last.due : '', auto: !isTutorCls(c) });
          });
        }
        const open = s.rows.reduce((a, L) => a + (L.claim - L.paid > 0 && L.kind === 'unpaid' ? L.claim : 0), 0);
        const paidSum = s.rows.reduce((a, L) => a + L.paid - L.refund, 0);
        const m = matchStudent({ name: s.name, branch });
        return { key: normName(s.name), name: s.name, branch, status, joinDate: s.joinDate || '', leaveDate: s.leaveDate || '', parentPhone: s.parentPhone || '', phone: s.phone || '', school: s.school || '', grade: s.grade || '',
          enr, payDay, autoFrom, rows: s.rows, open, paid: paidSum, openN: s.rows.filter((L) => L.kind === 'unpaid').length, paidN: s.rows.filter((L) => L.kind === 'paid').length,
          match: m ? m.id : '', action: m ? 'link' : 'new' };
      }).sort((a, b) => sortKo((a.status === '재원' ? '0' : '1') + (a.match ? '1' : '0') + a.name, (b.status === '재원' ? '0' : '1') + (b.match ? '1' : '0') + b.name));
      // 아카 자료 기준일: 엑셀 안의 가장 늦은 날짜(오늘 이전) — 이 날짜까지의 수강료는 아카 자료로, 그 뒤부터 자동 발생
      const cutoff = lines.map((L) => [L.due, L.paidDate]).flat().filter((d) => d && d <= t).sort().pop() || t;
      const acaNames = new Set(plan.map((p) => p.match).filter(Boolean));
      const notInAca = S.students.filter((s) => s.status === '재원' && !acaNames.has(s.id));
      S.imp = { plan, found, cutoff, notInAca, counts: { current: got.current.length, paid: got.paid.length, unpaid: lines.filter((L) => L.kind === 'unpaid').length } };
      drawPlan();
    } catch (e) { fail(e); }
  }
  function matchStudent(row) {
    const n = normName(row.name), b = baseName(row.name);
    const same = (s) => !row.branch || !s.branch || s.branch === row.branch;
    let c = S.students.filter((s) => normName(s.name) === n && same(s));
    if (c.length === 1) return c[0];
    c = S.students.filter((s) => normName(s.name) === n);
    if (c.length === 1) return c[0];
    if (b !== n) { c = S.students.filter((s) => normName(s.name) === b && same(s)); if (c.length === 1) return c[0]; }
    return null;
  }
  function drawPlan() {
    const st = S.imp, plan = st.plan;
    const cur = plan.filter((p) => p.status === '재원');
    const un = cur.filter((p) => !p.match).length;
    const tot = plan.reduce((a, p) => { a.o += p.open; a.p += p.paid; return a; }, { o: 0, p: 0 });
    const stOpts = (p) => '<select class="bl-in" data-imp="' + esc(p.key) + '" style="min-width:150px;max-width:190px;">' +
      '<option value="new"' + (p.action === 'new' ? ' selected' : '') + '>새로 만들기</option>' +
      '<option value="skip"' + (p.action === 'skip' ? ' selected' : '') + '>건너뛰기</option>' +
      S.students.slice().sort((a, b) => sortKo(a.name, b.name)).map((s) => '<option value="id:' + s.id + '"' + (p.action === 'link' && p.match === s.id ? ' selected' : '') + '>' + esc(s.name) + ' · ' + branchShort(s.branch) + '</option>').join('') + '</select>';
    const row = (p) => '<tr' + (p.match ? '' : ' class="sel"') + '><td><b>' + esc(p.name) + '</b></td><td>' + branchShort(p.branch) + '</td><td>' + stOpts(p) + '</td>' +
      '<td class="wrap">' + (p.enr.length ? p.enr.map((e) => esc(e.className) + ' <b>' + won(e.fee) + '</b>' + (e.auto ? '' : ' <small class="bl-tag gray">자동 끔</small>')).join('<br>') : '<span style="color:var(--muted)">-</span>') + '</td>' +
      '<td class="c">' + (p.payDay || '') + '</td><td>' + esc(p.autoFrom || '') + '</td>' +
      '<td class="r">' + (p.openN || '') + '</td><td class="r' + (p.open ? ' bl-cell-m' : '') + '">' + (p.open ? won(p.open) : '') + '</td><td class="r">' + (p.paidN || '') + '</td><td class="r">' + (p.paid ? won(p.paid) : '') + '</td></tr>';
    const head = '<thead><tr><th>이름</th><th>관</th><th>홈페이지 학생 연결</th><th>수강반 · 매달 청구액</th><th class="c">납입일</th><th>자동 발생 시작</th><th class="r">미납</th><th class="r">미납액</th><th class="r">납입</th><th class="r">납입 합계</th></tr></thead>';
    const left = plan.filter((p) => p.status !== '재원');
    $('blImOut').innerHTML =
      '<div class="card"><h3>읽은 엑셀</h3><div class="bl-chips">' + st.found.map((f) => '<span class="bl-tag' + (f.kind && f.kind !== 'consult' ? '' : ' gray') + '">' + esc(f.name) + ' → ' + (KIND_LABEL[f.kind] || '알 수 없음') + ' ' + f.n + '줄</span>').join('') + '</div></div>' +
      '<div class="card"><div class="bl-head"><h3>재원생 ' + cur.length + '명 <small style="font-size:12px;color:var(--muted);font-weight:500;">· 아카 자료 기준일 ' + esc(st.cutoff) + ' (이 날 뒤 납입기한부터 자동 발생)</small></h3><div class="sum"><span>미납 <b style="color:var(--bl-red)">' + won(tot.o) + '원</b></span><span>1월~ 납입 <b>' + won(tot.p) + '원</b></span></div></div>' +
      (un ? '<div class="bl-box gold" style="margin-bottom:10px;font-size:13px;">홈페이지 학생과 이름이 안 맞는 재원생이 <b>' + un + '명</b> 있어요 (노란 줄). 연결할 학생을 고르거나 새로 만들기로 두세요.</div>' : '') +
      '<div class="bl-tw tall"><table class="bl-t">' + head + '<tbody>' + cur.map(row).join('') + '</tbody></table></div></div>' +
      (st.notInAca.length ? '<div class="card"><div class="bl-head"><h3>아카 재원생 명단에 없는 수납 학생 ' + st.notInAca.length + '명</h3><span class="bl-note">홈페이지에서 불러왔지만 아카에는 재원생이 아니에요. 가져온 뒤 학생 수납에서 퇴원 처리하거나 그대로 두세요.</span></div><div class="bl-chips">' +
        st.notInAca.map((s) => '<span class="bl-tag gray">' + esc(s.name) + ' · ' + branchShort(s.branch) + '</span>').join('') + '</div></div>' : '') +
      '<div class="card"><div class="bl-head"><h3>퇴원생 · 기타 ' + left.length + '명</h3><span class="bl-note">미납·납입 기록만 들어가고 수강료 자동 발생은 없어요</span></div>' +
      '<div class="bl-tw mid"><table class="bl-t">' + head + '<tbody>' + left.map(row).join('') + '</tbody></table></div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:14px;"><button class="btn btn-primary" id="blImRun">가져오기 실행</button><span class="bl-note" id="blImMsg"></span></div></div>';
    $('blImOut').querySelectorAll('[data-imp]').forEach((el) => { el.onchange = () => { const p = plan.find((x) => x.key === el.dataset.imp); const v = el.value;
      if (v.startsWith('id:')) { p.action = 'link'; p.match = v.slice(3); } else { p.action = v; p.match = ''; } }; });
    $('blImRun').onclick = runImport;
  }
  async function ensureClass(branch, name, fee) {
    let c = S.classes.find((x) => x.name === name && x.branch === branch);
    if (c) { if (!c.fee && fee) { await updateDoc(doc(db, C.classes, c.id), { fee }); c.fee = fee; } return c; }
    const data = { name, branch, category: guessCategory(branch, name), teacherName: '', fee: fee || 0, active: true };
    const ref = await addDoc(collection(db, C.classes), data); c = { id: ref.id, ...data }; S.classes.push(c); return c;
  }
  async function runImport() {
    const plan = S.imp.plan;
    const todo = plan.filter((p) => p.action !== 'skip');
    if (!confirm('학생 ' + todo.length + '명의 아카 기록을 가져올까요?\n· 재원생은 수강반·매달 청구액·납입일이 아카 기준으로 바뀌어요\n· 이미 들어간 줄은 건너뛰어요')) return;
    const btn = $('blImRun'); btn.disabled = true;
    const msg = (x) => { $('blImMsg').textContent = x; };
    try {
      const F = await fsx();
      const exist = new Map();
      (await getDocs(query(collection(db, C.charges), where('source', '==', 'aca')))).forEach((d) => exist.set(d.id, d.data().bsId));
      (await getDocs(query(collection(db, C.payments), where('source', '==', 'aca')))).forEach((d) => { if (d.data().kind === '환불') exist.set(d.id, d.data().bsId); });
      let batch = F.writeBatch(db), ops = 0, nC = 0, nP = 0, nNew = 0, nSkip = 0, nUpd = 0;
      const flush = async () => { if (ops) { await batch.commit(); batch = F.writeBatch(db); ops = 0; } };
      const add = async (fn) => { fn(batch); ops++; if (ops >= 400) await flush(); };
      let i = 0;
      for (const p of todo) {
        i++; if (i % 10 === 0) msg(i + ' / ' + todo.length + '명 처리 중...');
        let s = p.action === 'link' ? studentById(p.match) : null;
        if (!s) { const prev = p.rows.map((L) => exist.get('aca_' + L.key)).find(Boolean); if (prev) s = studentById(prev); }
        // 수강반 (재원생만, 아카 기준)
        const enrollments = [];
        for (const e of p.enr) {
          const c = await ensureClass(e.branch, e.className, e.fee);
          const old = s && (s.enrollments || []).find((x) => x.classId === c.id);
          enrollments.push({ id: old ? old.id : uid(), classId: c.id, className: c.name, fee: e.fee, discount: 0, discountReason: '', start: old && old.start ? old.start : '', end: '', auto: e.auto });
        }
        if (!s) {
          if (p.rows.length && p.rows.every((L) => exist.has('aca_' + L.key)) && p.status !== '재원') { nSkip += p.rows.length; continue; }
          const ref = doc(collection(db, C.students));
          const data = { name: p.name, studentId: '', branch: p.branch, grade: String(p.grade || ''), school: p.school, phone: p.phone, parentPhone: p.parentPhone, status: p.status,
            payDay: p.payDay || null, autoFrom: p.autoFrom || '', autoAfter: p.status === '재원' ? S.imp.cutoff : '', acaNo: '', memo: '아카에서 가져옴', joinDate: p.joinDate, leaveDate: p.leaveDate, enrollments,
            createdAt: F.serverTimestamp(), createdBy: who() + ' (아카 가져오기)' };
          await setDoc(ref, data); s = { id: ref.id, ...data }; S.students.push(s); nNew++;
        } else {
          const patch = { status: p.status };
          if (p.status === '재원') { patch.enrollments = enrollments; if (p.payDay) patch.payDay = p.payDay; if (p.autoFrom) patch.autoFrom = p.autoFrom; patch.autoAfter = S.imp.cutoff; }
          else { patch.enrollments = (s.enrollments || []).map((e) => e.end ? e : { ...e, end: p.leaveDate || today() }); }
          ['joinDate', 'leaveDate', 'parentPhone', 'phone', 'school'].forEach((k) => { if (p[k] && !s[k]) patch[k] = p[k]; });
          if (p.grade && !s.grade) patch.grade = String(p.grade);
          if (!s.branch && p.branch) patch.branch = p.branch;
          await add((b) => b.update(doc(db, C.students, s.id), patch)); Object.assign(s, patch); nUpd++;
        }
        for (const L of p.rows) {
          const cid = 'aca_' + L.key;
          if (exist.has(cid)) { nSkip++; continue; }
          const branch = s.branch || p.branch || '';
          if (L.refund) {
            await add((b) => b.set(doc(db, C.payments, cid), { bsId: s.id, studentName: s.name, branch, kind: '환불', date: L.paidDate || L.due, amount: -L.refund,
              method: L.method, cardCompany: L.card, allocations: [], memo: '아카 이전 · ' + L.label + ' 환불' + (L.note ? ' · ' + L.note : ''), cash: { need: false, issued: false }, source: 'aca', by: L.by || '아카', createdAt: F.serverTimestamp(), canceled: false }));
            nP++; continue;
          }
          const cn = L.cls && !isBookCls(L.cls) ? clsName(L.cls) : '';
          const k = cn ? S.classes.find((x) => x.name === cn && x.branch === clsBranch(L.cls)) : null;
          const title = L.item === '수강료' ? '(수강료) ' + cn : L.item === '교재비' ? L.label : '(' + L.label + ')' + (cn ? ' ' + cn : '');
          const cdata = { bsId: s.id, studentName: s.name, branch, classId: k ? k.id : '', className: cn, item: L.item, title: title.trim(), month: ymOf(L.due), dueDate: L.due,
            amount: L.claim, paid: L.paid, status: statusOf(L.claim, L.paid), lastPaidAt: L.paid > 0 ? (L.paidDate || '') : '', auto: false, source: 'aca', note: L.note ? '아카: ' + L.note : '아카 이전',
            createdAt: F.serverTimestamp(), createdBy: who() + ' (아카 가져오기)' };
          await add((b) => b.set(doc(db, C.charges, cid), cdata)); nC++;
          S.charges.set(cid, { id: cid, ...cdata });
          if (L.paid > 0) {
            await add((b) => b.set(doc(db, C.payments, cid), { bsId: s.id, studentName: s.name, branch, kind: '납입', date: L.paidDate || L.due, amount: L.paid,
              method: L.method, cardCompany: L.card, allocations: [{ chargeId: cid, amount: L.paid, title: cdata.title, month: cdata.month, dueDate: cdata.dueDate }], memo: L.note || '아카 이전',
              cash: { need: false, issued: false }, source: 'aca', by: L.by || '아카', createdAt: F.serverTimestamp(), canceled: false }));
            nP++;
          }
        }
      }
      await flush(); msg('');
      alert('가져오기 끝!\n· 새로 만든 수납 학생 ' + nNew + '명 · 정보 맞춘 학생 ' + nUpd + '명\n· 청구 ' + nC + '건 · 납입/환불 기록 ' + nP + '건\n· 이미 있어서 건너뛴 줄 ' + nSkip + '건\n\n이제 자동 발생 규칙에 따라 다음 수강료가 생겨요.');
      S.imp = null; await loadAll(true); renderImport();
    } catch (e) { fail(e); btn.disabled = false; }
  }

  // ── 화면 다시 그리기 ──
  function rerenderAll() {
    const act = document.querySelector('.tab-panel.active');
    const id = act ? act.id : '';
    if (id === 'tab-billtoday') renderToday();
    else if (id === 'tab-billstudent') { renderSlist(); renderScard(); }
    else if (id === 'tab-billunpaid') renderUnpaid();
    else if (id === 'tab-billreceipt') renderReceipt();
    else if (id === 'tab-billclasses') renderClasses();
    else if (id === 'tab-billbooks') renderBooks();
    else if (id === 'tab-billimport') renderImport();
  }
})();
