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
//  · 산본관: 매주 금요일에 작성 — 지난주 토 ~ 이번 주 금 (2026.11.06 변경)
function wlDefaultRange(branch) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  if (branch === '산본관') { const prevSat = new Date(sat); prevSat.setDate(sat.getDate() - 7); const fri = new Date(sat); fri.setDate(sat.getDate() - 1); return [prevSat, fri]; }
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
      wlFillFromDaily(false);
    });
    ['wl-from', 'wl-to'].forEach((id) => document.getElementById(id).addEventListener('change', () => wlFillFromDaily(false)));
  }
  wlApplyDefaultDates(false);

  // 각 섹션 초기화 (비어있을 때만)
  ['new','leave','pause','upcoming','cash','consult'].forEach(sec => {
    const el = document.getElementById('wl-' + sec + '-rows');
    if (el && !el.children.length) wlAddRow(sec);
  });
  wlFillFromDaily(false);
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
  const warnN = wlAbsentItems.filter((it) => it.warn).length;
  if (warnN && !confirm(`⚠ 이번 기간에 학부모가 앱으로 입력한 결석 ${warnN}건을 아직 관리부에서 확인하지 않았습니다.\n사실인지 확인한 뒤 저장하는 것을 권장합니다.\n\n그래도 이미지를 저장할까요?`)) return;
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
  // 출결 현황(결석자) (텍스트 줄수 기반)
  const absentTxt = (document.getElementById('wl-absent')?.value || '').trim();
  const abLines = absentTxt ? absentTxt.split('\n') : [];
  const abH = Math.max(abLines.length, 3) * 18 + 14;
  totalH += abH + 4;
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

  // 출결 현황 (결석자)
  drawCell(PAD, y, LABEL_W, abH, HEADER_BG, '', {});
  ctx.fillStyle = '#222'; ctx.font = F(11, true); ctx.textAlign = 'center';
  ctx.fillText('출결 현황', PAD + LABEL_W / 2, y + abH / 2 - 3); ctx.font = F(10, true); ctx.fillText('(결석자)', PAD + LABEL_W / 2, y + abH / 2 + 11);
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE; ctx.fillRect(PAD + LABEL_W, y, tableW - LABEL_W, abH);
  ctx.strokeStyle = '#999'; ctx.lineWidth = 0.5; ctx.strokeRect(PAD + LABEL_W, y, tableW - LABEL_W, abH);
  ctx.fillStyle = '#222'; ctx.font = F(10); ctx.textAlign = 'left';
  abLines.forEach((ln, i) => ctx.fillText(ln, PAD + LABEL_W + 6, y + 16 + i * 18, tableW - LABEL_W - 10));
  y += abH + 4;

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



// ══════════════════════════════════════════
// 일일 업무보고 → 주간 업무일지 자동 채우기 (2026.11.11)
//  기간(평촌관 월~토 · 산본관 토~금) 안의 날짜별 일일 업무보고(dailyDrafts/dr_관_날짜)를 모아서
//   · 상담 및 테스트       → 상담 표
//   · 비고(신규/퇴원)      → 신입생·퇴원생·휴원생·신규등원예정 표 (줄에 있는 단어로 구분)
//   · 현금영수증 발행 현황 → 현금입금내역 표 (발행일 = 그 날짜)
//   · 교재 입/출고         → 교재입출고 (날짜 붙여서)
//   · 출결 현황(결석자)    → 출결 현황 (결석자) — 일일 보고가 없는 날은 출결 체크 기준으로 자동 계산
//  학생 명단에 있는 이름이면 학년·담당T·반을 명단에서 채움
//  표·칸이 모두 비어 있을 때만 자동, 「📥 일일 업무보고에서 불러오기」는 덮어씀
// ══════════════════════════════════════════
let wlAbsentItems = [];
let wlSyncSeq = 0;
const WL_SYNC_SECS = ['new', 'leave', 'pause', 'upcoming', 'cash', 'consult'];
function wlDatesInRange(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  const d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
  while (d <= end && out.length < 31) { out.push(wlFmtDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}
const wlMD = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`; };
const wlMD2 = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
function wlIsEmpty() {
  let empty = true;
  WL_SYNC_SECS.forEach((sec) => document.querySelectorAll(`[data-sec="${sec}"]`).forEach((inp) => { if (inp.value.trim()) empty = false; }));
  ['wl-textbook', 'wl-absent'].forEach((id) => { if ((document.getElementById(id)?.value || '').trim()) empty = false; });
  return empty;
}
function wlLines(t) { return String(t || '').split('\n').map((l) => l.trim()).filter((l) => l && l !== '-'); }
// 한 줄을 단어로 나눠 이름·학년·학교·담당·반 추정
function wlParse(line, branch) {
  const toks = line.replace(/(\d{1,2})\/(\d{1,2})/g, '$1.$2').replace(/[(),\/·:|]/g, ' ').split(/\s+/).flatMap((t) => (/^(초|중|고)\d-/.test(t) ? [t] : t.split(/[-–~]/))).map((t) => t.trim()).filter(Boolean);
  const r = { name: '', grade: '', school: '', teacher: '', cls: '', rest: [] };
  toks.forEach((t) => {
    if (!r.grade && /^(초|중|고)[1-6]$|^N수$|^재수$/.test(t)) r.grade = t;
    else if (!r.cls && /^(초|중|고)\d-\w+$/.test(t)) r.cls = t;
    else if (!r.teacher && /^[가-힣]{2,4}([Tt]|쌤|선생님)$/.test(t)) r.teacher = t.replace(/(t|쌤|선생님)$/, 'T');
    else if (!r.school && /^[가-힣]{1,8}(초|중|고|여중|여고|고등학교|중학교|초등학교)$/.test(t)) r.school = t;
    else if (!r.name && /^[가-힣]{2,4}$/.test(t) && !/^(신규|신입|퇴원|휴원|예정|등원|상담|테스트|레벨|발행|입금|현금|등록|복원|재원|전화|방문)$/.test(t)) r.name = t;
    else r.rest.push(t);
  });
  const s = r.name ? (studentsCache || []).find((x) => x.name === r.name && x.branch === branch) : null;
  if (s) {
    r.grade = r.grade || s.grade || '';
    r.teacher = r.teacher || (s.teacherName ? absTeacherLabel(s.teacherName) : '');
    r.cls = r.cls || s.classGroup || '';
    r.school = r.school || s.school || '';
  }
  return r;
}
function wlSetRows(sec, rows) {
  const box = document.getElementById('wl-' + sec + '-rows');
  if (!box) return;
  box.innerHTML = '';
  (rows.length ? rows : [[]]).forEach((vals, ri) => {
    wlAddRow(sec);
    box.querySelectorAll(`[data-row="${ri}"]`).forEach((inp) => { inp.value = vals[+inp.dataset.col] || ''; });
  });
}
// 일일 보고의 결석자 칸(선생님별 묶음) → 주간용 한 줄씩
function wlAbsentLines(ds, text) {
  const out = [];
  let head = '', list = [];
  const flush = () => { if (list.length) out.push(`${wlMD(ds)} ${head ? head + ': ' : ''}${list.join(', ')}`); list = []; };
  wlLines(text).forEach((l) => {
    if (/^[^\s\-]+T$|^담당 미지정$/.test(l)) { flush(); head = l; }
    else list.push(l.replace(/\s*-\s*/, '-'));
  });
  flush();
  return out;
}
window.wlRenderAbsentWarn = function () {
  const el = document.getElementById('wlAbsentWarn'); if (!el) return;
  wlAbsentItems.forEach((it) => { if (it.abs) it.warn = it.abs.source !== 'phone' && !it.abs.verified; });
  el.innerHTML = typeof absentWarnHtml === 'function' ? absentWarnHtml(wlAbsentItems, 'wlRenderAbsentWarn') : '';
};
window.wlFillFromDaily = async function (force) {
  const branch = document.getElementById('wl-branch')?.value;
  const from = document.getElementById('wl-from')?.value, to = document.getElementById('wl-to')?.value;
  const st = document.getElementById('wl-sync-status');
  const dates = wlDatesInRange(from, to);
  if (!branch || !dates.length) return;
  const my = ++wlSyncSeq;
  const empty = wlIsEmpty();
  if (!force && !empty) {
    // 내용이 있으면 덮어쓰지 않고 경고만 갱신
  } else if (force && !empty && !confirm('지금 적혀 있는 주간 업무일지 내용을 일일 업무보고 기준으로 바꿀까요?\n(상담요형처리 칸은 그대로 둡니다)')) return;
  if (st) st.textContent = '일일 업무보고 불러오는 중...';
  if ((typeof studentsCache === 'undefined' || !studentsCache.length) && typeof loadStudents === 'function') { try { await loadStudents(); } catch (e) {} }
  let drafts = [];
  try { drafts = await Promise.all(dates.map((ds) => getDoc(doc(db, 'dailyDrafts', `dr_${branch}_${ds}`)).then((s) => [ds, s.exists() ? s.data() : null]))); }
  catch (e) { if (st) st.textContent = '❌ 불러오기 실패: ' + e.message; return; }
  // 결석: 출결 체크 기준(경고 판단용 + 일일 보고가 없는 날 채움)
  const absByDate = {};
  for (const ds of dates) { try { absByDate[ds] = typeof absentBuild === 'function' ? await absentBuild(branch, ds) : []; } catch (e) { absByDate[ds] = []; } }
  if (my !== wlSyncSeq) return;
  wlAbsentItems = [];
  dates.forEach((ds) => (absByDate[ds] || []).forEach((it) => wlAbsentItems.push(Object.assign({}, it, { date: wlMD(ds) }))));
  wlRenderAbsentWarn();
  const found = drafts.filter(([, d]) => d).length;
  if (!force && !empty) { if (st) st.textContent = `이미 작성 중이라 자동으로 덮어쓰지 않았습니다 · 일일 업무보고 ${found}일치 있음`; return; }

  const rows = { new: [], leave: [], pause: [], upcoming: [], cash: [], consult: [] };
  const tb = [], ab = [];
  drafts.forEach(([ds, d]) => {
    if (d) {
      // 비고(신규/퇴원)
      wlLines(d.note).forEach((l) => {
        const sec = /퇴원/.test(l) ? 'leave' : /휴원/.test(l) ? 'pause' : /예정/.test(l) ? 'upcoming' : /신규|신입|등록|입학|입원/.test(l) ? 'new' : 'new';
        const p = wlParse(l, branch);
        const extra = p.rest.filter((t) => !/^(신규|신입|퇴원|휴원|예정|등원|등록|입학|입원)$/.test(t)).join(' ');
        rows[sec].push([(p.name || l) + (p.name && extra ? ` (${extra})` : ''), p.grade, p.school, p.teacher, p.cls]);
      });
      // 상담 및 테스트
      wlLines(d.consult).forEach((l) => {
        const p = wlParse(l, branch);
        const extra = [wlMD(ds), ...p.rest].join(' ');
        rows.consult.push([(p.name || l) + (p.name ? ` (${extra})` : ` (${wlMD(ds)})`), p.grade, p.school, p.teacher, p.cls]);
      });
      // 현금영수증 발행 현황
      wlLines(d.receipt).forEach((l) => {
        const amt = (l.match(/\d{1,3}(,\d{3})+|\d{4,}(?!\d)/) || [''])[0];
        const phone = (l.match(/01\d[-\s]?\d{3,4}[-\s]?\d{4}/) || [''])[0];
        const p = wlParse(l.replace(amt, ' ').replace(phone, ' '), branch);
        rows.cash.push([`${p.name || l} / ${wlMD2(ds)}`, /미처리|미수납/.test(l) ? 'X' : 'O', /미발행/.test(l) ? 'X' : 'O', amt, phone]);
      });
      // 교재 입/출고
      wlLines(d.textbook).forEach((l) => tb.push(`${wlMD(ds)} ${l}`));
    }
    // 출결 현황(결석자): 일일 보고에 적은 내용 우선, 없으면 출결 체크 기준
    const dAbs = d && wlLines(d.absent).length ? d.absent : (absByDate[ds] || []).length ? absentText(absByDate[ds]) : '';
    if (dAbs) ab.push(...wlAbsentLines(ds, dAbs));
  });
  WL_SYNC_SECS.forEach((sec) => wlSetRows(sec, rows[sec]));
  document.getElementById('wl-textbook').value = tb.join('\n');
  document.getElementById('wl-absent').value = ab.join('\n');
  if (st) st.textContent = found
    ? `✅ ${wlMD(dates[0])}~${wlMD(dates[dates.length - 1])} 일일 업무보고 ${found}일치를 채웠습니다 · 내용 확인 후 수정해 주세요`
    : `기간 안에 저장된 일일 업무보고가 없습니다 (결석자는 출결 체크 기준으로 채움)`;
};
