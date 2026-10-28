'use strict';
/* ═══════════════════════════════════════════════════════════
   퇴원 처리 공통 — 수납 프로그램 ↔ 홈페이지 학생 연동
   (관리자 화면 admin.html 과 수납 페이지 p-e02aac283561d66a.html 둘 다 불러옴)

   수납 학생을 퇴원시키면
     · 상태 「퇴원」 + 퇴원일
     · 수강 중인 반을 퇴원일로 종료 → 다음 달부터 수강료 자동 발생 안 됨
     · 퇴원일 뒤가 납입기한인, 아직 한 푼도 안 낸 「수강료」 청구는 취소
       (이미 낸 것·부분 납입·교재비·기타 청구와 지난 미납은 그대로 남김)
   홈페이지에서 학생을 퇴원(완전 삭제)하면, 연결된 수납 학생도 위처럼 자동 퇴원
   (실제 운영 billingStudents 와 테스트 test_billingStudents 둘 다 확인)
   ═══════════════════════════════════════════════════════════ */
(function () {
  const PREFIXES = ['', 'test_'];
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const who = () => { const a = window.currentAdmin || {}; return a.name || (a.email || '').split('@')[0] || '관리자'; };

  // 수납 학생 1명 퇴원 처리 → { patch, canceled: [취소한 청구] }
  async function leaveBillStudent(prefix, bs, date, reason, extra) {
    const d = date || today();
    const enr = (bs.enrollments || []).map((e) => (!e.end || e.end > d) ? { ...e, end: d } : e);
    const patch = {
      status: '퇴원',
      leaveDate: (bs.status === '퇴원' && bs.leaveDate) ? bs.leaveDate : d,
      enrollments: enr,
      updatedAt: Timestamp.now(), updatedBy: who(),
      ...(extra || {}),
    };
    await updateDoc(doc(db, prefix + 'billingStudents', bs.id), patch);
    const cs = await getDocs(query(collection(db, prefix + 'billCharges'), where('bsId', '==', bs.id)));
    const canceled = [];
    for (const sn of cs.docs) {
      const c = sn.data();
      if (c.status === '취소' || (c.paid || 0) > 0 || c.item !== '수강료' || !(String(c.dueDate || '') > d)) continue;
      const hist = (c.history || []).concat([{ at: today(), by: who(), text: '청구 취소 · ' + (reason || '퇴원') }]);
      await updateDoc(sn.ref, { status: '취소', history: hist });
      canceled.push({ id: sn.id, ...c, status: '취소', history: hist });
    }
    return { patch, canceled };
  }

  // 홈페이지 학생(students 문서 ID)에 연결된 수납 학생을 모두 퇴원 → { real:{students,charges}, test:{students,charges} }
  async function leaveByHomepageStudent(studentId, date) {
    const out = { real: { students: 0, charges: 0 }, test: { students: 0, charges: 0 } };
    if (!studentId) return out;
    for (const p of PREFIXES) {
      try {
        const snap = await getDocs(query(collection(db, p + 'billingStudents'), where('studentId', '==', studentId)));
        for (const sn of snap.docs) {
          const r = await leaveBillStudent(p, { id: sn.id, ...sn.data() }, date, '홈페이지 퇴원 처리',
            { studentId: '', hpLeftId: studentId, hpLeftAt: today() });
          const k = p ? 'test' : 'real';
          out[k].students++; out[k].charges += r.canceled.length;
        }
      } catch (e) { console.warn('수납 퇴원 연동 실패', p || '실제', e); }
    }
    return out;
  }

  window.billLeave = { leaveBillStudent, leaveByHomepageStudent, today };
})();
