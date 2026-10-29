'use strict';
/* ═══════════════════════════════════════════════════════════
   강의 목록: 영상 · 그룹 이름 · 단원순 정렬 · 폴더 선택 · Vimeo 동기화/정리(삭제된 영상 목록 정리)
   (admin.html에서 분리 — 원본 3775~5362줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 강의 목록 ──
async function loadVideos() {
  const snap = await getDocs(collection(db, 'videos'));
  videosCache = [];
  snap.forEach(d => videosCache.push({id: d.id, ...d.data()}));
  window.videosCache = videosCache;
  renderVideos();
  if (document.getElementById('tab-videocode')?.classList.contains('active')) renderVideoCodeTab();
  const videoCountEl = document.getElementById('videoCount'); if (videoCountEl) videoCountEl.textContent = videosCache.length;
}

// 카테고리 그룹 정의
const EXAM_YEARS = ['2025','2024','2023','2022','2021'];
const TEACHERS_ADMIN = {
  '평촌관': ['송우찬 원장T','송문찬 원장T','조현주 부원장T','김영진T','신민훈T','장미현T','공민정T'],
  '산본관': ['송우찬 원장T','송문찬 원장T','조현주 부원장T','공민정T','장미현T','김영진T','신민훈T','박예지T'],
};

const BOOK_LABEL = {
  '세쌍둥이개념':'개념편','세쌍둥이심화':'심화편',
  '세쌍둥이라이트':'라이트','세쌍둥이파이널':'파이널',
};

function genGroups(subject, grade, teachers, books, displaySubject) {
  const ds = displaySubject || subject;
  const groups = [];
  for (const book of books) {
    for (const teacher of teachers) {
      const tag = `${subject}_${book}_${teacher}`;
      groups.push({ label:`고등 — ${grade} — ${ds} — ${BOOK_LABEL[book]} - ${teacher}`, tags:[tag] });
    }
  }
  groups.push({ label:`고등 — ${grade} — ${ds} — 파이널`, tags:[`${subject}_세쌍둥이파이널`] });
  return groups;
}

const SUBJ_T1 = ['송우찬 원장T','송문찬 원장T','공민정T'];
const SUBJ_T2 = ['송우찬 원장T','송문찬 원장T'];
const BOOKS_F = ['세쌍둥이개념','세쌍둥이심화','세쌍둥이라이트'];
const BOOKS_L = ['세쌍둥이개념'];

const VIDEO_GROUPS = [
  { label: '중등', tags: ['중1','중2','중3'] },
  { label: '주간 클리어 — 중1', tags: ['주간클리어_중1'] },
  { label: '주간 클리어 — 중2', tags: ['주간클리어_중2'] },
  { label: '주간 클리어 — 중3', tags: ['주간클리어_중3'] },
  ...genGroups('공통수학1','고1', SUBJ_T1, BOOKS_F),
  ...genGroups('공통수학2','고1', SUBJ_T1, BOOKS_F),
  ...genGroups('대수',     '고2', SUBJ_T2, BOOKS_F),
  ...genGroups('미적분1',   '고2', SUBJ_T2, BOOKS_F),
  ...genGroups('확통',     '고2', SUBJ_T2, BOOKS_L),
  ...genGroups('미적분2',  '고3', SUBJ_T2, BOOKS_F),
  ...genGroups('기하',     '고3', SUBJ_T2, BOOKS_L),
  ...EXAM_YEARS.flatMap(y => [
    { label:`기출해설 — 고1 (${y}) 전체`, tags:[`기출_고1_${y}`] },
    { label:`기출해설 — 고1 (${y}) 1학기 중간`, tags:[`기출_고1_${y}_1중간`] },
    { label:`기출해설 — 고1 (${y}) 1학기 기말`, tags:[`기출_고1_${y}_1기말`] },
    { label:`기출해설 — 고1 (${y}) 2학기 중간`, tags:[`기출_고1_${y}_2중간`] },
    { label:`기출해설 — 고1 (${y}) 2학기 기말`, tags:[`기출_고1_${y}_2기말`] },
  ]),
  ...EXAM_YEARS.flatMap(y => [
    { label:`기출해설 — 고2 (${y}) 전체`, tags:[`기출_고2_${y}`] },
    { label:`기출해설 — 고2 (${y}) 1학기 중간`, tags:[`기출_고2_${y}_1중간`] },
    { label:`기출해설 — 고2 (${y}) 1학기 기말`, tags:[`기출_고2_${y}_1기말`] },
    { label:`기출해설 — 고2 (${y}) 2학기 중간`, tags:[`기출_고2_${y}_2중간`] },
    { label:`기출해설 — 고2 (${y}) 2학기 기말`, tags:[`기출_고2_${y}_2기말`] },
  ]),
  ...EXAM_YEARS.flatMap(y => [
    { label:`기출해설 — 고3 (${y}) 전체`, tags:[`기출_고3_${y}`] },
    { label:`기출해설 — 고3 (${y}) 1학기 중간`, tags:[`기출_고3_${y}_1중간`] },
    { label:`기출해설 — 고3 (${y}) 1학기 기말`, tags:[`기출_고3_${y}_1기말`] },
    { label:`기출해설 — 고3 (${y}) 2학기 중간`, tags:[`기출_고3_${y}_2중간`] },
    { label:`기출해설 — 고3 (${y}) 2학기 기말`, tags:[`기출_고3_${y}_2기말`] },
  ]),
  { label:'기출해설 (구형)', tags:['기출_공통수학1','기출_공통수학2','기출_대수','기출_미적분','기출_확통','기출_미적분2','기출_기하','기출해설'] },
  { label:'수리논술', tags:['수리논술'] },
  { label:'선생님전용', tags:['선생님전용'] },
  { label:"Song's Tip — 공통수학1", tags:['송팁_공통수학1'] },
  { label:"Song's Tip — 공통수학2", tags:['송팁_공통수학2'] },
  ...TEACHERS_ADMIN['평촌관'].map(t => ({ label:`보충강의실 — 평촌관 ${t}`, tags:[`보충_평촌_${t}`] })),
  ...TEACHERS_ADMIN['산본관'].map(t => ({ label:`보충강의실 — 산본관 ${t}`, tags:[`보충_산본_${t}`] })),
  { label:'⚠️ 태그 없음 (미분류)', tags:['', null, undefined] },
];
const VIDEO_CAT_TAGS = {
  '중등':    ['중1','중2','중3'],
  '주간 클리어': ['주간클리어_중1','주간클리어_중2','주간클리어_중3'],
  '고등':    ['공통수학1','공통수학2','대수','미적분1','확통','미적분2','기하'],
  '기출해설': [
    ...EXAM_YEARS.flatMap(y => ['고1','고2','고3'].map(g => `기출_${g}_${y}`)),
    ...EXAM_YEARS.flatMap(y => ['고1','고2','고3'].flatMap(g =>
      ['1중간','1기말','2중간','2기말'].map(t => `기출_${g}_${y}_${t}`))),
    '기출해설','기출_공통수학1','기출_공통수학2','기출_대수','기출_미적분','기출_확통','기출_미적분2','기출_기하',
  ],
  '수리논술':['수리논술'],
  '선생님전용':['선생님전용'],
  '보충강의실': [
    ...TEACHERS_ADMIN['평촌관'].map(t => `보충_평촌_${t}`),
    ...TEACHERS_ADMIN['산본관'].map(t => `보충_산본_${t}`),
  ],
  "Song's Tip": ['송팁_공통수학1','송팁_공통수학2'],
};
let currentVideoFilter = ''; // '' = 전체
window.renderVideos = renderVideos; // 일반 스크립트에서는 함수 선언이 전역이라 래퍼를 쓰면 자기 자신을 부르게 됨

window.filterAdminVideos = function(cat, btn) {
  currentVideoFilter = cat;
  document.querySelectorAll('#videoFilterBtns button').forEach(b => {
    b.className = 'btn btn-secondary btn-sm';
  });
  btn.className = 'btn btn-primary btn-sm';
  renderVideos();
};

function renderVideos() {
  const el = document.getElementById('videoAdminList');
  if (!videosCache.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 강의가 없습니다.</div>';
    return;
  }

  const TAG_OPTIONS = [
    { group:'중등',           value:'중1' },
    { group:'중등',           value:'중2' },
    { group:'중등',           value:'중3' },
    { group:'주간 클리어', value:'주간클리어_중1', label:'주간 클리어 중1' },
    { group:'주간 클리어', value:'주간클리어_중2', label:'주간 클리어 중2' },
    { group:'주간 클리어', value:'주간클리어_중3', label:'주간 클리어 중3' },
    { group:'고등 — 고1',     value:'공통수학1' },
    { group:'고등 — 고1',     value:'공통수학2' },
    { group:'고등 — 고2',     value:'대수' },
    { group:'고등 — 고2',     value:'미적분1' },
    { group:'고등 — 고2',     value:'확통' },
    { group:'고등 — 고3',     value:'미적분2' },
    { group:'고등 — 고3',     value:'기하' },
    ...EXAM_YEARS.flatMap(y => [
      { group:`기출해설 — 고1 (${y})`, value:`기출_고1_${y}` },
      { group:`기출해설 — 고1 (${y})`, value:`기출_고1_${y}_1중간` },
      { group:`기출해설 — 고1 (${y})`, value:`기출_고1_${y}_1기말` },
      { group:`기출해설 — 고1 (${y})`, value:`기출_고1_${y}_2중간` },
      { group:`기출해설 — 고1 (${y})`, value:`기출_고1_${y}_2기말` },
      { group:`기출해설 — 고2 (${y})`, value:`기출_고2_${y}` },
      { group:`기출해설 — 고2 (${y})`, value:`기출_고2_${y}_1중간` },
      { group:`기출해설 — 고2 (${y})`, value:`기출_고2_${y}_1기말` },
      { group:`기출해설 — 고2 (${y})`, value:`기출_고2_${y}_2중간` },
      { group:`기출해설 — 고2 (${y})`, value:`기출_고2_${y}_2기말` },
      { group:`기출해설 — 고3 (${y})`, value:`기출_고3_${y}` },
      { group:`기출해설 — 고3 (${y})`, value:`기출_고3_${y}_1중간` },
      { group:`기출해설 — 고3 (${y})`, value:`기출_고3_${y}_1기말` },
      { group:`기출해설 — 고3 (${y})`, value:`기출_고3_${y}_2중간` },
      { group:`기출해설 — 고3 (${y})`, value:`기출_고3_${y}_2기말` },
    ]),
    { group:'기타',           value:'수리논술' },
    { group:'기타',           value:'선생님전용' },
    ...TEACHERS_ADMIN['평촌관'].map(t => ({ group:'보충강의실 — 평촌관', value:`보충_평촌_${t}` })),
    ...TEACHERS_ADMIN['산본관'].map(t => ({ group:'보충강의실 — 산본관', value:`보충_산본_${t}` })),
    { group:"Song's Tip", value:'송팁_공통수학1' },
    { group:"Song's Tip", value:'송팁_공통수학2' },
  ];

  // 그룹별 optgroup HTML 생성
  const groups = [...new Set(TAG_OPTIONS.map(t => t.group))];
  const optgroupHtml = groups.map(g => `
    <optgroup label="${g}">
      ${TAG_OPTIONS.filter(t => t.group === g).map(t =>
        `<option value="${t.value}">${t.label || t.value}</option>`
      ).join('')}
    </optgroup>`).join('');

  // 필터 적용
  const allowedTags = currentVideoFilter ? VIDEO_CAT_TAGS[currentVideoFilter] : null;
  const filtered = allowedTags ? videosCache.filter(v => allowedTags.includes(v.tag)) : videosCache;

  if (!filtered.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">해당 카테고리의 강의가 없습니다.</div>';
    return;
  }

  // 그룹별로 묶어서 렌더
  const allKnownTags = VIDEO_GROUPS.flatMap(g => g.tags).filter(t => t);
  let html = '';

  // 일괄 처리 툴바
  html += `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      padding:10px 14px;background:rgba(245,197,24,0.06);border:1px solid rgba(245,197,24,0.2);
      border-radius:8px;margin-bottom:12px;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;white-space:nowrap;color:var(--off-white);">
        <input type="checkbox" id="checkAll" onchange="toggleAllVideoChecks(this)"
          style="width:15px;height:15px;accent-color:var(--gold);cursor:pointer;">
        전체선택
      </label>
      <span id="checkedCount" style="font-size:12px;color:var(--purple, #5B3FA6);min-width:60px;"></span>
      <div style="position:relative;flex:1;min-width:200px;">
        <input id="bulkTagSearch" type="text" placeholder="카테고리 검색..."
          oninput="filterBulkTagOptions()"
          onfocus="document.getElementById('bulkTagDropdown').style.display='block'"
          onblur="setTimeout(()=>document.getElementById('bulkTagDropdown').style.display='none',200)"
          style="width:100%;box-sizing:border-box;padding:6px 10px;background:#F7F6FB;
            border:1px solid rgba(30,24,56,0.15);border-radius:6px;color:var(--off-white);
            font-size:12px;font-family:inherit;color-scheme:light;"
          data-selected-value="">
        <div id="bulkTagDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;
          max-height:200px;overflow-y:auto;background:#F7F6FB;border:1px solid rgba(30,24,56,0.2);
          border-radius:6px;z-index:100;margin-top:2px;"></div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="bulkChangeTag()">일괄 카테고리 변경</button>
      <button class="btn btn-secondary btn-sm" onclick="bulkSaveOrder()" style="background:rgba(245,197,24,0.15);border-color:var(--gold);color:var(--purple, #5B3FA6);">📋 순서·제목 일괄 저장</button>
      <button class="btn btn-secondary btn-sm" onclick="autoOrderByTitle()" title="선택한 강의만 교육과정 단원 순서 → 제목 번호 순으로 순서를 자동 배정합니다" style="background:rgba(124,184,221,0.15);border-color:#2F7FD6;color:#2F7FD6;">📚 단원순 자동배정</button>
      <button class="btn btn-danger btn-sm" onclick="bulkDelete()">일괄 삭제</button>
    </div>`;

  // 그룹별 아코디언
  VIDEO_GROUPS.forEach(group => {
    if (allowedTags && !group.tags.some(t => allowedTags.includes(t))) return;
    let items;
    if (group.tags.includes('') || group.tags.includes(null)) {
      items = filtered.filter(v => !allKnownTags.includes(v.tag));
    } else {
      items = filtered.filter(v => group.tags.includes(v.tag));
    }
    if (!items.length) return;
    items = [...items].sort((a, b) => {
      const oa = a.order != null ? Number(a.order) : 9999;
      const ob = b.order != null ? Number(b.order) : 9999;
      return oa - ob;
    });

    const groupId = 'vgrp-' + group.label.replace(/[^a-zA-Z0-9가-힣]/g,'_');

    html += `
      <div style="margin-bottom:8px;border:1px solid rgba(30,24,56,0.07);border-radius:8px;overflow:hidden;">
        <!-- 그룹 헤더 -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
          background:rgba(30,24,56,0.03);cursor:pointer;"
          onclick="toggleAdminGroup('${groupId}')">
          <input type="checkbox" class="group-check" data-group="${groupId}"
            onclick="event.stopPropagation();toggleGroupCheck(this,'${groupId}')"
            style="width:15px;height:15px;cursor:pointer;accent-color:var(--gold);flex-shrink:0;">
          <span style="font-size:11px;font-weight:700;color:var(--purple, #5B3FA6);letter-spacing:1px;
            text-transform:uppercase;flex:1;">${group.label}</span>
          <span style="font-size:11px;color:var(--muted);">${items.length}개</span>
          <span id="arrow-${groupId}" style="color:var(--purple, #5B3FA6);font-size:11px;transition:transform 0.2s;">▼</span>
        </div>
        <!-- 그룹 내용 (기본 접힘) -->
        <div id="${groupId}" style="display:none;">
          ${items.map(v => `
            <div class="assign-item" style="flex-wrap:wrap;gap:8px;align-items:center;
              border-top:1px solid rgba(30,24,56,0.04);">
              <input type="checkbox" class="video-check" data-id="${v.id}" data-group="${groupId}"
                onchange="updateCheckedCount()"
                style="width:15px;height:15px;cursor:pointer;flex-shrink:0;accent-color:var(--gold);">
              <span title="${v.code ? '클릭하면 복사됩니다' : '영상 고유 코드'}" ${v.code ? `onclick="copyText('${v.code}', this)"` : ''}
                style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:11px;flex-shrink:0;min-width:92px;
                color:${v.code ? 'var(--gold)' : 'var(--muted)'};${v.code ? 'cursor:pointer;' : ''}">${v.code || '코드 없음'}</span>
              <input id="order-${v.id}" type="number" min="1" value="${v.order != null ? v.order : ''}"
                placeholder="순서"
                style="width:52px;padding:4px 6px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
                  border-radius:6px;color:var(--purple, #5B3FA6);font-size:12px;font-family:inherit;text-align:center;
                  -moz-appearance:textfield;color-scheme:light;">
              <input id="title-${v.id}" type="text" value="${(v.title||'').replace(/"/g,'&quot;')}"
                style="flex:1;min-width:160px;padding:4px 8px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
                  border-radius:6px;color:var(--off-white);font-size:12px;font-family:inherit;color-scheme:light;">
              <span style="font-size:11px;color:var(--muted);flex-shrink:0;">${v.date||''}</span>
              <select id="tag-sel-${v.id}" style="padding:4px 8px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
                border-radius:6px;color:var(--off-white);font-size:12px;font-family:inherit;cursor:pointer;flex-shrink:0;color-scheme:light;">
                ${optgroupHtml}
              </select>
              <button class="btn btn-secondary btn-sm" onclick="saveRow('${v.id}')" style="background:rgba(245,197,24,0.15);border-color:var(--gold);color:var(--purple, #5B3FA6);">저장</button>
              <button class="btn btn-secondary btn-sm" onclick="changeVideoTag('${v.id}')">태그변경</button>
              <button class="btn btn-danger btn-sm" onclick="deleteVideo('${v.id}')">삭제</button>
            </div>`).join('')}
        </div>
      </div>`;
  });
  el.innerHTML = html;
  initBulkTagSearch();
  filtered.forEach(v => {
    const sel = document.getElementById('tag-sel-' + v.id);
    if (sel) sel.value = v.tag;
  });
}

// ── 그룹 이름 관리 ──
let groupNamesCache = {}; // tag → displayName

async function loadGroupNames() {
  const snap = await getDocs(collection(db, 'videoGroups'));
  groupNamesCache = {};
  snap.forEach(d => { groupNamesCache[d.id] = d.data().displayName || ''; });
  renderGroupNameList();
  // 태그 드롭다운 채우기
  const sel = document.getElementById('groupTagSel');
  if (sel) {
    sel.innerHTML = '<option value="">-- 태그 선택 --</option>'
      + KNOWN_TAGS_SYNC.map(t => `<option value="${t}">${t}</option>`).join('');
  }
  // 태그 선택 시 기존 이름 자동 입력
  sel?.addEventListener('change', () => {
    const input = document.getElementById('groupNameInput');
    if (input) input.value = groupNamesCache[sel.value] || '';
  });
}

function renderGroupNameList() {
  const el = document.getElementById('groupNameList');
  if (!el) return;
  const entries = Object.entries(groupNamesCache);
  if (!entries.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 그룹 이름이 없습니다.</div>'; return; }
  el.innerHTML = entries.map(([tag, name]) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(30,24,56,0.05);font-size:13px;">
      <span style="color:var(--muted);font-size:11px;min-width:260px;flex-shrink:0;">${tag}</span>
      <span style="color:var(--purple, #5B3FA6);flex:1;">→ ${name}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteGroupName('${tag.replace(/'/g,"\\'")}')">삭제</button>
    </div>`).join('');
}

window.saveGroupName = async () => {
  const tag  = document.getElementById('groupTagSel')?.value;
  const name = document.getElementById('groupNameInput')?.value.trim();
  if (!tag)  { showMsg('groupNameMsg', '태그를 선택해주세요.', 'error'); return; }
  if (!name) { showMsg('groupNameMsg', '이름을 입력해주세요.', 'error'); return; }
  try {
    await setDoc(doc(db, 'videoGroups', tag), { displayName: name, tag });
    groupNamesCache[tag] = name;
    renderGroupNameList();
    document.getElementById('groupNameInput').value = '';
    showMsg('groupNameMsg', `✅ "${name}" 저장 완료`, 'success');
  } catch(e) {
    showMsg('groupNameMsg', '오류: ' + e.message, 'error');
  }
};

window.deleteGroupName = async (tag) => {
  if (!confirm(`"${tag}" 그룹 이름을 삭제할까요?`)) return;
  try {
    await deleteDoc(doc(db, 'videoGroups', tag));
    delete groupNamesCache[tag];
    renderGroupNameList();
    showMsg('groupNameMsg', '삭제 완료', 'success');
  } catch(e) {
    showMsg('groupNameMsg', '오류: ' + e.message, 'error');
  }
};
// 일괄 카테고리 검색 드롭다운
function initBulkTagSearch() {
  renderBulkTagOptions('');
}

// 계층 구조 태그 목록
const BULK_TAG_TREE = [
  { grade:'고1', subjects:['공통수학1','공통수학2'] },
  { grade:'고2', subjects:['대수','미적분1'] },
  { grade:'고3', subjects:['확통','기하','미적분2'] },
];
const BOOKS_WT = ['세쌍둥이개념','세쌍둥이심화','세쌍둥이라이트'];
const TEACHERS_TREE = {
  '공통수학1':['송우찬 원장T','송문찬 원장T','공민정T'],
  '공통수학2':['송우찬 원장T','송문찬 원장T','공민정T'],
  '대수':['송우찬 원장T','송문찬 원장T'],
  '미적분1':['송우찬 원장T','송문찬 원장T'],
  '확통':['송우찬 원장T','송문찬 원장T'],
  '미적분2':['송우찬 원장T','송문찬 원장T'],
  '기하':['송우찬 원장T','송문찬 원장T'],
};
const BOOKS_NO_T_TREE = '세쌍둥이파이널';
const BOOKS_LIMITED = { '확통':['세쌍둥이개념'], '기하':['세쌍둥이개념'] };

function buildTagTree() {
  const items = [];
  for (const { grade, subjects } of BULK_TAG_TREE) {
    items.push({ label: `── ${grade} ──`, value: null, indent: 0 });
    for (const subject of subjects) {
      items.push({ label: `  ${subject}`, value: null, indent: 1 });
      const books = BOOKS_LIMITED[subject] || BOOKS_WT;
      const teachers = TEACHERS_TREE[subject] || [];
      for (const book of books) {
        const bookLabel = book.replace('세쌍둥이개념','개념편').replace('세쌍둥이심화','심화편').replace('세쌍둥이라이트','라이트');
        for (const teacher of teachers) {
          items.push({
            label: `    ${bookLabel} - ${teacher}`,
            value: `${subject}_${book}_${teacher}`,
            indent: 2
          });
        }
      }
      items.push({ label: `    파이널`, value: `${subject}_${BOOKS_NO_T_TREE}`, indent: 2 });
    }
  }
  // 기출해설
  items.push({ label: '── 기출해설 ──', value: null, indent: 0 });
  for (const g of ['고1','고2','고3']) {
    for (const y of ['2025','2024','2023','2022','2021']) {
      items.push({ label: `  ${g} - ${y}`, value:`기출_${g}_${y}`, indent:1 });
    }
  }
  // 수리논술
  items.push({ label: '── 수리논술 ──', value: null, indent: 0 });
  items.push({ label: '  수리논술', value: '수리논술', indent: 1 });
  // 중등
  items.push({ label: '── 중등 ──', value: null, indent: 0 });
  for (const g of ['중1','중2','중3']) {
    items.push({ label: `  ${g}`, value: g, indent: 1 });
  }
  // 주간 클리어
  items.push({ label: '── 주간 클리어 ──', value: null, indent: 0 });
  for (const g of ['중1','중2','중3']) {
    items.push({ label: `  주간 클리어 ${g}`, value: `주간클리어_${g}`, indent: 1 });
  }
  // 보충강의실
  items.push({ label: '── 보충강의실 ──', value: null, indent: 0 });
  for (const t of ['송우찬 원장T','송문찬 원장T','조현주 부원장T','김영진T','신민훈T','장미현T','공민정T']) {
    items.push({ label: `  평촌 - ${t}`, value: `보충_평촌_${t}`, indent: 1 });
  }
  for (const t of ['송우찬 원장T','송문찬 원장T','조현주 부원장T','공민정T','장미현T','김영진T','신민훈T','박예지T']) {
    items.push({ label: `  산본 - ${t}`, value: `보충_산본_${t}`, indent: 1 });
  }
  return items;
}

const TAG_TREE = buildTagTree();

function renderBulkTagOptions(q) {
  const dropdown = document.getElementById('bulkTagDropdown');
  if (!dropdown) return;
  const ql = q.toLowerCase();
  const filtered = q
    ? TAG_TREE.filter(item => item.value && item.label.toLowerCase().includes(ql))
    : TAG_TREE;

  dropdown.innerHTML = filtered.map(item => {
    if (!item.value) {
      // 헤더
      return `<div style="padding:5px 10px;font-size:10px;font-weight:700;color:var(--purple, #5B3FA6);
        letter-spacing:1px;background:rgba(245,197,24,0.06);border-bottom:1px solid rgba(245,197,24,0.1);">
        ${item.label.trim()}
      </div>`;
    }
    return `<div onclick="selectBulkTag('${item.value.replace(/'/g,"\\'")}','${item.label.trim().replace(/'/g,"\\'")}')"
      style="padding:7px 10px 7px ${12 + item.indent*8}px;font-size:12px;cursor:pointer;color:var(--off-white);
        border-bottom:1px solid rgba(30,24,56,0.04);"
      onmouseover="this.style.background='rgba(245,197,24,0.1)'"
      onmouseout="this.style.background=''">
      ${item.label.trim()}
    </div>`;
  }).join('') || '<div style="padding:8px 12px;font-size:12px;color:var(--muted);">결과 없음</div>';
}

window.filterBulkTagOptions = function() {
  const q = document.getElementById('bulkTagSearch')?.value || '';
  const dropdown = document.getElementById('bulkTagDropdown');
  if (dropdown) dropdown.style.display = 'block';
  renderBulkTagOptions(q);
};

window.selectBulkTag = function(value, label) {
  const input = document.getElementById('bulkTagSearch');
  if (input) {
    input.value = label;
    input.dataset.selectedValue = value;
    input.style.borderColor = 'var(--gold)';
  }
  const dropdown = document.getElementById('bulkTagDropdown');
  if (dropdown) dropdown.style.display = 'none';
};

window.bulkChangeTag = async () => {
  const ids = getCheckedIds();
  const input = document.getElementById('bulkTagSearch');
  const tag = (input?.dataset.selectedValue || input?.value || '').trim();
  if (!ids.length) { showMsg('videoMsg', '선택된 강의가 없습니다.', 'error'); return; }
  if (!tag) { showMsg('videoMsg', '카테고리를 선택해주세요.', 'error'); return; }
  if (!confirm(`선택한 ${ids.length}개 강의의 카테고리를\n"${tag}"\n로 변경할까요?`)) return;
  try {
    await Promise.all(ids.map(id => updateDoc(doc(db, 'videos', id), { tag })));
    if (input) { input.value = ''; input.dataset.selectedValue = ''; input.style.borderColor = ''; }
    showMsg('videoMsg', `✅ ${ids.length}개 카테고리 변경 완료`, 'success');
    await loadVideos();
  } catch(e) {
    showMsg('videoMsg', '오류: ' + e.message, 'error');
  }
};

window.toggleAdminGroup = (groupId) => {
  const el    = document.getElementById(groupId);
  const arrow = document.getElementById('arrow-' + groupId);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// 그룹 헤더 체크박스 — 해당 그룹 전체 선택/해제
window.toggleGroupCheck = (master, groupId) => {
  const el = document.getElementById(groupId);
  if (el && el.style.display === 'none') {
    // 접혀있으면 먼저 펼치기
    el.style.display = 'block';
    const arrow = document.getElementById('arrow-' + groupId);
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  }
  document.querySelectorAll(`.video-check[data-group="${groupId}"]`)
    .forEach(cb => { cb.checked = master.checked; });
  updateCheckedCount();
};

window.updateCheckedCount = () => {
  const count = document.querySelectorAll('.video-check:checked').length;
  const el = document.getElementById('checkedCount');
  if (el) el.textContent = count ? `${count}개 선택됨` : '';
  const master = document.getElementById('checkAll');
  const all = document.querySelectorAll('.video-check').length;
  if (master) master.indeterminate = count > 0 && count < all;
};

function getCheckedIds() {
  return [...document.querySelectorAll('.video-check:checked')].map(cb => cb.dataset.id);
}

// 툴바 "전체선택" — 현재 필터에 보이는 모든 강의(접힌 그룹 포함) 선택/해제
window.toggleAllVideoChecks = (master) => {
  document.querySelectorAll('.video-check, .group-check').forEach(cb => { cb.checked = master.checked; });
  updateCheckedCount();
};

// ══ 단원순 자동배정 ══
// 선택한 강의만, 같은 카테고리(태그) 안에서
//   ① 교육과정 단원 순서 (2022 개정, 과목은 태그에서 판별)
//   ② 같은 단원 안에서는 제목의 숫자 순서 (1. → 2. → 10., 연속01 → 연속02)
// 로 정렬해 순서를 다시 매깁니다.
// 선택 안 한 강의는 원래 자리를 그대로 유지하고, 선택한 강의들끼리 그 자리들을 정렬 순서대로 나눠 갖습니다.
// 단원 키워드가 제목에 없으면 '단원 미확인'으로 해당 그룹 맨 뒤에 제목 순으로 배치됩니다.
// ※ 교재 목차가 바뀌거나 키워드를 추가하려면 아래 CURRICULUM_UNITS만 수정하면 됩니다.
const CURRICULUM_UNITS = {
  '공통수학1': [
    { name:'다항식', kw:['다항식의 연산','다항식의 덧셈','다항식의 곱셈','다항식의 나눗셈','곱셈공식','항등식','나머지정리','인수정리','조립제법','인수분해','다항식'] },
    { name:'방정식과 부등식', kw:['복소수','허수','켤레','판별식','근과 계수','이차방정식','이차함수','최대최소','최댓값','최솟값','삼차방정식','사차방정식','고차방정식','연립방정식','연립이차','부정방정식','일차부등식','연립부등식','절댓값','이차부등식','부등식','방정식'] },
    { name:'경우의 수', kw:['합의 법칙','곱의 법칙','경우의 수','순열','조합'] },
    { name:'행렬', kw:['행렬'] },
  ],
  '공통수학2': [
    { name:'도형의 방정식', kw:['두 점 사이의 거리','내분점','외분점','평면좌표','직선의 방정식','두 직선','점과 직선','원의 방정식','원과 직선','접선','평행이동','대칭이동','도형의 이동','좌표'] },
    { name:'집합과 명제', kw:['집합','부분집합','합집합','교집합','여집합','차집합','명제','진리집합','대우','필요조건','충분조건','절대부등식','산술','귀류법'] },
    { name:'함수와 그래프', kw:['함수','일대일','합성함수','역함수','유리함수','유리식','무리함수','무리식'] },
  ],
  '대수': [
    { name:'지수함수와 로그함수', kw:['거듭제곱근','지수법칙','지수','로그','상용로그','지수함수','로그함수','지수방정식','로그방정식','지수부등식','로그부등식'] },
    { name:'삼각함수', kw:['일반각','호도법','라디안','부채꼴','삼각함수','사인','코사인','탄젠트','삼각방정식','삼각부등식','사인법칙','코사인법칙','삼각형의 넓이'] },
    { name:'수열', kw:['수열','등차','등비','시그마','수열의 합','계차','군수열','귀납적','점화식','수학적 귀납법','귀납법'] },
  ],
  '미적분1': [
    { name:'함수의 극한과 연속', kw:['함수의 극한','극한','좌극한','우극한','연속','최대최소 정리','사잇값'] },
    { name:'미분', kw:['미분계수','평균변화율','순간변화율','미분가능','도함수','미분','접선','롤의 정리','평균값 정리','증가','감소','극대','극소','극값','그래프의 개형','최댓값','최솟값','방정식의 실근','부등식','속도','가속도'] },
    { name:'적분', kw:['부정적분','정적분','적분','넓이','정적분으로 정의된','속도와 거리','거리'] },
  ],
  '확통': [
    { name:'경우의 수', kw:['원순열','같은 것이 있는 순열','중복순열','중복조합','순열','조합','이항정리','이항계수','파스칼','분할','경우의 수'] },
    { name:'확률', kw:['확률의 뜻','확률의 덧셈','덧셈정리','여사건','조건부확률','독립','종속','독립시행','곱셈정리','확률'] },
    { name:'통계', kw:['확률변수','확률분포','이산','기댓값','평균','분산','표준편차','이항분포','연속확률','정규분포','표준정규','모집단','표본','추정','신뢰구간','통계'] },
  ],
  '미적분2': [
    { name:'수열의 극한', kw:['수열의 극한','수렴','발산','급수','등비급수','등비수열의 극한'] },
    { name:'미분법', kw:['지수함수의 극한','로그함수의 극한','삼각함수의 극한','지수함수의 미분','로그함수의 미분','삼각함수의 미분','덧셈정리','배각','몫의 미분','합성함수의 미분','매개변수','음함수','역함수의 미분','이계도함수','변곡점','오목','볼록','미분법','미분','접선','속도'] },
    { name:'적분법', kw:['치환적분','부분적분','여러 가지 함수의 적분','구분구적법','정적분과 급수','넓이','부피','입체','곡선의 길이','적분법','적분'] },
  ],
  '기하': [
    { name:'이차곡선', kw:['포물선','타원','쌍곡선','이차곡선','접선'] },
    { name:'공간도형과 공간좌표', kw:['직선과 평면','삼수선','정사영','공간좌표','공간도형','구의 방정식','이면각'] },
    { name:'벡터', kw:['벡터','내적','위치벡터','성분','직선의 방정식','원의 방정식'] },
  ],
};
const CURRICULUM_ALIAS = { '확률과통계':'확통', '미적분':'미적분1' };

const titleCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const curNorm = s => String(s || '').toLowerCase().replace(/[\s·・.\-_()[\]]/g, '');

// 태그에서 과목 판별 (예: 미적분1_세쌍둥이개념_송우찬 원장T → 미적분1 / 송팁_공통수학1 → 공통수학1)
function curriculumSubjectOfTag(tag) {
  const parts = String(tag || '').split('_');
  let s = parts[0] === '송팁' ? parts[1] : parts[0];
  s = CURRICULUM_ALIAS[s] || s;
  return CURRICULUM_UNITS[s] ? s : null;
}

// 제목에서 단원 찾기: 가장 긴 키워드 우선, 길이가 같으면 제목 앞쪽에 나온 키워드 우선
function curriculumUnitOf(subject, title) {
  if (!subject) return null;
  // 제목에 들어간 과목명(미적분1, 공통수학2 등)이 단원 키워드로 오인되지 않게 제거
  const t = curNorm(title).replace(/공통수학[12]|미적분[12]?|확률과통계|확통|대수|기하|세쌍둥이/g, ' ');
  let best = null;
  CURRICULUM_UNITS[subject].forEach((u, idx) => {
    u.kw.forEach(k => {
      const nk = curNorm(k);
      const pos = t.indexOf(nk);
      if (pos < 0) return;
      if (!best || nk.length > best.len || (nk.length === best.len && pos < best.pos)) {
        best = { idx, name: u.name, len: nk.length, pos };
      }
    });
  });
  return best;
}

window.autoOrderByTitle = async () => {
  const ids = new Set(getCheckedIds());
  if (!ids.size) { showToast('❌ 먼저 순서를 맞출 강의를 선택해주세요.'); return; }

  // 저장 안 한 제목 수정값이 있으면 그 값으로 판별
  const titleOf = v => (document.getElementById('title-' + v.id)?.value ?? v.title ?? '').trim();

  const byTag = new Map();
  videosCache.filter(v => ids.has(v.id)).forEach(v => {
    const tag = v.tag || '__no_tag__';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(v);
  });

  // 정렬 정보 계산
  const info = new Map(); // id → { unitIdx, unitName }
  const sortedByTag = new Map();
  const previewParts = [];
  let unmatchedTotal = 0;

  for (const [tag, list] of byTag) {
    const subject = curriculumSubjectOfTag(tag);
    list.forEach(v => {
      const u = curriculumUnitOf(subject, titleOf(v));
      info.set(v.id, { unitIdx: u ? u.idx : Infinity, unitName: u ? u.name : null });
    });
    const sorted = [...list].sort((a, b) =>
      info.get(a.id).unitIdx - info.get(b.id).unitIdx ||
      titleCollator.compare(titleOf(a), titleOf(b)));
    sortedByTag.set(tag, sorted);

    const label = tag === '__no_tag__' ? '카테고리 없음' : tag;
    if (!subject) {
      previewParts.push(`[${label}] ${list.length}개\n  · 단원표가 없는 카테고리 → 제목 번호 순으로 정렬`);
      continue;
    }
    const counts = [];
    CURRICULUM_UNITS[subject].forEach((u, i) => {
      const n = list.filter(v => info.get(v.id).unitIdx === i).length;
      if (n) counts.push(`${i + 1}) ${u.name} ${n}개`);
    });
    const unmatched = sorted.filter(v => info.get(v.id).unitIdx === Infinity);
    unmatchedTotal += unmatched.length;
    previewParts.push(`[${label}] ${list.length}개\n  · ${counts.join(' → ') || '단원 일치 없음'}` +
      (unmatched.length
        ? `\n  ⚠️ 단원 미확인 ${unmatched.length}개 (맨 뒤 배치): ${unmatched.slice(0, 3).map(titleOf).join(' / ')}${unmatched.length > 3 ? ' …' : ''}`
        : ''));
  }

  if (!confirm(`선택한 ${ids.size}개 강의를 [교육과정 단원 순서 → 제목 번호 순서]로 다시 매깁니다.\n(선택 안 한 강의 순서는 그대로 유지)\n\n${previewParts.join('\n\n')}` +
    (unmatchedTotal ? `\n\n※ 단원 미확인 강의는 제목에 단원 키워드가 없는 경우예요. 저장 후 순서 칸에서 직접 조정할 수 있어요.` : '') +
    `\n\n진행할까요?`)) return;

  const writes = [];
  try {
    for (const [tag, sortedSel] of sortedByTag) {
      // 그룹 전체를 현재 순서대로 나열 (순서 없는 강의는 뒤로)
      const group = (tag === '__no_tag__' ? videosCache.filter(v => !v.tag) : videosCache.filter(v => v.tag === tag))
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => {
          const oa = a.v.order != null ? Number(a.v.order) : Infinity;
          const ob = b.v.order != null ? Number(b.v.order) : Infinity;
          return oa - ob || a.idx - b.idx;
        })
        .map(x => x.v);

      // 선택한 강의가 차지하던 자리들을 정렬 순서대로 채움
      const slots = [];
      group.forEach((v, i) => { if (ids.has(v.id)) slots.push(i); });
      slots.forEach((slot, k) => { group[slot] = sortedSel[k]; });

      // 1번부터 빈틈없이 재부여 (바뀐 것만 저장)
      group.forEach((v, i) => {
        const newOrder = i + 1;
        if (v.order !== newOrder) {
          writes.push(updateDoc(doc(db, 'videos', v.id), { order: newOrder }).then(() => { v.order = newOrder; }));
        }
      });
    }
    await Promise.all(writes);

    // 열려 있던 그룹 유지하며 다시 그리기
    const openGroups = [...document.querySelectorAll('[id^="vgrp-"]')].filter(el => el.style.display !== 'none').map(el => el.id);
    renderVideos();
    openGroups.forEach(id => {
      const el = document.getElementById(id);
      const arrow = document.getElementById('arrow-' + id);
      if (el) el.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    });
    showToast(`✅ 단원순 자동배정 완료 (${writes.length}개 순서 변경)`);
  } catch (e) {
    showToast('❌ 자동배정 실패: ' + e.message);
    await loadVideos();
  }
};

window.bulkDelete = async () => {
  const ids = getCheckedIds();
  if (!ids.length) { showMsg('videoMsg', '선택된 강의가 없습니다.', 'error'); return; }
  if (!confirm(`선택한 ${ids.length}개 강의를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
  try {
    await Promise.all(ids.map(id => deleteDoc(doc(db, 'videos', id))));
    showMsg('videoMsg', `✅ ${ids.length}개 삭제 완료`, 'success');
    await loadVideos();
  } catch(e) {
    showMsg('videoMsg', '오류: ' + e.message, 'error');
  }
};

// 토스트 알림
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// 같은 태그(카테고리) 그룹 안에서 순서를 1번부터 빈틈없이 재정렬.
// edits: [[videoId, 원하는순서(Number|null)], ...] — 방금 사용자가 입력한 값(우선순위 높음)
async function renumberTagGroup(tag, edits) {
  const editMap = new Map(edits);
  const groupItems = videosCache.filter(v => v.tag === tag);
  const writes = [];

  // 1) 이번에 명시적으로 "미지정(빈칸)"으로 바꾼 항목은 번호 부여 대상에서 제외
  editMap.forEach((num, id) => {
    if (num == null) {
      const v = groupItems.find(x => x.id === id);
      if (v && v.order != null) {
        writes.push(updateDoc(doc(db, 'videos', id), { order: null }).then(() => { v.order = null; }));
      }
    }
  });

  // 2) 번호를 가져야 할 나머지 항목들을 "원하는 순서" 기준으로 정렬 후 1..N 재부여
  //    같은 번호를 지정하면 방금 수정한 항목이 그 번호를 차지하고 기존 항목은 뒤로 밀림
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
      writes.push(updateDoc(doc(db, 'videos', item.v.id), { order: newOrder }).then(() => { item.v.order = newOrder; }));
    }
  });

  await Promise.all(writes);
}

// 행 저장 (순서 + 제목 함께)
window.saveRow = async (id) => {
  const orderInput = document.getElementById('order-' + id);
  const titleInput = document.getElementById('title-' + id);
  const orderVal = orderInput ? orderInput.value.trim() : '';
  const orderNum = orderVal === '' ? null : Number(orderVal);
  const title = titleInput ? titleInput.value.trim() : '';

  if (!title) { showToast('❌ 제목을 입력해주세요.'); return; }

  try {
    const cached = videosCache.find(v => v.id === id);
    const tag = cached ? cached.tag : null;

    await updateDoc(doc(db, 'videos', id), { title });
    if (cached) cached.title = title;

    if (tag) {
      await renumberTagGroup(tag, [[id, orderNum]]);
    } else {
      await updateDoc(doc(db, 'videos', id), { order: orderNum });
      if (cached) cached.order = orderNum;
    }
    showToast('✅ 저장 완료');

    const checkbox = document.querySelector(`.video-check[data-id="${id}"]`);
    if (checkbox) {
      const groupEl = document.getElementById(checkbox.dataset.group);
      if (groupEl) {
        const rows = [...groupEl.querySelectorAll('.assign-item')];
        rows.sort((a, b) => {
          const vA = videosCache.find(v => v.id === a.querySelector('.video-check')?.dataset.id);
          const vB = videosCache.find(v => v.id === b.querySelector('.video-check')?.dataset.id);
          const oa = vA?.order != null ? Number(vA.order) : 9999;
          const ob = vB?.order != null ? Number(vB.order) : 9999;
          return oa - ob;
        });
        rows.forEach(row => groupEl.appendChild(row));
      }
    }
  } catch(e) {
    showToast('❌ 저장 실패: ' + e.message);
  }
};

window.saveOrder = async (id) => {
  const input = document.getElementById('order-' + id);
  if (!input) return;
  const val = input.value.trim();
  const orderNum = val === '' ? null : Number(val);
  try {
    const cached = videosCache.find(v => v.id === id);
    const tag = cached ? cached.tag : null;
    if (tag) {
      await renumberTagGroup(tag, [[id, orderNum]]);
    } else {
      await updateDoc(doc(db, 'videos', id), { order: orderNum });
      if (cached) cached.order = orderNum;
    }
    showToast(`✅ 순서 저장 완료 (${orderNum != null ? orderNum + '번' : '미지정'})`);

    // 해당 아이템이 속한 그룹 컨테이너 찾아서 내부 순서만 재정렬
    const checkbox = document.querySelector(`.video-check[data-id="${id}"]`);
    if (checkbox) {
      const groupId = checkbox.dataset.group;
      const groupEl = document.getElementById(groupId);
      if (groupEl) {
        // 그룹 내 모든 아이템을 order 기준으로 재정렬
        const rows = [...groupEl.querySelectorAll('.assign-item')];
        rows.sort((a, b) => {
          const idA = a.querySelector('.video-check')?.dataset.id;
          const idB = b.querySelector('.video-check')?.dataset.id;
          const vA = videosCache.find(v => v.id === idA);
          const vB = videosCache.find(v => v.id === idB);
          const oa = vA?.order != null ? Number(vA.order) : 9999;
          const ob = vB?.order != null ? Number(vB.order) : 9999;
          return oa - ob;
        });
        rows.forEach(row => groupEl.appendChild(row));
      }
    }
  } catch(e) {
    showToast('❌ 저장 실패: ' + e.message);
  }
};

// 일괄 저장 (펼쳐진 그룹 내 순서 + 제목 한번에 저장)
window.bulkSaveOrder = async () => {
  const inputs = document.querySelectorAll('input[id^="order-"]');
  if (!inputs.length) { showToast('저장할 항목이 없습니다.'); return; }
  let saved = 0;
  const titlePromises = [];
  const editsByTag = new Map(); // tag(또는 '__no_tag__') -> [[id, orderNum], ...]

  inputs.forEach(input => {
    const id = input.id.replace('order-', '');
    const val = input.value.trim();
    const orderNum = val === '' ? null : Number(val);
    const titleInput = document.getElementById('title-' + id);
    const title = titleInput ? titleInput.value.trim() : null;
    const cached = videosCache.find(v => v.id === id);
    if (!cached) return;

    const orderChanged = !(cached.order == null && orderNum == null) && cached.order !== orderNum;
    const titleChanged = !!title && cached.title !== title;
    if (!orderChanged && !titleChanged) return;

    if (titleChanged) {
      titlePromises.push(
        updateDoc(doc(db, 'videos', id), { title }).then(() => { cached.title = title; })
      );
    }
    if (orderChanged) {
      const tag = cached.tag || '__no_tag__';
      if (!editsByTag.has(tag)) editsByTag.set(tag, []);
      editsByTag.get(tag).push([id, orderNum]);
    }
    saved++;
  });

  try {
    await Promise.all(titlePromises);
    for (const [tag, edits] of editsByTag) {
      if (tag === '__no_tag__') {
        await Promise.all(edits.map(([id, num]) =>
          updateDoc(doc(db, 'videos', id), { order: num }).then(() => {
            const c = videosCache.find(v => v.id === id);
            if (c) c.order = num;
          })
        ));
      } else {
        await renumberTagGroup(tag, edits);
      }
    }
    document.querySelectorAll('[id^="vgrp-"]').forEach(groupEl => {
      if (groupEl.style.display === 'none') return;
      const rows = [...groupEl.querySelectorAll('.assign-item')];
      rows.sort((a, b) => {
        const idA = a.querySelector('.video-check')?.dataset.id;
        const idB = b.querySelector('.video-check')?.dataset.id;
        const vA = videosCache.find(v => v.id === idA);
        const vB = videosCache.find(v => v.id === idB);
        const oa = vA?.order != null ? Number(vA.order) : 9999;
        const ob = vB?.order != null ? Number(vB.order) : 9999;
        return oa - ob;
      });
      rows.forEach(row => groupEl.appendChild(row));
    });
    showToast(`✅ ${saved}개 일괄 저장 완료`);
  } catch(e) {
    showToast('❌ 일부 저장 실패: ' + e.message);
  }
};

window.changeVideoTag = async (id) => {
  const sel = document.getElementById('tag-sel-' + id);
  if (!sel) return;
  const newTag = sel.value;
  try {
    await updateDoc(doc(db, 'videos', id), { tag: newTag });
    showMsg('videoMsg', `✅ 태그가 "${newTag}"로 변경되었습니다.`, 'success');
    await loadVideos();
  } catch(e) {
    showMsg('videoMsg', '오류: ' + e.message, 'error');
  }
};

// ── 폴더 선택기 ──
const FOLDER_TREE = [
  { group:'고1', folders:['공통수학1_세쌍둥이개념_송우찬 원장T','공통수학1_세쌍둥이개념_송문찬 원장T','공통수학1_세쌍둥이개념_공민정T','공통수학1_세쌍둥이심화_송우찬 원장T','공통수학1_세쌍둥이심화_송문찬 원장T','공통수학1_세쌍둥이심화_공민정T','공통수학1_세쌍둥이라이트_송우찬 원장T','공통수학1_세쌍둥이라이트_송문찬 원장T','공통수학1_세쌍둥이라이트_공민정T','공통수학1_세쌍둥이파이널','공통수학2_세쌍둥이개념_송우찬 원장T','공통수학2_세쌍둥이개념_송문찬 원장T','공통수학2_세쌍둥이개념_공민정T','공통수학2_세쌍둥이심화_송우찬 원장T','공통수학2_세쌍둥이심화_송문찬 원장T','공통수학2_세쌍둥이심화_공민정T','공통수학2_세쌍둥이라이트_송우찬 원장T','공통수학2_세쌍둥이라이트_송문찬 원장T','공통수학2_세쌍둥이라이트_공민정T','공통수학2_세쌍둥이파이널','대수_세쌍둥이라이트_송우찬 원장T','대수_세쌍둥이라이트_송문찬 원장T'] },
  { group:'고2', folders:['대수_세쌍둥이개념_송우찬 원장T','대수_세쌍둥이개념_송문찬 원장T','대수_세쌍둥이심화_송우찬 원장T','대수_세쌍둥이심화_송문찬 원장T','대수_세쌍둥이파이널','미적분1_세쌍둥이개념_송우찬 원장T','미적분1_세쌍둥이개념_송문찬 원장T','미적분1_세쌍둥이심화_송우찬 원장T','미적분1_세쌍둥이심화_송문찬 원장T','미적분1_세쌍둥이라이트_송우찬 원장T','미적분1_세쌍둥이라이트_송문찬 원장T','미적분1_세쌍둥이파이널','확통_세쌍둥이개념_송우찬 원장T','확통_세쌍둥이개념_송문찬 원장T','확통_세쌍둥이파이널','미적분2_세쌍둥이라이트_송우찬 원장T','미적분2_세쌍둥이라이트_송문찬 원장T'] },
  { group:'고3', folders:['미적분2_세쌍둥이개념_송우찬 원장T','미적분2_세쌍둥이개념_송문찬 원장T','미적분2_세쌍둥이심화_송우찬 원장T','미적분2_세쌍둥이심화_송문찬 원장T','미적분2_세쌍둥이파이널','기하_세쌍둥이개념_송우찬 원장T','기하_세쌍둥이개념_송문찬 원장T','기하_세쌍둥이파이널'] },
  { group:'기출해설', folders:['기출_고1_2025','기출_고1_2024','기출_고1_2023','기출_고1_2022','기출_고1_2021','기출_고2_2025','기출_고2_2024','기출_고2_2023','기출_고2_2022','기출_고2_2021','기출_고3_2025','기출_고3_2024','기출_고3_2023','기출_고3_2022','기출_고3_2021','기출_고1_2025_1중간','기출_고1_2025_1기말','기출_고1_2025_2중간','기출_고1_2025_2기말','기출_고1_2024_1중간','기출_고1_2024_1기말','기출_고1_2024_2중간','기출_고1_2024_2기말','기출_고1_2023_1중간','기출_고1_2023_1기말','기출_고1_2023_2중간','기출_고1_2023_2기말','기출_고1_2022_1중간','기출_고1_2022_1기말','기출_고1_2022_2중간','기출_고1_2022_2기말','기출_고1_2021_1중간','기출_고1_2021_1기말','기출_고1_2021_2중간','기출_고1_2021_2기말','기출_고2_2025_1중간','기출_고2_2025_1기말','기출_고2_2025_2중간','기출_고2_2025_2기말','기출_고2_2024_1중간','기출_고2_2024_1기말','기출_고2_2024_2중간','기출_고2_2024_2기말','기출_고2_2023_1중간','기출_고2_2023_1기말','기출_고2_2023_2중간','기출_고2_2023_2기말','기출_고2_2022_1중간','기출_고2_2022_1기말','기출_고2_2022_2중간','기출_고2_2022_2기말','기출_고2_2021_1중간','기출_고2_2021_1기말','기출_고2_2021_2중간','기출_고2_2021_2기말','기출_고3_2025_1중간','기출_고3_2025_1기말','기출_고3_2025_2중간','기출_고3_2025_2기말','기출_고3_2024_1중간','기출_고3_2024_1기말','기출_고3_2024_2중간','기출_고3_2024_2기말','기출_고3_2023_1중간','기출_고3_2023_1기말','기출_고3_2023_2중간','기출_고3_2023_2기말','기출_고3_2022_1중간','기출_고3_2022_1기말','기출_고3_2022_2중간','기출_고3_2022_2기말','기출_고3_2021_1중간','기출_고3_2021_1기말','기출_고3_2021_2중간','기출_고3_2021_2기말'] },
  { group:'수리논술', folders:['수리논술'] },
  { group:'선생님전용', folders:['선생님전용'] },
  { group:'중등', folders:['중1','중2','중3'] },
  { group:'주간 클리어', folders:['주간클리어_중1','주간클리어_중2','주간클리어_중3'] },
  { group:'보충강의실', folders:['보충_평촌_송우찬 원장T','보충_평촌_송문찬 원장T','보충_평촌_조현주 부원장T','보충_평촌_김영진T','보충_평촌_신민훈T','보충_평촌_장미현T','보충_평촌_공민정T','보충_산본_송우찬 원장T','보충_산본_송문찬 원장T','보충_산본_조현주 부원장T','보충_산본_공민정T','보충_산본_장미현T','보충_산본_김영진T','보충_산본_신민훈T','보충_산본_박예지T'] },
  { group:"Song's Tip", folders:['송팁_공통수학1','송팁_공통수학2'] },
];

let _checkedFolders = new Set();
window._checkedFolders = _checkedFolders;

function isFolderChecked(f) { return _checkedFolders.has(f); }

function renderFolderAccordion(q='') {
  const el = document.getElementById('folderAccordion');
  if (!el) return;
  const ql = q.toLowerCase();
  let html = '';
  FOLDER_TREE.forEach((group, gi) => {
    const filtered = q ? group.folders.filter(f => f.toLowerCase().includes(ql)) : group.folders;
    if (!filtered.length) return;
    const groupId = 'fgrp' + gi;
    const allChecked = filtered.every(f => isFolderChecked(f));
    html += `
      <div style="border-bottom:1px solid rgba(30,24,56,0.06);">
        <div onclick="toggleFolderGroup('${groupId}')"
          style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;
            background:rgba(30,24,56,0.02);"
          onmouseover="this.style.background='rgba(245,197,24,0.06)'"
          onmouseout="this.style.background='rgba(30,24,56,0.02)'">
          <input type="checkbox" class="folder-group-check" data-gi="${gi}"
            ${allChecked&&filtered.length?'checked':''}
            onclick="event.stopPropagation();toggleFolderGroupCheck(this,${gi})"
            style="accent-color:var(--gold);">
          <span style="font-size:12px;font-weight:700;color:var(--purple, #5B3FA6);flex:1;">${group.group}</span>
          <span style="font-size:11px;color:var(--muted);">${filtered.length}개</span>
          <span id="arrow-${groupId}" style="color:var(--purple, #5B3FA6);font-size:10px;transition:transform 0.2s;">▼</span>
        </div>
        <div id="${groupId}" style="display:${q?'block':'none'};">
          ${filtered.map(f => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 12px 6px 28px;
              cursor:pointer;border-top:1px solid rgba(30,24,56,0.04);font-size:12px;"
              onmouseover="this.style.background='rgba(30,24,56,0.03)'"
              onmouseout="this.style.background=''">
              <input type="checkbox" class="folder-check" value="${f}"
                ${isFolderChecked(f)?'checked':''}
                onchange="onFolderCheckChange(this)"
                style="accent-color:var(--gold);flex-shrink:0;">
              <span style="color:var(--off-white);">${f}</span>
            </label>`).join('')}
        </div>
      </div>`;
  });
  el.innerHTML = html || '<div style="padding:12px;font-size:12px;color:var(--muted);">검색 결과 없음</div>';
  updateFolderCount();
}
window.renderFolderAccordion = renderFolderAccordion;

function onFolderCheckChange(cb) {
  if (cb.checked) _checkedFolders.add(cb.value);
  else _checkedFolders.delete(cb.value);
  updateFolderCount();
}
window.onFolderCheckChange = onFolderCheckChange;

window.toggleFolderGroup = (id) => {
  const el = document.getElementById(id);
  const arrow = document.getElementById('arrow-' + id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
};

window.toggleFolderGroupCheck = (master, gi) => {
  const group = FOLDER_TREE[gi];
  if (!group) return;
  group.folders.forEach(f => { if (master.checked) _checkedFolders.add(f); else _checkedFolders.delete(f); });
  renderFolderAccordion(document.getElementById('folderSearchInput')?.value || '');
};

window.toggleAllFolders = (master) => {
  FOLDER_TREE.forEach(g => g.folders.forEach(f => { if (master.checked) _checkedFolders.add(f); else _checkedFolders.delete(f); }));
  renderFolderAccordion(document.getElementById('folderSearchInput')?.value || '');
};

window.filterFolderList = () => {
  renderFolderAccordion(document.getElementById('folderSearchInput')?.value || '');
};

function updateFolderCount() {
  const el = document.getElementById('folderSelectedCount');
  if (el) el.textContent = _checkedFolders.size ? `${_checkedFolders.size}개 선택` : '';
}

// ── Vimeo 동기화 (폴더 기준) ──
const VIMEO_TOKEN = 'b94a395d9de9ac2f507bf8f9c2563d1b';

const KNOWN_TAGS_SYNC = [
  '중1','중2','중3',
  '주간클리어_중1','주간클리어_중2','주간클리어_중3',
  // 공통수학1
  '공통수학1_세쌍둥이개념_송우찬 원장T','공통수학1_세쌍둥이개념_송문찬 원장T','공통수학1_세쌍둥이개념_공민정T',
  '공통수학1_세쌍둥이심화_송우찬 원장T','공통수학1_세쌍둥이심화_송문찬 원장T','공통수학1_세쌍둥이심화_공민정T',
  '공통수학1_세쌍둥이라이트_송우찬 원장T','공통수학1_세쌍둥이라이트_송문찬 원장T','공통수학1_세쌍둥이라이트_공민정T',
  '공통수학1_세쌍둥이파이널',
  // 공통수학2
  '공통수학2_세쌍둥이개념_송우찬 원장T','공통수학2_세쌍둥이개념_송문찬 원장T','공통수학2_세쌍둥이개념_공민정T',
  '공통수학2_세쌍둥이심화_송우찬 원장T','공통수학2_세쌍둥이심화_송문찬 원장T','공통수학2_세쌍둥이심화_공민정T',
  '공통수학2_세쌍둥이라이트_송우찬 원장T','공통수학2_세쌍둥이라이트_송문찬 원장T','공통수학2_세쌍둥이라이트_공민정T',
  '공통수학2_세쌍둥이파이널',
  // 대수
  '대수_세쌍둥이개념_송우찬 원장T','대수_세쌍둥이개념_송문찬 원장T',
  '대수_세쌍둥이심화_송우찬 원장T','대수_세쌍둥이심화_송문찬 원장T',
  '대수_세쌍둥이라이트_송우찬 원장T','대수_세쌍둥이라이트_송문찬 원장T',
  '대수_세쌍둥이파이널',
  // 미적분1
  '미적분1_세쌍둥이개념_송우찬 원장T','미적분1_세쌍둥이개념_송문찬 원장T',
  '미적분1_세쌍둥이심화_송우찬 원장T','미적분1_세쌍둥이심화_송문찬 원장T',
  '미적분1_세쌍둥이라이트_송우찬 원장T','미적분1_세쌍둥이라이트_송문찬 원장T',
  '미적분1_세쌍둥이파이널',
  // 확통
  '확통_세쌍둥이개념_송우찬 원장T','확통_세쌍둥이개념_송문찬 원장T',
  '확통_세쌍둥이파이널',
  // 미적분2
  '미적분2_세쌍둥이개념_송우찬 원장T','미적분2_세쌍둥이개념_송문찬 원장T',
  '미적분2_세쌍둥이심화_송우찬 원장T','미적분2_세쌍둥이심화_송문찬 원장T',
  '미적분2_세쌍둥이라이트_송우찬 원장T','미적분2_세쌍둥이라이트_송문찬 원장T',
  '미적분2_세쌍둥이파이널',
  // 기하
  '기하_세쌍둥이개념_송우찬 원장T','기하_세쌍둥이개념_송문찬 원장T',
  '기하_세쌍둥이파이널',
  // 기출해설 — 연도 전체 (구분 없는 기존 영상)
  '기출_고1_2025','기출_고1_2024','기출_고1_2023','기출_고1_2022','기출_고1_2021',
  '기출_고2_2025','기출_고2_2024','기출_고2_2023','기출_고2_2022','기출_고2_2021',
  '기출_고3_2025','기출_고3_2024','기출_고3_2023','기출_고3_2022','기출_고3_2021',
  // 기출해설 — 시험 구분
  '기출_고1_2025_1중간','기출_고1_2025_1기말','기출_고1_2025_2중간','기출_고1_2025_2기말',
  '기출_고1_2024_1중간','기출_고1_2024_1기말','기출_고1_2024_2중간','기출_고1_2024_2기말',
  '기출_고1_2023_1중간','기출_고1_2023_1기말','기출_고1_2023_2중간','기출_고1_2023_2기말',
  '기출_고1_2022_1중간','기출_고1_2022_1기말','기출_고1_2022_2중간','기출_고1_2022_2기말',
  '기출_고1_2021_1중간','기출_고1_2021_1기말','기출_고1_2021_2중간','기출_고1_2021_2기말',
  '기출_고2_2025_1중간','기출_고2_2025_1기말','기출_고2_2025_2중간','기출_고2_2025_2기말',
  '기출_고2_2024_1중간','기출_고2_2024_1기말','기출_고2_2024_2중간','기출_고2_2024_2기말',
  '기출_고2_2023_1중간','기출_고2_2023_1기말','기출_고2_2023_2중간','기출_고2_2023_2기말',
  '기출_고2_2022_1중간','기출_고2_2022_1기말','기출_고2_2022_2중간','기출_고2_2022_2기말',
  '기출_고2_2021_1중간','기출_고2_2021_1기말','기출_고2_2021_2중간','기출_고2_2021_2기말',
  '기출_고3_2025_1중간','기출_고3_2025_1기말','기출_고3_2025_2중간','기출_고3_2025_2기말',
  '기출_고3_2024_1중간','기출_고3_2024_1기말','기출_고3_2024_2중간','기출_고3_2024_2기말',
  '기출_고3_2023_1중간','기출_고3_2023_1기말','기출_고3_2023_2중간','기출_고3_2023_2기말',
  '기출_고3_2022_1중간','기출_고3_2022_1기말','기출_고3_2022_2중간','기출_고3_2022_2기말',
  '기출_고3_2021_1중간','기출_고3_2021_1기말','기출_고3_2021_2중간','기출_고3_2021_2기말',
  '수리논술',
  '선생님전용',
  '보충_평촌_송우찬 원장T','보충_평촌_송문찬 원장T','보충_평촌_조현주 부원장T','보충_평촌_김영진T','보충_평촌_신민훈T','보충_평촌_장미현T','보충_평촌_공민정T',
  '보충_산본_송우찬 원장T','보충_산본_송문찬 원장T','보충_산본_조현주 부원장T','보충_산본_공민정T','보충_산본_장미현T','보충_산본_김영진T','보충_산본_신민훈T','보충_산본_박예지T',
  // Song's Tip
  '송팁_공통수학1','송팁_공통수학2',
];

let syncCandidates = [];

// Vimeo 폴더(folder) 목록 가져오기
async function fetchVimeoFolders() {
  let folders = [];

  // 개인 라이브러리 폴더
  let url = 'https://api.vimeo.com/me/projects?per_page=100&page=1';
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
    if (!res.ok) break;
    const data = await res.json();
    folders = folders.concat(data.data || []);
    url = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
  }

  // 팀 라이브러리 폴더
  try {
    // 팀 목록 가져오기
    const teamRes = await fetch('https://api.vimeo.com/me/teams?per_page=10', {
      headers: { Authorization: `bearer ${VIMEO_TOKEN}` }
    });
    if (teamRes.ok) {
      const teamData = await teamRes.json();
      const teams = teamData.data || [];
      for (const team of teams) {
        const teamUri = team.uri; // 예: /teams/12345
        // 팀 라이브러리 폴더 목록
        let teamUrl = `https://api.vimeo.com${teamUri}/folders?per_page=100&page=1`;
        while (teamUrl) {
          const res = await fetch(teamUrl, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
          if (!res.ok) {
            // folders 안되면 projects로 시도
            let altUrl = `https://api.vimeo.com${teamUri}/projects?per_page=100&page=1`;
            const res2 = await fetch(altUrl, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
            if (res2.ok) {
              const data2 = await res2.json();
              folders = folders.concat(data2.data || []);
            }
            break;
          }
          const data = await res.json();
          folders = folders.concat(data.data || []);
          teamUrl = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
        }
      }
    }
  } catch(e) {
    console.log('팀 라이브러리 폴더 로드 실패:', e.message);
  }

  // 주간 클리어 폴더 안의 하위 폴더(중1·중2·중3)도 확실히 포함
  for (const root of folders.filter(f => WC_ROOT_RE.test(f.name || ''))) {
    try {
      const subs = await fetchWcSubfolders(root.uri);
      subs.forEach(sf => { sf._wcParent = true; });
      folders = folders.concat(subs);
    } catch (e) { console.log('주간 클리어 하위 폴더 로드 실패:', e.message); }
  }
  // 같은 폴더가 두 번 들어오면 하나로 (주간 클리어 표시가 있는 쪽 우선)
  const byId = new Map();
  folders.forEach(f => {
    const id = vimeoFolderId(f.uri);
    const prev = byId.get(id);
    if (!prev || f._wcParent) byId.set(id, f);
  });
  return [...byId.values()];
}

// ── 주간 클리어 (Weekly Clear) ──
// 비메오 폴더: 「주간 클리어(Weekly Clear)」 안에 하위 폴더 중1·중2·중3
// 강의 카테고리(태그): 주간클리어_중1 / 주간클리어_중2 / 주간클리어_중3
const WC_ROOT_RE = /주간\s*클리어|weekly\s*clear/i;
const WC_TAG_PREFIX = '주간클리어_';
function vimeoFolderId(uri) { return String(uri || '').split('/').filter(Boolean).pop(); }
async function fetchWcSubfolders(rootUri) {
  let out = [];
  let url = `https://api.vimeo.com${rootUri}/items?per_page=100&page=1`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
    if (!res.ok) break;
    const data = await res.json();
    (data.data || []).forEach(it => { if (it.type === 'folder' && it.folder) out.push(it.folder); });
    url = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
  }
  return out;
}
// 폴더 → 강의 카테고리(태그). 주간 클리어 안의 '중1' 폴더는 일반 '중1'과 구분해서 주간클리어_중1
function vimeoFolderTag(f) {
  const name = String(f?.name || '').trim();
  const anc = f?.metadata?.connections?.ancestor_path || [];
  const inWc = !!f?._wcParent || anc.some(a => WC_ROOT_RE.test(a?.name || ''));
  if (inWc) {
    const g = name.replace(/\s+/g, '').match(/중[123]/);
    return g ? WC_TAG_PREFIX + g[0] : WC_TAG_PREFIX + name.replace(/\s+/g, '');
  }
  return name;
}
// 주간 클리어 하위 폴더 ID → { tag, uri } (업로드 때 폴더 표시·카테고리 바로잡기용)
let _wcFolderMapCache = null;
async function getWcFolderMap(force) {
  if (_wcFolderMapCache && !force) return _wcFolderMapCache;
  const map = new Map();
  const all = await fetchVimeoFolders();
  all.forEach(f => { const t = vimeoFolderTag(f); if (t.startsWith(WC_TAG_PREFIX)) map.set(vimeoFolderId(f.uri), { tag: t, uri: f.uri }); });
  _wcFolderMapCache = map;
  return map;
}
window.getWcFolderMap = getWcFolderMap;

// 특정 폴더의 영상 목록 가져오기
async function fetchFolderVideos(folderUri) {
  let videos = [];
  // folderUri 예: /users/12345678/projects/9876543
  let url = `https://api.vimeo.com${folderUri}/videos?fields=uri,name,created_time&per_page=100&page=1`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `bearer ${VIMEO_TOKEN}` }
    });
    if (!res.ok) break;
    const data = await res.json();
    videos = videos.concat(data.data || []);
    url = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
  }
  return videos;
}

// 계정 전체 영상 목록 가져오기 (폴더 무관)
async function fetchAllAccountVideos() {
  let videos = [];
  let url = 'https://api.vimeo.com/me/videos?fields=uri,name,created_time&per_page=100&page=1';
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `bearer ${VIMEO_TOKEN}` }
    });
    if (!res.ok) break;
    const data = await res.json();
    videos = videos.concat(data.data || []);
    url = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
  }
  return videos;
}

window.syncVimeo = async () => {
  const statusEl  = document.getElementById('syncStatus');
  const previewEl = document.getElementById('syncPreview');
  previewEl.style.display = 'none';
  syncCandidates = [];

  // 선택된 폴더 목록 (없으면 전체)
  // 체크된 폴더 DOM에서 직접 읽기
  const checkedBoxes = [...document.querySelectorAll('.folder-check:checked')].map(cb => cb.value);
  const targetFolders = checkedBoxes.length > 0 ? checkedBoxes : null;

  statusEl.textContent = '⏳ Vimeo 폴더 목록 불러오는 중...';

  try {
    const allFolders = await fetchVimeoFolders();

    // 지정된 폴더명만 필터 (미입력 시 KNOWN_TAGS_SYNC 전체)
    const matchedFolders = allFolders.filter(f => {
      const t = vimeoFolderTag(f);
      return targetFolders ? targetFolders.includes(t) : KNOWN_TAGS_SYNC.includes(t);
    });

    if (!matchedFolders.length) {
      statusEl.textContent = '⚠️ 입력한 폴더명과 일치하는 Vimeo 폴더가 없습니다.';
      return;
    }

    const existingIds = new Set(videosCache.map(v => v.vimeoId));
    const foundIds = new Set();

    // 지정 폴더 영상
    for (const folder of matchedFolders) {
      const folderTag = vimeoFolderTag(folder);
      statusEl.textContent = `⏳ "${folderTag}" 확인 중...`;
      const videos = await fetchFolderVideos(folder.uri);
      for (const v of videos) {
        const vimeoId = v.uri.replace('/videos/', '');
        foundIds.add(vimeoId);
        if (existingIds.has(vimeoId)) continue;
        const date = v.created_time ? v.created_time.slice(0,7).replace('-','.') : '';
        syncCandidates.push({ vimeoId, title: v.name, tag: folderTag, date });
      }
    }

    // 폴더 미지정 영상 (루트) — 전체 모드일 때만
    if (!targetFolders) {
      statusEl.textContent = '⏳ 폴더 미지정 영상 확인 중...';
      const allVideos = await fetchAllAccountVideos();
      for (const v of allVideos) {
        const vimeoId = v.uri.replace('/videos/', '');
        if (existingIds.has(vimeoId) || foundIds.has(vimeoId)) continue;
        const date = v.created_time ? v.created_time.slice(0,7).replace('-','.') : '';
        syncCandidates.push({ vimeoId, title: v.name, tag: '', date });
      }
    }

    if (!syncCandidates.length) {
      statusEl.textContent = `✅ 새로 추가할 영상이 없습니다. (${matchedFolders.length}개 폴더 확인 완료)`;
      return;
    }

    statusEl.textContent = '';
    renderSyncPreview(matchedFolders.length);

  } catch(e) {
    statusEl.textContent = '';
    showMsg('syncMsg', '오류: ' + e.message, 'error');
  }
};

// ── Vimeo 정리: Vimeo에서 삭제된 영상을 홈페이지 목록에서 제거 ──
// (Vimeo 영상은 절대 지우지 않습니다. 홈페이지 목록(파이어베이스)만 정리합니다)
let orphanCandidates = [];

const MISSING_SRC_LABEL = {
  videos: '강의 영상', promoVideos: '홍보영상', apexVideos: '에이펙스 영상',
  consultVideo: '상담 안내 영상', lounge: '상담 샘플강의(수업 미리보기)'
};

// 홈페이지에 등록된 Vimeo 영상 전부 (어디에 등록됐는지 포함)
async function collectHomepageVideoRefs() {
  const refs = [];
  const idOf = (v) => String(v ?? '').replace(/\D/g, '');
  const vs = await getDocs(collection(db, 'videos'));
  vs.forEach(d => { const x = d.data(); const id = idOf(x.vimeoId); if (id) refs.push({ src: 'videos', docId: d.id, vimeoId: id, title: x.title || '', tag: x.tag || '' }); });
  try { const ps = await getDocs(collection(db, 'promoVideos')); ps.forEach(d => { const x = d.data(); const id = idOf(x.vimeoId); if (id) refs.push({ src: 'promoVideos', docId: d.id, vimeoId: id, title: x.title || '', tag: '' }); }); } catch(e) {}
  try { const as = await getDocs(collection(db, 'apexVideos')); as.forEach(d => { const x = d.data(); const id = idOf(x.vimeoId); if (id) refs.push({ src: 'apexVideos', docId: d.id, vimeoId: id, title: x.title || '', tag: '' }); }); } catch(e) {}
  try {
    const cv = await getDoc(doc(db, 'consultConfig', 'video'));
    if (cv.exists()) { const id = idOf(cv.data().vimeoId); if (id) refs.push({ src: 'consultVideo', docId: 'video', vimeoId: id, title: cv.data().title || '', tag: '' }); }
    const lg = await getDoc(doc(db, 'consultConfig', 'lounge'));
    if (lg.exists()) (lg.data().videos || []).forEach(v => { const id = idOf(v.vimeoId); if (id) refs.push({ src: 'lounge', docId: 'lounge', vimeoId: id, title: v.title || '', tag: '' }); });
  } catch(e) {}
  return refs;
}

// 계정(개인) 영상 ID 전체 — 하나라도 실패하면 중단 (잘못된 판정 방지)
async function fetchAccountVideoIdSet() {
  const ids = new Set();
  let url = 'https://api.vimeo.com/me/videos?fields=uri&per_page=100&page=1';
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
    if (!res.ok) throw new Error('Vimeo 영상 목록을 불러오지 못했습니다 (' + res.status + ')');
    const data = await res.json();
    (data.data || []).forEach(v => ids.add(v.uri.replace('/videos/', '')));
    url = data.paging?.next ? `https://api.vimeo.com${data.paging.next}` : null;
  }
  return ids;
}

// 영상 하나씩 직접 확인: 'gone'(404 — 삭제됨) / 'ok'(있음) / 'unknown'(판단 불가)
async function checkVimeoVideo(id) {
  try {
    const res = await fetch(`https://api.vimeo.com/videos/${id}?fields=uri`, { headers: { Authorization: `bearer ${VIMEO_TOKEN}` } });
    if (res.ok) return 'ok';
    if (res.status === 404) return 'gone';
    return 'unknown';
  } catch(e) { return 'unknown'; }
}

window.scanVimeoOrphans = async () => {
  const statusEl  = document.getElementById('orphanStatus');
  const previewEl = document.getElementById('orphanPreview');
  previewEl.style.display = 'none';
  orphanCandidates = [];
  document.getElementById('orphanMsg').textContent = '';

  try {
    statusEl.textContent = '⏳ 홈페이지 등록 영상 확인 중...';
    const refs = await collectHomepageVideoRefs();

    statusEl.textContent = '⏳ Vimeo 계정 영상 불러오는 중...';
    const account = await fetchAccountVideoIdSet();

    // 계정 목록에 없는 것만 하나씩 다시 확인 (팀 라이브러리 영상 등은 여기서 '있음'으로 걸러짐)
    const suspect = [...new Set(refs.filter(r => !account.has(r.vimeoId)).map(r => r.vimeoId))];
    const result = {};
    for (let i = 0; i < suspect.length; i += 5) {
      statusEl.textContent = `⏳ 영상 상태 확인 중... (${Math.min(i + 5, suspect.length)}/${suspect.length})`;
      const chunk = suspect.slice(i, i + 5);
      const rs = await Promise.all(chunk.map(checkVimeoVideo));
      chunk.forEach((id, k) => result[id] = rs[k]);
    }
    const unknown = suspect.filter(id => result[id] === 'unknown').length;
    orphanCandidates = refs.filter(r => result[r.vimeoId] === 'gone');

    const extra = unknown ? ` · 확인 불가 ${unknown}개(건너뜀)` : '';
    if (!orphanCandidates.length) {
      statusEl.textContent = `✅ Vimeo에서 삭제된 영상이 홈페이지에 남아 있지 않습니다. (홈페이지 등록 ${refs.length}개 확인${extra})`;
      return;
    }
    statusEl.textContent = `홈페이지 등록 ${refs.length}개 중 Vimeo에서 삭제된 영상 ${orphanCandidates.length}개${extra}`;
    renderOrphanPreview();
  } catch(e) {
    statusEl.textContent = '';
    showMsg('orphanMsg', '오류: ' + e.message, 'error');
  }
};

function renderOrphanPreview() {
  const previewEl = document.getElementById('orphanPreview');
  const titleEl   = document.getElementById('orphanPreviewTitle');
  const listEl    = document.getElementById('orphanPreviewList');

  titleEl.innerHTML = `Vimeo에서 삭제된 영상 <b>${orphanCandidates.length}개</b> (홈페이지 목록에만 남아 있음)
    <span style="margin-left:10px;">
      <a href="#" onclick="event.preventDefault();document.querySelectorAll('.orphan-check').forEach(c=>c.checked=true);">전체선택</a>
      <span style="color:var(--muted);">/</span>
      <a href="#" onclick="event.preventDefault();document.querySelectorAll('.orphan-check').forEach(c=>c.checked=false);">전체해제</a>
    </span>`;

  // 등록 위치별 그룹핑
  const order = ['videos', 'promoVideos', 'apexVideos', 'consultVideo', 'lounge'];
  const groups = {};
  orphanCandidates.forEach((v, i) => (groups[v.src] = groups[v.src] || []).push({ ...v, idx: i }));
  const keys = order.filter(k => groups[k]);

  listEl.innerHTML = keys.map(key => {
    const items = groups[key];
    return `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--purple, #5B3FA6);letter-spacing:1px;
        padding:5px 0;border-bottom:1px solid rgba(245,197,24,0.2);margin-bottom:4px;">
        ${MISSING_SRC_LABEL[key]} <span style="font-weight:400;color:var(--muted);">${items.length}개</span>
      </div>
      ${items.map(v => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 4px;
          border-bottom:1px solid rgba(30,24,56,0.04);font-size:13px;">
          <input id="orphan-check-${v.idx}" class="orphan-check" type="checkbox" checked
            style="flex-shrink:0;width:16px;height:16px;accent-color:#D64545;">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--off-white);">
            ${(v.title || '(제목 없음)').replace(/</g,'&lt;')}</span>
          <span style="font-size:11px;color:var(--muted);flex-shrink:0;">${(v.tag || '').replace(/</g,'&lt;')}</span>
          <span onclick="copyText('${v.vimeoId}', this)" title="클릭하면 복사됩니다"
            style="font-size:11px;color:var(--muted);flex-shrink:0;cursor:pointer;font-family:'SF Mono',Menlo,Consolas,monospace;">${v.vimeoId}</span>
        </div>`).join('')}
    </div>`;
  }).join('');

  previewEl.style.display = 'block';
}

window.deleteVimeoOrphans = async () => {
  const picked = orphanCandidates.filter((v, i) => document.getElementById(`orphan-check-${i}`)?.checked);
  if (!picked.length) { showMsg('orphanMsg', '정리할 항목을 선택해주세요.', 'error'); return; }
  if (!confirm(`선택한 ${picked.length}개를 홈페이지 목록에서 삭제합니다.\n(Vimeo 영상은 건드리지 않습니다) 계속할까요?`)) return;

  const statusEl = document.getElementById('orphanStatus');
  let ok = 0; const fail = [];
  const done = new Set();

  // 문서 단위 삭제 (강의·홍보·에이펙스)
  for (const v of picked.filter(v => ['videos', 'promoVideos', 'apexVideos'].includes(v.src))) {
    statusEl.textContent = `⏳ 정리 중... ${v.title}`;
    try { await deleteDoc(doc(db, v.src, v.docId)); ok++; done.add(v); }
    catch(e) { fail.push(`${v.title} (${e.message})`); }
  }
  // 상담 안내 영상: 영상만 비우고 끔
  const cvPicked = picked.filter(v => v.src === 'consultVideo');
  if (cvPicked.length) {
    try { await updateDoc(doc(db, 'consultConfig', 'video'), { enabled: false, vimeoId: '', title: '' }); ok += cvPicked.length; cvPicked.forEach(v => done.add(v)); }
    catch(e) { fail.push(`상담 안내 영상 (${e.message})`); }
  }
  // 상담 샘플강의: 목록에서 해당 영상만 빼기
  const lgPicked = picked.filter(v => v.src === 'lounge');
  if (lgPicked.length) {
    try {
      const ids = new Set(lgPicked.map(v => v.vimeoId));
      const snap = await getDoc(doc(db, 'consultConfig', 'lounge'));
      const videos = (snap.data()?.videos || []).filter(v => !ids.has(String(v.vimeoId ?? '').replace(/\D/g, '')));
      await updateDoc(doc(db, 'consultConfig', 'lounge'), { videos });
      ok += lgPicked.length; lgPicked.forEach(v => done.add(v));
    } catch(e) { fail.push(`상담 샘플강의 (${e.message})`); }
  }

  orphanCandidates = orphanCandidates.filter(v => !done.has(v));
  if (orphanCandidates.length) renderOrphanPreview();
  else document.getElementById('orphanPreview').style.display = 'none';

  statusEl.textContent = '';
  try { await loadVideos(); } catch(e) {}
  try { if (typeof loadPromoVideos === 'function') await loadPromoVideos(); } catch(e) {}
  if (fail.length) showMsg('orphanMsg', `${ok}개 정리 완료 · ${fail.length}개 실패\n` + fail.join('\n'), 'error');
  else showMsg('orphanMsg', `✅ ${ok}개를 홈페이지 목록에서 삭제했습니다.`, 'success');
};

function renderSyncPreview(folderCount) {
  const previewEl = document.getElementById('syncPreview');
  const titleEl   = document.getElementById('syncPreviewTitle');
  const listEl    = document.getElementById('syncPreviewList');

  const unfiled = syncCandidates.filter(v => !v.tag).length;
  titleEl.innerHTML = `신규 영상 <b>${syncCandidates.length}개</b> 발견
    ${unfiled ? `<span style="color:#5B3FA6;margin-left:8px;">· 폴더 미지정 ${unfiled}개 (카테고리·제목 직접 지정)</span>` : ''}
    <span style="margin-left:10px;">
      <a href="#" onclick="event.preventDefault();document.querySelectorAll('.sync-check').forEach(c=>c.checked=true);">전체선택</a>
      <span style="color:var(--muted);">/</span>
      <a href="#" onclick="event.preventDefault();document.querySelectorAll('.sync-check').forEach(c=>c.checked=false);">전체해제</a>
    </span>`;

  // 카테고리 드롭다운 옵션 HTML
  const catOptHtml = KNOWN_TAGS_SYNC.map(t => `<option value="${t}">${t}</option>`).join('');

  // 태그별 그룹핑 (미분류는 맨 위로)
  const groups = {};
  syncCandidates.forEach((v, i) => {
    const key = v.tag || '__unfiled__';
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...v, idx: i });
  });

  // 미분류 먼저, 나머지는 뒤에
  const orderedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '__unfiled__') return -1;
    if (b === '__unfiled__') return 1;
    return 0;
  });

  listEl.innerHTML = orderedKeys.map(key => {
    const items = groups[key];
    const isUnfiled = key === '__unfiled__';
    const headerLabel = isUnfiled
      ? `⚠️ 폴더 미지정 (직접 선택 필요)`
      : key;

    return `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:${isUnfiled ? '#F5C518' : 'var(--gold)'};letter-spacing:1px;
        padding:5px 0;border-bottom:1px solid rgba(245,197,24,0.2);margin-bottom:4px;">
        ${headerLabel} <span style="font-weight:400;color:var(--muted);">${items.length}개</span>
      </div>
      ${items.map(v => isUnfiled ? `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;
          border-bottom:1px solid rgba(30,24,56,0.04);font-size:13px;flex-wrap:wrap;">
          <input id="sync-check-${v.idx}" class="sync-check" type="checkbox" checked
            style="flex-shrink:0;width:16px;height:16px;accent-color:var(--gold);">
          <input id="sync-title-${v.idx}" type="text" value="${(v.title||'').replace(/"/g,'&quot;')}"
            style="flex:1;min-width:160px;padding:5px 8px;background:#F7F6FB;border:1px solid rgba(30,24,56,0.15);
              border-radius:6px;color:var(--off-white);font-size:12px;font-family:inherit;color-scheme:light;">
          <select id="sync-tag-${v.idx}" style="padding:5px 8px;background:#F7F6FB;border:1px solid #F5C518;
            border-radius:6px;color:var(--off-white);font-size:12px;font-family:inherit;color-scheme:light;">
            <option value="">-- 카테고리 선택 --</option>
            ${catOptHtml}
          </select>
        </div>` : `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 4px;
          border-bottom:1px solid rgba(30,24,56,0.04);font-size:13px;">
          <input id="sync-check-${v.idx}" class="sync-check" type="checkbox" checked
            style="flex-shrink:0;width:16px;height:16px;accent-color:var(--gold);">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.title}</span>
          <span style="font-size:11px;color:var(--muted);flex-shrink:0;">${v.date}</span>
        </div>`).join('')}
    </div>`;
  }).join('');

  previewEl.style.display = 'block';
}

window.syncSaveAll = async () => {
  const today = new Date().toISOString().slice(0,7).replace('-','.');
  let saved = 0, skipped = 0, excluded = 0;

  // 태그(카테고리)별 다음 순서 번호. 기존에 등록된 강의가 있으면 그 다음 번호부터,
  // 없으면 1번부터 — 비메오에서 불러온 순서 그대로 순차 부여.
  const nextOrderByTag = {};
  function nextOrder(tag) {
    if (nextOrderByTag[tag] == null) {
      const maxExisting = videosCache
        .filter(v => v.tag === tag && v.order != null)
        .reduce((max, v) => Math.max(max, Number(v.order)), 0);
      nextOrderByTag[tag] = maxExisting + 1;
    }
    return nextOrderByTag[tag]++;
  }

  for (let i = 0; i < syncCandidates.length; i++) {
    const checkEl = document.getElementById('sync-check-' + i);
    if (checkEl && !checkEl.checked) { excluded++; continue; }

    const v = syncCandidates[i];
    let tag = v.tag;
    let title = v.title;
    if (!v.tag) {
      const tagSel = document.getElementById('sync-tag-' + i);
      const titleInput = document.getElementById('sync-title-' + i);
      if (tagSel) tag = tagSel.value;
      if (titleInput) title = titleInput.value.trim();
      if (!tag) { skipped++; continue; }
    }

    try {
      const order = nextOrder(tag);
      // 영상 고유 코드 자동 부여 (규칙: 등록연도-학년과목교재선생님-강번호)
      const code = generateVideoCode({ tag, date: v.date || today, order }, vcUsedCodes());
      const data = {
        vimeoId: v.vimeoId,
        title,
        tag,
        date:    v.date || today,
        order,
        createdAt: new Date().toISOString(),
      };
      if (code) { data.code = code; data.codeAssignedAt = new Date().toISOString(); }
      await setDoc(doc(db, 'videos', v.vimeoId), data);
      videosCache.push({ id: v.vimeoId, ...data });
      saved++;
    } catch(e) {
      console.error('저장 실패:', v.title, e);
    }
  }

  document.getElementById('syncPreview').style.display = 'none';
  document.getElementById('syncStatus').textContent = '';
  showMsg('syncMsg', `✅ ${saved}개 저장 완료${skipped ? ` · 카테고리 미선택 ${skipped}개 건너뜀` : ''}${excluded ? ` · 선택 해제 ${excluded}개 제외` : ''}`, 'success');
  await loadVideos();
};

window.addVideo = async () => {
  const title = document.getElementById('v-title').value.trim();
  const vimeoId = document.getElementById('v-ytid').value.trim();
  const tag = document.getElementById('v-tag').value.trim();
  const date = document.getElementById('v-date').value.trim();
  if (!title || !vimeoId) { showMsg('videoMsg','제목과 Vimeo ID를 입력해주세요.','error'); return; }
  const nextOrd = videosCache.filter(v => v.tag === tag && v.order != null)
    .reduce((m, v) => Math.max(m, Number(v.order)), 0) + 1;
  const code = generateVideoCode({ tag, date, order: nextOrd }, vcUsedCodes());
  const data = { title, vimeoId, tag, date, order: nextOrd, createdAt: new Date().toISOString() };
  if (code) { data.code = code; data.codeAssignedAt = new Date().toISOString(); }
  await setDoc(doc(db, 'videos', Date.now().toString()), data);
  showMsg('videoMsg', code ? `강의 추가 완료! (영상 코드 ${code})` : '강의 추가 완료!', 'success');
  document.getElementById('v-title').value='';
  document.getElementById('v-ytid').value='';
  await loadVideos();
};

window.deleteVideo = async (id) => {
  if (!confirm('강의를 삭제하시겠습니까?')) return;
  await deleteDoc(doc(db, 'videos', id));
  await loadVideos();
};

// ── 클릭 복사 ──
window.copyText = async (text, el) => {
  const t = String(text ?? '').trim();
  if (!t) return;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(t);
    else {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    copyToast(`복사됨: ${t}`);
    if (el) { const prev = el.style.color; el.style.color = '#2E9E5B'; setTimeout(() => el.style.color = prev, 800); }
  } catch(e) { copyToast('복사 실패: ' + e.message); }
};
function copyToast(msg) {
  let t = document.getElementById('copyToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'copyToast';
    t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:#F7F6FB;color:var(--purple, #5B3FA6);'
      + 'border:1px solid var(--gold);padding:8px 16px;border-radius:8px;font-size:12px;z-index:9999;'
      + 'box-shadow:0 4px 16px rgba(30,24,56,0.12);transition:opacity .2s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._tm); t._tm = setTimeout(() => t.style.opacity = '0', 1500);
}

function showMsg(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg; el.className = 'msg ' + type; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

