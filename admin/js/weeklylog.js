'use strict';
/* ═══════════════════════════════════════════════════════════
   주간 업무일지
   (admin.html에서 분리 — 원본 7519~7710줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 주간 업무일지
// ══════════════════════════════════════════

// 섹션 정의 — 모든 칸은 한 칸(텍스트)에 자유롭게 작성 (2026.11.12 변경: 이름·학년 칸 나누기 없앰)
const WL_SECS = [
  { key: 'new',      label: '신입생' },
  { key: 'leave',    label: '퇴원생' },
  { key: 'pause',    label: '휴원생' },
  { key: 'upcoming', label: '신규등원예정' },
  { key: 'cash',     label: '현금입금내역' },
  { key: 'consult',  label: '상담' },
  { key: 'textbook', label: '교재입출고' },
];
const WL_KEYS = WL_SECS.map((s) => s.key);

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
  wlFillFromDaily(false);
};

// 칸 값 읽기·쓰기
window.wlGetText = function (key) { return (document.getElementById('wl-' + key)?.value || '').replace(/\s+$/, ''); };
window.wlSetText = function (key, v) { const el = document.getElementById('wl-' + key); if (el) el.value = v || ''; };

// ── 이미지 그리기 ──
window.downloadWeeklyLog = function() {
  const fromVal  = document.getElementById('wl-from').value;
  const toVal    = document.getElementById('wl-to').value;
  const branch   = document.getElementById('wl-branch').value;

  const fmtDate = v => v ? v.replace(/-/g,'.') : '00.00';
  const title   = `주간 업무일지 · ${branch}  (${fmtDate(fromVal)}~${fmtDate(toVal)})`;

  // ── 레이아웃 상수 ──
  const CW = 700, PAD = 30;
  const HEADER_BG = '#C8DDA0', WHITE = '#FFFFFF';
  const LABEL_W = 90, LINE_H = 18, MIN_LINES = 3;
  const tableW = CW - PAD * 2;
  const textW  = tableW - LABEL_W - 14;

  const canvas = document.getElementById('wlCanvas');
  const ctx = canvas.getContext('2d');
  const F = (size, bold=false) => `${bold?'bold ':''}${size}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;

  // 긴 줄은 칸 너비에 맞춰 자동 줄바꿈
  function wrap(text) {
    ctx.font = F(11);
    const out = [];
    String(text || '').split('\n').forEach((raw) => {
      const ln = raw.replace(/\s+$/, '');
      if (!ln) { out.push(''); return; }
      let cur = '';
      for (const ch of ln) {
        if (ctx.measureText(cur + ch).width > textW && cur) { out.push(cur); cur = ch.trim() ? ch : ''; }
        else cur += ch;
      }
      out.push(cur);
    });
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }

  const blocks = WL_SECS.map((s) => {
    const lines = wrap(wlGetText(s.key));
    return { label: s.label, lines, h: Math.max(lines.length, MIN_LINES) * LINE_H + 14 };
  });

  const totalH = 70 + blocks.reduce((a, b) => a + b.h + 4, 0) + 20;
  canvas.width = CW; canvas.height = totalH;

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, CW, totalH);

  // 타이틀
  ctx.fillStyle = '#222';
  ctx.font = F(16, true);
  ctx.textAlign = 'center';
  ctx.fillText(title, CW/2, 42);
  ctx.textAlign = 'left';

  let y = 58;
  blocks.forEach((b) => {
    // 라벨 칸
    ctx.fillStyle = HEADER_BG; ctx.fillRect(PAD, y, LABEL_W, b.h);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.5; ctx.strokeRect(PAD, y, LABEL_W, b.h);
    ctx.fillStyle = '#222'; ctx.font = F(11, true); ctx.textAlign = 'center';
    ctx.fillText(b.label, PAD + LABEL_W / 2, y + b.h / 2 + 4, LABEL_W - 8);
    ctx.textAlign = 'left';
    // 내용 칸
    ctx.fillStyle = WHITE; ctx.fillRect(PAD + LABEL_W, y, tableW - LABEL_W, b.h);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.5; ctx.strokeRect(PAD + LABEL_W, y, tableW - LABEL_W, b.h);
    ctx.fillStyle = '#222'; ctx.font = F(11);
    b.lines.forEach((ln, i) => ctx.fillText(ln, PAD + LABEL_W + 7, y + 18 + i * LINE_H));
    y += b.h + 4;
  });

  // 저장
  const link = document.createElement('a');
  link.download = `주간업무일지_${branch}_${fmtDate(fromVal).replace(/\./g,'')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  if (typeof recordClosing === 'function') recordClosing('wl', canvas);   // 마감 기록 + 원장 페이지로 이미지 제출
};



// ══════════════════════════════════════════
// 일일 업무보고 → 주간 업무일지 자동 채우기 (2026.11.11 · 11.12 변경)
//  기간(평촌관 월~토 · 산본관 토~금) 안의 날짜별 일일 업무보고(dailyDrafts/dr_관_날짜)를 모아서
//  일일 업무보고에 쓴 문장을 그대로(앞에 날짜만 붙여서) 옮김
//   · 상담 및 테스트       → 상담
//   · 비고(신규/퇴원)      → 신입생·퇴원생·휴원생·신규등원예정 (줄에 있는 단어로 구분)
//   · 현금영수증 발행 현황 → 현금입금내역
//   · 교재 입/출고         → 교재입출고
//  칸이 모두 비어 있을 때만 자동, 「📥 일일 업무보고에서 불러오기」는 덮어씀
// ══════════════════════════════════════════
let wlSyncSeq = 0;
function wlDatesInRange(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  const d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
  while (d <= end && out.length < 31) { out.push(wlFmtDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}
const wlMD = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`; };
function wlIsEmpty() { return WL_KEYS.every((k) => !wlGetText(k).trim()); }
function wlLines(t) { return String(t || '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() && l.trim() !== '-'); }

window.wlFillFromDaily = async function (force) {
  const branch = document.getElementById('wl-branch')?.value;
  const from = document.getElementById('wl-from')?.value, to = document.getElementById('wl-to')?.value;
  const st = document.getElementById('wl-sync-status');
  const dates = wlDatesInRange(from, to);
  if (!branch || !dates.length) return;
  const my = ++wlSyncSeq;
  const empty = wlIsEmpty();
  if (!force && !empty) { if (st) st.textContent = '이미 작성 중이라 자동으로 덮어쓰지 않았습니다 · 「📥 일일 업무보고에서 불러오기」를 누르면 다시 채웁니다'; return; }
  if (force && !empty && !confirm('지금 적혀 있는 주간 업무일지 내용을 일일 업무보고 기준으로 바꿀까요?')) return;
  if (st) st.textContent = '일일 업무보고 불러오는 중...';
  let drafts = [];
  try { drafts = await Promise.all(dates.map((ds) => getDoc(doc(db, 'dailyDrafts', `dr_${branch}_${ds}`)).then((s) => [ds, s.exists() ? s.data() : null]))); }
  catch (e) { if (st) st.textContent = '❌ 불러오기 실패: ' + e.message; return; }
  if (my !== wlSyncSeq) return;

  const out = { new: [], leave: [], pause: [], upcoming: [], cash: [], consult: [], textbook: [] };
  // 줄마다 앞에 날짜만 붙이고 원문 그대로
  const push = (key, ds, lines) => lines.forEach((l) => out[key].push(`${wlMD(ds)} ${l.trim()}`));
  drafts.forEach(([ds, d]) => {
    if (!d) return;
    // 비고(신규/퇴원) — 줄마다 단어로 구분, 원문 그대로
    wlLines(d.note).forEach((l) => {
      const key = /퇴원/.test(l) ? 'leave' : /휴원/.test(l) ? 'pause' : /예정/.test(l) ? 'upcoming' : 'new';
      out[key].push(`${wlMD(ds)} ${l.trim()}`);
    });
    push('consult', ds, wlLines(d.consult));
    push('cash', ds, wlLines(d.receipt));
    push('textbook', ds, wlLines(d.textbook));
  });
  WL_KEYS.forEach((k) => wlSetText(k, out[k].join('\n')));
  const found = drafts.filter(([, d]) => d).length;
  if (st) st.textContent = found
    ? `✅ ${wlMD(dates[0])}~${wlMD(dates[dates.length - 1])} 일일 업무보고 ${found}일치를 쓴 그대로 채웠습니다 · 내용 확인 후 수정해 주세요`
    : `기간 안에 저장된 일일 업무보고가 없습니다`;
};
