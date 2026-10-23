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
  renderAttendance();
  loadDailyCode();
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
  renderAttendance();
};

window.resetAttDay = function() {
  attCurrentDate = new Date();
  attStatus = {};
  renderAttendance();
};

window.toggleAttStatus = function(uid) {
  const cur = attStatus[uid] || 'present';
  attStatus[uid] = cur === 'present' ? 'absent' : cur === 'absent' ? 'none' : 'present';
  const chip = document.getElementById('att-chip-' + uid);
  if (!chip) return;
  applyChipStyle(chip, attStatus[uid]);
  updateAttSummary();
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
        </div>`;
      });

      html += `</div></div>`;
    });
    html += `</div>`;
  });

  el.innerHTML = html;
  if (dlBtn) dlBtn.style.display = 'inline-flex';
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

  const absentNames = filtered
    .filter(s => attStatus[s.id] === 'absent')
    .map(s => s.name)
    .join(', ');

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
    ${absentNames ? `<div style="font-size:12px;color:#C62828;">결석: ${absentNames}</div>` : ''}`;
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
  const absentNames = filtered.filter(s => attStatus[s.id]==='absent').map(s=>s.name).join(', ');
  if (absentNames) {
    ctx.fillStyle = '#DC2626';
    ctx.fillText(`결석: ${absentNames}`, PAD, y + 34);
  }

  const link = document.createElement('a');
  const dateTag = toLocalDateStr(attCurrentDate).replace(/-/g,'');
  link.download = `출결_${branchFilter||'전체'}_${dateTag}_${dayName}요일.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  if (typeof recordClosing === 'function') recordClosing('att');   // 원장 페이지용 마감 기록
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

