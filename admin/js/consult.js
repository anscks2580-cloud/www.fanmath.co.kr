'use strict';
/* ═══════════════════════════════════════════════════════════
   상담 신청 · 상담 기록 · 결과 이미지 · 설문 · 안내 영상 · 수업 미리보기
   (admin.html에서 분리 — 원본 9172~10032줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 상담 신청 · 상담 기록 관리 ──
// 상담 진행 단계·상태 정의는 consult-flow.js 공통 모듈을 사용합니다.
// (모듈을 불러오지 못해도 목록·서식 보기는 기존처럼 동작)
let CFM = null;
async function consultFlowModule() {
  if (CFM) return CFM;
  try { CFM = await import(new URL('consult-flow.js', location.href).href); /* 외부 js 파일이라 문서 기준 경로로 */ } catch (e) { console.error('consult-flow.js 로드 실패', e); CFM = null; }
  return CFM;
}
let consultRows = [];             // [{ id, data }] — consultForms (최신순)
let consultLegacyProfiles = {};   // { 상담ID: { parent, student } } — 문서 ID 규칙 이전(자동 ID)으로 저장된 설문 결과
// 관 구분: 평촌관 · 산본관은 항상 따로 봅니다 (선택값은 브라우저에 기억)
let consultBranch = '평촌관';
try { const b = localStorage.getItem('swc_consult_branch'); if (b === '평촌관' || b === '산본관' || b === '') consultBranch = b; } catch (e) {}
const consultFilter = { q: '', status: 'all', view: 'visible' };   // view: visible(숨긴 것 제외) | hidden(숨긴 것만)
// 기록의 관 판별 — '산본'이 들어가면 산본관, 그 외(미입력 포함)는 평촌관
function consultBranchOf(d) { return String(d?.branch || '').includes('산본') ? '산본관' : '평촌관'; }
let consultRefreshTimer = null;
let crCurrent = null;

function consultDesc(row) {
  return CFM ? CFM.describeRecord(row.data, consultLegacyProfiles[row.id] || {}) : null;
}

window.initConsultTab = async function() {
  const el = document.getElementById('consultList');
  if (!consultRows.length) el.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  await consultFlowModule();
  try {
    const snap = await getDocs(query(collection(db, 'consultForms'), orderBy('createdAt', 'desc')));
    window._consultData = {};
    consultRows = [];
    snap.forEach((d) => { const data = d.data(); window._consultData[d.id] = data; consultRows.push({ id: d.id, data }); });
  } catch(e) {
    el.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${escapeConsultHtml(e.message)}</div>`;
    return;
  }
  consultLegacyProfiles = {};
  try {
    const ps = await getDocs(collection(db, 'learningProfiles'));
    const t = (x) => (x?.completedAt?.toMillis?.() || x?.createdAt?.toMillis?.() || 0);
    ps.forEach((p) => {
      const v = p.data();
      if (!v.consultId || (v.role !== 'parent' && v.role !== 'student')) return;
      if (p.id === `${v.consultId}_${v.role}`) return;     // 새 규칙 문서는 상담 기록 요약을 기준으로 표시
      const slot = consultLegacyProfiles[v.consultId] || (consultLegacyProfiles[v.consultId] = {});
      if (!slot[v.role] || t(v) > t(slot[v.role])) slot[v.role] = { id: p.id, ...v };
    });
  } catch(e) { console.warn('learningProfiles 조회 실패 (목록은 그대로 표시)', e); }
  renderConsultList();
  loadConsultVideoSetting();
  lgLoad();
};

window.setConsultFilter = function() {
  consultFilter.q = document.getElementById('consultSearch').value;
  consultFilter.status = document.getElementById('consultStatusFilter').value;
  const v = document.getElementById('consultViewFilter'); if (v) consultFilter.view = v.value;
  renderConsultList();
};

window.setConsultBranch = function(b) {
  consultBranch = b;
  try { localStorage.setItem('swc_consult_branch', b); } catch (e) {}
  renderConsultList();
};

// 목록에서 숨기기 / 다시 보이기 (삭제 아님 — hidden 표시만 바꿉니다)
window.toggleConsultHidden = async function(cid, hide) {
  const row = consultRows.find((r) => r.id === cid);
  if (!row) return;
  const name = row.data.studentName || '이름없음';
  if (hide && !confirm(`${name} 상담 신청을 목록에서 숨길까요?\n삭제되지 않으며 "숨긴 신청" 보기에서 언제든 다시 꺼낼 수 있습니다.`)) return;
  try {
    await updateDoc(doc(db, 'consultForms', cid), hide
      ? { hidden: true, hiddenAt: Timestamp.now(), hiddenBy: auth.currentUser?.email || '' }
      : { hidden: false, hiddenAt: null, hiddenBy: '' });
    row.data.hidden = hide;
    if (window._consultData && window._consultData[cid]) window._consultData[cid].hidden = hide;
    showToast(hide ? `${name} 상담 신청을 숨겼습니다` : `${name} 상담 신청을 다시 표시합니다`);
    renderConsultList();
  } catch (e) { alert('처리 실패: ' + e.message); }
};

function renderConsultList() {
  const el = document.getElementById('consultList');
  const countEl = document.getElementById('consultCount');
  if (!consultRows.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">아직 접수된 상담 신청이 없습니다.</div>';
    if (countEl) countEl.textContent = '';
    return;
  }
  const q = consultFilter.q.trim(), qn = q.replace(/\s/g, ''), qd = q.replace(/\D/g, '');
  const bsel = document.getElementById('consultBranchFilter'); if (bsel && bsel.value !== consultBranch) bsel.value = consultBranch;
  const wantHidden = consultFilter.view === 'hidden';
  // 관별 건수 (숨긴 것 제외) — 평촌관·산본관 탭 옆에 표시
  const bc = { '평촌관': 0, '산본관': 0, hidden: 0 };
  consultRows.forEach((r) => { if (r.data.hidden === true) bc.hidden++; else bc[consultBranchOf(r.data)]++; });
  const bcEl = document.getElementById('consultBranchCount');
  if (bcEl) bcEl.innerHTML = `평촌관 <b>${bc['평촌관']}</b> · 산본관 <b>${bc['산본관']}</b>${bc.hidden ? ` · 숨김 ${bc.hidden}` : ''}`;
  const rows = consultRows.filter((r) => {
    const d = r.data;
    if ((d.hidden === true) !== wantHidden) return false;
    if (consultBranch && consultBranchOf(d) !== consultBranch) return false;
    if (q) {
      const nameHit = qn && String(d.studentName || '').replace(/\s/g, '').includes(qn);
      const phoneHit = qd.length >= 3 && (String(d.parentPhone || '').replace(/\D/g, '').includes(qd) || String(d.studentPhone || '').replace(/\D/g, '').includes(qd));
      if (!nameHit && !phoneHit) return false;
    }
    const f = consultFilter.status;
    if (f === 'all') return true;
    const s = consultDesc(r);
    if (!s) return f === 'legacy' ? d.flowVersion !== 2 : true;
    switch (f) {
      case 'flow': return s.isFlow;
      case 'legacy': return !s.isFlow;
      case 'parent_done': return s.parent.done;
      case 'parent_none': return !s.parent.done;
      case 'student_done': return s.student.done;
      case 'student_none': return !s.student.done;
      case 'ready': return s.stage === 'consultation_completed';
      default: return true;
    }
  });
  if (countEl) countEl.textContent = `${consultBranch || '전체'}${wantHidden ? ' · 숨긴 신청' : ''} ${rows.length}건`;
  if (!rows.length) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;">${wantHidden ? '숨긴 상담 신청이 없습니다.' : '조건에 맞는 상담 기록이 없습니다.'}</div>`; return; }
  const e = escapeConsultHtml;
  const chip = (cls, txt) => `<span class="cf-chip ${cls}">${txt}</span>`;
  const surveyChip = (label, x) => x.done
    ? chip('ok', `${label} · <b>${e(x.code)}</b> ${e(x.typeName)}`)
    : chip(label === '학생' && x.label && x.label.includes('미방문') ? 'warn' : 'none', `${label} · ${e(x.label || '미실시')}`);
  el.innerHTML = rows.map((r) => {
    const d = r.data, s = consultDesc(r);
    const dateStr = d.createdAt?.toDate ? formatConsultDate(d.createdAt.toDate()) : '-';
    const upd = s?.updatedAt?.toDate ? formatConsultDate(s.updatedAt.toDate()) : dateStr;
    const stageTxt = s ? s.stageLabel + (s.isFlow && s.video && s.video.status !== 'pending' && s.video.status !== 'none' ? ` · 상담자료 ${s.video.label}` : '') : '신청서 접수';
    const br = consultBranchOf(d);
    return `
      <div class="consult-item cf-item${d.hidden === true ? ' cf-hidden' : ''}">
        <div class="consult-main">
          <span class="cf-branch ${br === '산본관' ? 'sb' : 'pc'}">${br}</span>
          <span class="consult-level">${e(d.level || '-')}</span>
          <span class="consult-name">${e(d.studentName || '이름없음')}</span>
          ${d.source === 'tablet' ? '<span class="consult-src">🖊 태블릿</span>'
            : d.source === 'qr' ? '<span class="consult-src">📱 QR</span>'
            : '<span class="consult-src web">홈페이지</span>'}
          <span class="consult-sub">${e(d.schoolGrade || '')} · ${dateStr}</span>
        </div>
        <div class="cf-status">
          ${chip('ok', '신청서 ✓')}
          ${s ? surveyChip('학부모', s.parent) + surveyChip('학생', s.student) : ''}
        </div>
        <div class="cf-meta">
          <span class="cf-stage ${e(s?.stage || '')}">${e(stageTxt)}</span>
          <span>학부모 ${e(d.parentPhone || '-')}</span>
          <span>최종 수정 ${upd}</span>
        </div>
        <div class="cf-actions">
          <button class="btn btn-primary btn-sm" onclick="openConsultRecord('${r.id}')">통합 상담 기록</button>
          <button class="btn btn-secondary btn-sm" onclick="openConsultRecord('${r.id}','form')">신청서 상세</button>
          <button class="btn btn-secondary btn-sm" onclick="openConsultRecord('${r.id}','parent')">학부모 결과</button>
          <button class="btn btn-secondary btn-sm" onclick="openConsultRecord('${r.id}','student')">학생 결과</button>
          <button class="btn btn-secondary btn-sm" onclick="startConsultSurvey('${r.id}','student')">학생 설문 시작</button>
          <button class="btn btn-secondary btn-sm" onclick="saveConsultImage('${r.id}')">📷 결과 이미지 (카톡 전달용)</button>
          ${d.hidden === true
            ? `<button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="toggleConsultHidden('${r.id}', false)">↩ 다시 보이기</button>`
            : `<button class="btn btn-secondary btn-sm" style="margin-left:auto;opacity:.75;" onclick="toggleConsultHidden('${r.id}', true)">🙈 목록에서 숨기기</button>`}
        </div>
      </div>`;
  }).join('');
}

// ── 통합 상담 기록 (신청서 + 학부모 설문 + 학생 설문 + 진행 상태) ──
window.openConsultRecord = async function(cid, focus) {
  const modal = document.getElementById('consultRecordModal');
  const body = document.getElementById('crBody');
  crCurrent = cid;
  modal.classList.add('open');
  document.body.classList.add('ck-lock');
  if (!focus || body.dataset.cid !== cid) body.innerHTML = '<div class="cr-empty">불러오는 중...</div>';
  const CF = await consultFlowModule();
  let d;
  try {
    const snap = await getDoc(doc(db, 'consultForms', cid));
    if (!snap.exists()) { body.innerHTML = '<div class="cr-empty"><b>상담 기록을 찾을 수 없습니다.</b>삭제되었거나 주소가 잘못되었습니다.</div>'; return; }
    d = snap.data();
    window._consultData = window._consultData || {};
    window._consultData[cid] = d;
    const row = consultRows.find((x) => x.id === cid); if (row) row.data = d;
  } catch(e) { body.innerHTML = `<div class="cr-empty"><b>불러오지 못했습니다.</b>${escapeConsultHtml(e.message)}</div>`; return; }
  // 설문 응답 전체 — 상담ID 문서만 사용하고 consultId·role을 다시 확인 (다른 학생 결과가 섞이지 않도록)
  const prof = { parent: null, student: null };
  const profErr = {};
  await Promise.all(['parent', 'student'].map(async (role) => {
    try {
      const ps = await getDoc(doc(db, 'learningProfiles', `${cid}_${role}`));
      if (ps.exists() && ps.data().consultId === cid && ps.data().role === role) prof[role] = ps.data();
    } catch(e) { profErr[role] = e.message; }
    if (!prof[role]) { const lg = consultLegacyProfiles[cid]?.[role]; if (lg && lg.consultId === cid) prof[role] = lg; }
  }));
  if (crCurrent !== cid) return;
  body.dataset.cid = cid;
  body.innerHTML = consultRecordHtml(cid, d, prof, profErr, CF);
  if (focus) { const t = document.getElementById('cr-sec-' + focus); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  else document.getElementById('consultRecordModal').scrollTop = 0;
};
window.closeConsultRecord = function() {
  crCurrent = null;
  document.getElementById('consultRecordModal').classList.remove('open');
  if (!document.getElementById('consultKiosk').classList.contains('open')) document.body.classList.remove('ck-lock');
};

// ══════ 상담 결과 이미지 (카카오톡 전달용) ══════
// 학부모(·학생) 설문 결과만 세로형 PNG 한 장으로 만들어 관리부에서 학부모님께 전달
// 개인정보(학교·학년·연락처·성적 등 상담신청서 인적사항)와 내부용 정보(방문 경로·진행 상태·문항별 응답)는 넣지 않습니다.
const CI = { blob: null, name: '', visit: null };
function ciLoadLib() {
  if (window.html2canvas) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    sc.onload = () => res();
    sc.onerror = () => rej(new Error('이미지 변환 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    document.head.appendChild(sc);
  });
}
function ciLoadFont() {
  if (!document.getElementById('ciFont')) {
    const l = document.createElement('link');
    l.id = 'ciFont'; l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css';
    document.head.appendChild(l);
  }
}
function ciSurveyHtml(role, d, p, CF) {
  const e = escapeConsultHtml;
  const sum = d[`${role}Survey`];
  const done = (sum && sum.status === 'completed') || !!p;
  const title = role === 'parent' ? '학부모 설문 결과' : '학생 설문 결과';
  if (!done) return '';
  const src = p || sum;
  const code = String(src.code || sum?.code || '');
  const when = crFmt(sum?.at) || crFmt(p?.completedAt) || crFmt(p?.createdAt);
  const name = d.studentName ? e(d.studentName) + ' 학생' : '자녀';
  const axes = crAxisRows(p || { axes: sum?.axes }, CF);
  const extraLabels = { studyTime: '평일 혼자 공부 시간', manager: '가정 내 공부 관리', phone: '휴대폰 사용 규칙' };
  const extra = p?.extra ? Object.entries(p.extra).filter(([, v]) => v !== null && v !== undefined && v !== '') : [];
  return `<div class="sec">
    <div class="st"><i></i>${title}<em>${e(when ? when.slice(0, 10) + ' 작성' : '')}</em></div>
    <div class="code">${code.split('').map((c) => `<span>${e(c)}</span>`).join('')}</div>
    <div class="tn">${e(src.typeName || sum?.typeName || '')}</div>
    <div class="ts">${role === 'parent' ? `학부모님이 관찰하신 ${name}의 학습 모습` : '학생 본인이 답한 실제 학습 행동'}을 4가지 축으로 정리했습니다.</div>
    ${axes.map((a) => `<div class="ax">
      <div class="ax-t"><b>${e(a.name)}</b><span>${e(a.sideName)}</span></div>
      ${a.v !== null ? `<div class="bar"><i style="left:${Math.max(0, Math.min(100, a.v))}%"></i></div><div class="bl"><span>${e(a.lo)}</span><span>${e(a.hi)}</span></div>` : ''}
      ${a.text ? `<p class="${a.v === null ? 'nd' : ''}">${e(a.text)}</p>` : ''}</div>`).join('')}
    ${p?.focus ? `<div class="fc"><b>상담 때 집중할 부분 · ${e(p.focus.name)}</b><p>${e(p.focus.text)}</p></div>` : ''}
    ${extra.length ? `<div class="ex">${extra.map(([k, v]) => `<div><span>${e(extraLabels[k] || k)}</span><b>${e(v)}</b></div>`).join('')}</div>` : ''}
  </div>`;
}
// 자가진단: { student:{...}, parent:{...} } (2026.10~) / 예전 저장본은 { calcScore, ... } (평가자 구분 없음)
function selfCheckGroups(sc) {
  sc = sc || {};
  const out = [];
  if (sc.student) out.push({ who: '학생 본인', s: sc.student });
  if (sc.parent) out.push({ who: '학부모', s: sc.parent });
  if (!out.length && (sc.calcScore !== undefined || sc.accuracyScore !== undefined || sc.interestScore !== undefined)) out.push({ who: '', s: sc });
  return out;
}
function selfCheckLine(s) {
  return [['연산', s.calcScore], ['정확도', s.accuracyScore], ['흥미', s.interestScore]]
    .filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k} ${escapeConsultHtml(v)}`).join(' · ');
}
function ciCardHtml(d, prof, CF) {
  const e = escapeConsultHtml;
  const join = (a) => (a && a.length ? a.map(e).join(', ') : '');
  const progress = d.level === '고등'
    ? `${join(d.highSubjects)}${d.highLevel ? (d.highSubjects?.length ? ' · ' : '') + '난이도 ' + e(d.highLevel) : ''}`
    : [d.progressGrade, d.progressSemester, d.progressUnit].filter(Boolean).map(e).join(' ');
  const ex = d.examScores || {};
  const exams = [ex.round1, ex.round2, ex.round3, ex.round4].map((x, i) => (x ? `${i + 1}회 ${e(x)}` : '')).filter(Boolean).join(' / ');
  const selfRows = selfCheckGroups(d.selfCheck).map((g) => [g.who ? `자가진단 (${g.who})` : '자가진단', selfCheckLine(g.s), 'f']);
  const rows = [
    ['학생 이름', e(d.studentName || '')], ['학교 / 학년', e(d.schoolGrade || '')],
    ['과정', [d.level ? e(d.level) + '부' : '', e(d.branch || '')].filter(Boolean).join(' · ')],
    ['학부모 연락처', e(d.parentPhone || '')], ['학생 연락처', e(d.studentPhone || '')],
    [d.level === '고등' ? '수강 희망 과목' : '현재 진도', progress, 'f'],
    ['최근 시험 점수', exams, 'f'],
    ['자신 있는 영역', join(d.strongAreas), 'f'], ['어려워하는 영역', join(d.weakAreas), 'f'],
    ...selfRows,
  ].filter((r) => r[1]);
  const halves = rows.filter((r) => !r[2]);
  if (halves.length % 2) halves[halves.length - 1][2] = 'f';   // 반쪽 칸이 홀수면 마지막 칸을 한 줄 전체로
  const surveys = ciSurveyHtml('parent', d, prof.parent, CF) + ciSurveyHtml('student', d, prof.student, CF);
  const date = d.createdAt?.toDate ? formatConsultDate(d.createdAt.toDate()).slice(0, 10) : '';
  return `<div class="ci-card">
    <div class="h">
      <div class="brand"><img src="swc-logo.png" alt="">송우찬수학학원<span>${e(d.branch || '평촌관')}</span></div>
      <div class="eye">CONSULTATION REPORT</div>
      <div class="nm">${e(d.studentName || '')}</div>
      <div class="dt">학습 성향 설문 결과${date ? ' · ' + date : ''}</div>
    </div>
    <div class="b">
      ${surveys || '<div class="sec"><div class="st"><i></i>학습 성향 설문 결과</div><p class="none">아직 진행한 설문이 없습니다.</p></div>'}
      <p class="ft">설문 결과는 응답하신 실제 학습 행동을 바탕으로 정리한 <b>상담 참고 자료</b>이며 심리검사가 아닙니다.<br>송우찬수학학원 ${e(d.branch || '평촌관')} · ${String(d.branch || '').includes('산본') ? '031-346-8899' : '031-386-8899'}</p>
    </div>
  </div>`;
}
async function ciLoadRecord(cid) {
  const snap = await getDoc(doc(db, 'consultForms', cid));
  if (!snap.exists()) throw new Error('상담 기록을 찾을 수 없습니다.');
  const d = snap.data();
  const prof = { parent: null, student: null };
  await Promise.all(['parent', 'student'].map(async (role) => {
    try {
      const ps = await getDoc(doc(db, 'learningProfiles', `${cid}_${role}`));
      if (ps.exists() && ps.data().consultId === cid && ps.data().role === role) prof[role] = ps.data();
    } catch (e) { console.warn('learningProfiles 조회 실패', e); }
    if (!prof[role]) { const lg = consultLegacyProfiles[cid]?.[role]; if (lg && lg.consultId === cid) prof[role] = lg; }
  }));
  return { d, prof };
}
window.saveConsultImage = async function(cid) {
  const modal = document.getElementById('consultImgModal');
  const prev = document.getElementById('ciPrev');
  CI.blob = null; CI.visit = null;
  ['ciSave', 'ciCopy', 'ciPrint', 'ciShare'].forEach((id) => { document.getElementById(id).disabled = true; });
  prev.innerHTML = '<div class="ci-wait">이미지를 만드는 중…</div>';
  modal.classList.add('open');
  document.body.classList.add('ck-lock');
  let host = null;
  try {
    ciLoadFont();
    const CF = await consultFlowModule();
    const [{ d, prof }] = await Promise.all([ciLoadRecord(cid), ciLoadLib()]);
    host = document.createElement('div');
    host.className = 'ci-host';
    host.innerHTML = ciCardHtml(d, prof, CF);
    document.body.appendChild(host);
    try { await document.fonts.load('700 16px Pretendard'); await document.fonts.load('800 16px Pretendard'); await document.fonts.ready; } catch (e) {}
    await Promise.all([...host.querySelectorAll('img')].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    const card = host.firstElementChild;
    const canvas = await window.html2canvas(card, { scale: 1.5, backgroundColor: '#F6F3EC', logging: false, useCORS: true, windowWidth: 760, scrollX: 0, scrollY: 0 });
    CI.blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!CI.blob) throw new Error('이미지를 만들지 못했습니다.');
    const ymd = (d.createdAt?.toDate ? d.createdAt.toDate() : new Date()).toISOString().slice(0, 10).replace(/-/g, '');
    CI.visit = { paths: d.visitPath || [], etc: consultVisitEtc(d) };   // 프린트 전용(반배정 칸) — 이미지에는 넣지 않음
    CI.name = `상담결과_${String(d.studentName || '학생').replace(/[\\/:*?"<>|\s]/g, '')}_${ymd}.png`;
    prev.innerHTML = '';
    const img = new Image();
    img.alt = '상담 결과 이미지';
    img.src = URL.createObjectURL(CI.blob);
    prev.appendChild(img);
    document.getElementById('ciSave').disabled = false;
    const file = new File([CI.blob], CI.name, { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })) && matchMedia('(pointer:coarse)').matches;
    const cb = document.getElementById('ciCopy'), sb = document.getElementById('ciShare');
    cb.hidden = false; cb.disabled = false;
    document.getElementById('ciPrint').disabled = false;
    sb.hidden = !canShare; sb.disabled = !canShare;
  } catch (e) {
    console.error('[상담 결과 이미지]', e);
    prev.innerHTML = `<div class="ci-wait" style="color:#D64545;">${escapeConsultHtml(e.message || '이미지를 만들지 못했습니다.')}</div>`;
  } finally { if (host) host.remove(); }
};
window.closeConsultImage = function() {
  document.getElementById('consultImgModal').classList.remove('open');
  const im = document.querySelector('#ciPrev img'); if (im) URL.revokeObjectURL(im.src);
  if (!document.getElementById('consultRecordModal').classList.contains('open') && !document.getElementById('consultKiosk').classList.contains('open')) document.body.classList.remove('ck-lock');
};
window.ciDownload = function() {
  if (!CI.blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(CI.blob); a.download = CI.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
window.ciCopy = async function() {
  if (!CI.blob) return;
  const okMsg = '이미지를 복사했습니다. 카카오톡 채팅창에 Ctrl+V(붙여넣기) 하세요';
  // 1) 표준 클립보드 API (크롬·엣지·사파리 최신)
  if (navigator.clipboard && window.ClipboardItem) {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': CI.blob })]); showToast(okMsg); return; }
    catch (e) { console.warn('[이미지 복사] clipboard.write 실패 → 대체 방식 시도', e); }
  }
  // 2) 대체: 이미지를 화면 밖에 놓고 선택해서 복사 (구형 브라우저·보안 제한 환경)
  try {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(CI.blob); });
    const box = document.createElement('div');
    box.contentEditable = 'true';
    box.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;';
    const im = new Image(); im.src = url; box.appendChild(im); document.body.appendChild(box);
    await new Promise((r) => (im.complete ? r() : (im.onload = im.onerror = r)));
    const range = document.createRange(); range.selectNode(im);
    const selc = window.getSelection(); selc.removeAllRanges(); selc.addRange(range);
    const ok = document.execCommand('copy');
    selc.removeAllRanges(); box.remove();
    if (ok) { showToast(okMsg); return; }
  } catch (e) { console.warn('[이미지 복사] 대체 방식 실패', e); }
  showToast('이 브라우저에서는 바로 복사가 안 됩니다. 미리보기 이미지를 마우스 오른쪽 버튼(휴대폰은 길게 누르기) → [이미지 복사]를 눌러 주세요');
};
// 프린트: 만든 이미지를 A4 한 장에 맞춰 출력 (관리자 페이지 화면과 분리된 숨은 창에서 인쇄)
// 프린트할 때만 남는 빈 공간에 '반배정' 기입란을 붙임 — 이미지 저장·복사·공유에는 들어가지 않음
window.ciPrint = async function() {
  if (!CI.blob) return;
  try {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(CI.blob); });
    // 이미지 비율 → 반배정 칸을 아래에 둘지 옆에 둘지 결정 (이미지가 더 크게 나오는 쪽)
    const nat = await new Promise((res) => { const t = new Image(); t.onload = () => res({ w: t.naturalWidth, h: t.naturalHeight }); t.onerror = () => res({ w: 720, h: 1000 }); t.src = url; });
    const r = nat.h / nat.w;
    const PW = 194, PH = 279, GAP = 4, MIN_BELOW = 92, MIN_SIDE = 62;   // A4(여백 8mm) 안쪽 크기, mm
    const belowH = Math.min(PW * r, PH - MIN_BELOW - GAP), belowW = belowH / r;
    const sideH = Math.min(PH, (PW - MIN_SIDE - GAP) * r), sideW = sideH / r;
    const side = sideW > belowW + 0.5;
    const imgW = (side ? sideW : belowW).toFixed(1), imgH = (side ? sideH : belowH).toFixed(1);

    const old = document.getElementById('ciPrintFrame'); if (old) old.remove();
    const fr = document.createElement('iframe');
    fr.id = 'ciPrintFrame';
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(fr);
    const title = CI.name.replace(/\.png$/i, '');
    const box = '<i class="cb"></i>';
    const boxOn = '<i class="cb on"></i>';
    const vs = CI.visit || { paths: [], etc: '' };
    const visitRow = `<div class="f vp"><span>방문 경로</span><b>${CONSULT_VISIT_PATHS.map((v) => `<label>${vs.paths.includes(v) ? boxOn : box}${escapeConsultHtml(v)}</label>`).join('')}<label>${vs.etc ? boxOn : box}기타${vs.etc ? ': ' + escapeConsultHtml(vs.etc) : ''}</label></b></div>`;
    const w = fr.contentWindow, d = w.document;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeConsultHtml(title)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing:border-box; margin:0; padding:0; }
      html, body { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      body { font-family:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif; color:#1E1736; }
      .pg { width:${PW}mm; height:${PH}mm; display:flex; flex-direction:${side ? 'row' : 'column'}; gap:${GAP}mm; overflow:hidden; }
      .pg > img { display:block; width:${imgW}mm; height:${imgH}mm; flex:none; ${side ? '' : 'align-self:center;'} }
      .ba { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; border:1.4px solid #1A1230; border-radius:4mm; padding:4.5mm 5mm; }
      .ba-h { display:flex; align-items:center; gap:2mm; font-size:13pt; font-weight:800; padding-bottom:2.5mm; border-bottom:1px solid rgba(30,23,54,.15); }
      .ba-h i { width:1.2mm; height:4.5mm; border-radius:1mm; background:#F5C518; }
      .ba-h em { margin-left:auto; font-style:normal; font-size:8.5pt; font-weight:600; color:#7A7496; }
      .ba-f { display:grid; grid-template-columns:${side ? '1fr' : '1fr 1fr'}; column-gap:6mm; }
      .ba-f > div { display:flex; align-items:flex-end; gap:2.5mm; padding:2.6mm 0 1.6mm; border-bottom:1px solid rgba(30,23,54,.25); min-height:10mm; }
      .ba-f > div.f { grid-column:1 / -1; }
      .ba-f span { font-size:9.5pt; font-weight:700; color:#5a5470; white-space:nowrap; }
      .ba-f b { font-size:9.5pt; font-weight:600; color:#1E1736; display:flex; flex-wrap:wrap; gap:1.5mm 4mm; align-items:center; }
      .cb { display:inline-block; width:3.4mm; height:3.4mm; border:1.2px solid #1E1736; border-radius:.6mm; margin-right:1.2mm; vertical-align:-0.5mm; position:relative; }
      .cb.on { background:#1E1736; }
      .cb.on::after { content:'✓'; position:absolute; left:.35mm; top:-1.1mm; font-size:8pt; font-weight:900; color:#fff; }
      .ba-f > div.vp { align-items:flex-start; }
      .ba-f > div.vp b { font-size:8.8pt; gap:1.6mm 3.2mm; }
      .ba-f label { white-space:nowrap; }
      .ba-m { flex:1; display:flex; flex-direction:column; margin-top:2.6mm; min-height:12mm; }
      .ba-m span { font-size:9.5pt; font-weight:700; color:#5a5470; }
      .ba-m div { flex:1; background:repeating-linear-gradient(to bottom, transparent 0, transparent calc(8mm - 1px), rgba(30,23,54,.22) calc(8mm - 1px), rgba(30,23,54,.22) 8mm); }
    </style></head><body>
    <div class="pg">
      <img id="im" src="${url}" alt="">
      <div class="ba">
        <div class="ba-h"><i></i>반배정<em>원장님 작성</em></div>
        <div class="ba-f">
          ${visitRow}
          <div><span>배정 반</span></div>
          <div><span>담당 선생님</span></div>
          <div class="f"><span>수업 요일</span><b><label>${box}월·수·금</label><label>${box}화·목</label><label>${box}기타</label></b></div>
          <div><span>수업 시간</span></div>
          <div><span>첫 수업일</span><b style="margin-left:auto;gap:7mm;"><span>월</span><span>일</span></b></div>
          <div class="f"><span>사용 교재</span></div>
        </div>
        <div class="ba-m"><span>메모</span><div></div></div>
      </div>
    </div></body></html>`);
    d.close();
    const im = d.getElementById('im');
    await new Promise((res) => (im.complete ? res() : (im.onload = im.onerror = res)));
    try { await Promise.race([d.fonts.ready, new Promise((res) => setTimeout(res, 1500))]); } catch (e) {}
    w.focus();
    w.print();
    setTimeout(() => fr.remove(), 60000);
  } catch (e) { console.error('[상담 결과 이미지 프린트]', e); showToast('프린트하지 못했습니다. [이미지 저장] 후 파일을 열어 인쇄해 주세요'); }
};
window.ciShare = async function() {
  if (!CI.blob) return;
  try { await navigator.share({ files: [new File([CI.blob], CI.name, { type: 'image/png' })], title: '상담 결과' }); }
  catch (e) { if (e.name !== 'AbortError') { console.error(e); showToast('공유하지 못했습니다. [이미지 저장]을 이용해 주세요'); } }
};

function crFmt(ts) { return ts?.toDate ? formatConsultDate(ts.toDate()) : ''; }
function crAxisRows(p, CF) {
  // 저장 당시 결과 화면의 축 정보(axisDetail)를 그대로 표시. 예전 저장본은 점수와 축 이름만 표시
  const keys = ['M', 'S', 'E', 'T'];
  return keys.map((k) => {
    const L = CF ? CF.AXIS_LABEL[k] : { name: k, hiName: '', loName: '', hi: '', lo: '' };
    const ad = p.axisDetail?.[k];
    const v = ad ? ad.value : (p.axes ? p.axes[k] : null);
    const name = ad?.name || L.name;
    if (v === null || v === undefined) return { k, name, v: null, side: null, sideName: '판단 보류', text: "'잘 모르겠다' 응답이 많아 판단하지 않음", lo: ad?.loName || L.loName, hi: ad?.hiName || L.hiName };
    const hi = v >= 50;
    return { k, name, v, side: ad?.side || (hi ? L.hi : L.lo), sideName: (ad?.balanced ?? (v >= 40 && v <= 60) ? '균형에 가까움 · ' : '') + (ad?.sideName || (hi ? L.hiName : L.loName)),
      text: ad?.text || '', lo: ad?.loName || L.loName, hi: ad?.hiName || L.hiName };
  });
}
function crSurveyCol(cid, role, d, p, err, CF) {
  const e = escapeConsultHtml;
  const label = role === 'parent' ? '학부모 설문' : '학생 설문';
  const sum = d[`${role}Survey`];
  const done = (sum && sum.status === 'completed') || !!p;
  if (!done) {
    const why = role === 'student' && d.visitWith === 'parent' ? '학생 미방문 · 학부모만 상담' : role === 'student' ? '아직 진행하지 않았습니다' : '아직 진행하지 않았습니다';
    return `<div class="cr-col" id="cr-sec-${role}"><h5>${label}</h5>
      <div class="cr-empty"><b>미실시</b>${why}${err ? `<br><span style="color:#D64545">응답 조회 오류: ${e(err)}</span>` : ''}
      <div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="startConsultSurvey('${cid}','${role}')">${role === 'student' ? '학생 설문 시작' : '학부모 설문 진행'}</button></div></div></div>`;
  }
  const src = p || sum;
  const code = String(src.code || sum?.code || '');
  const when = crFmt(sum?.at) || crFmt(p?.completedAt) || crFmt(p?.createdAt);
  const axes = crAxisRows(p || { axes: sum?.axes }, CF);
  const extraLabels = { studyTime: '평일 혼자 공부 시간', manager: '가정 내 공부 관리', phone: '휴대폰 사용 규칙' };
  const extra = p?.extra ? Object.entries(p.extra) : [];
  return `<div class="cr-col" id="cr-sec-${role}">
    <h5>${label} <span class="cr-when">${e(when)} 완료${p?.source === 'standalone-link' ? ' · 단독 설문에서 연결' : ''}</span></h5>
    <div class="cr-code">${code.split('').map((c) => `<span>${e(c)}</span>`).join('')}</div>
    <div class="cr-type">${e(src.typeName || sum?.typeName || '')}</div>
    ${axes.map((a) => `<div class="cr-axis">
      <div class="cr-axis-top"><b>${e(a.name)}</b><span>${e(a.sideName)}${a.v !== null ? ` · ${a.v}` : ''}</span></div>
      ${a.v !== null ? `<div class="cr-bar"><i style="left:${a.v}%"></i></div><div class="cr-bar-lbl"><span>${e(a.lo)}</span><span>${e(a.hi)}</span></div>` : ''}
      ${a.text ? `<p>${e(a.text)}</p>` : ''}</div>`).join('')}
    ${p?.focus ? `<div class="cr-focus"><b>상담 때 집중할 부분 · ${e(p.focus.name)}</b>${e(p.focus.text)}</div>` : ''}
    ${extra.length ? `<div class="cr-extra">${extra.map(([k, v]) => `<div><span>${e(extraLabels[k] || k)}</span><b>${e(v)}</b></div>`).join('')}</div>` : ''}
    ${!p ? `<p class="cr-note">응답 원본을 불러오지 못해 요약만 표시합니다.${err ? ' (' + e(err) + ')' : ''}</p>` : ''}
    ${role === 'student' ? `<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" onclick="startConsultSurvey('${cid}','student')">학생 설문 다시 하기</button></div>` : ''}
  </div>`;
}
function consultRecordHtml(cid, d, prof, profErr, CF) {
  const e = escapeConsultHtml;
  const s = CF ? CF.describeRecord(d, { parent: prof.parent, student: prof.student }) : null;
  const join = (a) => (a && a.length ? a.map(e).join(', ') : '-');
  const progress = d.level === '고등'
    ? `${join(d.highSubjects)}${d.highLevel ? ' · 난이도 ' + e(d.highLevel) : ''}`
    : ([d.progressGrade, d.progressSemester, d.progressUnit].filter(Boolean).map(e).join(' ') || '-');
  const ex = d.examScores || {};
  const exams = [ex.round1, ex.round2, ex.round3, ex.round4].map((x, i) => (x ? `${i + 1}회 ${e(x)}` : '')).filter(Boolean).join(' / ') || '-';
  const scGroups = selfCheckGroups(d.selfCheck);
  const visitWith = d.visitWith === 'both' ? '학생과 함께' : d.visitWith === 'parent' ? '학부모님만' : '-';
  const step = (cls, label, val) => `<div class="cr-step ${cls}">${label}<b>${val}</b></div>`;
  const pDone = s ? s.parent.done : !!prof.parent;
  const sDone = s ? s.student.done : !!prof.student;
  const video = s?.video;
  const steps = `
    ${step('ok', '상담신청서', `저장 ${e(crFmt(d.formSavedAt || d.createdAt) || '완료')}`)}
    ${step(pDone ? 'ok' : '', '학부모 설문', pDone ? `완료 ${e(crFmt(s?.parent.at) || '')}` : '미실시')}
    ${step(sDone ? 'ok' : (d.visitWith === 'parent' ? 'warn' : ''), '학생 설문', sDone ? `완료 ${e(crFmt(s?.student.at) || '')}` : e(s?.student.label || '미실시'))}
    ${video && video.status !== 'none' && video.status !== 'pending' ? step(video.status === 'completed' ? 'ok' : '', '상담자료', e(video.label) + (video.at ? ' ' + e(crFmt(video.at)) : '')) : ''}
    ${step(s?.stage === 'consultation_completed' ? 'ok' : '', '진행 상태', e(s?.stageLabel || '신청서 접수'))}`;

  // 축별 비교: 두 결과의 축 방향(같음/다름)만 나란히 보여줌 — 새 해석·유형을 만들지 않음
  let cmp = '';
  if (pDone && sDone) {
    const pa = crAxisRows(prof.parent || { axes: d.parentSurvey?.axes }, CF);
    const sa = crAxisRows(prof.student || { axes: d.studentSurvey?.axes }, CF);
    cmp = `<div class="cr-sec"><h4>축별 비교 (학부모 관찰 ↔ 학생 응답)</h4>
      <table class="cr-table"><thead><tr><th>축</th><th>학부모</th><th>학생</th><th>비교</th></tr></thead><tbody>
      ${pa.map((a, i) => { const b = sa[i]; const both = a.v !== null && b.v !== null;
        const same = both && a.side === b.side;
        return `<tr><td>${e(a.name)}</td><td>${a.v === null ? '판단 보류' : e(a.sideName) + ' · ' + a.v}</td><td>${b.v === null ? '판단 보류' : e(b.sideName) + ' · ' + b.v}</td>
          <td>${!both ? '<span class="cr-muted">한쪽 판단 보류</span>' : same ? '<span class="cr-same">같은 방향</span>' : '<span class="cr-diff">차이 있음</span>'}${both ? ` <span class="cr-muted">(점수 차 ${Math.abs(a.v - b.v)})</span>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  // 문항별 응답 (같은 축끼리 나란히)
  let answers = '';
  if (prof.parent?.answers?.length || prof.student?.answers?.length) {
    const byAxis = (p) => { const m = {}; (p?.answers || []).forEach((x) => { const k = x.axis || 'etc'; (m[k] = m[k] || []).push(x); }); return m; };
    const pa = byAxis(prof.parent), sa = byAxis(prof.student);
    const names = { M: '학습 동기', S: '학습 전략', E: '실행 관리', T: '실전 안정', etc: '참고 문항' };
    const cell = (list) => (list && list.length ? list.map((x) => `<div class="cr-qa"><span>${e(x.q)}</span><b>${e(x.a ?? '-')}</b></div>`).join('') : '<span class="cr-muted">-</span>');
    answers = `<div class="cr-sec"><h4>문항별 응답</h4>
      <table class="cr-table"><thead><tr><th style="width:90px">축</th><th>학부모 응답</th><th>학생 응답</th></tr></thead><tbody>
      ${['M', 'S', 'E', 'T', 'etc'].map((k) => (pa[k] || sa[k]) ? `<tr><td>${names[k]}</td><td>${cell(pa[k])}</td><td>${cell(sa[k])}</td></tr>` : '').join('')}
      </tbody></table></div>`;
  }
  return `
    <div class="cr-head">
      <div>
        <div class="cr-title">${e(d.studentName || '이름없음')} <span>${e(d.level ? d.level + '부' : '')}</span></div>
        <div class="cr-sub">${e(d.schoolGrade || '')} · ${e(d.branch || '')} · 접수 ${e(crFmt(d.createdAt) || '-')}${d.flowVersion === 2 ? '' : ' · 기존 방식 접수'}</div>
      </div>
      <div class="cr-acts">
        <button class="btn btn-primary btn-sm" onclick="startConsultSurvey('${cid}','student')">학생 설문 시작</button>
        ${pDone ? '' : `<button class="btn btn-secondary btn-sm" onclick="startConsultSurvey('${cid}','parent')">학부모 설문 진행</button>`}
        <button class="btn btn-primary btn-sm" onclick="saveConsultImage('${cid}')">📷 결과 이미지 (카톡 전달용)</button>
        <button class="btn btn-secondary btn-sm" onclick="window.open('consult-deck.html?deck=${/고/.test(d.level || '') ? 'high' : 'middle'}','_blank')">${/고/.test(d.level || '') ? '고등' : '중등'} 상담자료 열기</button>
      </div>
    </div>
    <div class="cr-sec"><h4>상담 진행</h4><div class="cr-steps">${steps}</div></div>
    <div class="cr-sec" id="cr-sec-form"><h4>학생 기본 정보 · 상담신청서</h4>
      <div class="cr-info">
        <div><span>학생</span><b>${e(d.studentName || '-')}</b></div>
        <div><span>학교 / 학년</span><b>${e(d.schoolGrade || '-')}</b></div>
        <div><span>과정 · 지점</span><b>${e(d.level ? d.level + '부' : '-')} · ${e(d.branch || '-')}</b></div>
        <div><span>학부모 연락처</span><b>${e(d.parentPhone || '-')}</b></div>
        <div><span>학생 연락처</span><b>${e(d.studentPhone || '-')}</b></div>
        <div><span>오늘 오신 분</span><b>${visitWith}</b></div>
        <div><span>방문 경로</span><b>${join(d.visitPath)}${d.visitPathEtc ? ' / ' + e(d.visitPathEtc) : ''}</b></div>
        <div><span>진도</span><b>${progress}</b></div>
        <div><span>최근 시험</span><b>${exams}</b></div>
        <div><span>자신 있는 영역</span><b>${join(d.strongAreas)}</b></div>
        <div><span>어려워하는 영역</span><b>${join(d.weakAreas)}</b></div>
        ${scGroups.length ? scGroups.map((g) => `<div><span>${g.who ? '자가진단 · ' + g.who : '자가진단'}</span><b>${selfCheckLine(g.s) || '-'}</b></div>`).join('') : '<div><span>자가진단</span><b>-</b></div>'}
      </div>
    </div>
    <div class="cr-sec"><h4>학습 성향 설문 결과 <span class="cr-muted" style="font-weight:500">— 학부모·학생 결과는 각각 따로 보관되며 합치지 않습니다</span></h4>
      <div class="cr-cmp">
        ${crSurveyCol(cid, 'parent', d, prof.parent, profErr.parent, CF)}
        ${crSurveyCol(cid, 'student', d, prof.student, profErr.student, CF)}
      </div>
    </div>
    ${cmp}
    ${answers}`;
}

// ── 설문 시작 (원장님이 상담 기록에서 직접 진행 — 관리자 세션의 전체 화면 안에서 진행, 종료는 길게 누르기) ──
// ※ 상담 오신 분께 기기를 맡겨 두는 용도로는 쓰지 않습니다 → 상담 QR(방문자 전용 화면)을 사용
window.startConsultSurvey = function(cid, role) {
  if (role !== 'student' && role !== 'parent') return;
  const q = new URLSearchParams({ cid, role, kiosk: '1' });
  // 학부모 설문은 상담 흐름 그대로(결과 → 안내 영상) 이어서 진행
  if (role === 'parent') { q.set('flow', 'visit'); q.set('src', 'tablet'); }
  if (document.getElementById('consultRecordModal').classList.contains('open')) closeConsultRecord();
  openConsultKiosk('learning-profile.html?' + q.toString());
};

// iframe(관리자 페이지 안 설문 화면)에서 저장 알림이 오면 목록·통합 화면 새로고침
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'swc-consult') return;
  clearTimeout(consultRefreshTimer);
  consultRefreshTimer = setTimeout(() => {
    if (document.getElementById('tab-consult')?.classList.contains('active')) initConsultTab();
  }, 700);
});

// ── 상담 안내 영상 설정 (consultConfig/video) ──
let cvConfig = null;
let cvPromoList = [];
async function loadConsultVideoSetting() {
  const sum = document.getElementById('cvSummary');
  if (!sum) return;
  try {
    const snap = await getDoc(doc(db, 'consultConfig', 'video'));
    cvConfig = snap.exists() ? snap.data() : null;
  } catch(e) { sum.textContent = '설정을 불러오지 못했습니다: ' + e.message; return; }
  try {
    const ps = await getDocs(query(collection(db, 'promoVideos'), orderBy('order', 'asc')));
    cvPromoList = []; ps.forEach((x) => { const v = x.data(); if (v.vimeoId) cvPromoList.push({ vimeoId: String(v.vimeoId), title: v.title || '' }); });
  } catch(e) { cvPromoList = []; }
  const sel = document.getElementById('cvPromo');
  const ids = new Set(cvPromoList.map((v) => v.vimeoId));
  const extra = cvConfig?.vimeoId && !ids.has(String(cvConfig.vimeoId)) ? [{ vimeoId: String(cvConfig.vimeoId), title: (cvConfig.title || '') + ' (홍보영상 목록에 없음)' }] : [];
  sel.innerHTML = '<option value="">선택하세요</option>' + [...extra, ...cvPromoList]
    .map((v) => `<option value="${escapeConsultHtml(v.vimeoId)}" data-title="${escapeConsultHtml(v.title)}">${escapeConsultHtml(v.title || v.vimeoId)} · Vimeo ${escapeConsultHtml(v.vimeoId)}</option>`).join('');
  const kind = !cvConfig || cvConfig.enabled === false ? 'none' : cvConfig.vimeoId ? 'promo' : 'url';
  document.getElementById('cvKind').value = kind;
  if (kind === 'promo') sel.value = String(cvConfig.vimeoId);
  document.getElementById('cvUrl').value = kind === 'url' ? (cvConfig.url || '') : '';
  document.getElementById('cvStart').value = cvConfig?.start ? cvConfig.start : '';
  document.getElementById('cvEnd').value = cvConfig?.end ? cvConfig.end : '';
  cvKindChanged();
  sum.textContent = kind === 'none' ? '등록 안 됨 · 영상 단계 없이 바로 완료'
    : kind === 'promo' ? `홍보영상 · ${cvConfig.title || 'Vimeo ' + cvConfig.vimeoId}` : `주소 · ${cvConfig.url}`;
}
window.cvKindChanged = function() {
  const k = document.getElementById('cvKind').value;
  document.getElementById('cvPromoWrap').style.display = k === 'promo' ? '' : 'none';
  document.getElementById('cvUrlWrap').style.display = k === 'url' ? '' : 'none';
  ['cvStart', 'cvEnd'].forEach((id) => { document.getElementById(id).closest('.form-group').style.display = k === 'none' ? 'none' : ''; });
};
function cvReadForm() {
  const kind = document.getElementById('cvKind').value;
  const st = parseFloat(document.getElementById('cvStart').value), en = parseFloat(document.getElementById('cvEnd').value);
  const data = { enabled: kind !== 'none', vimeoId: '', url: '', title: '', start: isFinite(st) && st > 0 ? st : 0, end: isFinite(en) && en > 0 ? en : null };
  if (kind === 'promo') {
    const opt = document.getElementById('cvPromo').selectedOptions[0];
    if (!opt || !opt.value) return { error: '홍보영상을 선택해 주세요.' };
    data.vimeoId = opt.value; data.title = (opt.dataset.title || '').replace(/ \(홍보영상 목록에 없음\)$/, '');
  } else if (kind === 'url') {
    const u = document.getElementById('cvUrl').value.trim();
    if (!u) return { error: '영상 주소를 입력해 주세요.' };
    data.url = u;
  }
  if (data.end !== null && data.end <= data.start) return { error: '끝 시간은 시작 시간보다 커야 합니다.' };
  return { data };
}
window.saveConsultVideoSetting = async function() {
  const msg = document.getElementById('cvMsg');
  const { data, error } = cvReadForm();
  if (error) { msg.style.color = '#D64545'; msg.textContent = error; return; }
  msg.style.color = ''; msg.textContent = '저장 중...';
  try {
    await setDoc(doc(db, 'consultConfig', 'video'), { ...data, updatedAt: Timestamp.now(), updatedBy: auth.currentUser?.email || '' });
    msg.textContent = '✓ 저장했습니다. 다음 상담부터 적용됩니다.';
    showToast('상담 안내 영상 설정을 저장했습니다');
    loadConsultVideoSetting();
  } catch(e) { msg.style.color = '#D64545'; msg.textContent = '저장하지 못했습니다: ' + e.message; }
};
window.previewConsultVideo = async function() {
  const msg = document.getElementById('cvMsg');
  const { data, error } = cvReadForm();
  if (error) { msg.style.color = '#D64545'; msg.textContent = error; return; }
  if (!data.enabled) { msg.style.color = ''; msg.textContent = '영상을 사용하지 않도록 설정되어 있습니다.'; return; }
  const CF = await consultFlowModule();
  const src = CF ? CF.parseVideoSource(data) : null;
  if (!src) { msg.style.color = '#D64545'; msg.textContent = '영상 주소를 확인해 주세요.'; return; }
  const url = src.kind === 'vimeo' ? `https://vimeo.com/${src.id}${src.hash ? '/' + src.hash : ''}${src.start ? '#t=' + Math.floor(src.start) + 's' : ''}`
    : src.kind === 'youtube' ? `https://www.youtube.com/watch?v=${src.id}${src.start ? '&t=' + Math.floor(src.start) + 's' : ''}` : src.url;
  window.open(url, '_blank');
};

// ══════ 관리자 페이지 안 설문 화면 (원장님이 상담 기록에서 직접 진행) ══════
// learning-profile.html 을 이 화면 안(iframe)에 띄워 관리자 로그인 상태로 저장합니다. (startConsultSurvey 에서만 사용)
// ※ 2026.10: '태블릿 상담지 열기' 버튼은 없앰 — 관리자 로그인된 기기를 상담 오신 분께 맡기지 않도록
//   상담 오신 분은 상담 QR(consult-visit.html → 방문자 전용 세션)로만 진행합니다.
let ckBound = false;
function ckBindOnce() {
  if (ckBound) return;
  ckBound = true;
  // 종료 버튼: 1.5초 길게 눌러야 종료 (학생·학부모가 실수로 관리자 화면에 들어가지 않도록)
  const exitBtn = document.getElementById('ckExitBtn');
  let holdTimer = null;
  const startHold = (e) => {
    e.preventDefault();
    exitBtn.classList.add('holding');
    holdTimer = setTimeout(() => { exitBtn.classList.remove('holding'); closeConsultKiosk(); }, 1500);
  };
  const cancelHold = () => { clearTimeout(holdTimer); exitBtn.classList.remove('holding'); };
  exitBtn.addEventListener('pointerdown', startHold);
  ['pointerup','pointerleave','pointercancel'].forEach(ev => exitBtn.addEventListener(ev, cancelHold));
  exitBtn.addEventListener('contextmenu', e => e.preventDefault());
}

window.openConsultKiosk = function(url) {
  ckBindOnce();
  const target = typeof url === 'string' && url ? url : '';
  if (!target) {
    // 새 상담지: 이전 사용자의 진행 정보·임시 입력값이 이 기기에 남지 않도록 비움
    try { sessionStorage.removeItem('swc_consult_flow:kiosk'); sessionStorage.removeItem('swc_consult_draft:kiosk'); } catch(e) {}
  }
  document.getElementById('ckFrame').src = target || 'consult-visit.html?src=tablet&kiosk=1&b=' + encodeURIComponent('평촌관');
  document.getElementById('consultKiosk').classList.add('open');
  document.body.classList.add('ck-lock');
  const el = document.documentElement;
  try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(()=>{}); } catch(e) {}
};

window.closeConsultKiosk = function() {
  document.getElementById('consultKiosk').classList.remove('open');
  document.getElementById('ckFrame').src = 'about:blank';
  if (!document.getElementById('consultRecordModal').classList.contains('open')) document.body.classList.remove('ck-lock');
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(()=>{});
    }
  } catch(e) {}
  if (document.getElementById('tab-consult')?.classList.contains('active')) initConsultTab();
};

// ══════ 수업 미리보기 (상담 라운지 consult-lounge.html) 구성 — consultConfig/lounge ══════
// 로그인 없이 읽는 공개 설정: 여기서 고른 영상(Vimeo ID·제목·설명)만 상담 화면에 노출됩니다.
let lgState = { enabled: true, intro: '', videos: [] };
let lgDirty = false;
let lgSources = null;   // 검색용 강의 목록 [{ vimeoId, title, tag, from, desc }]

async function lgLoad() {
  const st = document.getElementById('lgStatus');
  if (!st || lgDirty) return;          // 편집 중이면 목록 새로고침 때 덮어쓰지 않음
  try {
    const snap = await getDoc(doc(db, 'consultConfig', 'lounge'));
    const d = snap.exists() ? snap.data() : null;
    lgState = {
      enabled: d ? d.enabled !== false : true,
      intro: d?.intro || '',
      videos: (Array.isArray(d?.videos) ? d.videos : [])
        .map(v => ({ vimeoId: String(v.vimeoId || ''), title: v.title || '', desc: v.desc || '', from: v.from || '' }))
        .filter(v => v.vimeoId)
    };
    document.getElementById('lgEnabled').checked = lgState.enabled;
    document.getElementById('lgIntro').value = lgState.intro;
    lgRenderList();
    const n = lgState.videos.length;
    st.textContent = !d ? '아직 저장된 구성이 없습니다 (상담자료만 표시)'
      : (!lgState.enabled ? '샘플 강의 숨김 (상담자료만 표시)' : n ? `공개 중 · 영상 ${n}개` : '공개 중 · 영상 없음 (상담자료만 표시)')
        + (d.updatedAt?.toDate ? ` · ${formatConsultDate(d.updatedAt.toDate())} 저장` : '');
  } catch (e) { st.textContent = '불러오지 못했습니다: ' + e.message; }
}
window.lgMarkDirty = function() {
  lgDirty = true;
  const m = document.getElementById('lgMsg');
  if (m) { m.style.color = 'var(--purple, #5B3FA6)'; m.textContent = '저장하지 않은 변경 사항이 있습니다'; }
};
function lgRenderList() {
  const box = document.getElementById('lgList');
  const n = lgState.videos.length;
  document.getElementById('lgCount').textContent = n ? `(${n}개 · 위에서부터 순서대로 표시)` : '';
  if (!n) { box.innerHTML = '<div class="lg-empty">아직 고른 영상이 없습니다. 아래에서 검색해 추가하세요.</div>'; return; }
  box.innerHTML = lgState.videos.map((v, i) => `
    <div class="lg-item">
      <div class="lg-ord">
        <button type="button" onclick="lgMove(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button>
        <button type="button" onclick="lgMove(${i},1)" ${i === n - 1 ? 'disabled' : ''} aria-label="아래로">▼</button>
      </div>
      <div class="lg-fields">
        <input type="text" value="${escapeConsultHtml(v.title)}" maxlength="80" placeholder="표시할 제목" oninput="lgEdit(${i},'title',this.value)">
        <input type="text" value="${escapeConsultHtml(v.desc)}" maxlength="200" placeholder="한 줄 설명 (선택) — 예: 개념을 한 번에 잡는 원장 직강" oninput="lgEdit(${i},'desc',this.value)">
        <div class="lg-meta">Vimeo ${escapeConsultHtml(v.vimeoId)}${v.from ? ' · ' + escapeConsultHtml(v.from) : ''} · <a href="https://vimeo.com/${escapeConsultHtml(v.vimeoId)}" target="_blank" rel="noopener">영상 확인</a></div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" onclick="lgRemove(${i})">빼기</button>
    </div>`).join('');
}
window.lgEdit = function(i, k, val) { if (lgState.videos[i]) { lgState.videos[i][k] = val; lgMarkDirty(); } };
window.lgMove = function(i, d) {
  const a = lgState.videos, j = i + d;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  lgRenderList(); lgMarkDirty();
};
window.lgRemove = function(i) { lgState.videos.splice(i, 1); lgRenderList(); renderLoungePicker(); lgMarkDirty(); };

window.loadLoungeSources = async function() {
  if (lgSources) return;
  lgSources = [];
  const box = document.getElementById('lgPick');
  box.innerHTML = '<div class="lg-empty">강의 목록을 불러오는 중...</div>';
  try {
    const [vs, ap] = await Promise.all([
      getDocs(collection(db, 'videos')),
      getDocs(collection(db, 'apexVideos')).catch(() => null)
    ]);
    vs.forEach(x => { const v = x.data(); if (v.vimeoId) lgSources.push({ vimeoId: String(v.vimeoId), title: v.title || '', tag: v.tag || '', from: '강의 목록', desc: '' }); });
    if (ap) ap.forEach(x => { const v = x.data(); if (v.vimeoId) lgSources.push({ vimeoId: String(v.vimeoId), title: v.title || '', tag: v.category || '', from: '에이펙스관', desc: v.description || '' }); });
  } catch (e) {
    lgSources = null;
    box.innerHTML = `<div class="lg-empty" style="color:#D64545;">강의 목록을 불러오지 못했습니다: ${escapeConsultHtml(e.message)}</div>`;
    return;
  }
  box.innerHTML = '';
  renderLoungePicker();
};
window.renderLoungePicker = function() {
  const box = document.getElementById('lgPick');
  if (!box || !lgSources) return;
  const q = document.getElementById('lgSearch').value.trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const chosen = new Set(lgState.videos.map(v => v.vimeoId));
  const words = q.split(/\s+/);
  const hits = lgSources.filter(v => {
    const t = `${v.title} ${v.tag} ${v.from} ${v.vimeoId}`.toLowerCase();
    return words.every(w => t.includes(w));
  }).slice(0, 40);
  if (!hits.length) { box.innerHTML = '<div class="lg-empty">검색 결과가 없습니다.</div>'; return; }
  box.innerHTML = hits.map(v => {
    const on = chosen.has(v.vimeoId);
    return `<div class="lg-hit"><div><b>${escapeConsultHtml(v.title || '(제목 없음)')}</b><small>${escapeConsultHtml(v.from)}${v.tag ? ' · ' + escapeConsultHtml(v.tag) : ''} · Vimeo ${escapeConsultHtml(v.vimeoId)}</small></div>
      <button type="button" class="btn ${on ? 'btn-secondary' : 'btn-primary'} btn-sm" ${on ? 'disabled' : ''} onclick="lgAdd('${escapeConsultHtml(v.vimeoId)}')">${on ? '추가됨' : '추가'}</button></div>`;
  }).join('');
};
window.lgAdd = function(id) {
  const v = (lgSources || []).find(x => x.vimeoId === id);
  if (!v || lgState.videos.some(x => x.vimeoId === id)) return;
  lgState.videos.push({ vimeoId: v.vimeoId, title: v.title, desc: v.desc || '', from: v.from });
  lgRenderList(); renderLoungePicker(); lgMarkDirty();
};
window.addLoungeManual = function() {
  const raw = document.getElementById('lgManualId').value.trim();
  const m = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/) || raw.match(/^(\d{5,})$/);
  const msg = document.getElementById('lgMsg');
  if (!m) { msg.style.color = '#D64545'; msg.textContent = 'Vimeo 주소 또는 숫자 ID를 확인해 주세요.'; return; }
  if (lgState.videos.some(x => x.vimeoId === m[1])) { msg.style.color = '#D64545'; msg.textContent = '이미 추가된 영상입니다.'; return; }
  lgState.videos.push({ vimeoId: m[1], title: document.getElementById('lgManualTitle').value.trim(), desc: '', from: '직접 입력' });
  document.getElementById('lgManualId').value = '';
  document.getElementById('lgManualTitle').value = '';
  lgRenderList(); renderLoungePicker(); lgMarkDirty();
};
window.saveLoungeConfig = async function() {
  const msg = document.getElementById('lgMsg');
  const videos = lgState.videos.map(v => ({
    vimeoId: String(v.vimeoId).replace(/\D/g, ''),
    title: (v.title || '').trim().slice(0, 80),
    desc: (v.desc || '').trim().slice(0, 200),
    from: v.from || ''
  })).filter(v => v.vimeoId);
  if (videos.some(v => !v.title)) { msg.style.color = '#D64545'; msg.textContent = '제목이 비어 있는 영상이 있습니다.'; return; }
  const data = {
    enabled: document.getElementById('lgEnabled').checked,
    intro: document.getElementById('lgIntro').value.trim().slice(0, 300),
    videos, updatedAt: Timestamp.now(), updatedBy: auth.currentUser?.email || ''
  };
  msg.style.color = ''; msg.textContent = '저장 중...';
  try {
    await setDoc(doc(db, 'consultConfig', 'lounge'), data);
    lgDirty = false;
    msg.textContent = '✓ 저장했습니다. 상담 화면에 바로 반영됩니다.';
    showToast('수업 미리보기 구성을 저장했습니다');
    lgLoad();
  } catch (e) { msg.style.color = '#D64545'; msg.textContent = '저장하지 못했습니다: ' + e.message; }
};

