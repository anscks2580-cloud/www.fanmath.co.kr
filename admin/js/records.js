'use strict';
/* ═══════════════════════════════════════════════════════════
   기록 조회
   (admin.html에서 분리 — 원본 8310~8509줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 기록 조회 탭
// ══════════════════════════════════════════
let recCurrentDoc = null; // { id, type, data }

window.initRecordsTab = function() {
  // 이번 달 기본값
  const ym = new Date().toISOString().slice(0,7);
  if (!document.getElementById('rec-month').value)
    document.getElementById('rec-month').value = ym;
  loadRecords();
};

window.loadRecords = async function() {
  const type   = document.getElementById('rec-type').value;
  const branch = document.getElementById('rec-branch').value;
  const month  = document.getElementById('rec-month').value; // "2026-06"
  const el     = document.getElementById('rec-list');
  el.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  document.getElementById('rec-detail').style.display = 'none';

  try {
    const snap = await getDocs(collection(db, 'dailyDrafts'));
    let docs = [];
    snap.forEach(d => {
      const id = d.id;
      // prefix 매칭: dr_ / wl_ / att_
      if (!id.startsWith(type + '_')) return;
      // 관 필터
      if (branch && !id.includes(`_${branch}_`)) return;
      // 월 필터
      if (month && !id.includes(month)) return;
      docs.push({ id, data: d.data() });
    });

    // 날짜 최신순 정렬
    docs.sort((a,b) => b.id.localeCompare(a.id));

    if (!docs.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">저장된 기록이 없습니다.</div>';
      return;
    }

    const typeLabel = { dr:'관리부 마감', wl:'주간업무일지', att:'학생 출결' };
    el.innerHTML = docs.map(d => {
      const savedAt = d.data.savedAt
        ? new Date(d.data.savedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
        : '';
      // 키에서 날짜/관 파싱: dr_평촌관_2026-06-24
      const parts = d.id.split('_');
      const branchLabel = parts[1] || '';
      const dateLabel   = parts.slice(2).join('-');

      return `<div class="student-item" style="cursor:pointer;" onclick="recSelect('${d.id}')">
        <div class="student-name" style="font-size:13px;">${dateLabel}</div>
        <span class="student-meta" style="color:var(--purple, #5B3FA6);">${branchLabel}</span>
        <span class="student-meta">${typeLabel[type]}</span>
        <span class="student-meta" style="font-size:11px;color:var(--muted);">저장: ${savedAt}</span>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${e.message}</div>`;
  }
};

window.recSelect = async function(docId) {
  try {
    const snap = await getDoc(doc(db, 'dailyDrafts', docId));
    if (!snap.exists()) return;
    const data = snap.data();
    const type = document.getElementById('rec-type').value;
    recCurrentDoc = { id: docId, type, data };

    // 상세 보기 렌더
    const parts = docId.split('_');
    const branchLabel = parts[1] || '';
    const dateLabel   = parts.slice(2).join('-');
    const typeLabel   = { dr:'관리부 마감', wl:'주간업무일지', att:'학생 출결' };
    document.getElementById('rec-detail-title').textContent =
      `${typeLabel[type]} — ${branchLabel} ${dateLabel}`;

    document.getElementById('rec-detail-body').innerHTML = recRenderDetail(type, data);
    document.getElementById('rec-detail').style.display = 'block';
    document.getElementById('rec-detail').scrollIntoView({ behavior:'smooth', block:'start' });
  } catch(e) {
    alert('불러오기 오류: ' + e.message);
  }
};

function recRenderDetail(type, d) {
  if (type === 'dr') {
    const fields = [
      ['날짜', d.date], ['관', d.branch], ['작성자', d.author],
      ['금일 수업 반', d.classes], ['상담 및 테스트', d.consult],
      ['현금영수증 발행', d.receipt], ['출결(결석자)', d.absent],
      ['교재 입출고', d.textbook], ['비고(신규/퇴원)', d.note],
      ['전화문의', d.phone], ['익일 상담 및 신규원생', d.nextday],
    ];
    return `<table style="width:100%;border-collapse:collapse;">` +
      fields.map(([k,v]) => `
        <tr style="border-bottom:1px solid rgba(30,24,56,0.06);">
          <td style="padding:6px 12px;color:var(--purple, #5B3FA6);font-weight:600;width:140px;font-size:12px;">${k}</td>
          <td style="padding:6px 12px;color:var(--off-white);font-size:13px;white-space:pre-wrap;">${v || '-'}</td>
        </tr>`).join('') + `</table>`;
  }
  if (type === 'wl') {
    const secLabels = { new:'신입생', leave:'퇴원생', pause:'휴원생', upcoming:'신규등원예정', cash:'현금입금내역', consult:'상담' };
    const WL_COLS_local = {
      new:['이름','학년','학교','담당T','반배정'], leave:['이름','학년','학교','담당T','반배정'],
      pause:['이름','학년','학교','담당T','반배정'], upcoming:['이름','학년','학교','담당T','반배정'],
      cash:['이름/발행일','수납처리','현금영수증','금액','번호'], consult:['이름','학년','학교','상담자','반배정'],
    };
    const flat = d.flat || {};
    let html = `<div style="margin-bottom:8px;font-size:12px;color:var(--muted);">${d.branch} / ${d.from} ~ ${d.to}</div>`;
    Object.entries(secLabels).forEach(([sec, label]) => {
      const count = flat[`${sec}__count`] || 0;
      const rows = [];
      for (let ri=0; ri<count; ri++) {
        const cols = WL_COLS_local[sec] || [];
        const row = cols.map((_,ci) => flat[`${sec}_${ri}_${ci}`] || '');
        if (row.some(v=>v)) rows.push(row);
      }
      if (!rows.length) return;
      html += `<div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--purple, #5B3FA6);margin-bottom:6px;">${label}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr>${(WL_COLS_local[sec]||[]).map(c=>`<th style="padding:5px 8px;background:rgba(245,197,24,0.1);color:var(--purple, #5B3FA6);text-align:left;border-bottom:1px solid rgba(30,24,56,0.1);">${c}</th>`).join('')}</tr>
          ${rows.map(row=>`<tr>${row.map(v=>`<td style="padding:5px 8px;border-bottom:1px solid rgba(30,24,56,0.05);color:var(--off-white);">${v||'-'}</td>`).join('')}</tr>`).join('')}
        </table></div>`;
    });
    if (d.consultNote) html += `<div style="font-size:12px;"><span style="color:var(--purple, #5B3FA6);font-weight:600;">상담요형처리:</span> ${d.consultNote}</div>`;
    if (d.textbook)    html += `<div style="font-size:12px;margin-top:8px;"><span style="color:var(--purple, #5B3FA6);font-weight:600;">교재입출고:</span><br><span style="white-space:pre-wrap;">${d.textbook}</span></div>`;
    return html;
  }
  if (type === 'att') {
    const status = d.status || {};
    const present = Object.values(status).filter(v=>v==='present').length;
    const absent  = Object.values(status).filter(v=>v==='absent').length;
    const absentNames = studentsCache.filter(s=>status[s.id]==='absent').map(s=>s.name).join(', ');
    return `
      <div style="display:flex;gap:20px;margin-bottom:12px;">
        <span style="font-size:15px;font-weight:700;color:var(--purple, #5B3FA6);">${d.date} (${d.branch||'전체'})</span>
        <span style="color:#2F7FD6;">출석 ${present}명</span>
        <span style="color:#C62828;">결석 ${absent}명</span>
      </div>
      ${absentNames ? `<div style="font-size:13px;color:#C62828;">결석: ${absentNames}</div>` : ''}`;
  }
  return JSON.stringify(d, null, 2);
}

// 해당 탭에서 열기
window.recLoadToTab = function() {
  if (!recCurrentDoc) return;
  const { type, data } = recCurrentDoc;
  if (type === 'dr') {
    switchTab('dailyreport', document.querySelector('[onclick*="dailyreport"]'));
    initDailyReportTab();
    setTimeout(() => { setDrData(data); }, 200);
  }
  if (type === 'wl') {
    switchTab('weeklylog', document.querySelector('[onclick*="weeklylog"]'));
    initWeeklyLogTab();
    setTimeout(() => { setWlData(data); }, 200);
  }
  if (type === 'att') {
    switchTab('attendance', document.querySelector('[onclick*="attendance"]'));
    initAttendanceTab();
    setTimeout(() => { setAttData(data); }, 200);
  }
};

// 이미지 저장 (해당 탭 다운로드 함수 호출)
window.recDownloadImage = function() {
  if (!recCurrentDoc) return;
  const { type, data } = recCurrentDoc;
  if (type === 'dr') {
    const canvas = document.getElementById('drCanvas');
    drawDailyReport(canvas, getDRValues());
    const link = document.createElement('a');
    link.download = `관리부마감_${data.branch||''}_${data.date||''}.png`;
    link.href = canvas.toDataURL('image/png'); link.click();
  }
  if (type === 'att') downloadAttendanceImage();
  if (type === 'wl') downloadWeeklyLog();
};

// 삭제
window.recDelete = async function() {
  if (!recCurrentDoc) return;
  if (!confirm('이 기록을 삭제하시겠습니까?')) return;
  try {
    await deleteDoc(doc(db, 'dailyDrafts', recCurrentDoc.id));
    document.getElementById('rec-detail').style.display = 'none';
    recCurrentDoc = null;
    loadRecords();
  } catch(e) {
    alert('삭제 오류: ' + e.message);
  }
};

