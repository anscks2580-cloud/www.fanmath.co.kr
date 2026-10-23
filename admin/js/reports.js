'use strict';
/* ═══════════════════════════════════════════════════════════
   수업 보고: 월말보고서 PDF · 주간성취도/반별진도 엑셀 · 제출 현황
   (admin.html에서 분리 — 원본 6122~6676줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 개별 PDF 다운로드 (fetch→blob, CORS 우회) ──
// Firebase Storage URL → Blob 변환 (XHR, CORS 우회)
function fetchBlob(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => xhr.status === 200 ? resolve(xhr.response) : reject(new Error('status ' + xhr.status));
    xhr.onerror = () => reject(new Error('network error'));
    xhr.open('GET', url);
    xhr.send();
  });
}

window.downloadPDF = async (url, teacherName, month, fileName) => {
  try {
    const blob = await fetchBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${teacherName}_${month}_${fileName}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch(e) {
    alert('다운로드 실패: ' + e.message + '\n새 탭에서 직접 열려면 아래 URL을 복사해 주세요.\n' + url);
  }
};

// ── 주간성취도 엑셀 다운로드 ──
// 기간·선생님 조건으로 제출 문서를 가져옴
async function fetchWeeklyDocs(fromVal, toVal, teacherUid) {
  const fromTs = new Date(fromVal + 'T00:00:00');
  const toTs   = new Date(toVal   + 'T23:59:59');
  const constraints = [
    where('submittedAt', '>=', Timestamp.fromDate(fromTs)),
    where('submittedAt', '<=', Timestamp.fromDate(toTs))
  ];
  if (teacherUid) constraints.push(where('teacherUid', '==', teacherUid));
  const snap = await getDocs(query(collection(db, 'weeklyReports'), ...constraints));
  const docs = [];
  snap.forEach(d => docs.push(d.data()));
  return docs;
}

// 문서 목록 → 엑셀 워크북
function buildWeeklyWorkbook(docs) {
  const rows = docs.map(data => {
    const rl = data.ratingsLabel || {};
    return {
      선생님:        data.teacherName || '',
      학생명:        data.studentName || '',
      과제충실도:    rl.homework || '',
      수업태도:      rl.attitude || '',
      클리닉참여도:  rl.clinic || '',
      담임말씀:      data.memo || '',
      제출일시:      data.submittedAt?.toDate?.()?.toLocaleDateString('ko-KR') || '',
    };
  });
  rows.sort((a, b) => {
    if (a.선생님 !== b.선생님) return a.선생님.localeCompare(b.선생님, 'ko');
    return a.학생명.localeCompare(b.학생명, 'ko');
  });

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['선생님','학생명','과제충실도','수업태도','클리닉참여도','담임말씀','제출일시']
  });
  ws['!cols'] = [{wch:10},{wch:8},{wch:10},{wch:10},{wch:12},{wch:40},{wch:12}];
  const headerRange = XLSX.utils.decode_range(ws['!ref']);
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cellAddr = XLSX.utils.encode_cell({r: 0, c});
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: '1A1230' } },
      fill: { fgColor: { rgb: 'F0C040' } },
      alignment: { horizontal: 'center' }
    };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '주간성취도');
  return { wb, count: rows.length };
}

// 파일 이름에 못 쓰는 글자 정리
const safeFileName = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '이름없음';

// 기간 확인 (오류 문구 or null)
function weeklyRangeError(fromVal, toVal) {
  if (!fromVal || !toVal) return '시작일과 종료일을 모두 선택해주세요.';
  if (fromVal > toVal)    return '시작일이 종료일보다 늦습니다.';
  return null;
}

window.downloadWeeklyExcel = async () => {
  const fromVal    = document.getElementById('excelDateFrom').value;
  const toVal      = document.getElementById('excelDateTo').value;
  const teacherUid = document.getElementById('excelTeacher').value;
  const err = weeklyRangeError(fromVal, toVal);
  if (err) { showMsg('excelWeeklyMsg', err, 'error'); return; }

  showMsg('excelWeeklyMsg', '데이터 조회 중...', 'success');
  try {
    const docs = await fetchWeeklyDocs(fromVal, toVal, teacherUid);
    if (!docs.length) { showMsg('excelWeeklyMsg', `${fromVal} ~ ${toVal} 제출된 성취도가 없습니다.`, 'error'); return; }
    const { wb, count } = buildWeeklyWorkbook(docs);
    const tName = teacherUid ? safeFileName(teachersCache.find(t=>t.id===teacherUid)?.name||'') + '_' : '';
    XLSX.writeFile(wb, `주간성취도_${fromVal}_${toVal}_${tName}${new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','')}.xlsx`);
    showMsg('excelWeeklyMsg', `✅ ${count}명 데이터 다운로드 완료!`, 'success');
  } catch(e) {
    showMsg('excelWeeklyMsg', '오류: ' + e.message, 'error');
  }
};

// 한 선생님 것만 엑셀로 (아래 제출 현황의 선생님별 버튼)
window.downloadWeeklyTeacherExcel = async (teacherUid, teacherName) => {
  const fromVal = document.getElementById('excelDateFrom').value;
  const toVal   = document.getElementById('excelDateTo').value;
  const err = weeklyRangeError(fromVal, toVal);
  if (err) { showMsg('excelWeeklyMsg', err, 'error'); return; }
  try {
    let docs = await fetchWeeklyDocs(fromVal, toVal, teacherUid || '');
    if (!teacherUid) docs = docs.filter(d => (d.teacherName || '(이름없음)') === teacherName);
    if (!docs.length) { showMsg('excelWeeklyMsg', `${teacherName} 선생님의 제출 내역이 없습니다.`, 'error'); return; }
    const { wb, count } = buildWeeklyWorkbook(docs);
    XLSX.writeFile(wb, `주간성취도_${safeFileName(teacherName)}_${fromVal}_${toVal}.xlsx`);
    showMsg('excelWeeklyMsg', `✅ ${teacherName} 선생님 ${count}명 데이터 다운로드 완료!`, 'success');
  } catch(e) {
    showMsg('excelWeeklyMsg', '오류: ' + e.message, 'error');
  }
};

// 선생님별로 나눈 엑셀 파일들을 ZIP 하나로
window.downloadWeeklyByTeacherZip = async () => {
  const fromVal    = document.getElementById('excelDateFrom').value;
  const toVal      = document.getElementById('excelDateTo').value;
  const teacherUid = document.getElementById('excelTeacher').value;
  const err = weeklyRangeError(fromVal, toVal);
  if (err) { showMsg('excelWeeklyMsg', err, 'error'); return; }

  const btn = document.getElementById('weeklyZipBtn');
  if (btn) { btn.disabled = true; btn.textContent = '압축 중...'; }
  showMsg('excelWeeklyMsg', '데이터 조회 중...', 'success');
  try {
    const docs = await fetchWeeklyDocs(fromVal, toVal, teacherUid);
    if (!docs.length) { showMsg('excelWeeklyMsg', `${fromVal} ~ ${toVal} 제출된 성취도가 없습니다.`, 'error'); return; }

    const byTeacher = {};
    docs.forEach(d => {
      const key = d.teacherUid || d.teacherName || '(이름없음)';
      if (!byTeacher[key]) byTeacher[key] = { name: d.teacherName || '(이름없음)', docs: [] };
      byTeacher[key].docs.push(d);
    });

    const zip = new JSZip();
    const used = {};
    Object.values(byTeacher)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .forEach(g => {
        const { wb } = buildWeeklyWorkbook(g.docs);
        const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        let base = `주간성취도_${safeFileName(g.name)}_${fromVal}_${toVal}`;
        if (used[base]) base += `_${++used[base]}`; else used[base] = 1;
        zip.file(base + '.xlsx', data);
      });

    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `주간성취도_선생님별_${fromVal}_${toVal}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showMsg('excelWeeklyMsg', `✅ 선생님 ${Object.keys(byTeacher).length}명 파일로 나눠 다운로드 완료!`, 'success');
  } catch(e) {
    showMsg('excelWeeklyMsg', '오류: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📦 선생님별 파일로 받기 (ZIP)'; }
  }
};

// ── 반별 진도 엑셀 다운로드 ──
window.downloadProgressExcel = async () => {
  const fromVal    = document.getElementById('progressDateFrom').value;
  const toVal      = document.getElementById('progressDateTo').value;
  const teacherUid = document.getElementById('progressTeacher').value;

  if (!fromVal || !toVal) { showMsg('progressExcelMsg', '시작일과 종료일을 모두 선택해주세요.', 'error'); return; }
  if (fromVal > toVal)    { showMsg('progressExcelMsg', '시작일이 종료일보다 늦습니다.', 'error'); return; }

  const fromTs = new Date(fromVal + 'T00:00:00');
  const toTs   = new Date(toVal   + 'T23:59:59');
  const label  = `${fromVal} ~ ${toVal}`;

  showMsg('progressExcelMsg', '데이터 조회 중...', 'success');

  try {
    let constraints = [
      where('submittedAt', '>=', Timestamp.fromDate(fromTs)),
      where('submittedAt', '<=', Timestamp.fromDate(toTs))
    ];
    if (teacherUid) constraints.push(where('teacherUid', '==', teacherUid));
    const q = query(collection(db, 'progressReports'), ...constraints);
    const snap = await getDocs(q);

    if (snap.empty) {
      showMsg('progressExcelMsg', `${label} 제출된 반별 진도가 없습니다.`, 'error');
      return;
    }

    const rows = [];
    snap.forEach(d => {
      const r = d.data();
      rows.push({
        선생님:         r.teacherName || '',
        반명:           r.classname || '',
        사용교재:       r.textbook || '',
        현진도:         r.curprogress || '',
        새진도:         r.newprogress || '',
        현진도반복단계: r.repeatstep || '',
        반별성취도:     r.classAchieveLabel || '',
        제출일시:       r.submittedAt?.toDate?.()?.toLocaleDateString('ko-KR') || '',
      });
    });

    rows.sort((a, b) => {
      if (a.선생님 !== b.선생님) return a.선생님.localeCompare(b.선생님, 'ko');
      return a.반명.localeCompare(b.반명, 'ko');
    });

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['선생님','반명','사용교재','현진도','새진도','현진도반복단계','반별성취도','제출일시']
    });
    ws['!cols'] = [{wch:10},{wch:14},{wch:18},{wch:20},{wch:20},{wch:14},{wch:10},{wch:12}];

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({r:0, c});
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: '1A1230' } },
        fill: { fgColor: { rgb: 'F0C040' } },
        alignment: { horizontal: 'center' }
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '반별진도');
    const tName = teacherUid ? (teachersCache.find(t => t.id === teacherUid)?.name || '') + '_' : '';
    XLSX.writeFile(wb, `반별진도_${fromVal}_${toVal}_${tName}${new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','')}.xlsx`);

    showMsg('progressExcelMsg', `✅ ${rows.length}건 데이터 다운로드 완료!`, 'success');
  } catch(e) {
    showMsg('progressExcelMsg', '오류: ' + e.message, 'error');
  }
};
window.downloadAllZip = async () => {
  if (!monthlyDocsCache.length) return;
  const btn = document.getElementById('zipBtn');
  btn.disabled = true; btn.textContent = '압축 중...';

  const zip = new JSZip();
  const folder = zip.folder('월말보고서');

  for (const data of monthlyDocsCache) {
    try {
      const blob = await fetchBlob(data.downloadURL);
      const safeName = `${data.teacherName}_${data.month}_${data.fileName||'report.pdf'}`;
      folder.file(safeName, blob);
    } catch(e) {
      console.warn('파일 가져오기 실패:', data.fileName, e);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `월말보고서_${new Date().toISOString().slice(0,7)}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);

  btn.disabled = false; btn.textContent = '📦 전체 ZIP 다운로드';
};

// ══════════════════════════════════════
// ── 월말보고서 탭 전용 로직 ──
// ══════════════════════════════════════

let monthlyAdminCache = [];   // 전체 조회 결과
let monthlySelectedUid = '';  // 현재 선택된 선생님 UID

// 탭 첫 진입 시 선생님 버튼 초기화
window.initWeeklyTab = () => {
  const sel = document.getElementById('excelTeacher');
  if (sel && sel.options.length <= 1) {
    teachingTeachers().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name + ' T';
      sel.appendChild(opt);
    });
  }
  // 기본값: 이번 주 월~일
  if (!document.getElementById('excelDateFrom').value) {
    const today = new Date();
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toISOString().slice(0,10);
    document.getElementById('excelDateFrom').value = fmt(mon);
    document.getElementById('excelDateTo').value   = fmt(sun);
  }
  loadWeeklyPreview();
};

// 날짜/선생님 필터 변경 시 자동으로 아래 목록 갱신
['excelDateFrom','excelDateTo','excelTeacher'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => loadWeeklyPreview());
});

// ── 주간성취도: 기간·선생님 필터에 맞춰 선생님별 제출 현황 표시 ──
window.loadWeeklyPreview = async () => {
  const el = document.getElementById('weeklyPreviewList');
  if (!el) return;

  const fromVal    = document.getElementById('excelDateFrom').value;
  const toVal      = document.getElementById('excelDateTo').value;
  const teacherUid = document.getElementById('excelTeacher').value;

  if (!fromVal || !toVal) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;">시작일과 종료일을 선택해주세요.</div>'; return; }
  if (fromVal > toVal)    { el.innerHTML = '<div style="color:#D64545;font-size:13px;">시작일이 종료일보다 늦습니다.</div>'; return; }

  el.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';

  const fromTs = new Date(fromVal + 'T00:00:00');
  const toTs   = new Date(toVal   + 'T23:59:59');

  try {
    let constraints = [
      where('submittedAt', '>=', Timestamp.fromDate(fromTs)),
      where('submittedAt', '<=', Timestamp.fromDate(toTs))
    ];
    if (teacherUid) constraints.push(where('teacherUid', '==', teacherUid));
    const q = query(collection(db, 'weeklyReports'), ...constraints);
    const snap = await getDocs(q);

    if (snap.empty) {
      el.innerHTML = `<div style="color:var(--muted);font-size:13px;">${fromVal} ~ ${toVal} 기간에 제출된 성취도가 없습니다.</div>`;
      return;
    }

    let docs = [];
    snap.forEach(d => docs.push(d.data()));

    // 선생님별 그룹핑
    const byTeacher = {};
    docs.forEach(data => {
      const tname = data.teacherName || '(이름없음)';
      const key = data.teacherUid || tname;
      if (!byTeacher[key]) byTeacher[key] = { uid: data.teacherUid || '', name: tname, list: [] };
      byTeacher[key].list.push(data);
    });

    const groups = Object.values(byTeacher).sort((a,b) => a.name.localeCompare(b.name,'ko'));
    const attr = (t) => String(t ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

    let html = '';
    groups.forEach(g => {
      const tname = g.name;
      const list = g.list.sort((a,b) => (a.studentName||'').localeCompare(b.studentName||'','ko'));
      html += `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="font-weight:700;color:var(--purple, #5B3FA6);font-size:14px;">
              👤 ${tname} 선생님 <span style="color:var(--muted);font-weight:400;font-size:12px;">(${list.length}건)</span>
            </div>
            <button data-uid="${attr(g.uid)}" data-name="${attr(tname)}" onclick="downloadWeeklyTeacherExcel(this.dataset.uid, this.dataset.name)"
              style="font-size:12px;color:var(--purple, #5B3FA6);background:none;padding:6px 14px;border:1px solid var(--border-soft);border-radius:6px;white-space:nowrap;cursor:pointer;font-family:inherit;">
              ⬇ ${tname} T 엑셀
            </button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${list.map(data => {
              const rl = data.ratingsLabel || {};
              return `
                <div class="student-item" style="flex-direction:column;align-items:flex-start;gap:6px;">
                  <div style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:6px;">
                    <b>${data.studentName||''} (${data.studentGrade||''})</b>
                    <span style="font-size:12px;color:var(--muted);">${data.weekLabel||''} · ${data.topic || ''}</span>
                  </div>
                  <div style="font-size:12px;color:var(--muted);">
                    과제 ${rl.homework||'-'} &nbsp;·&nbsp; 수업태도 ${rl.attitude||'-'} &nbsp;·&nbsp; 클리닉 ${rl.clinic||'-'}
                  </div>
                  ${data.memo ? `<div style="font-size:12px;">📌 ${data.memo}</div>` : ''}
                </div>`;
            }).join('')}
          </div>
        </div>`;
    });

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${e.message}</div>`;
  }
};

window.initProgressTab = () => {
  const sel = document.getElementById('progressTeacher');
  if (sel && sel.options.length <= 1) {
    teachingTeachers().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name + ' T';
      sel.appendChild(opt);
    });
  }
  // 기본값: 이번 주 월~일
  if (!document.getElementById('progressDateFrom').value) {
    const today = new Date();
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toISOString().slice(0,10);
    document.getElementById('progressDateFrom').value = fmt(mon);
    document.getElementById('progressDateTo').value   = fmt(sun);
  }
};

window.initMonthlyTab = () => {
  const wrap = document.getElementById('monthlyTeacherBtns');
  if (!wrap) return;
  // 이미 모든 선생님 버튼이 렌더링된 경우 중복 방지
  if (wrap.children.length >= teachingTeachers().length + 1) return;
  wrap.innerHTML = '<button class="monthly-filter-btn active" data-uid="" onclick="selectMonthlyTeacher(this)">전체</button>';
  teachingTeachers().forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'monthly-filter-btn';
    btn.dataset.uid = t.id;
    btn.textContent = t.name + ' T';
    btn.onclick = function() { selectMonthlyTeacher(this); };
    wrap.appendChild(btn);
  });

  // 연도 드롭다운: 현재 연도 기준 ±2년 채우기
  const yearSel = document.getElementById('monthlyYear');
  if (yearSel && yearSel.options.length === 1) {
    const curYear = new Date().getFullYear();
    for (let y = curYear + 1; y >= curYear - 2; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = y + '년';
      yearSel.appendChild(opt);
    }
    // 현재 연도 기본 선택
    yearSel.value = String(curYear);
  }
};

// 선생님 필터 버튼 선택
window.selectMonthlyTeacher = (btn) => {
  document.querySelectorAll('.monthly-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  monthlySelectedUid = btn.dataset.uid || '';
  renderMonthlyResult();
};

// Firestore 조회
window.loadMonthlyAdmin = async () => {
  const year  = document.getElementById('monthlyYear').value;   // 'YYYY' or ''
  const month = document.getElementById('monthlyMonth').value;  // 'MM' or ''
  const msgEl = document.getElementById('monthlyAdminMsg');
  const resultEl = document.getElementById('monthlyAdminResult');
  const zipBtn = document.getElementById('monthlyZipBtn');

  resultEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">불러오는 중...</div>';
  zipBtn.style.display = 'none';
  monthlyAdminCache = [];

  try {
    const q = query(collection(db, 'monthlyReports'), orderBy('submittedAt', 'desc'));
    const snap = await getDocs(q);
    snap.forEach(d => monthlyAdminCache.push({ id: d.id, ...d.data() }));

    // 기간 필터 (클라이언트) — d.month 형식: 'YYYY-MM'
    if (year || month) {
      monthlyAdminCache = monthlyAdminCache.filter(d => {
        const m = d.month || '';             // e.g. '2025-06'
        const [docYear, docMonth] = m.split('-');
        if (year  && docYear  !== year)  return false;
        if (month && docMonth !== month) return false;
        return true;
      });
    }

    if (!monthlyAdminCache.length) {
      resultEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">해당 기간에 제출된 보고서가 없습니다.</div>';
      return;
    }

    renderMonthlyResult();
  } catch(e) {
    resultEl.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${e.message}</div>`;
  }
};

// 결과 렌더링 — 선생님별 섹션으로 구분
function renderMonthlyResult() {
  const resultEl = document.getElementById('monthlyAdminResult');
  const zipBtn   = document.getElementById('monthlyZipBtn');
  if (!monthlyAdminCache.length) return;

  // 선생님 필터 적용
  let filtered = monthlySelectedUid
    ? monthlyAdminCache.filter(d => d.teacherUid === monthlySelectedUid)
    : monthlyAdminCache;

  if (!filtered.length) {
    resultEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">해당 선생님의 보고서가 없습니다.</div>';
    zipBtn.style.display = 'none';
    return;
  }

  // 선생님별 그룹핑
  const grouped = {};
  filtered.forEach(d => {
    const key = d.teacherUid || 'unknown';
    if (!grouped[key]) grouped[key] = { name: d.teacherName || '이름없음', docs: [] };
    grouped[key].docs.push(d);
  });

  let html = '';
  Object.values(grouped).forEach(group => {
    const teacherName = group.name;
    const count = group.docs.length;
    const safeTeacherName = teacherName.replace(/'/g, "\\'");

    const rows = group.docs.map(d => {
      const size = d.fileSize ? `${(d.fileSize/1024/1024).toFixed(1)}MB` : '';
      const safeURL      = (d.downloadURL||'').replace(/'/g, "\\'");
      const safeMonth    = (d.month||'').replace(/'/g, "\\'");
      const safeFileName = (d.fileName||'report.pdf').replace(/'/g, "\\'");
      return `
        <div class="monthly-report-row">
          <div class="monthly-report-info">
            <div class="month-label">📅 ${d.month || '-'}</div>
            <div class="file-label">📄 ${d.fileName||''} ${size ? `· ${size}` : ''} ${d.memo ? `· ${d.memo}` : ''}</div>
          </div>
          <button onclick="downloadPDF('${safeURL}','${safeTeacherName}','${safeMonth}','${safeFileName}')"
            style="flex-shrink:0;font-size:12px;color:var(--purple, #5B3FA6);background:none;padding:6px 14px;border:1px solid rgba(245,197,24,0.4);border-radius:6px;white-space:nowrap;cursor:pointer;font-family:inherit;">
            ⬇ 다운로드
          </button>
        </div>`;
    }).join('');

    // ZIP 버튼 (선생님별)
    const teacherUidKey = group.docs[0]?.teacherUid || '';
    html += `
      <div class="card monthly-teacher-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <div>
            <span style="font-size:15px;font-weight:700;color:var(--purple, #5B3FA6);">👤 ${teacherName} T</span>
            <span style="font-size:12px;color:var(--muted);margin-left:10px;">${count}개 보고서</span>
          </div>
          <button onclick="downloadTeacherZip('${teacherUidKey}','${safeTeacherName}', this)"
            style="font-size:12px;color:var(--purple, #5B3FA6);background:none;padding:6px 14px;border:1px solid var(--border-soft);border-radius:6px;cursor:pointer;font-family:inherit;white-space:nowrap;">
            📦 ${teacherName} T 것만 받기 (ZIP)
          </button>
        </div>
        <div class="monthly-teacher-body">${rows}</div>
      </div>`;
  });

  resultEl.innerHTML = html;
  zipBtn.style.display = 'inline-flex';
}

// 조회한 기간을 파일 이름에 붙임 (예: _2026-10, _2026년, 전체면 빈칸)
function monthlyPeriodLabel() {
  const y = document.getElementById('monthlyYear')?.value || '';
  const m = document.getElementById('monthlyMonth')?.value || '';
  if (y && m) return `_${y}-${m}`;
  if (y) return `_${y}년`;
  if (m) return `_${Number(m)}월`;
  return '';
}

// 선생님별 ZIP 다운로드
window.downloadTeacherZip = async (teacherUid, teacherName, btn) => {
  const docs = monthlyAdminCache.filter(d => d.teacherUid === teacherUid);
  if (!docs.length) { alert('다운로드할 파일이 없습니다.'); return; }
  const oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '압축 중...'; }

  const zip = new JSZip();
  const folder = zip.folder(teacherName + '_월말보고서');
  let failCount = 0;

  for (const d of docs) {
    try {
      const blob = await fetchBlob(d.downloadURL);
      folder.file(`${d.month}_${d.fileName||'report.pdf'}`, blob);
    } catch(e) {
      failCount++;
      console.warn('다운로드 실패:', d.fileName);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `${safeFileName(teacherName)}_월말보고서${monthlyPeriodLabel()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  if (btn) { btn.disabled = false; btn.textContent = oldLabel; }

  if (failCount) alert(`${failCount}개 파일 다운로드 실패. 나머지는 정상적으로 저장되었습니다.`);
};

// 전체 ZIP (현재 필터 기준)
window.downloadMonthlyZip = async () => {
  const btn = document.getElementById('monthlyZipBtn');
  const filtered = monthlySelectedUid
    ? monthlyAdminCache.filter(d => d.teacherUid === monthlySelectedUid)
    : monthlyAdminCache;

  if (!filtered.length) return;
  btn.disabled = true; btn.textContent = '압축 중...';

  const zip = new JSZip();
  let failCount = 0;
  // 선생님별 폴더로 구분
  for (const d of filtered) {
    const folderName = (d.teacherName || '미확인') + '_월말보고서';
    try {
      const blob = await fetchBlob(d.downloadURL);
      zip.folder(folderName).file(`${d.month}_${d.fileName||'report.pdf'}`, blob);
    } catch(e) {
      failCount++;
      console.warn('다운로드 실패:', d.fileName);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `월말보고서_선생님별${monthlyPeriodLabel() || '_전체'}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  btn.disabled = false; btn.textContent = '📦 전체 받기 (선생님별 폴더 ZIP)';
  if (failCount) alert(`${failCount}개 파일 다운로드 실패. 나머지는 정상적으로 저장되었습니다.`);
};

