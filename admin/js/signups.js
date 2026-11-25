'use strict';
/* ═══════════════════════════════════════════════════════════
   가입 승인 (학생 › 가입 승인) — 2026.11.25
   - 새로 온 학생·학부모가 signup.html 에서 직접 가입(카카오·네이버·구글·아이디 + 휴대폰 문자 인증)
     → signups/{uid} 에 「승인 대기」로 들어옴 → 여기서 확인하고 승인
   - 학생 승인: students/{uid} 문서를 만들어 학생 명단에 올림 (관·학년·담당 선생님 지정)
   - 학부모 승인: 자녀(학생)를 골라 parents/{uid} 로 연결
       · 그 학생에 학부모 계정이 아직 없으면 parentUid 로, 이미 있으면 parentUids 목록에 추가
   - 거절: 신청을 「거절」로 바꾸고 그 휴대폰 번호(phones/{번호})를 풀어 줌
   - 평촌관 · 산본관 따로 보고 처리
   ═══════════════════════════════════════════════════════════ */
const suEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const suPhone = (v) => { const d = String(v || '').replace(/[^0-9]/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : d; };
const suVia = { kakao: '카카오', naver: '네이버', google: '구글', id: '아이디' };
const SU_GRADES = ['초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', 'N수'];
const SU_BRANCHES = ['평촌관', '산본관'];
let suRows = [], suStudents = [], suTeachers = [];
let suBranch = 'all', suWant = 'all';

const suTime = (t) => {
  const d = t && t.toDate ? t.toDate() : (t ? new Date(t) : null);
  if (!d || isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const suMs = (t) => (t && t.toMillis ? t.toMillis() : (t ? new Date(t).getTime() : 0)) || 0;
const suMsg = (t, err) => { const el = document.getElementById('su-msg'); if (el) { el.innerHTML = t || ''; el.style.color = err ? '#D64545' : '#2E9E5B'; } };

window.initSignupsTab = async function () { await suLoad(); };

async function suLoad() {
  const box = document.getElementById('su-list');
  if (box) box.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px;">불러오는 중...</div>';
  try {
    const [a, b, c] = await Promise.all([getDocs(collection(db, 'signups')), getDocs(collection(db, 'students')), getDocs(collection(db, 'teachers'))]);
    suRows = []; a.forEach((d) => suRows.push({ id: d.id, ...d.data() }));
    suStudents = []; b.forEach((d) => { const s = { id: d.id, ...d.data() }; if (s.status !== '퇴원') suStudents.push(s); });
    suTeachers = []; c.forEach((d) => { const t = { id: d.id, ...d.data() }; if (t.role !== 'ta' && t.active !== false) suTeachers.push(t); });
    suStudents.sort((x, y) => String(x.name).localeCompare(String(y.name), 'ko'));
    suTeachers.sort((x, y) => String(x.name).localeCompare(String(y.name), 'ko'));
  } catch (e) {
    if (box) box.innerHTML = `<div style="color:#D64545;font-size:13px;padding:10px;">불러오기 오류: ${suEsc(e.message)}</div>`;
    return;
  }
  suRender(); suBadge();
}

function suChip(group, val, label, cur, n) {
  const on = cur === val;
  return `<button type="button" onclick="suSetFilter('${group}','${val}')" style="padding:6px 12px;border-radius:16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple)' : 'transparent'};color:${on ? '#fff' : 'var(--off-white)'};">${label}${n != null ? ` <b>${n}</b>` : ''}</button>`;
}
window.suSetFilter = function (g, v) { if (g === 'branch') suBranch = v; else suWant = v; suRender(); };

function suTeacherOptions(branch, sel) {
  const list = suTeachers.filter((t) => !t.branch || t.branch === branch || String(t.branch).includes(branch));
  return '<option value="">담당 선생님 (나중에 지정)</option>' + list.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${suEsc(t.name)}${t.branch ? ' (' + suEsc(t.branch) + ')' : ''}</option>`).join('');
}
function suStudentOptions(r) {
  const same = suStudents.filter((s) => s.branch === r.branch), other = suStudents.filter((s) => s.branch !== r.branch);
  const guess = same.find((s) => s.name === r.name) || other.find((s) => s.name === r.name);
  const opt = (s) => `<option value="${s.id}" ${guess && guess.id === s.id ? 'selected' : ''}>${suEsc(s.name)} · ${suEsc(s.branch || '')} ${suEsc(s.grade || '')}${s.parentUid ? ' · 학부모 계정 있음' : ''}</option>`;
  return `<option value="">자녀(학생) 선택</option><optgroup label="${suEsc(r.branch)}">${same.map(opt).join('')}</optgroup>${other.length ? `<optgroup label="다른 관">${other.map(opt).join('')}</optgroup>` : ''}`;
}

function suRender() {
  const box = document.getElementById('su-list'); if (!box) return;
  const pend = suRows.filter((r) => r.status === 'pending').sort((a, b) => suMs(a.createdAt) - suMs(b.createdAt));
  const cnt = (f) => pend.filter(f).length;
  const filt = pend.filter((r) => (suBranch === 'all' || r.branch === suBranch) && (suWant === 'all' || r.want === suWant));
  const chips = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
      ${suChip('branch', 'all', '전체', suBranch, pend.length)}${SU_BRANCHES.map((b) => suChip('branch', b, b, suBranch, cnt((r) => r.branch === b))).join('')}
      <span style="width:12px;"></span>
      ${suChip('want', 'all', '학생 + 학부모', suWant)}${suChip('want', 'student', '학생', suWant, cnt((r) => r.want === 'student'))}${suChip('want', 'parent', '학부모', suWant, cnt((r) => r.want === 'parent'))}
    </div>`;
  const sel = 'padding:7px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--off-white);font-family:inherit;font-size:12px;';
  const rows = filt.map((r) => {
    const via = suVia[r.via] || r.via || '';
    const idLine = r.via === 'id' && r.loginId ? `<div style="font-size:11px;color:var(--muted);">${suEsc(r.loginId)}</div>` : '';
    let setting;
    if (r.want === 'student') {
      const dup = suStudents.filter((s) => s.name === r.name);
      setting = `<div style="display:flex;gap:5px;flex-wrap:wrap;">
          <input id="su-n-${r.id}" value="${suEsc(r.name)}" style="${sel}width:90px;" title="학생 이름 (동명이인이면 뒤에 숫자)">
          <select id="su-b-${r.id}" style="${sel}" onchange="document.getElementById('su-t-${r.id}').innerHTML=suTeacherOptionsHtml(this.value)">${SU_BRANCHES.map((b) => `<option ${b === r.branch ? 'selected' : ''}>${b}</option>`).join('')}</select>
          <select id="su-g-${r.id}" style="${sel}">${SU_GRADES.map((g) => `<option ${g === r.grade ? 'selected' : ''}>${g}</option>`).join('')}</select>
          <select id="su-t-${r.id}" style="${sel}max-width:170px;">${suTeacherOptions(r.branch, '')}</select>
          <input id="su-c-${r.id}" placeholder="반 (선택)" style="${sel}width:90px;">
        </div>${dup.length ? `<div style="font-size:11px;color:#D64545;margin-top:4px;">⚠ 같은 이름 재원생 있음: ${dup.map((s) => suEsc(s.branch + ' ' + (s.grade || ''))).join(', ')} — 동명이인이면 이름 뒤에 숫자를 붙여 주세요</div>` : ''}`;
    } else {
      setting = `<select id="su-s-${r.id}" style="${sel}min-width:220px;">${suStudentOptions(r)}</select>
        ${suStudents.some((s) => s.name === r.name) ? '' : `<div style="font-size:11px;color:#D64545;margin-top:4px;">⚠ 「${suEsc(r.name)}」 학생이 명단에 없어요 — 자녀 학생을 먼저 승인 · 등록한 뒤 연결해 주세요</div>`}`;
    }
    return `<tr>
      <td style="white-space:nowrap;font-size:12px;color:var(--muted);">${suTime(r.createdAt)}</td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${r.branch === '산본관' ? 'rgba(46,120,200,0.12)' : 'rgba(91,63,166,0.12)'};font-weight:700;">${suEsc(r.branch)}</span></td>
      <td style="white-space:nowrap;"><b>${r.want === 'parent' ? '학부모' : '학생'}</b></td>
      <td><b>${suEsc(r.name)}</b>${r.want === 'parent' ? ' <span style="font-size:11px;color:var(--muted);">학부모님</span>' : ''}<div style="font-size:11px;color:var(--muted);">${suEsc(r.school || '')} ${suEsc(r.grade || '')}</div></td>
      <td style="white-space:nowrap;font-size:12px;">${suEsc(suPhone(r.phone))} <span style="color:#2E9E5B;">✓</span></td>
      <td style="white-space:nowrap;font-size:12px;">${suEsc(via)}${idLine}</td>
      <td>${setting}</td>
      <td style="white-space:nowrap;"><button class="btn-sm" onclick="suApprove('${r.id}')" style="background:var(--gold);color:var(--on-gold);border:none;padding:7px 12px;border-radius:6px;font-weight:700;cursor:pointer;">승인</button>
        <button class="btn-sm" onclick="suReject('${r.id}')" style="background:transparent;color:#D64545;border:1px solid rgba(214,69,69,0.4);padding:6px 10px;border-radius:6px;cursor:pointer;">거절</button></td>
    </tr>`;
  }).join('');
  const done = suRows.filter((r) => r.status !== 'pending').sort((a, b) => suMs(b.doneAt || b.createdAt) - suMs(a.doneAt || a.createdAt)).slice(0, 40);
  const doneHtml = done.length ? `<details style="margin-top:14px;"><summary style="cursor:pointer;font-size:13px;color:var(--muted);">처리한 신청 최근 ${done.length}건</summary>
      <table class="preview-table" style="margin-top:8px;font-size:12px;"><thead><tr><th>처리</th><th>관</th><th>구분</th><th>이름</th><th>휴대폰</th><th>결과</th></tr></thead><tbody>
      ${done.map((r) => `<tr><td>${suTime(r.doneAt)}</td><td>${suEsc(r.branch)}</td><td>${r.want === 'parent' ? '학부모' : '학생'}</td><td>${suEsc(r.name)}${r.linkedName && r.want === 'parent' ? ' → ' + suEsc(r.linkedName) : ''}</td><td>${suEsc(suPhone(r.phone))}</td><td>${r.status === 'approved' ? '<span style="color:#2E9E5B;font-weight:700;">승인</span>' : '<span style="color:#D64545;">거절</span>'}${r.doneBy ? ' · ' + suEsc(r.doneBy) : ''}</td></tr>`).join('')}
      </tbody></table></details>` : '';
  box.innerHTML = chips + (filt.length
    ? `<div style="overflow-x:auto;"><table class="preview-table" style="font-size:13px;"><thead><tr><th>신청</th><th>관</th><th>구분</th><th>이름 (학교·학년)</th><th>휴대폰</th><th>가입</th><th>승인 설정</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div style="color:var(--muted);font-size:13px;padding:14px 4px;">승인 기다리는 신청이 없어요.</div>`) + doneHtml;
}
window.suTeacherOptionsHtml = (branch) => suTeacherOptions(branch, '');

const suWho = () => { const a = window.currentAdmin || {}; return a.name || a.email || ''; };

window.suApprove = async function (uid) {
  const r = suRows.find((x) => x.id === uid); if (!r) return;
  const now = new Date().toISOString();
  try {
    if (r.want === 'student') {
      const name = (document.getElementById('su-n-' + uid).value || '').trim().replace(/\s+/g, '');
      const branch = document.getElementById('su-b-' + uid).value;
      const grade = document.getElementById('su-g-' + uid).value;
      const teacherUid = document.getElementById('su-t-' + uid).value;
      const teacherName = teacherUid ? ((suTeachers.find((t) => t.id === teacherUid) || {}).name || '') : '';
      const classGroup = (document.getElementById('su-c-' + uid).value || '').trim();
      if (!name) { suMsg('학생 이름을 넣어 주세요.', true); return; }
      const dup = suStudents.find((s) => s.name === name);
      if (dup && !confirm(`「${name}」 이름의 재원생이 이미 있어요 (${dup.branch || ''} ${dup.grade || ''}).\n\n동명이인이면 [취소]를 누르고 이름 뒤에 숫자를 붙여 주세요. (예: ${name}2)\n그래도 이 이름으로 등록할까요?`)) return;
      if (!confirm(`${branch} ${grade} ${name} 학생으로 승인할까요?`)) return;
      await setDoc(doc(db, 'students', uid), {
        name, phone: String(r.phone || ''), grade, branch, school: r.school || '', assignedTags: [],
        teacherUid, teacherName, days: [], classGroup, createdAt: now,
        selfSignup: true, signupVia: r.via || '', loginId: r.loginId || '',
      });
      await updateDoc(doc(db, 'signups', uid), { status: 'approved', doneAt: now, doneBy: suWho(), studentId: uid, linkedName: name, branch });
      suMsg(`✅ ${branch} ${name} 학생을 승인했어요. 영상 접근(강의 배정)·등원 요일은 학생 관리에서 지정해 주세요.`);
    } else {
      const sid = document.getElementById('su-s-' + uid).value;
      if (!sid) { suMsg('연결할 자녀(학생)를 골라 주세요.', true); return; }
      const s = suStudents.find((x) => x.id === sid);
      if (!s) { suMsg('학생 정보를 찾지 못했어요. 새로고침 후 다시 해 주세요.', true); return; }
      if (s.branch !== r.branch && !confirm(`신청한 관(${r.branch})과 학생의 관(${s.branch})이 달라요. 그래도 연결할까요?`)) return;
      if (!confirm(`${s.branch} ${s.name} 학생의 학부모로 승인할까요?\n(학부모 휴대폰 ${suPhone(r.phone)})`)) return;
      await setDoc(doc(db, 'parents', uid), {
        studentId: sid, studentName: s.name, phone: String(r.phone || ''), createdAt: now,
        selfSignup: true, signupVia: r.via || '', loginId: r.loginId || '',
      });
      const fresh = await getDoc(doc(db, 'students', sid));
      const sd = fresh.exists() ? fresh.data() : {};
      if (!sd.parentUid) await updateDoc(doc(db, 'students', sid), { parentUid: uid, parentPhone: sd.parentPhone || String(r.phone || '') });
      else {
        const list = Array.isArray(sd.parentUids) ? sd.parentUids.slice() : [];
        if (!list.includes(uid)) list.push(uid);
        await updateDoc(doc(db, 'students', sid), { parentUids: list });
      }
      await updateDoc(doc(db, 'signups', uid), { status: 'approved', doneAt: now, doneBy: suWho(), studentId: sid, linkedName: s.name });
      suMsg(`✅ ${s.branch} ${s.name} 학생의 학부모로 승인했어요.`);
    }
    if (typeof loadStudents === 'function') loadStudents().catch(() => {});
    await suLoad();
  } catch (e) { console.error(e); suMsg('승인하지 못했어요: ' + suEsc(e.message || e.code), true); }
};

window.suReject = async function (uid) {
  const r = suRows.find((x) => x.id === uid); if (!r) return;
  if (!confirm(`${r.branch} ${r.want === 'parent' ? r.name + ' 학부모' : r.name + ' 학생'} 가입 신청을 거절할까요?\n(그 휴대폰 번호로 다시 가입할 수 있게 풀어 줍니다)`)) return;
  try {
    await updateDoc(doc(db, 'signups', uid), { status: 'rejected', doneAt: new Date().toISOString(), doneBy: suWho() });
    const pd = String(r.phone || '').replace(/[^0-9]/g, '');
    if (pd) await deleteDoc(doc(db, 'phones', pd)).catch(() => {});
    suMsg('거절했어요.');
    await suLoad();
  } catch (e) { suMsg('처리하지 못했어요: ' + suEsc(e.message || e.code), true); }
};

// 왼쪽 메뉴 「가입 승인」 옆에 대기 건수 표시 (관리자 로그인 확인 뒤 한 번 + 5분마다)
function suBadge() {
  const n = suRows.filter((r) => r.status === 'pending').length;
  document.querySelectorAll('[data-menu="signups"]').forEach((b) => {
    let t = b.querySelector('.su-badge');
    if (!n) { if (t) t.remove(); return; }
    if (!t) { t = document.createElement('b'); t.className = 'su-badge'; t.style.cssText = 'margin-left:6px;background:#D64545;color:#fff;border-radius:9px;padding:1px 7px;font-size:11px;'; b.appendChild(t); }
    t.textContent = n;
  });
}
async function suBadgeRefresh() {
  if (!window.currentAdmin) return;
  try {
    const snap = await getDocs(query(collection(db, 'signups'), where('status', '==', 'pending')));
    const ids = new Set(); snap.forEach((d) => ids.add(d.id));
    suRows = suRows.filter((r) => r.status !== 'pending' || ids.has(r.id));
    snap.forEach((d) => { if (!suRows.some((r) => r.id === d.id)) suRows.push({ id: d.id, ...d.data() }); });
    suBadge();
  } catch (e) { /* 권한 없는 계정이면 표시 안 함 */ }
}
(function wait(n) { if (window.currentAdmin) { suBadgeRefresh(); setInterval(suBadgeRefresh, 5 * 60 * 1000); return; } if (n < 120) setTimeout(() => wait(n + 1), 1000); })(0);
