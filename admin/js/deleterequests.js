'use strict';
/* ═══════════════════════════════════════════════════════════
   계정 삭제 요청 (관리자 홈 카드) — 2026.11
   - 학생 앱(app.html 내 정보) · 학부모 페이지(parent.html 맨 아래)에서 「계정 삭제 요청」을 누르면
     accountDeletionRequests/{uid} 에 쌓임 (앱스토어·플레이스토어 규정: 앱 안에서 계정 삭제를 요청할 수 있어야 함)
   - 관리부는 학생 관리에서 퇴원·계정 삭제를 직접 처리한 뒤 여기서 「처리 완료」를 누름
   - 요청이 없으면 카드를 숨김 · 평촌관/산본관 구분 표시
   ═══════════════════════════════════════════════════════════ */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function card() {
    let c = document.getElementById('hmDelReqCard'); if (c) return c;
    const anchor = document.getElementById('hmScheduleCard'); if (!anchor) return null;
    c = document.createElement('section');
    c.className = 'card hm-card'; c.id = 'hmDelReqCard'; c.hidden = true; c.dataset.group = 'student';
    c.innerHTML = '<h3><span>🗑 계정 삭제 요청 <small id="hmDelReqN" style="color:#D64545;font-weight:800;"></small></span></h3><div id="hmDelReq"></div>';
    anchor.parentNode.insertBefore(c, anchor);
    return c;
  }
  async function load() {
    const c = card(); if (!c || !window.db) return;
    let list = [];
    try {
      const snap = await getDocs(query(collection(db, 'accountDeletionRequests'), where('status', '==', '요청')));
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    } catch (e) { c.hidden = true; return; }   // 규칙이 아직 없으면 조용히 숨김
    const br = typeof window.ocBranch === 'function' ? window.ocBranch() : '전체';
    if (br !== '전체') list = list.filter((r) => !r.branch || r.branch === br);
    if (!list.length) { c.hidden = true; return; }
    list.sort((a, b) => (a.requestedAt?.toMillis?.() || 0) - (b.requestedAt?.toMillis?.() || 0));
    document.getElementById('hmDelReqN').textContent = `${list.length}건`;
    document.getElementById('hmDelReq').innerHTML = list.map((r) => {
      const t = r.requestedAt?.toDate ? r.requestedAt.toDate() : null;
      const bc = String(r.branch || '').includes('산본') ? '#A87A00' : '#5B3FA6';
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line,#eee);">
        <div style="flex:1;min-width:0;"><b>${esc(r.name || r.uid)}</b> <small style="color:${bc};font-weight:800;">${esc(r.branch || '')}</small> <small style="color:var(--muted);">${r.role === 'parent' ? '학부모 계정' : '학생 계정'}${t ? ` · ${t.getMonth() + 1}/${t.getDate()} 요청` : ''}</small></div>
        <button class="btn btn-sm" type="button" onclick="delReqDone('${esc(r.id)}')">처리 완료</button></div>`;
    }).join('') + '<div style="font-size:11.5px;color:var(--muted);margin-top:8px;">학생 관리에서 퇴원·계정 삭제를 처리한 뒤 「처리 완료」를 눌러 주세요. 처리하면 본인에게 연락해 주세요.</div>';
    c.hidden = false;
  }
  window.delReqDone = async (id) => {
    if (!confirm('처리 완료로 표시할까요? (계정 삭제는 학생 관리에서 따로 해야 해요)')) return;
    try { await updateDoc(doc(db, 'accountDeletionRequests', id), { status: '처리', doneAt: Timestamp.now(), doneBy: auth.currentUser ? auth.currentUser.uid : '' }); load(); }
    catch (e) { alert('저장 실패: ' + e.message); }
  };
  window.addEventListener('oc:branch', load);
  const start = () => { if (window.auth && auth.currentUser) load(); else setTimeout(start, 800); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
