// ══════════════════════════════════════
// 홈페이지 → 선생님·관리자 페이지로 돌아가는 버튼
// - admins/{내 uid} 문서가 있으면 "관리자 페이지", teachers/{내 uid} 문서가 있으면 "선생님 페이지"(조교는 "조교 페이지")
// - 학생 계정은 「마이페이지」 버튼(기본정보·숙제), 홈 첫 화면(index)에서는 최근 숙제 팝업
// - 학부모 계정은 버튼이 안 보임
// - 보안 규칙상 본인 문서만 읽을 수 있고, admin.html·teacher.html·ta.html도 들어갈 때 권한을 다시 확인함
// - 각 페이지의 Firebase 초기화 뒤에 실행되도록 </body> 바로 앞에 넣음
// ══════════════════════════════════════
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const style = document.createElement('style');
style.textContent = `
.portal-link-btn { display:inline-flex; align-items:center; gap:4px; font-size:12.5px; font-weight:700; color:#fff !important;
  background:var(--purple, #5B3FA6); border:1px solid var(--purple, #5B3FA6); border-radius:6px; padding:6px 12px;
  text-decoration:none !important; white-space:nowrap; font-family:inherit; line-height:1.2; }
.portal-link-btn:hover { filter:brightness(1.08); }
.portal-link-btn .s { display:none; }
.mobile-menu a.portal-link-m { color:var(--purple, #5B3FA6) !important; font-weight:700; }
.hwp-ov { position:fixed; inset:0; z-index:10050; background:rgba(20,14,40,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
.hwp-box { background:#fff; width:100%; max-width:400px; max-height:86vh; overflow:auto; border-radius:18px; padding:20px 18px 16px; box-shadow:0 20px 50px rgba(0,0,0,.3); font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#1A1230; word-break:keep-all; }
.hwp-box h3 { font-size:18px; font-weight:800; margin:0 0 2px; }
.hwp-box .sub { font-size:12.5px; color:#8B86A0; margin-bottom:12px; }
.hwp-item { border:1px solid #E8E5F0; border-radius:12px; padding:11px 13px; margin-bottom:8px; }
.hwp-item .t { display:flex; justify-content:space-between; gap:8px; font-size:12.5px; font-weight:700; color:#4A4160; }
.hwp-item .t small { color:#8B86A0; font-weight:600; }
.hwp-item .c { font-size:15px; margin-top:5px; white-space:pre-wrap; line-height:1.6; }
.hwp-go { display:block; width:100%; text-align:center; background:#5B3FA6; color:#fff !important; text-decoration:none !important; border-radius:12px; padding:13px; font-weight:800; font-size:15px; margin-top:6px; }
.hwp-foot { display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:13px; color:#8B86A0; }
.hwp-foot label { display:flex; align-items:center; gap:6px; cursor:pointer; }
.hwp-foot button { background:rgba(30,24,56,.07); border:0; border-radius:8px; padding:8px 14px; font-family:inherit; font-size:13px; cursor:pointer; color:#4A4160; }
@media (max-width: 480px) {
  .portal-link-btn { padding:6px 9px; font-size:12px; }
  .portal-link-btn .l { display:none; }
  .portal-link-btn .s { display:inline; }
}`;
document.head.appendChild(style);

function waitForApp(tries = 40) {
  return new Promise((resolve) => {
    const tick = (n) => {
      if (getApps().length) return resolve(getApp());
      if (n <= 0) return resolve(null);
      setTimeout(() => tick(n - 1), 150);
    };
    tick(tries);
  });
}

function removeLinks() {
  document.querySelectorAll('.portal-link-btn, .portal-link-m').forEach((el) => el.remove());
}

function addLinks(href, label, shortLabel) {
  removeLinks();
  const area = document.getElementById('navUserArea');
  if (area) {
    const a = document.createElement('a');
    a.href = href;
    a.className = 'portal-link-btn';
    a.title = href === 'mypage.html' ? '마이페이지 (기본정보·숙제)' : label + '로 돌아가기';
    a.innerHTML = `<span class="l">${label} ▸</span><span class="s">${shortLabel} ▸</span>`;
    area.insertBefore(a, area.firstChild);
  }
  const menu = document.getElementById('mobileMenu');
  if (menu) {
    const m = document.createElement('a');
    m.href = href;
    m.className = 'portal-link-m';
    m.textContent = href === 'mypage.html' ? '📝 마이페이지 (숙제 확인)' : '▸ ' + label + '로 돌아가기';
    menu.insertBefore(m, menu.firstChild);
  }
}

async function roleOf(db, uid) {
  try {
    const a = await getDoc(doc(db, 'admins', uid));
    if (a.exists()) return { href: 'admin.html', label: '관리자 페이지', short: '관리자' };
  } catch (_) {}
  try {
    const t = await getDoc(doc(db, 'teachers', uid));
    if (t.exists()) {
      return t.data().role === 'ta'
        ? { href: 'ta.html', label: '조교 페이지', short: '조교' }
        : { href: 'teacher.html', label: '선생님 페이지', short: '선생님' };
    }
  } catch (_) {}
  try {
    const st = await getDoc(doc(db, 'students', uid));
    if (st.exists() && st.data().status !== '퇴원') return { href: 'mypage.html', label: '마이페이지', short: 'MY', student: true, data: st.data() };
  } catch (_) {}
  return null;
}

// ══ 학생: 홈 첫 화면에서 최근 숙제 팝업 ══
//  - 오늘 숙제가 있으면 오늘 것, 없으면 최근 2주 안의 가장 최근 숙제 날짜 것
//  - 「닫기」는 이번 접속 동안만, 「오늘 그만 보기」는 오늘 하루 (새 숙제가 올라오면 다시 뜸)
const isHome = () => /^\/(index\.html)?$/.test(location.pathname);
const p2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const hEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function waitNoticeClosed() {
  return new Promise((resolve) => {
    const el = document.getElementById('noticePopup');
    if (!el) return resolve();
    let n = 0;
    const tick = () => {
      if (el.classList.contains('hidden') || n++ > 2400) return resolve();
      setTimeout(tick, 250);
    };
    setTimeout(tick, 1200); // 공지 팝업이 뜰 시간을 잠깐 기다림
  });
}
async function showHomeworkPopup(db, uid) {
  if (!isHome() || document.querySelector('.hwp-ov')) return;
  let rows = [];
  try {
    const snap = await getDocs(query(collection(db, 'homeworkLogs'), where('studentIds', 'array-contains', uid)));
    snap.forEach((d) => { const h = d.data(); if (!h.absent && h.date) rows.push({ id: d.id, ...h }); });
  } catch (_) { return; }
  const today = ymdOf(new Date());
  const from = ymdOf(new Date(Date.now() - 14 * 86400000));
  const dates = [...new Set(rows.map((r) => r.date).filter((d) => d <= today && d >= from))].sort().reverse();
  if (!dates.length) return;
  const day = dates[0];
  const list = rows.filter((r) => r.date === day);
  const sig = day + ':' + list.map((r) => r.id).sort().join(',');
  try {
    if (sessionStorage.getItem('swc_hwp_closed') === sig) return;
    const h = JSON.parse(localStorage.getItem('swc_hwp_hide') || 'null');
    if (h && h.date === today && h.sig === sig) return;
  } catch (_) {}
  await waitNoticeClosed();
  if (document.querySelector('.hwp-ov')) return;
  const d = new Date(day + 'T00:00:00');
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
  const ov = document.createElement('div');
  ov.className = 'hwp-ov';
  ov.innerHTML = `<div class="hwp-box" role="dialog" aria-modal="true">
    <h3>📝 ${day === today ? '오늘 숙제' : '최근 숙제'}</h3>
    <div class="sub">${label} 등록</div>
    ${list.map((r) => `<div class="hwp-item"><div class="t"><span>${hEsc(r.teacherName || '')}${r.teacherName ? ' 선생님' : ''}</span><small>${hEsc(r.classGroup || '')}</small></div><div class="c">${hEsc(r.content)}</div></div>`).join('')}
    <a class="hwp-go" href="mypage.html?date=${day}">마이페이지에서 날짜별로 보기</a>
    <div class="hwp-foot"><label><input type="checkbox" id="hwpHide"> 오늘 그만 보기</label><button type="button" id="hwpClose">닫기</button></div>
  </div>`;
  const close = () => {
    try {
      if (ov.querySelector('#hwpHide').checked) localStorage.setItem('swc_hwp_hide', JSON.stringify({ date: today, sig }));
      sessionStorage.setItem('swc_hwp_closed', sig);
    } catch (_) {}
    ov.remove();
  };
  ov.querySelector('#hwpClose').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
}

(async () => {
  const app = await waitForApp();
  if (!app) return;
  const auth = getAuth(app);
  const db = getFirestore(app);
  let seq = 0;
  onAuthStateChanged(auth, async (user) => {
    const my = ++seq;
    if (!user || user.isAnonymous) { removeLinks(); return; }
    const r = await roleOf(db, user.uid);
    if (my !== seq) return;
    // 관리자·선생님·조교는 로그인 8시간이 지나면 자동 로그아웃 (session-limit.js와 같은 기준)
    const at = Date.parse((user.metadata && user.metadata.lastSignInTime) || '');
    if (r && !r.student && (isNaN(at) || Date.now() - at > 8 * 60 * 60 * 1000)) {
      removeLinks();
      try { await signOut(auth); } catch (_) {}
      return;
    }
    if (r) addLinks(r.href, r.label, r.short); else removeLinks();
    if (r && r.student) showHomeworkPopup(db, user.uid);
  });
})();
