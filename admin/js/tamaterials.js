'use strict';
/* ═══════════════════════════════════════════════════════════
   조교 자료: 숙제 · 답지 · 작업물
   (admin.html에서 분리 — 원본 5892~6121줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 📎 조교 자료: 숙제 업로드 · 조교 작업물 링크 (답지는 시중교재로 통일)
// ══════════════════════════════════════════
let taMaterialsInited = false;
window.initTaMaterialsTab = async () => {
  if (taMaterialsInited) { await Promise.all([loadHomeworks(), loadTaTasks(), loadTaMyboxLink()]); return; }
  taMaterialsInited = true;
  await Promise.all([loadHomeworks(), loadTaTasks(), loadTaMyboxLink()]);
};

// 숙제
// 요일 그룹에 따라 다음 등원일(조교가 확인해야 하는 날짜)을 계산
// 월수금반 숙제 → 다음 월/수/금에 노출, 화목반 숙제(토요일 추가클리닉 포함) → 다음 화/목에 노출
// 공휴일 여부는 학원마다 그날그날 다르게 쉴 수도 안 쉴 수도 있어서 건너뛰지 않고
// 노출일이 되면 그대로 뜨고, 그 다음 등원일까지도 계속 보이게 둔다 (조교 목록은 targetDate 이후 날짜 전부 노출)
function nextClassDate(dateStr) {
  const groupA = [1,3,5]; // 월수금
  const groupB = [2,4,6]; // 화목 (+토요일 추가클리닉)
  const d = new Date(dateStr + 'T00:00:00');
  const wd = d.getDay();
  const group = groupA.includes(wd) ? groupA : (groupB.includes(wd) ? groupB : null);
  if (!group) return dateStr; // 일요일 등 예외는 원래 날짜 그대로
  const next = new Date(d);
  do { next.setDate(next.getDate() + 1); } while (!group.includes(next.getDay()));
  return next.toISOString().slice(0,10);
}

async function loadHomeworks() {
  const snap = await getDocs(query(collection(db, 'homeworks'), orderBy('createdAt', 'desc')));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  document.getElementById('hwCount').textContent = rows.length;
  const el = document.getElementById('hwList');
  if (!rows.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;">업로드된 숙제가 없습니다.</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="student-item">
      <div class="student-name">${r.date || r.title || ''}</div>
      <a href="${r.fileURL}" target="_blank" class="btn btn-secondary btn-sm">열기</a>
      <button class="btn btn-danger btn-sm" onclick="deleteHomework('${r.id}')">삭제</button>
    </div>`).join('');
}

window.uploadHomework = async () => {
  const date = document.getElementById('hw-date').value;
  const fileInput = document.getElementById('hw-file');
  const file = fileInput.files[0];
  if (!date || !file) { showMsg('hwUploadMsg', '날짜와 파일을 모두 입력해주세요.', 'error'); return; }
  showMsg('hwUploadMsg', '업로드 중...', 'success');
  try {
    const path = `homeworks/${Date.now()}_${file.name}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const fileURL = await getDownloadURL(fileRef);
    const targetDate = nextClassDate(date);
    await addDoc(collection(db, 'homeworks'), {
      date, targetDate, fileURL, fileName: file.name, createdAt: new Date().toISOString()
    });
    showMsg('hwUploadMsg', '숙제 업로드 완료!', 'success');
    document.getElementById('hw-date').value = '';
    fileInput.value = '';
    await loadHomeworks();
  } catch(e) {
    showMsg('hwUploadMsg', '업로드 실패: ' + e.message, 'error');
  }
};

window.deleteHomework = async (id) => {
  if (!confirm('이 숙제 항목을 삭제하시겠습니까?')) return;
  await deleteDoc(doc(db, 'homeworks', id));
  await loadHomeworks();
};

// 답지: 마이박스 링크 방식은 없애고, 조교 페이지에서 시중교재(textbooks)를 그대로 보여줌

// 조교 작업물: 고정 마이박스 링크
async function loadTaMyboxLink() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'taMyboxLink'));
    document.getElementById('tt-mybox-link').value = snap.exists() ? (snap.data().link || '') : '';
  } catch(e) { /* noop */ }
}

window.saveTaMyboxLink = async () => {
  const link = document.getElementById('tt-mybox-link').value.trim();
  if (!link) { showMsg('ttLinkMsg', '링크를 입력해주세요.', 'error'); return; }
  await setDoc(doc(db, 'settings', 'taMyboxLink'), { link, updatedAt: new Date().toISOString() });
  showMsg('ttLinkMsg', '마이박스 링크 저장 완료!', 'success');
};

// 조교 작업물: 하루하루 작업 내용
async function loadTaTasks() {
  const snap = await getDocs(query(collection(db, 'taTasks'), orderBy('createdAt', 'desc')));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  document.getElementById('ttCount').textContent = rows.length;
  const el = document.getElementById('ttList');
  if (!rows.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 작업 내용이 없습니다.</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="student-item">
      <div class="student-name">${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR', {month:'numeric', day:'numeric'}) : ''} 조교 ${r.taName || ''}</div>
      <span class="student-meta" style="font-size:11px;">${r.note || ''}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteTaTask('${r.id}')">삭제</button>
    </div>`).join('');
}

window.addTaTask = async () => {
  const taName = document.getElementById('tt-name').value.trim();
  const note = document.getElementById('tt-note').value.trim();
  if (!taName || !note) { showMsg('ttMsg', '조교 이름과 작업 내용을 모두 입력해주세요.', 'error'); return; }
  await addDoc(collection(db, 'taTasks'), { taName, note, createdAt: new Date().toISOString() });
  showMsg('ttMsg', '작업 내용 등록 완료!', 'success');
  document.getElementById('tt-name').value = '';
  document.getElementById('tt-note').value = '';
  await loadTaTasks();
};

window.deleteTaTask = async (id) => {
  await deleteDoc(doc(db, 'taTasks', id));
  await loadTaTasks();
};

// 보고서 열람
let monthlyDocsCache = []; // ZIP용 캐시

window.loadReports = async () => {
  const teacherUid = document.getElementById('reportTeacher').value;
  const type       = document.getElementById('reportType').value;
  const el         = document.getElementById('reportList');
  const zipBtn     = document.getElementById('zipBtn');

  el.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  zipBtn.style.display = 'none';
  monthlyDocsCache = [];

  const collName = type === 'weekly' ? 'weeklyReports' : 'monthlyReports';

  try {
    // ── orderBy 단독 사용 (복합 인덱스 불필요) ──
    // teacherUid 필터를 Firestore 쿼리가 아닌 클라이언트에서 처리하여
    // 복합 인덱스 미생성으로 인한 쿼리 실패를 방지합니다.
    const q = query(collection(db, collName), orderBy('submittedAt', 'desc'));
    const snap = await getDocs(q);

    // teacherUid 클라이언트 필터
    let docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    if (teacherUid) docs = docs.filter(d => d.teacherUid === teacherUid);

    if (!docs.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">제출된 보고서가 없습니다.</div>';
      return;
    }

    let html = '';

    if (type === 'weekly') {
      docs.forEach(data => {
        const rl = data.ratingsLabel || {};
        html += `
          <div class="student-item" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:6px;">
              <b>${data.teacherName||''} T · ${data.weekLabel} — ${data.studentName} (${data.studentGrade||''})</b>
              <span style="font-size:12px;color:var(--muted);">${data.topic || ''}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);">
              과제 ${rl.homework||'-'} &nbsp;·&nbsp; 수업태도 ${rl.attitude||'-'} &nbsp;·&nbsp; 클리닉 ${rl.clinic||'-'}
            </div>
            ${data.memo ? `<div style="font-size:12px;">📌 ${data.memo}</div>` : ''}
          </div>`;
      });
    } else {
      // 월말 PDF
      docs.forEach(data => {
        monthlyDocsCache.push(data);
        const size = data.fileSize ? `(${(data.fileSize/1024/1024).toFixed(1)}MB)` : '';
        // ── 다운로드: fetch→blob 방식 (Firebase Storage CORS 우회) ──
        const safeURL      = (data.downloadURL||'').replace(/'/g, "\\'");
        const safeName     = (data.teacherName||'').replace(/'/g, "\\'");
        const safeMonth    = (data.month||'').replace(/'/g, "\\'");
        const safeFileName = (data.fileName||'report.pdf').replace(/'/g, "\\'");
        html += `
          <div class="student-item" style="flex-wrap:wrap;gap:10px;">
            <div style="flex:1;min-width:180px;">
              <div style="font-weight:600;margin-bottom:4px;">${data.teacherName||''} T · ${data.month} 보고서</div>
              <div style="font-size:12px;color:var(--muted);">📄 ${data.fileName||''} ${size}</div>
              ${data.memo ? `<div style="font-size:12px;color:var(--muted);">${data.memo}</div>` : ''}
            </div>
            <button onclick="downloadPDF('${safeURL}','${safeName}','${safeMonth}','${safeFileName}')"
              style="align-self:center;font-size:12px;color:var(--purple, #5B3FA6);background:none;padding:6px 14px;border:1px solid rgba(245,197,24,0.4);border-radius:6px;white-space:nowrap;cursor:pointer;font-family:inherit;">
              ⬇ 다운로드
            </button>
          </div>`;
      });
      if (monthlyDocsCache.length > 0) zipBtn.style.display = 'inline-flex';
    }

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div style="color:#D64545;font-size:13px;">오류: ${e.message}</div>`;
  }
};

