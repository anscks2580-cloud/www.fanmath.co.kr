'use strict';
/* ═══════════════════════════════════════════════════════════
   상담자료 관리 (consult-deck) · 학부모 공유 링크
   (admin.html에서 분리 — 원본 3008~3122줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 상담자료 관리 탭: 마지막 저장 정보 표시 ──
window.initConsultDeckTab = async () => {
  await Promise.all(['middle', 'high'].map(async (deckId) => {
    const el = document.getElementById(`cdk-${deckId}-status`);
    if (!el) return;
    cdkShareLoad(deckId);
    try {
      const snap = await getDoc(doc(db, 'consultDecks', deckId));
      if (!snap.exists()) { el.textContent = '기본 내용(PDF 원본) 사용 중 · 아직 편집해서 저장한 적 없음'; return; }
      const d = snap.data();
      const t = d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      const hidden = (d.scenes || []).filter(x => x.visible === false).length;
      el.textContent = '마지막 저장 ' + (t || '-') + (d.updatedBy ? ' · ' + d.updatedBy : '') + (hidden ? ' · 숨긴 화면 ' + hidden + '개' : '');
    } catch (e) { el.textContent = '저장 정보를 불러오지 못했습니다 (' + (e.code || e.message) + ')'; }
  }));
};

// ── 상담자료 학부모 공유 링크 (consultConfig/deckShare_{무작위 토큰}) ──
// consultConfig 는 원래 로그인 없이 읽는 공개 설정 컬렉션(수정은 관리자만)이라 보안 규칙 변경 없이 동작합니다.
// 공유 문서에는 상담자료(학원 소개 내용)만 들어가고 개인정보는 들어가지 않습니다.
// 링크를 받은 학부모님은 로그인 없이 그 상담자료만 휴대폰으로 볼 수 있습니다.
// · 링크로는 상담자료 화면만 열리며 관리자 페이지·상담 기록 등 다른 데이터에는 접근 불가
// · 편집(consult-deck-admin.html)에서 저장하면 공유 문서에도 자동 반영
// · 링크 주소는 한 번 만들면 계속 같음, [공유 중지] 시 이전에 보낸 링크는 더 이상 열리지 않음
// 문자·카톡용 짧은 주소: www.fanmath.co.kr/m (중등) · /h (고등) → 지금 공유 중인 링크로 이동 (m/index.html · h/index.html)
const CDK_SHORT = { middle: 'm', high: 'h' };
function cdkShareUrl(deckId, token) {
  if (CDK_SHORT[deckId] && /^https?:$/.test(location.protocol)) return new URL(CDK_SHORT[deckId], location.href).href;
  return new URL(`consult-deck.html?deck=${encodeURIComponent(deckId)}&share=${token}`, location.href).href;
}
function cdkNewToken() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return Array.from(a, (b) => abc[b % abc.length]).join('');
}
const CDK_PREFIX = 'deckShare_';
async function cdkShareDocs(deckId) {
  const qs = await getDocs(query(collection(db, 'consultConfig'), where('shareDeckId', '==', deckId)));
  return qs.docs.filter((x) => x.id.startsWith(CDK_PREFIX));
}
const cdkTok = (d) => d.id.slice(CDK_PREFIX.length);
async function cdkDeckSnapshot(deckId) {
  const s = await getDoc(doc(db, 'consultDecks', deckId));
  if (!s.exists()) return { deck: null, at: null };
  const o = { ...s.data() };
  const at = o.updatedAt || null;
  delete o.updatedAt; delete o.updatedBy;
  return { deck: o, at };
}
function cdkFmt(ts) { return ts?.toDate ? ts.toDate().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
function cdkShareRender(deckId, share, deckAt) {
  const st = document.getElementById(`cdk-${deckId}-share-st`);
  const inp = document.getElementById(`cdk-${deckId}-share-url`);
  if (!st || !inp) return;
  const on = !!share;
  inp.value = on ? cdkShareUrl(deckId, share.id) : '';
  document.querySelectorAll(`[data-cdk-on="${deckId}"]`).forEach((b) => { b.disabled = !on; });
  const mk = document.getElementById(`cdk-${deckId}-share-make`);
  if (mk) mk.textContent = on ? '🔄 최신 내용 반영' : '🔗 공유 링크 만들기';
  if (!on) { st.className = 'cdk-share-st'; st.textContent = '공유하지 않는 중 · 링크를 만들면 카카오톡으로 보낼 수 있습니다'; return; }
  const shareMs = share.data.updatedAt?.toMillis?.() || 0, deckMs = deckAt?.toMillis?.() || 0;
  const stale = deckMs && shareMs && deckMs > shareMs + 1000;
  st.className = 'cdk-share-st ' + (stale ? 'warn' : 'on');
  st.textContent = stale ? '편집 내용이 링크에 아직 반영되지 않았습니다 → [최신 내용 반영]을 눌러 주세요'
    : `공유 중 · 마지막 반영 ${cdkFmt(share.data.updatedAt) || '-'}`;
}
window.cdkShareLoad = async function(deckId) {
  const st = document.getElementById(`cdk-${deckId}-share-st`);
  try {
    const [docs, snap] = await Promise.all([cdkShareDocs(deckId), getDoc(doc(db, 'consultDecks', deckId)).catch(() => null)]);
    const live = docs.find((x) => x.data().enabled !== false);
    cdkShareRender(deckId, live ? { id: cdkTok(live), data: live.data() } : null, snap?.exists() ? snap.data().updatedAt : null);
  } catch (e) {
    if (st) { st.className = 'cdk-share-st warn'; st.textContent = '공유 링크 정보를 불러오지 못했습니다 (' + (e.code || e.message) + ')'; }
  }
};
async function cdkWriteShare(deckId, token, createdAt) {
  const { deck } = await cdkDeckSnapshot(deckId);
  const now = Timestamp.now();
  await setDoc(doc(db, 'consultConfig', CDK_PREFIX + token), { shareDeckId: deckId, deck, enabled: true, createdAt: createdAt || now, updatedAt: now });
}
window.cdkShare = async function(deckId) {
  const btn = document.getElementById(`cdk-${deckId}-share-make`);
  if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
  try {
    const docs = await cdkShareDocs(deckId);
    const live = docs.find((x) => x.data().enabled !== false);
    const token = live ? cdkTok(live) : cdkNewToken();
    await cdkWriteShare(deckId, token, live?.data().createdAt);
    showToast(live ? '최신 내용을 공유 링크에 반영했습니다' : '공유 링크를 만들었습니다');
    if (!live) cdkShareCopy(deckId, true);
  } catch (e) { console.error(e); showToast('공유 링크 처리 실패: ' + (e.code || e.message)); }
  if (btn) btn.disabled = false;
  cdkShareLoad(deckId);
};
window.cdkShareCopy = async function(deckId, silent) {
  const url = document.getElementById(`cdk-${deckId}-share-url`)?.value;
  if (!url) { if (!silent) showToast('먼저 공유 링크를 만들어 주세요'); return; }
  try { await navigator.clipboard.writeText(url); showToast('링크를 복사했습니다. 카카오톡에 붙여넣어 보내세요'); }
  catch (e) { prompt('아래 링크를 복사하세요', url); }
};
window.cdkSharePreview = function(deckId) {
  const url = document.getElementById(`cdk-${deckId}-share-url`)?.value;
  if (url) window.open(url, 'cdkSharePreview', 'width=420,height=860');
};
window.cdkShareStop = async function(deckId) {
  if (!confirm('공유를 중지할까요?\n지금까지 보낸 링크가 모두 열리지 않게 됩니다.')) return;
  try {
    const docs = await cdkShareDocs(deckId);
    await Promise.all(docs.map((x) => deleteDoc(x.ref)));
    showToast('공유를 중지했습니다');
  } catch (e) { console.error(e); showToast('공유 중지 실패: ' + (e.code || e.message)); }
  cdkShareLoad(deckId);
};

