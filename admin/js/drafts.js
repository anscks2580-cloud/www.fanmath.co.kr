'use strict';
/* ═══════════════════════════════════════════════════════════
   임시저장 (dailyDrafts)
   (admin.html에서 분리 — 원본 7711~7883줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 임시저장 (Firestore dailyDrafts)
// ══════════════════════════════════════════

function draftDocId(type) {
  // type: 'dr' | 'wl' | 'att'
  if (type === 'dr') {
    const date   = document.getElementById('dr-date')?.value || new Date().toISOString().slice(0,10);
    const branch = document.getElementById('dr-branch')?.value || '';
    return `dr_${branch}_${date}`;
  }
  if (type === 'wl') {
    const from   = document.getElementById('wl-from')?.value || new Date().toISOString().slice(0,10);
    const branch = document.getElementById('wl-branch')?.value || '';
    return `wl_${branch}_${from}`;
  }
  if (type === 'att') {
    const dateStr = toLocalDateStr(attCurrentDate);
    const branch  = document.getElementById('attBranchFilter')?.value || 'all';
    return `att_${branch}_${dateStr}`;
  }
  return type + '_' + new Date().toISOString().slice(0,10);
}

function getDrData() {
  return {
    branch:   document.getElementById('dr-branch')?.value || '',
    date:     document.getElementById('dr-date')?.value || '',
    author:   document.getElementById('dr-author')?.value || '',
    classes:  document.getElementById('dr-classes')?.value || '',
    consult:  document.getElementById('dr-consult')?.value || '',
    receipt:  document.getElementById('dr-receipt')?.value || '',
    absent:   document.getElementById('dr-absent')?.value || '',
    textbook: document.getElementById('dr-textbook')?.value || '',
    note:     document.getElementById('dr-note')?.value || '',
    phone:    document.getElementById('dr-phone')?.value || '',
    nextday:  document.getElementById('dr-nextday')?.value || '',
  };
}

function setDrData(d) {
  if (d.branch)   document.getElementById('dr-branch').value   = d.branch;
  if (d.date)     document.getElementById('dr-date').value     = d.date;
  if (d.author !== undefined)   document.getElementById('dr-author').value   = d.author;
  if (d.classes !== undefined)  document.getElementById('dr-classes').value  = d.classes;
  if (d.consult !== undefined)  document.getElementById('dr-consult').value  = d.consult;
  if (d.receipt !== undefined)  document.getElementById('dr-receipt').value  = d.receipt;
  if (d.absent !== undefined)   document.getElementById('dr-absent').value   = d.absent;
  if (d.textbook !== undefined) document.getElementById('dr-textbook').value = d.textbook;
  if (d.note !== undefined)     document.getElementById('dr-note').value     = d.note;
  if (d.phone !== undefined)    document.getElementById('dr-phone').value    = d.phone;
  if (d.nextday !== undefined)  document.getElementById('dr-nextday').value  = d.nextday;
  if (typeof drSyncFromText === 'function') drSyncFromText();   // 요일별 수업반 체크 맞추기
}

function getWlData() {
  const secs = ['new','leave','pause','upcoming','cash','consult'];
  const data = {
    branch: document.getElementById('wl-branch')?.value || '',
    from:   document.getElementById('wl-from')?.value || '',
    to:     document.getElementById('wl-to')?.value || '',
    consultNote: document.getElementById('wl-consult-note')?.value || '',
    textbook:    document.getElementById('wl-textbook')?.value || '',
  };
  // 중첩 배열 대신 { sec_ri_ci: value } 평탄화 형태로 저장
  const flat = {};
  secs.forEach(sec => {
    document.querySelectorAll(`[data-sec="${sec}"]`).forEach(inp => {
      flat[`${sec}_${inp.dataset.row}_${inp.dataset.col}`] = inp.value;
    });
    flat[`${sec}__count`] = document.getElementById('wl-' + sec + '-rows')?.children.length || 0;
  });
  data.flat = flat;
  return data;
}

function setWlData(d) {
  if (d.branch) document.getElementById('wl-branch').value = d.branch;
  if (d.from)   document.getElementById('wl-from').value   = d.from;
  if (d.to)     document.getElementById('wl-to').value     = d.to;
  if (d.consultNote !== undefined) document.getElementById('wl-consult-note').value = d.consultNote;
  if (d.textbook !== undefined)    document.getElementById('wl-textbook').value     = d.textbook;

  const flat = d.flat || {};
  const secs = ['new','leave','pause','upcoming','cash','consult'];
  secs.forEach(sec => {
    const container = document.getElementById('wl-' + sec + '-rows');
    if (!container) return;
    container.innerHTML = '';
    const count = flat[`${sec}__count`] || 1;
    for (let ri = 0; ri < count; ri++) {
      wlAddRow(sec);
      const inputs = container.querySelectorAll(`[data-row="${ri}"]`);
      inputs.forEach(inp => {
        const key = `${sec}_${ri}_${inp.dataset.col}`;
        if (flat[key] !== undefined) inp.value = flat[key];
      });
    }
  });
}

function getAttData() {
  const dow = attCurrentDate.getDay();
  const branchFilter = document.getElementById('attBranchFilter')?.value || '';
  const filtered = studentsCache.filter(s =>
    (s.days||[]).includes(DAY_NAMES[dow]) && (!branchFilter || s.branch === branchFilter)
  );
  const statusSnapshot = {};
  filtered.forEach(s => { statusSnapshot[s.id] = attStatus[s.id] || 'present'; });
  return {
    date:   toLocalDateStr(attCurrentDate),
    branch: branchFilter,
    status: statusSnapshot,
  };
}

function setAttData(d) {
  if (d.date) {
    const parts = d.date.split('-');
    attCurrentDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
  }
  if (d.branch !== undefined) {
    const sel = document.getElementById('attBranchFilter');
    if (sel) sel.value = d.branch;
  }
  if (d.status) Object.assign(attStatus, d.status);
  renderAttendance();
}

function showDraftStatus(type, msg, isErr=false) {
  const el = document.getElementById(type + '-draft-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? '#D64545' : '#2E9E5B';
  setTimeout(() => { el.textContent = ''; }, 3000);
}

window.saveDraft = async function(type) {
  let payload;
  if (type === 'dr')  payload = getDrData();
  if (type === 'wl')  payload = getWlData();
  if (type === 'att') payload = getAttData();
  if (!payload) return;

  const docId = draftDocId(type);
  try {
    await setDoc(doc(db, 'dailyDrafts', docId), {
      ...payload,
      savedAt: new Date().toISOString(),
    });
    showDraftStatus(type, `✅ 저장됨 (${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})})`);
  } catch(e) {
    showDraftStatus(type, '❌ 저장 실패: ' + e.message, true);
  }
};

// 마감 기록: 관리부 마감·주간업무일지·출결 이미지를 저장할 때 내용도 같이 남김 → 날짜별 기록으로 남음
// 임시저장과 같은 문서(dailyDrafts)에 imageSavedAt(마감 완료 시각)·savedBy를 붙여 저장
// + 이미지를 closingImages/에 올리고 closingReports/{같은 ID}에 제출 기록 → 원장 페이지 팝업·확인
window.recordClosing = async function(type, canvas) {
  let payload;
  if (type === 'dr')  payload = getDrData();
  if (type === 'wl')  payload = getWlData();
  if (type === 'att') payload = getAttData();
  if (!payload) return;
  if (canvas) submitClosingImage(type, canvas);
  const nowIso = new Date().toISOString();
  const a = window.currentAdmin || {};
  try {
    await setDoc(doc(db, 'dailyDrafts', draftDocId(type)), {
      ...payload,
      savedAt: nowIso,
      imageSavedAt: nowIso,
      savedBy: a.name || a.email || '',
    });
    showDraftStatus(type, `✅ 마감 기록됨 (${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})})`);
  } catch(e) {
    showDraftStatus(type, '❌ 마감 기록 실패: ' + e.message, true);
  }
};

window.loadDraft = async function(type) {
  const docId = draftDocId(type);
  try {
    const snap = await getDoc(doc(db, 'dailyDrafts', docId));
    if (!snap.exists()) {
      showDraftStatus(type, '저장된 내용 없음', true); return;
    }
    const d = snap.data();
    if (type === 'dr')  setDrData(d);
    if (type === 'wl')  setWlData(d);
    if (type === 'att') setAttData(d);
    const savedTime = d.savedAt ? new Date(d.savedAt).toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    showDraftStatus(type, `📂 불러옴 ${savedTime ? '('+savedTime+')' : ''}`);
  } catch(e) {
    showDraftStatus(type, '❌ 불러오기 실패: ' + e.message, true);
  }
};



// ══════════════════════════════════════════
// 원장 확인: 마감 이미지 제출(closingReports) · 원장별 확인 표시
//   closingReports/{dr_관_날짜 | wl_관_시작일 | att_관_날짜}
//   { type, typeLabel, branch, date, dateTo?, imagePath, imageURL, submittedAt, submittedBy, confirms:{ 키:{name, at} } }
//   다시 제출하면 확인 표시는 초기화(새 이미지를 다시 봐야 하므로)
// ══════════════════════════════════════════
const CLOSING_LABEL = { dr: '일일업무보고', wl: '주간업무일지', att: '학생출결' };
const CLOSING_DIRECTORS = [{ key: 'dncksfly', name: '송우찬 원장' }, { key: 'smc1823', name: '송문찬 원장' }];
function closingMeta(type) {
  if (type === 'dr') return { branch: document.getElementById('dr-branch')?.value || '', date: document.getElementById('dr-date')?.value || '' };
  if (type === 'wl') return { branch: document.getElementById('wl-branch')?.value || '', date: document.getElementById('wl-from')?.value || '', dateTo: document.getElementById('wl-to')?.value || '' };
  if (type === 'att') return { branch: document.getElementById('attBranchFilter')?.value || '전체', date: toLocalDateStr(attCurrentDate) };
  return { branch: '', date: '' };
}
async function submitClosingImage(type, canvas) {
  const id = draftDocId(type);
  const meta = closingMeta(type);
  const a = window.currentAdmin || {};
  const el = closingConfirmEl(type);
  if (el) el.innerHTML = '<span style="color:var(--muted);">원장 페이지로 이미지 보내는 중...</span>';
  try {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const path = `closingImages/${id}_${Date.now()}.png`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, { contentType: 'image/png' });
    const imageURL = await getDownloadURL(fileRef);
    await setDoc(doc(db, 'closingReports', id), {
      type, typeLabel: CLOSING_LABEL[type] || type, ...meta,
      imagePath: path, imageURL,
      submittedAt: new Date().toISOString(), submittedBy: a.name || a.email || '',
      confirms: {},
    });
    watchClosingConfirm(type, true);
  } catch (e) {
    if (el) el.innerHTML = `<span style="color:#D64545;">원장 페이지로 이미지 보내기 실패: ${e.message}</span>`;
  }
}
function closingConfirmEl(type) {
  let el = document.getElementById('closeConfirm-' + type);
  if (el) return el;
  const st = document.getElementById(type + '-draft-status');
  if (!st) return null;
  el = document.createElement('div');
  el.id = 'closeConfirm-' + type;
  el.style.cssText = 'margin-top:12px;padding:10px 14px;border-radius:10px;background:rgba(30,24,56,0.04);border:1px solid rgba(30,24,56,0.08);font-size:12.5px;line-height:1.8;';
  st.parentElement.insertAdjacentElement('afterend', el);
  return el;
}
const closingWatch = {};   // type → { id, unsub }
function renderClosingConfirm(type, d) {
  const el = closingConfirmEl(type); if (!el) return;
  const fmt = (iso) => { const t = new Date(iso); return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
  if (!d) { el.innerHTML = '<b style="color:var(--off-white);">👑 원장 확인</b> <span style="color:var(--muted);">· 아직 이 날짜 마감 이미지를 저장하지 않았습니다 (이미지 다운로드 시 원장 페이지로 자동 제출)</span>'; return; }
  el.innerHTML = `<b style="color:var(--off-white);">👑 원장 확인</b> <span style="color:var(--muted);">· ${fmt(d.submittedAt)} 제출${d.submittedBy ? ' (' + d.submittedBy + ')' : ''}</span><br>` +
    CLOSING_DIRECTORS.map((p) => {
      const c = (d.confirms || {})[p.key];
      return c ? `<span style="display:inline-block;margin-right:14px;color:#2E9E5B;font-weight:700;">✅ ${p.name} 확인완료 <span style="font-weight:400;color:var(--muted);">${fmt(c.at)}</span></span>`
               : `<span style="display:inline-block;margin-right:14px;color:var(--muted);">⏳ ${p.name} 미확인</span>`;
    }).join('');
}
function watchClosingConfirm(type, force) {
  if (!closingConfirmEl(type)) return;
  let id; try { id = draftDocId(type); } catch (e) { return; }
  const w = closingWatch[type];
  if (w && w.id === id && !force) return;
  if (w && w.unsub) w.unsub();
  closingWatch[type] = { id, unsub: onSnapshot(doc(db, 'closingReports', id), (s) => renderClosingConfirm(type, s.exists() ? s.data() : null), () => {}) };
}
// 관·날짜를 바꾸면 그 마감의 확인 상태로 바뀜 (가벼운 주기 확인)
setInterval(() => { if (!window.currentAdmin) return; ['dr', 'wl', 'att'].forEach((t) => { try { watchClosingConfirm(t); } catch (e) {} }); }, 2000);
