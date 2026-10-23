'use strict';
/* ═══════════════════════════════════════════════════════════
   홈페이지 팝업
   (admin.html에서 분리 — 원본 10033~10219줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════ 홈페이지 팝업 관리 (index.html 첫 화면 팝업) ══════
let hpData = [];

function hpToday() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function hpStatus(x) {
  if (!x.enabled) return { cls:'off', label:'꺼짐' };
  const t = hpToday();
  if (x.startDate && t < x.startDate) return { cls:'wait', label:'노출 예정' };
  if (x.endDate && t > x.endDate) return { cls:'end', label:'기간 종료' };
  return { cls:'live', label:'노출 중' };
}
function hpEsc(v) { return escapeConsultHtml(v || ''); }

window.previewHomePopupImage = function(input) {
  const img = document.getElementById('hp-preview');
  const f = input.files && input.files[0];
  if (!f) { img.style.display = 'none'; return; }
  img.src = URL.createObjectURL(f);
  img.style.display = 'block';
};

window.resetHomePopupForm = function() {
  ['hp-edit-id','hp-title','hp-link','hp-start','hp-end'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('hp-image').value = '';
  document.getElementById('hp-preview').style.display = 'none';
  document.getElementById('hp-enabled').checked = true;
  document.getElementById('hp-form-title').textContent = '🪟 홈페이지 팝업 등록';
  document.getElementById('hp-image-label').textContent = '팝업 이미지';
  document.getElementById('hp-save-btn').textContent = '팝업 등록';
  document.getElementById('hp-cancel-btn').style.display = 'none';
};

window.initHomePopupTab = async function() {
  const el = document.getElementById('hpList');
  el.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(collection(db, 'homePopups'));
    hpData = [];
    snap.forEach(d => hpData.push({ id: d.id, ...d.data() }));
    hpData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    renderHomePopupList();
  } catch(e) {
    el.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${e.message}</div>`;
  }
};

function renderHomePopupList() {
  const el = document.getElementById('hpList');
  if (!hpData.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 팝업이 없습니다. 위에서 이미지를 올려 등록하세요.</div>';
    return;
  }
  el.innerHTML = hpData.map((x, i) => {
    const st = hpStatus(x);
    const period = (x.startDate || x.endDate)
      ? `${x.startDate || '처음부터'} ~ ${x.endDate || '계속'}` : '기간 제한 없음';
    return `
      <div class="hp-item ${x.enabled ? '' : 'off'}">
        <img class="hp-thumb" src="${x.imageUrl}" alt="" onclick="window.open('${x.imageUrl}','_blank')">
        <div class="hp-info">
          <div class="hp-title">
            <button class="hp-switch ${x.enabled ? 'on' : ''}" title="켜기/끄기" onclick="toggleHomePopup('${x.id}')"></button>
            ${hpEsc(x.title) || '(제목 없음)'}
            <span class="hp-badge ${st.cls}">${st.label}</span>
          </div>
          <div class="hp-meta">
            📅 ${period}<br>
            🔗 ${x.linkUrl ? hpEsc(x.linkUrl) : '링크 없음'}
          </div>
          <div class="hp-actions">
            <button class="btn btn-secondary btn-sm" onclick="moveHomePopup(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-secondary btn-sm" onclick="moveHomePopup(${i},1)" ${i === hpData.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-secondary btn-sm" onclick="editHomePopup('${x.id}')">✏️ 수정 / 사진 교체</button>
            <button class="btn btn-danger btn-sm" onclick="deleteHomePopup('${x.id}')">삭제</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

window.saveHomePopup = async function() {
  const editId = document.getElementById('hp-edit-id').value;
  const title = document.getElementById('hp-title').value.trim();
  const linkUrl = document.getElementById('hp-link').value.trim();
  const startDate = document.getElementById('hp-start').value;
  const endDate = document.getElementById('hp-end').value;
  const enabled = document.getElementById('hp-enabled').checked;
  const file = document.getElementById('hp-image').files[0];

  if (!editId && !file) { showMsg('hpMsg', '팝업 이미지를 선택하세요.', 'error'); return; }
  if (startDate && endDate && startDate > endDate) { showMsg('hpMsg', '종료일이 시작일보다 빠릅니다.', 'error'); return; }

  const btn = document.getElementById('hp-save-btn');
  const btnText = btn.textContent;
  btn.disabled = true;
  try {
    const payload = { title, linkUrl, startDate, endDate, enabled, updatedAt: Timestamp.now() };
    let oldPath = '';
    if (file) {
      btn.textContent = '사진 업로드 중...';
      const path = `homePopups/${Date.now()}_${file.name.replace(/[^\w.\-가-힣]/g, '_')}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      payload.imageUrl = await getDownloadURL(fileRef);
      payload.imagePath = path;
      if (editId) oldPath = hpData.find(x => x.id === editId)?.imagePath || '';
    }
    btn.textContent = '저장 중...';
    if (editId) {
      await updateDoc(doc(db, 'homePopups', editId), payload);
      if (oldPath) { try { await deleteObject(ref(storage, oldPath)); } catch(e) {} }
      showToast('팝업이 수정되었습니다');
    } else {
      payload.order = hpData.length ? Math.max(...hpData.map(x => x.order ?? 0)) + 1 : 0;
      payload.createdAt = Timestamp.now();
      await addDoc(collection(db, 'homePopups'), payload);
      showToast('팝업이 등록되었습니다');
    }
    resetHomePopupForm();
    await initHomePopupTab();
  } catch(e) {
    showMsg('hpMsg', '오류: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    if (btn.textContent.includes('중...')) btn.textContent = btnText;
  }
};

window.editHomePopup = function(id) {
  const x = hpData.find(v => v.id === id);
  if (!x) return;
  document.getElementById('hp-edit-id').value = id;
  document.getElementById('hp-title').value = x.title || '';
  document.getElementById('hp-link').value = x.linkUrl || '';
  document.getElementById('hp-start').value = x.startDate || '';
  document.getElementById('hp-end').value = x.endDate || '';
  document.getElementById('hp-enabled').checked = !!x.enabled;
  document.getElementById('hp-image').value = '';
  const pv = document.getElementById('hp-preview');
  pv.src = x.imageUrl; pv.style.display = 'block';
  document.getElementById('hp-form-title').textContent = '✏️ 팝업 수정';
  document.getElementById('hp-image-label').textContent = '팝업 이미지 (교체할 때만 선택)';
  document.getElementById('hp-save-btn').textContent = '수정 저장';
  document.getElementById('hp-cancel-btn').style.display = '';
  document.getElementById('tab-homepopup').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.toggleHomePopup = async function(id) {
  const x = hpData.find(v => v.id === id);
  if (!x) return;
  try {
    await updateDoc(doc(db, 'homePopups', id), { enabled: !x.enabled, updatedAt: Timestamp.now() });
    x.enabled = !x.enabled;
    renderHomePopupList();
    showToast(x.enabled ? '팝업을 켰습니다' : '팝업을 껐습니다');
  } catch(e) { alert('오류: ' + e.message); }
};

window.moveHomePopup = async function(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= hpData.length) return;
  [hpData[i], hpData[j]] = [hpData[j], hpData[i]];
  try {
    await Promise.all(hpData.map((x, k) => {
      if (x.order === k) return null;
      x.order = k;
      return updateDoc(doc(db, 'homePopups', x.id), { order: k });
    }));
    renderHomePopupList();
  } catch(e) { alert('오류: ' + e.message); initHomePopupTab(); }
};

window.deleteHomePopup = async function(id) {
  const x = hpData.find(v => v.id === id);
  if (!x || !confirm(`"${x.title || '이 팝업'}"을(를) 삭제할까요?`)) return;
  try {
    await deleteDoc(doc(db, 'homePopups', id));
    if (x.imagePath) { try { await deleteObject(ref(storage, x.imagePath)); } catch(e) {} }
    if (document.getElementById('hp-edit-id').value === id) resetHomePopupForm();
    showToast('삭제되었습니다');
    await initHomePopupTab();
  } catch(e) { alert('오류: ' + e.message); }
};

