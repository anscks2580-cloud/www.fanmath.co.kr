'use strict';
/* ═══════════════════════════════════════════════════════════
   주간 업무일지
   (admin.html에서 분리 — 원본 7519~7710줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 주간 업무일지
// ══════════════════════════════════════════

// 섹션별 컬럼 정의
const WL_COLS = {
  new:      ['이름','학년','학교','담당T','반배정'],
  leave:    ['이름','학년','학교','담당T','반배정'],
  pause:    ['이름','학년','학교','담당T','반배정'],
  upcoming: ['이름','학년','학교','담당T','반배정'],
  cash:     ['이름/발행일','수납처리유무','현금영수증발행','금액','번호'],
  consult:  ['이름','학년','학교','상담자','반배정'],
};
const WL_PLACEHOLDERS = {
  new:      ['홍길동','고1','○○고','송문찬T','고1-3A'],
  leave:    ['홍길동','고1','○○고','송문찬T','고1-3A'],
  pause:    ['홍길동','고1','○○고','송문찬T','고1-3A'],
  upcoming: ['홍길동','고1','○○고','송문찬T','고1-3A'],
  cash:     ['홍길동 / 06.24','O','O','100,000','010-xxxx'],
  consult:  ['홍길동','고1','○○고','송문찬T','고1-3A'],
};

// 관별 기본 기간 (오늘 기준)
//  · 평촌관: 이번 주 월 ~ 토
//  · 산본관: 매주 금요일에 작성 — 지난주 토 ~ 이번 주 토
function wlDefaultRange(branch) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  if (branch === '산본관') { const prevSat = new Date(sat); prevSat.setDate(sat.getDate() - 7); return [prevSat, sat]; }
  return [mon, sat];
}
function wlFmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
window.wlApplyDefaultDates = function(force) {
  const br = document.getElementById('wl-branch').value;
  const [from, to] = wlDefaultRange(br);
  const f = document.getElementById('wl-from'), t = document.getElementById('wl-to');
  if (force || !f.value) f.value = wlFmtDate(from);
  if (force || !t.value) t.value = wlFmtDate(to);
};

window.initWeeklyLogTab = function() {
  // 관 선택은 브라우저에 기억 (평촌관·산본관 따로)
  const bsel = document.getElementById('wl-branch');
  try { const b = localStorage.getItem('swc_wl_branch'); if ((b === '평촌관' || b === '산본관') && !bsel.dataset.touched) bsel.value = b; } catch (e) {}
  if (!bsel.dataset.bound) {
    bsel.dataset.bound = '1';
    bsel.addEventListener('change', () => {
      bsel.dataset.touched = '1';
      try { localStorage.setItem('swc_wl_branch', bsel.value); } catch (e) {}
      wlApplyDefaultDates(true);   // 관을 바꾸면 그 관 기준 기간으로 다시 맞춤
    });
  }
  wlApplyDefaultDates(false);

  // 각 섹션 초기화 (비어있을 때만)
  ['new','leave','pause','upcoming','cash','consult'].forEach(sec => {
    const el = document.getElementById('wl-' + sec + '-rows');
    if (el && !el.children.length) wlAddRow(sec);
  });
};

window.wlAddRow = function(sec) {
  const container = document.getElementById('wl-' + sec + '-rows');
  const cols = WL_COLS[sec];
  const ph   = WL_PLACEHOLDERS[sec];
  const idx  = container.children.length;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
  row.innerHTML = cols.map((col, ci) => `
    <input type="text" placeholder="${ph[ci]}"
      data-sec="${sec}" data-row="${idx}" data-col="${ci}"
      style="flex:1;min-width:0;padding:7px 10px;background:rgba(30,24,56,0.05);
        border:1px solid rgba(30,24,56,0.1);border-radius:6px;
        color:var(--off-white);font-size:12px;font-family:inherit;outline:none;">
  `).join('') + `
    <button onclick="this.parentElement.remove()" style="background:rgba(214,69,69,0.15);border:1px solid rgba(214,69,69,0.3);
      color:#D64545;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:12px;flex-shrink:0;">✕</button>`;
  container.appendChild(row);
};

function wlGetRows(sec) {
  const rows = [];
  document.querySelectorAll(`[data-sec="${sec}"]`).forEach(inp => {
    const r = parseInt(inp.dataset.row);
    const c = parseInt(inp.dataset.col);
    if (!rows[r]) rows[r] = [];
    rows[r][c] = inp.value.trim();
  });
  return rows.filter(r => r && r.some(v => v));
}

// ── 이미지 그리기 ──
window.downloadWeeklyLog = function() {
  const fromVal  = document.getElementById('wl-from').value;
  const toVal    = document.getElementById('wl-to').value;
  const branch   = document.getElementById('wl-branch').value;

  const fmtDate = v => v ? v.replace(/-/g,'.') : '00.00';
  const title   = `주간 업무일지  (${fmtDate(fromVal)}~${fmtDate(toVal)})`;

  const sections = [
    { key:'new',      label:'신입생',       cols:WL_COLS.new,     rows:wlGetRows('new') },
    { key:'leave',    label:'퇴원생',       cols:WL_COLS.leave,   rows:wlGetRows('leave') },
    { key:'pause',    label:'휴원생',       cols:WL_COLS.pause,   rows:wlGetRows('pause') },
    { key:'upcoming', label:'신규등원예정', cols:WL_COLS.upcoming,rows:wlGetRows('upcoming') },
    { key:'cash',     label:'현금입금내역', cols:WL_COLS.cash,    rows:wlGetRows('cash') },
    { key:'consult',  label:'상담',         cols:WL_COLS.consult, rows:wlGetRows('consult') },
  ];
  const consultNote = document.getElementById('wl-consult-note').value.trim();
  const textbook    = document.getElementById('wl-textbook').value.trim();

  // ── 레이아웃 상수 ──
  const CW = 700, PAD = 30;
  const HEADER_BG = '#C8DDA0', LIGHT_BG = '#E8F5C8', WHITE = '#FFFFFF';
  const CELL_H = 22, LABEL_W = 80;
  const tableW = CW - PAD * 2;

  // 높이 계산
  let totalH = 70; // 타이틀
  sections.forEach(s => {
    const dataRows = Math.max(s.rows.length, 3);
    totalH += CELL_H + dataRows * CELL_H + 4;
    if (s.key === 'consult') totalH += CELL_H + 4; // 상담요형처리 행
  });
  // 교재입출고 (텍스트 줄수 기반)
  const tbLines = textbook ? textbook.split('\n').length : 0;
  const tbH = Math.max(tbLines, 5) * 18 + 14;
  totalH += CELL_H + tbH + 4;
  totalH += 20;

  const canvas = document.getElementById('wlCanvas');
  canvas.width = CW; canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, CW, totalH);

  const F = (size, bold=false) => `${bold?'bold ':''}${size}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;

  // 타이틀
  ctx.fillStyle = '#222';
  ctx.font = F(16, true);
  ctx.textAlign = 'center';
  ctx.fillText(title, CW/2, 42);
  ctx.textAlign = 'left';

  let y = 58;

  function drawCell(x, cy, w, h, bg, text, opts={}) {
    const { bold=false, size=11, color='#222', align='center' } = opts;
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, cy, w, h); }
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.5;
    ctx.strokeRect(x, cy, w, h);
    ctx.fillStyle = color;
    ctx.font = F(size, bold);
    ctx.textAlign = align;
    const tx = align==='center' ? x+w/2 : x+6;
    ctx.fillText(text||'', tx, cy+h/2+size*0.36, w-8);
    ctx.textAlign = 'left';
  }

  function drawSection(sec) {
    const { label, cols, rows } = sec;
    const dataRows = Math.max(rows.length, 3);
    const colW = (tableW - LABEL_W) / cols.length;

    // 라벨 셀 (세로 전체 span)
    const secH = CELL_H + dataRows * CELL_H;
    drawCell(PAD, y, LABEL_W, secH, HEADER_BG, label, { bold:true, size:11 });

    // 헤더 행
    cols.forEach((col, ci) => {
      drawCell(PAD + LABEL_W + ci*colW, y, colW, CELL_H, HEADER_BG, col, { bold:true, size:10 });
    });
    y += CELL_H;

    // 데이터 행
    for (let ri = 0; ri < dataRows; ri++) {
      const rowData = rows[ri] || [];
      cols.forEach((_, ci) => {
        drawCell(PAD + LABEL_W + ci*colW, y, colW, CELL_H, ri%2===0?WHITE:LIGHT_BG, rowData[ci]||'', { size:10, align:'left' });
      });
      y += CELL_H;
    }
    y += 4;
  }

  // 신입/퇴원/휴원/신규예정/현금 그리기
  sections.filter(s => s.key !== 'consult').forEach(drawSection);

  // 상담 (추가로 상담요형처리 행)
  const consultSec = sections.find(s => s.key === 'consult');
  drawSection(consultSec);
  // 상담요형처리 행
  drawCell(PAD, y, LABEL_W, CELL_H, HEADER_BG, '상담요형처리', { bold:true, size:10 });
  drawCell(PAD+LABEL_W, y, tableW-LABEL_W, CELL_H, WHITE, consultNote, { size:10, align:'left' });
  y += CELL_H + 4;

  // 교재입출고
  const lines = textbook ? textbook.split('\n') : [];
  drawCell(PAD, y, LABEL_W, tbH, HEADER_BG, '교재입출고', { bold:true, size:11 });
  ctx.fillStyle = WHITE; ctx.fillRect(PAD+LABEL_W, y, tableW-LABEL_W, tbH);
  ctx.strokeStyle='#999'; ctx.lineWidth=0.5; ctx.strokeRect(PAD+LABEL_W, y, tableW-LABEL_W, tbH);
  ctx.strokeRect(PAD, y, LABEL_W, tbH);
  ctx.fillStyle = '#222'; ctx.font = F(10); ctx.textAlign = 'left';
  lines.forEach((ln, i) => ctx.fillText(ln, PAD+LABEL_W+6, y+16+i*18, tableW-LABEL_W-10));

  // 저장
  const link = document.createElement('a');
  link.download = `주간업무일지_${branch}_${fmtDate(fromVal).replace(/\./g,'')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  if (typeof recordClosing === 'function') recordClosing('wl', canvas);   // 마감 기록 + 원장 페이지로 이미지 제출
};

