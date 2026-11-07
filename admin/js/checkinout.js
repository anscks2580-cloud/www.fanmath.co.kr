'use strict';
/* ═══════════════════════════════════════════════════════════
   등원·하원 (앱 코드 + 관리자 수동) · 앱 설치 현황
   - 학생이 휴대폰(checkin.html)에서 등원 코드 → 하원 코드를 넣으면 attendance/{학생uid_날짜} 에 기록
   - 휴대폰이 없는 학생은 여기서 [등원]·[하원] 버튼으로 수동 기록 (학부모 알림은 똑같이 감)
   - 하원 코드는 settings/dailyOutCode 에 따로 발급 (등원 코드는 settings/dailyCode)
   - 앱 설치 현황: 앱(홈 화면 아이콘)으로 로그인하면 appStatus/{uid} 에 기록됨 (login.html)
   - 평촌관 · 산본관 구분 표시
   모든 파일은 같은 전역 범위를 공유합니다 (db, studentsCache, Timestamp 등)
   ═══════════════════════════════════════════════════════════ */
let cioUnsub = null;
let cioToday = '';
let cioAtt = {};          // 학생uid → 오늘 출석 기록
let cioApp = {};          // uid → appStatus
let cioParentApp = {};    // 학생uid → [학부모 appStatus...]
let cioHasParent = new Set(); // 학부모 계정이 있는 학생uid

function cioTodayStr() {
  const k = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
}
function cioNow() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
}
function cioEsc(t) { return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

window.initCheckInOut = async function () {
  cioToday = cioTodayStr();
  loadOutCode();
  if (!studentsCache.length && typeof loadStudents === 'function') await loadStudents();
  await cioLoadAppStatus();
  if (typeof absLoad === 'function') await absLoad();
  // 오늘 출석 기록은 실시간으로 (학생이 휴대폰으로 체크하면 바로 반영)
  if (cioUnsub) { try { cioUnsub(); } catch (e) {} }
  cioUnsub = onSnapshot(query(collection(db, 'attendance'), where('date', '==', cioToday)), (snap) => {
    cioAtt = {};
    snap.forEach((d) => { const r = d.data(); if (r.uid) cioAtt[r.uid] = { id: d.id, ...r }; });
    renderCheckInOut();
  }, (e) => {
    const el = document.getElementById('cioList');
    if (el) el.innerHTML = `<div style="color:#D64545;font-size:13px;">출석 기록을 불러오지 못했습니다: ${cioEsc(e.message)}</div>`;
  });
  renderCheckInOut();
};

async function cioLoadAppStatus() {
  cioApp = {}; cioParentApp = {}; cioHasParent = new Set();
  try {
    const [as, ps] = await Promise.all([getDocs(collection(db, 'appStatus')), getDocs(collection(db, 'parents'))]);
    as.forEach((d) => {
      const a = { uid: d.id, ...d.data() };
      cioApp[d.id] = a;
      if (a.role === 'parent' && a.studentId) (cioParentApp[a.studentId] = cioParentApp[a.studentId] || []).push(a);
    });
    ps.forEach((d) => { const sid = d.data().studentId; if (sid) cioHasParent.add(sid); });
  } catch (e) { console.warn('앱 설치 현황 불러오기 실패', e); }
}

// ── 하원 코드 ──
window.loadOutCode = async function () {
  const disp = document.getElementById('dailyOutCodeDisplay');
  const status = document.getElementById('dailyOutCodeStatus');
  if (!disp) return;
  try {
    const snap = await getDoc(doc(db, 'settings', 'dailyOutCode'));
    if (snap.exists() && snap.data().date === cioTodayStr()) { disp.textContent = snap.data().code; status.textContent = '오늘 발급된 하원 코드입니다.'; }
    else { disp.textContent = '------'; status.textContent = '하원 코드는 수업이 끝날 때 발급해 주세요.'; }
  } catch (e) { status.textContent = '코드 조회 오류: ' + e.message; }
};
window.generateOutCode = async function () {
  const disp = document.getElementById('dailyOutCodeDisplay');
  const status = document.getElementById('dailyOutCodeStatus');
  let code = String(Math.floor(1000 + Math.random() * 9000));
  try {
    const inSnap = await getDoc(doc(db, 'settings', 'dailyCode'));
    if (inSnap.exists() && String(inSnap.data().code) === code) code = String((Number(code) % 9000) + 1000 + 1); // 등원 코드와 겹치지 않게
    await setDoc(doc(db, 'settings', 'dailyOutCode'), { code, date: cioTodayStr(), updatedAt: Timestamp.now() });
    disp.textContent = code;
    status.textContent = `${cioTodayStr()} 하원 코드 발급 완료!`;
  } catch (e) { status.textContent = '발급 실패: ' + e.message; }
};

// ── 수동 등원 / 하원 ──
window.cioManualIn = async function (sid) {
  const s = studentsCache.find((x) => x.id === sid); if (!s) return;
  if (cioAtt[sid]) return;
  if (!confirm(`${s.name} 학생을 지금 등원 처리할까요?\n학부모님께 등원 알림이 갑니다.`)) return;
  try {
    await setDoc(doc(db, 'attendance', `${sid}_${cioToday}`), {
      uid: sid, name: s.name || '', branch: s.branch || '', grade: s.grade || '', classGroup: s.classGroup || '',
      date: cioToday, time: cioNow(), method: 'manual', byUid: (window.currentAdmin && window.currentAdmin.uid) || '', createdAt: Timestamp.now(),
    });
  } catch (e) { alert('등원 처리 실패: ' + e.message); }
};
window.cioManualOut = async function (sid) {
  const s = studentsCache.find((x) => x.id === sid); const r = cioAtt[sid];
  if (!s || !r || r.outTime) return;
  if (!confirm(`${s.name} 학생을 지금 하원 처리할까요?\n학부모님께 하원 알림이 갑니다.`)) return;
  try { await updateDoc(doc(db, 'attendance', r.id), { outTime: cioNow(), outAt: Timestamp.now(), outMethod: 'manual' }); }
  catch (e) { alert('하원 처리 실패: ' + e.message); }
};
window.cioUndo = async function (sid, which) {
  const s = studentsCache.find((x) => x.id === sid); const r = cioAtt[sid]; if (!s || !r) return;
  if (which === 'out') {
    if (!confirm(`${s.name} 학생의 하원 기록(${r.outTime})을 취소할까요? (알림은 이미 갔을 수 있어요)`)) return;
    try { await updateDoc(doc(db, 'attendance', r.id), { outTime: null, outAt: null, outMethod: null }); } catch (e) { alert('취소 실패: ' + e.message); }
  } else {
    if (!confirm(`${s.name} 학생의 오늘 등원 기록(${r.time})을 지울까요? (알림은 이미 갔을 수 있어요)`)) return;
    try { await deleteDoc(doc(db, 'attendance', r.id)); } catch (e) { alert('삭제 실패: ' + e.message); }
  }
};

window.renderCheckInOut = function () {
  const el = document.getElementById('cioList'); if (!el) return;
  const branch = document.getElementById('cioBranch')?.value || '';
  const onlyToday = document.getElementById('cioOnlyToday')?.checked;
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][new Date(cioToday + 'T00:00:00').getDay()];
  const lbl = document.getElementById('cioDateLabel'); if (lbl) lbl.textContent = `${cioToday} (${dayName})`;

  let list = studentsCache.filter((s) => (!branch || s.branch === branch) && (!onlyToday || (s.days || []).includes(dayName) || cioAtt[s.id]));
  list.sort((a, b) => (a.branch || '').localeCompare(b.branch || '', 'ko') || (a.classGroup || '').localeCompare(b.classGroup || '', 'ko') || (a.name || '').localeCompare(b.name || '', 'ko'));

  const ok = (t) => `<span style="color:#2E9E5B;font-weight:700;">${t}</span>`;
  const no = (t) => `<span style="color:#B3ADC6;">${t}</span>`;
  const cell = 'padding:8px 6px;border-bottom:1px solid rgba(30,24,56,0.07);font-size:13px;vertical-align:middle;white-space:nowrap;';
  const btn = (txt, on, bg) => `<button class="btn btn-sm" onclick="${on}" style="padding:4px 10px;font-size:12px;background:${bg};color:#fff;border:none;">${txt}</button>`;
  const small = (txt, on) => `<a href="#" onclick="${on};return false;" style="font-size:11px;color:var(--muted);margin-left:4px;">${txt}</a>`;

  const byBranch = {};
  list.forEach((s) => { (byBranch[s.branch || '미지정'] = byBranch[s.branch || '미지정'] || []).push(s); });
  const branchColor = (b) => b === '산본관' ? '#C99A0A' : '#5B3FA6';

  let html = '';
  let tot = 0, nIn = 0, nOut = 0, nStuApp = 0, nParApp = 0, nPush = 0, nAbs = 0;
  const absToday = typeof absMapFor === 'function' ? absMapFor(cioToday) : null;
  const bOrder = (b) => b === '평촌관' ? 0 : b === '산본관' ? 1 : 2;
  Object.keys(byBranch).sort((x, y) => bOrder(x) - bOrder(y)).forEach((b) => {
    const rows = byBranch[b].map((s) => {
      tot++;
      const r = cioAtt[s.id];
      if (r) nIn++; if (r && r.outTime) nOut++;
      const sa = cioApp[s.id]; if (sa) nStuApp++;
      const pa = cioParentApp[s.id] || []; if (pa.length) nParApp++;
      const push = pa.some((x) => x.pushOn); if (push) nPush++;
      const ab = !r && absToday ? absToday[s.id] : null;
      if (ab) nAbs++;
      const inCell = r
        ? `${ok(cioEsc(r.time))} <small style="color:var(--muted);">${r.method === 'manual' ? '수동' : '앱'}</small>${small('취소', `cioUndo('${s.id}','in')`)}`
        : ab ? `<span style="color:#C8541F;font-weight:800;" title="${cioEsc(ab.detail || '')}">결석</span> <small style="color:#C8541F;">📝 ${cioEsc(ab.reason || '')}${ab.source === 'phone' ? ' · 전화' : ''}</small>${small('등원', `cioManualIn('${s.id}')`)}`
        : btn('등원', `cioManualIn('${s.id}')`, '#5B3FA6');
      const outCell = !r ? no('-')
        : r.outTime ? `${ok(cioEsc(r.outTime))} <small style="color:var(--muted);">${r.outMethod === 'manual' ? '수동' : '앱'}</small>${small('취소', `cioUndo('${s.id}','out')`)}`
        : btn('하원', `cioManualOut('${s.id}')`, '#2E9E5B');
      const stuCell = sa ? ok('✓ 설치') : no('미설치');
      const parCell = !cioHasParent.has(s.id) ? no('계정 없음')
        : pa.length ? `${ok('✓ 설치')} ${push ? '<span title="알림 켜짐">🔔</span>' : '<span title="알림 꺼짐" style="opacity:.5;">🔕</span>'}`
        : no('미설치');
      return `<tr>
        <td style="${cell}color:var(--muted);">${cioEsc(s.classGroup || '-')}</td>
        <td style="${cell}"><b>${cioEsc(s.name)}</b> <small style="color:var(--muted);">${cioEsc(s.grade || '')}</small></td>
        <td style="${cell}">${inCell}</td>
        <td style="${cell}">${outCell}</td>
        <td style="${cell}">${stuCell}</td>
        <td style="${cell}">${parCell}</td>
      </tr>`;
    }).join('');
    const folded = !!cioGetFold()['br_' + b];
    const bIn = byBranch[b].filter((x) => cioAtt[x.id]).length, bOut = byBranch[b].filter((x) => cioAtt[x.id] && cioAtt[x.id].outTime).length;
    html += `<div onclick="toggleCioBranch('${cioEsc(b)}')" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;font-weight:800;color:${branchColor(b)};margin:16px 0 6px;font-size:14px;padding:6px 8px;border-radius:8px;background:rgba(30,24,56,0.03);">
        <span style="display:inline-block;transition:transform .2s;${folded ? 'transform:rotate(-90deg);' : ''}">▼</span>
        <span>${cioEsc(b)} · ${byBranch[b].length}명</span>
        <span style="font-size:12px;font-weight:600;color:var(--muted);">등원 ${bIn} · 하원 ${bOut}</span>
      </div>
      <div style="overflow-x:auto;${folded ? 'display:none;' : ''}"><table style="width:100%;border-collapse:collapse;min-width:620px;">
        <thead><tr style="text-align:left;font-size:11.5px;color:var(--muted);">
          <th style="padding:6px;">반</th><th style="padding:6px;">이름</th><th style="padding:6px;">등원</th><th style="padding:6px;">하원</th><th style="padding:6px;">학생 앱</th><th style="padding:6px;">학부모 앱 · 알림</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`;
  });
  el.innerHTML = html || `<div style="color:var(--muted);padding:12px 0;">${onlyToday ? dayName + '요일 수업 학생이 없습니다.' : '학생이 없습니다.'}</div>`;
  const sum = document.getElementById('cioSummary');
  if (sum) sum.innerHTML = tot ? `대상 <b>${tot}</b>명 · 등원 <b style="color:#5B3FA6;">${nIn}</b> · 하원 <b style="color:#2E9E5B;">${nOut}</b> · 결석(사유서) <b style="color:#C8541F;">${nAbs}</b> · 아직 등원 전 <b style="color:#C8541F;">${tot - nIn - nAbs}</b>
    <span style="margin-left:10px;color:var(--muted);">| 학생 앱 ${nStuApp}/${tot} · 학부모 앱 ${nParApp}/${tot} (알림 켜짐 ${nPush})</span>` : '';
  cioApplyCardFold();
};

window.cioRefreshApp = async function () { await cioLoadAppStatus(); renderCheckInOut(); };

// ── 접기 / 펼치기 (카드 전체 · 관별 표) — 카드는 기본 접힘, 상태는 이 컴퓨터에 기억 ──
function cioGetFold() { try { return JSON.parse(localStorage.getItem('cio_fold') || '{}'); } catch (e) { return {}; } }
function cioSetFold(f) { try { localStorage.setItem('cio_fold', JSON.stringify(f)); } catch (e) {} }
function cioApplyCardFold() {
  const f = cioGetFold();
  const body = document.getElementById('cioCardBody'), arrow = document.getElementById('cioCardArrow'), sum = document.getElementById('cioCardSum');
  if (!body) return;
  const folded = f.card !== false; // 기본은 접힘 — 한 번 펼치면 그 상태를 기억
  body.style.display = folded ? 'none' : '';
  if (arrow) arrow.style.transform = folded ? 'rotate(-90deg)' : '';
  // 접혀 있을 때도 핵심 숫자는 제목 옆에 보이게
  if (sum) sum.textContent = folded ? (document.getElementById('cioSummary')?.innerText.split('|')[0].trim() || '') : '';
}
window.toggleCioCard = function () { const f = cioGetFold(); f.card = !(f.card !== false); cioSetFold(f); cioApplyCardFold(); };
window.toggleCioBranch = function (b) { const f = cioGetFold(); f['br_' + b] = !f['br_' + b]; cioSetFold(f); renderCheckInOut(); };
