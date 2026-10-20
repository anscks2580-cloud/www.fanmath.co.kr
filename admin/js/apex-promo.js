'use strict';
/* ═══════════════════════════════════════════════════════════
   에이펙스 영상 · 로비 TV 홍보영상
   (admin.html에서 분리 — 원본 8704~8944줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 에이펙스 영상 관리
// ══════════════════════════════════════════
window.initApexVideoTab = async function() {
  await loadApexVideos();
};

// 기출해설 apexAccess 일괄 설정
window.setApexAccessBulk = async function(flag) {
  const label = flag ? '공개' : '비공개';
  if (!confirm(`기출해설 영상 전체를 Apex관 ${label}으로 변경하시겠습니까?`)) return;
  try {
    const snap = await getDocs(collection(db, 'videos'));
    let count = 0;
    const batch = [];
    snap.forEach(d => {
      const v = d.data();
      const tag    = v.tag    || v.folder || v.category || '';
      const title  = v.title  || '';
      if (tag.startsWith('기출') || title.includes('[기출]')) {
        batch.push(updateDoc(doc(db, 'videos', d.id), { apexAccess: flag }));
        count++;
      }
    });
    await Promise.all(batch);
    showMsg('apexAccessMsg', `✅ 기출해설 영상 ${count}개 ${label} 완료`, 'success');
  } catch(e) {
    showMsg('apexAccessMsg', '오류: ' + e.message, 'error');
  }
};

// 에이펙스 자체 영상 등록
window.addApexVideo = async function() {
  const title  = document.getElementById('apexv-title').value.trim();
  const vimeo  = document.getElementById('apexv-vimeo').value.trim();
  const cat    = document.getElementById('apexv-cat').value.trim() || '에이펙스 영상';
  const desc   = document.getElementById('apexv-desc').value.trim();
  if (!title || !vimeo) {
    showMsg('apexVideoAddMsg', '제목과 Vimeo ID를 입력해주세요.', 'error'); return;
  }
  // URL에서 ID 추출
  const vimeoId = vimeo.match(/vimeo\.com\/(\d+)/) ? vimeo.match(/vimeo\.com\/(\d+)/)[1] : vimeo.replace(/\D/g, '');
  if (!vimeoId) { showMsg('apexVideoAddMsg', 'Vimeo ID를 확인해주세요.', 'error'); return; }
  try {
    await addDoc(collection(db, 'apexVideos'), {
      title, vimeoId, category: cat, description: desc,
      createdAt: new Date().toISOString(), order: Date.now()
    });
    showMsg('apexVideoAddMsg', `✅ "${title}" 등록 완료`, 'success');
    document.getElementById('apexv-title').value = '';
    document.getElementById('apexv-vimeo').value = '';
    document.getElementById('apexv-cat').value   = '';
    document.getElementById('apexv-desc').value  = '';
    await loadApexVideos();
  } catch(e) {
    showMsg('apexVideoAddMsg', '오류: ' + e.message, 'error');
  }
};

async function loadApexVideos() {
  try {
    const snap = await getDocs(query(collection(db, 'apexVideos'), orderBy('order', 'asc')));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    const apexVideoCountEl = document.getElementById('apexVideoCount'); if (apexVideoCountEl) apexVideoCountEl.textContent = list.length;
    const el = document.getElementById('apexVideoList');
    if (!list.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 영상이 없습니다.</div>'; return;
    }
    el.innerHTML = list.map(v => `
      <div class="student-item">
        <div class="student-name">${v.title}</div>
        <span class="student-meta" style="color:var(--gold);font-size:12px;">${v.category || ''}</span>
        <span class="student-meta" onclick="copyText('${v.vimeoId}', this)" title="클릭하면 복사됩니다" style="font-size:11px;cursor:pointer;">Vimeo: ${v.vimeoId}</span>
        <span class="student-meta" style="font-size:11px;color:var(--muted);">${v.description || ''}</span>
        <button class="btn btn-danger btn-sm" onclick="deleteApexVideo('${v.id}','${(v.title||'').replace(/'/g,"\\'")}')">삭제</button>
      </div>`).join('');
  } catch(e) {
    document.getElementById('apexVideoList').innerHTML =
      `<div style="color:#ff9090;font-size:13px;">오류: ${e.message}</div>`;
  }
}

window.deleteApexVideo = async function(id, title) {
  if (!confirm(`"${title}" 영상을 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, 'apexVideos', id));
    await loadApexVideos();
  } catch(e) {
    alert('삭제 오류: ' + e.message);
  }
};

// ── 로비 TV 홍보영상 ──
let promoTabInited = false;
window.initPromoTab = function() {
  if (promoTabInited) { loadPromoVideos(); return; }
  promoTabInited = true;
  loadPromoVideos();
};

let promoSyncCandidates = [];

window.syncPromoFolder = async () => {
  const folderName = document.getElementById('promo-folder-name').value.trim();
  const statusEl  = document.getElementById('promoSyncStatus');
  const previewEl = document.getElementById('promoSyncPreview');
  previewEl.style.display = 'none';
  promoSyncCandidates = [];

  if (!folderName) { statusEl.textContent = '⚠️ 폴더명을 입력해주세요.'; return; }

  statusEl.textContent = '⏳ Vimeo 폴더 목록 불러오는 중...';
  try {
    const allFolders = await fetchVimeoFolders();
    const matched = allFolders.find(f => f.name === folderName);
    if (!matched) {
      statusEl.textContent = `⚠️ "${folderName}" 폴더를 Vimeo에서 찾을 수 없습니다. 폴더명을 다시 확인해주세요.`;
      return;
    }

    statusEl.textContent = `⏳ "${folderName}" 폴더 영상 확인 중...`;
    const videos = await fetchFolderVideos(matched.uri);
    if (!promoVideosCache.length) await loadPromoVideos();
    const existingIds = new Set(promoVideosCache.map(v => v.vimeoId));

    for (const v of videos) {
      const vimeoId = v.uri.replace('/videos/', '');
      if (existingIds.has(vimeoId)) continue;
      promoSyncCandidates.push({ vimeoId, title: v.name });
    }

    if (!promoSyncCandidates.length) {
      statusEl.textContent = `✅ 새로 추가할 영상이 없습니다. ("${folderName}" 폴더 확인 완료)`;
      return;
    }

    statusEl.textContent = '';
    const titleEl = document.getElementById('promoSyncPreviewTitle');
    const listEl  = document.getElementById('promoSyncPreviewList');
    titleEl.innerHTML = `신규 영상 <b style="color:var(--gold);">${promoSyncCandidates.length}개</b> 발견
      <span style="margin-left:10px;">
        <a href="#" onclick="event.preventDefault();document.querySelectorAll('.promo-sync-check').forEach(c=>c.checked=true);">전체선택</a>
        <span style="color:var(--muted);">/</span>
        <a href="#" onclick="event.preventDefault();document.querySelectorAll('.promo-sync-check').forEach(c=>c.checked=false);">전체해제</a>
      </span>`;
    listEl.innerHTML = promoSyncCandidates.map((v, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;">
        <input id="promo-sync-check-${i}" class="promo-sync-check" type="checkbox" checked
          style="flex-shrink:0;width:16px;height:16px;accent-color:var(--gold);">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.title}</span>
      </div>`).join('');
    previewEl.style.display = 'block';
  } catch(e) {
    statusEl.textContent = '';
    showMsg('promoVideoAddMsg', '오류: ' + e.message, 'error');
  }
};

window.promoSyncSaveAll = async () => {
  let saved = 0;
  const base = Date.now();
  for (let i = 0; i < promoSyncCandidates.length; i++) {
    const checkEl = document.getElementById('promo-sync-check-' + i);
    if (checkEl && !checkEl.checked) continue;
    const v = promoSyncCandidates[i];
    try {
      await addDoc(collection(db, 'promoVideos'), {
        title: v.title, vimeoId: v.vimeoId, active: true,
        order: base + i, createdAt: new Date().toISOString()
      });
      saved++;
    } catch(e) { /* 개별 실패는 건너뛰고 계속 */ }
  }
  document.getElementById('promoSyncPreview').style.display = 'none';
  document.getElementById('promoSyncStatus').textContent = `✅ ${saved}개 영상을 재생목록에 추가했습니다.`;
  promoSyncCandidates = [];
  await loadPromoVideos();
};

let promoVideosCache = [];
async function loadPromoVideos() {
  try {
    const snap = await getDocs(query(collection(db, 'promoVideos'), orderBy('order', 'asc')));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    promoVideosCache = list;
    const countEl = document.getElementById('promoVideoCount'); if (countEl) countEl.textContent = list.length;
    const el = document.getElementById('promoVideoList');
    if (!list.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 영상이 없습니다.</div>'; return;
    }
    el.innerHTML = list.map((v, i) => `
      <div class="student-item">
        <div class="student-name">${i+1}. ${v.title}</div>
        <span class="student-meta" onclick="copyText('${v.vimeoId}', this)" title="클릭하면 복사됩니다" style="font-size:11px;cursor:pointer;">Vimeo: ${v.vimeoId}</span>
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" ${v.active !== false ? 'checked' : ''} onchange="togglePromoActive('${v.id}', this.checked)"> 재생목록에 포함
        </label>
        <button class="btn btn-sm" ${i===0 ? 'disabled' : ''} onclick="movePromoVideo(${i}, -1)">▲</button>
        <button class="btn btn-sm" ${i===list.length-1 ? 'disabled' : ''} onclick="movePromoVideo(${i}, 1)">▼</button>
        <button class="btn btn-danger btn-sm" onclick="deletePromoVideo('${v.id}','${(v.title||'').replace(/'/g,"\\'")}')">삭제</button>
      </div>`).join('');
  } catch(e) {
    document.getElementById('promoVideoList').innerHTML =
      `<div style="color:#ff9090;font-size:13px;">오류: ${e.message}</div>`;
  }
}

window.togglePromoActive = async function(id, active) {
  try {
    await updateDoc(doc(db, 'promoVideos', id), { active });
  } catch(e) {
    alert('변경 오류: ' + e.message);
    loadPromoVideos();
  }
};

window.movePromoVideo = async function(index, dir) {
  const other = index + dir;
  if (other < 0 || other >= promoVideosCache.length) return;
  const a = promoVideosCache[index], b = promoVideosCache[other];
  try {
    await updateDoc(doc(db, 'promoVideos', a.id), { order: b.order });
    await updateDoc(doc(db, 'promoVideos', b.id), { order: a.order });
    await loadPromoVideos();
  } catch(e) {
    alert('순서 변경 오류: ' + e.message);
  }
};

window.deletePromoVideo = async function(id, title) {
  if (!confirm(`"${title}" 영상을 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, 'promoVideos', id));
    await loadPromoVideos();
  } catch(e) {
    alert('삭제 오류: ' + e.message);
  }
};

