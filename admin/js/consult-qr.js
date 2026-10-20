'use strict';
/* ═══════════════════════════════════════════════════════════
   QR 상담지
   (admin.html에서 분리 — 원본 10220~10512줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════ QR 상담지 (상담 오신 분 휴대폰으로 입력) ══════
// 상담 QR은 고정 주소(지점별)라 인쇄해 두고 계속 사용 — 관리자 로그인 없이 방문자 전용 화면으로만 열림
let cqUnsub = null;
let cqSeen = new Set();
let cqFirst = true;

function loadQrLib() {
  if (window.QRCode) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload = () => res();
    sc.onerror = () => rej(new Error('QR 라이브러리를 불러오지 못했습니다.'));
    document.head.appendChild(sc);
  });
}

// kind: 'qr' 방문자 휴대폰(QR) · 'tablet' 학원 태블릿(관리자 로그인 안 된 브라우저) · 'lounge' 수업 미리보기만
// 문자·카톡·QR용 짧은 공용 주소 www.fanmath.co.kr/c (c/index.html → 상담지, 지점은 학부모님이 선택)
// (지점 고정 주소 /pc · /sb 도 계속 작동)
function consultLinkUrl(kind = 'qr') {
  const branch = document.getElementById('cqBranch').value;
  if (kind === 'qr' && /^https?:$/.test(location.protocol)) return new URL('c', location.href).toString();
  const u = new URL(kind === 'lounge' ? 'consult-lounge.html' : 'consult-visit.html', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('b', branch);
  if (kind === 'qr') u.searchParams.set('s', 'qr');
  if (kind === 'tablet') u.searchParams.set('src', 'tablet');
  return u.toString();
}
function consultQrUrl() { return consultLinkUrl('qr'); }
window.consultLinkUrl = consultLinkUrl;

window.renderConsultQr = async function() {
  const box = document.getElementById('cqCanvas');
  box.innerHTML = '';
  try { await loadQrLib(); }
  catch(e) { box.innerHTML = `<div style="color:#c33;font-size:13px;width:260px;padding:40px 0;">${e.message}</div>`; return; }
  const url = consultQrUrl();
  document.getElementById('cqUrl').textContent = url;
  new QRCode(box, { text: url, width: 520, height: 520, correctLevel: QRCode.CorrectLevel.M });
};

window.openConsultQr = async function() {
  cqSeen = new Set();
  cqFirst = true;
  document.getElementById('cqLive').innerHTML = '<div class="cq-live-empty">오늘 접수된 상담지가 없습니다. 전송되면 여기에 바로 표시됩니다.</div>';
  document.getElementById('consultQrModal').classList.add('open');
  await renderConsultQr();

  // 실시간 접수 감지 (오늘 0시 이후 QR·태블릿 링크로 들어온 상담지 — 진행 상황도 실시간 표시)
  if (cqUnsub) { cqUnsub(); cqUnsub = null; }
  try {
    const { onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const since = Timestamp.fromDate(today);
    cqUnsub = onSnapshot(
      query(collection(db, 'consultForms'), where('createdAt', '>=', since), orderBy('createdAt', 'desc')),
      (snap) => {
        const live = document.getElementById('cqLive');
        let added = false;
        // 새 상담 플로우: 상담신청서 저장 후 학부모 설문·영상 진행 상황도 실시간 표시
        const flowTxt = (d) => {
          if (d.flowVersion !== 2) return '';
          const st = d.studentSurvey?.status === 'completed' ? ' · 학생 설문 완료' : '';
          if (d.stage === 'consultation_completed') return '상담 준비 완료' + st;
          if (d.parentSurvey?.status === 'completed') return `학부모 설문 완료 · ${d.parentSurvey.code || ''}` + st;
          return '학부모 설문 진행 중';
        };
        const initial = cqFirst;
        cqFirst = false;
        // 첫 불러오기는 오래된 순으로 쌓아 최신이 위로 오게 함
        const changes = initial ? snap.docChanges().slice().reverse() : snap.docChanges();
        changes.forEach(ch => {
          const d = ch.doc.data();
          if (d.source !== 'qr' && d.source !== 'tablet') return;
          window._consultData = window._consultData || {};
          if (ch.type === 'modified' && cqSeen.has(ch.doc.id)) {
            window._consultData[ch.doc.id] = d;
            const st = live.querySelector(`[data-cq="${ch.doc.id}"] .cq-flow`);
            if (st) st.textContent = flowTxt(d);
            return;
          }
          if (ch.type !== 'added' || cqSeen.has(ch.doc.id)) return;
          cqSeen.add(ch.doc.id);
          window._consultData[ch.doc.id] = d;
          if (!added) { live.querySelector('.cq-live-empty')?.remove(); added = true; }
          const t = d.createdAt?.toDate ? formatConsultDate(d.createdAt.toDate()).slice(11) : '';
          const item = document.createElement('div');
          item.className = 'cq-live-item';
          item.dataset.cq = ch.doc.id;
          item.innerHTML = `<span>✅ <b>${escapeConsultHtml(d.studentName || '')}</b> · ${escapeConsultHtml(d.schoolGrade || '')} · ${escapeConsultHtml(d.level || '')}부 <span style="color:var(--muted);font-size:11.5px;">${t}</span> <span class="cq-flow" style="color:var(--gold);font-size:11.5px;">${escapeConsultHtml(flowTxt(d))}</span></span>
            <span style="display:flex;gap:6px;"><button class="btn btn-secondary btn-sm" onclick="closeConsultQr();openConsultRecord('${ch.doc.id}')">상담 기록</button></span>`;
          live.prepend(item);
          if (!initial) showToast(`📱 ${d.studentName || ''} 상담지가 접수되었습니다`);
        });
      },
      (err) => { console.error('QR 실시간 접수 감지 실패', err); }
    );
  } catch(e) { console.error(e); }
};

window.closeConsultQr = function() {
  document.getElementById('consultQrModal').classList.remove('open');
  if (cqUnsub) { cqUnsub(); cqUnsub = null; }
  if (document.getElementById('tab-consult')?.classList.contains('active')) initConsultTab();
};

window.copyConsultQrUrl = async function(kind = 'qr') {
  const url = consultLinkUrl(kind);
  try { await navigator.clipboard.writeText(url); showToast('링크가 복사되었습니다'); }
  catch(e) { prompt('아래 링크를 복사하세요', url); }
};

// QR 안내문 인쇄 (상담 테이블 비치용)
window.printConsultQr = function() {
  const box = document.getElementById('cqCanvas');
  const canvas = box.querySelector('canvas');
  const img = box.querySelector('img');
  const src = (img && img.src && img.src.startsWith('data:')) ? img.src : canvas?.toDataURL('image/png');
  if (!src) { showToast('QR을 먼저 불러와 주세요'); return; }
  const branch = escapeConsultHtml(document.getElementById('cqBranch').value);
  const logo = new URL('swc-logo.png', location.href).href;
  const w = window.open('', '_blank');
  if (!w) { showToast('팝업이 차단되었습니다. 팝업을 허용해 주세요'); return; }
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>상담 QR 안내문 · ${branch}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>@page{size:A5 portrait;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#1E1733;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:148mm;height:210mm;padding:16mm 14mm;display:flex;flex-direction:column;align-items:center;text-align:center;background:#F4F0E8}
.brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800}.brand img{height:26px}.brand span{font-weight:500;color:#5A5370}
.ey{margin-top:12mm;font-size:10px;font-weight:700;letter-spacing:.3em;color:#C9A24A}
h1{margin-top:4mm;font-size:25px;font-weight:800;letter-spacing:-.04em;line-height:1.35}
.sub{margin-top:3mm;font-size:12.5px;color:#5A5370;line-height:1.6}
.qr{margin-top:9mm;padding:5mm;background:#fff;border-radius:6mm;box-shadow:0 4mm 10mm -6mm rgba(37,28,64,.35)}.qr img{display:block;width:62mm;height:62mm}
.steps{margin-top:9mm;display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm;width:100%}
.steps div{padding:3mm 1mm;border-radius:3mm;background:#FBF9F4;border:1px solid rgba(37,28,64,.12);font-size:10.5px;font-weight:700;line-height:1.45}
.steps b{display:block;font-size:9px;color:#C9A24A;letter-spacing:.1em}
.foot{margin-top:auto;font-size:10px;color:#8E879E;letter-spacing:.15em}</style></head><body>
<div class="sheet"><div class="brand"><img src="${logo}" onerror="this.style.display='none'">송우찬수학학원<span>${branch}</span></div>
<p class="ey">CONSULTATION</p><h1>상담 전에 휴대폰으로<br>먼저 작성해 주세요</h1>
<p class="sub">카메라로 QR을 비추면 바로 열립니다 · 약 5분</p>
<div class="qr"><img src="${src}"></div>
<div class="steps"><div><b>01</b>상담신청서</div><div><b>02</b>학부모 설문</div><div><b>03</b>결과 확인</div></div>
<p class="foot">SONG WOOCHAN MATH</p></div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  w.document.close();
};

window.downloadConsultQr = function() {
  const box = document.getElementById('cqCanvas');
  const canvas = box.querySelector('canvas');
  const img = box.querySelector('img');
  const src = (img && img.src && img.src.startsWith('data:')) ? img.src : canvas?.toDataURL('image/png');
  if (!src) return;
  const a = document.createElement('a');
  a.href = src;
  a.download = `상담QR_${document.getElementById('cqBranch').value}.png`;
  a.click();
};

function formatConsultDate(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}.${p(dt.getMonth()+1)}.${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function escapeConsultHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function consultCheckbox(isOn) {
  return `<span class="ps-box${isOn ? ' on' : ''}"></span>`;
}

const CONSULT_NOTICE_TEXT = {
  '초등': '송우찬 수학학원 초등부 프로그램은 완전한 복습을 목표로 탄탄한 현행수업과 1년 기초 선행 수업을 병행하고 있습니다. 중학교 3학년 2학기(11월 초)까지 초, 중등부 과정을 모두 수료하면 초, 중등수학에 대한 탄탄한 복습과 고등학교 1년 과정의 선행이 완료됩니다.',
  '중등': '송우찬 수학학원 중등부 프로그램은 완전한 복습을 목표로 탄탄한 현행수업과 1년 기초 선행 수업을 병행하고 있습니다. 중학교 3학년 2학기(11월 초)까지 중등부 과정을 모두 수료하면 중등수학에 대한 탄탄한 복습과 고등학교 1년 과정의 선행이 완료됩니다.',
  '고등': '송우찬 수학학원 고등부 프로그램은 개념을 탄탄하게 정립하기 위한 반복, 복습, 심화의 세가지 목표를 가지고 교육과정을 구성하였습니다. 고등부 전체 진도는 2학년 2학기 기말고사가 마무리 되며, 2학년 겨울방학부터 수능대비 수업이 진행됩니다.'
};
// 방문 경로 선택지 (상담신청서 consult-visit.html·consult.html과 같은 목록 유지)
const CONSULT_VISIT_PATHS = ['인터넷(홈페이지)', '인터넷(블로그)', '인터넷(네이버카페)', '인터넷(당근마켓)', '주변권유', '우연히 찾아옴'];
// 목록에 없는 값(예전 선택지로 접수된 기록)은 '기타' 칸에 함께 표시
function consultVisitEtc(d) {
  const extra = (d.visitPath || []).filter((v) => !CONSULT_VISIT_PATHS.includes(v));
  if (d.visitPathEtc) extra.push(d.visitPathEtc);
  return extra.join(', ');
}
const CONSULT_ACCENT = { '초등': '#a78bda', '중등': '#f0b13c', '고등': '#7cb8dd' };

window.printConsultSheet = function(docId) {
  const d = window._consultData[docId];
  if (!d) return;
  const dateStr = d.createdAt?.toDate ? formatConsultDate(d.createdAt.toDate()) : '-';
  const level = d.level || '초등';
  const visitPaths = CONSULT_VISIT_PATHS;
  const visitEtc = consultVisitEtc(d);
  const areaOpts = ['수와 연산', '문자와 식', '함수', '기하', '확률과 통계'];

  let progressHtml = '';
  if (level === '고등') {
    const subjects = ['공통수학1','공통수학2','대수','미적분1','확률과 통계','미적분2','기하'];
    progressHtml = `
      <div class="ps-check-list">
        ${subjects.map(s => `<span class="ps-check-item">${consultCheckbox((d.highSubjects||[]).includes(s))}${s}</span>`).join('')}
      </div>
      <div style="margin-top:8px;font-size:12.5px;">
        학습 난이도 :
        ${['기본','응용','심화'].map(l => `<span class="ps-check-item" style="margin-left:14px;">${consultCheckbox(d.highLevel === l)}${l}</span>`).join('')}
      </div>`;
  } else {
    const schoolWord = level === '초등' ? '초등학교' : '중학교';
    progressHtml = `<div class="ps-inline">${schoolWord} <b>${escapeConsultHtml(d.progressGrade || '＿＿＿')}</b> &nbsp; ${escapeConsultHtml(d.progressSemester || '＿＿＿')} &nbsp; <b>${escapeConsultHtml(d.progressUnit || '＿＿＿＿＿＿')}</b> 까지</div>`;
  }

  const html = `
    <div class="ps-page" style="--ps-accent:${CONSULT_ACCENT[level] || '#a78bda'}">
      <div class="ps-topbar"></div>
      <div class="ps-header">
        <div class="ps-brand">
          <img class="ps-crown-img" src="swc-logo.png" alt="SWC" onerror="this.style.display='none'">
          <div class="ps-logo">송우찬 수학학원<small>선생님의 열정은 학생들을 춤추게 한다</small></div>
        </div>
        <div class="ps-meta">
          <div class="ps-meta-row"><span class="ps-meta-icon">🍀</span><b>상담 날짜</b> ${dateStr}</div>
          <div class="ps-meta-row"><span class="ps-meta-icon">🌈</span><b>상담 장소</b> ${consultCheckbox(d.branch === '평촌관')}평촌관 ${consultCheckbox(d.branch === '산본관')}산본관</div>
          <div class="ps-meta-row"><span class="ps-meta-icon">☀️</span><b>과정 구분</b> &nbsp;${escapeConsultHtml(level)}부</div>
        </div>
      </div>
      <div class="ps-row">
        <div><span class="lbl">성&nbsp;&nbsp;명</span><span class="val">${escapeConsultHtml(d.studentName || '')}</span></div>
        <div><span class="lbl">학교 / 학년</span><span class="val">${escapeConsultHtml(d.schoolGrade || '')}</span></div>
      </div>
      <div class="ps-row">
        <div><span class="lbl">연락처(학부모)</span><span class="val">${escapeConsultHtml(d.parentPhone || '')}</span></div>
        <div><span class="lbl">연락처(학생)</span><span class="val">${escapeConsultHtml(d.studentPhone || '')}</span></div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title urgent">기초 유의사항</div>
        <div class="ps-inline" style="line-height:1.75;color:#5c5c5c;padding-left:11px;">${CONSULT_NOTICE_TEXT[level]}</div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">방문 경로</div>
        <div class="ps-check-list" style="padding-left:11px;">
          ${visitPaths.map(p => `<span class="ps-check-item">${consultCheckbox((d.visitPath||[]).includes(p))}${p}</span>`).join('')}
          <span class="ps-check-item">${consultCheckbox(!!visitEtc)}기타: ${escapeConsultHtml(visitEtc)}</span>
        </div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">진도 상황</div>
        <div style="padding-left:11px;">${progressHtml}</div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">최근 시험 결과<span class="note">(대략적 점수대 기입 가능)</span></div>
        <div class="ps-scorebox" style="margin-left:11px;">
          <span>1회 : ${escapeConsultHtml(d.examScores?.round1 || '')}점</span>
          <span>2회 : ${escapeConsultHtml(d.examScores?.round2 || '')}점</span>
          <span>3회 : ${escapeConsultHtml(d.examScores?.round3 || '')}점</span>
          <span>4회 : ${escapeConsultHtml(d.examScores?.round4 || '')}점</span>
        </div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">성취도 높은 학습 영역</div>
        <div class="ps-check-list" style="padding-left:11px;">
          ${areaOpts.map(a => `<span class="ps-check-item">${consultCheckbox((d.strongAreas||[]).includes(a))}${a}</span>`).join('')}
        </div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">성취도 낮은 학습 영역</div>
        <div class="ps-check-list" style="padding-left:11px;">
          ${areaOpts.map(a => `<span class="ps-check-item">${consultCheckbox((d.weakAreas||[]).includes(a))}${a}</span>`).join('')}
        </div>
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">학습 자가진단</div>
        ${(selfCheckGroups(d.selfCheck).length ? selfCheckGroups(d.selfCheck) : [{ who: '', s: {} }]).map((g) => `<div class="ps-scorebox" style="margin-left:11px;">
          ${g.who ? `<span><b>${g.who}</b></span>` : ''}
          <span>연산 능력 : ${g.s.calcScore ?? '-'} / 10점</span>
          <span>풀이 정확도 : ${g.s.accuracyScore ?? '-'} / 10점</span>
          <span>수학 흥미도 : ${g.s.interestScore ?? '-'} / 10점</span>
        </div>`).join('')}
      </div>
      <div class="ps-section">
        <div class="ps-sec-title">상담 내용</div>
        <div class="ps-notebox"><span class="tag">※ 원장님 작성 부분입니다.</span>학원 수강 여부 :<br><br>사용 교재 :<br><br>기타 상담 내용 :</div>
      </div>
      <div class="ps-bottombar"></div>
    </div>
  `;
  document.getElementById('printSheet').innerHTML = html;
  window.print();
};

