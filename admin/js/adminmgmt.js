'use strict';
/* ═══════════════════════════════════════════════════════════
   관리자 계정 관리 · 역할
   (admin.html에서 분리 — 원본 8510~8703줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 관리자 계정 관리
// ══════════════════════════════════════════
let adminsCache = [];

window.initAdminMgmtTab = async function() {
  await loadAdmins();
};

// ── 내 비밀번호 변경 (본인, Firebase Auth 클라이언트 SDK로 직접) ──
window.changeMyPassword = async function() {
  const currentPw = document.getElementById('mypw-current').value;
  const newPw     = document.getElementById('mypw-new').value;
  if (!currentPw || !newPw) {
    showMsg('myPwMsg', '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.', 'error'); return;
  }
  if (newPw.length < 8) {
    showMsg('myPwMsg', '새 비밀번호는 8자리 이상이어야 합니다.', 'error'); return;
  }
  try {
    const user = auth.currentUser;
    // 최근 로그인 요구사항 대비: 현재 비밀번호로 재인증 후 변경
    const cred = EmailAuthProvider.credential(user.email, currentPw);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPw);
    showMsg('myPwMsg', '✅ 비밀번호가 변경되었습니다.', 'success');
    document.getElementById('mypw-current').value = '';
    document.getElementById('mypw-new').value = '';
  } catch(e) {
    const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
      ? '현재 비밀번호가 올바르지 않습니다.'
      : '오류: ' + e.message;
    showMsg('myPwMsg', msg, 'error');
  }
};

async function loadAdmins() {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    adminsCache = [];
    snap.forEach(d => adminsCache.push({ id: d.id, ...d.data() }));
    renderAdmins();
    const adminCountEl = document.getElementById('adminCount'); if (adminCountEl) adminCountEl.textContent = adminsCache.length;
  } catch(e) {
    document.getElementById('adminList').innerHTML =
      `<div style="color:#D64545;font-size:13px;">오류: ${e.message}</div>`;
  }
}

function renderAdmins() {
  const el = document.getElementById('adminList');
  if (!adminsCache.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 관리자가 없습니다.</div>';
    return;
  }
  el.innerHTML = adminsCache.map(a => `
    <div class="student-item">
      <div class="student-name">${a.name || '(이름 없음)'}</div>
      <span class="student-meta">${a.email || ''}</span>
      <span class="student-meta" style="color:var(--purple, #5B3FA6);font-size:12px;">${a.branch || ''}</span>
      <span class="adm-role-chip${a.role === 'office' ? ' office' : ''}">${a.role === 'office' ? '관리부' : '원장'}${Array.isArray(a.menuGroups) && a.menuGroups.length ? ' · 메뉴 직접 지정' : ''}</span>
      <span class="student-meta" style="font-size:11px;color:var(--muted);">
        ${a.createdAt ? new Date(a.createdAt).toLocaleDateString('ko-KR') : ''}
      </span>
      <button class="btn btn-secondary btn-sm" onclick="openEditAdminModal('${a.id}')">수정</button>
      <button class="btn btn-danger btn-sm" onclick="deleteAdmin('${a.id}','${(a.name||'').replace(/'/g,'\\$&')}')">삭제</button>
    </div>`).join('');
}

window.createAdmin = async () => {
  const name   = document.getElementById('adm-name').value.trim();
  const email  = document.getElementById('adm-email').value.trim();
  const pw     = document.getElementById('adm-pw').value;
  const branch = document.getElementById('adm-branch').value;

  if (!name || !email || !pw) {
    showMsg('adminCreateMsg', '이름, 이메일, 비밀번호를 모두 입력해주세요.', 'error'); return;
  }
  if (pw.length < 8) {
    showMsg('adminCreateMsg', '비밀번호는 8자리 이상이어야 합니다.', 'error'); return;
  }

  try {
    // secondaryAuth로 Auth 계정 생성 (현재 로그인 유지)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pw);
    await setDoc(doc(db, 'admins', cred.user.uid), {
      name, email, branch,
      role: (document.getElementById('adm-role')?.value || 'master'), // 'master' 원장(전체) · 'office' 관리부
      createdAt: new Date().toISOString()
    });
    showMsg('adminCreateMsg', `✅ ${name} 관리자 계정이 등록되었습니다.`, 'success');
    document.getElementById('adm-name').value  = '';
    document.getElementById('adm-email').value = '';
    document.getElementById('adm-pw').value    = '';
    await loadAdmins();
  } catch(e) {
    const msg = e.code === 'auth/email-already-in-use'
      ? '이미 등록된 이메일입니다.'
      : e.code === 'auth/invalid-email'
      ? '이메일 형식이 올바르지 않습니다.'
      : '오류: ' + e.message;
    showMsg('adminCreateMsg', msg, 'error');
  }
};

let editingAdminId = null;

window.openEditAdminModal = function(uid) {
  const a = adminsCache.find(ad => ad.id === uid);
  if (!a) return;
  editingAdminId = uid;

  document.getElementById('edit-adm-name').value   = a.name || '';
  document.getElementById('edit-adm-branch').value = a.branch || '평촌관';
  const roleSel = document.getElementById('edit-adm-role'); if (roleSel) roleSel.value = a.role === 'office' ? 'office' : 'master';
  admRenderGroupChecks(Array.isArray(a.menuGroups) ? a.menuGroups : []);
  document.getElementById('edit-adm-newpw').value  = '';

  const msg = document.getElementById('editAdminMsg');
  msg.style.display = 'none';

  document.getElementById('editAdminModal').style.display = 'flex';
};

window.closeEditAdminModal = function() {
  document.getElementById('editAdminModal').style.display = 'none';
  editingAdminId = null;
};

window.saveEditAdmin = async function() {
  if (!editingAdminId) return;
  const name   = document.getElementById('edit-adm-name').value.trim();
  const branch = document.getElementById('edit-adm-branch').value;

  if (!name) {
    showMsg('editAdminMsg', '이름을 입력해주세요.', 'error'); return;
  }

  try {
    const role = document.getElementById('edit-adm-role')?.value === 'office' ? 'office' : 'master';
    const menuGroups = Array.from(document.querySelectorAll('#edit-adm-groups input:checked')).map(i => i.value);
    await updateDoc(doc(db, 'admins', editingAdminId), { name, branch, role, menuGroups });
    if (editingAdminId === auth.currentUser?.uid) showMsg('editAdminMsg', '내 계정의 메뉴 설정은 새로고침 후 적용됩니다.', 'success');
    showMsg('editAdminMsg', '✅ 저장 완료!', 'success');
    await loadAdmins();
    setTimeout(() => closeEditAdminModal(), 900);
  } catch(e) {
    showMsg('editAdminMsg', '오류: ' + e.message, 'error');
  }
};

window.sendAdminPasswordReset = async function() {
  if (!editingAdminId) return;
  const a = adminsCache.find(ad => ad.id === editingAdminId);
  if (!a || !a.email) {
    showMsg('editAdminMsg', '이메일 정보가 없습니다.', 'error'); return;
  }
  try {
    await sendPasswordResetEmail(auth, a.email);
    showMsg('editAdminMsg', `📧 ${a.email}(으)로 재설정 메일을 보냈습니다.`, 'success');
  } catch(e) {
    showMsg('editAdminMsg', '오류: ' + e.message, 'error');
  }
};

// ── 다른 관리자 비밀번호 즉시 변경 (Cloud Function, Admin SDK 필요) ──
window.setAdminPasswordDirect = async function() {
  if (!editingAdminId) return;
  const newPw = document.getElementById('edit-adm-newpw').value;
  if (!newPw || newPw.length < 8) {
    showMsg('editAdminMsg', '새 비밀번호는 8자리 이상이어야 합니다.', 'error'); return;
  }
  const a = adminsCache.find(ad => ad.id === editingAdminId);
  if (!confirm(`"${a?.name || ''}" 관리자의 비밀번호를 즉시 변경하시겠습니까?`)) return;
  try {
    const resetFn = httpsCallable(functionsInstance, 'adminResetPassword');
    await resetFn({ uid: editingAdminId, newPassword: newPw });
    showMsg('editAdminMsg', '✅ 비밀번호가 변경되었습니다.', 'success');
    document.getElementById('edit-adm-newpw').value = '';
  } catch(e) {
    showMsg('editAdminMsg', '오류: ' + e.message + ' (adminResetPassword 클라우드 함수가 배포되어 있는지 확인해주세요)', 'error');
  }
};

// 모달 바깥 클릭 시 닫기
document.getElementById('editAdminModal').addEventListener('click', function(e) {
  if (e.target === this) closeEditAdminModal();
});

window.deleteAdmin = async (uid, name) => {
  if (!confirm(`"${name}" 관리자를 삭제하시겠습니까?\nFirebase Auth 로그인 계정까지 함께 삭제됩니다.`)) return;
  try {
    const deleteFn = httpsCallable(functionsInstance, 'deleteAdminAccount');
    await deleteFn({ uid });
    showMsg('adminCreateMsg', `${name} 삭제 완료 (Auth 계정 포함).`, 'success');
    await loadAdmins();
  } catch(e) {
    showMsg('adminCreateMsg', '오류: ' + e.message, 'error');
  }
};


// ── 역할 · 보이는 메뉴 (admin/js/nav.js의 그룹 목록 사용) ──
function admRenderGroupChecks(selected) {
  const el = document.getElementById('edit-adm-groups');
  if (!el) return;
  const groups = typeof window.adminGroupList === 'function' ? window.adminGroupList() : [];
  const set = new Set(selected || []);
  el.innerHTML = groups.map(g => `<label><input type="checkbox" value="${g.id}" ${set.has(g.id) ? 'checked' : ''}> ${g.icon} ${g.label} <span style="color:var(--muted);font-size:11px;">(${g.items.length})</span></label>`).join('');
}
window.admRoleChanged = function() {
  // 역할을 바꾸면 직접 지정은 비움 (역할 기본값 사용)
  admRenderGroupChecks([]);
};

