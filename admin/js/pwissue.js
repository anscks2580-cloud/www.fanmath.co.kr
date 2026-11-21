'use strict';
/* ═══════════════════════════════════════════════════════════
   비밀번호 발급 (학생 › 비밀번호 발급) — 2026.11.21
   - 앱 정식 출시 때 학생·학부모 계정 비밀번호를 「알파벳 3개 + 숫자 5개」로 한꺼번에 새로 발급
     (서버 함수 pwIssue — 비밀번호를 실제로 바꾸고 pwIssues 컬렉션에 기록)
   - 발급 명단은 평촌관·산본관 따로 보고 엑셀로 내려받아 솔라피 문자·카톡으로 보냄 (보내는 방법은 추후 결정)
   - 전체 발급은 원장 계정만, 한 명 다시 발급은 관리부도 가능
   ═══════════════════════════════════════════════════════════ */
const piEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const piPhone = (v) => { const d = String(v || '').replace(/[^0-9]/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : d; };
const piDate = (t) => { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let piRows = [];
let piBranch = 'all', piRole = 'all', piSent = 'all';
const piSel = new Set();
const piIsMaster = () => (window.currentAdmin || {}).role !== 'office';
const piMsg = (t, err) => { const el = document.getElementById('pi-msg'); if (el) { el.innerHTML = t; el.style.color = err ? '#D64545' : 'var(--muted)'; } };

window.initPwIssueTab = async function () {
  const bulk = document.getElementById('pi-bulk-card'); if (bulk) bulk.style.display = piIsMaster() ? '' : 'none';
  await piLoad();
};

async function piLoad() {
  const body = document.getElementById('pi-list'); if (body) body.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(collection(db, 'pwIssues'));
    piRows = []; snap.forEach((d) => piRows.push({ id: d.id, ...d.data() }));
  } catch (e) { if (body) body.innerHTML = `<div style="color:#D64545;font-size:13px;padding:10px;">불러오기 오류: ${piEsc(e.message)}</div>`; return; }
  piRender();
}

function piFiltered() {
  const q = (document.getElementById('pi-q')?.value || '').trim();
  return piRows.filter((r) => (piBranch === 'all' || r.branch === piBranch)
    && (piRole === 'all' || r.role === piRole)
    && (piSent === 'all' || (piSent === 'sent' ? r.sent : !r.sent))
    && (!q || String(r.studentName || '').includes(q)));
}

function piChip(group, val, label, cur) {
  const on = cur === val;
  const color = val === '산본관' ? '#B8860B' : val === '평촌관' ? '#5B3FA6' : 'var(--off-white)';
  return `<button type="button" class="btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}" style="${on ? '' : `color:${color};`}" onclick="piSetFilter('${group}','${val}')">${label}</button>`;
}
window.piSetFilter = function (g, v) { if (g === 'b') piBranch = v; if (g === 'r') piRole = v; if (g === 's') piSent = v; piRender(); };

function piRender() {
  const f = document.getElementById('pi-filters');
  if (f) f.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      ${piChip('b', 'all', '전체', piBranch)}${piChip('b', '평촌관', '평촌관', piBranch)}${piChip('b', '산본관', '산본관', piBranch)}
      <span style="width:10px;"></span>
      ${piChip('r', 'all', '학생+학부모', piRole)}${piChip('r', 'student', '학생', piRole)}${piChip('r', 'parent', '학부모', piRole)}
      <span style="width:10px;"></span>
      ${piChip('s', 'all', '전부', piSent)}${piChip('s', 'unsent', '아직 안 보냄', piSent)}${piChip('s', 'sent', '보냄', piSent)}
    </div>`;
  const rows = piFiltered().sort((a, b) => String(a.branch).localeCompare(String(b.branch), 'ko') || String(a.studentName).localeCompare(String(b.studentName), 'ko') || (a.role === 'student' ? -1 : 1));
  const stat = document.getElementById('pi-stat');
  const cnt = (b) => { const l = piRows.filter((r) => r.branch === b); return `<b style="color:${b === '산본관' ? '#B8860B' : '#5B3FA6'};">${b}</b> 학생 ${l.filter((r) => r.role === 'student').length} · 학부모 ${l.filter((r) => r.role === 'parent').length} (보냄 ${l.filter((r) => r.sent).length})`; };
  if (stat) stat.innerHTML = piRows.length ? `${cnt('평촌관')} &nbsp;|&nbsp; ${cnt('산본관')}` : '아직 발급한 비밀번호가 없습니다.';
  const body = document.getElementById('pi-list'); if (!body) return;
  if (!rows.length) { body.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:14px;text-align:center;">해당하는 명단이 없습니다.</div>'; return; }
  let prevB = '';
  body.innerHTML = `<table class="preview-table" style="width:100%;font-size:13px;">
    <thead><tr><th style="width:28px;"><input type="checkbox" onchange="piToggleAll(this.checked)"></th><th>관</th><th>학생</th><th>구분</th><th>아이디</th><th>새 비밀번호</th><th>받는 번호</th><th>발급</th><th>보냄</th><th></th></tr></thead>
    <tbody>${rows.map((r) => {
      const head = piBranch === 'all' && r.branch !== prevB ? `<tr><td colspan="10" style="font-weight:800;padding-top:12px;color:${r.branch === '산본관' ? '#B8860B' : '#5B3FA6'};">${piEsc(r.branch || '관 미지정')}</td></tr>` : '';
      prevB = r.branch;
      return head + `<tr>
        <td><input type="checkbox" ${piSel.has(r.id) ? 'checked' : ''} onchange="piToggle('${r.id}',this.checked)"></td>
        <td style="color:${r.branch === '산본관' ? '#B8860B' : '#5B3FA6'};font-weight:700;">${piEsc(r.branch || '-')}</td>
        <td><b>${piEsc(r.studentName)}</b> <span style="color:var(--muted);font-size:11.5px;">${piEsc(r.grade || '')}${r.classGroup ? ' · ' + piEsc(r.classGroup) : ''}</span></td>
        <td>${r.role === 'parent' ? '학부모' : '학생'}</td>
        <td>${piEsc(r.loginId)}</td>
        <td style="font-family:monospace;font-size:14px;font-weight:700;letter-spacing:.5px;">${piEsc(r.password)}</td>
        <td>${r.phone ? piEsc(piPhone(r.phone)) : '<span style="color:#D64545;">번호 없음</span>'}</td>
        <td style="color:var(--muted);font-size:12px;">${piDate(r.issuedAt)}</td>
        <td>${r.sent ? '<span style="color:#2E9E5B;font-weight:700;">✅ 보냄</span>' : '<span style="color:var(--muted);">-</span>'}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="piReissue('${r.studentId}','${r.role}')">다시 발급</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}
window.piToggle = (id, on) => { if (on) piSel.add(id); else piSel.delete(id); };
window.piToggleAll = (on) => { piFiltered().forEach((r) => { if (on) piSel.add(r.id); else piSel.delete(r.id); }); piRender(); };

// ── 전체 발급 (원장만) ──
window.piBulk = async function () {
  if (!piIsMaster()) { alert('전체 발급은 원장 계정만 할 수 있습니다.'); return; }
  const branch = document.getElementById('pi-bulk-branch').value;
  const label = branch === 'all' ? '평촌관·산본관 전체' : branch;
  if (!confirm(`${label} 재원생의 학생·학부모 계정 비밀번호를 모두 새로 발급합니다.\n\n· 지금 쓰던 비밀번호(전화번호 등)로는 더 이상 로그인이 안 됩니다\n· 로그인돼 있던 앱·홈페이지도 모두 한 번 로그아웃됩니다\n· 새 비밀번호는 아래 명단에서 확인해 문자·카톡으로 보내야 합니다\n\n진행할까요?`)) return;
  const typed = prompt('정말 진행하려면 「발급」 이라고 입력해 주세요.');
  if ((typed || '').trim() !== '발급') { piMsg('취소했습니다.'); return; }
  const btn = document.getElementById('pi-bulk-btn'); if (btn) btn.disabled = true;
  piMsg('발급 중입니다... (학생 수에 따라 1~3분 걸려요. 창을 닫지 마세요)');
  try {
    const r = (await httpsCallable(functionsInstance, 'pwIssue')({ mode: 'bulk', branch })).data;
    piMsg(`✅ 발급 완료 — 학생 ${r.student}명 · 학부모 ${r.parent}명${r.fails && r.fails.length ? `<br><span style="color:#D64545;">실패 ${r.fails.length}건: ${r.fails.slice(0, 20).map((x) => piEsc(x.name + '(' + (x.role === 'parent' ? '학부모' : '학생') + ')')).join(', ')}${r.fails.length > 20 ? ' …' : ''} — 학생 관리 › 학생 진단으로 계정을 확인해 주세요</span>` : ''}`);
    await piLoad();
  } catch (e) {
    piMsg(['functions/not-found', 'functions/internal', 'functions/unavailable'].includes(e.code) ? '서버 함수가 아직 안 올라가 있습니다. 「비밀번호발급_배포.bat」을 먼저 실행해 주세요.' : '발급 오류: ' + piEsc(e.message), true);
  } finally { if (btn) btn.disabled = false; }
};

// ── 한 명 다시 발급 (관리부 가능) ──
window.piReissue = async function (studentId, role) {
  const s = (typeof studentsCache !== "undefined" ? studentsCache : []).find((x) => x.id === studentId);
  const nm = s ? s.name : '';
  if (!confirm(`${nm} ${role === 'parent' ? '학부모' : '학생'} 계정 비밀번호를 새로 발급할까요?\n(지금 비밀번호로는 로그인이 안 되고, 로그인돼 있던 기기는 로그아웃됩니다)`)) return;
  try {
    const r = (await httpsCallable(functionsInstance, 'pwIssue')({ mode: 'one', studentId, who: role })).data;
    const bad = (r.result || []).filter((x) => !x.ok);
    piMsg(bad.length ? `⚠️ ${piEsc(nm)} 발급 실패: ${bad.map((x) => piEsc(x.error)).join(', ')}` : `✅ ${piEsc(nm)} ${role === 'parent' ? '학부모' : '학생'} 비밀번호를 새로 발급했습니다. 명단에서 확인해 보내 주세요.`, !!bad.length);
    await piLoad();
  } catch (e) { piMsg('발급 오류: ' + piEsc(e.message), true); }
};

// 이름으로 찾아서 발급 (명단에 아직 없는 학생)
window.piFindAndIssue = async function () {
  const nm = (document.getElementById('pi-one-name')?.value || '').trim();
  const who = document.getElementById('pi-one-who')?.value || 'both';
  if (!nm) { piMsg('학생 이름을 입력해 주세요.', true); return; }
  if (!studentsCache.length) { try { await loadStudents(); } catch (e) { /* 아래에서 처리 */ } }
  const list = (typeof studentsCache !== "undefined" ? studentsCache : []).filter((s) => s.name === nm && s.status !== '퇴원');
  if (!list.length) { piMsg(`「${piEsc(nm)}」 재원생을 찾지 못했습니다.`, true); return; }
  let s = list[0];
  if (list.length > 1) {
    const pick = prompt(`같은 이름이 ${list.length}명입니다. 번호를 골라 주세요.\n` + list.map((x, i) => `${i + 1}. ${x.branch || ''} ${x.grade || ''} ${x.classGroup || ''}`).join('\n'), '1');
    s = list[(parseInt(pick, 10) || 0) - 1]; if (!s) return;
  }
  if (!confirm(`${s.branch || ''} ${s.name} — ${who === 'both' ? '학생·학부모' : who === 'parent' ? '학부모' : '학생'} 계정 비밀번호를 새로 발급할까요?`)) return;
  try {
    const r = (await httpsCallable(functionsInstance, 'pwIssue')({ mode: 'one', studentId: s.id, who })).data;
    const bad = (r.result || []).filter((x) => !x.ok);
    piMsg(bad.length ? `⚠️ 일부 실패: ${bad.map((x) => (x.role === 'parent' ? '학부모 ' : '학생 ') + piEsc(x.error)).join(', ')}` : `✅ ${piEsc(s.name)} 발급 완료`, !!bad.length);
    await piLoad();
  } catch (e) { piMsg('발급 오류: ' + piEsc(e.message), true); }
};

// ── 보냄 표시 ──
window.piMarkSent = async function (sent) {
  const ids = [...piSel]; if (!ids.length) { piMsg('체크한 명단이 없습니다.', true); return; }
  try {
    await httpsCallable(functionsInstance, 'pwIssue')({ mode: 'mark', uids: ids, sent });
    piSel.clear(); piMsg(`✅ ${ids.length}건을 ${sent ? '보냄' : '안 보냄'}으로 표시했습니다.`); await piLoad();
  } catch (e) { piMsg('표시 오류: ' + piEsc(e.message), true); }
};

// ── 엑셀 내려받기 (지금 화면 조건 그대로 · 솔라피 대량 발송용) ──
window.piExcel = function () {
  const rows = piFiltered();
  if (!rows.length) { piMsg('내려받을 명단이 없습니다.', true); return; }
  const aoa = [['관', '학생 이름', '학년', '반', '구분', '아이디', '새 비밀번호', '받는 번호', '안내 문구']];
  rows.sort((a, b) => String(a.branch).localeCompare(String(b.branch), 'ko') || String(a.studentName).localeCompare(String(b.studentName), 'ko'))
    .forEach((r) => aoa.push([r.branch || '', r.studentName || '', r.grade || '', r.classGroup || '', r.role === 'parent' ? '학부모' : '학생', r.loginId || '', r.password || '', piPhone(r.phone),
      `[송우찬수학학원] 학원 앱 서비스를 시작합니다! ${r.studentName} ${r.role === 'parent' ? '학부모님' : '학생'} 계정의 비밀번호가 바뀌었습니다. 아이디: ${r.loginId} / 새 비밀번호: ${r.password}`]));
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '비밀번호 발급');
  const tag = piBranch === 'all' ? '전체' : piBranch;
  XLSX.writeFile(wb, `비밀번호발급_${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
