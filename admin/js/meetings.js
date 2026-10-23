'use strict';
/* ═══════════════════════════════════════════════════════════
   🗒 회의 자료 — 관리자가 PDF 업로드 · 선생님 포털은 미리보기만
   - Firestore: meetingDocs/{id} { title, date(YYYY-MM-DD), memo, path, fileName, size, createdAt, createdBy }
   - Storage  : meetingDocs/{id}.pdf
   - 선생님 열람: teacher.html "회의 자료" 탭 (화면 안 미리보기, 다운로드 버튼 없음)
   - 업로드·수정·삭제는 관리자만 (storage.rules · firestore.rules)
   ═══════════════════════════════════════════════════════════ */
const MTA_MAX_MB = 50;
let mtaList = [];
let mtaBusy = false;

function mtaEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function mtaToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function mtaDateLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return ymd || '';
  const [y, m, d] = ymd.split('-').map(Number);
  const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${y}. ${m}. ${d}. (${w})`;
}
function mtaSize(b) {
  if (!b) return '';
  return b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
}
function mtaMsg(text, type) {
  const el = document.getElementById('mta-msg');
  if (!el) return;
  if (!text) { el.style.display = 'none'; return; }
  el.className = 'msg ' + (type || 'success');
  el.innerHTML = text;
  el.style.display = 'block';
}

window.initMeetingDocsTab = async () => {
  const d = document.getElementById('mta-date');
  if (d && !d.value) d.value = mtaToday();
  await mtaLoadList();
};

// 파일을 고르면 제목이 비어 있을 때 파일 이름으로 채워줌
window.mtaOnFile = (input) => {
  const f = input.files[0];
  const t = document.getElementById('mta-title');
  if (f && t && !t.value.trim()) t.value = f.name.normalize('NFC').replace(/\.pdf$/i, '');
};

window.mtaUpload = async () => {
  if (mtaBusy) return;
  const date  = document.getElementById('mta-date').value;
  const title = document.getElementById('mta-title').value.trim();
  const memo  = document.getElementById('mta-memo').value.trim();
  const input = document.getElementById('mta-file');
  const file  = input.files[0];
  if (!date)  { alert('회의 날짜를 선택해주세요.'); return; }
  if (!title) { alert('제목을 입력해주세요.'); return; }
  if (!file)  { alert('PDF 파일을 선택해주세요.'); return; }
  if (!/\.pdf$/i.test(file.name)) { alert('PDF 파일만 올릴 수 있습니다.'); return; }
  if (file.size > MTA_MAX_MB * 1024 * 1024) { alert(`${MTA_MAX_MB}MB를 넘는 파일은 올릴 수 없습니다.`); return; }

  mtaBusy = true;
  const btn = document.getElementById('mta-btn');
  btn.disabled = true;
  const docRef = doc(collection(db, 'meetingDocs'));
  const path = `meetingDocs/${docRef.id}.pdf`;
  try {
    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, path), file, { contentType: 'application/pdf' });
      task.on('state_changed',
        s => mtaMsg(`업로드 중... ${Math.round(s.bytesTransferred / s.totalBytes * 100)}%`, 'success'),
        reject, resolve);
    });
    const me = auth.currentUser;
    await setDoc(docRef, {
      title, date, memo, path,
      fileName: file.name.normalize('NFC'),
      size: file.size,
      createdAt: Timestamp.now(),
      createdBy: (me && (me.displayName || me.email)) || '',
    });
    mtaMsg('✓ 올렸습니다 — 선생님 포털 "회의 자료"에서 바로 볼 수 있습니다.', 'success');
    input.value = '';
    document.getElementById('mta-title').value = '';
    document.getElementById('mta-memo').value = '';
    await mtaLoadList();
  } catch (e) {
    try { await deleteObject(ref(storage, path)); } catch (_) {}
    mtaMsg('업로드하지 못했습니다 (' + mtaEsc(e.code || e.message) + ')', 'error');
  } finally {
    mtaBusy = false;
    btn.disabled = false;
  }
};

window.mtaLoadList = async () => {
  const box = document.getElementById('mta-list');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(collection(db, 'meetingDocs'));
    mtaList = [];
    snap.forEach(d => mtaList.push({ id: d.id, ...d.data() }));
  } catch (e) {
    box.innerHTML = `<div style="color:#D64545;font-size:13px;">불러오지 못했습니다 (${mtaEsc(e.code || e.message)})</div>`;
    return;
  }
  mtaList.sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
    ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  if (!mtaList.length) { box.innerHTML = '<div style="color:var(--muted);font-size:13px;">아직 올라간 회의 자료가 없습니다.</div>'; return; }
  box.innerHTML = mtaList.map(m => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 4px;border-bottom:1px solid var(--border-soft);flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <div style="font-size:12px;color:var(--purple, #5B3FA6);font-weight:600;margin-bottom:2px;">${mtaEsc(mtaDateLabel(m.date))}</div>
        <div style="font-size:14.5px;font-weight:700;color:var(--off-white);">📄 ${mtaEsc(m.title)}</div>
        ${m.memo ? `<div style="font-size:12.5px;color:var(--muted);margin-top:4px;white-space:pre-wrap;line-height:1.6;">${mtaEsc(m.memo)}</div>` : ''}
        <div style="font-size:11.5px;color:var(--muted);margin-top:4px;">${mtaEsc(m.fileName || '')}${m.size ? ' · ' + mtaSize(m.size) : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-secondary btn-sm" data-id="${mtaEsc(m.id)}" onclick="mtaOpen(this.dataset.id)">열기</button>
        <button class="btn btn-secondary btn-sm" data-id="${mtaEsc(m.id)}" onclick="mtaEdit(this.dataset.id)">수정</button>
        <button class="btn btn-danger btn-sm" data-id="${mtaEsc(m.id)}" onclick="mtaDelete(this.dataset.id)">삭제</button>
      </div>
    </div>`).join('');
};

window.mtaOpen = async (id) => {
  const m = mtaList.find(x => x.id === id);
  if (!m) return;
  const w = window.open('', '_blank');
  try { const url = await getDownloadURL(ref(storage, m.path)); if (w) w.location.href = url; else location.href = url; }
  catch (e) { if (w) w.close(); alert('파일을 열지 못했습니다 (' + (e.code || e.message) + ')'); }
};

window.mtaEdit = async (id) => {
  const m = mtaList.find(x => x.id === id);
  if (!m) return;
  const title = prompt('제목', m.title || '');
  if (title === null) return;
  if (!title.trim()) { alert('제목은 비울 수 없습니다.'); return; }
  const date = prompt('회의 날짜 (예: 2026-10-23)', m.date || '');
  if (date === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { alert('날짜는 2026-10-23 형식으로 입력해주세요.'); return; }
  const memo = prompt('메모 (없으면 비워두기)', m.memo || '');
  if (memo === null) return;
  try {
    await updateDoc(doc(db, 'meetingDocs', id), { title: title.trim(), date: date.trim(), memo: memo.trim() });
    await mtaLoadList();
  } catch (e) { alert('수정하지 못했습니다 (' + (e.code || e.message) + ')'); }
};

window.mtaDelete = async (id) => {
  const m = mtaList.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`"${m.title}" 회의 자료를 삭제할까요?\n선생님 포털에서도 사라지며 되돌릴 수 없습니다.`)) return;
  try {
    try { await deleteObject(ref(storage, m.path)); }
    catch (e) { if (e.code !== 'storage/object-not-found') throw e; }
    await deleteDoc(doc(db, 'meetingDocs', id));
    await mtaLoadList();
  } catch (e) { alert('삭제하지 못했습니다 (' + (e.code || e.message) + ')'); }
};
