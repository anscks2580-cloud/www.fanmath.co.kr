'use strict';
/* ═══════════════════════════════════════════════════════════
   학생 출결
   (admin.html에서 분리 — 원본 7132~7518줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 학생 출결 탭
// ══════════════════════════════════════════
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
let attCurrentDate = new Date();
let attStatus = {};   // { studentId: 'present'|'absent' }
let attReasons = {};  // 결석 사유 { 'YYYY-MM-DD': { studentId: '사유' } } — 날짜를 옮겨도 입력한 사유가 남음
window.attTouched = new Set();   // 이 화면에서 직접 바꾼 학생 (저장본보다 화면이 최신)

// ── 자동 저장 (2026.11.11) ──
// 출결·사유를 바꾸면 그 학생 것만 dailyDrafts/att_{학생 관}_{날짜} 에 바로 합쳐 저장
// → 일일 업무보고 「출결 현황(결석자)」·주간 업무일지에 자동으로 들어감 (absentsync.js)
const attSaveTimers = {};
function attAutoSave(uid, statusOnly) {
  clearTimeout(attSaveTimers[uid]);
  attSaveTimers[uid] = setTimeout(async () => {
    const s = studentsCache.find((x) => x.id === uid);
    if (!s || !s.branch) return;
    const date = toLocalDateStr(attCurrentDate);
    try {
      const data = { date, branch: s.branch, status: { [uid]: attStatus[uid] || 'present' }, savedAt: new Date().toISOString() };
      if (!statusOnly) data.reasons = { [uid]: (attReasons[date] || {})[uid] || '' };   // 사유서 자동 결석 저장 때는 입력해 둔 사유를 건드리지 않음
      await setDoc(doc(db, 'dailyDrafts', `att_${s.branch}_${date}`), data, { merge: true });
      const el = document.getElementById('att-draft-status');
      if (el) { el.textContent = '✅ 자동 저장됨'; el.style.color = '#2E9E5B'; setTimeout(() => { if (el.textContent === '✅ 자동 저장됨') el.textContent = ''; }, 2000); }
    } catch (e) { console.warn('출결 자동 저장 실패', e); }
  }, 800);
}
// 날짜를 열면 저장해 둔 출결(관별·전체)을 화면에 자동으로 불러옴 (직접 바꾼 학생은 그대로)
async function attLoadSaved(dateKey) {
  try {
    const ids = [`att_all_${dateKey}`, `att_평촌관_${dateKey}`, `att_산본관_${dateKey}`];
    const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'dailyDrafts', id))));
    if (toLocalDateStr(attCurrentDate) !== dateKey) return;
    const absMap = attCurAbsMap();
    const rm = attReasons[dateKey] = attReasons[dateKey] || {};
    let changed = false;
    snaps.forEach((sn) => {
      if (!sn.exists()) return;
      const d = sn.data();
      Object.entries(d.status || {}).forEach(([uid, st]) => {
        if (window.attTouched.has(uid) || absMap[uid]) return;
        if (attStatus[uid] !== st) { attStatus[uid] = st; changed = true; }
      });
      Object.entries(d.reasons || {}).forEach(([uid, r]) => {
        if (window.attTouched.has(uid) || !String(r || '').trim() || rm[uid]) return;
        rm[uid] = r; changed = true;
      });
    });
    if (changed) renderAttendance();
  } catch (e) { console.warn('출결 저장본 자동 불러오기 실패', e); }
}

function attEsc(t) { return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function attReasonMap() { const k = toLocalDateStr(attCurrentDate); if (!attReasons[k]) attReasons[k] = {}; return attReasons[k]; }
// 학생 한 명의 결석 사유 — 관리부가 입력한 사유만 (2026.11.12: 사유서 내용은 참고로만 보여주고 자동 입력 안 함)
function attReasonOf(s, absMap) {
  return (attReasonMap()[s.id] || '').trim();
}
function attCurAbsMap() { return typeof absMapFor === 'function' ? absMapFor(toLocalDateStr(attCurrentDate)) : {}; }

// toISOString()은 UTC 기준이라 한국 시간대에서는 자정~오전 9시 사이에 하루 전 날짜로 잘못 저장되는 문제가 있음.
// 로컬 날짜 그대로 YYYY-MM-DD 문자열로 변환하는 안전한 헬퍼.
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

window.initAttendanceTab = function() {
  attCurrentDate = new Date();
  attStatus = {};
  window.attTouched = new Set(); window.attAbsDate = '';
  renderAttendance();
  loadDailyCode();
  if (typeof initAbsences === 'function') initAbsences();    // 결석 사유서 (absences.js)
  if (typeof initCheckInOut === 'function') initCheckInOut(); // 등원·하원 · 앱 설치 현황 (checkinout.js)
};

function todayKSTStr() {
  const d = new Date();
  const k = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
}

window.loadDailyCode = async function() {
  const disp = document.getElementById('dailyCodeDisplay');
  const status = document.getElementById('dailyCodeStatus');
  if (!disp) return;
  try {
    const snap = await getDoc(doc(db, 'settings', 'dailyCode'));
    const today = todayKSTStr();
    if (snap.exists() && snap.data().date === today) {
      disp.textContent = snap.data().code;
      status.textContent = `오늘(${today}) 발급된 코드입니다.`;
    } else {
      disp.textContent = '------';
      status.textContent = '오늘 아직 코드가 발급되지 않았습니다. 발급 버튼을 눌러주세요.';
    }
  } catch (e) {
    status.textContent = '코드 조회 오류: ' + e.message;
  }
};

window.generateDailyCode = async function() {
  const disp = document.getElementById('dailyCodeDisplay');
  const status = document.getElementById('dailyCodeStatus');
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const today = todayKSTStr();
  try {
    await setDoc(doc(db, 'settings', 'dailyCode'), { code, date: today, updatedAt: Timestamp.now() });
    disp.textContent = code;
    status.textContent = `${today} 코드 발급 완료!`;
  } catch (e) {
    status.textContent = '발급 실패: ' + e.message;
  }
};

window.changeAttDay = function(delta) {
  attCurrentDate = new Date(attCurrentDate);
  attCurrentDate.setDate(attCurrentDate.getDate() + delta);
  attStatus = {};
  window.attTouched = new Set();
  renderAttendance();
};

window.resetAttDay = function() {
  attCurrentDate = new Date();
  attStatus = {};
  window.attTouched = new Set();
  renderAttendance();
};

window.toggleAttStatus = function(uid) {
  const cur = attStatus[uid] || 'present';
  attStatus[uid] = cur === 'present' ? 'absent' : cur === 'absent' ? 'none' : 'present';
  window.attTouched.add(uid);
  attAutoSave(uid);
  const chip = document.getElementById('att-chip-' + uid);
  if (!chip) return;
  applyChipStyle(chip, attStatus[uid]);
  renderAttReasons();
  updateAttSummary();
  // 결석으로 바뀌면 사유 칸에 바로 입력할 수 있게
  if (attStatus[uid] === 'absent') {
    const inp = document.getElementById('att-reason-' + uid);
    if (inp) { inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
};

window.setAttReason = function(uid, val) {
  attReasonMap()[uid] = val;
  updateAttSummary();
  attAutoSave(uid);
};

// 출결 체크 아래 「결석 사유」 칸 — 결석(빨간색)인 학생만 나옴
window.renderAttReasons = function() {
  const box = document.getElementById('attReasonBox');
  if (!box) return;
  const dayName = DAY_NAMES[attCurrentDate.getDay()];
  const branchFilter = document.getElementById('attBranchFilter')?.value || '';
  const absMap = attCurAbsMap();
  const absent = studentsCache.filter(s =>
    (s.days || []).includes(dayName) &&
    (!branchFilter || s.branch === branchFilter) &&
    attStatus[s.id] === 'absent'
  );
  if (!absent.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const rm = attReasonMap();
  const branches = [...new Set(absent.map(s => s.branch))].sort();
  const bc = (b) => b === '산본관' ? '#C99A0A' : '#5B3FA6';
  let html = `<div style="font-size:14px;font-weight:800;color:#C62828;margin-bottom:10px;">📝 결석 사유 (${absent.length}명)</div>`;
  branches.forEach(branch => {
    const list = absent.filter(s => s.branch === branch);
    html += `<div style="font-size:12px;font-weight:800;color:${bc(branch)};margin:8px 0 6px;">🏫 ${attEsc(branch || '')} (${list.length}명)</div>`;
    list.forEach(s => {
      const a = absMap[s.id];
      html += `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border:1px solid rgba(239,68,68,0.3);background:#FFF5F5;border-radius:10px;margin-bottom:6px;">
        <div style="min-width:120px;">
          <b style="font-size:13px;color:#B91C1C;">${attEsc(s.name)}</b>
          <span style="font-size:11px;color:var(--muted);margin-left:4px;">${attEsc(s.grade || '')}${s.classGroup ? ' · ' + attEsc(s.classGroup) : ''}</span>
        </div>
        <div style="flex:1;min-width:200px;">
        ${a
          ? `<div style="font-size:12.5px;color:#1E1838;margin-bottom:6px;"><span style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;background:#fff;color:#C8541F;border:1px solid #F0B9A0;margin-right:6px;">${a.source === 'phone' ? '📞 전화 접수' : '📱 학부모 사유서'}</span><b>${attEsc(a.reason || '')}</b>${a.detail ? ' — ' + attEsc(a.detail) : ''}${(a.source !== 'phone' && !a.verified) ? `<div style="margin-top:6px;padding:6px 10px;border:1.5px solid #E8A33D;background:#FFF8E8;border-radius:8px;font-size:12px;color:#B26A00;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">⚠ 학부모가 앱으로 입력한 결석입니다 — 사실인지 확인해 주세요<button type="button" onclick="absVerify('${a.id}')" style="margin-left:auto;background:#2E9E5B;color:#fff;border:0;border-radius:6px;padding:3px 10px;font-size:12px;font-family:inherit;cursor:pointer;">✓ 확인 완료</button></div>` : (a.source !== 'phone' ? '<span style="font-size:11px;color:#2E9E5B;font-weight:700;margin-left:6px;">✓ 관리부 확인</span>' : '')}</div>`
          : ''}
          <input id="att-reason-${s.id}" type="text" value="${attEsc(rm[s.id] || '')}" placeholder="결석 사유를 입력하세요 (예: 감기, 가족 행사, 학교 행사)"
              oninput="setAttReason('${s.id}', this.value)" maxlength="200"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(30,24,56,0.18);border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:#1E1838;outline:none;">
        </div>
      </div>`;
    });
  });
  box.innerHTML = html;
  box.style.display = 'block';
};

// 반 정렬용: 학년 순서(초→중→고) 기준, 미배정은 맨 뒤
const ATT_GRADE_ORDER = ['초4','초5','초6','중1','중2','중3','고1','고2','고3','N수'];
function attClassGradeRank(arr) {
  const idxs = arr.map(s => {
    const i = ATT_GRADE_ORDER.indexOf(s.grade);
    return i === -1 ? ATT_GRADE_ORDER.length : i;
  });
  return Math.min(...idxs);
}
function attSortClassKeys(byClass) {
  return Object.keys(byClass).sort((a, b) => {
    const aUn = a.includes('반 미배정'), bUn = b.includes('반 미배정');
    if (aUn !== bUn) return aUn ? 1 : -1;
    const rankDiff = attClassGradeRank(byClass[a]) - attClassGradeRank(byClass[b]);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, 'ko');
  });
}

function attChipColors(status) {
  if (status === 'absent') return { bg:'#EF4444', bdr:'#B91C1C', text:'#fff', sub:'rgba(255,255,255,0.85)', title:'결석 → 클릭:해당없음' };
  if (status === 'none')   return { bg:'#FFFFFF', bdr:'#8A8699', text:'#555', sub:'#888',                   title:'해당없음 → 클릭:출석' };
  /* present */             return { bg:'#3B82F6', bdr:'#1D4ED8', text:'#fff', sub:'rgba(255,255,255,0.85)', title:'출석 → 클릭:결석' };
}

function applyChipStyle(chip, status) {
  const c = attChipColors(status);
  chip.style.background  = c.bg;
  chip.style.borderColor = c.bdr;
  chip.title             = c.title;
  const spans = chip.querySelectorAll('span');
  if (spans[0]) spans[0].style.color = c.text;
  if (spans[1]) spans[1].style.color = c.sub;
}

window.renderAttendance = function() {
  const dow     = attCurrentDate.getDay();
  const dayName = DAY_NAMES[dow];
  const dateStr = attCurrentDate.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
  const attTodayLabelEl = document.getElementById('attTodayLabel'); if (attTodayLabelEl) attTodayLabelEl.textContent = `${dateStr} (${dayName}요일)`;

  const branchFilter = document.getElementById('attBranchFilter')?.value || '';
  const el    = document.getElementById('attStudentList');
  const dlBtn = document.getElementById('attDownloadBtn');

  const filtered = studentsCache.filter(s =>
    (s.days || []).includes(dayName) &&
    (!branchFilter || s.branch === branchFilter)
  );

  if (!filtered.length) {
    el.innerHTML = `<div style="color:var(--muted);padding:12px 0;">${dayName}요일 등원 예정 학생이 없습니다.</div>`;
    document.getElementById('attSummary').innerHTML = '';
    if (dlBtn) dlBtn.style.display = 'none';
    return;
  }

  // 결석 사유서(학부모 앱 제출 · 전화 접수)가 있는 날은 자동 결석 — absences.js
  const attDateKey = toLocalDateStr(attCurrentDate);
  if (window.attAbsDate !== attDateKey) {
    window.attAbsDate = attDateKey; window.attAbsApplied = {};
    if (typeof absLoad === 'function') absLoad().then(() => { if (window.attAbsDate === attDateKey) renderAttendance(); });
    attLoadSaved(attDateKey);   // 저장해 둔 출결·사유 자동 불러오기
  }
  const attAbsMap = typeof absMapFor === 'function' ? absMapFor(attDateKey) : {};
  filtered.forEach(s => {
    const a = attAbsMap[s.id];
    if (a && !window.attAbsApplied[s.id]) {
      attStatus[s.id] = 'absent'; window.attAbsApplied[s.id] = true;
      // 사유는 자동 입력하지 않음 — 관리부가 아래 결석 사유 칸에 직접 입력
      // 관리부가 확인한 사유서(전화 접수 포함)는 출결 기록(결석)에도 저장 — 이전에 확인한 것도 화면을 열면 채워짐
      if (a.source === 'phone' || a.verified) attAutoSave(s.id, true);
    }
  });

  // 새 학생은 기본 출석으로 초기화
  filtered.forEach(s => { if (!attStatus[s.id]) attStatus[s.id] = 'present'; });

  // 학년 그룹 순서
  const gradeOrder = ['초4','초5','초6','중1','중2','중3','고1','고2','고3','N수'];

  // 관별 → 학년별 그룹핑
  const branches = branchFilter
    ? [branchFilter]
    : [...new Set(filtered.map(s => s.branch))].sort();

  let html = '';
  branches.forEach(branch => {
    const bStudents = filtered.filter(s => s.branch === branch);
    if (!bStudents.length) return;

    // 반별 그룹 (classGroup 미배정 학생은 학년으로 표시)
    const byClass = {};
    bStudents.forEach(s => {
      const c = s.classGroup || `${s.grade || '기타'} (반 미배정)`;
      if (!byClass[c]) byClass[c] = [];
      byClass[c].push(s);
    });
    // 반 정렬: 학년 순서(초→중→고) 기준, 단 "반 미배정"은 맨 뒤로
    const sortedClasses = attSortClassKeys(byClass);

    html += `<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:#6B4FBB;letter-spacing:1px;
        padding:6px 10px;background:rgba(167,139,250,0.1);border-radius:6px;margin-bottom:10px;">
        🏫 ${branch} (${bStudents.length}명)
      </div>`;

    sortedClasses.forEach(cls => {
      const cStudents = byClass[cls];
      html += `<div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--purple, #5B3FA6);font-weight:700;letter-spacing:1px;
          margin-bottom:6px;padding-left:4px;">${cls} (${cStudents.length}명)</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">`;

      cStudents.forEach(s => {
        const st  = attStatus[s.id] || 'present';
        const c   = attChipColors(st);
        html += `<div id="att-chip-${s.id}" onclick="toggleAttStatus('${s.id}')"
          title="${c.title}"
          style="display:flex;flex-direction:column;align-items:center;justify-content:center;
            min-width:72px;padding:7px 10px;border-radius:8px;cursor:pointer;
            background:${c.bg};border:2px solid ${c.bdr};
            transition:background 0.15s,border-color 0.15s;user-select:none;">
          <span style="font-size:13px;font-weight:700;color:${c.text};">${s.name}</span>
          <span style="font-size:10px;color:${c.sub};margin-top:2px;">${s.grade || ''}</span>
          ${attAbsMap[s.id] ? `<span title="${(attAbsMap[s.id].reason || '').replace(/"/g, '')} · ${attAbsMap[s.id].source === 'phone' ? '전화 접수' : '학부모 앱 제출'}" style="font-size:9.5px;font-weight:800;margin-top:3px;padding:1px 6px;border-radius:999px;background:#fff;color:#C8541F;border:1px solid #F0B9A0;">📝 ${attAbsMap[s.id].source === 'phone' ? '전화' : '사유서'}</span>` : ''}
        </div>`;
      });

      html += `</div></div>`;
    });
    html += `</div>`;
  });

  html += `<div id="attReasonBox" style="display:none;margin-top:6px;padding-top:14px;border-top:1px dashed rgba(239,68,68,0.35);"></div>`;
  el.innerHTML = html;
  if (dlBtn) dlBtn.style.display = 'inline-flex';
  renderAttReasons();
  updateAttSummary();
};

function updateAttSummary() {
  const sumEl = document.getElementById('attSummary');
  const dow     = attCurrentDate.getDay();
  const dayName = DAY_NAMES[dow];
  const branchFilter = document.getElementById('attBranchFilter')?.value || '';

  const filtered = studentsCache.filter(s =>
    (s.days || []).includes(dayName) &&
    (!branchFilter || s.branch === branchFilter)
  );

  const total   = filtered.length;
  const absent  = filtered.filter(s => attStatus[s.id] === 'absent').length;
  const none    = filtered.filter(s => attStatus[s.id] === 'none').length;
  const present = total - absent - none;

  const absMap = attCurAbsMap();
  const absentList = filtered.filter(s => attStatus[s.id] === 'absent');
  const absentNames = absentList.map(s => attEsc(s.name)).join(', ');
  const noReason = absentList.filter(s => !attReasonOf(s, absMap)).length;

  sumEl.innerHTML = `
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
      <div style="font-size:18px;font-weight:700;color:var(--purple, #5B3FA6);">총 ${total}명</div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="width:12px;height:12px;border-radius:2px;background:#3B82F6;display:inline-block;"></span>
        <span style="font-size:14px;font-weight:600;color:#2F7FD6;">출석 ${present}명</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="width:12px;height:12px;border-radius:2px;background:#EF4444;display:inline-block;"></span>
        <span style="font-size:14px;font-weight:600;color:#C62828;">결석 ${absent}명</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="width:12px;height:12px;border-radius:2px;background:#fff;border:1px solid #8A8699;display:inline-block;"></span>
        <span style="font-size:14px;font-weight:600;color:var(--muted);">해당없음 ${none}명</span>
      </div>
    </div>
    ${absentList.length ? `<div style="font-size:12px;color:#C62828;margin-bottom:6px;">결석: ${absentNames}</div>
      <div style="display:flex;flex-direction:column;gap:3px;">
        ${absentList.map(s => { const r = attReasonOf(s, absMap); return `<div style="font-size:12.5px;color:#1E1838;">• <b>${attEsc(s.name)}</b> <span style="color:var(--muted);">${attEsc(s.grade || '')}</span> — ${r ? attEsc(r) : '<span style="color:#D64545;">사유 미입력</span>'}</div>`; }).join('')}
      </div>
      ${noReason ? `<div style="font-size:11.5px;color:#D64545;margin-top:6px;">⚠ 사유를 입력하지 않은 결석 학생 ${noReason}명</div>` : ''}` : ''}`;
}

// 출결 이미지 다운로드
window.downloadAttendanceImage = function() {
  const dow     = attCurrentDate.getDay();
  const dayName = DAY_NAMES[dow];
  const dateStr = attCurrentDate.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
  const branchFilter = document.getElementById('attBranchFilter')?.value || '';

  const filtered = studentsCache.filter(s =>
    (s.days || []).includes(dayName) &&
    (!branchFilter || s.branch === branchFilter) &&
    attStatus[s.id] !== 'none'   // 해당없음 제외
  );
  if (!filtered.length) return;

  const gradeOrder = ['초4','초5','초6','중1','중2','중3','고1','고2','고3','N수'];
  const branches = branchFilter
    ? [branchFilter]
    : [...new Set(filtered.map(s => s.branch))].sort();

  // 레이아웃 계산
  const CW = 900, PAD = 36, CHIP_W = 84, CHIP_H = 52, GAP = 8;
  const cols = Math.floor((CW - PAD * 2 + GAP) / (CHIP_W + GAP));

  // 필요한 높이 미리 계산
  let totalH = 80; // 제목
  branches.forEach(branch => {
    const bStudents = filtered.filter(s => s.branch === branch);
    totalH += 40; // 관 헤더
    const byClass = {};
    bStudents.forEach(s => { const c = s.classGroup || `${s.grade||'기타'} (반 미배정)`; if(!byClass[c]) byClass[c]=[]; byClass[c].push(s); });
    Object.values(byClass).forEach(arr => {
      totalH += 26; // 반 헤더
      totalH += Math.ceil(arr.length / cols) * (CHIP_H + GAP) + 12;
    });
  });
  totalH += 60; // 요약 + 여백
  const imgAbsMap = attCurAbsMap();
  const imgAbsent = filtered.filter(s => attStatus[s.id] === 'absent');
  if (imgAbsent.length) totalH += 24 + imgAbsent.length * 20; // 결석 사유 줄

  const canvas = document.getElementById('attCanvas');
  canvas.width = CW; canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CW, totalH);

  // 제목
  ctx.fillStyle = '#111';
  ctx.font = 'bold 22px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${dateStr} (${dayName}요일) 출결 현황${branchFilter ? ' — ' + branchFilter : ''}`, CW/2, 44);
  ctx.textAlign = 'left';

  let y = 66;

  branches.forEach(branch => {
    const bStudents = filtered.filter(s => s.branch === branch);
    if (!bStudents.length) return;

    // 관 헤더
    ctx.fillStyle = '#EDE9FE';
    ctx.fillRect(PAD, y, CW - PAD*2, 26);
    ctx.fillStyle = '#5B21B6';
    ctx.font = 'bold 13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.fillText(`🏫 ${branch} (${bStudents.length}명)`, PAD + 10, y + 18);
    y += 34;

    const byClass = {};
    bStudents.forEach(s => { const c = s.classGroup || `${s.grade||'기타'} (반 미배정)`; if(!byClass[c]) byClass[c]=[]; byClass[c].push(s); });
    const sortedClasses = attSortClassKeys(byClass);

    sortedClasses.forEach(cls => {
      const arr = byClass[cls];
      ctx.fillStyle = '#B45309';
      ctx.font = 'bold 12px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      ctx.fillText(`${cls} (${arr.length}명)`, PAD + 4, y + 14);
      y += 22;

      arr.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = PAD + col * (CHIP_W + GAP);
        const cy = y + row * (CHIP_H + GAP);
        const st = attStatus[s.id] || 'present';

        // 칩 배경
        const bgMap = { present:'#3B82F6', absent:'#EF4444', none:'#FFFFFF' };
        ctx.fillStyle = bgMap[st] || '#3B82F6';
        roundRect(ctx, cx, cy, CHIP_W, CHIP_H, 7);
        ctx.fill();
        // 테두리 (해당없음)
        if (st === 'none') {
          ctx.strokeStyle = '#8A8699'; ctx.lineWidth = 1;
          roundRect(ctx, cx, cy, CHIP_W, CHIP_H, 7);
          ctx.stroke();
        }

        // 이름
        ctx.fillStyle = st === 'none' ? '#555555' : '#FFFFFF';
        ctx.font = 'bold 13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, cx + CHIP_W/2, cy + 22, CHIP_W - 8);
        // 학년
        ctx.font = '10px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
        ctx.fillStyle = st === 'none' ? '#888888' : 'rgba(255,255,255,0.88)';
        ctx.fillText(s.grade || '', cx + CHIP_W/2, cy + 37, CHIP_W - 8);
        ctx.textAlign = 'left';
      });

      y += Math.ceil(arr.length / cols) * (CHIP_H + GAP) + 8;
    });
  });

  const total   = filtered.length;
  const absent  = filtered.filter(s => attStatus[s.id] === 'absent').length;
  const none    = filtered.filter(s => attStatus[s.id] === 'none').length;
  const present = total - absent - none;
  y += 8;
  ctx.fillStyle = '#333';
  ctx.font = '13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`총 ${total}명 · 출석 ${present}명 · 결석 ${absent}명 · 해당없음 ${none}명`, PAD, y + 16);
  if (imgAbsent.length) {
    ctx.fillStyle = '#DC2626';
    ctx.font = 'bold 13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.fillText(`결석 사유 (${imgAbsent.length}명)`, PAD, y + 40);
    ctx.font = '13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    imgAbsent.forEach((s, i) => {
      const r = attReasonOf(s, imgAbsMap) || '사유 미입력';
      ctx.fillStyle = '#333';
      ctx.fillText(`• ${s.name} (${s.grade || ''}${branchFilter ? '' : ' · ' + (s.branch || '')}) — ${r}`, PAD, y + 62 + i * 20, CW - PAD * 2);
    });
  }

  const link = document.createElement('a');
  const dateTag = toLocalDateStr(attCurrentDate).replace(/-/g,'');
  link.download = `출결_${branchFilter||'전체'}_${dateTag}_${dayName}요일.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  if (typeof recordClosing === 'function') recordClosing('att', canvas);   // 마감 기록 + 원장 페이지로 이미지 제출
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x, y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

