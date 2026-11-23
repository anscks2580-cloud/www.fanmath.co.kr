/* ═══════════════════════════════════════════════════════════
   업무 프로그램(설치형) 공용 — 파이어베이스 연결 · 직원 계정 확인 · 작은 도구
   desk/login.html · main.html · today.html · chat.html 이 같이 씀
   (홈페이지와 같은 파이어베이스 프로젝트·같은 로그인 → 홈페이지를 고치면 프로그램에도 바로 반영)
   ═══════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy,
  limit, limitToLast, onSnapshot, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD_eYNKzfa-aT41E3Dqt_HyJc6UeSR5ErA",
  authDomain: "songmath.firebaseapp.com",
  projectId: "songmath",
  storageBucket: "songmath.firebasestorage.app",
  messagingSenderId: "936295436575",
  appId: "1:936295436575:web:d1e201508719850cfbe02a"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, limitToLast,
  onSnapshot, serverTimestamp, Timestamp, sref, uploadBytesResumable, getDownloadURL };

// 설치형 프로그램 안에서 열렸는지 (preload.js 가 window.songmathApp 을 열어 둠)
// 업무시스템 메뉴판 창 안(안쪽 창·탭)에서 열렸으면 메뉴판 창의 기능을 같이 씀
export const INNER = (() => { try { return window.parent !== window && window.parent.deskInner ? window.parent.deskInner : null; } catch (e) { return null; } })();
export const APP = window.songmathApp || (() => { try { return window.parent !== window ? window.parent.songmathApp || null : null; } catch (e) { return null; } })();
export const IN_PROGRAM = !!(APP && APP.isApp);

// 원장 계정 (원장 페이지에 들어가는 관리자 계정 2개 — firestore.rules isDirector 와 같은 값)
export const DIRECTOR_EMAILS = ['smc1823@nate.com', 'dncksfly@naver.com'];

// 아이디 → 로그인 이메일 (홈페이지 login.html 과 같은 방식)
export const idToEmail = (id) => (id.includes('@') ? id : id + '@songmath.kr');

/* 로그인 계정이 직원(관리부·원장·선생님·조교)인지 확인해 프로필을 돌려줌. 학생·학부모면 null
   { uid, email, name, kind:'admin'|'teacher'|'ta', role:'master'|'office'|'teacher'|'ta', roleLabel, branch, menuGroups, director } */
export async function staffProfile(user) {
  if (!user) return null;
  const email = String(user.email || '').toLowerCase();
  const a = await getDoc(doc(db, 'admins', user.uid)).catch(() => null);
  if (a && a.exists()) {
    const d = a.data();
    const role = d.role === 'office' ? 'office' : 'master';
    const director = DIRECTOR_EMAILS.includes(email);
    return { uid: user.uid, email, name: d.name || email.split('@')[0], kind: 'admin', role,
      roleLabel: director ? '원장' : role === 'office' ? '관리부' : '원장', branch: d.branch || '',
      menuGroups: Array.isArray(d.menuGroups) ? d.menuGroups : [], director };
  }
  const t = await getDoc(doc(db, 'teachers', user.uid)).catch(() => null);
  if (t && t.exists()) {
    const d = t.data();
    const ta = d.role === 'ta';
    return { uid: user.uid, email, name: d.name || email.split('@')[0], kind: ta ? 'ta' : 'teacher', role: ta ? 'ta' : 'teacher',
      roleLabel: ta ? '조교' : '선생님', branch: d.branch || '', menuGroups: [], director: false };
  }
  return null;
}

// 로그인 확인 → 직원이 아니거나 로그인 전이면 로그인 화면으로
//  · 프로그램을 새로 켠 뒤 아직 아무도 로그인하지 않았으면(예전 실행의 로그인이 남아 있어도) 로그아웃부터
//  · 쓰는 도중 로그아웃되거나 다른 계정으로 바뀌면 → 다시 확인 (로그인 화면으로)
export async function requireStaff(cb, { loginUrl = 'login.html' } = {}) {
  if (IN_PROGRAM && APP.freshRun) { try { if (await APP.freshRun()) await signOut(auth); } catch (e) {} }
  let doneUid = null;
  onAuthStateChanged(auth, async (user) => {
    if (doneUid) { if (!user || user.uid !== doneUid) location.replace(loginUrl); return; }
    if (!user) { location.replace(loginUrl); return; }
    const p = await staffProfile(user);
    if (!p) { await signOut(auth).catch(() => {}); location.replace(loginUrl); return; }
    doneUid = user.uid;
    cb(p, user);
  });
}

/* ── 작은 도구 ── */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const BRANCHES = ['평촌관', '산본관'];
export const BR_COLOR = { '평촌관': '#5B3FA6', '산본관': '#C99A00' };   // 평촌 = 보라, 산본 = 노랑(글씨용 진한 노랑)
export const normBr = (b) => (String(b || '').includes('산본') ? '산본관' : '평촌관');
export const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3', 'N수'];
export function gradeOf(s) {
  const g = String(s?.grade || '').trim();
  if (g.startsWith('초')) return '초등';
  if (/N수|재수|졸업/.test(g)) return 'N수';
  return GRADES.includes(g) ? g : '';
}
// 학생 수업 요일 (["월","수","금"] 또는 "월수금")
export function daysOf(s) {
  const d = s?.days;
  if (Array.isArray(d)) return d.map(String);
  return String(d || '').split('').filter((c) => DOW.includes(c));
}
// 주간성취도 대상 = 중등(초등 포함) · 과외반 제외 (선생님 페이지와 같은 기준)
export const isWeeklyTarget = (s) => { const g = String(s?.grade || '').trim(); return !(g.startsWith('고') || /N수|재수|졸업/.test(g)) && !/과외/.test(String(s?.classGroup || '')); };

// 주차 키 (teacher.html getWeekKey 와 같은 계산) — offset 1 = 지난주
export function targetMonday(d = new Date(), offsetWeeks = 1) {
  const day = d.getDay();
  const m = new Date(d); m.setHours(0, 0, 0, 0);
  m.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  m.setDate(m.getDate() - 7 * offsetWeeks);
  return m;
}
export function weekKey(d = new Date(), offsetWeeks = 1) {
  const monday = targetMonday(d, offsetWeeks);
  const y = monday.getFullYear();
  const start = new Date(y, 0, 1);
  const w = Math.ceil(((monday - start) / 86400000 + start.getDay() + 1) / 7);
  return `${y}-W${pad(w)}`;
}
export const safe = (p) => Promise.resolve(p).catch(() => null);

// 업무 화면(홈페이지 관리자·선생님 화면의 특정 메뉴) 열기 — 프로그램이면 업무 창, 인터넷 창이면 새 탭
export function openWork(page, menuId) {
  const url = new URL('/' + page + (menuId ? '#' + menuId : ''), location.origin).href;
  if (window.deskOpen) return window.deskOpen(url);                      // 메뉴판 창 안
  try { if (window.parent !== window && window.parent.deskOpen) return window.parent.deskOpen(url); } catch (e) {}   // 안쪽 창(일일종합현황)
  if (APP && APP.openWork) return APP.openWork(url);                     // 프로그램: 메뉴판 창의 탭으로 보냄
  try { if (window.opener && window.opener.deskOpen) { window.opener.deskOpen(url); window.opener.focus(); return; } } catch (e) {}
  window.open(url, 'swcWork');
}
export function openDeskWindow(name) {   // 'today' | 'chat' | 'main'
  const inner = window.deskInner || INNER;
  if (name === 'today' && inner) return inner.show('today');            // 일일종합현황은 업무시스템 화면 안에서
  if (APP && APP.openWindow) APP.openWindow(name);
  else window.open(new URL(name + '.html', location.href).href, 'swc_' + name, name === 'today' ? 'width=1320,height=860' : name === 'chat' ? 'width=980,height=720' : '');
}
export function toast(msg) {
  let el = document.getElementById('dkToast');
  if (!el) { el = document.createElement('div'); el.id = 'dkToast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600);
}
