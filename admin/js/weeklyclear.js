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
   - 🔖 인덱스: 영상마다 문제 번호별 시작 위치 videos/{영상ID}.chapters = [{ t:초, label:'1번' }]
           (학생 홈페이지·선생님 페이지 영상 아래에 번호 버튼으로 표시 — video-chapters.js)
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
          ${wcaChStateHtml(v)}
          <button class="btn btn-secondary btn-sm" style="margin:0;${Array.isArray(v.chapters) && v.chapters.length ? 'border-color:var(--purple, #5B3FA6);color:var(--purple, #5B3FA6);font-weight:600;' : ''}" onclick="wcaOpenChapters('${v.id}')" title="문제 번호별 해설 위치(구간 인덱스)">🔖 인덱스${Array.isArray(v.chapters) && v.chapters.length ? ' ' + v.chapters.length : ''}</button>
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


/* ═══════════════════════════════════════════════════════════
   🔖 구간 인덱스 편집 (문제 번호별 해설 위치)
   - 영상을 틀어 놓고 해설이 시작될 때 「지금 위치에 찍기」를 누르면 한 줄씩 들어감
   - 직접 입력도 가능:  한 줄에 하나  "3:25 2번"
   ═══════════════════════════════════════════════════════════ */
// 다음에 찍을 번호: 마지막 줄이 "2-3" 이면 "2-4", "3번" 이면 "4"
function wcaChNextNum(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  const last = lines[lines.length - 1] || '';
  let m = last.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (m) return `${m[1]}-${+m[2] + 1}`;
  m = last.match(/(\d{1,3})\s*번/);
  return m ? String(+m[1] + 1) : '1';
}
function wcaChLabel(v) {
  v = String(v || '').trim();
  return /^\d{1,3}$/.test(v) ? v + '번' : (v || '1번');
}

window.wcaOpenChapters = (id) => {
  const v = wca.videos.find((x) => x.id === id); if (!v) return;
  if (!v.vimeoId) { alert('비메오 영상 ID가 없어 열 수 없어요.'); return; }
  let ov = document.getElementById('wca-ch-modal');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'wca-ch-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(13,9,32,0.75);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 14px;';
  const text = VideoChapters.format(v.chapters);
  ov.innerHTML = `
  <div style="background:#fff;color:#1E1838;border-radius:14px;width:100%;max-width:1080px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid rgba(30,24,56,0.08);">
      <b style="flex:1;font-size:15px;">🔖 구간 인덱스 · ${wcaEsc(v.title || '')}</b>
      ${v.code ? `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:#5B3FA6;font-weight:600;">${wcaEsc(v.code)}</span>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="wcaCloseChapters()">닫기</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;">
      <div style="flex:3 1 520px;min-width:0;">
        <div style="position:relative;padding-top:56.25%;background:#000;">
          <iframe id="wca-ch-frame" src="https://player.vimeo.com/video/${encodeURIComponent(v.vimeoId)}?autoplay=0&title=0&byline=0&portrait=0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe>
        </div>
        <div id="wca-ch-preview" style="display:none;"></div>
        <div style="padding:8px 16px 12px;font-size:12px;color:#8A84A3;">↑ 학생·선생님 화면에 이렇게 보여요 (입력하면 바로 바뀜)</div>
      </div>
      <div style="flex:2 1 300px;padding:16px 18px;border-left:1px solid rgba(30,24,56,0.08);display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:12px;color:#5C5677;line-height:1.7;background:rgba(91,63,166,0.06);border-radius:8px;padding:10px 12px;">
          ① 왼쪽 영상을 틀고, 해설이 시작되는 순간 <b>「지금 위치에 찍기」</b>를 누르세요.<br>
          ② 번호는 자동으로 1씩 올라가요. (2-1처럼 쓰면 2-2, 2-3… / 숫자만 쓰면 1번, 2번…)<br>
          ③ 직접 써도 돼요 — 한 줄에 하나 <code style="background:#fff;padding:1px 5px;border-radius:4px;">3:25 2번</code>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="wca-ch-num" value="${wcaChNextNum(text)}" title="숫자만 쓰면 '3번', 2-1 처럼 쓰면 그대로" style="width:72px;padding:8px;border-radius:8px;border:1px solid rgba(30,24,56,0.15);font-size:15px;text-align:center;">
          <button class="btn btn-primary" id="wca-ch-mark" onclick="wcaChMark()" style="flex:1;">📍 지금 위치에 찍기</button>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="wcaChNudge(-2)" title="영상 2초 뒤로">⏪ 2초</button>
          <button class="btn btn-secondary btn-sm" onclick="wcaChNudge(2)" title="영상 2초 앞으로">2초 ⏩</button>
          <button class="btn btn-secondary btn-sm" onclick="wcaChUndo()" style="margin-left:auto;">마지막 줄 지우기</button>
        </div>
        <button class="btn btn-secondary btn-sm" id="wca-ch-auto" onclick="wcaChAuto('${v.id}')" title="비메오 자동 자막에서 선생님이 말한 '1번, 2번' 위치를 찾아요">🤖 자막에서 번호 자동으로 찾기</button>
        <div id="wca-ch-autonote" style="font-size:12px;color:#8A84A3;line-height:1.6;">${v.chaptersSource === 'auto' ? '지금 인덱스는 자막에서 자동으로 만든 거예요. 틀린 곳만 고쳐서 저장하세요.' : ''}</div>
        <textarea id="wca-ch-text" rows="14" spellcheck="false" placeholder="0:00 1번&#10;3:25 2번&#10;7:10 3번" style="width:100%;flex:1;min-height:220px;padding:10px 12px;border-radius:8px;border:1px solid rgba(30,24,56,0.15);font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px;line-height:1.7;resize:vertical;box-sizing:border-box;">${wcaEsc(text)}</textarea>
        <div id="wca-ch-count" style="font-size:12px;color:#8A84A3;"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="wcaChClear()">모두 지우기</button>
          <button class="btn btn-primary" id="wca-ch-save" onclick="wcaChSave('${v.id}')" style="flex:1;">저장</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  ov.addEventListener('click', (e) => { if (e.target === ov) wcaCloseChapters(); });
  const ta = document.getElementById('wca-ch-text');
  let tm = null;
  ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(wcaChPreview, 300); });
  wcaChPreview();
};

function wcaChPlayer() {
  const f = document.getElementById('wca-ch-frame');
  return f && window.Vimeo && window.Vimeo.Player ? new Vimeo.Player(f) : null;
}

function wcaChPreview() {
  const ta = document.getElementById('wca-ch-text'); if (!ta) return;
  const list = VideoChapters.parse(ta.value);
  VideoChapters.mount(document.getElementById('wca-ch-preview'), document.getElementById('wca-ch-frame'), list, { autoplay: false });
  const bad = ta.value.split(/\r?\n/).filter((l) => l.trim() && !/\d{1,2}:\d{1,2}/.test(l)).length;
  const c = document.getElementById('wca-ch-count');
  if (c) c.innerHTML = `${list.length}구간` + (bad ? ` · <span style="color:#D64545;">시간이 없는 줄 ${bad}개는 빠져요</span>` : '');
}

window.wcaChMark = async () => {
  const p = wcaChPlayer(); if (!p) { alert('플레이어를 불러오지 못했어요. 새로고침해 주세요.'); return; }
  try {
    const t = await p.getCurrentTime();
    const numEl = document.getElementById('wca-ch-num');
    const label = wcaChLabel(numEl.value);
    const ta = document.getElementById('wca-ch-text');
    const lines = ta.value.split(/\r?\n/).filter((l) => l.trim());
    lines.push(`${VideoChapters.fmt(t)} ${label}`);
    ta.value = VideoChapters.format(VideoChapters.parse(lines.join('\n')));
    numEl.value = wcaChNextNum(`0:00 ${label}`);
    wcaChPreview();
  } catch (e) { alert('현재 위치를 읽지 못했어요: ' + e.message); }
};

window.wcaChNudge = async (d) => {
  const p = wcaChPlayer(); if (!p) return;
  try { const t = await p.getCurrentTime(); await p.setCurrentTime(Math.max(0, t + d)); } catch (e) {}
};

window.wcaChUndo = () => {
  const ta = document.getElementById('wca-ch-text');
  const lines = ta.value.split(/\r?\n/).filter((l) => l.trim());
  const last = lines.pop();
  ta.value = lines.join('\n');
  const lbl = String(last || '').replace(/^\s*[\d:]+\s*/, '').trim();
  if (lbl) document.getElementById('wca-ch-num').value = lbl.replace(/번$/, '');
  wcaChPreview();
};

window.wcaChClear = () => {
  if (!confirm('입력한 구간을 모두 지울까요? (저장을 눌러야 실제로 지워져요)')) return;
  document.getElementById('wca-ch-text').value = '';
  document.getElementById('wca-ch-num').value = 1;
  wcaChPreview();
};

window.wcaChSave = async (id) => {
  const v = wca.videos.find((x) => x.id === id); if (!v) return;
  const chapters = VideoChapters.parse(document.getElementById('wca-ch-text').value);
  const btn = document.getElementById('wca-ch-save'); btn.disabled = true; btn.textContent = '저장 중...';
  try {
    await updateDoc(doc(db, 'videos', id), {
      chapters,
      chaptersUpdatedAt: new Date().toISOString(),
      chaptersBy: window.currentAdmin?.name || auth.currentUser?.email || '',
      chaptersSource: 'manual', // 직접 고친 건 자동 생성이 덮어쓰지 않음
    });
    v.chapters = chapters; v.chaptersSource = 'manual';
    try { const c = (typeof videosCache !== 'undefined') && videosCache.find((x) => x.id === id); if (c) c.chapters = chapters; } catch (e) {}
    wcaCloseChapters();
    wcaRenderList();
    wcaMsg(chapters.length ? `✅ 「${wcaEsc(v.title)}」 구간 인덱스 ${chapters.length}개 저장했어요` : `「${wcaEsc(v.title)}」 구간 인덱스를 지웠어요`);
  } catch (e) {
    alert('저장 실패: ' + e.message);
    btn.disabled = false; btn.textContent = '저장';
  }
};

window.wcaCloseChapters = () => {
  const ov = document.getElementById('wca-ch-modal');
  if (ov) { try { VideoChapters.unmount(document.getElementById('wca-ch-preview')); } catch (e) {} ov.remove(); }
  document.body.style.overflow = '';
};

// 목록 한 줄에 자동 인덱스 상태
function wcaChStateHtml(v) {
  const has = Array.isArray(v.chapters) && v.chapters.length;
  if (has) return v.chaptersSource === 'auto' ? '<span style="font-size:11px;color:#2E9E5B;" title="자막에서 자동으로 만든 인덱스 — 확인 후 필요하면 고치세요">🤖 자동 인덱스</span>' : '';
  if (v.chaptersSource === 'manual') return '';
  const st = v.chaptersAutoStatus, tries = v.chaptersAutoTries || 0;
  if (tries >= 48) return `<span style="font-size:11px;color:#D64545;" title="하루 동안 자동으로 찾지 못했어요 — 「🔖 인덱스」에서 직접 찍어 주세요">자동 인덱스 실패 (${st === 'noNumbers' ? '번호 못 찾음' : '자막 없음'})</span>`;
  return '<span style="font-size:11px;color:var(--muted);" title="30분마다 비메오 자막을 확인해서 자동으로 붙여요">⏳ 자동 인덱스 대기</span>';
}

// 🤖 자막에서 번호 자동으로 찾기 → 입력칸에 채움 (저장은 직접)
window.wcaChAuto = async (id) => {
  const v = wca.videos.find((x) => x.id === id); if (!v) return;
  const ta = document.getElementById('wca-ch-text');
  if (ta.value.trim() && !confirm('지금 입력칸의 내용을 자동으로 찾은 결과로 바꿀까요?')) return;
  const btn = document.getElementById('wca-ch-auto'); const note = document.getElementById('wca-ch-autonote');
  btn.disabled = true; btn.textContent = '자막 확인 중...';
  try {
    const r = await auApi('autoChapters', { vimeoId: v.vimeoId });
    if (r.status === 'done' && r.chapters && r.chapters.length) {
      ta.value = VideoChapters.format(r.chapters);
      document.getElementById('wca-ch-num').value = wcaChNextNum(ta.value);
      wcaChPreview();
      note.innerHTML = `<span style="color:#2E9E5B;">✓ ${wcaEsc(r.message)}</span> — 영상으로 몇 군데 확인하고 「저장」을 눌러 주세요.`;
    } else {
      note.innerHTML = `<span style="color:#D64545;">${wcaEsc(r.message || '찾지 못했어요')}</span><br>비메오 자막은 업로드 후 만들어지기까지 시간이 걸려요. 급하면 「지금 위치에 찍기」로 직접 넣어 주세요.`
        + (r.seen ? `<br>번호처럼 보인 말: ${wcaEsc(r.seen)}` : '')
        + (r.sample ? `<details style="margin-top:4px;"><summary style="cursor:pointer;">자막 앞부분 보기</summary><div style="max-height:140px;overflow:auto;background:#F7F6FB;padding:6px 8px;border-radius:6px;margin-top:4px;">${wcaEsc(r.sample)}</div></details>` : '');
    }
  } catch (e) {
    note.innerHTML = `<span style="color:#D64545;">자동 찾기 실패: ${wcaEsc(typeof auErr === 'function' ? auErr(e) : e.message)}</span><br>(서버 배포 전이면 영상인덱스_배포.bat 을 먼저 실행해 주세요)`;
  } finally { btn.disabled = false; btn.textContent = '🤖 자막에서 번호 자동으로 찾기'; }
};
