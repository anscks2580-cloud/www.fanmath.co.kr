'use strict';
/* ═══════════════════════════════════════════════════════════
   반 배정
   (admin.html에서 분리 — 원본 3591~3719줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 반 배정 탭
// ══════════════════════════════════════════
let classAssignData = [];

window.initClassAssignTab = function() {
  // 드래그앤드롭 설정
  const drop = document.getElementById('classAssignDrop');
  const input = document.getElementById('classAssignInput');
  if (!drop || !input) return;
  input.onchange = e => parseClassAssignExcel(e.target.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); parseClassAssignExcel(e.dataTransfer.files[0]); };
};

// 현재 학생 목록 → 엑셀 내보내기 (반 컬럼 포함)
window.exportStudentsForClassAssign = () => {
  if (!studentsCache.length) { alert('등록된 학생이 없습니다.'); return; }

  const rows = studentsCache.map(s => [
    s.name || '',
    s.grade || '',
    s.branch || '',
    s.teacherName || '',
    (s.days || []).join(''),
    s.classGroup || '',   // ← 이미 있으면 채워서 내보내기
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    ['이름', '학년', '관할', '담당선생님', '요일', '반'],
    ...rows
  ]);
  ws['!cols'] = [{wch:10},{wch:6},{wch:8},{wch:10},{wch:8},{wch:20}];

  // 헤더 스타일
  ['A1','B1','C1','D1','E1','F1'].forEach(addr => {
    if (!ws[addr]) return;
    ws[addr].s = {
      font: { bold: true, color: { rgb: '1A1230' } },
      fill: { fgColor: { rgb: 'F0C040' } },
      alignment: { horizontal: 'center' }
    };
  });
  // 반 컬럼 강조 (F열)
  ws['F1'].s = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: 'E05050' } },
    alignment: { horizontal: 'center' }
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '학생반배정');
  XLSX.writeFile(wb, `학생반배정_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// 업로드된 엑셀 파싱
function parseClassAssignExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 헤더 제거, 이름 기준으로 studentsCache 매칭
    classAssignData = rows.slice(1).filter(r => r[0]).map(r => {
      const name       = String(r[0] || '').trim();
      const classGroup = String(r[5] || '').trim();
      const matched    = studentsCache.filter(s => s.name === name);
      return { name, classGroup, matched };
    });

    const total    = classAssignData.length;
    const ok       = classAssignData.filter(r => r.matched.length === 1).length;
    const multi    = classAssignData.filter(r => r.matched.length > 1).length;
    const notFound = classAssignData.filter(r => r.matched.length === 0).length;

    document.getElementById('classAssignCount').textContent =
      `총 ${total}명 — 매칭 성공 ${ok}명 / 동명이인 ${multi}명 / 미매칭 ${notFound}명`;

    document.getElementById('classAssignTable').innerHTML = `
      <tr>
        <th>이름</th><th>배정할 반</th><th>매칭 결과</th>
      </tr>
      ${classAssignData.map(r => {
        const status = r.matched.length === 1
          ? '<span style="color:#90ff90;">✅ 매칭</span>'
          : r.matched.length > 1
          ? `<span style="color:#ffd060;">⚠️ 동명이인 ${r.matched.length}명</span>`
          : '<span style="color:#ff9090;">❌ 미매칭</span>';
        const cls = r.classGroup
          ? `<span style="color:var(--gold);font-weight:600;">${r.classGroup}</span>`
          : '<span style="color:var(--muted);">-</span>';
        return `<tr><td>${r.name}</td><td>${cls}</td><td>${status}</td></tr>`;
      }).join('')}`;

    document.getElementById('classAssignPreview').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
}

// Firestore에 반 정보 일괄 업데이트
window.uploadClassAssign = async () => {
  const toUpdate = classAssignData.filter(r => r.matched.length === 1 && r.classGroup);
  if (!toUpdate.length) {
    showMsg('classAssignMsg', '업데이트할 데이터가 없습니다. (매칭된 학생 & 반 입력 필요)', 'error');
    return;
  }

  const btn = document.querySelector('#tab-classassign .btn-primary');
  btn.disabled = true; btn.textContent = '저장 중...';

  let ok = 0, fail = 0;
  for (const row of toUpdate) {
    try {
      await updateDoc(doc(db, 'students', row.matched[0].id), { classGroup: row.classGroup });
      ok++;
    } catch(e) {
      fail++;
      console.warn('업데이트 실패:', row.name, e.message);
    }
  }

  btn.disabled = false; btn.textContent = '반 정보 일괄 저장';
  showMsg('classAssignMsg', `✅ ${ok}명 반 정보 저장 완료${fail ? ` / 실패 ${fail}명` : ''}`, ok > 0 ? 'success' : 'error');
  await loadStudents();
};

