'use strict';
/* ═══════════════════════════════════════════════════════════
   📅 주간 클리어 (Weekly Clear) — 관리자 전용 업로드
   - 영상: 비메오 「주간 클리어(Weekly Clear)」 › 중1·중2·중3 폴더로 바로 업로드
           (서버 함수 adminVideo — 강의 목록 등록 + 영상 코드 자동 배정, 카테고리 주간클리어_중N)
   - PDF : 영상마다 여러 개 붙일 수 있음
           Storage weeklyClear/학년/영상ID/시각_파일명.pdf
           Firestore videos/{영상ID}.pdfs = [{ name, path, size, uploadedAt, uploadedBy }]
   - 열람: 선생님 페이지 「주간 클리어」 (영상 목록 + PDF 내려받기)
           학생은 홈페이지 주간 클리어에서 영상만 (PDF는 선생님·관리자만)
   (vimeo-upload.js 의 auApi · auTus 를 같이 씀)
   ═══════════════════════════════════════════════════════════ */
const WCA_GRADES = ['중1', '중2', '중3'];
const WCA_PDF_MAX_MB = 50;
const wca = { folders: {}, videos: [], busy: false, loaded: false };
const wcaEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wcaSize = (b) => !b ? '' : b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
function wcaMsg(text, type) {
  const el = document.getElementById('wca-msg'); if (!el) return;
  if (!text) { el.style.display = 'none'; return; }
  el.className = 'msg ' + (type || 'success'); el.innerHTML = text; el.style.display = 'block';
}

window.initWeeklyClearAdmin = async () => {
  wcaMsg('');
  await Promise.all([wcaLoadFolders(), wcaLoadVideos()]);
};

// 비메오 주간 클리어 하위 폴더 (중1·중2·중3) 위치 확인
async function wcaLoadFolders() {
  const st = document.getElementById('wca-folderstate');
  try {
    const r = await auApi('folders');
    wca.folders = {};
    (r.folders || []).forEach((f) => { const m = String(f.tag || '').match(/^주간클리어_(중[123])$/); if (m) wca.folders[m[1]] = f.uri; });
    const miss = WCA_GRADES.filter((g) => !wca.folders[g]);
    if (st) st.innerHTML = miss.length
      ? `<span style="color:#D64545;">비메오 「주간 클리어(Weekly Clear)」 안에서 ${miss.join('·')} 폴더를 찾지 못했어요. (서버 배포 전이면 퇴원연동_배포.bat 을 먼저 실행해 주세요)</span>`
      : '<span style="color:#2E9E5B;">✓ 비메오 주간 클리어 › 중1·중2·중3 폴더 연결됨</span>';
  } catch (e) {
    if (st) st.innerHTML = `<span style="color:#D64545;">비메오 폴더 확인 실패: ${wcaEsc(auErr(e))}</span>`;
  }
}

async function wcaLoadVideos() {
  const box = document.getElementById('wca-list'); if (!box) return;
  box.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'videos'), where('tag', 'in', WCA_GRADES.map((g) => '주간클리어_' + g))));
    wca.videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ord = (v) => v.order != null ? Number(v.order) : 9999;
    wca.videos.sort((a, b) => (a.tag || '').localeCompare(b.tag || '') || ord(a) - ord(b));
    wca.loaded = true;
    wcaRenderList();
  } catch (e) { box.innerHTML = `<div style="color:#D64545;font-size:13px;">불러오지 못했어요: ${wcaEsc(e.message)}</div>`; }
}
window.wcaLoadVideos = wcaLoadVideos;

function wcaRenderList() {
  const box = document.getElementById('wca-list'); if (!box) return;
  const g = document.getElementById('wca-filter')?.value || '';
  const grades = g ? [g] : WCA_GRADES;
  let html = '';
  grades.forEach((gr) => {
    const list = wca.videos.filter((v) => v.tag === '주간클리어_' + gr);
    html += `<div style="font-size:13px;font-weight:700;color:var(--purple, #5B3FA6);margin:16px 0 8px;">${gr} <span style="font-weight:400;color:var(--muted);">${list.length}강</span></div>`;
    if (!list.length) { html += '<div style="color:var(--muted);font-size:12px;padding:4px 0 8px;">아직 올린 영상이 없어요.</div>'; return; }
    html += list.map((v, i) => {
      const pdfs = Array.isArray(v.pdfs) ? v.pdfs : [];
      return `<div style="border:1px solid var(--border-soft);border-radius:10px;padding:12px 14px;margin-bottom:8px;background:rgba(30,24,56,0.02);">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:12px;color:var(--muted);min-width:20px;">${v.order != null ? wcaEsc(v.order) : i + 1}</span>
          <b style="font-size:14px;flex:1;min-width:200px;">${wcaEsc(v.title || '-')}</b>
          ${v.code ? `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:var(--purple, #5B3FA6);font-weight:600;">${wcaEsc(v.code)}</span>` : '<span style="font-size:11px;color:var(--muted);">코드 미배정</span>'}
          <span style="font-size:11px;color:var(--muted);">${wcaEsc(v.date || '')}</span>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0;">+ PDF 추가<input type="file" accept=".pdf,application/pdf" multiple style="display:none;" onchange="wcaAddPdf('${v.id}',this)"></label>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          ${pdfs.length ? pdfs.map((p, pi) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border-radius:999px;background:rgba(245,197,24,0.12);border:1px solid rgba(245,197,24,0.4);">
              📄 <a href="#" onclick="wcaOpenPdf('${v.id}',${pi});return false;" style="color:var(--off-white);text-decoration:none;">${wcaEsc(p.name)}</a>
              <span style="color:var(--muted);">${wcaSize(p.size)}</span>
              <a href="#" title="삭제" onclick="wcaDelPdf('${v.id}',${pi});return false;" style="color:#D64545;text-decoration:none;">✕</a></span>`).join('')
            : '<span style="font-size:12px;color:var(--muted);">PDF 없음</span>'}
        </div>
      </div>`;
    }).join('');
  });
  box.innerHTML = html;
}
window.wcaRenderList = wcaRenderList;

async function wcaUploadPdfs(video, grade, files) {
  const added = [];
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name)) { alert(`${f.name}: PDF만 올릴 수 있어요.`); continue; }
    if (f.size > WCA_PDF_MAX_MB * 1048576) { alert(`${f.name}: ${WCA_PDF_MAX_MB}MB를 넘어요.`); continue; }
    const name = f.name.normalize('NFC');
    const path = `weeklyClear/${grade}/${video.id}/${Date.now()}_${name.replace(/[\\/#?\[\]]/g, '_')}`;
    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, path), f, { contentType: 'application/pdf' });
      task.on('state_changed', (s) => wcaMsg(`PDF 올리는 중... ${name} ${Math.round(s.bytesTransferred / s.totalBytes * 100)}%`), reject, resolve);
    });
    added.push({ name, path, size: f.size, uploadedAt: new Date().toISOString(), uploadedBy: window.currentAdmin?.name || auth.currentUser?.email || '' });
  }
  if (added.length) {
    const pdfs = (Array.isArray(video.pdfs) ? video.pdfs : []).concat(added);
    await updateDoc(doc(db, 'videos', video.id), { pdfs });
    video.pdfs = pdfs;
  }
  return added.length;
}

// 새로 올리기: 영상(선택) + PDF(선택)
window.wcaUpload = async () => {
  if (wca.busy) return;
  const grade = document.getElementById('wca-grade').value;
  const title = document.getElementById('wca-title').value.replace(/\s+/g, ' ').trim();
  const vf = document.getElementById('wca-video').files[0];
  const pfs = [...document.getElementById('wca-pdf').files];
  if (!WCA_GRADES.includes(grade)) { alert('학년을 골라주세요.'); return; }
  if (!vf) { alert('영상 파일을 골라주세요.\n(이미 올린 영상에 PDF만 붙일 때는 아래 목록의 「+ PDF 추가」를 누르세요)'); return; }
  if (!title) { alert('영상 제목을 입력해주세요.'); return; }
  if (!wca.folders[grade]) { alert(`비메오 주간 클리어 › ${grade} 폴더를 찾지 못했어요. 새로고침 후 다시 해 주세요.`); return; }
  if (!window.tus) { alert('업로드 도구를 불러오지 못했어요. 페이지를 새로고침해 주세요.'); return; }
  wca.busy = true;
  const btn = document.getElementById('wca-btn'); btn.disabled = true; btn.textContent = '올리는 중...';
  let vimeoId = null;
  try {
    wcaMsg('영상 업로드 준비 중...');
    const r = await auApi('createUpload', { title, size: vf.size, folderUri: wca.folders[grade] });
    vimeoId = r.vimeoId;
    const q = { key: 'wca', file: vf, pct: 0 };
    const tick = setInterval(() => wcaMsg(`영상 올리는 중... ${q.pct || 0}% (${auSize(vf.size)})`), 700);
    try { await auTus(q, r.uploadLink); } finally { clearInterval(tick); }
    wcaMsg('강의 목록에 등록 중...');
    const fin = await auApi('finalize', { vimeoId });
    const v = fin.video;
    // 서버 배포 전이라 카테고리가 '중1' 등으로 들어왔으면 바로잡기
    const wantTag = '주간클리어_' + grade;
    if (v.tag !== wantTag) { await updateDoc(doc(db, 'videos', v.id), { tag: wantTag }); v.tag = wantTag; }
    if (!v.code && typeof generateVideoCode === 'function') {
      try {
        const code = generateVideoCode({ tag: v.tag, date: v.date, order: v.order }, vcUsedCodes(v.id));
        if (code) { const at = new Date().toISOString(); await updateDoc(doc(db, 'videos', v.id), { code, codeAssignedAt: at }); v.code = code; }
      } catch (e) { console.warn('영상 코드 부여 실패', e); }
    }
    try { if (typeof videosCache !== 'undefined' && !videosCache.some((x) => x.id === v.id)) videosCache.push(v); } catch (e) {}
    vimeoId = null;
    const n = pfs.length ? await wcaUploadPdfs(v, grade, pfs) : 0;
    wca.videos.push(v);
    wcaMsg(`✅ ${grade} 「${wcaEsc(title)}」 올렸어요${v.code ? ' · 코드 ' + wcaEsc(v.code) : ''}${n ? ' · PDF ' + n + '개' : ''} (비메오 변환에 몇 분 걸릴 수 있어요)`);
    document.getElementById('wca-title').value = '';
    document.getElementById('wca-video').value = '';
    document.getElementById('wca-pdf').value = '';
    await wcaLoadVideos();
  } catch (e) {
    if (vimeoId) auApi('cancel', { vimeoId }).catch(() => {});
    wcaMsg('업로드 실패: ' + wcaEsc(auErr(e)), 'error');
  } finally {
    wca.busy = false; btn.disabled = false; btn.textContent = '올리기';
  }
};

// 영상 고르면 제목 자동 채우기
window.wcaOnVideo = (input) => {
  const f = input.files[0]; const t = document.getElementById('wca-title');
  if (f && t && !t.value.trim()) t.value = f.name.normalize('NFC').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
};

// 이미 있는 영상에 PDF 추가
window.wcaAddPdf = async (id, input) => {
  const v = wca.videos.find((x) => x.id === id); const files = [...input.files]; input.value = '';
  if (!v || !files.length || wca.busy) return;
  const grade = String(v.tag || '').replace('주간클리어_', '');
  wca.busy = true;
  try { const n = await wcaUploadPdfs(v, grade, files); wcaMsg(`✅ 「${wcaEsc(v.title)}」에 PDF ${n}개 추가했어요`); wcaRenderList(); }
  catch (e) { wcaMsg('PDF 올리기 실패: ' + wcaEsc(e.message), 'error'); }
  finally { wca.busy = false; }
};

window.wcaOpenPdf = async (id, i) => {
  const p = (wca.videos.find((x) => x.id === id)?.pdfs || [])[i]; if (!p) return;
  try { window.open(await getDownloadURL(ref(storage, p.path)), '_blank'); } catch (e) { alert('PDF를 열지 못했어요: ' + e.message); }
};

window.wcaDelPdf = async (id, i) => {
  const v = wca.videos.find((x) => x.id === id); const p = (v?.pdfs || [])[i]; if (!p) return;
  if (!confirm(`「${p.name}」 PDF를 삭제할까요?`)) return;
  try {
    try { await deleteObject(ref(storage, p.path)); } catch (e) { if (e.code !== 'storage/object-not-found') throw e; }
    const pdfs = v.pdfs.filter((_, k) => k !== i);
    await updateDoc(doc(db, 'videos', id), { pdfs }); v.pdfs = pdfs;
    wcaRenderList(); wcaMsg('PDF를 삭제했어요');
  } catch (e) { alert('삭제 실패: ' + e.message); }
};
