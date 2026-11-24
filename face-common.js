// ═══════════════════════════════════════════════════════════
// 얼굴 인식 출결 — 공통 (face-admin.html · face-kiosk.html 에서 같이 사용)
//  · 얼굴 인식은 기기(아이패드·PC) 브라우저 안에서만 처리합니다.
//    사진은 어디에도 저장하지 않고, 얼굴 특징값(숫자 목록)만 faceProfiles/{학생uid} 에 저장합니다.
//  · 인식 엔진: Human (오픈소스, 브라우저용) — 얼굴 찾기 + 특징값 + 사진 속임 방지(antispoof·liveness)
// ═══════════════════════════════════════════════════════════
import { Human } from 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3/dist/human.esm.js';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD_eYNKzfa-aT41E3Dqt_HyJc6UeSR5ErA",
  authDomain: "songmath.firebaseapp.com",
  projectId: "songmath",
  storageBucket: "songmath.firebasestorage.app",
  messagingSenderId: "936295436575",
  appId: "1:936295436575:web:d1e201508719850cfbe02a"
};

export const BRANCHES = ['평촌관', '산본관'];
export const FACE_MODEL = 'human3-faceres';

// 인식 기본 설정 (관리자 화면 「인식 설정」에서 바꾸면 settings/faceKiosk 에 저장)
export const DEFAULT_SETTINGS = {
  threshold: 0.55,     // 이 점수 이상이어야 같은 사람으로 봄 (0~1)
  margin: 0.05,        // 1등과 2등 학생 점수 차이가 이만큼은 나야 함 (닮은 학생 헷갈림 방지)
  streak: 3,           // 연속으로 같은 학생으로 인식돼야 하는 횟수
  spoofCheck: true,    // 사진·영상 화면으로 속이는 것 막기
  realMin: 0.5,        // 실제 얼굴 점수 최소
  liveMin: 0.5,        // 살아있는 얼굴 점수 최소
  minOutMinutes: 30,   // 등원 후 이 시간(분)이 지나야 다음 인식을 하원으로 처리
  minFaceRatio: 0.18,  // 화면 너비 대비 얼굴 크기 최소 (너무 멀리 있으면 무시)
};

let human = null;
export async function loadHuman(onStatus) {
  if (human) return human;
  onStatus && onStatus('얼굴 인식 엔진 불러오는 중…');
  human = new Human({
    modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3/models/',
    backend: 'webgl',
    debug: false,
    cacheSensitivity: 0,
    filter: { enabled: true, equalization: true, flip: false },
    face: {
      enabled: true,
      detector: { rotation: true, maxDetected: 3, minConfidence: 0.5, return: false },
      mesh: { enabled: true },
      attention: { enabled: false },
      iris: { enabled: false },
      description: { enabled: true },
      emotion: { enabled: false },
      antispoof: { enabled: true },
      liveness: { enabled: true },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  });
  await human.load();
  onStatus && onStatus('엔진 준비 중…');
  try { await human.warmup(); } catch (e) { /* 준비 실패해도 첫 인식 때 다시 준비됨 */ }
  return human;
}

// 카메라 켜기 (아이패드 앞면 카메라)
export async function startCamera(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('이 브라우저에서는 카메라를 쓸 수 없어요. 아이패드는 사파리로 열어 주세요.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  await new Promise((r) => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
  return stream;
}
export function stopCamera(stream) {
  try { (stream && stream.getTracks() || []).forEach((t) => t.stop()); } catch (e) {}
}

// 화면에서 가장 큰 얼굴 1개 (여러 명이 잡히면 제일 앞사람)
export async function detectMainFace(video) {
  const res = await human.detect(video);
  const faces = (res && res.face || []).filter((f) => f.embedding && f.embedding.length);
  if (!faces.length) return { face: null, count: 0 };
  faces.sort((a, b) => (b.box[2] * b.box[3]) - (a.box[2] * a.box[3]));
  return { face: faces[0], count: faces.length };
}

export function similarity(a, b) {
  return human.match.similarity(a, b);
}

// 등록된 얼굴들과 비교 → 1등·2등 학생
//  profiles: [{ uid, name, samples: [[...], ...] }]
export function bestMatch(embedding, profiles) {
  let best = null, second = null;
  for (const p of profiles) {
    let s = 0;
    for (const v of p.samples) { const x = human.match.similarity(embedding, v); if (x > s) s = x; }
    if (!best || s > best.sim) { second = best; best = { uid: p.uid, name: p.name, sim: s }; }
    else if (!second || s > second.sim) { second = { uid: p.uid, name: p.name, sim: s }; }
  }
  return { best, second };
}

// 저장용: 특징값 소수점 4자리로 줄이기 (용량 절약)
export const packEmbedding = (e) => Array.from(e, (x) => Math.round(x * 10000) / 10000);
// 파이어스토어는 배열 안에 배열을 못 넣어서 [{v:[...]}, ...] 형태로 저장
export const samplesFromDoc = (d) => (Array.isArray(d.samples) ? d.samples : []).map((s) => s && s.v).filter((v) => Array.isArray(v) && v.length);

export function todayKST() {
  const k = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
}
export function nowKST() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
}
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
