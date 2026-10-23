'use strict';
/* ═══════════════════════════════════════════════════════════
   학원 일정
   (admin.html에서 분리 — 원본 10926~11085줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════════════════════════════════
// 📅 학원 일정 (선생님 페이지 달력·오늘 할 일 팝업에 표시)
//   컬렉션: scheduleEvents
//   { title, type, start, end, time, memo, target:'all'|'branch'|'teachers', branch, teacherUids[], teacherNames[] }
// ══════════════════════════════════════════════════════════════════════
let schedEvents = [];
let schedTeachers = [];
let schedEditingId = null;
const SCHED_TYPE_COLOR = { '휴무':'#D64545', '회의':'#2F7FD6', '설명회':'#6B4FBB', '시험기간':'#D97B1A', '행사':'#2E9E5B', '할 일':'#F5C518', '기타':'#6B6489' };

function schedYmd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function schedEsc(t) { return String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function schedFmt(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}/${d}(${'일월화수목금토'[dt.getDay()]})`;
}

window.initScheduleTab = async function () {
  const startEl = document.getElementById('sc-start');
  if (startEl && !startEl.value) startEl.value = schedYmd(new Date());
  try {
    const tSnap = await getDocs(collection(db, 'teachers'));
    schedTeachers = [];
    tSnap.forEach(d => schedTeachers.push({ uid: d.id, ...d.data() }));
    schedTeachers.sort((a, b) => (a.branch || '').localeCompare(b.branch || '') || (a.name || '').localeCompare(b.name || '', 'ko'));
  } catch (e) { schedTeachers = []; }
  schedRenderTeacherChecks([]);
  onSchedTargetChange();
  await loadScheduleEvents();
};

function schedRenderTeacherChecks(checked) {
  const el = document.getElementById('sc-teachers');
  if (!el) return;
  const set = new Set(checked || []);
  if (!schedTeachers.length) { el.innerHTML = '<span style="color:var(--muted);font-size:12px;">등록된 선생님이 없습니다.</span>'; return; }
  el.innerHTML = schedTeachers.map(t => `
    <label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:4px 10px;border:1px solid var(--border-soft);border-radius:14px;cursor:pointer;">
      <input type="checkbox" class="sc-teacher" value="${schedEsc(t.uid)}" data-name="${schedEsc(t.name)}" ${set.has(t.uid) ? 'checked' : ''} style="accent-color:var(--gold);">
      ${schedEsc(t.name)}${t.role === 'ta' ? ' (조교)' : ''} <span style="color:var(--muted);">${schedEsc(t.branch || '')}</span>
    </label>`).join('');
}

window.onSchedTargetChange = function () {
  const v = document.getElementById('sc-target')?.value || 'all';
  document.getElementById('sc-teachers-wrap').style.display = v === 'teachers' ? 'block' : 'none';
};

async function loadScheduleEvents() {
  try {
    const snap = await getDocs(collection(db, 'scheduleEvents'));
    schedEvents = [];
    snap.forEach(d => schedEvents.push({ id: d.id, ...d.data() }));
  } catch (e) {
    document.getElementById('sc-list').innerHTML = `<div style="color:#D64545;font-size:13px;">불러오기 실패: ${schedEsc(e.message)}<br>Firestore 규칙에 scheduleEvents 컬렉션이 추가됐는지 확인해주세요.</div>`;
    return;
  }
  renderScheduleList();
}

window.renderScheduleList = function () {
  const el = document.getElementById('sc-list');
  if (!el) return;
  const showPast = document.getElementById('sc-showPast')?.checked;
  const today = schedYmd(new Date());
  let list = schedEvents.filter(e => showPast || (e.end || e.start) >= today);
  list.sort((a, b) => showPast ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start));
  if (!list.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;">${showPast ? '등록된 일정이 없습니다.' : '예정된 일정이 없습니다.'}</div>`; return; }
  el.innerHTML = list.map(e => {
    const target = e.target === 'branch' ? `${e.branch}` : e.target === 'teachers' ? (e.teacherNames || []).join(', ') : '전체 선생님';
    const past = (e.end || e.start) < today;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid var(--border-soft);border-radius:8px;margin-bottom:6px;${past ? 'opacity:0.5;' : ''}">
        <span style="width:4px;align-self:stretch;border-radius:2px;background:${SCHED_TYPE_COLOR[e.type] || '#6B6489'};flex-shrink:0;"></span>
        <div style="min-width:110px;font-size:13px;font-weight:600;white-space:nowrap;">${schedFmt(e.start)}${e.end && e.end !== e.start ? ` ~ ${schedFmt(e.end)}` : ''}${e.time ? `<div style="font-size:11px;color:var(--muted);font-weight:400;">${schedEsc(e.time)}</div>` : ''}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;">${schedEsc(e.title)} <span style="font-size:11px;color:${SCHED_TYPE_COLOR[e.type] || '#6B6489'};margin-left:4px;">${schedEsc(e.type || '기타')}</span></div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">대상: ${schedEsc(target)}${e.memo ? ` · ${schedEsc(e.memo)}` : ''}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="editScheduleEvent('${e.id}')">수정</button>
        <button class="btn btn-danger btn-sm" onclick="deleteScheduleEvent('${e.id}')">삭제</button>
      </div>`;
  }).join('');
};

window.saveScheduleEvent = async function () {
  const title  = document.getElementById('sc-title').value.trim();
  const type   = document.getElementById('sc-type').value;
  const start  = document.getElementById('sc-start').value;
  let end      = document.getElementById('sc-end').value;
  const time   = document.getElementById('sc-time').value.trim();
  const memo   = document.getElementById('sc-memo').value.trim();
  const tSel   = document.getElementById('sc-target').value;
  if (!title) { showMsg('sc-msg', '제목을 입력해주세요.', 'error'); return; }
  if (!start) { showMsg('sc-msg', '날짜를 선택해주세요.', 'error'); return; }
  if (end && end < start) { showMsg('sc-msg', '종료일이 시작일보다 빠릅니다.', 'error'); return; }
  if (!end) end = start;

  const data = { title, type, start, end, time, memo, target: 'all', branch: '', teacherUids: [], teacherNames: [] };
  if (tSel === '평촌관' || tSel === '산본관') { data.target = 'branch'; data.branch = tSel; }
  if (tSel === 'teachers') {
    const checks = [...document.querySelectorAll('.sc-teacher:checked')];
    if (!checks.length) { showMsg('sc-msg', '대상 선생님을 선택해주세요.', 'error'); return; }
    data.target = 'teachers';
    data.teacherUids = checks.map(c => c.value);
    data.teacherNames = checks.map(c => c.dataset.name);
  }
  try {
    if (schedEditingId) {
      await updateDoc(doc(db, 'scheduleEvents', schedEditingId), { ...data, updatedAt: new Date().toISOString() });
      showMsg('sc-msg', '✅ 일정이 수정되었습니다.', 'success');
    } else {
      await addDoc(collection(db, 'scheduleEvents'), { ...data, createdAt: new Date().toISOString() });
      showMsg('sc-msg', '✅ 일정이 등록되었습니다. 선생님 페이지에 바로 반영돼요.', 'success');
    }
    resetScheduleForm();
    await loadScheduleEvents();
  } catch (e) { showMsg('sc-msg', '저장 실패: ' + e.message, 'error'); }
};

window.editScheduleEvent = function (id) {
  const e = schedEvents.find(x => x.id === id);
  if (!e) return;
  schedEditingId = id;
  document.getElementById('sc-title').value = e.title || '';
  document.getElementById('sc-type').value = e.type || '기타';
  document.getElementById('sc-start').value = e.start || '';
  document.getElementById('sc-end').value = e.end && e.end !== e.start ? e.end : '';
  document.getElementById('sc-time').value = e.time || '';
  document.getElementById('sc-memo').value = e.memo || '';
  document.getElementById('sc-target').value = e.target === 'branch' ? e.branch : (e.target || 'all');
  schedRenderTeacherChecks(e.teacherUids || []);
  onSchedTargetChange();
  document.getElementById('sc-saveBtn').textContent = '수정 저장';
  document.getElementById('sc-cancelBtn').style.display = '';
  document.getElementById('tab-schedule').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.resetScheduleForm = function () {
  schedEditingId = null;
  ['sc-title', 'sc-end', 'sc-time', 'sc-memo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('sc-type').value = '회의';
  document.getElementById('sc-target').value = 'all';
  document.getElementById('sc-start').value = schedYmd(new Date());
  schedRenderTeacherChecks([]);
  onSchedTargetChange();
  document.getElementById('sc-saveBtn').textContent = '일정 등록';
  document.getElementById('sc-cancelBtn').style.display = 'none';
};

window.deleteScheduleEvent = async function (id) {
  const e = schedEvents.find(x => x.id === id);
  if (!confirm(`"${e ? e.title : ''}" 일정을 삭제할까요?`)) return;
  try {
    await deleteDoc(doc(db, 'scheduleEvents', id));
    if (schedEditingId === id) resetScheduleForm();
    await loadScheduleEvents();
  } catch (err) { alert('삭제 실패: ' + err.message); }
};
