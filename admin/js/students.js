'use strict';
/* ═══════════════════════════════════════════════════════════
   학생 관리: 로드 · 개별 등록 · 로그인 계정 · 엑셀 일괄 등록
   (admin.html에서 분리 — 원본 3123~3590줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 학생 로드 ──
async function loadStudents() {
  const snap = await getDocs(collection(db, 'students'));
  studentsCache = [];
  snap.forEach(d => studentsCache.push({id: d.id, ...d.data()}));
  renderStudents();
  renderAssignSelect();
  const scEl = document.getElementById('studentCount');
  if (scEl) scEl.textContent = studentsCache.length;
}

window.renderStudents = function renderStudents() {
  const el = document.getElementById('studentList');
  const q = (document.getElementById('studentSearch')?.value || '').trim().toLowerCase();
  const list = q ? studentsCache.filter(s => s.name.toLowerCase().includes(q)) : studentsCache;

  if (!list.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;">${q ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}</div>`;
    return;
  }
  el.innerHTML = list.map(s => `
    <div class="student-item">
      <div class="student-name">${s.name}</div>
      <span class="student-meta">${s.grade} · ${s.branch}</span>
      <span class="student-meta" style="color:var(--purple, #5B3FA6);font-size:12px;">${s.teacherName ? s.teacherName + ' T' : '미배정'}</span>
      <span class="student-meta" style="font-size:11px;">${(s.days||[]).join('·') || '-'}</span>
      <span class="student-meta" style="font-size:11px;color:${s.classGroup ? 'var(--gold)' : 'var(--muted)'};">${s.classGroup || '반 미배정'}</span>
      <span class="student-meta" style="font-size:11px;">영상접근 ${(s.assignedTags||[]).length}개</span>
      <button class="btn btn-secondary btn-sm" onclick="openEditModal('${s.id}')">✏️ 수정</button>
      <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}','${s.name}')">삭제</button>
    </div>`).join('');
}

function renderAssignSelect() {
  renderAssignStudentList();
}

window.renderAssignStudentList = function() {
  const el = document.getElementById('assignStudentList');
  if (!el) return;
  const q = (document.getElementById('assignStudentSearch')?.value || '').trim().toLowerCase();
  const selectedUid = document.getElementById('assignStudent').value;

  const list = studentsCache
    .filter(s => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  if (!list.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:10px;">${q ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}</div>`;
    return;
  }

  el.innerHTML = list.map(s => `
    <div class="student-item" style="cursor:pointer;margin-bottom:6px;${s.id === selectedUid ? 'border-color:var(--gold);background:rgba(245,197,24,0.08);' : ''}" onclick="selectAssignStudent('${s.id}')">
      <div class="student-name">${s.name}</div>
      <span class="student-meta">${s.grade} · ${s.branch}</span>
      <span class="student-meta" style="font-size:11px;">영상접근 ${(s.assignedTags||[]).length}개</span>
    </div>`).join('');
};

window.selectAssignStudent = function(uid) {
  document.getElementById('assignStudent').value = uid;
  renderAssignStudentList();
  loadStudentVideos();
};

// ── 개별 학생 등록 ──
window.createStudent = async () => {
  const name = document.getElementById('n-name').value.trim();
  const phone = document.getElementById('n-phone').value.trim().replace(/-/g,'');
  const grade = document.getElementById('n-grade').value;
  const branch = document.getElementById('n-branch').value;
  const teacherUid = document.getElementById('n-teacher').value;
  const teacherName = teacherUid ? (teachersCache.find(t => t.id === teacherUid)?.name || '') : '';
  const days = [...document.querySelectorAll('.n-day:checked')].map(c => c.value);
  const classGroup = document.getElementById('n-classgroup').value.trim();
  const parentPhone = (document.getElementById('n-parentphone')?.value || '').replace(/[^0-9]/g, '');
  if (!name || !phone) { showMsg('createMsg','이름과 전화번호를 입력해주세요.','error'); return; }

  try {
    const email = name + '@songmath.kr';
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
    const assignedTags = collectCheckedTags('n-tagChecklist');
    await setDoc(doc(db, 'students', cred.user.uid), {
      name, phone, grade, branch, assignedTags,
      teacherUid, teacherName, days, classGroup,
      createdAt: new Date().toISOString()
    });
    let parentNote = '';
    if (parentPhone && typeof window.linkParentAccount === 'function') {
      try { await linkParentAccount({ id: cred.user.uid, name }, parentPhone); parentNote = ' · 학부모 계정 생성'; }
      catch (e) { parentNote = ' · ⚠️ 학부모 계정 실패: ' + e.message; }
    }
    showMsg('createMsg', `${name} 학생 등록 완료! (영상 접근 ${assignedTags.length}개 카테고리)${parentNote}`, parentNote.includes('⚠️') ? 'error' : 'success');
    document.getElementById('n-name').value = '';
    document.getElementById('n-phone').value = '';
    if (document.getElementById('n-parentphone')) document.getElementById('n-parentphone').value = '';
    document.getElementById('n-classgroup').value = '';
    renderTagChecklist('n-tagChecklist', []);
    await loadStudents();
  } catch(e) {
    showMsg('createMsg', e.code === 'auth/email-already-in-use' ? '이미 등록된 학생입니다.' : '오류: '+e.message, 'error');
  }
};

let editingStudentId = null;

window.openEditModal = function(uid) {
  const s = studentsCache.find(st => st.id === uid);
  if (!s) return;
  editingStudentId = uid;

  document.getElementById('edit-name').value  = s.name || '';
  document.getElementById('edit-phone').value = s.phone || '';
  document.getElementById('edit-newpw').value = '';
  checkStudentAuth(uid);

  document.getElementById('edit-grade').value  = s.grade || '중1';
  document.getElementById('edit-branch').value = s.branch || '평촌관';
  document.getElementById('edit-classgroup').value = s.classGroup || '';
  document.getElementById('edit-parentphone').value = s.parentPhone || '';
  document.getElementById('edit-parentStatus').textContent = s.parentUid ? `✅ 학부모 계정 연결됨 (아이디 ${s.name} · 비밀번호 ${s.parentPhone || ''})` : '학부모 계정 없음 — 번호를 넣고 저장하면 만들어집니다';

  // 선생님 드롭다운 채우기
  const tSel = document.getElementById('edit-teacher');
  tSel.innerHTML = '<option value="">선생님 선택...</option>' +
    teachingTeachers().map(t => `<option value="${t.id}" ${t.id === s.teacherUid ? 'selected' : ''}>${t.name} (${t.branch||''})</option>`).join('');

  // 요일 체크박스
  document.querySelectorAll('.edit-day').forEach(cb => {
    cb.checked = (s.days || []).includes(cb.value);
  });

  // 영상 접근 태그 체크박스
  renderTagChecklist('edit-tagChecklist', s.assignedTags || []);

  // 메시지 초기화
  const msg = document.getElementById('editStudentMsg');
  msg.style.display = 'none';

  const modal = document.getElementById('editStudentModal');
  modal.style.display = 'flex';
};

window.closeEditModal = function() {
  document.getElementById('editStudentModal').style.display = 'none';
  editingStudentId = null;
};

// ── 학생 로그인 계정(Auth) 관련 ──
const STUDENT_EMAIL_DOMAIN = '@songmath.kr';

function authErrMsg(e) {
  const code = e?.code || '';
  if (code === 'functions/not-found') {
    return 'updateStudentAuth 클라우드 함수가 배포되어 있는지 확인해주세요.';
  }
  return e?.message || String(e);
}

function decodeLocalPart(email) {
  const local = (email || '').split('@')[0];
  try { return decodeURIComponent(local); } catch { return local; }
}

// 실제 Firebase Auth에 저장된 로그인 계정 상태 확인
window.checkStudentAuth = async function(uid) {
  const box = document.getElementById('edit-authStatus');
  box.style.color = 'var(--muted)';
  box.textContent = '로그인 계정 확인 중...';
  try {
    const fn = httpsCallable(functionsInstance, 'updateStudentAuth');
    const res = await fn({ uid, checkOnly: true });
    if (editingStudentId !== uid) return; // 그 사이 다른 학생 모달로 바뀐 경우
    const d = res.data || {};
    const s = studentsCache.find(st => st.id === uid) || {};
    if (!d.exists) {
      box.style.color = '#D64545';
      box.innerHTML = '⚠️ 로그인 계정(Auth)이 없습니다. 아래 <b>로그인 계정 즉시 맞추기</b>를 누르면 새로 만들어집니다.';
      return;
    }
    const authName = decodeLocalPart(d.email);
    const lastLogin = d.lastSignIn ? new Date(d.lastSignIn).toLocaleString('ko-KR') : '기록 없음';
    const disabledTxt = d.disabled ? ' · <b style="color:#D64545;">계정 비활성화됨</b>' : '';
    if (authName === s.name && d.email === s.name + STUDENT_EMAIL_DOMAIN) {
      box.style.color = '#2E9E5B';
      box.innerHTML = `✅ 로그인 아이디 정상 (<b>${authName}</b>) · 최근 로그인: ${lastLogin}${disabledTxt}<br>
        <span style="color:var(--muted);">※ 비밀번호는 보안상 조회가 안 됩니다. 로그인이 안 되면 비밀번호를 다시 설정해주세요.</span>`;
    } else {
      box.style.color = '#D97B1A';
      box.innerHTML = `⚠️ 실제 로그인 아이디가 학생 이름과 다릅니다.<br>
        · 등록된 이름: <b>${s.name || '-'}</b><br>
        · 실제 로그인 아이디: <b>${authName || '-'}</b> <span style="color:var(--muted);">(${d.email || '-'})</span><br>
        → <b>로그인 계정 즉시 맞추기</b>를 누르면 이름 기준으로 수정됩니다.${disabledTxt}`;
    }
  } catch (e) {
    if (editingStudentId !== uid) return;
    box.style.color = '#D64545';
    box.textContent = '로그인 계정 확인 실패: ' + authErrMsg(e);
  }
};

window.fillPwWithPhone = function() {
  const phone = document.getElementById('edit-phone').value.trim().replace(/-/g, '');
  document.getElementById('edit-newpw').value = phone;
};

// 현재 입력된 이름/전화번호(또는 새 비밀번호) 기준으로 Auth 계정 강제 동기화
window.syncStudentAuth = async function() {
  if (!editingStudentId) return;
  const uid   = editingStudentId;
  const name  = document.getElementById('edit-name').value.trim();
  const phone = document.getElementById('edit-phone').value.trim().replace(/-/g, '');
  const newPw = document.getElementById('edit-newpw').value.trim();
  const password = newPw || phone;

  if (!name) { showMsg('editStudentMsg', '이름을 입력해주세요.', 'error'); return; }
  if (!password || password.length < 6) {
    showMsg('editStudentMsg', '비밀번호(또는 전화번호)는 6자 이상이어야 합니다.', 'error'); return;
  }
  if (!confirm(`로그인 계정을 아래처럼 설정합니다.\n\n아이디: ${name}\n비밀번호: ${password}\n\n진행할까요?`)) return;

  try {
    const fn = httpsCallable(functionsInstance, 'updateStudentAuth');
    const res = await fn({ uid, name, password });
    await updateDoc(doc(db, 'students', uid), { name, phone });
    document.getElementById('edit-newpw').value = '';
    showMsg('editStudentMsg', res.data?.created
      ? '✅ 로그인 계정을 새로 만들었습니다.'
      : '✅ 로그인 계정이 수정되었습니다.', 'success');
    await loadStudents();
    checkStudentAuth(uid);
  } catch (e) {
    showMsg('editStudentMsg', '오류: ' + authErrMsg(e), 'error');
  }
};

window.saveEditStudent = async function() {
  if (!editingStudentId) return;
  const uid        = editingStudentId;
  const s          = studentsCache.find(st => st.id === uid) || {};
  const name       = document.getElementById('edit-name').value.trim();
  const phone      = document.getElementById('edit-phone').value.trim().replace(/-/g, '');
  const newPw      = document.getElementById('edit-newpw').value.trim();
  const grade      = document.getElementById('edit-grade').value;
  const branch     = document.getElementById('edit-branch').value;
  const teacherUid = document.getElementById('edit-teacher').value;
  const teacherName = teacherUid ? (teachersCache.find(t => t.id === teacherUid)?.name || '') : '';
  const days       = [...document.querySelectorAll('.edit-day:checked')].map(cb => cb.value);
  const classGroup = document.getElementById('edit-classgroup').value.trim();
  const assignedTags = collectCheckedTags('edit-tagChecklist');

  if (!name || !phone) { showMsg('editStudentMsg', '이름과 전화번호를 입력해주세요.', 'error'); return; }

  const nameChanged  = name !== (s.name || '');
  const phoneChanged = phone !== (s.phone || '');
  // 비밀번호: 직접 입력값 우선, 없으면 전화번호가 바뀐 경우에만 새 전화번호로
  const password = newPw || (phoneChanged ? phone : '');
  if (password && password.length < 6) {
    showMsg('editStudentMsg', '비밀번호는 6자 이상이어야 합니다.', 'error'); return;
  }

  try {
    // 1) 로그인 정보가 바뀌는 경우 Auth 먼저 수정 (실패하면 Firestore도 건드리지 않음)
    if (nameChanged || password) {
      const msgs = [];
      if (nameChanged) msgs.push(`아이디: ${s.name || '-'} → ${name}`);
      if (password)    msgs.push(`비밀번호: ${password}`);
      if (!confirm(`로그인 정보도 함께 변경됩니다.\n\n${msgs.join('\n')}\n\n진행할까요?`)) return;

      const fn = httpsCallable(functionsInstance, 'updateStudentAuth');
      const payload = { uid, name };
      if (password) payload.password = password;
      await fn(payload);
    }

    // 2) Firestore 학생 정보 저장
    await updateDoc(doc(db, 'students', uid), {
      name, phone, grade, branch, teacherUid, teacherName, days, classGroup, assignedTags
    });
    // 3) 학부모 계정: 이름이 바뀌면 학부모 아이디(이름.p)도 같이 변경
    let parentNote = '';
    if (nameChanged && s.parentUid && typeof window.renameParentAccount === 'function') {
      try { const r = await renameParentAccount({ ...s, id: uid }, s.name, name); if (r === 'renamed') parentNote += ' · 학부모 아이디 변경됨'; else if (r === 'recreated') parentNote += ' · 학부모 계정 새 이름으로 재생성(비밀번호는 학부모 번호)'; }
      catch (e) { parentNote += ' · ⚠️ ' + e.message; }
    }
    const parentPhone = (document.getElementById('edit-parentphone')?.value || '').replace(/[^0-9]/g, '');
    if (parentPhone && typeof window.linkParentAccount === 'function') {
      try {
        const r = await linkParentAccount({ ...s, id: uid, name }, parentPhone);
        if (r === 'created') parentNote = ' · 학부모 계정 생성됨'; else if (r === 'updated') parentNote = ' · 학부모 번호 변경됨';
      } catch (e) { parentNote = ' · ⚠️ 학부모 계정: ' + e.message; }
    }
    showMsg('editStudentMsg', ((nameChanged || password) ? '✅ 저장 완료! (로그인 정보 포함)' : '✅ 저장 완료!') + parentNote, parentNote.includes('⚠️') ? 'error' : 'success');
    await loadStudents();
    setTimeout(() => closeEditModal(), 900);
  } catch(e) {
    showMsg('editStudentMsg', '오류: ' + authErrMsg(e), 'error');
  }
};

// 모달 바깥 클릭 시 닫기
document.getElementById('editStudentModal').addEventListener('click', function(e) {
  if (e.target === this) closeEditModal();
});

window.deleteStudent = async (uid, name) => {
  if (!confirm(`${name} 학생을 삭제하시겠습니까?\n(로그인 계정도 함께 삭제되어, 이후 같은 정보로 재등록할 수 있습니다)`)) return;
  try {
    const deleteFn = httpsCallable(functionsInstance, 'deleteStudentAccount');
    await deleteFn({ uid });
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
    return;
  }
  await loadStudents();
};

window.deleteAllStudents = async () => {
  if (!confirm(`⚠️ 등록된 학생 ${studentsCache.length}명을 모두 삭제합니다.

Firestore 데이터만 삭제되며, Firebase Auth 계정은 Firebase Console → Authentication에서 별도로 삭제해야 합니다.

계속하시겠습니까?`)) return;
  if (!confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;

  const btn = document.querySelector('[onclick="deleteAllStudents()"]');
  btn.disabled = true; btn.textContent = '삭제 중...';

  let count = 0;
  const BATCH_SIZE = 10;
  for (let i = 0; i < studentsCache.length; i += BATCH_SIZE) {
    const batch = studentsCache.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(s => deleteDoc(doc(db, 'students', s.id))));
    count += batch.length;
    btn.textContent = `삭제 중... (${count}/${studentsCache.length})`;
  }

  btn.disabled = false; btn.textContent = '🗑 전체 학생 삭제';
  showMsg('createMsg', `✅ ${count}명 삭제 완료! Auth 계정은 Firebase Console에서 삭제하세요.`, 'success');
  await loadStudents();
};

// ── 엑셀 업로드 ──
let excelData = [];

function setupExcelDrop() {
  const input = document.getElementById('excelFileInput');
  input.addEventListener('change', e => parseExcel(e.target.files[0]));

  // 드래그 이벤트는 document에 위임 (탭 전환 후에도 동작)
  document.addEventListener('dragover', e => {
    const drop = document.getElementById('excelDrop');
    if (drop && drop.contains(e.target)) {
      e.preventDefault();
      drop.classList.add('drag');
    }
  });

  document.addEventListener('dragleave', e => {
    const drop = document.getElementById('excelDrop');
    if (drop && !drop.contains(e.relatedTarget)) {
      drop.classList.remove('drag');
    }
  });

  document.addEventListener('drop', e => {
    const drop = document.getElementById('excelDrop');
    if (drop && drop.contains(e.target)) {
      e.preventDefault();
      drop.classList.remove('drag');
      parseExcel(e.dataTransfer.files[0]);
    }
  });
}

function parseExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1});

    // 헤더 제거 후 파싱
    excelData = rows.slice(1).filter(r => r[0]).map(r => {
      const teacherName = String(r[4]||'').trim();
      const dayStr      = String(r[5]||'').trim();
      // 요일 파싱: "월수금" → ["월","수","금"]
      const dayMap = {'월':'월','화':'화','수':'수','목':'목','금':'금','토':'토'};
      const days = dayStr.split('').filter(ch => dayMap[ch]);
      // 선생님 UID 매칭
      const teacher = teachingTeachers().find(t => t.name === teacherName);
      return {
        name: String(r[0]||'').trim(),
        phone: String(r[1]||'').trim().replace(/-/g,''),
        grade: String(r[2]||'').trim(),
        branch: String(r[3]||'').trim() || '평촌관',
        teacherName, teacherUid: teacher?.id || '',
        days,
        parentPhone: String(r[6]||'').replace(/[^0-9]/g, ''),
      };
    });

    document.getElementById('previewCount').textContent = `총 ${excelData.length}명`;
    document.getElementById('previewTable').innerHTML = `
      <tr><th>이름</th><th>전화번호</th><th>학년</th><th>관할</th><th>담당선생님</th><th>요일</th><th>학부모전화</th><th>강의</th></tr>
      ${excelData.map(r => `<tr>
        <td>${r.name}</td>
        <td>${r.phone}</td>
        <td><span class="preview-badge">${r.grade}</span></td>
        <td>${r.branch}</td>
        <td style="color:${r.teacherUid?'var(--gold)':'#D64545'};">${r.teacherName||'-'} ${r.teacherUid?'✅':'⚠️미매칭'}</td>
        <td>${r.days.join('·')||'-'}</td>
        <td>${r.parentPhone||'-'}</td>
        <td style="color:var(--purple, #5B3FA6);">${recommendTags(r.grade, r.branch, r.teacherName).length}개</td>
      </tr>`).join('')}`;
    document.getElementById('excelPreview').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
}

window.uploadExcel = async () => {
  if (!excelData.length) return;
  const autoAssign = document.getElementById('e-autoAssign').checked;
  const btn = document.querySelector('#tab-excel .btn-primary');
  btn.disabled = true;
  let ok = 0, skip = 0;
  const failList = [];

  for (let i = 0; i < excelData.length; i++) {
    const row = excelData[i];
    if (!row.name || !row.phone) continue;
    btn.textContent = `등록 중... (${i+1}/${excelData.length}) 성공:${ok}`;

    const phone = row.phone.replace(/-/g,'').replace(/\s/g,'');

    // 비밀번호 최소 6자리 체크
    if (phone.length < 6) {
      failList.push(`${row.name}: 전화번호 짧음(${phone})`);
      continue;
    }

    try {
      const email = row.name + '@songmath.kr';
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
      const assignedTags = autoAssign ? recommendTags(row.grade, row.branch, row.teacherName) : [];
      await setDoc(doc(db, 'students', cred.user.uid), {
        name: row.name, phone: phone,
        grade: row.grade, branch: row.branch,
        teacherUid: row.teacherUid || '',
        teacherName: row.teacherName || '',
        days: row.days || [],
        assignedTags, createdAt: new Date().toISOString()
      });
      ok++;
      if (row.parentPhone && typeof window.linkParentAccount === 'function') {
        try { await linkParentAccount({ id: cred.user.uid, name: row.name }, row.parentPhone); }
        catch (e) { failList.push(`${row.name} 학부모 계정: ${e.message}`); }
      }
    } catch(e) {
      if (e.code === 'auth/email-already-in-use') {
        skip++;
      } else if (e.code === 'auth/too-many-requests') {
        // rate limit → 3초 대기 후 재시도
        await new Promise(r => setTimeout(r, 3000));
        i--; // 현재 항목 재시도
        continue;
      } else {
        failList.push(`${row.name}: ${e.code}`);
      }
    }
    // 매 3명마다 500ms 대기
    if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 500));
  }

  let msg = `완료! 신규 ${ok}명 / 중복(스킵) ${skip}명`;
  if (failList.length > 0) msg += ` / 실패 ${failList.length}명: ${failList.join(', ')}`;
  showMsg('excelMsg', msg, ok > 0 ? 'success' : 'error');
  btn.disabled = false; btn.textContent = '일괄 등록';
  await loadStudents();
};

window.downloadTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['이름','전화번호','학년','관할','담당선생님','요일','학부모전화'],
    ['홍길동','01012345678','고1','평촌관','송문찬','월수금','01099990000'],
    ['김철수','01087654321','중3','산본관','송우찬','화목','01088880000'],
    ['이영희','01011112222','고2','평촌관','송문찬','월화수목금',''],
  ]);
  ws['!cols'] = [{wch:10},{wch:14},{wch:6},{wch:8},{wch:10},{wch:10},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '학생목록');
  XLSX.writeFile(wb, '학생등록양식_v2.xlsx');
};

