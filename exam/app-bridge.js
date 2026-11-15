/* ═══════════════════════════════════════════════════════════
   /exam ↔ 송우찬수학학원 학생 앱 연결 (2026.11.15)
   · 학원 홈페이지·앱에 로그인한 「송우찬수학학원 학생」이면 인증번호 없이 바로 입장
   · 그 학생이 자료실에서 본 영상은 시청 기록으로 남김 (학원 강의와 같은 곳)
       videoProgress/{uid}_exam_…  : 영상별 시청률·본 시간 (선생님·관리자 시청현황, 학생 앱 홈에서 확인)
       studyLogs/{uid}_{날짜}      : 하루 강의 들은 시간에 합산
   · 다른 학원 학생·선생님(인증번호 입장)에게는 아무 영향 없음 — 로그인 정보가 없으면 그냥 끝남
   ═══════════════════════════════════════════════════════════ */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = getApps().length ? getApp() : initializeApp({ apiKey: "AIzaSyD_eYNKzfa-aT41E3Dqt_HyJc6UeSR5ErA", authDomain: "songmath.firebaseapp.com", projectId: "songmath", storageBucket: "songmath.firebasestorage.app", messagingSenderId: "936295436575", appId: "1:936295436575:web:d1e201508719850cfbe02a" });
const auth = getAuth(app), db = getFirestore(app);
const SS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };
const inApp = () => { try { return SS('examFromApp') === '1' || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; } };

let stu = null, ready = false, waiting = null;

// ── 학원 앱으로 돌아가기 버튼 ──
function backButton() {
  if (document.getElementById('swcAppBack')) return;
  const a = document.createElement('a');
  a.id = 'swcAppBack'; a.href = '/app.html'; a.textContent = '‹ 학원 앱';
  a.style.cssText = 'position:fixed;left:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:900;background:#5B3FA6;color:#fff;font:800 13px/1 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;padding:11px 15px;border-radius:999px;text-decoration:none;box-shadow:0 4px 14px rgba(30,24,56,.28);';
  document.body.appendChild(a);
}
if (SS('examFromApp') === '1') backButton();

onAuthStateChanged(auth, async (user) => {
  try {
    if (user) {
      const s = await getDoc(doc(db, 'students', user.uid));
      if (s.exists() && s.data().status !== '퇴원') stu = { uid: user.uid, ...s.data() };
    }
  } catch (e) { /* 학생 계정이 아니면 읽기가 막힘 → 그냥 넘어감 */ }
  ready = true;
  if (!stu) return;
  if (inApp()) backButton();
  // 인증번호 화면이 떠 있으면 송우찬수학학원 학생으로 바로 통과
  const gate = document.getElementById('authGate');
  if (gate && gate.style.display !== 'none' && !SS('examAuthCode')) {
    SS('examAuthCode', 'SWC2026'); SS('examAuthRole', 'student');
    if (SS('examAuthCode')) { location.reload(); return; }
  }
  if (waiting) { const w = waiting; waiting = null; start(w); }
});

// ══ 영상 시청 기록 ══
const TODAY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h.toString(36); };
function keyOf(kind, src) {
  if (kind === 'vimeo') { const m = /video\/(\d+)/.exec(src); return m ? 'exam_v' + m[1] : ''; }
  if (kind === 'youtube') { const m = /embed\/([\w-]+)/.exec(src); return m ? 'exam_y' + m[1] : ''; }
  return 'exam_f' + hash(String(src).split('?')[0]);
}
let cur = null, saveT = 0, ytT = 0, vmScript = null;
const loadVimeo = () => vmScript || (vmScript = new Promise((res) => { if (window.Vimeo && window.Vimeo.Player) return res(true); const s = document.createElement('script'); s.src = 'https://player.vimeo.com/api/player.js'; s.onload = () => res(true); s.onerror = () => { vmScript = null; res(false); }; document.head.appendChild(s); }));

function tick(c, sec, dur) {
  if (cur !== c) return;
  if (dur && isFinite(dur)) c.duration = dur;
  if (c.last != null) { const d = sec - c.last; if (d > 0 && d <= 2.5) { c.played += d; c.study += d; c.dirty = true; } }
  c.last = sec; if (sec > c.maxPos) c.maxPos = sec;
}

async function save(c) {
  if (!c || !stu || !c.dirty) return;
  c.dirty = false;
  const dur = c.duration || 0;
  const seen = dur ? Math.min(c.played, dur) : c.played;
  const percent = dur ? Math.min(100, Math.round(seen / dur * 100)) : 0;
  const first = c.isNew; c.isNew = false;
  const n = Math.floor(c.study); c.study -= n;
  try {
    await setDoc(doc(db, 'videoProgress', `${stu.uid}_${c.key}`), {
      studentUid: stu.uid, studentName: stu.name || '', branch: stu.branch || '', grade: stu.grade || '', teacherName: stu.teacherName || '',
      videoId: c.key, vimeoId: c.vimeoId || '', videoTitle: c.title, tag: '기말고사', examKind: c.kind,
      duration: Math.round(dur), maxWatchedSeconds: Math.round(seen), lastPositionSeconds: Math.round(c.last || 0), playedSeconds: Math.round(c.played),
      percent, completed: percent >= 95, lastWatchedAt: serverTimestamp(), ...(first ? { firstWatchedAt: serverTimestamp() } : {}),
    }, { merge: true });
  } catch (e) { console.warn('[기말고사 시청 기록] 저장 실패', e.message); c.dirty = true; if (first) c.isNew = true; }
  if (n > 0) {
    const day = TODAY();
    try { await setDoc(doc(db, 'studyLogs', `${stu.uid}_${day}`), { studentUid: stu.uid, studentName: stu.name || '', branch: stu.branch || '', date: day, seconds: increment(n), updatedAt: serverTimestamp() }, { merge: true }); }
    catch (e) { c.study += n; }
  }
}

async function start(o) {
  const key = keyOf(o.kind, o.src); if (!key) return;
  const c = cur = { key, kind: o.kind, title: String(o.title || '').slice(0, 120), vimeoId: o.kind === 'vimeo' ? key.slice(6) : '', played: 0, study: 0, maxPos: 0, last: null, duration: 0, dirty: false, isNew: true };
  try { const p = await getDoc(doc(db, 'videoProgress', `${stu.uid}_${key}`)); if (p.exists()) { const x = p.data(); c.isNew = false; c.played += x.playedSeconds || 0; c.maxPos = Math.max(c.maxPos, x.maxWatchedSeconds || 0); if (!c.duration) c.duration = x.duration || 0; } } catch (e) {}
  if (cur !== c) return;
  clearInterval(saveT); saveT = setInterval(() => save(c), 15000);
  if (o.kind === 'vimeo') {
    if (!(await loadVimeo()) || cur !== c) return;
    try {
      const pl = new window.Vimeo.Player(document.getElementById('vimeoModalFrame'));
      c.player = pl;
      pl.getDuration().then((d) => { if (cur === c && d) c.duration = d; }).catch(() => {});
      pl.on('timeupdate', (d) => tick(c, d.seconds || 0, d.duration || 0));
      pl.on('seeked', (d) => { if (cur === c) c.last = d.seconds || 0; });
      pl.on('pause', () => save(c)); pl.on('ended', () => save(c));
    } catch (e) { console.warn('[기말고사 시청 기록]', e.message); }
  } else if (o.kind === 'file') {
    const v = document.getElementById('fileVideoEl'); if (!v) return;
    c.onTime = () => tick(c, v.currentTime || 0, v.duration || 0);
    c.onSeek = () => { if (cur === c) c.last = v.currentTime || 0; };
    c.onPause = () => save(c);
    v.addEventListener('timeupdate', c.onTime); v.addEventListener('seeked', c.onSeek); v.addEventListener('pause', c.onPause); v.addEventListener('ended', c.onPause);
  } else {
    // 유튜브는 재생 위치를 알 수 없어 창을 열어 둔 시간(화면을 보고 있는 동안)만 셈 — 시청률 대신 「몇 분 시청」으로 표시
    clearInterval(ytT); ytT = setInterval(() => { if (cur === c && !document.hidden) { c.played += 1; c.study += 1; c.dirty = true; } }, 1000);
  }
}

function stop() {
  const c = cur; cur = null; waiting = null;
  clearInterval(saveT); clearInterval(ytT);
  if (!c) return;
  if (c.player) { try { c.player.off('timeupdate'); c.player.off('seeked'); c.player.off('pause'); c.player.off('ended'); } catch (e) {} }
  if (c.onTime) { const v = document.getElementById('fileVideoEl'); if (v) { v.removeEventListener('timeupdate', c.onTime); v.removeEventListener('seeked', c.onSeek); v.removeEventListener('pause', c.onPause); v.removeEventListener('ended', c.onPause); } }
  save(c);
}

// 자료실(materials.html)이 영상 창을 열고 닫을 때 부름
window.examTrack = {
  open(kind, src, title) { stop(); const o = { kind, src, title }; if (stu) start(o); else if (!ready) waiting = o; },
  close() { stop(); },
};
document.addEventListener('visibilitychange', () => { if (document.hidden && cur) save(cur); });
window.addEventListener('pagehide', () => { if (cur) save(cur); });
