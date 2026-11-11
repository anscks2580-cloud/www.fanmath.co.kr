'use strict';
/* ═══════════════════════════════════════════════════════════
   관리부 마감 (일일업무보고서 이미지)
   (admin.html에서 분리 — 원본 6819~7131줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 관리부 마감 (일일업무보고서 이미지 생성)
// ══════════════════════════════════════════

let drInited = false;
window.initDailyReportTab = function() {
  const n = new Date();
  const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  if (!document.getElementById('dr-date').value) {
    document.getElementById('dr-date').value = today;
  }
  if (!drInited) {
    drInited = true;
    // 관·날짜를 바꾸면 그 날짜 요일의 수업반을 자동 선택
    document.getElementById('dr-branch').addEventListener('change', drAutoSelectByDate);
    document.getElementById('dr-date').addEventListener('change', drAutoSelectByDate);
    // 관·날짜를 바꾸면 출결 체크의 결석자도 자동으로 다시 채움
    document.getElementById('dr-branch').addEventListener('change', () => drFillAbsent(false));
    document.getElementById('dr-date').addEventListener('change', () => drFillAbsent(false));
    // 손으로 고치면 그 뒤로는 자동으로 덮어쓰지 않음 (「출결에서 불러오기」 버튼으로만)
    document.getElementById('dr-absent').addEventListener('input', () => { drAbsentAuto = null; });
    // 숙제 표: 관·날짜 바꾸면 다시 받음
    document.getElementById('dr-branch').addEventListener('change', () => drFillHomework());
    document.getElementById('dr-date').addEventListener('change', () => drFillHomework());
  }
  drFillAbsent(false);
  drFillHomework();
  // 이미 적어 둔 수업반이 있으면(불러오기 등) 그대로 두고 체크만 맞춤, 비어 있으면 자동 선택
  const apply = () => {
    if (document.getElementById('dr-classes').value.trim()) drSyncFromText();
    else drAutoSelectByDate();
  };
  // 학생 목록이 아직 안 불러와졌으면 먼저 불러온 뒤 반 목록 계산
  if ((typeof studentsCache === 'undefined' || !studentsCache.length) && typeof loadStudents === 'function') {
    loadStudents().then(apply).catch(apply);
  } else apply();
};

// ── 수업반 데이터 ──
const DR_CLASSES = {
  평촌관: {
    월: ['초6-2A','중1-2A','중1-7A','중2-2A','중2-7A','중3-2A','중3-7A'],
    화: ['초5-2B','초6-7B','중1-7B','중2-2B','중3-2B','중3-3B','중3-7B','고1-1B','고1-3B'],
    수: ['초6-2A','중1-2A','중1-7A','중2-2A','중2-7A','중3-2A','중3-7A','고1-3A','고2-3A'],
    목: ['초5-2B','초6-7B','중1-7B','중2-2B','중3-2B','중3-3B','중3-7B','고2-3B'],
    금: ['초6-2A','초6-7B','중1-2A','중1-7A','중2-2A','중2-7A','중3-2A','중3-7A','고1-3A','고2-3A'],
    토: ['중3-3B','고1-1B','고1-3B','고2-3B','고3-3B'],
  },
  산본관: {
    월: ['(초6)3-A','(중2)2-A','(중2)3-A','(중2)5-A','(중3)2-A','(중3)3-A','(고1)1-B','(고1)2-A','(고2)1-A','(고3)1-A'],
    화: ['(초5)2-A','(중2)3-B','(중3)2-B','(중3)3-B','(고1)1-A','(고1)2-B','(고2)1-B'],
    수: ['(중2)2-A','(중2)3-A','(중2)5-A','(중3)2-A','(중3)3-A','(고1)1-B','(고1)2-A','(고2)1-A'],
    목: ['(초5)2-A','(중2)3-B','(중3)2-B','(중3)3-B','(고1)1-A','(고1)2-B','(고2)1-B'],
    금: ['(초5)2-A','(초6)3-A','(중2)2-A','(중2)3-A','(중2)5-A','(중3)2-A','(중3)3-A','(고1)1-B','(고1)2-A','(고2)1-A','(고3)1-A'],
  },
};

const DAY_ORDER = ['월','화','수','목','금','토'];

// ── 실제 수업반 계산 ──
// 학생 출결과 같은 기준: 학생별 등원 요일(days) + 반(classGroup)으로 요일별 반 목록을 만듦.
// 학생 데이터가 아직 없을 때만 위의 고정 표(DR_CLASSES)를 씀.
const DR_GRADE_ORDER = ['초4','초5','초6','중1','중2','중3','고1','고2','고3','N수'];
function drClassMap(branch) {
  const list = (typeof studentsCache !== 'undefined' && Array.isArray(studentsCache)) ? studentsCache : [];
  if (!list.length) return DR_CLASSES[branch] || {};
  const map = {};    // 요일 → { 반이름 → 가장 낮은 학년 순번 }
  list.forEach(s => {
    if (s.branch !== branch) return;
    const cls = String(s.classGroup || '').trim();
    if (!cls) return;                          // 반 미배정은 제외
    const rank = (i => i === -1 ? DR_GRADE_ORDER.length : i)(DR_GRADE_ORDER.indexOf(s.grade));
    (s.days || []).forEach(day => {
      if (!DAY_ORDER.includes(day)) return;
      map[day] = map[day] || {};
      map[day][cls] = Math.min(map[day][cls] ?? 99, rank);
    });
  });
  const out = {};
  Object.keys(map).forEach(day => {
    const m = map[day];
    out[day] = Object.keys(m).sort((a, b) => (m[a] - m[b]) || a.localeCompare(b, 'ko'));
  });
  return out;
}
let drActiveDayTab = '';        // 현재 선택된 요일 탭
let drChecked = new Set();      // 선택된 반 (요일_반명 키)

// 날짜의 요일 ('월'~'일')
function drDayOfDate() {
  const v = document.getElementById('dr-date').value;
  if (!v) return '';
  return ['일','월','화','수','목','금','토'][new Date(v + 'T00:00:00').getDay()];
}

// 요일 탭만 그림 (선택 상태는 유지)
function renderDrDayTabs() {
  const branch = document.getElementById('dr-branch').value;
  const days = Object.keys(drClassMap(branch) || {}).sort((a,b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const tabWrap = document.getElementById('drClassDayTabs');
  tabWrap.innerHTML = days.map(d => `
    <button class="btn btn-sm btn-secondary" id="drTab-${d}"
      onclick="drSwitchDay('${d}')"
      style="border-radius:20px;">${d}요일</button>
  `).join('');
  const want = days.includes(drActiveDayTab) ? drActiveDayTab : (days.includes(drDayOfDate()) ? drDayOfDate() : days[0]);
  if (want) drSwitchDay(want);
}

// 날짜 요일에 맞춰 그 요일 수업반 전체를 자동 선택 (일요일 등 수업 없는 날은 비움)
window.drAutoSelectByDate = function() {
  const branch = document.getElementById('dr-branch').value;
  const day = drDayOfDate();
  drChecked.clear();
  (drClassMap(branch)?.[day] || []).forEach(cls => drChecked.add(day + '_' + cls));
  drActiveDayTab = drClassMap(branch)?.[day] ? day : '';
  renderDrDayTabs();
  updateDrClassInput();
};

// 적혀 있는 수업반 글자 → 날짜 요일 체크박스에 반영 (불러오기 후)
window.drSyncFromText = function() {
  const branch = document.getElementById('dr-branch').value;
  const day = drDayOfDate();
  const tokens = new Set(document.getElementById('dr-classes').value.split(/\s*[\/,]\s*/).map(t => t.trim()).filter(Boolean));
  drChecked.clear();
  (drClassMap(branch)?.[day] || []).forEach(cls => { if (tokens.has(cls)) drChecked.add(day + '_' + cls); });
  drActiveDayTab = drClassMap(branch)?.[day] ? day : '';
  renderDrDayTabs();
};

// 예전 이름 유지 (다른 곳에서 부를 수 있음)
function renderDrClassAccordion() { drAutoSelectByDate(); }

window.drSwitchDay = function(day) {
  drActiveDayTab = day;
  // 탭 스타일
  document.querySelectorAll('[id^="drTab-"]').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    btn.style.borderRadius = '20px';
  });
  const activeBtn = document.getElementById('drTab-' + day);
  if (activeBtn) { activeBtn.classList.remove('btn-secondary'); activeBtn.classList.add('btn-primary'); }

  const branch = document.getElementById('dr-branch').value;
  const classes = drClassMap(branch)?.[day] || [];
  const panel = document.getElementById('drClassDayPanel');
  panel.innerHTML = classes.map(cls => {
    const key = day + '_' + cls;
    const checked = drChecked.has(key);
    return `
      <label style="display:flex;align-items:center;gap:6px;padding:5px 10px;
        background:${checked ? 'rgba(245,197,24,0.15)' : 'rgba(30,24,56,0.04)'};
        border:1px solid ${checked ? 'rgba(245,197,24,0.5)' : 'rgba(30,24,56,0.1)'};
        border-radius:6px;cursor:pointer;font-size:12px;color:var(--off-white);white-space:nowrap;
        transition:all 0.15s;" id="drLabel-${key}">
        <input type="checkbox" ${checked ? 'checked' : ''} value="${key}"
          onchange="drToggleClass(this,'${key}')"
          style="accent-color:var(--gold);width:13px;height:13px;">
        ${cls}
      </label>`;
  }).join('');
};

window.drToggleClass = function(cb, key) {
  if (cb.checked) drChecked.add(key); else drChecked.delete(key);
  // 라벨 스타일 갱신
  const lbl = document.getElementById('drLabel-' + key);
  if (lbl) {
    lbl.style.background = cb.checked ? 'rgba(245,197,24,0.15)' : 'rgba(30,24,56,0.04)';
    lbl.style.borderColor = cb.checked ? 'rgba(245,197,24,0.5)' : 'rgba(30,24,56,0.1)';
  }
  updateDrClassInput();
};

window.drSelectAllClasses = function() {
  const branch = document.getElementById('dr-branch').value;
  const day = drActiveDayTab;
  (drClassMap(branch)?.[day] || []).forEach(cls => drChecked.add(day + '_' + cls));
  drSwitchDay(day);
  updateDrClassInput();
};

window.drClearAllClasses = function() {
  const day = drActiveDayTab;
  [...drChecked].filter(k => k.startsWith(day + '_')).forEach(k => drChecked.delete(k));
  drSwitchDay(day);
  updateDrClassInput();
};

function updateDrClassInput() {
  // 요일 순서대로 정렬해서 input에 반영
  const branch = document.getElementById('dr-branch').value;
  const parts = DAY_ORDER.map(day => {
    const dayClasses = drClassMap(branch)?.[day] || [];
    const selected = dayClasses.filter(cls => drChecked.has(day + '_' + cls));
    if (!selected.length) return null;
    return selected.join(', ');
  }).filter(Boolean);
  document.getElementById('dr-classes').value = parts.join(' / ');
}

window.toggleDrClassAccordion = function() {
  const body = document.getElementById('drClassBody');
  const arrow = document.getElementById('drClassArrow');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) renderDrDayTabs();   // 펼칠 때 선택 상태는 그대로
};

function getDRValues() {
  const dateVal = document.getElementById('dr-date').value;
  let dateDisplay = dateVal || '';
  if (dateVal) {
    const d = new Date(dateVal);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dateDisplay = `${y}.${m}.${day}`;
  }
  return {
    branch:   document.getElementById('dr-branch').value || '평촌관',
    date:     dateDisplay,
    author:   document.getElementById('dr-author').value.trim() || '-',
    classes:  document.getElementById('dr-classes').value.trim() || '-',
    consult:  document.getElementById('dr-consult').value.trim() || '-',
    receipt:  document.getElementById('dr-receipt').value.trim() || '-',
    absent:   document.getElementById('dr-absent').value.trim() || '-',
    textbook: document.getElementById('dr-textbook').value.trim() || '-',
    note:     document.getElementById('dr-note').value.trim() || '-',
    phone:    document.getElementById('dr-phone').value.trim() || '-',
    nextday:  document.getElementById('dr-nextday').value.trim() || '-',
  };
}

function drawDailyReport(canvas, data) {
  const W = 860, H = 1120;
  // 숙제 입력 표(있으면)를 보고서 아래에 그대로 붙임
  const hw = drHwImage();
  const hwW = W - 80, hwH = hw ? Math.round(hw.height * hwW / hw.width) : 0;
  const totalH = H + (hw ? hwH + 40 : 0);
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, totalH);

  // 제목
  ctx.fillStyle = '#222';
  ctx.font = 'bold 34px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`< 일일  업무  보고  ${data.branch} >`, W / 2, 70);
  ctx.textAlign = 'left';

  const bdr = '#888';
  const headerBg = '#D4E6B5';

  const tl = 40;
  const tableW = W - 80;
  const labelW = 110; // 헤더 셀 너비 (고정)

  // ── 전체 높이를 꽉 채우도록 고정 행 높이 계산 ──
  const tableTop = 90;
  const footerH  = 50;   // 하단 안내 텍스트 영역
  const tableH   = H - tableTop - footerH;

  // 행 비율: row1(날짜)·row2(수업반)·row3(상담/현금)·row4(출결/교재)·row5(비고/전화)·row6(익일)
  // 비율: 1 : 0.8 : 2 : 3.5 : 2 : 1.2  → 합계 10.5
  const unit = tableH / 10.5;
  const row1H = unit * 1;
  const row2H = unit * 0.8;
  const row3H = unit * 2;
  const row4H = unit * 3.5;
  const row5H = unit * 2;
  const row6H = unit * 1.2;

  let y = tableTop;

  function rect(x, ry, w, h, fill) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, ry, w, h); }
    ctx.strokeStyle = bdr;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, ry, w, h);
  }

  // 텍스트를 셀 안에 여러 줄로 그리기 (클리핑 포함)
  function cellText(text, x, ry, w, h, opts = {}) {
    const { bold = false, size = 13, color = '#222', align = 'center' } = opts;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, ry + 2, w - 4, h - 4);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : ''}${size}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    ctx.textAlign = align;
    const px = align === 'center' ? x + w / 2 : x + 10;
    const lines = String(text).split('\n');
    const lineH = size + 5;
    const totalTH = lines.length * lineH;
    let startY = ry + (h - totalTH) / 2 + size;
    lines.forEach(ln => {
      ctx.fillText(ln, px, startY, w - 16);
      startY += lineH;
    });
    ctx.restore();
  }

  // === Row 1: 날짜 / 작성자 ===
  const col3 = tl + tableW / 2;
  rect(tl,        y, labelW,             row1H, headerBg);
  cellText('날 짜', tl, y, labelW, row1H, { bold: true, size: 13 });
  rect(tl + labelW, y, tableW / 2 - labelW, row1H);
  cellText(data.date, tl + labelW, y, tableW / 2 - labelW, row1H, { size: 13 });
  rect(col3,      y, labelW,             row1H, headerBg);
  cellText('작 성 자', col3, y, labelW, row1H, { bold: true, size: 13 });
  rect(col3 + labelW, y, tableW / 2 - labelW, row1H);
  cellText(data.author, col3 + labelW, y, tableW / 2 - labelW, row1H, { size: 13 });
  y += row1H;

  // === Row 2: 금일 수업 반 ===
  rect(tl, y, tableW, row2H, '#EAF4D8');
  cellText('금일 수업 반 : ' + data.classes, tl, y, tableW, row2H, { size: 12, align: 'center' });
  y += row2H;

  // === 2열 행 그리기 헬퍼 ===
  function twoColRow(label1, val1, label2, val2, rowH) {
    const halfW = tableW / 2;
    rect(tl,              y, labelW,          rowH, headerBg);
    cellText(label1, tl,  y, labelW,          rowH, { bold: true, size: 12 });
    rect(tl + labelW,     y, halfW - labelW,  rowH);
    cellText(val1, tl + labelW, y, halfW - labelW, rowH, { size: 12 });
    rect(tl + halfW,      y, labelW,          rowH, headerBg);
    cellText(label2, tl + halfW, y, labelW,   rowH, { bold: true, size: 12 });
    rect(tl + halfW + labelW, y, halfW - labelW, rowH);
    cellText(val2, tl + halfW + labelW, y, halfW - labelW, rowH, { size: 12 });
    y += rowH;
  }

  twoColRow('상담 및\n테스트',    data.consult,  '전화문의',             data.phone,    row3H);
  // 결석자가 많으면 칸에 다 들어가도록 글자 크기를 줄임
  const drFit = (t, h) => { const n = String(t).split('\n').length; return Math.max(8, Math.min(12, Math.floor((h - 10) / n) - 5)); };
  (function () {
    const halfW = tableW / 2;
    rect(tl, y, labelW, row4H, headerBg);
    cellText('출결 현황\n<결석자>', tl, y, labelW, row4H, { bold: true, size: 12 });
    rect(tl + labelW, y, halfW - labelW, row4H);
    cellText(data.absent, tl + labelW, y, halfW - labelW, row4H, { size: drFit(data.absent, row4H) });
    rect(tl + halfW, y, labelW, row4H, headerBg);
    cellText('교재\n입/출고', tl + halfW, y, labelW, row4H, { bold: true, size: 12 });
    rect(tl + halfW + labelW, y, halfW - labelW, row4H);
    cellText(data.textbook, tl + halfW + labelW, y, halfW - labelW, row4H, { size: drFit(data.textbook, row4H) });
    y += row4H;
  })();

  // 결석자 수 (출결 셀 하단 우측)
  const absentCount = (data.absent === '-') ? 0 : data.absent.split('\n').filter(l => l.trim() && !/^[^\s\-]+T$|^담당 미지정$/.test(l.trim())).length;
  if (absentCount > 0) {
    ctx.fillStyle = '#555';
    ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(absentCount), tl + tableW / 2 - 6, y - 6);
    ctx.textAlign = 'left';
  }

  twoColRow('비고\n(신규/ 퇴원)', data.note,    '현금영수증\n발행 현황', data.receipt,  row5H);

  // === Row 6: 익일 상담 및 신규원생 ===
  rect(tl,          y, labelW,             row6H, headerBg);
  cellText('익일 상담 및\n신규 원생', tl, y, labelW, row6H, { bold: true, size: 12 });
  rect(tl + labelW, y, tableW - labelW,    row6H);
  cellText(data.nextday, tl + labelW, y, tableW - labelW, row6H, { size: 12 });
  y += row6H;

  // === 하단 주간 업무 스케줄 안내 ===
  y += 12;
  ctx.fillStyle = '#444';
  ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('주간 업무 스케줄 : 월(교재정산, 주간성취도안내문자) 화(매쓰플랫체크, 반별진도현황)', W / 2, y);
  y += 17;
  ctx.fillText('수(시간표정산) 목(현금영수증정산) 금(아카사진체크,학년, 학교체크) 토(주간업무보고)', W / 2, y);
  ctx.textAlign = 'left';
  if (hw) ctx.drawImage(hw, tl, H + 20, hwW, hwH);
}

window.previewDailyReport = function() {
  const data = getDRValues();
  const canvas = document.getElementById('drCanvas');
  drawDailyReport(canvas, data);
  document.getElementById('drPreviewWrap').style.display = 'block';
};

window.downloadDailyReport = function() {
  const warnN = drAbsentItems.filter((it) => it.warn).length;
  if (warnN && !confirm(`⚠ 학부모가 앱으로 입력한 결석 ${warnN}건을 아직 관리부에서 확인하지 않았습니다.\n사실인지 확인한 뒤 저장하는 것을 권장합니다.\n\n그래도 이미지를 저장할까요?`)) return;
  const data = getDRValues();
  const canvas = document.getElementById('drCanvas');
  drawDailyReport(canvas, data);
  document.getElementById('drPreviewWrap').style.display = 'block';
  const link = document.createElement('a');
  const dateStr = data.date.replace(/\./g, '') || 'report';
  link.download = `일일업무보고_${data.branch}_${dateStr}_${data.author}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  if (typeof recordClosing === 'function') recordClosing('dr', canvas);   // 마감 기록 + 원장 페이지로 이미지 제출
};



// ══════════════════════════════════════════
// 출결 현황(결석자) 자동 채우기 (2026.11.11)
//  - 출결 체크(결석·사유) + 결석 사유서(학부모 앱·전화 접수) → 선생님별로
//      송문찬T
//      김근우 - 병결
//  - 칸이 비어 있거나 자동으로 채운 내용 그대로면 관·날짜 바꿀 때 자동 갱신
//  - 손으로 고친 뒤에는 「🔄 출결에서 불러오기」 버튼으로만 덮어씀
//  - 학부모가 앱으로 입력한 결석(관리부 미확인)은 칸 아래 경고 + 이미지 저장 때 한 번 더 확인
// ══════════════════════════════════════════
let drAbsentAuto = '';        // 마지막으로 자동 입력한 내용 (null = 손으로 고침)
let drAbsentItems = [];
let drAbsentSeq = 0;
function drAbsentWarnBox() {
  let el = document.getElementById('drAbsentWarn');
  if (el) return el;
  const ta = document.getElementById('dr-absent');
  if (!ta) return null;
  // 라벨 옆 「출결에서 불러오기」 버튼
  const lbl = ta.parentElement.querySelector('label');
  if (lbl && !document.getElementById('drAbsentBtn')) {
    lbl.style.display = 'flex'; lbl.style.alignItems = 'center'; lbl.style.gap = '8px';
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'drAbsentBtn';
    b.textContent = '🔄 출결에서 불러오기';
    b.style.cssText = 'margin-left:auto;font-size:11.5px;padding:3px 9px;border-radius:6px;border:1px solid rgba(91,63,166,0.35);background:#fff;color:#5B3FA6;cursor:pointer;font-family:inherit;font-weight:700;';
    b.onclick = () => drFillAbsent(true);
    lbl.appendChild(b);
  }
  el = document.createElement('div');
  el.id = 'drAbsentWarn';
  ta.insertAdjacentElement('afterend', el);
  return el;
}
function drRenderAbsentWarn() {
  const el = drAbsentWarnBox(); if (!el) return;
  drAbsentItems.forEach((it) => { if (it.abs) it.warn = it.abs.source !== 'phone' && !it.abs.verified; });
  const n = drAbsentItems.length;
  el.innerHTML = (n ? `<div style="font-size:11.5px;color:var(--muted);margin-top:4px;">출결 체크 기준 결석 ${n}명 (${document.getElementById('dr-branch').value})</div>` : '')
    + absentWarnHtml(drAbsentItems, 'drRenderAbsentWarn');
}
window.drRenderAbsentWarn = drRenderAbsentWarn;
window.drFillAbsent = async function (force) {
  const ta = document.getElementById('dr-absent');
  const branch = document.getElementById('dr-branch')?.value;
  const date = document.getElementById('dr-date')?.value;
  if (!ta || !branch || !date || typeof absentBuild !== 'function') return;
  const my = ++drAbsentSeq;
  const items = await absentBuild(branch, date);
  if (my !== drAbsentSeq) return;
  drAbsentItems = items;
  const text = absentText(items);
  const cur = ta.value.trim();
  const canAuto = !cur || cur === '-' || (drAbsentAuto !== null && cur === String(drAbsentAuto).trim());
  if (force && cur && !canAuto && cur !== text && !confirm('출결 현황 칸에 직접 적은 내용이 있습니다.\n출결 체크 기준 결석자로 바꿀까요?')) { drRenderAbsentWarn(); return; }
  if (force || canAuto) { ta.value = text; drAbsentAuto = text; }
  drRenderAbsentWarn();
};


// ══════════════════════════════════════════
// 금일 숙제 표 (2026.11.12)
//  - 「숙제 입력」(관리부·선생님 페이지)에 그 날짜로 저장된 이 관 숙제(homeworkLogs)를
//    숙제 입력 탭의 마감 이미지와 똑같은 표로 그려서 일일업무보고 이미지 아래에 붙임
//  - 관·날짜 바꿀 때, 📂 불러오기 할 때, 「🔄 숙제 입력에서 불러오기」 누를 때 다시 받음
// ══════════════════════════════════════════
let drHwRows = [], drHwKey = '', drHwSeq = 0;
function drHwImage() {
  if (!drHwRows.length || typeof hlDrawTable !== 'function') return null;
  const [branch, date] = drHwKey.split('|');
  return hlDrawTable(document.createElement('canvas'), drHwRows, hlTitle(branch, date));
}
window.drFillHomework = async function () {
  const note = document.getElementById('drHwNote');
  const cv = document.getElementById('drHwCanvas');
  const branch = document.getElementById('dr-branch')?.value;
  const date = document.getElementById('dr-date')?.value;
  if (!branch || !date) return;
  const my = ++drHwSeq;
  if (note) note.textContent = '숙제 표 불러오는 중...';
  let rows = [];
  try {
    if ((typeof studentsCache === 'undefined' || !studentsCache.length) && typeof loadStudents === 'function') await loadStudents();
    const snap = await getDocs(query(collection(db, 'homeworkLogs'), where('date', '==', date)));
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  } catch (e) { if (my === drHwSeq && note) note.textContent = '❌ 숙제 불러오기 실패: ' + e.message; return; }
  if (my !== drHwSeq) return;
  drHwRows = rows.filter((r) => (typeof hlLogBranch === 'function' ? hlLogBranch(r) : r.branch) === branch);
  drHwKey = branch + '|' + date;
  const img = drHwImage();
  if (cv) {
    cv.style.display = img ? 'block' : 'none';
    if (img) { cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0); }
  }
  if (note) note.textContent = drHwRows.length
    ? `「숙제 입력」 ${branch} 숙제 ${drHwRows.length}건 — 이 표가 보고서 이미지 아래에 그대로 붙어요`
    : `「숙제 입력」에 ${branch} ${date} 숙제가 아직 없어요 (입력하면 「🔄 숙제 입력에서 불러오기」를 눌러 주세요)`;
  if (document.getElementById('drPreviewWrap')?.style.display === 'block' && typeof previewDailyReport === 'function') previewDailyReport();
};
