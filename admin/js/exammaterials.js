'use strict';
/* ═══════════════════════════════════════════════════════════
   기말고사 자료 (평촌 학원 연합 /exam 페이지 자료실)
   - 2026 2학기 중간고사 때 쓰던 탭을 기말고사용으로 다시 연 것
   - Vimeo "2026년 2학기 기말고사" 폴더 › 학원별 하위 폴더 → Firestore examMaterials
   ═══════════════════════════════════════════════════════════ */
// ── 기말고사 연합 자료 (exam 페이지) ──

let examTabInited = false;
window.initExamMaterialsTab = function() {
  renderExamFolderAccordion();
  if (examTabInited) { loadExamMaterials(); return; }
  examTabInited = true;
  loadExamMaterials();
};

// 영상 제목에서 "고1","중3" 같은 학년 표기를 뽑아냄
function extractExamGrade(title) {
  const m = (title || '').match(/(중|고)[1-3]/);
  return m ? m[0] : '';
}

// ── 학원 폴더 선택기 (강의 목록의 폴더 선택기와 동일한 아코디언 형태) ──
const EXAM_ACADEMY_SUBJECT = { '송우찬수학학원': '수학', '인어스수학학원': '수학', '에이펙스영어학원': '영어', '대치레몬학원': '영어' };
const EXAM_FOLDER_TREE = [
  { group: '학원 폴더 (2026년 2학기 기말고사 하위)', folders: Object.keys(EXAM_ACADEMY_SUBJECT) },
];

let _checkedExamFolders = new Set();

function isExamFolderChecked(f) { return _checkedExamFolders.has(f); }

function renderExamFolderAccordion(q='') {
  const el = document.getElementById('examFolderAccordion');
  if (!el) return;
  const ql = q.toLowerCase();
  let html = '';
  EXAM_FOLDER_TREE.forEach((group, gi) => {
    const filtered = q ? group.folders.filter(f => f.toLowerCase().includes(ql)) : group.folders;
    if (!filtered.length) return;
    const groupId = 'efgrp' + gi;
    const allChecked = filtered.every(f => isExamFolderChecked(f));
    html += `
      <div style="border-bottom:1px solid rgba(30,24,56,0.06);">
        <div onclick="toggleExamFolderGroup('${groupId}')"
          style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;
            background:rgba(30,24,56,0.02);"
          onmouseover="this.style.background='rgba(240,192,64,0.06)'"
          onmouseout="this.style.background='rgba(30,24,56,0.02)'">
          <input type="checkbox" class="examfolder-group-check" data-gi="${gi}"
            ${allChecked&&filtered.length?'checked':''}
            onclick="event.stopPropagation();toggleExamFolderGroupCheck(this,${gi})"
            style="accent-color:var(--gold);">
          <span style="font-size:12px;font-weight:700;color:var(--gold);flex:1;">${group.group}</span>
          <span style="font-size:11px;color:var(--muted);">${filtered.length}개</span>
          <span id="arrow-${groupId}" style="color:var(--gold);font-size:10px;transition:transform 0.2s;">▼</span>
        </div>
        <div id="${groupId}" style="display:${q?'block':'block'};">
          ${filtered.map(f => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 12px 6px 28px;
              cursor:pointer;border-top:1px solid rgba(30,24,56,0.04);font-size:12px;"
              onmouseover="this.style.background='rgba(30,24,56,0.03)'"
              onmouseout="this.style.background=''">
              <input type="checkbox" class="examfolder-check" value="${f}"
                ${isExamFolderChecked(f)?'checked':''}
                onchange="onExamFolderCheckChange(this)"
                style="accent-color:var(--gold);flex-shrink:0;">
              <span style="color:var(--off-white);">${f}</span>
            </label>`).join('')}
        </div>
      </div>`;
  });
  el.innerHTML = html || '<div style="padding:12px;font-size:12px;color:var(--muted);">검색 결과 없음</div>';
  updateExamFolderCount();
}
window.renderExamFolderAccordion = renderExamFolderAccordion;

function onExamFolderCheckChange(cb) {
  if (cb.checked) _checkedExamFolders.add(cb.value);
  else _checkedExamFolders.delete(cb.value);
  updateExamFolderCount();
}
window.onExamFolderCheckChange = onExamFolderCheckChange;

window.toggleExamFolderGroup = (id) => {
  const el = document.getElementById(id);
  const arrow = document.getElementById('arrow-' + id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
};

window.toggleExamFolderGroupCheck = (master, gi) => {
  const group = EXAM_FOLDER_TREE[gi];
  if (!group) return;
  group.folders.forEach(f => { if (master.checked) _checkedExamFolders.add(f); else _checkedExamFolders.delete(f); });
  renderExamFolderAccordion(document.getElementById('examFolderSearchInput')?.value || '');
};

window.toggleAllExamFolders = (master) => {
  EXAM_FOLDER_TREE.forEach(g => g.folders.forEach(f => { if (master.checked) _checkedExamFolders.add(f); else _checkedExamFolders.delete(f); }));
  renderExamFolderAccordion(document.getElementById('examFolderSearchInput')?.value || '');
};

window.filterExamFolderList = () => {
  renderExamFolderAccordion(document.getElementById('examFolderSearchInput')?.value || '');
};

function updateExamFolderCount() {
  const el = document.getElementById('examFolderSelectedCount');
  if (el) el.textContent = _checkedExamFolders.size ? `${_checkedExamFolders.size}개 선택` : '';
}

let examSyncCandidates = [];

// 폴더 안에 들어있는 하위 폴더 목록을 가져옵니다 (한 단계 중첩까지 지원)
async function fetchExamSubfolders(parentUri) {
  let subs = [];
  let url = `https://api.vimeo.com${parentUri}/items?per_page=100&page=1`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
    if (!res.ok) break;
    const data = await res.json();
    (data.data || []).forEach(item => { if (item.folder) subs.push(item.folder); });
    url = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
  }
  return subs;
}

// 최상위 폴더에서 먼저 찾고, 없으면 모든 최상위 폴더의 하위 폴더를 동시에(병렬로) 뒤져봅니다.
// parentName이 주어지면 그 폴더 하나의 하위 폴더만 빠르게 확인합니다.
async function findExamFolderByName(folderName, topFolders, parentName, onProgress) {
  let matched = topFolders.find(f => f.name === folderName);
  if (matched) return matched;

  if (parentName) {
    const parent = topFolders.find(f => f.name === parentName);
    if (!parent) return null;
    if (onProgress) onProgress(`⏳ "${parentName}" 폴더 안을 확인 중...`);
    const subs = await fetchExamSubfolders(parent.uri);
    return subs.find(f => f.name === folderName) || null;
  }

  if (onProgress) onProgress('⏳ 하위 폴더까지 확인 중... (폴더가 많으면 오래 걸릴 수 있어요)');
  const subfolderLists = await Promise.all(
    topFolders.map(f => fetchExamSubfolders(f.uri).catch(() => []))
  );
  for (const subs of subfolderLists) {
    const m = subs.find(f => f.name === folderName);
    if (m) return m;
  }
  return null;
}

window.syncExamFolder = async () => {
  const materialType = document.getElementById('exam-material-type').value;
  const year = YEAR_FILTERABLE_TYPES.includes(materialType) ? document.getElementById('exam-year').value : '';
  const statusEl  = document.getElementById('examSyncStatus');
  const previewEl = document.getElementById('examSyncPreview');
  previewEl.style.display = 'none';
  examSyncCandidates = [];

  // 체크된 학원 폴더 목록 (없으면 전체)
  const checkedBoxes = [...document.querySelectorAll('.examfolder-check:checked')].map(cb => cb.value);
  const targetFolders = checkedBoxes.length > 0 ? checkedBoxes : Object.keys(EXAM_ACADEMY_SUBJECT);

  statusEl.textContent = '⏳ Vimeo 폴더 목록 불러오는 중...';
  try {
    const parentName = document.getElementById('exam-parent-folder').value.trim();
    const allFolders = await fetchVimeoFolders();
    if (!examMaterialsCache.length) await loadExamMaterials();
    const existingIds = new Set(examMaterialsCache.map(v => v.vimeoId));

    let foundAnyFolder = false;
    for (const folderName of targetFolders) {
      statusEl.textContent = `⏳ "${folderName}" 폴더 확인 중...`;
      const matched = await findExamFolderByName(folderName, allFolders, parentName, (msg) => {
        statusEl.textContent = msg;
      });
      if (!matched) continue;
      foundAnyFolder = true;
      const academy = folderName;
      const subject = EXAM_ACADEMY_SUBJECT[folderName] || '수학';

      const videos = await fetchFolderVideos(matched.uri);
      for (const v of videos) {
        const vimeoId = v.uri.replace('/videos/', '');
        if (existingIds.has(vimeoId)) continue;
        examSyncCandidates.push({ vimeoId, title: v.name, academy, subject, materialType, year });
      }
    }

    if (!foundAnyFolder) {
      statusEl.textContent = `⚠️ 선택한 학원 폴더를 Vimeo에서 찾을 수 없습니다. 상위 폴더명을 다시 확인해주세요.`;
      return;
    }

    if (!examSyncCandidates.length) {
      statusEl.textContent = `✅ 새로 추가할 영상이 없습니다. (${targetFolders.length}개 폴더 확인 완료)`;
      return;
    }

    statusEl.textContent = '';
    renderExamSyncPreview();
  } catch(e) {
    statusEl.textContent = '';
    showMsg('examMaterialSyncMsg', '오류: ' + e.message, 'error');
  }
};

function renderExamSyncPreview() {
  const previewEl = document.getElementById('examSyncPreview');
  const titleEl   = document.getElementById('examSyncPreviewTitle');
  const listEl    = document.getElementById('examSyncPreviewList');

  titleEl.innerHTML = `신규 영상 <b>${examSyncCandidates.length}개</b> 발견
    <span style="margin-left:10px;">
      <a href="#" onclick="event.preventDefault();document.querySelectorAll('.exam-sync-check').forEach(c=>c.checked=true);">전체선택</a>
      <span style="color:var(--muted);">/</span>
      <a href="#" onclick="event.preventDefault();document.querySelectorAll('.exam-sync-check').forEach(c=>c.checked=false);">전체해제</a>
    </span>`;

  // 학원(academy)별로 그룹핑 — 강의 목록 미리보기가 태그별로 묶는 것과 동일한 방식
  const groups = {};
  const order = [];
  examSyncCandidates.forEach((v, i) => {
    if (!groups[v.academy]) { groups[v.academy] = []; order.push(v.academy); }
    groups[v.academy].push({ ...v, idx: i });
  });

  listEl.innerHTML = order.map(academy => {
    const items = groups[academy];
    return `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--gold);letter-spacing:1px;
        padding:5px 0;border-bottom:1px solid rgba(240,192,64,0.2);margin-bottom:4px;">
        ${academy} <span style="font-weight:400;color:var(--muted);">${items.length}개 · ${items[0].materialType}${items[0].year ? ' · ' + items[0].year + '년' : ''}</span>
      </div>
      ${items.map(v => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;
          border-bottom:1px solid rgba(30,24,56,0.04);font-size:13px;flex-wrap:wrap;">
          <input id="exam-sync-check-${v.idx}" class="exam-sync-check" type="checkbox" checked
            style="flex-shrink:0;width:16px;height:16px;accent-color:var(--gold);">
          <input id="exam-sync-title-${v.idx}" type="text" value="${(v.title||'').replace(/"/g,'&quot;')}"
            style="flex:1;min-width:160px;padding:5px 8px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
              border-radius:6px;color:var(--off-white);font-size:12px;font-family:inherit;color-scheme:light;">
        </div>`).join('')}
    </div>`;
  }).join('');

  previewEl.style.display = 'block';
}

window.examSyncSaveAll = async () => {
  let saved = 0, excluded = 0;

  // 학원별 다음 순서 번호 — 기존 등록된 자료가 있으면 그 다음 번호부터, 비메오에서 불러온 순서대로 순차 부여
  const nextOrderByAcademy = {};
  function nextOrder(academy) {
    if (nextOrderByAcademy[academy] == null) {
      const maxExisting = examMaterialsCache
        .filter(v => v.academy === academy && v.order != null)
        .reduce((max, v) => Math.max(max, Number(v.order)), 0);
      nextOrderByAcademy[academy] = maxExisting + 1;
    }
    return nextOrderByAcademy[academy]++;
  }

  for (let i = 0; i < examSyncCandidates.length; i++) {
    const checkEl = document.getElementById('exam-sync-check-' + i);
    if (checkEl && !checkEl.checked) { excluded++; continue; }
    const v = examSyncCandidates[i];
    const titleInput = document.getElementById('exam-sync-title-' + i);
    const title = titleInput ? titleInput.value.trim() : v.title;
    try {
      const order = nextOrder(v.academy);
      await addDoc(collection(db, 'examMaterials'), {
        title, vimeoId: v.vimeoId, academy: v.academy, subject: v.subject,
        materialType: v.materialType || '', year: v.year || '',
        grade: extractExamGrade(title), active: true,
        order, createdAt: new Date().toISOString()
      });
      saved++;
    } catch(e) { /* 개별 실패는 건너뛰고 계속 */ }
  }
  document.getElementById('examSyncPreview').style.display = 'none';
  document.getElementById('examSyncStatus').textContent = `✅ ${saved}개 영상을 자료실에 추가했습니다.${excluded ? ` · 선택 해제 ${excluded}개 제외` : ''}`;
  examSyncCandidates = [];
  await loadExamMaterials();
};

// PDF 자료 업로드 (영어 자료실처럼 영상이 아니라 PDF로 올리는 경우).
// Firebase Storage에 파일을 올리고, 그 다운로드 URL을 pdfUrl 필드로 examMaterials에 저장합니다.
// vimeoId가 없는 자료는 자료실(materials.html)에서 자동으로 "PDF"로 인식해 새 탭으로 열어줍니다.
// 파일을 여러 개 선택하면 순서대로 하나씩 업로드합니다. 자료명을 입력했고 파일이 1개일 때만
// 그 제목을 쓰고, 그 외(제목 비움 또는 파일 여러 개)에는 각 파일명(확장자 제외)을 제목으로 사용합니다.
// 학원(과목)에 따라 "자료 유형" 칸을 보여줄지 정합니다.
// 영어는 materials.html에서 학년으로만 구분하므로 이 칸이 필요 없어 숨깁니다.
window.updateExamPdfTypeOptions = function(){
  const [, subject] = document.getElementById('exampdf-academy-select').value.split('|');
  const group = document.getElementById('exampdf-materialtype-group');
  if (!group) return;
  group.style.display = subject === '영어' ? 'none' : '';
  const yearGroup = document.getElementById('exampdf-year-group');
  if (yearGroup) {
    yearGroup.style.display = (subject !== '영어' && YEAR_FILTERABLE_TYPES.includes(document.getElementById('exampdf-material-type').value)) ? '' : 'none';
  }
};

// 고1/고2 기출문제일 때만 "연도" 선택 칸을 보여줍니다. (자료 유형 select의 onchange에서 호출)
const YEAR_FILTERABLE_TYPES = ['고1 기출문제', '고2 기출문제'];
window.updateExamYearVisibility = function(typeSelectId, yearGroupId){
  const typeVal = document.getElementById(typeSelectId).value;
  const yearGroup = document.getElementById(yearGroupId);
  if (yearGroup) yearGroup.style.display = YEAR_FILTERABLE_TYPES.includes(typeVal) ? '' : 'none';
};

window.uploadExamPdf = async () => {
  const [academy, subject] = document.getElementById('exampdf-academy-select').value.split('|');
  const grade = document.getElementById('exampdf-grade').value;
  const materialType = subject === '영어' ? '' : document.getElementById('exampdf-material-type').value;
  const year = (subject !== '영어' && YEAR_FILTERABLE_TYPES.includes(materialType)) ? document.getElementById('exampdf-year').value : '';
  const titleInput = document.getElementById('exampdf-title').value.trim();
  const fileInput = document.getElementById('exampdf-file');
  const files = Array.from(fileInput.files || []);
  const progressEl = document.getElementById('examPdfProgress');

  if (!files.length) {
    showMsg('examPdfMsg', 'PDF 파일을 1개 이상 선택해주세요.', 'error');
    return;
  }
  if (subject === '영어' && !grade) {
    showMsg('examPdfMsg', '영어 자료는 학년을 반드시 선택해주세요.', 'error');
    return;
  }
  const invalid = files.find(f => f.type !== 'application/pdf');
  if (invalid) {
    showMsg('examPdfMsg', `PDF 파일만 선택할 수 있습니다. (문제 파일: ${invalid.name})`, 'error');
    return;
  }

  // 실제 PDF 파일을 Storage에 올리고, 그 다운로드 URL을 pdfUrl로 함께 저장합니다.
  // 다운로드 허용 여부는 기본 미허용(downloadEnabled:false)으로 등록되며, 아래 자료 목록에서
  // "다운로드 허용" 체크박스로 자료별로 선별해서 켤 수 있습니다.
  const useSingleTitle = files.length === 1 && titleInput;
  let saved = 0;
  const base = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const title = useSingleTitle ? titleInput : file.name.replace(/\.pdf$/i, '');
    progressEl.textContent = `(${i+1}/${files.length}) "${title}" 업로드 중...`;
    try {
      const path = `examMaterials/${base}_${i}_${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const pdfUrl = await getDownloadURL(fileRef);
      await addDoc(collection(db, 'examMaterials'), {
        title, academy, subject,
        materialType: materialType || '', year: year || '',
        grade, active: true, pdfUrl, downloadEnabled: false,
        order: base + i, createdAt: new Date().toISOString()
      });
      saved++;
    } catch(e) {
      progressEl.textContent = `⚠️ "${file.name}" 업로드 실패: ${e.message}`;
    }
  }

  showMsg('examPdfMsg', `✅ ${saved}/${files.length}개 자료가 파일과 함께 등록되었습니다. (다운로드는 기본 미허용 — 아래 목록에서 자료별로 "다운로드 허용" 체크)`, 'success');
  progressEl.textContent = '';
  document.getElementById('exampdf-title').value = '';
  fileInput.value = '';
  renderExamPdfFileList();
  await loadExamMaterials();
};

// PDF 드래그&드롭 업로드 영역 (엑셀 업로드 드롭존과 같은 방식)
function renderExamPdfFileList(){
  const files = Array.from(document.getElementById('exampdf-file').files || []);
  const el = document.getElementById('examPdfFileList');
  if (!el) return;
  if (!files.length) { el.textContent = ''; return; }
  el.textContent = `선택된 파일 ${files.length}개: ` + files.map(f => f.name).join(', ');
}
(function setupExamPdfDrop(){
  const drop = document.getElementById('examPdfDrop');
  const input = document.getElementById('exampdf-file');
  if (!drop || !input) return;
  window.updateExamPdfTypeOptions();
  input.addEventListener('change', renderExamPdfFileList);
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    const dropped = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf');
    if (!dropped.length) return;
    const dt = new DataTransfer();
    dropped.forEach(f => dt.items.add(f));
    input.files = dt.files;
    renderExamPdfFileList();
  });
})();

let examMaterialsCache = [];
async function loadExamMaterials() {
  try {
    // 다시 그리기 전에, 현재 열려 있던 아코디언(과목-학원별)과 체크된 선택 항목을 기억해뒀다가
    // 렌더링 후 그대로 복원합니다.
    const openKeys = new Set(
      [...document.querySelectorAll('#examMaterialList details[data-key]')]
        .filter(d => d.open)
        .map(d => d.dataset.key)
    );
    const checkedIds = new Set(
      [...document.querySelectorAll('#examMaterialList .exam-material-select:checked')]
        .map(el => el.dataset.id)
    );

    const snap = await getDocs(query(collection(db, 'examMaterials'), orderBy('order', 'asc')));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    examMaterialsCache = list;
    const countEl = document.getElementById('examMaterialCount'); if (countEl) countEl.textContent = list.length;
    const el = document.getElementById('examMaterialList');
    if (!list.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 자료가 없습니다.</div>'; return;
    }
    // 과목(수학/영어)별로 먼저 나누고, 그 안에서 학원별로 묶어 아코디언으로 표시
    const bySubject = { '수학': [], '영어': [] };
    list.forEach(v => {
      const subj = v.subject === '영어' ? '영어' : '수학';
      bySubject[subj].push(v);
    });

    el.innerHTML = ['수학', '영어'].map(subject => {
      const subjectItems = bySubject[subject];
      if (!subjectItems.length) return '';

      const groups = {};
      const order = [];
      subjectItems.forEach(v => {
        if (!groups[v.academy]) { groups[v.academy] = []; order.push(v.academy); }
        groups[v.academy].push(v);
      });

      return `
        <div style="margin-bottom:22px;">
          <div style="font-size:14px;font-weight:700;color:var(--gold);margin-bottom:10px;">
            ${subject === '수학' ? '📐' : '🔤'} ${subject} (${subjectItems.length}개)
          </div>
          ${order.map(academy => `
            <details data-key="${subject}::${academy}" ${openKeys.has(`${subject}::${academy}`) ? 'open' : ''} style="margin-bottom:10px;background:rgba(30,24,56,0.03);border-radius:8px;padding:2px 14px;">
              <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--off-white);padding:10px 0;">
                ${academy} <span style="color:var(--muted);font-weight:400;">(${groups[academy].length}개)</span>
              </summary>
              <div style="padding-bottom:10px;">
                ${groups[academy].map((v, i) => `
                  <div class="assign-item" style="flex-wrap:wrap;gap:8px;align-items:center;
                    border-top:1px solid rgba(30,24,56,0.04);">
                    <input type="checkbox" class="exam-material-select" data-id="${v.id}" style="width:15px;height:15px;accent-color:var(--gold);cursor:pointer;flex-shrink:0;">
                    <input id="order-em-${v.id}" type="number" min="1" value="${v.order != null ? v.order : ''}"
                      placeholder="순서"
                      style="width:52px;padding:4px 6px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
                        border-radius:6px;color:var(--gold);font-size:12px;font-family:inherit;text-align:center;
                        -moz-appearance:textfield;color-scheme:light;">
                    <input id="title-em-${v.id}" type="text" value="${(v.title||'').replace(/"/g,'&quot;')}"
                      style="flex:1;min-width:160px;padding:4px 8px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
                        border-radius:6px;color:var(--off-white);font-size:12px;font-family:inherit;color-scheme:light;">
                    <span class="student-meta" style="font-size:11px;flex-shrink:0;display:flex;align-items:center;gap:6px;">
                      ${v.vimeoId ? `Vimeo: ${v.vimeoId}` : (v.pdfUrl ? `
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--muted);">
                          <input type="checkbox" ${v.downloadEnabled !== false ? 'checked' : ''} onchange="toggleExamMaterialDownload('${v.id}', this.checked)"> 다운로드 허용
                        </label>
                        <a href="${v.pdfUrl}" target="_blank" style="color:var(--gold);">📄 미리보기</a>
                      ` : `
                        <span style="color:var(--muted);">제목만 등록됨</span>
                        <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;" onclick="document.getElementById('file-em-${v.id}').click()">📎 파일 첨부</button>
                        <input type="file" id="file-em-${v.id}" accept="application/pdf" style="display:none;" onchange="uploadExamMaterialFile('${v.id}', this.files[0])">
                      `)}
                    </span>
                    <select style="font-size:12px;" onchange="updateExamMaterialField('${v.id}','grade',this.value)">
                      <option value="" ${!v.grade ? 'selected' : ''}>학년 미지정</option>
                      <option value="고1" ${v.grade==='고1' ? 'selected' : ''}>고1</option>
                      <option value="고2" ${v.grade==='고2' ? 'selected' : ''}>고2</option>
                      <option value="고3" ${v.grade==='고3' ? 'selected' : ''}>고3</option>
                      <option value="중1" ${v.grade==='중1' ? 'selected' : ''}>중1</option>
                      <option value="중2" ${v.grade==='중2' ? 'selected' : ''}>중2</option>
                      <option value="중3" ${v.grade==='중3' ? 'selected' : ''}>중3</option>
                    </select>
                    <select style="font-size:12px;" onchange="updateExamMaterialField('${v.id}','subject',this.value)">
                      <option value="수학" ${v.subject==='수학' ? 'selected' : ''}>수학</option>
                      <option value="영어" ${v.subject==='영어' ? 'selected' : ''}>영어</option>
                    </select>
                    <select style="font-size:12px;" onchange="updateExamMaterialField('${v.id}','materialType',this.value)">
                      <option value="" ${!v.materialType ? 'selected' : ''}>유형 미지정</option>
                      <option value="고1 기출문제" ${v.materialType==='고1 기출문제' ? 'selected' : ''}>고1 기출문제</option>
                      <option value="고2 기출문제" ${v.materialType==='고2 기출문제' ? 'selected' : ''}>고2 기출문제</option>
                      <option value="유형정리" ${v.materialType==='유형정리' ? 'selected' : ''}>유형정리</option>
                      <option value="송우찬수학학원 보충" ${v.materialType==='송우찬수학학원 보충' ? 'selected' : ''}>송우찬수학학원 보충</option>
                      <option value="인어스수학학원 보충" ${v.materialType==='인어스수학학원 보충' ? 'selected' : ''}>인어스수학학원 보충</option>
                    </select>
                    ${YEAR_FILTERABLE_TYPES.includes(v.materialType) ? `
                    <select style="font-size:12px;" onchange="updateExamMaterialField('${v.id}','year',this.value)">
                      <option value="" ${!v.year ? 'selected' : ''}>연도 미지정</option>
                      <option value="2025" ${v.year==='2025' ? 'selected' : ''}>2025년</option>
                      <option value="2024" ${v.year==='2024' ? 'selected' : ''}>2024년</option>
                    </select>` : ''}
                    <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;">
                      <input type="checkbox" ${v.active !== false ? 'checked' : ''} onchange="toggleExamMaterialActive('${v.id}', this.checked)"> 자료실에 노출
                    </label>
                    <button class="btn btn-secondary btn-sm" onclick="saveExamMaterialRow('${v.id}')" style="background:rgba(240,192,64,0.15);border-color:var(--gold);color:var(--gold);">저장</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteExamMaterial('${v.id}','${(v.title||'').replace(/'/g,"\\'")}')">삭제</button>
                  </div>`).join('')}
              </div>
            </details>
          `).join('')}
        </div>`;
    }).join('');

    // 재렌더링 전에 체크돼 있던 선택 항목 복원
    checkedIds.forEach(id => {
      const box = el.querySelector(`.exam-material-select[data-id="${id}"]`);
      if (box) box.checked = true;
    });
  } catch(e) {
    document.getElementById('examMaterialList').innerHTML =
      `<div style="color:#ff9090;font-size:13px;">오류: ${e.message}</div>`;
  }
}

// 이미 실제 파일이 Storage에 올라가서 pdfUrl이 있는 자료에 대해, 새로 파일을 올릴 필요 없이
// downloadEnabled 플래그만 체크박스로 켜고 끕니다. (실제 파일 링크(pdfUrl)는 그대로 보존)
window.uploadExamMaterialFile = async function(id, file) {
  if (!file) return;
  if (file.type !== 'application/pdf') { alert('PDF 파일만 첨부할 수 있습니다.'); return; }
  try {
    const path = `examMaterials/${id}_${Date.now()}_${file.name}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    await updateDoc(doc(db, 'examMaterials', id), { pdfUrl: url, downloadEnabled: true });
    await loadExamMaterials();
  } catch(e) {
    alert('파일 첨부 실패: ' + e.message);
  }
};

// 체크박스 클릭 한 번으로 다운로드 허용/해제를 저장합니다. 실제 파일(pdfUrl)은 건드리지 않고
// downloadEnabled 값만 바꿔서, 학생 화면(자료실)에서 이 값을 보고 다운로드 버튼을 보여줄지 결정하게 합니다.
window.toggleExamMaterialDownload = async function(id, enabled) {
  try {
    await updateDoc(doc(db, 'examMaterials', id), { downloadEnabled: enabled });
    await loadExamMaterials();
  } catch(e) {
    alert('변경 실패: ' + e.message);
    loadExamMaterials();
  }
};

window.toggleExamMaterialActive = async function(id, active) {
  try {
    await updateDoc(doc(db, 'examMaterials', id), { active });
  } catch(e) {
    alert('변경 오류: ' + e.message);
    loadExamMaterials();
  }
};

// 등록된 자료 목록에서 과목(수학/영어)·자료 하위분류(고1 기출문제/고2 기출문제/유형정리/학원별 보충)를
// 직접 바꿔서 index.html 자료실의 어느 필터에 노출될지 조정할 수 있게 합니다.
window.updateExamMaterialField = async function(id, field, value) {
  try {
    await updateDoc(doc(db, 'examMaterials', id), { [field]: value });
    const item = examMaterialsCache.find(v => v.id === id);
    if (item) item[field] = value;
    // 자료유형을 바꾸면(고1/고2 기출문제 ↔ 그 외) 연도 선택 칸이 보이거나 사라져야 하므로 다시 그립니다.
    if (field === 'materialType') await loadExamMaterials();
  } catch(e) {
    alert('변경 오류: ' + e.message);
    loadExamMaterials();
  }
};

// 강의 목록(renumberTagGroup)과 동일한 방식 — 학원(academy) 단위로 순서를 1..N 재부여
async function renumberExamGroup(academy, edits) {
  const editMap = new Map(edits);
  const groupItems = examMaterialsCache.filter(v => v.academy === academy);
  const writes = [];

  editMap.forEach((num, id) => {
    if (num == null) {
      const v = groupItems.find(x => x.id === id);
      if (v && v.order != null) {
        writes.push(updateDoc(doc(db, 'examMaterials', id), { order: null }).then(() => { v.order = null; }));
      }
    }
  });

  const withKey = groupItems
    .filter(v => !(editMap.has(v.id) && editMap.get(v.id) == null))
    .map((v, idx) => {
      const edited = editMap.has(v.id);
      const num = edited ? editMap.get(v.id) : (v.order != null ? Number(v.order) : null);
      return { v, idx, edited, key: num == null ? Infinity : num };
    });

  withKey.sort((a, b) => {
    if (a.key !== b.key) return a.key - b.key;
    if (a.edited !== b.edited) return a.edited ? -1 : 1;
    return a.idx - b.idx;
  });

  withKey.forEach((item, i) => {
    const newOrder = i + 1;
    if (item.v.order !== newOrder) {
      writes.push(updateDoc(doc(db, 'examMaterials', item.v.id), { order: newOrder }).then(() => { item.v.order = newOrder; }));
    }
  });

  await Promise.all(writes);
}

// 행 저장 (순서 + 제목 함께) — 강의 목록의 saveRow와 동일한 방식
window.saveExamMaterialRow = async (id) => {
  const orderInput = document.getElementById('order-em-' + id);
  const titleInput = document.getElementById('title-em-' + id);
  const orderVal = orderInput ? orderInput.value.trim() : '';
  const orderNum = orderVal === '' ? null : Number(orderVal);
  const title = titleInput ? titleInput.value.trim() : '';

  if (!title) { showToast('❌ 제목을 입력해주세요.'); return; }

  try {
    const cached = examMaterialsCache.find(v => v.id === id);
    const academy = cached ? cached.academy : null;

    await updateDoc(doc(db, 'examMaterials', id), { title });
    if (cached) cached.title = title;

    if (academy) {
      await renumberExamGroup(academy, [[id, orderNum]]);
    } else {
      await updateDoc(doc(db, 'examMaterials', id), { order: orderNum });
      if (cached) cached.order = orderNum;
    }
    showToast('✅ 저장 완료');
    await loadExamMaterials();
  } catch(e) {
    showToast('❌ 저장 실패: ' + e.message);
  }
};

// 일괄 저장 (펼쳐진 학원 그룹 내 순서 + 제목 한번에 저장) — 강의 목록의 bulkSaveOrder와 동일한 방식
window.bulkSaveExamMaterialOrder = async () => {
  const inputs = document.querySelectorAll('input[id^="order-em-"]');
  if (!inputs.length) { showToast('저장할 항목이 없습니다.'); return; }
  let saved = 0;
  const titlePromises = [];
  const editsByAcademy = new Map(); // academy -> [[id, orderNum], ...]

  inputs.forEach(input => {
    const id = input.id.replace('order-em-', '');
    const val = input.value.trim();
    const orderNum = val === '' ? null : Number(val);
    const titleInput = document.getElementById('title-em-' + id);
    const title = titleInput ? titleInput.value.trim() : null;
    const cached = examMaterialsCache.find(v => v.id === id);
    if (!cached) return;

    const orderChanged = !(cached.order == null && orderNum == null) && cached.order !== orderNum;
    const titleChanged = !!title && cached.title !== title;
    if (!orderChanged && !titleChanged) return;

    if (titleChanged) {
      titlePromises.push(
        updateDoc(doc(db, 'examMaterials', id), { title }).then(() => { cached.title = title; })
      );
    }
    if (orderChanged) {
      const academy = cached.academy || '__no_academy__';
      if (!editsByAcademy.has(academy)) editsByAcademy.set(academy, []);
      editsByAcademy.get(academy).push([id, orderNum]);
    }
    saved++;
  });

  try {
    await Promise.all(titlePromises);
    for (const [academy, edits] of editsByAcademy) {
      if (academy === '__no_academy__') {
        for (const [id, orderNum] of edits) {
          await updateDoc(doc(db, 'examMaterials', id), { order: orderNum });
          const cached = examMaterialsCache.find(v => v.id === id);
          if (cached) cached.order = orderNum;
        }
      } else {
        await renumberExamGroup(academy, edits);
      }
    }
    showToast(saved ? `✅ ${saved}건 저장 완료` : '변경된 내용이 없습니다.');
    await loadExamMaterials();
  } catch(e) {
    showToast('❌ 일괄 저장 실패: ' + e.message);
  }
};

// examMaterials 문서를 지우면서, 실제 PDF 파일이 Storage에 첨부돼 있던 자료(pdfUrl 있음)는
// 그 파일도 함께 삭제합니다. (Vimeo 원본 영상은 우리 쪽 소유가 아니므로 건드리지 않습니다)
async function deleteExamMaterialStorageFile(v) {
  if (!v || !v.pdfUrl) return;
  try {
    await deleteObject(ref(storage, v.pdfUrl));
  } catch(e) {
    // 파일이 이미 없거나 삭제 권한이 없는 경우 등은 조용히 건너뜁니다.
  }
}

window.deleteExamMaterial = async function(id, title) {
  const v = examMaterialsCache.find(m => m.id === id);
  const hasFile = !!(v && v.pdfUrl);
  if (!confirm(`"${title}" 자료를 삭제하시겠습니까?${hasFile ? '\n(첨부된 실제 PDF 파일도 Storage에서 함께 삭제됩니다)' : ''}`)) return;
  try {
    await deleteExamMaterialStorageFile(v);
    await deleteDoc(doc(db, 'examMaterials', id));
    await loadExamMaterials();
  } catch(e) {
    alert('삭제 오류: ' + e.message);
  }
};

// 체크박스로 선택된 자료만 골라 한 번에 삭제합니다. examMaterials 등록 문서뿐 아니라,
// 실제 PDF 파일이 Storage에 첨부돼 있던 자료는 그 파일도 함께 지웁니다.
// (Vimeo 원본 영상은 우리 쪽 소유가 아니므로 건드리지 않습니다)
window.bulkDeleteSelectedExamMaterials = async function() {
  const checked = [...document.querySelectorAll('.exam-material-select:checked')].map(el => el.dataset.id);
  if (!checked.length) { alert('삭제할 자료를 먼저 선택해주세요.'); return; }
  const fileCount = checked.filter(id => {
    const v = examMaterialsCache.find(m => m.id === id);
    return v && v.pdfUrl;
  }).length;
  if (!confirm(`선택한 자료 ${checked.length}개를 삭제하시겠습니까?${fileCount ? `\n(이 중 ${fileCount}개는 첨부된 실제 PDF 파일도 Storage에서 함께 삭제됩니다)` : '\n(Vimeo 원본 영상은 삭제되지 않고, 자료실 목록에서만 사라집니다)'}`)) return;
  const statusEl = document.getElementById('examSyncStatus');
  let deleted = 0, failed = 0;
  for (const id of checked) {
    try {
      const v = examMaterialsCache.find(m => m.id === id);
      await deleteExamMaterialStorageFile(v);
      await deleteDoc(doc(db, 'examMaterials', id));
      deleted++;
    } catch(e) {
      failed++;
    }
    if (statusEl) statusEl.textContent = `삭제 중... (${deleted + failed}/${checked.length})`;
  }
  if (statusEl) statusEl.textContent = `✅ ${deleted}개 삭제 완료${failed ? ` · 실패 ${failed}개` : ''}`;
  await loadExamMaterials();
};

// 목록에 보이는 체크박스를 전체 선택하거나, 하나라도 선택돼 있으면 전체 해제합니다.
window.toggleAllExamMaterialSelect = function() {
  const boxes = [...document.querySelectorAll('.exam-material-select')];
  if (!boxes.length) return;
  const shouldCheck = boxes.some(b => !b.checked);
  boxes.forEach(b => b.checked = shouldCheck);
};

