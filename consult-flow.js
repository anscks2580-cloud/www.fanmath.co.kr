/* =====================================================================
   consult-flow.js — 방문 상담 진행 공통 모듈
   상담신청서(consult-visit.html) → 학부모 설문(learning-profile.html) → 결과 → 안내 영상
   + 관리자 페이지(admin.html)의 상담 기록 목록·통합 화면이 같은 상태 정의를 씁니다.
   단계 이름 · 저장 · 저장 확인 로직은 이 파일 한 곳에서만 관리합니다.

   [데이터 구조]
   consultForms/{상담ID}  — 상담 기록 (기존 컬렉션 그대로, 기존 필드 유지 + 아래 필드 추가)
     flowVersion: 2          새 상담 플로우로 만든 기록 (기존 기록에는 없음)
     ownerUid                QR 방문자(익명 세션) 본인 표시 — 규칙에서 "본인 기록만" 이어쓰기 허용
                             (태블릿 = 관리자 세션으로 만든 기록에는 없음)
     visitWith               'both' 학생·학부모 함께 | 'parent' 학부모만 | '' 선택 안 함
     stage                   form_completed → parent_survey_completed → consultation_completed
     parentSurvey            { status: 'not_started' | 'completed', at, code, typeName, axes }
     studentSurvey           { status: 'not_started' | 'completed', at, code, typeName, axes }
     video                   { status: 'pending' | 'completed' | 'skipped' | 'failed' | 'none', at }
     formSavedAt · updatedAt · completedAt
   learningProfiles/{상담ID}_parent , {상담ID}_student  — 설문 응답 전체 (역할별로 따로 보관,
                             같은 문서 ID에 저장하므로 여러 번 저장해도 중복 기록이 생기지 않음)
   consultConfig/video     — 상담 안내 영상 설정 (관리자 페이지에서 등록, 누구나 읽기)
   ===================================================================== */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, getDocFromServer, getDocs, setDoc, updateDoc,
  writeBatch, serverTimestamp, deleteField, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD_eYNKzfa-aT41E3Dqt_HyJc6UeSR5ErA',
  authDomain: 'songmath.firebaseapp.com',
  projectId: 'songmath',
  storageBucket: 'songmath.firebasestorage.app',
  messagingSenderId: '936295436575',
  appId: '1:936295436575:web:d1e201508719850cfbe02a'
};

/* ── 단계 · 상태 ─────────────────────────────────────────────── */
export const STAGE = Object.freeze({
  FORM_IN_PROGRESS: 'form_in_progress',               // 화면에서만 쓰는 값 (저장 전)
  FORM_COMPLETED: 'form_completed',                   // 상담신청서 저장 완료
  PARENT_SURVEY_COMPLETED: 'parent_survey_completed', // 학부모 설문 저장 완료 (영상 전)
  CONSULTATION_COMPLETED: 'consultation_completed'    // 영상 단계까지 지나 상담 준비 절차 완료
});
export const STAGE_LABEL = {
  form_in_progress: '상담신청서 작성 중',
  form_completed: '신청서 저장 · 학부모 설문 전',
  parent_survey_completed: '학부모 설문 완료 · 영상 전',
  consultation_completed: '상담 준비 완료'
};
export const SURVEY = Object.freeze({ NOT_STARTED: 'not_started', COMPLETED: 'completed' });
export const VIDEO = Object.freeze({ PENDING: 'pending', COMPLETED: 'completed', SKIPPED: 'skipped', FAILED: 'failed', NONE: 'none' });
export const VIDEO_LABEL = { pending: '보기 전', completed: '끝까지 시청', skipped: '중간에 마침', failed: '불러오기 실패', none: '없음' };

/* 화면 상단 진행 표시 (consult-visit · learning-profile 공통) */
export const FLOW_STEPS = ['상담신청서', '학부모 설문', '결과 확인', '안내 영상'];

/* 상담신청서 입력 항목 (consult-visit.html 기존 항목 그대로) */
export const FORM_FIELDS = ['level', 'branch', 'studentName', 'schoolGrade', 'parentPhone', 'studentPhone',
  'visitPath', 'visitPathEtc', 'examScores', 'strongAreas', 'weakAreas', 'selfCheck',
  'highSubjects', 'highLevel', 'progressGrade', 'progressSemester', 'progressUnit'];
const HIGH_ONLY = ['highSubjects', 'highLevel'];
const LOW_ONLY = ['progressGrade', 'progressSemester', 'progressUnit'];

/* 설문 축 이름 — learning-profile.html 의 AXES 와 같은 값.
   (관리자 화면에서 axisDetail 이 없는 예전 저장본을 표시할 때만 사용. 새 진단을 만들지 않음) */
export const AXIS_LABEL = {
  M: { name: '학습 동기', hi: 'I', lo: 'O', hiName: '자기주도', loName: '외부동기' },
  S: { name: '학습 전략', hi: 'A', lo: 'R', hiName: '능동인출', loName: '반복읽기' },
  E: { name: '실행 관리', hi: 'P', lo: 'L', hiName: '계획실행', loName: '막판집중' },
  T: { name: '실전 안정', hi: 'S', lo: 'N', hiName: '실전안정', loName: '실전긴장' }
};

/* ── 오류 구분 ────────────────────────────────────────────────
   setup      : Firebase 콘솔 설정 필요 (익명 로그인 꺼짐)
   network    : 인터넷 연결 문제 / 시간 초과
   permission : 보안 규칙상 권한 없음
   not-found  : 기록 없음
   verify     : 저장은 요청했으나 서버에서 확인되지 않음
   unknown    : 그 외 */
export class FlowError extends Error {
  constructor(kind, message, code = '') { super(message); this.name = 'FlowError'; this.kind = kind; this.code = code; }
}
export function toFlowError(e) {
  if (e instanceof FlowError) return e;
  const code = String(e?.code || '');
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation')
    return new FlowError('setup', '방문자 저장 기능(익명 로그인)이 아직 켜져 있지 않습니다.', code);
  if (code === 'permission-denied' || code === 'unauthenticated')
    return new FlowError('permission', '저장 권한이 없습니다.', code);
  if (code === 'not-found') return new FlowError('not-found', '기록을 찾을 수 없습니다.', code);
  if (['unavailable', 'deadline-exceeded', 'timeout', 'auth/network-request-failed', 'auth/timeout'].includes(code) ||
      (typeof navigator !== 'undefined' && navigator.onLine === false))
    return new FlowError('network', '인터넷 연결이 불안정합니다.', code || 'offline');
  return new FlowError('unknown', e?.message || String(e), code);
}
export function errorMessage(err, what = '저장') {
  const e = toFlowError(err);
  const tail = e.code ? ` (${e.code})` : '';
  switch (e.kind) {
    case 'network': return `인터넷 연결이 불안정해 ${what}하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.${tail}`;
    case 'permission': return `${what} 권한이 확인되지 않았습니다. 선생님께 화면을 보여 주세요.${tail}`;
    case 'setup': return `방문자 저장 설정이 아직 준비되지 않았습니다. 선생님께 알려 주세요.${tail}`;
    case 'not-found': return `상담 기록을 찾을 수 없습니다. 처음부터 다시 진행해 주세요.${tail}`;
    case 'verify': return `${what} 요청은 보냈지만 서버에서 확인되지 않았습니다. 다시 시도해 주세요.${tail}`;
    default: return `${what} 중 오류가 발생했습니다: ${e.message}${tail}`;
  }
}
function withTimeout(p, ms = 20000) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms); })])
    .finally(() => clearTimeout(t));
}

/* ── 세션 ─────────────────────────────────────────────────────
   1) 이 기기 브라우저에 관리자 로그인이 되어 있으면 관리자 권한으로 저장 (태블릿 키오스크·학생 설문)
   2) 아니면 별도 앱 이름의 익명 세션으로 저장 (QR로 접속한 학부모 휴대폰)
      → 기본 앱의 관리자/학생 로그인과 섞이지 않음 */
const VISITOR_APP = 'swcConsultVisitor';
function defaultApp() { return getApps().find(a => a.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG); }
function visitorApp() { return getApps().find(a => a.name === VISITOR_APP) || initializeApp(FIREBASE_CONFIG, VISITOR_APP); }

export async function detectAdmin() {
  const app = defaultApp();
  const auth = getAuth(app);
  await auth.authStateReady();
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return null;
  const db = getFirestore(app);
  try {
    const snap = await withTimeout(getDoc(doc(db, 'admins', u.uid)), 12000);
    return snap.exists() ? { mode: 'admin', app, auth, db, uid: u.uid, email: u.email || '' } : null;
  } catch (e) { return null; }
}

export async function adminSignIn(email, password) {
  const auth = getAuth(defaultApp());
  try { await withTimeout(signInWithEmailAndPassword(auth, email, password), 20000); }
  catch (e) { const fe = toFlowError(e); if (fe.kind === 'network') throw fe; throw new FlowError('auth', '이메일 또는 비밀번호가 올바르지 않습니다.', e?.code); }
  const s = await detectAdmin();
  if (!s) { try { await signOut(auth); } catch (e) {} throw new FlowError('auth', '관리자 권한이 있는 계정으로 로그인해 주세요.'); }
  return s;
}

export async function openSession({ allowVisitor = true } = {}) {
  const admin = await detectAdmin();
  if (admin) return admin;
  if (!allowVisitor) return null;
  const app = visitorApp();
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) {
    try { await withTimeout(signInAnonymously(auth), 15000); } catch (e) { throw toFlowError(e); }
  }
  return { mode: 'visitor', app, auth, db: getFirestore(app), uid: auth.currentUser.uid };
}

/* 방문자 세션 종료 (상담 준비 완료 후 / 다른 자녀 새로 작성 시) — 같은 기기 다음 사용자가 이전 기록에 접근하지 못하게 */
export async function endVisitorSession() {
  const app = getApps().find(a => a.name === VISITOR_APP);
  if (!app) return;
  try { await signOut(getAuth(app)); } catch (e) {}
}

/* ── 진행 중인 상담 표시 (기기 저장소) ─────────────────────────
   개인정보는 담지 않고 상담ID만 보관합니다.
   - sessionStorage: 같은 탭에서 새로고침·페이지 이동 시 복구
   - localStorage (QR 세션별, 6시간): 휴대폰에서 창을 닫았다 같은 QR로 다시 들어온 경우 복구 */
const PTR = 'swc_consult_flow';
const PTR_TTL = 6 * 3600 * 1000;
const ptrKey = s => `${PTR}:${s || 'kiosk'}`;
function readJSON(store, key) { try { const v = store.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
export const pointer = {
  get(s) {
    let p = readJSON(sessionStorage, ptrKey(s));
    if (!p && s) p = readJSON(localStorage, ptrKey(s));
    if (p && (!p.at || Date.now() - p.at > PTR_TTL)) { pointer.clear(s); return null; }
    return p;
  },
  set(p, s) {
    const v = JSON.stringify({ ...p, at: Date.now() });
    try { sessionStorage.setItem(ptrKey(s), v); } catch (e) {}
    if (s) { try { localStorage.setItem(ptrKey(s), v); } catch (e) {} }
  },
  clear(s) {
    try { sessionStorage.removeItem(ptrKey(s)); } catch (e) {}
    if (s) { try { localStorage.removeItem(ptrKey(s)); } catch (e) {} }
  }
};

/* ── 상담 기록 ──────────────────────────────────────────────── */
export function newConsultId(session) { return doc(collection(session.db, 'consultForms')).id; }

export async function loadConsult(session, cid) {
  try {
    const snap = await withTimeout(getDocFromServer(doc(session.db, 'consultForms', cid)), 15000);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { throw toFlowError(e); }
}

function pickForm(form) {
  const out = {};
  FORM_FIELDS.forEach(k => { if (form[k] !== undefined) out[k] = form[k]; });
  return out;
}

/* 상담신청서 저장 — 같은 상담ID로 다시 저장하면 새 기록을 만들지 않고 내용만 고칩니다(진행 상태는 유지). */
export async function saveConsultForm(session, cid, form, meta = {}) {
  const ref = doc(session.db, 'consultForms', cid);
  const existing = await loadConsult(session, cid);
  const fields = pickForm(form);
  const now = serverTimestamp();
  try {
    if (!existing) {
      const data = {
        ...fields,
        visitWith: meta.visitWith || '',
        source: meta.source === 'tablet' ? 'tablet' : 'qr',
        qrSession: meta.qrSession || '',
        agreePrivacy: true,
        flowVersion: 2,
        stage: STAGE.FORM_COMPLETED,
        parentSurvey: { status: SURVEY.NOT_STARTED },
        studentSurvey: { status: SURVEY.NOT_STARTED },
        video: { status: VIDEO.PENDING },
        createdAt: now, formSavedAt: now, updatedAt: now
      };
      if (session.mode === 'visitor') data.ownerUid = session.uid;
      await withTimeout(setDoc(ref, data));
    } else {
      const upd = { ...fields, visitWith: meta.visitWith || '', formSavedAt: now, updatedAt: now };
      (fields.level === '고등' ? LOW_ONLY : HIGH_ONLY).forEach(k => { if (k in existing) upd[k] = deleteField(); });
      await withTimeout(updateDoc(ref, upd));
    }
  } catch (e) { throw toFlowError(e); }
  const saved = await loadConsult(session, cid);
  if (!saved || saved.studentName !== fields.studentName || saved.parentPhone !== fields.parentPhone)
    throw new FlowError('verify', '상담신청서 저장이 확인되지 않았습니다.');
  return saved;
}

/* 설문 결과 저장 — learningProfiles/{상담ID}_{역할} + 상담 기록 요약을 한 번에(원자적으로) 저장 후 서버에서 다시 읽어 확인.
   학부모·학생 결과는 서로 다른 필드·문서에 저장되므로 덮어쓰거나 합치지 않습니다. */
export async function saveSurvey(session, cid, role, r, { source } = {}) {
  if (role !== 'parent' && role !== 'student') throw new FlowError('unknown', '알 수 없는 설문 구분입니다.');
  if (role === 'student' && session.mode !== 'admin') throw new FlowError('permission', '학생 설문은 관리자 화면에서 시작해 주세요.');
  const record = await loadConsult(session, cid);
  if (!record) throw new FlowError('not-found', '상담 기록을 찾을 수 없습니다.');
  const now = serverTimestamp();
  const cref = doc(session.db, 'consultForms', cid);
  const pref = doc(session.db, 'learningProfiles', `${cid}_${role}`);
  const profile = {
    consultId: cid, role,
    code: r.code, typeName: r.typeName, axes: r.axes,
    axisDetail: r.axisDetail || null, focus: r.focus || null, extra: r.extra || {},
    answers: r.answers || [], answerIdx: r.answerIdx || [],
    surveyVersion: 1,
    source: source || (session.mode === 'admin' ? 'admin' : 'visit'),
    branch: record.branch || '',
    completedAt: now, updatedAt: now
  };
  const upd = {
    [`${role}Survey`]: { status: SURVEY.COMPLETED, at: now, code: r.code, typeName: r.typeName, axes: r.axes },
    updatedAt: now
  };
  if (role === 'parent' && (!record.stage || record.stage === STAGE.FORM_COMPLETED)) upd.stage = STAGE.PARENT_SURVEY_COMPLETED;
  const batch = writeBatch(session.db);
  batch.set(pref, profile);
  batch.update(cref, upd);
  try { await withTimeout(batch.commit()); } catch (e) { throw toFlowError(e); }
  const v = await loadConsult(session, cid);
  const s = v && v[`${role}Survey`];
  if (!s || s.status !== SURVEY.COMPLETED || s.code !== r.code) throw new FlowError('verify', '설문 결과 저장이 확인되지 않았습니다.');
  return v;
}

export async function loadProfile(session, cid, role) {
  try {
    const snap = await withTimeout(getDoc(doc(session.db, 'learningProfiles', `${cid}_${role}`)), 15000);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { throw toFlowError(e); }
}

/* 영상 단계 결과 기록 — 영상을 끝까지 보지 않아도(건너뜀·실패·영상 없음) 상담 준비는 완료로 처리 */
export async function saveVideoStatus(session, cid, status) {
  const now = serverTimestamp();
  try {
    await withTimeout(updateDoc(doc(session.db, 'consultForms', cid),
      { video: { status, at: now }, stage: STAGE.CONSULTATION_COMPLETED, completedAt: now, updatedAt: now }), 15000);
  } catch (e) { throw toFlowError(e); }
}

/* 관리자: 최근 상담 기록 (단독 설문 결과를 기록에 연결할 때 후보 찾기) */
export async function listRecentConsults(session, n = 400) {
  try {
    const snap = await withTimeout(getDocs(query(collection(session.db, 'consultForms'), orderBy('createdAt', 'desc'), limit(n))), 20000);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { throw toFlowError(e); }
}
export const digits = v => String(v || '').replace(/\D/g, '');

/* ── 안내 영상 설정 ─────────────────────────────────────────── */
export async function loadVideoConfig(session) {
  try {
    const snap = await withTimeout(getDoc(doc(session.db, 'consultConfig', 'video')), 12000);
    return snap.exists() ? snap.data() : null;
  } catch (e) { throw toFlowError(e); }
}
/* 설정값 → 재생 정보. mp4 등 파일 주소, Vimeo(숫자 ID 또는 주소), YouTube 주소 지원 */
export function parseVideoSource(cfg) {
  if (!cfg || cfg.enabled === false) return null;
  const start = Math.max(0, Number(cfg.start) || 0);
  const end = Number(cfg.end) > start ? Number(cfg.end) : null;
  const base = { start, end, title: cfg.title || '' };
  if (cfg.vimeoId) return { ...base, kind: 'vimeo', id: String(cfg.vimeoId).replace(/\D/g, ''), hash: cfg.vimeoHash || '' };
  const url = String(cfg.url || '').trim();
  if (!url) return null;
  let m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]{6,}))?/i);
  if (m) return { ...base, kind: 'vimeo', id: m[1], hash: m[2] || (url.match(/[?&]h=([0-9a-f]+)/i) || [])[1] || '' };
  if (/^\d{5,}$/.test(url)) return { ...base, kind: 'vimeo', id: url, hash: '' };
  m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/i);
  if (m) return { ...base, kind: 'youtube', id: m[1] };
  return { ...base, kind: 'file', url };
}

/* ── 관리자 목록·통합 화면용 상태 요약 ──────────────────────────
   legacy = { parent, student } : 문서 ID 규칙 이전(예전 addDoc) 저장본이 있으면 보완용으로 전달 */
export function describeRecord(d, legacy = {}) {
  const isFlow = d.flowVersion === 2;
  const surveyOf = role => {
    const s = d[`${role}Survey`];
    if (s && s.status === SURVEY.COMPLETED) return { done: true, code: s.code || '', typeName: s.typeName || '', at: s.at || null, axes: s.axes || null };
    const p = legacy[role];
    if (p) return { done: true, code: p.code || '', typeName: p.typeName || '', at: p.completedAt || p.createdAt || null, axes: p.axes || null };
    return { done: false };
  };
  const parent = surveyOf('parent');
  const student = surveyOf('student');
  if (!student.done) student.label = d.visitWith === 'parent' ? '미실시 · 학생 미방문' : '미실시';
  if (!parent.done) parent.label = '미실시';
  const video = d.video && d.video.status ? { status: d.video.status, label: VIDEO_LABEL[d.video.status] || d.video.status, at: d.video.at || null } : null;
  let stage, stageLabel;
  if (isFlow) {
    stage = d.stage || STAGE.FORM_COMPLETED;
    if (stage === STAGE.FORM_COMPLETED && parent.done) stage = STAGE.PARENT_SURVEY_COMPLETED;
    stageLabel = STAGE_LABEL[stage] || stage;
  } else {
    stage = 'legacy';
    stageLabel = parent.done || student.done ? '신청서 접수 · 설문 연결됨' : '신청서 접수';
  }
  return {
    isFlow, stage, stageLabel, parent, student, video,
    visitWith: d.visitWith || '',
    form: { done: true, at: d.formSavedAt || d.createdAt || null },
    updatedAt: d.updatedAt || d.createdAt || null
  };
}
