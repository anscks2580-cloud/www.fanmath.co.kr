'use strict';
/* ═══════════════════════════════════════════════════════════
   선생님 관리 · 선생님 엑셀 일괄 등록
   (admin.html에서 분리 — 원본 5363~5551줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══ 선생님 관리 ══
let teachersCache = [];

async function loadTeachers() {
  const snap = await getDocs(collection(db, 'teachers'));
  teachersCache = [];
  snap.forEach(d => teachersCache.push({ id: d.id, ...d.data() }));
  renderTeachers();
  renderTeacherSelect();
  const teacherCountEl = document.getElementById('teacherCount'); if (teacherCountEl) teacherCountEl.textContent = teachersCache.length;
}

function renderTeachers() {
  const el = document.getElementById('teacherList');
  if (!teachersCache.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 선생님이 없습니다.</div>'; return;
  }
  el.innerHTML = teachersCache.map(t => `
    <div class="student-item">
      <div class="student-name">${t.name} ${t.role === 'ta' ? '조교' : '선생님'}</div>
      ${t.role === 'ta' ? '<span class="preview-badge">조교</span>' : ''}
      <span class="student-meta">${t.branch || ''}</span>
      <span class="student-meta">${t.subject || ''}</span>
      <span class="student-meta" style="font-size:11px;">${t.memo || ''}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteTeacher('${t.id}','${t.name}')">삭제</button>
    </div>`).join('');
}

function renderTeacherSelect() {
  // 보고서 열람용
  const sel = document.getElementById('reportTeacher');
  if (sel) {
    sel.innerHTML = '<option value="">선생님을 선택하세요</option>' +
      teachersCache.map(t => `<option value="${t.id}">${t.name} (${t.branch || ''})</option>`).join('');
  }
  // 학생 등록용
  const nSel = document.getElementById('n-teacher');
  if (nSel) {
    nSel.innerHTML = '<option value="">선생님 선택...</option>' +
      teachersCache.map(t => `<option value="${t.id}">${t.name} (${t.branch || ''})</option>`).join('');
  }
  // 주간성취도 엑셀 다운로드용
  const exSel = document.getElementById('excelTeacher');
  if (exSel) {
    exSel.innerHTML = '<option value="">전체 선생님</option>' +
      teachersCache.map(t => `<option value="${t.id}">${t.name} (${t.branch || ''})</option>`).join('');
  }
  // 반별 진도 엑셀 다운로드용
  const prSel = document.getElementById('progressTeacher');
  if (prSel) {
    prSel.innerHTML = '<option value="">전체 선생님</option>' +
      teachersCache.map(t => `<option value="${t.id}">${t.name} (${t.branch || ''})</option>`).join('');
  }
  // 이번 주 기본값 설정 (공통 유틸)
  function setThisWeek(inputId) {
    const el = document.getElementById(inputId);
    if (el && !el.value) {
      const now = new Date();
      const y = now.getFullYear();
      const start = new Date(y, 0, 1);
      const w = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
      el.value = `${y}-W${String(w).padStart(2,'0')}`;
    }
  }
  setThisWeek('excelWeek');
  setThisWeek('progressWeek');
}

// ── 선생님 엑셀 일괄 등록 ──
let teacherExcelData = [];

function setupTeacherExcelDrop() {
  const input = document.getElementById('teacherExcelInput');
  input.addEventListener('change', e => parseTeacherExcel(e.target.files[0]));
  const drop = document.getElementById('teacherExcelDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); parseTeacherExcel(e.dataTransfer.files[0]); });
}

function parseTeacherExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1});
    teacherExcelData = rows.slice(1).filter(r => r[0]).map(r => ({
      name:    String(r[0]||'').trim(),
      pw:      String(r[1]||'').trim(),
      branch:  String(r[2]||'').trim() || '평촌관',
      subject: String(r[3]||'').trim(),
      memo:    String(r[4]||'').trim(),
    }));
    document.getElementById('teacherPreviewCount').textContent = `총 ${teacherExcelData.length}명`;
    document.getElementById('teacherPreviewTable').innerHTML = `
      <tr><th>이름</th><th>비밀번호</th><th>담당관</th><th>담당과목</th><th>메모</th></tr>
      ${teacherExcelData.map(r => `<tr>
        <td>${r.name}</td>
        <td>${r.pw.length >= 8 ? '✅' : '<span style="color:#ff9090">⚠️ 8자 미만</span>'}</td>
        <td>${r.branch}</td><td>${r.subject}</td><td>${r.memo||'-'}</td>
      </tr>`).join('')}`;
    document.getElementById('teacherExcelPreview').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
}

window.uploadTeacherExcel = async () => {
  if (!teacherExcelData.length) return;
  const btn = event.target;
  btn.disabled = true;
  let ok = 0, skip = 0;
  const failList = [];
  for (const row of teacherExcelData) {
    if (!row.name || !row.pw) continue;
    if (row.pw.length < 8) { failList.push(`${row.name}: 비밀번호 8자 미만`); continue; }
    try {
      const email = row.name + '@songmath.kr';
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, row.pw);
      await setDoc(doc(db, 'teachers', cred.user.uid), {
        name: row.name, branch: row.branch, subject: row.subject,
        memo: row.memo, email, createdAt: new Date().toISOString()
      });
      ok++;
    } catch(e) {
      if (e.code === 'auth/email-already-in-use') skip++;
      else failList.push(`${row.name}: ${e.code}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  let msg = `완료! 신규 ${ok}명 / 중복 ${skip}명`;
  if (failList.length) msg += ` / 실패: ${failList.join(', ')}`;
  showMsg('teacherExcelMsg', msg, ok > 0 ? 'success' : 'error');
  btn.disabled = false;
  await loadTeachers();
};

window.downloadTeacherTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['이름','비밀번호','담당관','담당과목','메모'],
    ['송문찬','12345678','평촌관','고등','고등부 전담'],
    ['조현주','12345678','평촌관','중등',''],
  ]);
  ws['!cols'] = [{wch:10},{wch:12},{wch:8},{wch:10},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '선생님목록');
  XLSX.writeFile(wb, '선생님등록양식.xlsx');
};

window.createTeacher = async () => {
  const name    = document.getElementById('t-name').value.trim();
  const pw      = document.getElementById('t-pw').value;
  const branch  = document.getElementById('t-branch').value;
  const subject = document.getElementById('t-subject').value.trim();
  const role    = document.getElementById('t-role').value;
  const memo    = document.getElementById('t-memo').value.trim();
  if (!name || !pw) { showMsg('teacherCreateMsg', '이름과 비밀번호를 입력해주세요.', 'error'); return; }
  if (pw.length < 8) { showMsg('teacherCreateMsg', '비밀번호는 8자리 이상이어야 합니다.', 'error'); return; }
  try {
    const email = name + '@songmath.kr';
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pw);
    await setDoc(doc(db, 'teachers', cred.user.uid), {
      name, branch, subject, role, memo, email,
      createdAt: new Date().toISOString()
    });
    showMsg('teacherCreateMsg', `${name} ${role === 'ta' ? '조교' : '선생님'} 계정 등록 완료!`, 'success');
    document.getElementById('t-name').value = '';
    document.getElementById('t-pw').value = '';
    document.getElementById('t-subject').value = '';
    document.getElementById('t-memo').value = '';
    await loadTeachers();
  } catch(e) {
    const msg = e.code === 'auth/email-already-in-use' ? '이미 등록된 이름입니다.' : '오류: ' + e.message;
    showMsg('teacherCreateMsg', msg, 'error');
  }
};

window.deleteTeacher = async (uid, name) => {
  if (!confirm(`${name} 선생님/조교 계정을 삭제하시겠습니까?\n(Firebase Auth 로그인 계정까지 함께 삭제되어, 이후 같은 이름으로 재등록할 수 있습니다)`)) return;
  try {
    const deleteFn = httpsCallable(functionsInstance, 'deleteTeacherAccount');
    await deleteFn({ uid });
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
    return;
  }
  await loadTeachers();
};

