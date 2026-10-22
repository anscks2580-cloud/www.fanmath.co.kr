'use strict';
/* ═══════════════════════════════════════════════════════════
   숙제 입력 (관리부)
   - 날짜별로 담당 선생님 › 반 › 학생 › 숙제 내용을 기록 (기존 엑셀 취합표 그대로)
   - homeworkLogs/{자동ID}: { date, teacherUid, teacherName, classGroup, studentIds[], studentNames[], content }
   - 학부모 페이지 "숙제" 탭에서 자기 아이가 포함된 기록만 날짜순으로 보임
   ═══════════════════════════════════════════════════════════ */
const hlEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hlToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let hlSel = { teacherUid: '', cls: '' };
let hlRows = [];       // 선택한 날짜의 기록
let hlEditing = null;  // 수정 중인 문서 ID
let hlInited = false;

window.initHomeworkLogTab = async function () {
  if (!studentsCache.length) await loadStudents();
  if (!hlInited) {
    hlInited = true;
    document.getElementById('hlDate').value = hlToday();
    const sel = document.getElementById('hlTeacher');
    const ts = teachersCache.filter((t) => t.role !== 'ta').slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    sel.innerHTML = '<option value="">선생님 선택...</option>' + ts.map((t) => `<option value="${t.id}">${hlEsc(t.name)}</option>`).join('');
  }
  hlRenderClasses();
  hlLoad();
};

// 담당 선생님 → 그 선생님 담당 학생들의 반 목록 (없으면 전체 반)
window.hlOnTeacher = function () {
  hlSel.teacherUid = document.getElementById('hlTeacher').value;
  hlSel.cls = '';
  hlRenderClasses();
  hlRenderStudents();
};
function hlClassesOf(teacherUid) {
  const pool = teacherUid ? studentsCache.filter((s) => s.teacherUid === teacherUid) : studentsCache;
  const m = new Map();
  pool.forEach((s) => { const c = String(s.classGroup || '').trim() || '(반 미배정)'; m.set(c, (m.get(c) || 0) + 1); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}
function hlRenderClasses() {
  const el = document.getElementById('hlClasses');
  const list = hlClassesOf(hlSel.teacherUid);
  if (!list.length) { el.innerHTML = '<span style="font-size:12px;color:var(--muted);">이 선생님 담당 학생이 없습니다.</span>'; return; }
  el.innerHTML = list.map(([c, n]) => `<button class="hl-cls ${hlSel.cls === c ? 'active' : ''}" data-cls="${hlEsc(c)}" onclick="hlPickClass(this.dataset.cls)">${hlEsc(c)} <small>${n}</small></button>`).join('');
}
window.hlPickClass = function (c) {
  hlSel.cls = c;
  hlRenderClasses();
  hlRenderStudents();
};
function hlStudentsOf() {
  if (!hlSel.cls) return [];
  return studentsCache.filter((s) => (String(s.classGroup || '').trim() || '(반 미배정)') === hlSel.cls && (!hlSel.teacherUid || s.teacherUid === hlSel.teacherUid))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
}
function hlRenderStudents(checkedIds) {
  const el = document.getElementById('hlStudents');
  const list = hlStudentsOf();
  if (!list.length) { el.innerHTML = '<span style="font-size:12px;color:var(--muted);">반을 고르면 학생이 나옵니다.</span>'; return; }
  el.innerHTML = list.map((s) => `<label class="hl-stu"><input type="checkbox" value="${s.id}" ${!checkedIds || checkedIds.includes(s.id) ? 'checked' : ''}> ${hlEsc(s.name)}</label>`).join('');
}

// ── 저장 ──
window.hlSave = async function () {
  const date = document.getElementById('hlDate').value;
  const teacherUid = hlSel.teacherUid;
  const teacherName = teachersCache.find((t) => t.id === teacherUid)?.name || '';
  const content = document.getElementById('hlContent').value.trim();
  const ids = [...document.querySelectorAll('#hlStudents input:checked')].map((c) => c.value);
  if (!date) { showMsg('hlMsg', '날짜를 골라주세요.', 'error'); return; }
  if (!teacherUid) { showMsg('hlMsg', '담당 선생님을 골라주세요.', 'error'); return; }
  if (!hlSel.cls) { showMsg('hlMsg', '반을 골라주세요.', 'error'); return; }
  if (!ids.length) { showMsg('hlMsg', '학생을 한 명 이상 체크해주세요.', 'error'); return; }
  if (!content) { showMsg('hlMsg', '숙제 내용을 적어주세요.', 'error'); return; }
  const names = ids.map((id) => studentsCache.find((s) => s.id === id)?.name || '');
  const data = { date, teacherUid, teacherName, classGroup: hlSel.cls, studentIds: ids, studentNames: names, content, updatedAt: new Date().toISOString(), updatedBy: window.currentAdmin?.name || '' };
  try {
    if (hlEditing) await updateDoc(doc(db, 'homeworkLogs', hlEditing), data);
    else await addDoc(collection(db, 'homeworkLogs'), { ...data, createdAt: new Date().toISOString() });
    showMsg('hlMsg', hlEditing ? '✅ 수정했습니다.' : `✅ ${hlSel.cls} 숙제를 저장했습니다. (${ids.length}명)`, 'success');
    hlCancelEdit(false);
    hlLoad();
  } catch (e) { showMsg('hlMsg', '저장 오류: ' + e.message, 'error'); }
};
window.hlCancelEdit = function (clearClass = true) {
  hlEditing = null;
  document.getElementById('hlContent').value = '';
  document.getElementById('hlSaveBtn').textContent = '저장';
  document.getElementById('hlCancelBtn').style.display = 'none';
  if (clearClass) { hlSel.cls = ''; hlRenderClasses(); hlRenderStudents(); }
  else { hlRenderStudents(); }
};

// ── 그 날짜 기록 (사진의 표와 같은 모양) ──
window.hlLoad = async function () {
  const date = document.getElementById('hlDate').value;
  const el = document.getElementById('hlTable');
  if (!date) return;
  try {
    const snap = await getDocs(query(collection(db, 'homeworkLogs'), where('date', '==', date)));
    hlRows = []; snap.forEach((d) => hlRows.push({ id: d.id, ...d.data() }));
    hlRows.sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko') || (a.classGroup || '').localeCompare(b.classGroup || '', 'ko'));
    const d = new Date(date + 'T00:00:00');
    document.getElementById('hlTableTitle').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}요일 · ${hlRows.length}건`;
    if (!hlRows.length) { el.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:20px;text-align:center;">이 날짜에 입력된 숙제가 없습니다.</td></tr>'; return; }
    let prevT = null;
    el.innerHTML = hlRows.map((r) => {
      const showT = r.teacherName !== prevT; prevT = r.teacherName;
      return `<tr>
        <td style="font-weight:700;color:var(--gold);">${showT ? hlEsc(r.teacherName) + 'T' : ''}</td>
        <td style="white-space:nowrap;">${hlEsc(r.classGroup)}</td>
        <td style="font-size:12.5px;color:var(--muted);">${(r.studentNames || []).map(hlEsc).join(', ')}</td>
        <td style="color:var(--off-white);white-space:pre-wrap;">${hlEsc(r.content)}</td>
        <td style="white-space:nowrap;"><button class="btn btn-sm btn-secondary" onclick="hlEdit('${r.id}')">수정</button> <button class="btn btn-sm btn-danger" onclick="hlDelete('${r.id}')">삭제</button></td>
      </tr>`;
    }).join('');
  } catch (e) { el.innerHTML = `<tr><td colspan="5" style="color:#ff9090;padding:20px;">오류: ${hlEsc(e.message)}</td></tr>`; }
};
window.hlEdit = function (id) {
  const r = hlRows.find((x) => x.id === id); if (!r) return;
  hlEditing = id;
  document.getElementById('hlTeacher').value = r.teacherUid || '';
  hlSel.teacherUid = r.teacherUid || ''; hlSel.cls = r.classGroup || '';
  hlRenderClasses();
  hlRenderStudents(r.studentIds || []);
  document.getElementById('hlContent').value = r.content || '';
  document.getElementById('hlSaveBtn').textContent = '수정 저장';
  document.getElementById('hlCancelBtn').style.display = '';
  document.getElementById('hlContent').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
window.hlDelete = async function (id) {
  if (!confirm('이 숙제 기록을 삭제할까요?')) return;
  try { await deleteDoc(doc(db, 'homeworkLogs', id)); hlLoad(); } catch (e) { showMsg('hlMsg', '삭제 오류: ' + e.message, 'error'); }
};
// 어제(또는 직전 수업일) 기록을 오늘로 복사 — 반 구성이 같을 때 빠르게
window.hlCopyPrev = async function () {
  const date = document.getElementById('hlDate').value; if (!date) return;
  const snap = await getDocs(query(collection(db, 'homeworkLogs'), where('date', '<', date)));
  let rows = []; snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  if (!rows.length) { showMsg('hlMsg', '이전 기록이 없습니다.', 'error'); return; }
  const last = rows.map((r) => r.date).sort().pop();
  rows = rows.filter((r) => r.date === last);
  if (!confirm(`${last} 기록 ${rows.length}건을 ${date}로 복사할까요? (내용은 그대로 복사되니 수정해 주세요)`)) return;
  for (const r of rows) {
    const { id, ...rest } = r;
    await addDoc(collection(db, 'homeworkLogs'), { ...rest, date, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), copiedFrom: last });
  }
  showMsg('hlMsg', `✅ ${rows.length}건 복사했습니다. 내용을 고쳐주세요.`, 'success');
  hlLoad();
};
