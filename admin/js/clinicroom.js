'use strict';
/* ═══════════════════════════════════════════════════════════
   클리닉실 (선생님 시간표 기반)
   (admin.html에서 분리 — 원본 5552~5891줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 🏥 클리닉실 (선생님 시간표 기반 자동 계산)
// ══════════════════════════════════════════
const TT_TEACHERS = ['송우찬 원장T','송문찬 원장T','조현주 부원장T','김영진T','신민훈T','장미현T','공민정T'];
const TT_GRADE_OPTIONS = ['초등','중1','중2','중3','고1','고2','고3','N수'];
let timetablesCache = [];

function ttAddBlockRow(vals) {
  const wrap = document.getElementById('tt-blocks');
  const row = document.createElement('div');
  row.className = 'form-row tt-block-row';
  row.style.gridTemplateColumns = '1fr 1fr 1fr 1fr 1fr auto';
  row.style.alignItems = 'end';
  row.innerHTML = `
    <div class="form-group"><label>학년</label>
      <select class="tt-b-grade">${TT_GRADE_OPTIONS.map(g=>`<option ${vals&&vals.grade===g?'selected':''}>${g}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>시작</label><input type="time" class="tt-b-start" value="${vals?.start||''}"></div>
    <div class="form-group"><label>종료</label><input type="time" class="tt-b-end" value="${vals?.end||''}"></div>
    <div class="form-group"><label>구분</label>
      <select class="tt-b-type"><option value="class" ${vals?.type==='class'?'selected':''}>수업 (선)</option><option value="clinic" ${vals?.type==='clinic'?'selected':''}>클리닉 (클)</option></select>
    </div>
    <div class="form-group"><label>특정요일</label>
      <select class="tt-b-day"><option value="" ${!vals?.day?'selected':''}>평일 전체</option><option value="토" ${vals?.day==='토'?'selected':''}>토요일만</option></select>
    </div>
    <button class="btn btn-danger btn-sm" onclick="this.closest('.tt-block-row').remove()">삭제</button>`;
  wrap.appendChild(row);
}

function ttRenderTeacherChecks() {
  const wrap = document.getElementById('tt-teacher-checks');
  wrap.innerHTML = TT_TEACHERS.map(t => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--off-white);cursor:pointer;">
      <input type="checkbox" class="tt-teacher-check" value="${t}" style="accent-color:var(--gold);width:15px;height:15px;"> ${t}
    </label>`).join('');
}

window.initClinicRoomTab = async () => {
  ttRenderTeacherChecks();
  if (!document.querySelectorAll('.tt-block-row').length) ttAddBlockRow();
  setupTtExcelDrop();
  await loadTimetables();
  renderClinicPreview();
};

let ttExcelData = [];
let ttExcelDropInited = false;

function setupTtExcelDrop() {
  if (ttExcelDropInited) return;
  ttExcelDropInited = true;
  const input = document.getElementById('ttExcelInput');
  input.addEventListener('change', e => parseTtExcel(e.target.files[0]));
  const drop = document.getElementById('ttExcelDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); parseTtExcel(e.dataTransfer.files[0]); });
}

function ttExcelDate(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return s;
}
function ttExcelTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const totalMin = Math.round(v * 24 * 60);
    return String(Math.floor(totalMin/60)).padStart(2,'0') + ':' + String(totalMin%60).padStart(2,'0');
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return m[1].padStart(2,'0') + ':' + m[2];
  return s;
}

function parseTtExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1});
    const raw = rows.slice(1).filter(r => r[0]).map(r => ({
      teacherName: String(r[0]||'').trim(),
      dayGroup:    String(r[1]||'').trim(),
      typeLabel:   String(r[2]||'').trim(),
      validFrom:   ttExcelDate(r[3]),
      validTo:     ttExcelDate(r[4]),
      grade:       String(r[5]||'').trim(),
      start:       ttExcelTime(r[6]),
      end:         ttExcelTime(r[7]),
      typeText:    String(r[8]||'').trim(),
      day:         String(r[9]||'').trim(),
    }));
    // 선생님+요일그룹+시간표종류+기간 기준으로 묶기
    const groups = {};
    raw.forEach(r => {
      const scheduleType = r.typeLabel === '방학특강' ? 'vacation' : 'regular';
      const key = [r.teacherName, r.dayGroup, scheduleType, r.validFrom, r.validTo].join('|');
      if (!groups[key]) groups[key] = { teacherName:r.teacherName, dayGroup:r.dayGroup, scheduleType, validFrom:r.validFrom, validTo:r.validTo, blocks:[] };
      groups[key].blocks.push({ grade:r.grade, start:r.start, end:r.end, type: r.typeText.includes('클리닉') ? 'clinic' : 'class', day: r.day || '' });
    });
    ttExcelData = Object.values(groups);
    document.getElementById('ttPreviewCount').textContent = `${ttExcelData.length}개 시간표 (${raw.length}개 블록)`;
    document.getElementById('ttPreviewTable').innerHTML = `
      <tr><th>선생님</th><th>요일그룹</th><th>종류</th><th>기간</th><th>블록 수</th></tr>
      ${ttExcelData.map(g => `<tr>
        <td>${g.teacherName}</td><td>${g.dayGroup}</td>
        <td>${g.scheduleType==='vacation'?'방학특강':'정규'}</td>
        <td>${g.scheduleType==='vacation' ? (g.validFrom+' ~ '+g.validTo) : '-'}</td>
        <td>${g.blocks.length}</td>
      </tr>`).join('')}`;
    document.getElementById('ttExcelPreview').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
}

window.uploadTtExcel = async () => {
  if (!ttExcelData.length) return;
  for (const g of ttExcelData) {
    const id = `${g.teacherName}_${g.dayGroup}_${g.scheduleType}`.replace(/[^\w가-힣]/g, '_');
    await setDoc(doc(db, 'timetables', id), {
      teacherName: g.teacherName, dayGroup: g.dayGroup, scheduleType: g.scheduleType,
      validFrom: g.scheduleType === 'vacation' ? g.validFrom : null,
      validTo: g.scheduleType === 'vacation' ? g.validTo : null,
      blocks: g.blocks, updatedAt: new Date().toISOString()
    });
  }
  showMsg('ttExcelMsg', `${ttExcelData.length}개 시간표 등록 완료!`, 'success');
  await loadTimetables();
  renderClinicPreview();
};

window.downloadTtTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['선생님','요일그룹','시간표종류','시작일','종료일','학년','시작시간','종료시간','구분','특정요일(선택)'],
    ['신민훈T','월수금','방학특강','2026-07-20','2026-08-16','초등','14:00','15:30','수업',''],
    ['신민훈T','월수금','방학특강','2026-07-20','2026-08-16','초등','15:30','16:30','클리닉',''],
    ['김영진T','화목토','방학특강','2026-07-20','2026-08-16','중1','17:00','19:30','수업',''],
    ['김영진T','화목토','방학특강','2026-07-20','2026-08-16','중1','15:00','17:00','수업','토'],
  ]);
  ws['!cols'] = [{wch:10},{wch:10},{wch:10},{wch:12},{wch:12},{wch:8},{wch:9},{wch:9},{wch:8},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '시간표');
  XLSX.writeFile(wb, '선생님시간표_양식.xlsx');
};

async function loadTimetables() {
  const snap = await getDocs(collection(db, 'timetables'));
  timetablesCache = [];
  snap.forEach(d => timetablesCache.push({ id: d.id, ...d.data() }));
  renderTimetableList();
}

function renderTimetableList() {
  const el = document.getElementById('ttList');
  if (!timetablesCache.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 시간표가 없습니다.</div>'; return; }
  el.innerHTML = timetablesCache.map(t => `
    <div class="student-item" style="align-items:flex-start;flex-direction:column;gap:6px;">
      <div style="display:flex;gap:10px;align-items:center;width:100%;flex-wrap:wrap;">
        <div class="student-name">${t.teacherName}</div>
        <span class="preview-badge">${t.dayGroup}</span>
        <span class="preview-badge" style="${t.scheduleType==='vacation'?'background:rgba(255,150,80,0.15);color:#D97B1A;':''}">${t.scheduleType==='vacation' ? `방학특강 (${t.validFrom}~${t.validTo})` : '정규반'}</span>
        <button class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="deleteTimetable('${t.id}')">삭제</button>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.8;">
        ${(t.blocks||[]).map(b => `${b.grade}${b.day?`(${b.day})`:''} ${b.start}~${b.end} <span style="color:${b.type==='clinic'?'var(--gold)':'#2F7FD6'};">${b.type==='clinic'?'클리닉':'수업'}</span>`).join(' &nbsp;·&nbsp; ')}
      </div>
    </div>`).join('');
}

window.saveTimetable = async () => {
  const teachers = [...document.querySelectorAll('.tt-teacher-check:checked')].map(c => c.value);
  const dayGroup = document.getElementById('tt-daygroup').value;
  const scheduleType = document.getElementById('tt-type').value;
  const validFrom = document.getElementById('tt-from').value;
  const validTo = document.getElementById('tt-to').value;
  const blocks = [...document.querySelectorAll('.tt-block-row')].map(row => ({
    grade: row.querySelector('.tt-b-grade').value,
    start: row.querySelector('.tt-b-start').value,
    end: row.querySelector('.tt-b-end').value,
    type: row.querySelector('.tt-b-type').value,
    day: row.querySelector('.tt-b-day').value
  }));

  if (!teachers.length) { showMsg('ttMsg', '선생님을 한 명 이상 선택해주세요.', 'error'); return; }
  if (scheduleType === 'vacation' && (!validFrom || !validTo)) { showMsg('ttMsg', '방학특강은 시작일과 종료일을 입력해주세요.', 'error'); return; }
  if (!blocks.length || blocks.some(b => !b.start || !b.end)) { showMsg('ttMsg', '시간 블록의 시작/종료 시간을 모두 입력해주세요.', 'error'); return; }

  for (const teacherName of teachers) {
    const id = `${teacherName}_${dayGroup}_${scheduleType}`.replace(/[^\w가-힣]/g, '_');
    await setDoc(doc(db, 'timetables', id), {
      teacherName, dayGroup, scheduleType,
      validFrom: scheduleType === 'vacation' ? validFrom : null,
      validTo: scheduleType === 'vacation' ? validTo : null,
      blocks, updatedAt: new Date().toISOString()
    });
  }
  showMsg('ttMsg', `${teachers.join(', ')} 시간표 저장 완료!`, 'success');
  await loadTimetables();
  renderClinicPreview();
};

window.deleteTimetable = async (id) => {
  if (!confirm('이 시간표를 삭제하시겠습니까?')) return;
  await deleteDoc(doc(db, 'timetables', id));
  await loadTimetables();
  renderClinicPreview();
};

// 요일그룹 판별
function ttNormTeacher(name) { return (name || '').toString().trim().replace(/T$/,''); }
function ttDaysToGroup(days) {
  const s = new Set(days || []);
  const eq = arr => arr.length === s.size && arr.every(d => s.has(d));
  if (eq(['월','수','금'])) return '월수금';
  if (eq(['화','목'])) return '화목';
  if (eq(['화','목','토'])) return '화목토';
  return null;
}
function ttGroupActiveToday(group, weekday) {
  // weekday: 0=일 ... 6=토
  // '화목'은 등록된 학생 요일이 화목뿐이라도, 방학특강 등으로 토요일 특강 블록(특정요일:'토')이 붙을 수 있어 토요일도 활성 대상에 포함
  if (group === '월수금') return [1,3,5].includes(weekday);
  if (group === '화목') return [2,4,6].includes(weekday);
  if (group === '화목토') return [2,4,6].includes(weekday);
  return false;
}
function ttGradeMatches(studentGrade, blockGrade) {
  if (blockGrade === '초등') return (studentGrade || '').startsWith('초');
  return studentGrade === blockGrade;
}
// 블록에 특정 요일(예:'토')이 지정돼 있으면 그 요일에만, 없으면 그룹의 평일(월~금)에만 적용
const TT_DAY_NUM = {'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6};
function ttBlockActiveToday(block, weekday) {
  if (block.day) return TT_DAY_NUM[block.day] === weekday;
  return weekday !== 6 && weekday !== 0; // 특정 요일 지정 없으면 평일에만 (토/일 제외)
}

// 지금 이 순간 클리닉인 학생 목록 계산 (admin 미리보기 + ta.html 공용 로직)
function computeCurrentClinicStudents(students, timetables) {
  const now = new Date();
  const weekday = now.getDay();
  const todayStr = now.toISOString().slice(0,10);
  const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  // 선생님+요일그룹별로 오늘 적용할 시간표 하나만 선택 (방학특강 우선)
  const byKey = {};
  timetables.forEach(t => {
    if (!ttGroupActiveToday(t.dayGroup, weekday)) return;
    const key = t.teacherName + '|' + t.dayGroup;
    if (t.scheduleType === 'vacation') {
      if (t.validFrom && t.validTo && todayStr >= t.validFrom && todayStr <= t.validTo) {
        byKey[key] = t; // 방학특강이 활성이면 무조건 우선
      }
    } else {
      if (!byKey[key] || byKey[key].scheduleType !== 'vacation') byKey[key] = t;
    }
  });

  const active = Object.values(byKey);
  const results = [];
  active.forEach(t => {
    (t.blocks || []).forEach(b => {
      if (b.type !== 'clinic') return;
      if (!ttBlockActiveToday(b, weekday)) return;
      if (!(hhmm >= b.start && hhmm < b.end)) return;
      students.forEach(s => {
        if (ttNormTeacher(s.teacherName) !== ttNormTeacher(t.teacherName)) return;
        if (ttDaysToGroup(s.days) !== t.dayGroup) return;
        if (!ttGradeMatches(s.grade, b.grade)) return;
        results.push({ name: s.name, grade: s.grade, classGroup: s.classGroup, teacherName: s.teacherName, endTime: b.end });
      });
    });
  });
  return results;
}

window.renderClinicPreview = () => {
  const list = computeCurrentClinicStudents(studentsCache, timetablesCache);
  document.getElementById('clinicPreviewCount').textContent = list.length;
  const el = document.getElementById('clinicPreviewList');
  if (!list.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;">지금 이 시간에 클리닉인 학생이 없습니다.</div>'; return; }
  el.innerHTML = list.map(r => `
    <div class="student-item">
      <div class="student-name">${r.name}</div>
      <span class="student-meta">${r.grade}</span>
      <span class="student-meta">${r.classGroup||''}</span>
      <span class="student-meta">${r.teacherName}</span>
      <span class="preview-badge">~${r.endTime}</span>
    </div>`).join('');
};

window.runClinicDiagnosis = () => {
  const now = new Date();
  const weekday = now.getDay();
  const weekdayNames = ['일','월','화','수','목','금','토'];
  const todayStr = now.toISOString().slice(0,10);
  const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const out = [];

  out.push(`<div>📅 오늘: ${todayStr} (${weekdayNames[weekday]}요일) · 현재시각: ${hhmm}</div>`);
  out.push(`<div style="margin-top:6px;">📋 등록된 시간표 총 ${timetablesCache.length}개, 학생 총 ${studentsCache.length}명</div><hr style="border-color:var(--border-soft);margin:10px 0;">`);

  if (!timetablesCache.length) {
    out.push(`<div style="color:#D64545;">⚠️ 등록된 시간표가 하나도 없습니다. 엑셀 업로드나 저장이 실제로 반영됐는지 확인해주세요 (새로고침 후 '등록된 시간표' 목록에 나타나야 합니다).</div>`);
    document.getElementById('ttDiag').innerHTML = out.join('');
    return;
  }

  timetablesCache.forEach(t => {
    const activeToday = ttGroupActiveToday(t.dayGroup, weekday);
    const inRange = t.scheduleType !== 'vacation' || (t.validFrom && t.validTo && todayStr >= t.validFrom && todayStr <= t.validTo);
    const matchedStudents = studentsCache.filter(s => ttNormTeacher(s.teacherName) === ttNormTeacher(t.teacherName));
    const rightDayGroupStudents = matchedStudents.filter(s => ttDaysToGroup(s.days) === t.dayGroup);

    out.push(`<div style="padding:10px 0;border-bottom:1px solid var(--border-soft);">
      <b style="color:var(--purple, #5B3FA6);">${t.teacherName}</b> · ${t.dayGroup} · ${t.scheduleType==='vacation'?`방학특강(${t.validFrom}~${t.validTo})`:'정규'}
      &nbsp; ${activeToday ? '✅오늘요일해당' : '❌오늘요일아님'} &nbsp; ${inRange ? '✅기간내' : '❌기간아님'}<br>
      <span style="color:var(--muted);">→ '담당선생님'이 정확히 "${t.teacherName}"으로 등록된 학생: <b style="color:${matchedStudents.length?'#2E9E5B':'#D64545'};">${matchedStudents.length}명</b></span><br>
      <span style="color:var(--muted);">→ 그 중 등원요일이 ${t.dayGroup} 패턴(요일 배열이 정확히 일치)인 학생: <b style="color:${rightDayGroupStudents.length?'#2E9E5B':'#D64545'};">${rightDayGroupStudents.length}명</b>
      ${matchedStudents.length && !rightDayGroupStudents.length ? ` <span style="color:#D97B1A;">← 등원요일 값이 안 맞는 것 같아요. (예: ${JSON.stringify(matchedStudents[0].days)})</span>` : ''}</span>
    </div>`);
  });

  const allTeacherNames = [...new Set(timetablesCache.map(t => t.teacherName))];
  const studentTeacherNames = [...new Set(studentsCache.map(s => s.teacherName).filter(Boolean))];
  const unmatched = allTeacherNames.filter(n => !studentTeacherNames.some(sn => ttNormTeacher(sn) === ttNormTeacher(n)));
  if (unmatched.length) {
    out.push(`<div style="margin-top:10px;color:#D97B1A;">⚠️ 시간표에는 있지만 학생 '담당선생님'에는 정확히 일치하는 이름이 없는 선생님: ${unmatched.join(', ')}<br>
    (학생 등록정보의 실제 담당선생님 값 목록: ${studentTeacherNames.join(', ') || '없음'})</div>`);
  }

  document.getElementById('ttDiag').innerHTML = out.join('');
};

