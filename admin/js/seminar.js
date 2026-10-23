'use strict';
/* ═══════════════════════════════════════════════════════════
   설명회 신청 (seminar.html)
   - 설명회 설정: seminarConfig/current (제목 · 안내 문구 · 관별 일시/장소 · 접수 받기)
   - 참석 신청자: seminarRsvps (홈페이지에서 생성, 관리자가 조회 · 참석 체크 · 메모 · 삭제 · 엑셀)
   모든 파일은 같은 전역 범위를 공유합니다 (db, getDocs, doc 등은 00-firebase.js에서 노출)
   ═══════════════════════════════════════════════════════════ */
let smConfig = null;
let smList = [];
let smFilterBranch = 'all';
let smSearch = '';

const SM_DEFAULT_CONFIG = {
  title: '예비고1 설명회',
  intro: '아래 일정 중 참석하실 설명회를 선택하고 정보를 남겨 주세요.\n신청해 주신 분께는 설명회 전 안내 연락을 드립니다.',
  open: true,
  closedMessage: '궁금하신 점은 학원으로 전화 문의해 주세요.',
  sessions: [
    { branch: '산본관', when: '10월 30일(금) 오후 7시', place: '군포시 산본로 390 5층' },
    { branch: '평촌관', when: '10월 31일(토) 오후 7시', place: '안양시 동안구 평촌대로 117 맵시프라자 4층' },
  ],
};

function smEsc(v) { return escapeConsultHtml(v == null ? '' : String(v)); }
function smDate(ts) {
  const d = ts && ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function smDateFull(ts) {
  const d = ts && ts.toDate ? ts.toDate() : null;
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function smSession(branch) {
  const s = (smConfig && smConfig.sessions || []).find(x => x.branch === branch);
  return s ? s.when || '' : '';
}

/* ── 탭 열기 ── */
window.initSeminarTab = async function() {
  await Promise.all([smLoadConfig(), smLoadList()]);
};

/* ── 설정 ── */
async function smLoadConfig() {
  try {
    const snap = await getDoc(doc(db, 'seminarConfig', 'current'));
    smConfig = snap.exists() ? { ...SM_DEFAULT_CONFIG, ...snap.data() } : { ...SM_DEFAULT_CONFIG };
    if (!Array.isArray(smConfig.sessions) || !smConfig.sessions.length) smConfig.sessions = SM_DEFAULT_CONFIG.sessions;
  } catch (e) {
    smConfig = { ...SM_DEFAULT_CONFIG };
    showMsg('smConfigMsg', '설정을 불러오지 못했습니다: ' + e.message, 'error');
  }
  smFillConfigForm();
}

function smFillConfigForm() {
  const c = smConfig || SM_DEFAULT_CONFIG;
  const get = (b) => (c.sessions || []).find(x => x.branch === b) || {};
  const sb = get('산본관'), pc = get('평촌관');
  document.getElementById('sm-title').value = c.title || '';
  document.getElementById('sm-intro').value = c.intro || '';
  document.getElementById('sm-sb-when').value = sb.when || '';
  document.getElementById('sm-sb-place').value = sb.place || '';
  document.getElementById('sm-pc-when').value = pc.when || '';
  document.getElementById('sm-pc-place').value = pc.place || '';
  document.getElementById('sm-closed-msg').value = c.closedMessage || '';
  const sw = document.getElementById('sm-open');
  sw.classList.toggle('on', c.open !== false);
  document.getElementById('sm-open-label').textContent = c.open !== false ? '홈페이지에서 신청 받는 중' : '접수 마감 (신청 페이지에 마감 안내 표시)';
}

window.toggleSeminarOpen = function() {
  const sw = document.getElementById('sm-open');
  sw.classList.toggle('on');
  document.getElementById('sm-open-label').textContent = sw.classList.contains('on') ? '홈페이지에서 신청 받는 중' : '접수 마감 (신청 페이지에 마감 안내 표시)';
};

window.saveSeminarConfig = async function() {
  const btn = document.getElementById('sm-save-btn');
  const title = document.getElementById('sm-title').value.trim();
  if (!title) { showMsg('smConfigMsg', '설명회 제목을 입력하세요.', 'error'); return; }
  const payload = {
    title,
    intro: document.getElementById('sm-intro').value.trim(),
    open: document.getElementById('sm-open').classList.contains('on'),
    closedMessage: document.getElementById('sm-closed-msg').value.trim(),
    sessions: [
      { branch: '산본관', when: document.getElementById('sm-sb-when').value.trim(), place: document.getElementById('sm-sb-place').value.trim() },
      { branch: '평촌관', when: document.getElementById('sm-pc-when').value.trim(), place: document.getElementById('sm-pc-place').value.trim() },
    ],
    updatedAt: Timestamp.now(),
  };
  btn.disabled = true;
  try {
    await setDoc(doc(db, 'seminarConfig', 'current'), payload, { merge: true });
    smConfig = { ...smConfig, ...payload };
    smFillConfigForm();
    showMsg('smConfigMsg', '✅ 저장되었습니다. 신청 페이지(seminar.html)에 바로 반영됩니다.', 'success');
    showToast('설명회 설정이 저장되었습니다');
    smRenderList();
  } catch (e) {
    showMsg('smConfigMsg', '오류: ' + e.message, 'error');
  } finally { btn.disabled = false; }
};

/* ── 신청자 명단 ── */
async function smLoadList() {
  const el = document.getElementById('smList');
  el.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'seminarRsvps'), orderBy('createdAt', 'desc')));
    smList = [];
    snap.forEach(d => smList.push({ id: d.id, ...d.data() }));
    smRenderList();
  } catch (e) {
    el.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${smEsc(e.message)}</div>`;
  }
}

window.setSeminarFilter = function() {
  smFilterBranch = document.getElementById('smBranchFilter').value;
  smSearch = (document.getElementById('smSearch').value || '').trim().replace(/-/g, '');
  smRenderList();
};

function smFiltered() {
  return smList.filter(x => {
    if (smFilterBranch !== 'all' && x.branch !== smFilterBranch) return false;
    if (!smSearch) return true;
    const hay = [x.parentName, x.studentName, x.parentPhone, x.studentPhone, x.grade, x.hopeSchool].map(v => String(v || '').replace(/-/g, '')).join(' ');
    return hay.includes(smSearch);
  });
}

function smRenderList() {
  const el = document.getElementById('smList');
  const all = smList.length;
  const sb = smList.filter(x => x.branch === '산본관').length;
  const pc = smList.filter(x => x.branch === '평촌관').length;
  const attended = smList.filter(x => x.attended).length;
  document.getElementById('smStats').innerHTML = `
    <div class="sm-stat"><span class="n">${all}</span><span class="k">전체 신청</span></div>
    <div class="sm-stat"><span class="n">${sb}</span><span class="k">산본관${smSession('산본관') ? ' · ' + smEsc(smSession('산본관')) : ''}</span></div>
    <div class="sm-stat"><span class="n">${pc}</span><span class="k">평촌관${smSession('평촌관') ? ' · ' + smEsc(smSession('평촌관')) : ''}</span></div>
    <div class="sm-stat"><span class="n">${attended}</span><span class="k">참석 확인</span></div>`;

  const rows = smFiltered();
  document.getElementById('smCount').textContent = rows.length === all ? `${all}명` : `${rows.length}명 / 전체 ${all}명`;
  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:14px 0;">' + (all ? '조건에 맞는 신청이 없습니다.' : '아직 신청이 없습니다. 홈페이지 설명회 배너 또는 seminar.html 링크로 신청을 받습니다.') + '</div>';
    return;
  }
  el.innerHTML = `
    <div class="sm-table-wrap">
    <table class="cr-table sm-table">
      <thead><tr>
        <th>#</th><th>신청일시</th><th>참석관</th><th>학부모</th><th>학부모 연락처</th><th>학생</th><th>학년</th><th>1차 지망 고교</th><th>학생 연락처</th><th>참석</th><th>메모</th><th></th>
      </tr></thead>
      <tbody>
      ${rows.map((x, i) => `
        <tr class="${x.attended ? 'attended' : ''}">
          <td style="color:var(--muted);">${rows.length - i}</td>
          <td style="white-space:nowrap;">${smEsc(smDate(x.createdAt))}</td>
          <td><span class="sm-branch ${x.branch === '산본관' ? 'sb' : 'pc'}">${smEsc(x.branch || '-')}</span></td>
          <td><b>${smEsc(x.parentName || '-')}</b></td>
          <td style="white-space:nowrap;"><a href="tel:${smEsc(x.parentPhone || '')}" style="color:inherit;text-decoration:none;">${smEsc(x.parentPhone || '-')}</a></td>
          <td><b>${smEsc(x.studentName || '-')}</b></td>
          <td>${smEsc(x.grade || '-')}</td>
          <td>${x.hopeSchool ? smEsc(x.hopeSchool) : '<span style="color:var(--muted);">-</span>'}</td>
          <td style="white-space:nowrap;">${x.studentPhone ? `<a href="tel:${smEsc(x.studentPhone)}" style="color:inherit;text-decoration:none;">${smEsc(x.studentPhone)}</a>` : '<span style="color:var(--muted);">-</span>'}</td>
          <td><label class="sm-check"><input type="checkbox" ${x.attended ? 'checked' : ''} onchange="toggleSeminarAttended('${x.id}', this.checked)"> ${x.attended ? '참석' : '예정'}</label></td>
          <td class="sm-memo" onclick="editSeminarMemo('${x.id}')" title="클릭해서 메모 입력">${x.memo ? smEsc(x.memo) : '<span style="color:var(--muted);">+ 메모</span>'}</td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteSeminarRsvp('${x.id}')">삭제</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

window.toggleSeminarAttended = async function(id, on) {
  const x = smList.find(v => v.id === id); if (!x) return;
  try {
    await updateDoc(doc(db, 'seminarRsvps', id), { attended: !!on, attendedAt: on ? Timestamp.now() : null });
    x.attended = !!on;
    smRenderList();
  } catch (e) { alert('오류: ' + e.message); smRenderList(); }
};

window.editSeminarMemo = async function(id) {
  const x = smList.find(v => v.id === id); if (!x) return;
  const memo = prompt(`${x.studentName || ''} 학생 (${x.parentName || ''} 학부모) 메모`, x.memo || '');
  if (memo === null) return;
  try {
    await updateDoc(doc(db, 'seminarRsvps', id), { memo: memo.trim() });
    x.memo = memo.trim();
    smRenderList();
  } catch (e) { alert('오류: ' + e.message); }
};

window.deleteSeminarRsvp = async function(id) {
  const x = smList.find(v => v.id === id); if (!x) return;
  if (!confirm(`${x.branch || ''} ${x.studentName || ''} 학생 (${x.parentName || ''} 학부모) 신청을 삭제할까요?`)) return;
  try {
    await deleteDoc(doc(db, 'seminarRsvps', id));
    smList = smList.filter(v => v.id !== id);
    smRenderList();
    showToast('삭제되었습니다');
  } catch (e) { alert('오류: ' + e.message); }
};

/* ── 엑셀 다운로드 (전체 · 산본관 · 평촌관 시트) ── */
window.exportSeminarExcel = function() {
  if (!smList.length) { alert('내려받을 신청이 없습니다.'); return; }
  if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해 주세요.'); return; }
  const toRows = (arr) => arr
    .slice()
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map((x, i) => ({
      '번호': i + 1,
      '신청일시': smDateFull(x.createdAt),
      '참석관': x.branch || '',
      '설명회 일시': x.sessionWhen || smSession(x.branch),
      '학부모 성함': x.parentName || '',
      '학부모 연락처': x.parentPhone || '',
      '학생 이름': x.studentName || '',
      '학년': x.grade || '',
      '1차 지망 고교': x.hopeSchool || '',
      '학생 연락처': x.studentPhone || '',
      '참석 확인': x.attended ? 'O' : '',
      '메모': x.memo || '',
    }));
  const wb = XLSX.utils.book_new();
  const addSheet = (name, arr) => {
    const ws = XLSX.utils.json_to_sheet(toRows(arr));
    ws['!cols'] = [4, 17, 8, 20, 12, 15, 12, 10, 14, 15, 9, 30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addSheet('전체', smList);
  addSheet('산본관', smList.filter(x => x.branch === '산본관'));
  addSheet('평촌관', smList.filter(x => x.branch === '평촌관'));
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const title = (smConfig && smConfig.title || '설명회').replace(/[\\/:*?"<>|]/g, '');
  XLSX.writeFile(wb, `${title}_신청자_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xlsx`);
};

window.copySeminarLink = async function() {
  const url = 'https://www.fanmath.co.kr/seminar.html';
  try { await navigator.clipboard.writeText(url); showToast('신청 페이지 주소를 복사했습니다'); }
  catch (e) { prompt('신청 페이지 주소', url); }
};
