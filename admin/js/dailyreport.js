'use strict';
/* ═══════════════════════════════════════════════════════════
   관리부 마감 (일일업무보고서 이미지)
   (admin.html에서 분리 — 원본 6819~7131줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 관리부 마감 (일일업무보고서 이미지 생성)
// ══════════════════════════════════════════

window.initDailyReportTab = function() {
  const today = new Date().toISOString().slice(0, 10);
  if (!document.getElementById('dr-date').value) {
    document.getElementById('dr-date').value = today;
  }
  // 관 변경 시 아코디언 갱신
  document.getElementById('dr-branch').addEventListener('change', renderDrClassAccordion);
  renderDrClassAccordion();
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
let drActiveDayTab = '';        // 현재 선택된 요일 탭
let drChecked = new Set();      // 선택된 반 (요일_반명 키)

function renderDrClassAccordion() {
  drChecked.clear();
  document.getElementById('dr-classes').value = '';
  drActiveDayTab = '';

  const branch = document.getElementById('dr-branch').value;
  const days = Object.keys(DR_CLASSES[branch] || {}).sort((a,b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  // 요일 탭 렌더
  const tabWrap = document.getElementById('drClassDayTabs');
  tabWrap.innerHTML = days.map(d => `
    <button class="btn btn-sm btn-secondary" id="drTab-${d}"
      onclick="drSwitchDay('${d}')"
      style="border-radius:20px;">${d}요일</button>
  `).join('');

  // 첫 번째 요일 기본 선택
  if (days.length) drSwitchDay(days[0]);
}

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
  const classes = DR_CLASSES[branch]?.[day] || [];
  const panel = document.getElementById('drClassDayPanel');
  panel.innerHTML = classes.map(cls => {
    const key = day + '_' + cls;
    const checked = drChecked.has(key);
    return `
      <label style="display:flex;align-items:center;gap:6px;padding:5px 10px;
        background:${checked ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.04)'};
        border:1px solid ${checked ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)'};
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
    lbl.style.background = cb.checked ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.04)';
    lbl.style.borderColor = cb.checked ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)';
  }
  updateDrClassInput();
};

window.drSelectAllClasses = function() {
  const branch = document.getElementById('dr-branch').value;
  const day = drActiveDayTab;
  (DR_CLASSES[branch]?.[day] || []).forEach(cls => drChecked.add(day + '_' + cls));
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
    const dayClasses = DR_CLASSES[branch]?.[day] || [];
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
  if (!open) renderDrClassAccordion();
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
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

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

  twoColRow('상담 및\n테스트',    data.consult,  '현금영수증\n발행 현황', data.receipt,  row3H);
  twoColRow('출결 현황\n<결석자>', data.absent,  '교재\n입/출고',        data.textbook, row4H);

  // 결석자 수 (출결 셀 하단 우측)
  const absentCount = (data.absent === '-') ? 0 : data.absent.split('\n').filter(l => l.trim()).length;
  if (absentCount > 0) {
    ctx.fillStyle = '#555';
    ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(absentCount), tl + tableW / 2 - 6, y - 6);
    ctx.textAlign = 'left';
  }

  twoColRow('비고\n(신규/ 퇴원)', data.note,    '전화문의',             data.phone,    row5H);

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
}

window.previewDailyReport = function() {
  const data = getDRValues();
  const canvas = document.getElementById('drCanvas');
  drawDailyReport(canvas, data);
  document.getElementById('drPreviewWrap').style.display = 'block';
};

window.downloadDailyReport = function() {
  const data = getDRValues();
  const canvas = document.getElementById('drCanvas');
  drawDailyReport(canvas, data);
  document.getElementById('drPreviewWrap').style.display = 'block';
  const link = document.createElement('a');
  const dateStr = data.date.replace(/\./g, '') || 'report';
  link.download = `일일업무보고_${data.branch}_${dateStr}_${data.author}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

