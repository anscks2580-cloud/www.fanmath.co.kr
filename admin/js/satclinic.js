'use strict';
/* ═══════════════════════════════════════════════════════════
   토요 추가클리닉
   (admin.html에서 분리 — 원본 6677~6818줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 토요 추가클리닉 (관리자)
// ══════════════════════════════════════════
let satClinicData = [];

window.initSatClinicTab = function() {
  // 날짜 기본값: 이번 주 토요일
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=일 6=토
  const diffToSat = (6 - dayOfWeek + 7) % 7 || 7;
  const sat = new Date(today);
  sat.setDate(today.getDate() - ((dayOfWeek === 6) ? 0 : (dayOfWeek === 0 ? 1 : dayOfWeek)));
  // 가장 최근 토요일
  const lastSat = new Date(today);
  lastSat.setDate(today.getDate() - ((dayOfWeek + 1) % 7));

  const toStr = d => d.toISOString().split('T')[0];
  const fromInput = document.getElementById('clinicDateFrom');
  const toInput   = document.getElementById('clinicDateTo');
  if (!fromInput.value) fromInput.value = toStr(lastSat);
  if (!toInput.value)   toInput.value   = toStr(today);

  // 선생님 필터 드롭다운 채우기
  const sel = document.getElementById('clinicTeacherFilter');
  if (sel.options.length <= 1 && teachingTeachers().length > 0) {
    teachingTeachers().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }
};

window.loadSatClinicAdmin = async function() {
  const fromVal = document.getElementById('clinicDateFrom').value;
  const toVal   = document.getElementById('clinicDateTo').value;
  const tUid    = document.getElementById('clinicTeacherFilter').value;
  const msgEl   = document.getElementById('clinicAdminMsg');
  const resEl   = document.getElementById('clinicAdminResult');

  if (!fromVal || !toVal) { showMsg('clinicAdminMsg', '날짜 범위를 선택해주세요.', 'error'); return; }
  showMsg('clinicAdminMsg', '조회 중...', 'success');
  resEl.innerHTML = '';

  try {
    let q = query(
      collection(db, 'satClinicReports'),
      where('date', '>=', fromVal),
      where('date', '<=', toVal),
      orderBy('date', 'asc')
    );
    const snap = await getDocs(q);

    satClinicData = [];
    snap.forEach(d => {
      const r = d.data();
      if (tUid && r.teacherUid !== tUid) return;
      satClinicData.push({ id: d.id, ...r });
    });

    if (satClinicData.length === 0) {
      showMsg('clinicAdminMsg', '해당 기간에 제출된 토요클리닉이 없습니다.', 'error');
      document.getElementById('clinicExcelBtn').style.display = 'none';
      return;
    }

    // 선생님별 그룹핑
    const byTeacher = {};
    satClinicData.forEach(r => {
      if (!byTeacher[r.teacherName]) byTeacher[r.teacherName] = [];
      byTeacher[r.teacherName].push(r);
    });

    resEl.innerHTML = Object.entries(byTeacher).map(([tName, rows]) => `
      <div class="card" style="margin-bottom:16px;">
        <h4 style="color:var(--purple, #5B3FA6);margin-bottom:14px;font-size:14px;">👩‍🏫 ${tName} (${rows.length}건)</h4>
        <div style="overflow-x:auto;">
          <table class="preview-table" style="width:100%;min-width:600px;">
            <thead><tr>
              <th>날짜</th><th>학생명</th><th>시간</th><th>지참교재</th><th>클리닉 내용</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td>${r.date}</td>
                <td style="font-weight:600;">${r.studentName}</td>
                <td>${r.time}</td>
                <td>${r.book}</td>
                <td style="max-width:300px;white-space:pre-wrap;">${r.content}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');

    showMsg('clinicAdminMsg', `✅ 총 ${satClinicData.length}건 조회 완료`, 'success');
    document.getElementById('clinicExcelBtn').style.display = 'inline-flex';
  } catch(e) {
    showMsg('clinicAdminMsg', '오류: ' + e.message, 'error');
  }
};

window.downloadClinicExcel = function() {
  if (!satClinicData.length) return;

  const fromVal = document.getElementById('clinicDateFrom').value;
  const toVal   = document.getElementById('clinicDateTo').value;

  const rows = satClinicData.map(r => ({
    날짜:       r.date,
    선생님:     r.teacherName,
    학생명:     r.studentName,
    시간:       r.time,
    지참교재:   r.book,
    클리닉내용: r.content,
    제출일시:   r.submittedAt?.toDate?.()?.toLocaleDateString('ko-KR') || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['날짜','선생님','학생명','시간','지참교재','클리닉내용','제출일시']
  });
  ws['!cols'] = [
    {wch:12},{wch:10},{wch:8},{wch:16},{wch:20},{wch:50},{wch:12}
  ];

  // 헤더 스타일
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = XLSX.utils.encode_cell({r:0, c});
    if (!ws[cell]) continue;
    ws[cell].s = {
      font: { bold: true, color: { rgb: '1A1230' } },
      fill: { fgColor: { rgb: 'F0C040' } },
      alignment: { horizontal: 'center' }
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '토요클리닉');
  XLSX.writeFile(wb, `토요클리닉_${fromVal}_${toVal}.xlsx`);
};

