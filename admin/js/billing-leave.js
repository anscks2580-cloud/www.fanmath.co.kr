'use strict';
/* ═══════════════════════════════════════════════════════════
   퇴원 · 복귀 공통 — 수납 프로그램 ↔ 홈페이지 학생 연동
   (관리자 화면 admin.html 과 수납 페이지 p-e02aac283561d66a.html 둘 다 불러옴)

   [퇴원]  수납 학생: 상태 「퇴원」 + 퇴원일 + 수강 중인 반을 퇴원일로 종료
           → 다음 달부터 수강료 자동 발생이 멈춤
           ※ 이미 발생한 청구(미납 포함)는 하나도 지우거나 취소하지 않음
   [복귀]  수납 학생: 상태 「재원」 + 퇴원 때 종료된 반을 오늘부터 다시 수강
           (퇴원해 있던 기간의 수강료는 생기지 않음)
   홈페이지에서 퇴원·복귀하면 연결된 수납 학생도 같이 바뀜
   (실제 운영 billingStudents 와 테스트 test_billingStudents 둘 다 확인)
   ═══════════════════════════════════════════════════════════ */
(function () {
  const PREFIXES = ['', 'test_'];
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const who = () => { const a = window.currentAdmin || {}; return a.name || (a.email || '').split('@')[0] || '관리자'; };
  const rid = () => Math.random().toString(36).slice(2, 10);

  // 수납 학생 1명 퇴원 → patch
  async function leaveBillStudent(prefix, bs, date, extra) {
    const d = date || today();
    const enr = (bs.enrollments || []).map((e) => (!e.end || e.end > d) ? { ...e, end: d, endedByLeave: d } : e);
    const patch = {
      status: '퇴원',
      leaveDate: (bs.status === '퇴원' && bs.leaveDate) ? bs.leaveDate : d,
      enrollments: enr,
      updatedAt: Timestamp.now(), updatedBy: who(),
      ...(extra || {}),
    };
    await updateDoc(doc(db, prefix + 'billingStudents', bs.id), patch);
    return patch;
  }

  // 수납 학생 1명 복귀 → patch
  async function restoreBillStudent(prefix, bs, date, extra) {
    const d = date || today();
    const ld = bs.leaveDate || '';
    const enr = (bs.enrollments || []).slice();
    // 퇴원 때 종료된 반을 오늘부터 다시 (같은 수강료·할인)
    (bs.enrollments || []).filter((e) => e.end && (e.endedByLeave === ld || e.end === ld)).forEach((e) => {
      if (enr.some((x) => x.classId === e.classId && !x.end)) return;
      enr.push({ id: rid(), classId: e.classId, className: e.className, fee: e.fee || 0, discount: e.discount || 0,
        discountReason: e.discountReason || '', start: d, end: '', auto: e.auto !== false });
    });
    const patch = { status: '재원', leaveDate: '', enrollments: enr, restoredAt: d, updatedAt: Timestamp.now(), updatedBy: who(), ...(extra || {}) };
    await updateDoc(doc(db, prefix + 'billingStudents', bs.id), patch);
    return patch;
  }

  async function forLinked(studentId, fn) {
    const out = { real: 0, test: 0 };
    if (!studentId) return out;
    for (const p of PREFIXES) {
      try {
        const snap = await getDocs(query(collection(db, p + 'billingStudents'), where('studentId', '==', studentId)));
        for (const sn of snap.docs) { await fn(p, { id: sn.id, ...sn.data() }); out[p ? 'test' : 'real']++; }
      } catch (e) { console.warn('수납 연동 실패', p || '실제', e); }
    }
    return out;
  }

  // 홈페이지 학생 퇴원 → 연결된 수납 학생 퇴원  (opt.unlink: 홈페이지 학생을 완전 삭제할 때 연결도 끊기)
  async function leaveByHomepageStudent(studentId, date, opt) {
    const r = await forLinked(studentId, (p, bs) => leaveBillStudent(p, bs, date,
      (opt && opt.unlink) ? { studentId: '', hpLeftId: studentId, hpLeftAt: today() } : null));
    return { real: { students: r.real }, test: { students: r.test } };
  }
  // 홈페이지 학생 복귀 → 연결된 수납 학생 재원
  async function restoreByHomepageStudent(studentId) {
    return forLinked(studentId, (p, bs) => bs.status === '퇴원' ? restoreBillStudent(p, bs) : null);
  }

  window.billLeave = { leaveBillStudent, restoreBillStudent, leaveByHomepageStudent, restoreByHomepageStudent, today };
})();
