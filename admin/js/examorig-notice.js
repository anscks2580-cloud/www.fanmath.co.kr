'use strict';
/* ═══════════════════════════════════════════════════════════
   📄 기말고사 원본 업로드 알림 (지정된 원장 계정에게만)
   - 선생님이 선생님 페이지 「기말고사 원본」에 시험지를 올리면 (subMaterials, kind: 'examOriginal')
     아래 EO_NOTIFY_EMAILS 계정으로 로그인한 관리자 화면에만 실시간 팝업
   - 이미 확인한 알림은 이 컴퓨터에서 다시 안 뜸. 오른쪽 아래 버튼으로 전체 목록을 언제든 다시 볼 수 있음
   - 다른 관리자 계정에는 팝업도 버튼도 보이지 않음
   ═══════════════════════════════════════════════════════════ */
(function () {
  const EO_NOTIFY_EMAILS = ['dncksfly@naver.com'];
  const EO_KIND = 'examOriginal';
  const EO_EXAM = { key: '2026-2-final', name: '2026년 2학기 기말고사' };
  const BRANCHES = ['평촌관', '산본관'];
  const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timeOf = (it) => it.createdAtMs || (it.createdAt && it.createdAt.seconds ? it.createdAt.seconds * 1000 : (Date.parse(it.createdAtStr || '') || 0));
  const brColor = (b) => b === '산본관' ? '#B98A00' : '#5B3FA6';
  let items = [], unsub = null, uid = null, shownMax = 0, mode = 'new';

  const seenKey = () => 'swc_eo_admin_seen_' + EO_EXAM.key + '_' + uid;
  const seenAt = () => { try { return +(localStorage.getItem(seenKey()) || 0); } catch (e) { return 0; } };
  function when(ms) {
    if (!ms) return '';
    const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
    return (d.toDateString() === new Date().toDateString() ? '오늘' : `${d.getMonth() + 1}/${d.getDate()}`) + ` ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function ensureUi() {
    if (document.getElementById('eoAdmModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button id="eoAdmFab" type="button" style="display:none;position:fixed;right:18px;bottom:18px;z-index:9000;padding:10px 16px;border-radius:999px;border:1px solid rgba(91,63,166,0.4);background:#fff;color:#5B3FA6;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 6px 24px rgba(30,24,56,0.18);">📄 기말고사 원본 <span id="eoAdmFabN">0</span></button>
      <div id="eoAdmModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;align-items:center;justify-content:center;padding:16px;">
        <div style="width:100%;max-width:520px;max-height:86vh;overflow-y:auto;background:#fff;border:1px solid rgba(124,58,237,0.35);border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(30,24,56,0.2);">
          <div style="font-size:30px;line-height:1;margin-bottom:8px;">📄</div>
          <div id="eoAdmTitle" style="font-size:19px;font-weight:700;margin-bottom:4px;color:#1E1838;"></div>
          <div id="eoAdmSub" style="font-size:13px;color:#888;margin-bottom:14px;"></div>
          <div id="eoAdmBody"></div>
          <div style="display:flex;gap:8px;margin-top:18px;">
            <button class="btn btn-secondary btn-sm" style="flex:1;" id="eoAdmToggle" type="button"></button>
            <button class="btn btn-primary btn-sm" style="flex:1;" id="eoAdmOk" type="button">확인</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById('eoAdmFab').addEventListener('click', () => open('all'));
    document.getElementById('eoAdmOk').addEventListener('click', close);
    document.getElementById('eoAdmToggle').addEventListener('click', () => open(mode === 'all' ? 'new' : 'all'));
    document.getElementById('eoAdmModal').addEventListener('click', (e) => { if (e.target.id === 'eoAdmModal') close(); });
    document.getElementById('eoAdmBody').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-eo-view]'); if (!btn) return;
      const it = items.find((x) => x.id === btn.dataset.eoView); if (!it) return;
      const w = window.open('', '_blank');   // 팝업 차단 방지: 클릭 순간 창부터 엶
      try { const url = await getDownloadURL(ref(storage, it.path)); if (w) w.location.href = url; else window.open(url, '_blank'); }
      catch (err) { if (w) w.close(); alert('파일을 열지 못했습니다 (' + (err.code || err.message) + ')'); }
    });
  }

  function rowHtml(it, fresh) {
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-top:1px solid rgba(30,24,56,0.06);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:700;color:#1E1838;">${esc(it.grade)} ${esc(it.school)}${it.subject ? ' · ' + esc(it.subject) : ''}${fresh ? ' <span style="font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:999px;background:#F5C518;color:#2A1E55;">NEW</span>' : ''}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.uploaderName || '')} 선생님 · ${esc(when(timeOf(it)))} · ${esc(it.fileName || '')}</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-eo-view="${esc(it.id)}">보기</button>
    </div>`;
  }
  // 평촌관 / 산본관으로 나눠서 표시
  function listHtml(list, since) {
    return BRANCHES.concat(['관 미지정']).map((b) => {
      const rows = list.filter((it) => b === '관 미지정' ? !BRANCHES.includes(it.branch) : it.branch === b)
        .sort((x, y) => GRADES.indexOf(x.grade) - GRADES.indexOf(y.grade) || String(x.school).localeCompare(String(y.school), 'ko') || timeOf(y) - timeOf(x));
      if (!rows.length) return b === '관 미지정' ? '' : `<div style="font-size:13px;font-weight:800;color:${brColor(b)};margin:10px 0 2px;">${b} · 0개</div><div style="font-size:12.5px;color:#888;padding:4px 0 6px;">아직 올라온 원본이 없습니다.</div>`;
      return `<div style="font-size:13px;font-weight:800;color:${brColor(b)};margin:10px 0 2px;">${b} · ${rows.length}개</div>` + rows.map((it) => rowHtml(it, timeOf(it) > since)).join('');
    }).join('');
  }

  function open(m) {
    ensureUi();
    mode = m;
    const since = seenAt();
    const fresh = items.filter((it) => timeOf(it) > since);
    const list = mode === 'all' ? items : fresh;
    document.getElementById('eoAdmTitle').textContent = mode === 'all' ? `${EO_EXAM.name} 원본 전체 ${items.length}개` : `기말고사 원본이 새로 올라왔어요 (${fresh.length}개)`;
    document.getElementById('eoAdmSub').textContent = '선생님 페이지 › 자료실 › 기말고사 원본에 올라온 시험지입니다.';
    document.getElementById('eoAdmBody').innerHTML = list.length ? listHtml(list, since) : '<div style="font-size:13px;color:#888;padding:14px 0;text-align:center;">새로 올라온 원본이 없습니다.</div>';
    document.getElementById('eoAdmToggle').textContent = mode === 'all' ? '새로 올라온 것만' : `전체 목록 (${items.length})`;
    shownMax = Math.max(shownMax, ...items.map(timeOf), 0);
    document.getElementById('eoAdmModal').style.display = 'flex';
  }
  function close() {
    document.getElementById('eoAdmModal').style.display = 'none';
    if (uid && shownMax) { try { localStorage.setItem(seenKey(), String(shownMax)); } catch (e) {} }
    updateFab();
  }
  function updateFab() {
    const fab = document.getElementById('eoAdmFab'); if (!fab) return;
    const fresh = items.filter((it) => timeOf(it) > seenAt()).length;
    fab.style.display = 'block';
    document.getElementById('eoAdmFabN').textContent = fresh ? `새 ${fresh}개 / 전체 ${items.length}개` : `${items.length}개`;
    fab.style.background = fresh ? '#F5C518' : '#fff';
    fab.style.color = fresh ? '#2A1E55' : '#5B3FA6';
  }

  function start() {
    const a = window.currentAdmin;
    if (unsub) { unsub(); unsub = null; }
    if (!a || !EO_NOTIFY_EMAILS.includes(String(a.email || '').toLowerCase())) return;   // 지정 계정이 아니면 아무것도 안 함
    uid = a.uid;
    ensureUi();
    unsub = onSnapshot(query(collection(db, 'subMaterials'), where('kind', '==', EO_KIND)), (snap) => {
      items = [];
      snap.forEach((d) => { if (d.data().examKey === EO_EXAM.key) items.push({ id: d.id, ...d.data() }); });
      updateFab();
      const modalOpen = document.getElementById('eoAdmModal').style.display === 'flex';
      const hasNew = items.some((it) => timeOf(it) > Math.max(seenAt(), shownMax));
      if (modalOpen) open(mode);                       // 떠 있는 동안 새로 올라오면 목록만 갱신
      else if (hasNew) setTimeout(() => open('new'), 900);   // 로그인 직후 다른 팝업과 겹치지 않게 살짝 늦게
    }, (e) => console.warn('[기말고사 원본 알림]', e));
  }
  window.addEventListener('admin:profile', start);
  if (window.currentAdmin) start();
})();
