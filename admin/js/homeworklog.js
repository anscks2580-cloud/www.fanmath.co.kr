'use strict';
/* ═══════════════════════════════════════════════════════════
   숙제 입력 (관리부)
   - 날짜별로 담당 선생님 › 반 › 학생 › 숙제 내용을 기록 (기존 엑셀 취합표 그대로)
   - homeworkLogs/{자동ID}: { date, teacherUid, teacherName, classGroup, studentIds[], studentNames[], content }
   - 학부모 페이지 "숙제" 탭에서 자기 아이가 포함된 기록만 날짜순으로 보임
   - 선생님 페이지 「숙제 입력」에서도 본인 반 숙제를 같은 컬렉션에 저장(source:'teacher') → 이 표에 날짜별로 자동 반영
   - 관 구분(평촌관/산본관): 숙제를 받는 학생들이 속한 관 기준. 저장 시 branch 필드로 기록,
     branch가 없는 예전 기록은 학생 명단(studentIds)의 관으로 판정 → 관별로 따로 조회·마감 이미지
   ═══════════════════════════════════════════════════════════ */
const hlEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hlClsKey = (c) => { const m = String(c || '').match(/^(초|중|고)\s*(\d)/); return m ? ({ 초: 0, 중: 1, 고: 2 }[m[1]] * 10 + parseInt(m[2], 10)) : 99; };
const hlClsCmp = (a, b) => hlClsKey(a) - hlClsKey(b) || String(a || '').localeCompare(String(b || ''), 'ko');
const hlToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let hlSel = { teacherUid: '', cls: '' };
let hlBranch = '평촌관';
try { const b = localStorage.getItem('swc_hl_branch'); if (b === '평촌관' || b === '산본관') hlBranch = b; } catch (e) {}
// 숙제 기록의 관: 저장된 branch → 학생들의 관(다수) → 담당 선생님의 관
function hlLogBranch(r) {
  if (r.branch) return r.branch;
  const cnt = {};
  (r.studentIds || []).forEach((id) => { const b = studentsCache.find((s) => s.id === id)?.branch; if (b) cnt[b] = (cnt[b] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (top) return top[0];
  return teachersCache.find((t) => t.id === r.teacherUid)?.branch || '';
}
// 이 관 학생이 있는 선생님 (담당 학생이 없으면 선생님 소속 관 기준)
function hlTeachersOfBranch() {
  return teachersCache.filter((t) => t.role !== 'ta')
    .filter((t) => studentsCache.some((s) => s.teacherUid === t.id && s.branch === hlBranch) || (t.branch === hlBranch && !studentsCache.some((s) => s.teacherUid === t.id)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
}
function hlFillTeachers() {
  const sel = document.getElementById('hlTeacher');
  const ts = hlTeachersOfBranch();
  sel.innerHTML = '<option value="">선생님 선택...</option>' + ts.map((t) => `<option value="${t.id}">${hlEsc(t.name)}</option>`).join('');
  if (hlSel.teacherUid && ts.some((t) => t.id === hlSel.teacherUid)) sel.value = hlSel.teacherUid;
  else hlSel.teacherUid = '';
}
window.hlOnBranch = function () {
  hlBranch = document.getElementById('hlBranch').value;
  try { localStorage.setItem('swc_hl_branch', hlBranch); } catch (e) {}
  hlEditing = null;
  document.getElementById('hlContent').value = '';
  document.getElementById('hlSaveBtn').textContent = '저장';
  document.getElementById('hlCancelBtn').style.display = 'none';
  hlSel.cls = ''; hlOpenGrade = '';
  hlFillTeachers();
  hlRenderClasses();
  hlRenderStudents();
  hlLoad();
};
let hlRows = [];       // 선택한 날짜의 기록
let hlEditing = null;  // 수정 중인 문서 ID
let hlInited = false;

window.initHomeworkLogTab = async function () {
  if (!studentsCache.length) await loadStudents();
  if (!hlInited) {
    hlInited = true;
    document.getElementById('hlDate').value = hlToday();
    document.getElementById('hlBranch').value = hlBranch;
  }
  hlFillTeachers();
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
  const pool = studentsCache.filter((s) => s.branch === hlBranch && (!teacherUid || s.teacherUid === teacherUid));
  const m = new Map();
  pool.forEach((s) => { const c = String(s.classGroup || '').trim() || '(반 미배정)'; m.set(c, (m.get(c) || 0) + 1); });
  return [...m.entries()].sort((a, b) => hlClsCmp(a[0], b[0]));
}
let hlOpenGrade = '';
const hlGradeOf = (c) => { const m = String(c || '').match(/^(초|중|고)\s*(\d)/); return m ? m[1] + m[2] : '기타'; };
function hlRenderClasses() {
  const el = document.getElementById('hlClasses');
  const list = hlClassesOf(hlSel.teacherUid);
  if (!list.length) { el.innerHTML = `<span style="font-size:12px;color:var(--muted);">${hlEsc(hlBranch)}에 이 선생님 담당 학생이 없습니다.</span>`; return; }
  // 학년별 아코디언: 학년 줄이 세로로 쌓이고, 누르면 그 아래로 반 버튼이 펼쳐짐
  const byGrade = new Map();
  list.forEach(([c, n]) => { const g = hlGradeOf(c); if (!byGrade.has(g)) byGrade.set(g, []); byGrade.get(g).push([c, n]); });
  const grades = [...byGrade.keys()].sort((a, b) => hlClsKey(a) - hlClsKey(b));
  if (hlSel.cls) hlOpenGrade = hlGradeOf(hlSel.cls);
  if (!hlOpenGrade && grades.length === 1) hlOpenGrade = grades[0];
  el.innerHTML = grades.map((g) => {
    const cls = byGrade.get(g), open = hlOpenGrade === g, picked = cls.find(([c]) => c === hlSel.cls);
    return `<div class="hl-acc ${open ? 'open' : ''}">
      <button type="button" class="hl-acc-h" onclick="hlOpenGradeSet('${g}')"><span class="ar">${open ? '▾' : '▸'}</span><b>${g}</b><small>${cls.length}개 반 · ${cls.reduce((a, [, n]) => a + n, 0)}명</small>${picked && !open ? `<span class="sel">${hlEsc(picked[0])}</span>` : ''}</button>
      ${open ? `<div class="hl-acc-b">${cls.map(([c, n]) => `<button class="hl-cls ${hlSel.cls === c ? 'active' : ''}" data-cls="${hlEsc(c)}" onclick="hlPickClass(this.dataset.cls)">${hlEsc(c)} <small>${n}</small></button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}
window.hlOpenGradeSet = function (g) { hlOpenGrade = hlOpenGrade === g ? '' : g; hlRenderClasses(); };
window.hlPickClass = function (c) {
  hlSel.cls = c;
  hlRenderClasses();
  hlRenderStudents();
};
function hlStudentsOf() {
  if (!hlSel.cls) return [];
  return studentsCache.filter((s) => s.branch === hlBranch && (String(s.classGroup || '').trim() || '(반 미배정)') === hlSel.cls && (!hlSel.teacherUid || s.teacherUid === hlSel.teacherUid))
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
  const data = { date, branch: hlBranch, teacherUid, teacherName, classGroup: hlSel.cls, studentIds: ids, studentNames: names, content, updatedAt: new Date().toISOString(), updatedBy: window.currentAdmin?.name || '' };
  try {
    if (hlEditing) await updateDoc(doc(db, 'homeworkLogs', hlEditing), data);
    else await addDoc(collection(db, 'homeworkLogs'), { ...data, createdAt: new Date().toISOString() });
    showMsg('hlMsg', hlEditing ? '✅ 수정했습니다.' : `✅ ${hlBranch} ${hlSel.cls} 숙제를 저장했습니다. (${ids.length}명) — 다음 반을 골라주세요`, 'success');
    hlCancelEdit(true);   // 반·학생·내용 모두 비움 (날짜·선생님은 유지)
    hlLoad();
  } catch (e) { showMsg('hlMsg', '저장 오류: ' + e.message, 'error'); }
};
window.hlCancelEdit = function (clearClass = true) {
  hlEditing = null;
  document.getElementById('hlContent').value = '';
  document.getElementById('hlSaveBtn').textContent = '저장';
  document.getElementById('hlCancelBtn').style.display = 'none';
  if (clearClass) { hlSel.cls = ''; hlOpenGrade = ''; hlRenderClasses(); hlRenderStudents(); }
  else { hlRenderStudents(); }
};

// ── 그 날짜 기록 (사진의 표와 같은 모양) ──
window.hlLoad = async function () {
  const date = document.getElementById('hlDate').value;
  const el = document.getElementById('hlTable');
  if (!date) return;
  try {
    const snap = await getDocs(query(collection(db, 'homeworkLogs'), where('date', '==', date)));
    hlRows = []; snap.forEach((d) => { const r = { id: d.id, ...d.data() }; if (hlLogBranch(r) === hlBranch) hlRows.push(r); });
    hlRows.sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko') || hlClsCmp(a.classGroup, b.classGroup));
    const d = new Date(date + 'T00:00:00');
    document.getElementById('hlTableTitle').textContent = `${hlBranch} · ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}요일 · ${hlRows.length}건`;
    if (!hlRows.length) { el.innerHTML = `<tr><td colspan="5" style="color:var(--muted);padding:20px;text-align:center;">이 날짜에 입력된 ${hlEsc(hlBranch)} 숙제가 없습니다.</td></tr>`; return; }
    let prevT = null;
    el.innerHTML = hlRows.map((r) => {
      const showT = r.teacherName !== prevT; prevT = r.teacherName;
      return `<tr>
        <td style="font-weight:700;color:var(--purple, #5B3FA6);">${showT ? hlEsc(r.teacherName) + 'T' : ''}</td>
        <td style="white-space:nowrap;">${hlEsc(r.classGroup)}</td>
        <td style="font-size:12.5px;color:var(--muted);">${(r.studentNames || []).map(hlEsc).join(', ')}</td>
        <td style="color:var(--off-white);white-space:pre-wrap;">${hlEsc(r.content)}${r.source === 'teacher' ? '<div style="font-size:11px;color:#2E9E5B;margin-top:3px;">✎ 선생님 직접 입력</div>' : ''}</td>
        <td style="white-space:nowrap;"><button class="btn btn-sm btn-secondary" onclick="hlEdit('${r.id}')">수정</button> <button class="btn btn-sm btn-danger" onclick="hlDelete('${r.id}')">삭제</button></td>
      </tr>`;
    }).join('');
  } catch (e) { el.innerHTML = `<tr><td colspan="5" style="color:#D64545;padding:20px;">오류: ${hlEsc(e.message)}</td></tr>`; }
};
window.hlEdit = function (id) {
  const r = hlRows.find((x) => x.id === id); if (!r) return;
  hlEditing = id;
  hlSel.teacherUid = r.teacherUid || ''; hlSel.cls = r.classGroup || '';
  hlFillTeachers();
  document.getElementById('hlTeacher').value = r.teacherUid || '';
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
  let rows = []; snap.forEach((d) => { const r = { id: d.id, ...d.data() }; if (hlLogBranch(r) === hlBranch) rows.push(r); });
  if (!rows.length) { showMsg('hlMsg', `${hlBranch} 이전 기록이 없습니다.`, 'error'); return; }
  const last = rows.map((r) => r.date).sort().pop();
  rows = rows.filter((r) => r.date === last);
  if (!confirm(`${hlBranch} ${last} 기록 ${rows.length}건을 ${date}로 복사할까요? (내용은 그대로 복사되니 수정해 주세요)`)) return;
  for (const r of rows) {
    const { id, ...rest } = r;
    await addDoc(collection(db, 'homeworkLogs'), { ...rest, branch: hlBranch, date, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), copiedFrom: last });
  }
  showMsg('hlMsg', `✅ ${rows.length}건 복사했습니다. 내용을 고쳐주세요.`, 'success');
  hlLoad();
};

// ══ 마감용 이미지: 입력된 숙제를 사진 표와 같은 모양으로 그려서 PNG 저장/복사 ══
function hlDrawImage() {
  const date = document.getElementById('hlDate').value;
  const d = new Date(date + 'T00:00:00');
  const title = `${hlBranch} 숙제 · ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}요일`;
  const S = 2; // 선명하게 2배
  const W = 500, colW = [70, 80, 90, 260];       // 담당 · 반 · 학생 · 내용
  const rowH = 22, titleH = 32, headH = 24, pad = 4;
  const font = (b, px) => `${b ? 'bold ' : ''}${px}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
  const bands = ['#FFF2CC', '#DDEBF7', '#E2EFDA', '#FCE4D6', '#EDEDED', '#D9E1F2'];
  const rows = hlRows.slice();
  rows.sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko') || hlClsCmp(a.classGroup, b.classGroup));
  // 선생님별 묶음 → 반별 묶음(학생 1명 = 1줄, 내용은 반 단위 병합)
  const groups = [];
  rows.forEach((r) => { let g = groups.find((x) => x.teacher === r.teacherName); if (!g) { g = { teacher: r.teacherName, classes: [] }; groups.push(g); } g.classes.push(r); });
  // 칸 높이 미리 계산: 내용·반 이름이 길어 줄이 늘어나면 그 반 칸 전체를 그만큼 키움
  const lh = 16, vpad = 6;
  const mctx = document.getElementById('hlCanvas').getContext('2d');
  const wrap = (text, w) => {
    mctx.font = font(false, 12);
    return String(text || '').replace(/\r/g, '').split(/\n/).flatMap((line) => {
      const out = []; let cur = '';
      for (const ch of line) { if (cur && mctx.measureText(cur + ch).width > w - pad * 2) { out.push(cur); cur = ch; } else cur += ch; }
      out.push(cur); return out;
    });
  };
  const layout = new Map();
  rows.forEach((r) => {
    const names = (r.studentNames || []).length ? r.studentNames : ['-'];
    const cLines = wrap(r.content, colW[3]);
    const kLines = wrap(r.classGroup, colW[1]);
    const h = Math.max(names.length * rowH, cLines.length * lh + vpad * 2, kLines.length * lh + vpad * 2);
    layout.set(r, { names, cLines, kLines, h });
  });
  const H = titleH + headH + rows.reduce((a, r) => a + layout.get(r).h, 0) + 2;
  const canvas = document.getElementById('hlCanvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d'); ctx.scale(S, S);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  const x0 = 1, xs = [x0]; colW.forEach((w) => xs.push(xs[xs.length - 1] + w));
  const cell = (x, y, w, h, bg, text, bold, size = 12, align = 'center') => {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    if (text == null) return;
    ctx.fillStyle = '#111'; ctx.font = font(bold, size); ctx.textAlign = align;
    const lines = Array.isArray(text) ? text : String(text).split('\n');
    const l = Array.isArray(text) ? lh : size + 4; const y0 = y + h / 2 - (lines.length - 1) * l / 2;
    lines.forEach((ln, i) => {
      let t = ln; while (ctx.measureText(t).width > w - pad * 2 && t.length > 1) t = t.slice(0, -1);
      ctx.fillText(t, align === 'center' ? x + w / 2 : x + pad, y0 + i * l);
    });
  };
  // 제목
  cell(x0, 1, W - 2, titleH, '#FFF2CC', title, true, 14);
  let y = 1 + titleH;
  ['담당', '반', '학생', '내용'].forEach((h, i) => cell(xs[i], y, colW[i], headH, '#F5C518', h, true, 12));
  y += headH;
  groups.forEach((g, gi) => {
    const gTop = y;
    // 선생님 띠 배경을 반·학생·내용 칸에도 연하게 (글자보다 먼저 깔기)
    const gH = g.classes.reduce((a, r) => a + layout.get(r).h, 0);
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = bands[gi % bands.length]; ctx.fillRect(xs[1], gTop, W - 2 - colW[0], gH); ctx.restore();
    g.classes.forEach((r) => {
      const L = layout.get(r);
      const cTop = y, nh = L.h / L.names.length;
      L.names.forEach((n, i) => cell(xs[2], cTop + nh * i, colW[2], nh, null, n, false, 12));
      cell(xs[1], cTop, colW[1], L.h, null, L.kLines, false, 12);
      cell(xs[3], cTop, colW[3], L.h, null, L.cLines, false, 12);
      y += L.h;
    });
    cell(xs[0], gTop, colW[0], y - gTop, bands[gi % bands.length], (g.teacher || '') + 'T', true, 12);
  });
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, 1.5, W - 2, H - 2);
  return canvas;
}
window.hlPreviewImage = function () {
  if (!hlRows.length) { showMsg('hlMsg', '이 날짜에 입력된 숙제가 없습니다.', 'error'); return; }
  hlDrawImage();
  document.getElementById('hlCanvasWrap').style.display = 'block';
  document.getElementById('hlCanvas').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
window.hlDownloadImage = function () {
  if (!hlRows.length) { showMsg('hlMsg', '이 날짜에 입력된 숙제가 없습니다.', 'error'); return; }
  const canvas = hlDrawImage();
  document.getElementById('hlCanvasWrap').style.display = 'block';
  const a = document.createElement('a');
  a.download = `숙제_${hlBranch}_${document.getElementById('hlDate').value}.png`;
  a.href = canvas.toDataURL('image/png'); a.click();
};
window.hlCopyImage = async function () {
  if (!hlRows.length) { showMsg('hlMsg', '이 날짜에 입력된 숙제가 없습니다.', 'error'); return; }
  const canvas = hlDrawImage();
  document.getElementById('hlCanvasWrap').style.display = 'block';
  try {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showMsg('hlMsg', '✅ 이미지를 복사했습니다. 카톡에 붙여넣기(Ctrl+V) 하세요.', 'success');
  } catch (e) { showMsg('hlMsg', '복사가 안 되는 브라우저입니다. "이미지 저장"을 써주세요.', 'error'); }
};
