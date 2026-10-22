'use strict';
/* ═══════════════════════════════════════════════════════════
   학부모 계정 (관리자)
   - 학생 1명 ↔ 학부모 계정 1개. 로그인 아이디는 학생 이름 그대로, 비밀번호는 학부모 전화번호.
     (내부적으로는 이름.p@songmath.kr 계정이 따로 만들어지고 login.html이 학생→학부모 순서로 시도)
   - students/{uid}: parentPhone, parentUid  /  parents/{parentUid}: studentId, studentName, phone
   - 전화번호를 바꾸면 비밀번호도 바뀜 (예전 번호로 로그인해 변경 → 예전 번호를 모르면 재생성 안내)
   ═══════════════════════════════════════════════════════════ */
const pEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pDigits = (v) => String(v || '').replace(/[^0-9]/g, '');
const pIsMiddle = (s) => { const g = String(s?.grade || '').trim(); return !(g.startsWith('고') || /N수|재수|졸업/.test(g)); };
let pFilter = 'all';

// ── 핵심: 학생에 학부모 전화번호 연결 (계정 생성/비번 변경 포함) ──
// 반환: 'created' | 'updated' | 'unchanged'
window.linkParentAccount = async function (student, parentPhoneRaw) {
  const phone = pDigits(parentPhoneRaw);
  if (!phone) throw new Error('학부모 전화번호가 비어 있습니다.');
  if (phone.length < 6) throw new Error('전화번호가 너무 짧습니다 (비밀번호로 쓰이므로 6자리 이상).');
  const email = `${student.name}.p@songmath.kr`;

  if (student.parentUid) {
    if (pDigits(student.parentPhone) === phone) return 'unchanged';
    // 번호 변경 = 비밀번호 변경: 예전 번호로 로그인해서 바꿈
    try {
      const cred = await signInWithEmailAndPassword(secondaryAuth, email, pDigits(student.parentPhone));
      await updatePassword(cred.user, phone);
      await signOut(secondaryAuth);
    } catch (e) {
      throw new Error('학부모 비밀번호 변경 실패 (예전 번호가 맞지 않음). 관리자 계정 탭에서 재설정하거나 담당자에게 알려주세요: ' + (e.code || e.message));
    }
    await updateDoc(doc(db, 'students', student.id), { parentPhone: phone });
    await updateDoc(doc(db, 'parents', student.parentUid), { phone, updatedAt: new Date().toISOString() });
    return 'updated';
  }

  // 새 계정
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
    uid = cred.user.uid;
    await signOut(secondaryAuth);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      // 계정은 있는데 연결 문서가 없는 경우(이전 시도 중단 등): 그 번호로 로그인해서 uid 확보
      try { const cred = await signInWithEmailAndPassword(secondaryAuth, email, phone); uid = cred.user.uid; await signOut(secondaryAuth); }
      catch (e2) { throw new Error('이미 학부모 계정이 있지만 번호가 달라 연결할 수 없습니다. 담당자에게 알려주세요.'); }
    } else throw e;
  }
  await setDoc(doc(db, 'parents', uid), { studentId: student.id, studentName: student.name, phone, createdAt: new Date().toISOString() });
  await updateDoc(doc(db, 'students', student.id), { parentPhone: phone, parentUid: uid });
  return 'created';
};

// ── 탭 ──
window.initParentsTab = async function () {
  if (!studentsCache.length) await loadStudents();
  renderParentsTab();
};
window.setParentsFilter = function (f, btn) {
  pFilter = f;
  document.querySelectorAll('.pa-filter').forEach((b) => b.classList.toggle('active', b === btn));
  renderParentsTab();
};
function renderParentsTab() {
  const q = (document.getElementById('paSearch')?.value || '').trim();
  let list = studentsCache.filter(pIsMiddle);
  if (pFilter === 'linked') list = list.filter((s) => s.parentUid);
  if (pFilter === 'unlinked') list = list.filter((s) => !s.parentUid);
  if (q) list = list.filter((s) => (s.name || '').includes(q));
  list.sort((a, b) => (a.classGroup || '').localeCompare(b.classGroup || '', 'ko') || (a.name || '').localeCompare(b.name || '', 'ko'));
  const all = studentsCache.filter(pIsMiddle);
  document.getElementById('paStat').innerHTML = `초·중등 <b>${all.length}</b>명 · 연결됨 <b>${all.filter((s) => s.parentUid).length}</b> · 미연결 <b>${all.filter((s) => !s.parentUid).length}</b>`;
  const body = document.getElementById('paBody');
  if (!list.length) { body.innerHTML = '<tr><td colspan="6" style="color:var(--muted);padding:20px;text-align:center;">해당 학생이 없습니다.</td></tr>'; return; }
  body.innerHTML = list.map((s) => `
    <tr id="pa-${s.id}">
      <td style="font-weight:600;color:var(--off-white);">${pEsc(s.name)} <span style="font-size:11px;color:var(--muted);">${pEsc(s.grade || '')}</span></td>
      <td>${pEsc(s.classGroup || '-')}</td>
      <td>${pEsc(s.teacherName || '-')}</td>
      <td><input type="text" class="pa-in" id="pa-phone-${s.id}" value="${pEsc(s.parentPhone || '')}" placeholder="학부모 전화번호" inputmode="numeric"></td>
      <td>${s.parentUid ? '<span class="pa-st on">연결됨</span>' : '<span class="pa-st">미연결</span>'}</td>
      <td style="white-space:nowrap;"><button class="btn btn-sm btn-primary" onclick="paLinkOne('${s.id}')">${s.parentUid ? '번호 변경' : '연결'}</button></td>
    </tr>`).join('');
}
window.paLinkOne = async function (uid) {
  const s = studentsCache.find((x) => x.id === uid); if (!s) return;
  const phone = document.getElementById(`pa-phone-${uid}`).value;
  try {
    const r = await linkParentAccount(s, phone);
    showMsg('paMsg', r === 'created' ? `✅ ${s.name} 학부모 계정 생성 (아이디: ${s.name} / 비밀번호: 학부모 번호)` : r === 'updated' ? `✅ ${s.name} 학부모 번호·비밀번호 변경` : `${s.name}: 변경 없음`, 'success');
    await loadStudents(); renderParentsTab();
  } catch (e) { showMsg('paMsg', `${s.name}: ${e.message}`, 'error'); }
};

// ── 엑셀 일괄 연결: 열 = 이름, 학부모전화 (헤더 이름은 자유, 첫 열 이름 · 둘째 열 번호) ──
window.paImportExcel = async function (file) {
  if (!file) return;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const items = rows.slice(1).map((r) => ({ name: String(r[0] || '').trim(), phone: pDigits(r[1]) })).filter((x) => x.name && x.phone);
  if (!items.length) { showMsg('paMsg', '읽을 수 있는 행이 없습니다. 1열 이름, 2열 학부모 전화번호로 만들어 주세요.', 'error'); return; }
  if (!confirm(`${items.length}명의 학부모 번호를 연결할까요?`)) return;
  let ok = 0; const fail = [];
  for (const it of items) {
    const matches = studentsCache.filter((s) => s.name === it.name);
    if (matches.length !== 1) { fail.push(`${it.name}: ${matches.length ? '동명이인' : '학생 없음'}`); continue; }
    try { await linkParentAccount(matches[0], it.phone); ok++; }
    catch (e) { fail.push(`${it.name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 250)); // 계정 생성 속도 제한 완화
  }
  showMsg('paMsg', `완료: ${ok}명 연결${fail.length ? ` / 실패 ${fail.length}명 — ${fail.join(', ')}` : ''}`, fail.length ? 'error' : 'success');
  await loadStudents(); renderParentsTab();
};
window.paDownloadTemplate = function () {
  const ws = XLSX.utils.aoa_to_sheet([['이름', '학부모전화'], ...studentsCache.filter(pIsMiddle).filter((s) => !s.parentUid).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).map((s) => [s.name, ''])]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '학부모');
  XLSX.writeFile(wb, '학부모전화_연결양식.xlsx');
};
