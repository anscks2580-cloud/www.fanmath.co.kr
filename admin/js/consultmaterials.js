'use strict';
/* ═══════════════════════════════════════════════════════════
   기타 상담자료 (상담 › 상담자료 관리) — 2026.11.22
   - 설명회 자료 · 학교별 분석자료를 올려 두고 상담 때 바로 열어 보는 보관함 (공유 링크 없음)
   - 파일: Storage consultMaterials/{분류}/{시각}_{파일이름}
   - 목록: Firestore consultMaterials/{id} { cat, branch, title, school, memo, fileName, path, size, type, uploadedBy, createdAt }
   - 평촌관·산본관·공통으로 나눠 올리고, 관별로 걸러 봄 / 관리자만 보고 올리고 지움
   ═══════════════════════════════════════════════════════════ */
const CM_CATS = { seminar: '설명회 자료', school: '학교별 분석자료' };
const CM_ACCEPT = /\.(pdf|pptx?|hwpx?|docx?|xlsx?|png|jpe?g|webp|gif|zip)$/i;
let cmCat = 'seminar', cmBranch = 'all', cmRows = [], cmPicked = [], cmBusy = false;
const cmEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
const cmDate = (r) => { const t = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate() : (r.createdAtStr ? new Date(r.createdAtStr) : null); return t ? `${t.getFullYear()}.${t.getMonth() + 1}.${t.getDate()}` : ''; };
const cmIcon = (n) => /\.pdf$/i.test(n) ? '📕' : /\.pptx?$/i.test(n) ? '📙' : /\.(png|jpe?g|webp|gif)$/i.test(n) ? '🖼' : /\.hwpx?$/i.test(n) ? '📘' : /\.xlsx?$/i.test(n) ? '📗' : '📄';
const cmMsg = (t, err) => { const el = document.getElementById('cm-msg'); if (!el) return; el.textContent = t; el.style.color = err ? '#D64545' : 'var(--muted)'; };

window.initConsultMaterials = async function () {
  cmRenderForm();
  const drop = document.getElementById('cm-drop');
  if (drop && !drop._bound) {
    drop._bound = true;
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--purple, #5B3FA6)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = ''; cmAddFiles(e.dataTransfer.files); });
  }
  await cmLoad();
};

window.cmSetCat = function (c) { cmCat = c; cmPicked = []; cmRenderForm(); cmRender(); };
window.cmSetBranch = function (b) { cmBranch = b; cmRender(); };

function cmRenderForm() {
  document.querySelectorAll('#cm-cats button').forEach((b) => b.classList.toggle('btn-primary', b.dataset.c === cmCat));
  document.querySelectorAll('#cm-cats button').forEach((b) => b.classList.toggle('btn-secondary', b.dataset.c !== cmCat));
  const sc = document.getElementById('cm-school-wrap'); if (sc) sc.style.display = cmCat === 'school' ? '' : 'none';
  const t = document.getElementById('cm-title'); if (t) t.placeholder = cmCat === 'school' ? '예: 2026 2학기 기말 분석 (고1)' : '예: 2026 겨울방학 고등 설명회 발표자료';
  cmRenderPicked();
}

window.cmAddFiles = function (files) {
  [...(files || [])].forEach((f) => {
    if (!CM_ACCEPT.test(f.name)) { cmMsg(`${f.name}: PDF·PPT·한글·워드·엑셀·사진·zip 파일만 올릴 수 있어요.`, true); return; }
    if (f.size > 100 * 1024 * 1024) { cmMsg(`${f.name}: 100MB가 넘어요.`, true); return; }
    cmPicked.push({ key: Math.random().toString(36).slice(2), file: f });
  });
  cmRenderPicked();
};
window.cmRemovePick = (k) => { cmPicked = cmPicked.filter((x) => x.key !== k); cmRenderPicked(); };
function cmRenderPicked() {
  const el = document.getElementById('cm-pick'); if (!el) return;
  el.innerHTML = cmPicked.map((p) => `<div id="cmp-${p.key}" style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 2px;">
    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cmIcon(p.file.name)} ${cmEsc(p.file.name)} <small style="color:var(--muted);">${cmSize(p.file.size)}</small></span>
    <span style="width:90px;height:5px;background:rgba(30,24,56,0.08);border-radius:9px;overflow:hidden;"><i style="display:block;height:100%;width:0;background:var(--purple, #5B3FA6);"></i></span>
    <button type="button" class="btn btn-secondary btn-sm" onclick="cmRemovePick('${p.key}')">✕</button></div>`).join('');
}

window.cmUpload = async function () {
  if (cmBusy) return;
  const branch = document.getElementById('cm-branch').value;
  const title = document.getElementById('cm-title').value.trim();
  const school = (document.getElementById('cm-school').value || '').trim();
  const memo = (document.getElementById('cm-memo').value || '').trim();
  if (!cmPicked.length) { cmMsg('올릴 파일을 골라 주세요.', true); return; }
  if (cmCat === 'school' && !school) { cmMsg('학교 이름을 적어 주세요.', true); return; }
  cmBusy = true; const btn = document.getElementById('cm-up'); btn.disabled = true; btn.textContent = '올리는 중...';
  const me = window.currentAdmin || {}; let ok = 0; const fails = [];
  for (const p of cmPicked) {
    const f = p.file; const safe = f.name.replace(/[\\/#?\[\]*]/g, '_');
    const path = `consultMaterials/${cmCat}/${Date.now()}_${safe}`;
    try {
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), f, { contentType: f.type || 'application/octet-stream' });
        task.on('state_changed', (s) => { const bar = document.querySelector(`#cmp-${p.key} i`); if (bar) bar.style.width = (s.bytesTransferred / s.totalBytes * 100) + '%'; }, reject, resolve);
      });
      await addDoc(collection(db, 'consultMaterials'), {
        cat: cmCat, branch, title: title || f.name.replace(/\.[^.]+$/, ''), school: cmCat === 'school' ? school : '', memo,
        fileName: f.name, path, size: f.size, type: f.type || '',
        uploadedBy: me.name || me.email || '관리자', createdAt: Timestamp.now(), createdAtStr: new Date().toISOString(),
      });
      ok++;
    } catch (e) { fails.push(`${f.name}(${e.code || e.message})`); }
  }
  cmPicked = []; cmRenderPicked();
  document.getElementById('cm-title').value = ''; document.getElementById('cm-memo').value = '';
  cmMsg(`✅ ${ok}개 올렸습니다.${fails.length ? ' 못 올린 파일: ' + fails.join(', ') : ''}`, !!fails.length);
  cmBusy = false; btn.disabled = false; btn.textContent = '올리기';
  await cmLoad();
};

async function cmLoad() {
  const el = document.getElementById('cm-list'); if (el) el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(collection(db, 'consultMaterials'));
    cmRows = []; snap.forEach((d) => cmRows.push({ id: d.id, ...d.data() }));
    cmRows.sort((a, b) => String(b.createdAtStr || '').localeCompare(String(a.createdAtStr || '')));
  } catch (e) { if (el) el.innerHTML = `<div style="color:#D64545;font-size:13px;padding:10px;">불러오기 오류: ${cmEsc(e.code || e.message)}</div>`; return; }
  cmRender();
}

function cmRender() {
  const cnt = (b) => cmRows.filter((r) => r.cat === cmCat && (b === 'all' || r.branch === b)).length;
  const chip = (b, label, color) => `<button type="button" class="btn btn-sm ${cmBranch === b ? 'btn-primary' : 'btn-secondary'}" style="${cmBranch === b ? '' : (color ? 'color:' + color + ';' : '')}" onclick="cmSetBranch('${b}')">${label} ${cnt(b)}</button>`;
  const f = document.getElementById('cm-filter');
  if (f) f.innerHTML = chip('all', '전체') + chip('평촌관', '평촌관', '#5B3FA6') + chip('산본관', '산본관', '#B8860B') + chip('공통', '공통');
  const el = document.getElementById('cm-list'); if (!el) return;
  const list = cmRows.filter((r) => r.cat === cmCat && (cmBranch === 'all' || r.branch === cmBranch));
  if (!list.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center;">아직 올린 ${CM_CATS[cmCat]}가 없습니다.</div>`; return; }
  // 학교별 분석자료는 학교 이름으로 묶어서
  const groups = {};
  list.forEach((r) => { const k = cmCat === 'school' ? (r.school || '학교 미지정') : ''; (groups[k] = groups[k] || []).push(r); });
  const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ko'));
  el.innerHTML = keys.map((k) => `${k ? `<div style="font-weight:800;font-size:14px;margin:14px 0 6px;">🏫 ${cmEsc(k)} <span style="color:var(--muted);font-weight:400;font-size:12px;">${groups[k].length}개</span></div>` : ''}` +
    groups[k].map((r) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-soft);border-radius:10px;margin-bottom:6px;">
      <span style="font-size:20px;">${cmIcon(r.fileName)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;"><span style="font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:99px;margin-right:6px;${r.branch === '산본관' ? 'background:rgba(245,197,24,0.18);color:#9a7400;' : r.branch === '평촌관' ? 'background:rgba(91,63,166,0.12);color:#5B3FA6;' : 'background:rgba(30,24,56,0.06);color:var(--muted);'}">${cmEsc(r.branch || '공통')}</span>${cmEsc(r.title)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cmEsc(r.fileName)} · ${cmSize(r.size || 0)} · ${cmDate(r)} · ${cmEsc(r.uploadedBy || '')}${r.memo ? ' · ' + cmEsc(r.memo) : ''}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="cmOpen('${r.id}')">열기</button>
      <button class="btn btn-danger btn-sm" onclick="cmDelete('${r.id}')">삭제</button>
    </div>`).join('')).join('');
}

window.cmOpen = async function (id) {
  const r = cmRows.find((x) => x.id === id); if (!r) return;
  try { window.open(await getDownloadURL(ref(storage, r.path)), '_blank'); }
  catch (e) { alert('파일을 열 수 없습니다: ' + (e.code || e.message)); }
};
window.cmDelete = async function (id) {
  const r = cmRows.find((x) => x.id === id); if (!r) return;
  if (!confirm(`「${r.title}」을(를) 지울까요?\n(${r.fileName})`)) return;
  try {
    try { await deleteObject(ref(storage, r.path)); } catch (e) { if (e.code !== 'storage/object-not-found') throw e; }
    await deleteDoc(doc(db, 'consultMaterials', id));
    cmRows = cmRows.filter((x) => x.id !== id); cmRender();
  } catch (e) { alert('삭제 오류: ' + (e.code || e.message)); }
};
