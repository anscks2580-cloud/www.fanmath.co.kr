'use strict';
/* ═══════════════════════════════════════════════════════════
   비메오로 바로 올리기 (관리자)
   (admin.html에서 분리 — 원본 11620~11784줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ════════════════════════════════════════════════
// 비메오로 바로 올리기 (관리자) — 서버 함수 adminVideo + tus 직접 업로드
// ════════════════════════════════════════════════
const auCall = httpsCallable(functionsInstance, 'adminVideo', { timeout: 120000 });
const auApi = async (action, data = {}) => (await auCall({ action, ...data })).data;
const au = { folders: null, queue: [], uploading: false, loading: false };
const AU_GB = 1024 ** 3;
const auEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const auSize = (b) => b >= AU_GB ? (b / AU_GB).toFixed(2) + 'GB' : Math.max(1, Math.round(b / 1048576)) + 'MB';
const auErr = (e) => ((e && e.message) || String(e)).replace(/^FirebaseError:\s*/, '');

async function auLoadFolders(force) {
  if (au.loading || (au.folders && !force)) return;
  au.loading = true;
  try {
    let r;
    try { r = await auApi('folders'); }
    catch (e1) { await new Promise((ok) => setTimeout(ok, 1500)); r = await auApi('folders'); } // 서버가 막 깨어날 때 한 번 더 시도
    au.folders = r.folders || []; auFillFolders();
  }
  catch (e) { document.getElementById('auFolder').innerHTML = `<option value="">폴더 목록 실패: ${auEsc(auErr(e))}</option>`; }
  finally { au.loading = false; }
}
window.auFillFolders = function () {
  const sel = document.getElementById('auFolder');
  if (!au.folders) return;
  const q = (document.getElementById('auFolderSearch').value || '').trim().toLowerCase();
  const cur = sel.value;
  const list = au.folders.filter((f) => !q || f.name.toLowerCase().includes(q));
  sel.innerHTML = '<option value="">폴더를 선택하세요</option>' + list.map((f) => `<option value="${auEsc(f.uri)}">${auEsc(f.name)}</option>`).join('');
  if (list.some((f) => f.uri === cur)) sel.value = cur;
  else if (q && list.length === 1) sel.value = list[0].uri;
  auRenderQueue();
};

window.auAddFiles = function (files) {
  [...files].forEach((f) => {
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|avi|mkv|wmv|webm)$/i.test(f.name)) return;
    au.queue.push({ key: Math.random().toString(36).slice(2), file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim(), state: 'wait', pct: 0, msg: '' });
  });
  auRenderQueue();
};
window.auClearQueue = function () { if (au.uploading) return; au.queue = []; auRenderQueue(); };
window.auSetTitle = function (k, v) { const q = au.queue.find((x) => x.key === k); if (q) q.title = v; };
window.auRemoveQ = function (k) {
  const q = au.queue.find((x) => x.key === k);
  if (!q) return;
  if (q.state === 'up') {
    if (!confirm('업로드를 취소할까요?')) return;
    q.cancelled = true;
    try { q.tus && q.tus.abort(true); } catch (e) {}
    if (q.vimeoId) auApi('cancel', { vimeoId: q.vimeoId }).catch(() => {});
  }
  au.queue = au.queue.filter((x) => x.key !== k);
  auRenderQueue();
};

window.auRenderQueue = function () {
  const box = document.getElementById('auQueue');
  if (!box) return;
  box.innerHTML = au.queue.map((q) => `
    <div class="au-q">
      <div class="au-q-row">
        <input value="${auEsc(q.title)}" placeholder="영상 제목" maxlength="120" ${q.state === 'wait' || q.state === 'err' ? '' : 'disabled'} oninput="auSetTitle('${q.key}',this.value)">
        ${q.state === 'done' ? '' : `<button class="au-x" onclick="auRemoveQ('${q.key}')">${q.state === 'up' ? '취소' : '빼기'}</button>`}
      </div>
      <div class="au-q-meta">
        <span>${auEsc(q.file.name)} · ${auSize(q.file.size)}${q.folderName ? ' → ' + auEsc(q.folderName) : ''}</span>
        <span id="auQm-${q.key}" class="${q.state === 'err' ? 'err' : q.state === 'done' ? 'ok' : ''}">${auEsc(q.msg || (q.state === 'wait' ? '대기' : ''))}</span>
      </div>
      ${q.state === 'up' || q.state === 'done' ? `<div class="au-prog"><div id="auQp-${q.key}" style="width:${q.pct}%"></div></div>` : ''}
    </div>`).join('');
  const hasWait = au.queue.some((q) => q.state === 'wait' || q.state === 'err');
  document.getElementById('auActs').style.display = au.queue.length ? 'flex' : 'none';
  const btn = document.getElementById('auStartBtn');
  btn.disabled = au.uploading || !hasWait;
  btn.textContent = au.uploading ? '업로드 중...' : '업로드 시작';
};

function auTus(q, link) {
  return new Promise((resolve, reject) => {
    const up = new window.tus.Upload(q.file, {
      uploadUrl: link,
      chunkSize: 64 * 1024 * 1024,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      onProgress: (sent, total) => {
        q.pct = Math.round((sent / total) * 100);
        q.msg = `업로드 중 ${q.pct}% (${auSize(sent)} / ${auSize(total)})`;
        const p = document.getElementById('auQp-' + q.key), m = document.getElementById('auQm-' + q.key);
        if (p) p.style.width = q.pct + '%';
        if (m) m.textContent = q.msg;
      },
      onSuccess: () => resolve(),
      onError: (err) => reject(err),
    });
    q.tus = up;
    up.start();
  });
}

window.auStartUploads = async function () {
  if (au.uploading) return;
  const sel = document.getElementById('auFolder');
  const folderUri = sel.value;
  if (!folderUri) { showMsg('auMsg', '올릴 비메오 폴더를 먼저 선택해주세요.', 'error'); return; }
  if (!window.tus) { showMsg('auMsg', '업로드 도구를 불러오지 못했어요. 페이지를 새로고침해 주세요.', 'error'); return; }
  const folderName = sel.options[sel.selectedIndex].textContent;
  au.uploading = true;
  auRenderQueue();
  let ok = 0, fail = 0;
  for (const q of au.queue) {
    if ((q.state !== 'wait' && q.state !== 'err') || q.cancelled) continue;
    const title = (q.title || '').replace(/\s+/g, ' ').trim();
    if (!title) { q.state = 'err'; q.msg = '제목을 입력해주세요'; fail++; auRenderQueue(); continue; }
    q.title = title; q.folderName = folderName; q.state = 'up'; q.pct = 0; q.msg = '업로드 준비 중...';
    auRenderQueue();
    try {
      const r = await auApi('createUpload', { title, size: q.file.size, folderUri });
      q.vimeoId = r.vimeoId;
      await auTus(q, r.uploadLink);
      if (q.cancelled) continue;
      q.msg = '강의 목록에 등록 중...';
      auRenderQueue();
      const fin = await auApi('finalize', { vimeoId: q.vimeoId });
      // 영상 고유 코드 부여 (기존 동기화와 같은 규칙)
      try {
        const v = fin.video;
        videosCache.push(v);
        const code = generateVideoCode({ tag: v.tag, date: v.date, order: v.order }, vcUsedCodes(v.id));
        if (code) {
          const at = new Date().toISOString();
          await updateDoc(doc(db, 'videos', v.id), { code, codeAssignedAt: at });
          v.code = code; v.codeAssignedAt = at;
        }
      } catch (e) { console.warn('영상 코드 부여 실패', e); }
      q.state = 'done'; q.pct = 100; q.msg = '완료 — 강의 목록에 등록됐어요'; ok++;
    } catch (e) {
      if (q.cancelled) continue;
      if (q.vimeoId) { auApi('cancel', { vimeoId: q.vimeoId }).catch(() => {}); q.vimeoId = null; }
      q.state = 'err'; q.msg = '실패: ' + auErr(e); fail++;
    }
    auRenderQueue();
  }
  au.uploading = false;
  auRenderQueue();
  try { await loadVideos(); } catch (e) {}
  if (ok || fail) showMsg('auMsg', `${ok}개 업로드 완료${fail ? ` · 실패 ${fail}개` : ''} (비메오 변환에 몇 분 걸릴 수 있어요)`, fail ? 'error' : 'success');
  setTimeout(() => { au.queue = au.queue.filter((q) => q.state !== 'done'); auRenderQueue(); }, 5000);
};

window.addEventListener('beforeunload', (e) => { if (au.uploading) { e.preventDefault(); e.returnValue = ''; } });
(function () {
  const d = document.getElementById('auDrop');
  if (!d) return;
  ['dragenter', 'dragover'].forEach((t) => d.addEventListener(t, (e) => { e.preventDefault(); d.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => d.addEventListener(t, (e) => { e.preventDefault(); d.classList.remove('over'); }));
  d.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) auAddFiles(e.dataTransfer.files); });
})();
// 강의 관리 탭을 열 때 폴더 목록 불러오기
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.admin-tab');
  if (b && /switchTab\('videos'/.test(b.getAttribute('onclick') || '')) auLoadFolders();
});
window.auLoadFolders = auLoadFolders;

