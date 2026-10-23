'use strict';
/* ═══════════════════════════════════════════════════════════
   일괄 진급
   (admin.html에서 분리 — 원본 7884~7988줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 일괄 진급 처리
// ══════════════════════════════════════════

const GRADE_UP = {
  '초4':'초5', '초5':'초6', '초6':'중1',
  '중1':'중2', '중2':'중3', '중3':'고1',
  '고1':'고2', '고2':'고3', '고3':'N수',
};

// 반 이름에서 학년 부분만 올리기: "중1-7A" → "중2-7A", "(중1)7-A" → "(중2)7-A"
function promoteClassGroup(classGroup, oldGrade, newGrade) {
  if (!classGroup || !oldGrade || !newGrade) return classGroup;
  // 정확히 oldGrade 문자열만 교체 (앞뒤 비단어 경계)
  return classGroup.replace(new RegExp(oldGrade.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'), newGrade);
}

let promoPreviewData = []; // 미리보기용 데이터 캐시

window.initPromotionTab = function() {
  promoPreviewData = [];
  document.getElementById('promo-preview-card').style.display = 'none';
  document.getElementById('promo-run-btn').style.display = 'none';
  document.getElementById('promo-msg').style.display = 'none';
};

window.previewPromotion = async function() {
  const branch = document.getElementById('promo-branch').value;
  const msgEl  = document.getElementById('promo-msg');
  msgEl.style.display = 'none';

  const targets = studentsCache.filter(s => {
    if (branch && s.branch !== branch) return false;
    return GRADE_UP[s.grade]; // N수는 GRADE_UP에 없으므로 자동 제외
  });

  if (!targets.length) {
    showMsg('promo-msg', '진급 대상 학생이 없습니다.', 'error'); return;
  }

  promoPreviewData = targets.map(s => {
    const newGrade      = GRADE_UP[s.grade] || s.grade;
    const newClassGroup = newGrade === 'N수'
      ? ''   // 고3→N수: 반 초기화
      : promoteClassGroup(s.classGroup || '', s.grade, newGrade);
    return { ...s, newGrade, newClassGroup };
  });

  // 테이블 렌더
  const table = document.getElementById('promo-table');
  table.innerHTML = `
    <tr>
      <th>이름</th><th>관</th><th>현재 학년</th><th>→ 진급 학년</th>
      <th>현재 반</th><th>→ 진급 반</th><th>담당</th>
    </tr>
    ${promoPreviewData.map(s => `
      <tr>
        <td>${s.name}</td>
        <td>${s.branch||''}</td>
        <td>${s.grade}</td>
        <td style="color:var(--purple, #5B3FA6);font-weight:600;">${s.newGrade}</td>
        <td style="color:var(--muted);">${s.classGroup||'-'}</td>
        <td style="color:var(--purple, #5B3FA6);">${s.newClassGroup||'-'}</td>
        <td>${s.teacherName||''}</td>
      </tr>`).join('')}`;

  const promo_countEl = document.getElementById('promo-count'); if (promo_countEl) promo_countEl.textContent = `(${promoPreviewData.length}명)`;
  document.getElementById('promo-preview-card').style.display = 'block';
  document.getElementById('promo-run-btn').style.display      = 'inline-flex';
  document.getElementById('promo-preview-card').scrollIntoView({ behavior:'smooth' });
};

window.runPromotion = async function() {
  if (!promoPreviewData.length) return;
  if (!confirm(`${promoPreviewData.length}명의 학년과 반을 진급 처리합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`)) return;

  const btn = document.getElementById('promo-run-btn');
  btn.disabled = true; btn.textContent = '처리 중...';

  let ok = 0, fail = 0;
  for (const s of promoPreviewData) {
    try {
      await updateDoc(doc(db, 'students', s.id), {
        grade:      s.newGrade,
        classGroup: s.newClassGroup,
      });
      ok++;
    } catch(e) {
      fail++;
      console.warn('진급 실패:', s.name, e.message);
    }
  }

  btn.disabled = false; btn.textContent = '🎓 진급 실행';
  showMsg('promo-msg',
    `✅ ${ok}명 진급 완료${fail ? ` / 실패 ${fail}명` : ''}`,
    ok > 0 ? 'success' : 'error'
  );

  promoPreviewData = [];
  document.getElementById('promo-preview-card').style.display = 'none';
  document.getElementById('promo-run-btn').style.display = 'none';
  await loadStudents();
};

