'use strict';
/* ═══════════════════════════════════════════════════════════
   공지사항 (학부모 앱 발송)
   (admin.html에서 분리 — 원본 8945~9171줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 공지사항 (학부모 앱 발송) ──
let noticeAllSelected = true;
let noticeSelectedClassGroups = new Set();
let noticeSelectedStudentIds = new Set();
let noticeTabInited = false;

window.initNoticeTab = async function() {
  if (!noticeTabInited) {
    noticeTabInited = true;
    loadNotices();
  }
  // 학생 로딩이 아직 안 됐으면 기다렸다가 반 목록 채우기
  if (!studentsCache.length) await loadStudents();
  renderNoticeClassOptions();
  renderNoticeStudentList();
};

// 전체 학부모 on/off. 켜면 반/학생 선택 영역 숨김, 끄면 반/학생 선택 가능.
window.toggleNoticeAll = function() {
  noticeAllSelected = !noticeAllSelected;
  document.getElementById('notice-all-btn').classList.toggle('active', noticeAllSelected);
  document.getElementById('notice-class-wrap').style.display = noticeAllSelected ? 'none' : 'block';
  document.getElementById('notice-student-wrap').style.display = noticeAllSelected ? 'none' : 'block';
};

document.addEventListener('DOMContentLoaded', () => {
  const imgInput = document.getElementById('notice-images');
  if (imgInput) {
    imgInput.addEventListener('change', () => {
      const preview = document.getElementById('notice-image-preview');
      preview.innerHTML = '';
      [...imgInput.files].forEach(file => {
        const url = URL.createObjectURL(file);
        preview.innerHTML += `<img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border-soft);">`;
      });
    });
  }
});

function renderNoticeClassOptions() {
  const el = document.getElementById('notice-class-list');
  const groups = [...new Set(studentsCache.map(s => s.classGroup).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  if (!groups.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 반이 없습니다.</div>';
    return;
  }
  el.innerHTML = groups.map(g => `
    <button type="button" class="notice-target-btn${noticeSelectedClassGroups.has(g) ? ' active' : ''}" onclick="toggleNoticeClass('${g.replace(/'/g,"\\'")}')">${g}</button>
  `).join('');
  document.getElementById('notice-selected-class-count').textContent = noticeSelectedClassGroups.size;
}

window.toggleNoticeClass = function(g) {
  if (noticeSelectedClassGroups.has(g)) noticeSelectedClassGroups.delete(g);
  else noticeSelectedClassGroups.add(g);
  renderNoticeClassOptions();
};

window.renderNoticeStudentList = function() {
  const el = document.getElementById('notice-student-list');
  const q = (document.getElementById('notice-student-search')?.value || '').trim().toLowerCase();
  const list = studentsCache
    .filter(s => !q || s.name.toLowerCase().includes(q))
    .sort((a,b) => a.name.localeCompare(b.name, 'ko'));

  if (!list.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px;">검색 결과가 없습니다.</div>';
    return;
  }

  el.innerHTML = list.map(s => `
    <div class="student-item" style="cursor:pointer;margin-bottom:6px;${noticeSelectedStudentIds.has(s.id) ? 'border-color:var(--gold);background:rgba(245,197,24,0.08);' : ''}" onclick="toggleNoticeStudent('${s.id}')">
      <div class="student-name">${noticeSelectedStudentIds.has(s.id) ? '✅ ' : ''}${s.name}</div>
      <span class="student-meta">${s.grade || ''} · ${s.branch || ''}</span>
      <span class="student-meta" style="font-size:11px;">${s.classGroup || '반 미배정'}</span>
    </div>`).join('');
};

window.toggleNoticeStudent = function(uid) {
  if (noticeSelectedStudentIds.has(uid)) noticeSelectedStudentIds.delete(uid);
  else noticeSelectedStudentIds.add(uid);
  document.getElementById('notice-selected-count').textContent = noticeSelectedStudentIds.size;
  renderNoticeStudentList();
};

// 미리보기 열기: 유효성 검사 후 학부모 앱에 보일 모습 그대로 보여줌
window.showNoticePreview = function() {
  const title = document.getElementById('notice-title').value.trim();
  const body = document.getElementById('notice-body').value.trim();

  if (!title || !body) { showMsg('notice-msg','제목과 내용을 입력해주세요.','error'); return; }
  if (!noticeAllSelected && !noticeSelectedClassGroups.size && !noticeSelectedStudentIds.size) {
    showMsg('notice-msg','전체 학부모를 선택하거나, 반/학생을 한 개 이상 선택해주세요.','error');
    return;
  }
  document.getElementById('notice-msg').style.display = 'none';

  // 대상 요약 문구
  let targetSummary = '';
  if (noticeAllSelected) {
    targetSummary = '👨‍👩‍👧 전체 학부모에게 발송됩니다.';
  } else {
    const parts = [];
    if (noticeSelectedClassGroups.size) parts.push(`반: ${[...noticeSelectedClassGroups].join(', ')}`);
    if (noticeSelectedStudentIds.size) {
      const names = [...noticeSelectedStudentIds].map(id => studentsCache.find(s => s.id === id)?.name).filter(Boolean);
      parts.push(`학생: ${names.join(', ')}`);
    }
    targetSummary = parts.join(' · ') + ' 학부모에게 발송됩니다.';
  }
  document.getElementById('notice-preview-target').textContent = targetSummary;
  document.getElementById('notice-preview-title').textContent = title;
  document.getElementById('notice-preview-body').textContent = body;

  const imgInput = document.getElementById('notice-images');
  const files = imgInput?.files ? [...imgInput.files] : [];
  const imgPreviewEl = document.getElementById('notice-preview-images');
  imgPreviewEl.innerHTML = files.map(f => `<img src="${URL.createObjectURL(f)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid rgba(30,24,56,0.1);">`).join('');

  document.getElementById('notice-preview-card').style.display = 'block';
  document.getElementById('notice-preview-card').scrollIntoView({ behavior:'smooth', block:'start' });
};

window.closeNoticePreview = function() {
  document.getElementById('notice-preview-card').style.display = 'none';
};

// 실제 등록 (미리보기에서 "이대로 등록" 눌렀을 때)
window.submitNotice = async function() {
  const title = document.getElementById('notice-title').value.trim();
  const body = document.getElementById('notice-body').value.trim();
  const btn = document.getElementById('notice-confirm-btn');

  const payload = { title, body, createdAt: Timestamp.now() };

  if (noticeAllSelected) {
    payload.target = 'all';
  } else {
    payload.target = 'custom';
    if (noticeSelectedClassGroups.size) payload.classGroups = [...noticeSelectedClassGroups];
    if (noticeSelectedStudentIds.size) payload.studentIds = [...noticeSelectedStudentIds];
  }

  btn.disabled = true; btn.textContent = '등록 중...';
  try {
    const imgInput = document.getElementById('notice-images');
    const files = imgInput?.files ? [...imgInput.files] : [];
    if (files.length) {
      btn.textContent = '사진 업로드 중...';
      const imageUrls = [];
      for (const file of files) {
        const path = `notices/${Date.now()}_${file.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        imageUrls.push(url);
      }
      payload.imageUrls = imageUrls;
      btn.textContent = '등록 중...';
    }

    await addDoc(collection(db, 'notices'), payload);
    document.getElementById('notice-title').value = '';
    document.getElementById('notice-body').value = '';
    if (imgInput) imgInput.value = '';
    document.getElementById('notice-image-preview').innerHTML = '';
    noticeSelectedStudentIds.clear();
    noticeSelectedClassGroups.clear();
    document.getElementById('notice-selected-count').textContent = '0';
    renderNoticeStudentList();
    renderNoticeClassOptions();
    closeNoticePreview();
    showMsg('notice-msg','공지가 등록되었습니다. 학부모 앱에 바로 노출됩니다.','success');
    loadNotices();
  } catch (e) {
    console.error('공지 등록 오류:', e);
    showMsg('notice-msg','등록 중 오류가 발생했습니다: ' + e.message,'error');
  } finally {
    btn.disabled = false; btn.textContent = '📢 이대로 등록';
  }
};

async function loadNotices() {
  const el = document.getElementById('noticeList');
  try {
    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    if (snap.empty) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 공지가 없습니다.</div>';
      return;
    }
    el.innerHTML = snap.docs.map(d => {
      const n = d.data();
      const dateStr = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('ko-KR') : '';
      let targetLabel;
      if (n.target === 'all') {
        targetLabel = '전체 학부모';
      } else {
        const parts = [];
        if (n.classGroups?.length) parts.push(`반 ${n.classGroups.length}개`);
        if (n.studentIds?.length) parts.push(`학생 ${n.studentIds.length}명`);
        targetLabel = parts.join(' + ') || '대상 없음';
      }
      return `
        <div class="notice-item">
          <span class="notice-item-target">${targetLabel}</span>
          <div style="font-weight:700;margin-bottom:4px;">${n.title}</div>
          <div style="font-size:13px;color:var(--off-white);white-space:pre-wrap;margin-bottom:8px;">${n.body}</div>
          ${(n.imageUrls && n.imageUrls.length) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${n.imageUrls.map(u => `<img src="${u}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border-soft);">`).join('')}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:var(--muted);">${dateStr}</span>
            <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px;" onclick="deleteNotice('${d.id}')">삭제</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('공지 목록 로딩 오류:', e);
    el.innerHTML = '<div style="color:#D64545;font-size:13px;">목록을 불러오지 못했습니다.</div>';
  }
}

window.deleteNotice = async function(id) {
  if (!confirm('이 공지를 삭제하시겠습니까? 학부모 앱에서도 사라집니다.')) return;
  await deleteDoc(doc(db, 'notices', id));
  loadNotices();
};

