'use strict';
/* ═══════════════════════════════════════════════════════════
   강의 배정 (학생별 태그)
   (admin.html에서 분리 — 원본 3720~3774줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ── 강의 배정 (실제 tag 기준) ──
let assignTabStudent = null; // 현재 선택된 학생 캐시 (추천 버튼용)

window.loadStudentVideos = async () => {
  const uid = document.getElementById('assignStudent').value;
  const recBtn = document.getElementById('assignRecommendBtn');
  if (!uid) {
    document.getElementById('assignVideoList').innerHTML = '학생을 먼저 선택해주세요.';
    if (recBtn) recBtn.style.display = 'none';
    assignTabStudent = null;
    return;
  }
  const sd = await getDoc(doc(db, 'students', uid));
  assignTabStudent = { id: uid, ...sd.data() };
  const assigned = assignTabStudent.assignedTags || [];
  renderTagChecklist('assignVideoList', assigned);
  if (recBtn) recBtn.style.display = '';
};

window.applyRecommendedTagsForAssignTab = function() {
  if (!assignTabStudent) return;
  const rec = new Set(recommendTags(assignTabStudent.grade, assignTabStudent.branch, assignTabStudent.teacherName));
  document.querySelectorAll('.assignVideoList-tag').forEach(c => { c.checked = rec.has(c.value); });
};

window.saveAssign = async () => {
  const uid = document.getElementById('assignStudent').value;
  if (!uid) { showMsg('assignMsg','학생을 먼저 선택해주세요.','error'); return; }
  const assignedTags = collectCheckedTags('assignVideoList');
  await updateDoc(doc(db, 'students', uid), { assignedTags });
  showMsg('assignMsg', `강의 접근 권한 저장 완료! (${assignedTags.length}개 카테고리)`, 'success');
  await loadStudents();
};

window.bulkAutoAssign = async () => {
  const grade = document.getElementById('bulkGrade').value;
  const targets = grade === 'all' ? studentsCache : studentsCache.filter(s => s.grade === grade);
  if (!targets.length) { showMsg('bulkMsg','해당 학년 학생이 없습니다.','error'); return; }
  if (!confirm(`${targets.length}명에게 학년/관/담당쌤 기준 추천 태그를 기존 배정에 추가합니다. 계속할까요?`)) return;

  const btn = event.target;
  btn.disabled = true; btn.textContent = '배정 중...';
  let count = 0;
  for (const s of targets) {
    const existing = s.assignedTags || [];
    const recommended = recommendTags(s.grade, s.branch, s.teacherName);
    const assignedTags = [...new Set([...existing, ...recommended])];
    await updateDoc(doc(db, 'students', s.id), { assignedTags });
    count++;
  }
  showMsg('bulkMsg', `${count}명 일괄 추천 배정(추가) 완료!`, 'success');
  btn.disabled = false; btn.textContent = '일괄 추천 배정 추가';
  await loadStudents();
};

