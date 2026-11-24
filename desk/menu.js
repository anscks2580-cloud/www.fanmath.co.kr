/* ═══════════════════════════════════════════════════════════
   업무 프로그램 메뉴판 — 메뉴 목록
   ※ 홈페이지 메뉴를 추가·변경하면 여기도 한 줄 맞춰 주세요
     · 관리부(관리자) 메뉴 = admin/js/nav.js 의 ADMIN_GROUPS  (id 가 같아야 바로 열림)
     · 선생님 메뉴        = teacher.html 의 GROUPS
   각 메뉴를 누르면 홈페이지 해당 화면(admin.html#메뉴id / teacher.html#메뉴id)이 업무 창에 열림
   ═══════════════════════════════════════════════════════════ */
export const ADMIN_GROUPS = [
  { id: 'home', label: '오늘', color: '#5B3FA6', items: [
    { id: 'home', label: '관리부 홈 (달력)' },
    { id: '@today', label: '일일종합현황' },
    { id: '@chat', label: '메신저' },
  ] },
  { id: 'student', label: '학생', color: '#2F7FD6', items: [
    { id: 'students', label: '학생 관리', k: '학생 원생 등록 정보 계정 명단 삭제 퇴원' },
    { id: 'classassign', label: '반 배정', k: '반 반편성 분반' },
    { id: 'assign', label: '강의 배정', k: '수강 권한 태그' },
    { id: 'excel', label: '엑셀 일괄 등록', k: '엑셀 일괄 업로드' },
    { id: 'promotion', label: '일괄 진급', k: '학년 새학기' },
    { id: 'pwissue', label: '비밀번호 발급', k: '비번 암호 재발급' },
  ] },
  { id: 'reports', label: '수업 보고', color: '#159A8C', items: [
    { id: 'weekly', label: '주간성취도', k: '성취도 주간 점수' },
    { id: 'progress', label: '반별진도', k: '진도' },
    { id: 'monthly', label: '월말보고서', k: '월말 보고서 리포트' },
    { id: 'studyreport', label: '학습보고서 생성', k: '일일테스트 오답' },
    { id: 'satclinic', label: '토요클리닉', k: '토요 클리닉 보충' },
    { id: 'clinicroom', label: '클리닉실', k: '클리닉 시간표' },
  ] },
  { id: 'office', label: '관리부', color: '#E0457B', items: [
    { id: 'attendance', label: '학생 출결', k: '출석 결석 지각 등원 하원' },
    { id: 'homeworklog', label: '숙제 입력', k: '숙제 과제' },
    { id: 'parentmsg', label: '학부모 발송', k: '카톡 문자 알림 솔라피' },
    { id: 'dailyreport', label: '관리부 마감', k: '마감 일일 업무보고' },
    { id: 'weeklylog', label: '주간업무일지', k: '업무일지 일지' },
    { id: 'covers', label: '교재 표지 · 안내문', k: '표지 안내문 인쇄' },
    { id: 'records', label: '기록 조회', k: '기록 이력 지난' },
  ] },
  { id: 'billing', label: '수납', color: '#0E7490', items: [
    { id: '@bill:billstudent', label: '학생 수납 (테스트)', url: '/p-e02aac283561d66a.html#billstudent', k: '수납 결제 납입 미납 모의 카드 링크' },
    { id: '@bill:billtoday', label: '수납 현황 (테스트)', url: '/p-e02aac283561d66a.html#billtoday', k: '수납 현황 납부' },
    { id: '@bill:billunpaid', label: '납입·미납 조회 (테스트)', url: '/p-e02aac283561d66a.html#billunpaid', k: '미납 납입 조회' },
    { id: '@bill:billbooks', label: '교재 (테스트)', url: '/p-e02aac283561d66a.html#billbooks', k: '교재 판매 입고 재고' },
  ] },
  { id: 'consult', label: '상담', color: '#16A34A', items: [
    { id: 'consult', label: '상담 신청', k: '상담 문의 입학 QR 설문' },
    { id: 'consultdeck', label: '상담자료 관리', k: '상담자료 프레젠테이션 설명회 학교별' },
    { id: 'seminar', label: '설명회 신청', k: '설명회 참석 명단' },
  ] },
  { id: 'notice', label: '공지 · 일정', color: '#7C3AED', items: [
    { id: 'notice', label: '공지사항', k: '공지 안내 알림 학부모 앱' },
    { id: 'schedule', label: '학원 일정', k: '일정 달력 휴무 시험기간' },
    { id: 'meetingdocs', label: '회의 자료', k: '회의 회의록 pdf' },
    { id: 'homepopup', label: '홈페이지 팝업', k: '팝업 배너' },
  ] },
  { id: 'video', label: '영상', color: '#DC2626', items: [
    { id: 'videos', label: '강의 목록', k: '강의 영상 비메오 업로드' },
    { id: 'weeklyclear', label: '주간 클리어', k: '주간클리어 weekly' },
    { id: 'videocode', label: '영상 코드 조회', k: '코드 강의번호' },
    { id: 'watchstatus', label: '시청현황', k: '시청 수강현황' },
    { id: 'apexvideo', label: '에이펙스 영상', k: '에이펙스 apex' },
    { id: 'promo', label: '홍보영상', k: '홍보 로비' },
    { id: 'exammaterials', label: '기말고사 자료', k: '기말 시험대비 exam 연합' },
  ] },
  { id: 'library', label: '자료실', color: '#D97706', items: [
    { id: 'pastexams', label: '기출문제', k: '기출 시험지 내신' },
    { id: 'textbooks', label: '시중교재', k: '교재 문제집' },
    { id: 'varreq', label: '변형문제 요청', emails: ['dncksfly@naver.com'], k: '변형 HCS' },
    { id: 'tamaterials', label: '조교 자료', k: '조교 숙제 답지' },
  ] },
  { id: 'settings', label: '설정', color: '#475569', items: [
    { id: 'teachers', label: '선생님 관리', k: '선생님 강사 조교 계정' },
    { id: 'adminmgmt', label: '관리자 계정', k: '관리자 비밀번호 권한 역할' },
  ] },
];
// 관리부 계정 기본 노출 그룹 (admin/js/nav.js ROLE_PRESETS 와 같게)
export const ROLE_PRESETS = { master: null, office: ['home', 'student', 'billing', 'reports', 'consult', 'office', 'notice'] };

export const TEACHER_GROUPS = [
  { id: 'home', label: '오늘', color: '#5B3FA6', items: [
    { id: 'calendar', label: '일정 · 오늘 할 일' },
    { id: '@today', label: '일일종합현황' },
    { id: '@chat', label: '메신저' },
  ] },
  { id: 'reports', label: '보고서', color: '#159A8C', items: [
    { id: 'hwlog', label: '숙제 입력', k: '숙제 과제' },
    { id: 'weekly', label: '주간성취도', k: '성취도 중등' },
    { id: 'dailytest', label: '일일테스트', k: '시험지 오답' },
    { id: 'reportreview', label: '보고서 검수', k: '학습보고서' },
    { id: 'parentcomments', label: '학부모 댓글', k: '댓글 답글' },
    { id: 'monthly', label: '월말보고서', k: '월말' },
    { id: 'tests', label: '누적테스트', k: '테스트 점수' },
    { id: 'examscore', label: '시험 점수 입력', k: '기말고사 점수 내신' },
    { id: 'progress', label: '반별 진도', k: '진도' },
    { id: 'clinic', label: '토요클리닉', k: '토요 클리닉' },
  ] },
  { id: 'video', label: '영상', color: '#DC2626', items: [
    { id: 'videos', label: '강의 목록', k: '강의 영상' },
    { id: 'weeklyclear', label: '주간 클리어', k: '주간클리어 pdf' },
    { id: 'myroom', label: '보충강의실 업로드', k: '보충 업로드 비메오' },
    { id: 'watchstatus', label: '학생 시청현황', k: '시청' },
  ] },
  { id: 'library', label: '자료실', color: '#D97706', items: [
    { id: 'meetingdocs', label: '회의 자료', k: '회의' },
    { id: 'pastexams', label: '기출문제', k: '기출 시험지' },
    { id: 'textbooks', label: '시중교재', k: '교재 문제집' },
    { id: 'submaterials', label: '부교재 프린트', k: '부교재 프린트 학교별' },
    { id: 'varreq', label: '변형문제 요청', k: '변형' },
    { id: 'examorig', label: '기말고사 원본', k: '기말 원본 시험지' },
  ] },
  { id: 'manual', label: '매뉴얼', color: '#475569', items: [
    { id: 'manual', label: '전임강사 매뉴얼', k: '매뉴얼 안내' },
  ] },
];

export const TA_GROUPS = [
  { id: 'home', label: '오늘', color: '#5B3FA6', items: [
    { id: '@today', label: '일일종합현황' },
    { id: '@chat', label: '메신저' },
  ] },
  { id: 'ta', label: '조교 업무', color: '#159A8C', items: [
    { id: 'clinicroom', label: '클리닉실 현황', k: '클리닉' },
    { id: 'homework', label: '숙제 확인', k: '숙제' },
    { id: 'answerkeys', label: '답지', k: '답지 교재' },
    { id: 'tasks', label: '작업물', k: '작업' },
    { id: 'satclinic', label: '토요 추가클리닉', k: '토요' },
  ] },
];
