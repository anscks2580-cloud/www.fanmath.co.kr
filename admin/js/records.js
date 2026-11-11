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
      ['전화문의', d.phone], ['출결(결석자)', d.absent],
      ['교재 입출고', d.textbook], ['비고(신규/퇴원)', d.note],
      ['현금영수증 발행', d.receipt], ['익일 상담 및 신규원생', d.nextday],
    ];
    return `<table style="width:100%;border-collapse:collapse;">` +
      fields.map(([k,v]) => `
        <tr style="border-bottom:1px solid rgba(30,24,56,0.06);">
          <td style="padding:6px 12px;color:var(--purple, #5B3FA6);font-weight:600;width:140px;font-size:12px;">${k}</td>
          <td style="padding:6px 12px;color:var(--off-white);font-size:13px;white-space:pre-wrap;">${v || '-'}</td>
        </tr>`).join('') + `</table>`;
  }
  if (type === 'wl') {
    const secLabels = { new:'신입생', leave:'퇴원생', pause:'휴원생', upcoming:'신규등원예정', cash:'현금입금내역', consult:'상담', textbook:'교재입출고' };
    const esc = (v) => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // 새 형식(texts) 우선, 예전 형식(칸 나눔 flat)은 한 줄씩 합쳐서 보여줌
    const texts = d.texts || (() => {
      const flat = d.flat || {}, t = {};
      ['new','leave','pause','upcoming','cash','consult'].forEach((sec) => {
        const count = flat[`${sec}__count`] || 0, out = [];
        for (let ri = 0; ri < count; ri++) {
          const row = [0,1,2,3,4].map((ci) => (flat[`${sec}_${ri}_${ci}`] || '').trim()).filter(Boolean);
          if (row.length) out.push(row.join(' '));
        }
        t[sec] = out.join('\n');
      });
      t.textbook = d.textbook || '';
      return t;
    })();
    let html = `<div style="margin-bottom:8px;font-size:12px;color:var(--muted);">${esc(d.branch)} / ${esc(d.from)} ~ ${esc(d.to)}</div>`;
    html += `<table style="width:100%;border-collapse:collapse;">` +
      Object.entries(secLabels).map(([k, label]) => `
        <tr style="border-bottom:1px solid rgba(30,24,56,0.06);">
          <td style="padding:6px 12px;color:var(--purple, #5B3FA6);font-weight:600;width:120px;font-size:12px;vertical-align:top;">${label}</td>
          <td style="padding:6px 12px;color:var(--off-white);font-size:13px;white-space:pre-wrap;">${esc(texts[k]) || '-'}</td>
        </tr>`).join('') + `</table>`;
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

