'use strict';
/* ═══════════════════════════════════════════════════════════
   학생 진단 (학생 관리 탭 「🔍 학생 진단」 카드)
   - 서버 함수 studentDiag 로 홈페이지 명단과 파이어베이스 로그인 계정을 대조 (읽기만 함)
   - 서버 함수가 아직 안 올라가 있으면 홈페이지 명단(재원·퇴원)에서만 찾아서 보여줌
   ═══════════════════════════════════════════════════════════ */
const dgEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dgDate = (t) => { if (!t) return '기록 없음'; const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleDateString('ko-KR'); };
const DG_BRANCHES = ['평촌관', '산본관'];
const dgBox = (html) => { const el = document.getElementById('diag-result'); if (el) el.innerHTML = html; };
const dgNote = (t, color) => `<div style="font-size:13px;line-height:1.7;color:${color || 'var(--muted)'};">${t}</div>`;
const dgNotDeployed = (e) => ['functions/not-found', 'functions/internal', 'functions/unavailable'].includes(e?.code) && !/권한|로그인/.test(e?.message || '');

// 학생 한 줄
function dgStudentLine(s) {
  const st = s.status === '퇴원'
    ? `<b style="color:#D64545;">퇴원${s.leaveDate ? ' ' + dgEsc(s.leaveDate) : ''}</b> — 아래 「퇴원생 보기」에서 [복귀]를 누르면 예전 기록 그대로 돌아옵니다`
    : '<b style="color:#2E9E5B;">재원</b>';
  let au = '';
  if (s.authExists === false) au = ' · <b style="color:#D64545;">로그인 계정 없음</b> ([수정] → 로그인 계정 즉시 맞추기)';
  else if (s.authExists) {
    au = ` · 로그인 아이디 ${dgEsc(decodeLocalPart(s.authEmail))} · 최근 로그인 ${dgDate(s.lastSignIn)}`;
    if (s.authDisabled && s.status !== '퇴원') au += ' · <b style="color:#D64545;">로그인 막힘</b>';
  }
  return `<li><b>${dgEsc(s.name || '(이름 없음)')}</b> ${dgEsc(s.grade)} · ${dgEsc(s.teacherName ? s.teacherName + ' T' : '담당 미배정')} · ${dgEsc(s.classGroup || '반 미배정')} — ${st}${au}</li>`;
}
// 학생 목록을 평촌관 / 산본관 / 관 미지정으로 나눠서 표시
function dgStudentsByBranch(list) {
  const groups = DG_BRANCHES.map((b) => [b, list.filter((s) => s.branch === b)]);
  groups.push(['관 미지정', list.filter((s) => !DG_BRANCHES.includes(s.branch))]);
  return groups.filter(([, l]) => l.length).map(([b, l]) =>
    `<div style="font-size:12px;font-weight:700;margin:8px 0 2px;color:${b === '산본관' ? '#B8860B' : 'var(--purple, #5B3FA6)'};">${b} ${l.length}명</div>
     <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;">${l.sort((a, b2) => (a.name || '').localeCompare(b2.name || '', 'ko')).map(dgStudentLine).join('')}</ul>`).join('');
}
function dgAccountLine(a) {
  const who = a.kind === 'parent' ? '학부모 계정' : '학생·선생님 계정';
  return `<li><b>${dgEsc(a.loginName)}</b> <span style="color:var(--muted);">(${who} · 만든 날 ${dgDate(a.created)} · 최근 로그인 ${dgDate(a.lastSignIn)}${a.disabled ? ' · 로그인 막힘' : ''})</span></li>`;
}
function dgSection(title, body, warn) {
  return `<div style="margin-top:14px;padding:12px 14px;border-radius:10px;border:1px solid ${warn ? 'rgba(214,69,69,0.35)' : 'var(--border-soft)'};background:${warn ? 'rgba(214,69,69,0.04)' : 'transparent'};">
    <div style="font-size:13px;font-weight:700;margin-bottom:6px;${warn ? 'color:#D64545;' : ''}">${title}</div>${body}</div>`;
}

// 홈페이지 명단에서만 찾기 (서버 함수가 없을 때)
function dgLocalByName(nm) {
  return [...studentsCache, ...withdrawnCache].filter((s) => String(s.name || '').includes(nm))
    .map((s) => ({ ...s, status: s.status === '퇴원' ? '퇴원' : '재원', authExists: undefined }));
}

// ── 이름 검색 ──
window.diagSearchByName = async function () {
  const nm = (document.getElementById('diag-name')?.value || '').trim();
  if (!nm) { dgBox(dgNote('찾을 학생 이름을 입력해주세요.', '#D64545')); return; }
  dgBox(dgNote('확인 중...'));
  if (!studentsCache.length && !withdrawnCache.length) { try { await loadStudents(); } catch (e) { /* 아래에서 서버 결과로 표시 */ } }
  let r;
  try {
    r = (await httpsCallable(functionsInstance, 'studentDiag')({ mode: 'name', name: nm })).data;
  } catch (e) {
    const local = dgLocalByName(nm);
    dgBox(
      dgSection(`홈페이지 명단에서 찾은 「${dgEsc(nm)}」 ${local.length}명`, local.length ? dgStudentsByBranch(local) : dgNote('재원생·퇴원생 명단 어디에도 없습니다.')) +
      dgSection('로그인 계정 쪽은 아직 확인하지 못했어요',
        dgNote(dgNotDeployed(e)
          ? '로그인 계정 확인 기능이 서버에 아직 안 올라가 있습니다. 홈페이지 폴더 → _서버함수_추가 → 학생진단 → <b>학생진단_배포.bat</b> 을 한 번 실행한 뒤 다시 눌러주세요.'
          : '오류: ' + dgEsc(e?.message || e)), true));
    return;
  }
  const orphans = (r.accounts || []).filter((a) => a.role === 'none');
  const staff = (r.accounts || []).filter((a) => a.role === 'teacher' || a.role === 'admin');
  let html = dgSection(`홈페이지 명단에서 찾은 「${dgEsc(nm)}」 ${r.students.length}명`,
    r.students.length ? dgStudentsByBranch(r.students) : dgNote('재원생·퇴원생 명단 어디에도 없습니다.'));
  if (orphans.length) {
    html += dgSection(`명단에는 없는데 파이어베이스에 로그인 계정만 남아 있음 ${orphans.length}개`,
      `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;">${orphans.map(dgAccountLine).join('')}</ul>` +
      dgNote('예전에 명단에서만 지워진 계정입니다. 위 「학생 등록」에서 같은 이름으로 등록하면, 이 계정을 그대로 살려서 등록할지 물어봅니다.'), true);
  }
  if (staff.length) {
    html += dgSection('같은 이름의 선생님·관리자 계정',
      `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;">${staff.map((a) => `<li><b>${dgEsc(a.loginName)}</b> — ${a.role === 'teacher' ? '선생님' : '관리자'}${a.branch ? ' (' + dgEsc(a.branch) + ')' : ''}</li>`).join('')}</ul>` +
      dgNote('학생을 같은 이름으로 등록할 수 없습니다. 이름 뒤에 숫자를 붙여 등록해 주세요. (예: ' + dgEsc(nm) + '2)'));
  }
  if (!r.students.length && !orphans.length && !staff.length) html += dgNote('파이어베이스에도 이 이름의 로그인 계정이 없습니다. 「학생 등록」에서 바로 등록할 수 있어요.', '#2E9E5B');
  dgBox(html);
};

// ── 전체 진단 ──
window.diagRunAll = async function () {
  dgBox(dgNote('명단과 로그인 계정을 대조하는 중... (조금 걸릴 수 있어요)'));
  let r;
  try {
    r = (await httpsCallable(functionsInstance, 'studentDiag')({ mode: 'all' })).data;
  } catch (e) {
    dgBox(dgSection('전체 진단을 실행하지 못했어요',
      dgNote(dgNotDeployed(e)
        ? '진단 기능이 서버에 아직 안 올라가 있습니다. 홈페이지 폴더 → _서버함수_추가 → 학생진단 → <b>학생진단_배포.bat</b> 을 한 번 실행한 뒤 다시 눌러주세요.'
        : '오류: ' + dgEsc(e?.message || e)), true));
    return;
  }
  const c = r.counts || {};
  const stuOrphans = (r.orphanAccounts || []).filter((a) => a.kind === 'student');
  const parOrphans = (r.orphanAccounts || []).filter((a) => a.kind === 'parent');
  const etcOrphans = (r.orphanAccounts || []).filter((a) => a.kind === 'other');
  const ul = (items) => `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;">${items.join('')}</ul>`;
  let html = dgNote(`재원생 <b>${c.students}</b>명 · 퇴원생 <b>${c.withdrawn}</b>명 · 선생님·조교 <b>${c.teachers}</b>명 · 관리자 <b>${c.admins}</b>명 · 학부모 <b>${c.parents}</b>명 / 파이어베이스 로그인 계정 <b>${c.auth}</b>개`);
  let problems = 0;
  const add = (list, title, body) => { if (list.length) { problems += list.length; html += dgSection(`${title} ${list.length}${body.unit || '명'}`, body.html, true); } };
  add(stuOrphans, '명단에는 없는데 로그인 계정만 남아 있는 학생 계정', { unit: '개', html: ul(stuOrphans.map(dgAccountLine)) + dgNote('다시 다니게 된 학생이면 「학생 등록」에서 같은 이름으로 등록하면 계정을 살려서 등록합니다. 한꺼번에 지우려면 Claude에게 정리를 요청하세요.') });
  add(parOrphans, '연결된 학생이 없는 학부모 로그인 계정', { unit: '개', html: ul(parOrphans.map(dgAccountLine)) });
  add(etcOrphans, '어느 명단에도 없는 그 밖의 로그인 계정', { unit: '개', html: ul(etcOrphans.map((a) => `<li><b>${dgEsc(a.email)}</b> <span style="color:var(--muted);">(만든 날 ${dgDate(a.created)} · 최근 로그인 ${dgDate(a.lastSignIn)})</span></li>`)) });
  add(r.noAuthStudents || [], '명단에는 있는데 로그인 계정이 없는 학생', { html: dgStudentsByBranch(r.noAuthStudents || []) });
  add(r.disabledActive || [], '재원생인데 로그인이 막혀 있는 학생', { html: dgStudentsByBranch(r.disabledActive || []) + dgNote('[수정] → 로그인 계정 즉시 맞추기를 누르면 풀립니다.') });
  add(r.mismatched || [], '로그인 아이디가 이름과 다른 학생', { html: dgStudentsByBranch(r.mismatched || []) + dgNote('[수정] → 로그인 계정 즉시 맞추기를 누르면 이름 기준으로 맞춰집니다.') });
  add(r.badDocs || [], '이름이 비어 있는 학생 문서', { unit: '건', html: dgNote('학생 목록 표시를 깨뜨릴 수 있습니다. Claude에게 정리를 요청하세요.') });
  add(r.orphanParents || [], '학생이 명단에 없는 학부모 문서', { unit: '건', html: ul((r.orphanParents || []).map((p) => `<li>${dgEsc(p.studentName || '(이름 없음)')} 학부모 (${dgEsc(p.phone)})</li>`)) });
  if (!problems) html += dgNote('✅ 명단과 로그인 계정이 모두 맞습니다.', '#2E9E5B');
  dgBox(html);
};

document.getElementById('diag-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') diagSearchByName(); });
