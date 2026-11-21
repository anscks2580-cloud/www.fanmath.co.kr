'use strict';
/* ═══════════════════════════════════════════════════════════
   변형문제 요청 관리 (자료실 › 변형문제 요청) — 2026.11.21
   - dncksfly@naver.com 원장 계정에만 메뉴가 보임 (nav.js emails)
   - 선생님이 올린 요청(variantRequests) 검수 → 승인(검수 완료) / 반려 → 제작 중 → HCS 등록 완료
   - 「작업 묶음 내려받기」: 요청서.json + 원본 파일을 zip 하나로 → 다른 컴퓨터 Claude에게
     변형요청_작업지시서.md · 코드표와 함께 줌 → 결과 json을 Claude에게 주면 HCS에 등록
   ═══════════════════════════════════════════════════════════ */
const vqEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VQ_STEPS = ['요청', '검수 완료', '제작 중', 'HCS 등록 완료'];
const VQ_COLOR = { '요청': '#8A84A3', '검수 완료': '#2F7FD6', '제작 중': '#D97B1A', 'HCS 등록 완료': '#2E9E5B', '반려': '#D64545' };
const VQ_SUBJ = { '공수1': '공통수학1', '공수2': '공통수학2', '확통': '확률과 통계' };
let vqRows = [];
let vqBranch = 'all', vqStatus = 'open';

window.initVarReqTab = async function () {
  const me = String((window.currentAdmin || {}).email || '').toLowerCase();
  if (me !== 'dncksfly@naver.com') { document.getElementById('vq-list').innerHTML = '<div style="color:var(--muted);padding:14px;">이 메뉴는 지정된 원장 계정에서만 열 수 있습니다.</div>'; return; }
  await vqLoad();
};

async function vqLoad() {
  const el = document.getElementById('vq-list'); if (el) el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px;">불러오는 중...</div>';
  try {
    const snap = await getDocs(collection(db, 'variantRequests'));
    vqRows = []; snap.forEach((d) => vqRows.push({ id: d.id, ...d.data() }));
    vqRows.sort((a, b) => String(b.createdAtStr || '').localeCompare(String(a.createdAtStr || '')));
  } catch (e) { if (el) el.innerHTML = `<div style="color:#D64545;padding:10px;">불러오기 오류: ${vqEsc(e.message)}</div>`; return; }
  vqRender();
}
window.vqReload = vqLoad;
window.vqSet = function (k, v) { if (k === 'b') vqBranch = v; else vqStatus = v; vqRender(); };

function vqRender() {
  const chip = (k, v, label, cur) => `<button type="button" class="btn btn-sm ${cur === v ? 'btn-primary' : 'btn-secondary'}" style="${cur === v ? '' : (v === '산본관' ? 'color:#B8860B;' : v === '평촌관' ? 'color:#5B3FA6;' : '')}" onclick="vqSet('${k}','${v}')">${label}</button>`;
  const cnt = (st) => vqRows.filter((r) => (vqBranch === 'all' || r.branch === vqBranch) && (st === 'open' ? !['HCS 등록 완료', '반려'].includes(r.status) : r.status === st)).length;
  document.getElementById('vq-filters').innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;">
    ${chip('b', 'all', '전체', vqBranch)}${chip('b', '평촌관', '평촌관', vqBranch)}${chip('b', '산본관', '산본관', vqBranch)}<span style="width:10px;"></span>
    ${chip('s', 'open', `진행 중 ${cnt('open')}`, vqStatus)}${chip('s', '요청', `검수 대기 ${cnt('요청')}`, vqStatus)}${chip('s', 'HCS 등록 완료', `등록 완료 ${cnt('HCS 등록 완료')}`, vqStatus)}${chip('s', '반려', `반려 ${cnt('반려')}`, vqStatus)}${chip('s', 'all', '전부', vqStatus)}</div>`;
  const list = vqRows.filter((r) => (vqBranch === 'all' || r.branch === vqBranch)
    && (vqStatus === 'all' || (vqStatus === 'open' ? !['HCS 등록 완료', '반려'].includes(r.status) : r.status === vqStatus)));
  const el = document.getElementById('vq-list');
  if (!list.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:14px;text-align:center;">해당하는 요청이 없습니다.</div>'; return; }
  el.innerHTML = list.map((r) => {
    const st = r.status || '요청';
    const stepBtns = VQ_STEPS.map((s) => `<button type="button" class="btn btn-sm" style="font-size:11.5px;padding:3px 9px;${st === s ? `background:${VQ_COLOR[s]};color:#fff;border-color:${VQ_COLOR[s]};` : ''}" onclick="vqStatusSet('${r.id}','${s}')">${s}</button>`).join('');
    return `<div style="border:1px solid var(--border-soft);border-radius:12px;padding:14px 16px;margin-bottom:10px;${st === '요청' ? 'background:rgba(47,127,214,0.04);' : ''}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:800;"><span style="color:${r.branch === '산본관' ? '#B8860B' : '#5B3FA6'};">[${vqEsc(r.branch)}]</span> ${vqEsc(r.teacherName)} 선생님 · ${vqEsc(VQ_SUBJ[r.subject] || r.subject)} · ${r.mode === '조건' ? '조건 변경' : '숫자만 변경'} · 원본당 ${vqEsc(r.count)}개</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${vqEsc(r.reqId)} · ${vqEsc(String(r.createdAtStr || '').slice(0, 16).replace('T', ' '))}</div>
          ${r.memo ? `<div style="font-size:13px;margin-top:5px;">📝 ${vqEsc(r.memo)}</div>` : ''}
          <div style="font-size:13px;margin-top:5px;">${(r.files || []).map((f) => `<a href="#" onclick="vqOpen('${vqEsc(f.path)}');return false;" style="margin-right:12px;">📄 ${vqEsc(f.name)}</a>`).join('')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="vqZip('${r.id}')">📦 작업 묶음 내려받기</button>
          ${st !== '반려' ? `<button class="btn btn-danger btn-sm" onclick="vqStatusSet('${r.id}','반려')">반려</button>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:10px;">${st === '반려' ? '<b style="color:#D64545;margin-right:8px;">반려됨</b>' : ''}${stepBtns}</div>
      <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">
        <input type="text" id="vq-note-${r.id}" value="${vqEsc(r.reviewNote || '')}" placeholder="선생님께 보일 한마디 (검수 의견 · 반려 이유)" style="flex:1;padding:7px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:13px;font-family:inherit;">
        <button class="btn btn-secondary btn-sm" onclick="vqNoteSave('${r.id}')">의견 저장</button>
      </div>
    </div>`;
  }).join('');
}

window.vqOpen = async (path) => { try { window.open(await getDownloadURL(ref(storage, path)), '_blank'); } catch (e) { alert('파일을 열 수 없습니다: ' + e.message); } };

window.vqStatusSet = async function (id, status) {
  const r = vqRows.find((x) => x.id === id); if (!r) return;
  const note = (document.getElementById('vq-note-' + id)?.value || '').trim();
  if (status === '반려' && !note && !confirm('반려 이유 없이 반려할까요? (아래 칸에 이유를 적으면 선생님 화면에 보입니다)')) return;
  const patch = { status, reviewNote: note, updatedAtStr: new Date().toISOString(), reviewedBy: (window.currentAdmin || {}).name || (window.currentAdmin || {}).email || '' };
  if (status === 'HCS 등록 완료') {
    const n = prompt('HCS에 등록된 문제 수(원본+변형)를 적어 주세요. 모르면 비워 두세요.', String(r.hcsCount || ''));
    if (n === null) return;
    patch.hcsCount = parseInt(n, 10) || 0;
  }
  try { await updateDoc(doc(db, 'variantRequests', id), patch); Object.assign(r, patch); vqRender(); }
  catch (e) { alert('저장 오류: ' + e.message); }
};
window.vqNoteSave = async function (id) {
  const note = (document.getElementById('vq-note-' + id)?.value || '').trim();
  try { await updateDoc(doc(db, 'variantRequests', id), { reviewNote: note, updatedAtStr: new Date().toISOString() }); const r = vqRows.find((x) => x.id === id); if (r) r.reviewNote = note; vqToast('의견을 저장했습니다'); }
  catch (e) { alert('저장 오류: ' + e.message); }
};
function vqToast(t) { if (typeof window.showToast === 'function') window.showToast(t); }

// 작업 묶음: 요청서.json + 원본 파일 (다른 컴퓨터 Claude에게 지시서·코드표와 함께 줌)
window.vqZip = async function (id) {
  const r = vqRows.find((x) => x.id === id); if (!r) return;
  if (typeof JSZip === 'undefined') { alert('압축 도구를 불러오지 못했습니다. 새로고침 후 다시 해 주세요.'); return; }
  const zip = new JSZip();
  const files = [];
  try {
    for (const f of r.files || []) {
      const url = await getDownloadURL(ref(storage, f.path));
      const blob = await (await fetch(url)).blob();
      const nm = f.path.split('/').pop();
      zip.file(nm, blob); files.push(nm);
    }
  } catch (e) { alert('원본 파일을 받지 못했습니다: ' + e.message); return; }
  const reqJson = { reqId: r.reqId, branch: r.branch, teacher: r.teacherName, subject: r.subject, mode: r.mode, count: +r.count || 1, memo: r.memo || '', files };
  zip.file('요청서.json', JSON.stringify(reqJson, null, 2));
  zip.file('읽어주세요.txt', [
    `변형문제 요청 ${r.reqId}`,
    '',
    '이 묶음과 함께 아래 두 파일을 Claude에게 주세요.',
    ' · C:\\Users\\smc18\\Desktop\\문제DB\\_작업\\변형요청\\변형요청_작업지시서.md',
    ` · C:\\Users\\smc18\\Desktop\\문제DB\\_작업\\변형요청\\코드표\\코드표_${r.subject}.tsv (있으면)`,
    '',
    `Claude가 만든 결과 파일(${r.reqId}_결과.json)을 학원 홈페이지 담당 Claude에게 주면 HCS에 등록됩니다.`,
  ].join('\r\n'));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${r.reqId}_작업묶음.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (r.status === '검수 완료') { try { await updateDoc(doc(db, 'variantRequests', id), { status: '제작 중', updatedAtStr: new Date().toISOString() }); r.status = '제작 중'; vqRender(); } catch (e) { /* 상태만 못 바꿈 */ } }
};
