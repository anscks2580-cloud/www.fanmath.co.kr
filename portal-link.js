// ══════════════════════════════════════
// 홈페이지 → 선생님·관리자 페이지로 돌아가는 버튼
// - admins/{내 uid} 문서가 있으면 "관리자 페이지", teachers/{내 uid} 문서가 있으면 "선생님 페이지"(조교는 "조교 페이지")
// - 학생·학부모 계정은 해당 문서가 없으므로 버튼이 아예 안 보임
// - 보안 규칙상 본인 문서만 읽을 수 있고, admin.html·teacher.html·ta.html도 들어갈 때 권한을 다시 확인함
// - 각 페이지의 Firebase 초기화 뒤에 실행되도록 </body> 바로 앞에 넣음
// ══════════════════════════════════════
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const style = document.createElement('style');
style.textContent = `
.portal-link-btn { display:inline-flex; align-items:center; gap:4px; font-size:12.5px; font-weight:700; color:#fff !important;
  background:var(--purple, #5B3FA6); border:1px solid var(--purple, #5B3FA6); border-radius:6px; padding:6px 12px;
  text-decoration:none !important; white-space:nowrap; font-family:inherit; line-height:1.2; }
.portal-link-btn:hover { filter:brightness(1.08); }
.portal-link-btn .s { display:none; }
.mobile-menu a.portal-link-m { color:var(--purple, #5B3FA6) !important; font-weight:700; }
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
    a.title = label + '로 돌아가기';
    a.innerHTML = `<span class="l">${label} ▸</span><span class="s">${shortLabel} ▸</span>`;
    area.insertBefore(a, area.firstChild);
  }
  const menu = document.getElementById('mobileMenu');
  if (menu) {
    const m = document.createElement('a');
    m.href = href;
    m.className = 'portal-link-m';
    m.textContent = '▸ ' + label + '로 돌아가기';
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
  return null;
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
    if (r) addLinks(r.href, r.label, r.short); else removeLinks();
  });
})();
