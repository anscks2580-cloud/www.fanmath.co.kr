'use strict';
/* ═══════════════════════════════════════════════════════════
   학부모 발송 (관리부) — 숙제 · 출결 · 주간성취도 · 월말보고서를 학부모에게
   - 받는 방법은 학생마다 자동으로 정해짐
       앱 알림 켠 학부모 → 앱 알림 (이미 자동으로 감 → 기본은 다시 안 보냄)
       그 외 → 카톡(알림톡), 카톡을 못 받으면 같은 내용이 문자로 자동 대체
       「문자만」으로 지정한 학생 → 지정 번호로 문자
       「보내지 않음」 → 제외
   - 실제 발송은 서버 함수 msgSend (솔라피) / 등원·하원은 서버가 자동(msgOnAttendance)
   - 설정: msgConfig/main · msgConfig/secret   기록: msgLogs
   - 평촌관 · 산본관은 항상 따로 (관 선택 후 그 관 학생만)
   모든 파일은 같은 전역 범위를 공유합니다 (db, studentsCache, httpsCallable 등)
   ═══════════════════════════════════════════════════════════ */
let pmBranch = '평촌관';
let pmType = 'hw';
let pmRows = [];           // 현재 목록 [{s, route, vars, preview, key, logged}]
let pmParents = {};        // parentUid → parents 문서
let pmCfg = {};            // msgConfig/main
let pmSecretSet = false;
let pmInited = false;

const PM_TYPES = {
  hw:      { label: '숙제',        icon: '📒' },
  att:     { label: '출결',        icon: '✅' },
  weekly:  { label: '주간성취도',  icon: '📊' },
  monthly: { label: '월말보고서',  icon: '📝' },
};
// 서버(messaging.js)의 템플릿과 같은 글 — 미리보기·카카오 등록 안내용
const PM_TPL = {
  hw:      '[송우찬수학학원 #{관}] 숙제 안내\n\n#{학생} 학생의 #{날짜} 숙제입니다.\n\n#{숙제}\n\n지난 숙제와 출결은 학부모 페이지에서 확인하실 수 있습니다.',
  att:     '[송우찬수학학원 #{관}] 출결 안내\n\n#{학생} 학생의 #{날짜} 출결입니다.\n\n#{출결}\n\n자세한 출결 기록은 학부모 페이지에서 확인하실 수 있습니다.',
  weekly:  '[송우찬수학학원 #{관}] 주간 성취도\n\n#{학생} 학생의 #{주차} 주간 성취도입니다.\n\n#{평가}\n\n#{선생님} 선생님 말씀\n#{코멘트}\n\n학부모 페이지에서 선생님께 댓글을 남기실 수 있습니다.',
  monthly: '[송우찬수학학원 #{관}] 월간 학습보고서\n\n#{학생} 학생의 #{월} 학습보고서가 나왔습니다.\n\n#{요약}\n\n전체 보고서는 학부모 페이지에서 확인하실 수 있습니다.',
  inout:   '[송우찬수학학원 #{관}] #{구분} 알림\n\n#{학생} 학생이 #{시간}에 #{구분}했습니다.',
};
const PM_TPL_NAME = { hw: '숙제 안내', att: '출결 안내', weekly: '주간 성취도', monthly: '월간 학습보고서', inout: '등원·하원 알림' };
const PM_PRICE = { kakao: 13, sms: 18, lms: 45, app: 0 };  // 솔라피 기준, 부가세 별도

const pmEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pmDigits = (v) => String(v || '').replace(/[^0-9]/g, '');
const pmFill = (t, v) => t.replace(/#\{([^}]+)\}/g, (m, k) => (v[k] != null && String(v[k]).trim() !== '' ? String(v[k]) : '-'));
const pmPhoneFmt = (p) => { const d = pmDigits(p); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d; };
function pmToday() {
  const k = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
}
const pmMD = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일(${'일월화수목금토'[d.getDay()]})`; };
const pmIsMaster = () => (window.currentAdmin && window.currentAdmin.role) !== 'office';

// 주차 (선생님 페이지와 같은 계산)
function pmMonday(off) { const d = new Date(); const day = d.getDay(); const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - 7 * off); return m; }
function pmWeekKey(off) { const m = pmMonday(off); const y = m.getFullYear(); const st = new Date(y, 0, 1); return `${y}-W${String(Math.ceil(((m - st) / 86400000 + st.getDay() + 1) / 7)).padStart(2, '0')}`; }
function pmWeekLabel(off) { const m = pmMonday(off); const s = new Date(m); s.setDate(m.getDate() + 6); const f = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`; return `${f(m)}~${f(s)}`; }

// 학생 한 명의 받는 방법 (서버와 같은 규칙)
function pmRoute(s) {
  if (s.status === '퇴원') return { ch: 'skip', why: '퇴원' };
  const mode = s.msgMode || 'auto';
  if (mode === 'none') return { ch: 'skip', why: '보내지 않음' };
  if (mode === 'sms') { const p = pmDigits(s.msgPhone || s.parentPhone); return p ? { ch: 'sms', phone: p } : { ch: 'skip', why: '번호 없음' }; }
  const par = s.parentUid ? pmParents[s.parentUid] : null;
  if (par && par.fcmToken) return { ch: 'app', phone: pmDigits(s.parentPhone) };
  const p = pmDigits(s.parentPhone);
  return p ? { ch: 'kakao', phone: p } : { ch: 'skip', why: '학부모 번호 없음' };
}
function pmBadge(r) {
  const st = 'display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;';
  if (r.ch === 'app') return `<span style="${st}background:rgba(46,158,91,0.12);color:#2E9E5B;">📱 앱 알림</span>`;
  if (r.ch === 'kakao') return `<span style="${st}background:#FEE500;color:#3A1D1D;">💬 카톡</span>`;
  if (r.ch === 'sms') return `<span style="${st}background:rgba(91,63,166,0.12);color:#5B3FA6;">✉️ 문자</span>`;
  return `<span style="${st}background:rgba(30,24,56,0.06);color:var(--muted);">— ${pmEsc(r.why || '없음')}</span>`;
}

// ══ 탭 열기 ══
window.initParentMsgTab = async function () {
  if (!studentsCache.length) await loadStudents();
  await pmLoadBase();
  if (!pmInited) {
    pmInited = true;
    document.getElementById('pmDate').value = pmToday();
    const wk = document.getElementById('pmWeek');
    wk.innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${pmWeekKey(i)}">${i === 0 ? '이번 주' : i === 1 ? '저번 주' : i + '주 전'} · ${pmWeekLabel(i)}</option>`).join('');
    wk.value = pmWeekKey(1);
    const t = pmToday(); const d = new Date(t.slice(0, 7) + '-01T00:00:00'); d.setMonth(d.getMonth() - 1);
    document.getElementById('pmMonth').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  pmSyncUI();
  pmRenderStatus();
  pmRenderSettings();
  pmRenderRouteList();
  pmLoadLogs();
};

async function pmLoadBase() {
  pmParents = {};
  try {
    const [ps, cm] = await Promise.all([getDocs(collection(db, 'parents')), getDoc(doc(db, 'msgConfig', 'main'))]);
    ps.forEach((d) => { pmParents[d.id] = d.data(); });
    pmCfg = cm.exists() ? cm.data() : {};
  } catch (e) { console.warn('학부모 발송 기본 정보 불러오기 실패', e); }
  if (pmIsMaster()) { try { const sc = await getDoc(doc(db, 'msgConfig', 'secret')); pmSecretSet = sc.exists() && !!sc.data().apiKey; } catch (e) { pmSecretSet = false; } }
  else pmSecretSet = !!pmCfg.ready;
}

window.pmSetBranch = function (b) { pmBranch = b; pmRows = []; pmSyncUI(); pmRenderStatus(); pmRenderList(); pmRenderRouteList(); pmLoadLogs(); };
window.pmSetType = function (t) { pmType = t; pmRows = []; pmSyncUI(); pmRenderList(); };
function pmSyncUI() {
  document.querySelectorAll('[data-pmbr]').forEach((el) => el.classList.toggle('active', el.dataset.pmbr === pmBranch));
  document.querySelectorAll('[data-pmtype]').forEach((el) => el.classList.toggle('active', el.dataset.pmtype === pmType));
  document.getElementById('pmDateWrap').style.display = (pmType === 'hw' || pmType === 'att') ? '' : 'none';
  document.getElementById('pmWeekWrap').style.display = pmType === 'weekly' ? '' : 'none';
  document.getElementById('pmMonthWrap').style.display = pmType === 'monthly' ? '' : 'none';
  const tag = document.getElementById('pmBrTag');
  if (tag) { tag.textContent = pmBranch; tag.style.color = pmBranch === '산본관' ? '#C99A0A' : '#5B3FA6'; }
}

// ══ 상태 (연동 · 받는 방법 분포 · 이번 달 비용) ══
async function pmRenderStatus() {
  const el = document.getElementById('pmStatus'); if (!el) return;
  const list = studentsCache.filter((s) => s.branch === pmBranch && s.status !== '퇴원');
  const cnt = { app: 0, kakao: 0, sms: 0, skip: 0 };
  list.forEach((s) => { cnt[pmRoute(s).ch]++; });
  const ready = pmSecretSet && pmDigits(pmCfg.from);
  const tplOk = Object.keys(PM_TPL).filter((k) => (pmCfg.templates || {})[k]).length;
  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
      <span style="font-weight:800;">${ready ? '<span style="color:#2E9E5B;">● 카톡·문자 연동됨</span>' : '<span style="color:#C8541F;">● 카톡·문자 연동 전</span>'}</span>
      <span style="font-size:12.5px;color:var(--muted);">카톡 템플릿 ${tplOk}/5 등록${tplOk < 5 && ready ? ' (등록 전 종류는 문자로 나가요)' : ''}</span>
      <span style="font-size:12.5px;color:var(--muted);">· 등원·하원 자동 알림 ${pmCfg.autoAttendance ? '<b style="color:#2E9E5B;">켜짐</b>' : '꺼짐'}</span>
    </div>
    <div style="margin-top:8px;font-size:13px;"><b id="pmBrTag">${pmEsc(pmBranch)}</b> 재원생 ${list.length}명 받는 방법 —
      📱 앱 알림 <b>${cnt.app}</b> · 💬 카톡 <b>${cnt.kakao}</b> · ✉️ 문자 지정 <b>${cnt.sms}</b> · 보낼 수 없음 <b>${cnt.skip}</b></div>
    <div id="pmCost" style="margin-top:6px;font-size:12.5px;color:var(--muted);">이번 달 발송 건수 불러오는 중…</div>`;
  pmSyncUI();
  try {
    const m = pmToday().slice(0, 7);
    const qs = await getDocs(query(collection(db, 'msgLogs'), where('month', '==', m)));
    const c = { kakao: 0, sms: 0, lms: 0, app: 0 }; const cb = { 평촌관: 0, 산본관: 0 };
    qs.forEach((d) => { const x = d.data(); if (!x.ok) return; const n = x.count || 1; if (c[x.channel] != null) c[x.channel] += n; if (cb[x.branch] != null && x.channel !== 'app') cb[x.branch] += n * (PM_PRICE[x.channel] || 0); });
    const won = c.kakao * PM_PRICE.kakao + c.sms * PM_PRICE.sms + c.lms * PM_PRICE.lms;
    document.getElementById('pmCost').innerHTML = `이번 달(${m.slice(5)}월) 보낸 건수 — 카톡 ${c.kakao} · 단문 문자 ${c.sms} · 장문 문자 ${c.lms} · 앱 다시 보냄 ${c.app} → 대략 <b style="color:var(--off-white);">${Math.round(won * 1.1).toLocaleString()}원</b> (부가세 포함 · 평촌관 ${Math.round(cb.평촌관 * 1.1).toLocaleString()}원 / 산본관 ${Math.round(cb.산본관 * 1.1).toLocaleString()}원)`;
  } catch (e) { const c = document.getElementById('pmCost'); if (c) c.textContent = ''; }
}

// ══ 보낼 목록 만들기 ══
window.pmLoad = async function () {
  const box = document.getElementById('pmList');
  box.innerHTML = '<div style="color:var(--muted);padding:12px 0;">불러오는 중…</div>';
  const inBr = (sid) => { const s = studentsCache.find((x) => x.id === sid); return s && s.branch === pmBranch && s.status !== '퇴원' ? s : null; };
  const rows = new Map();   // sid → { s, vars, key }
  try {
    if (pmType === 'hw') {
      const date = document.getElementById('pmDate').value; if (!date) throw new Error('날짜를 골라주세요.');
      const qs = await getDocs(query(collection(db, 'homeworkLogs'), where('date', '==', date)));
      qs.forEach((d) => {
        const h = d.data(); if (h.absent) return;
        (h.studentIds || []).forEach((sid) => {
          const s = inBr(sid); if (!s) return;
          const line = `${h.teacherName ? h.teacherName + ' 선생님' : ''}${h.classGroup ? ' · ' + h.classGroup : ''}\n${h.content || ''}`.trim();
          const r = rows.get(sid) || { s, key: date, parts: [] }; r.parts.push(line); rows.set(sid, r);
        });
      });
      rows.forEach((r) => { r.vars = { 날짜: pmMD(date), 숙제: r.parts.join('\n\n').slice(0, 700) }; });
    } else if (pmType === 'att') {
      const date = document.getElementById('pmDate').value; if (!date) throw new Error('날짜를 골라주세요.');
      const dow = '일월화수목금토'[new Date(date + 'T00:00:00').getDay()];
      const [as, bs] = await Promise.all([
        getDocs(query(collection(db, 'attendance'), where('date', '==', date))),
        getDocs(query(collection(db, 'absences'), where('dates', 'array-contains', date))).catch(() => null),
      ]);
      const att = {}, abs = {};
      as.forEach((d) => { const a = d.data(); if (a.uid) att[a.uid] = a; });
      if (bs) bs.forEach((d) => { const a = d.data(); if (a.studentId) abs[a.studentId] = a; });
      studentsCache.filter((s) => s.branch === pmBranch && s.status !== '퇴원' && ((s.days || []).includes(dow) || att[s.id] || abs[s.id])).forEach((s) => {
        const a = att[s.id], b = abs[s.id];
        const txt = a ? `등원 ${a.time || '-'}${a.outTime ? ' · 하원 ' + a.outTime : ' · 하원 기록 없음'}` : b ? `결석 (${b.reason || '사유서 제출'})` : '등원 기록 없음';
        rows.set(s.id, { s, key: date, vars: { 날짜: pmMD(date), 출결: txt } });
      });
    } else if (pmType === 'weekly') {
      const wk = document.getElementById('pmWeek').value;
      const label = document.getElementById('pmWeek').selectedOptions[0]?.textContent.split('·').pop().trim() || wk;
      const qs = await getDocs(query(collection(db, 'weeklyReports'), where('weekKey', '==', wk)));
      qs.forEach((d) => {
        const w = d.data(); const s = inBr(w.studentId); if (!s) return;
        const rl = w.ratingsLabel || {};
        rows.set(s.id, { s, key: wk, vars: { 주차: label, 평가: `과제 ${rl.homework || '-'} · 수업태도 ${rl.attitude || '-'} · 클리닉 ${rl.clinic || '-'}`, 선생님: w.teacherName || '', 코멘트: (w.memo || '-').slice(0, 500) } });
      });
    } else if (pmType === 'monthly') {
      const m = document.getElementById('pmMonth').value; if (!m) throw new Error('월을 골라주세요.');
      const qs = await getDocs(query(collection(db, 'studentReports'), where('month', '==', m)));
      qs.forEach((d) => {
        const r = d.data(); if (r.status !== 'sent') return; const s = inBr(r.studentId); if (!s) return;
        const sm = r.summary || {};
        rows.set(s.id, { s, key: m, vars: { 월: `${Number(m.slice(5))}월`, 요약: `일일테스트 ${sm.tests ?? 0}회 · ${sm.total ?? 0}문항 · 정답률 ${sm.pct ?? '-'}%${sm.gradeBand ? ' · ' + sm.gradeBand + '등급' : ''}` } });
      });
    }
    // 이미 보낸 기록
    const key = [...rows.values()][0]?.key;
    const logged = {};
    if (key) {
      try {
        const ls = await getDocs(query(collection(db, 'msgLogs'), where('type', '==', pmType), where('key', '==', key)));
        ls.forEach((d) => { const x = d.data(); if (x.ok && x.studentId) logged[x.studentId] = x; });
      } catch (e) {}
    }
    pmRows = [...rows.values()].map((r) => {
      const route = pmRoute(r.s);
      const vars = { ...r.vars, 학생: r.s.name, 관: r.s.branch };
      return { ...r, vars, route, preview: pmFill(PM_TPL[pmType], vars), logged: logged[r.s.id] || null };
    }).sort((a, b) => (a.s.classGroup || '').localeCompare(b.s.classGroup || '', 'ko') || (a.s.name || '').localeCompare(b.s.name || '', 'ko'));
    pmRenderList();
  } catch (e) { box.innerHTML = `<div style="color:#D64545;font-size:13px;">${pmEsc(e.message)}</div>`; }
};

function pmRenderList() {
  const box = document.getElementById('pmList'); if (!box) return;
  const btn = document.getElementById('pmSendBtn');
  if (!pmRows.length) {
    box.innerHTML = `<div style="color:var(--muted);padding:12px 0;font-size:13px;">${pmEsc(pmBranch)} · ${PM_TYPES[pmType].label} — 위에서 날짜를 고르고 「불러오기」를 눌러 주세요. (불러왔는데 비어 있으면 그날 등록된 ${PM_TYPES[pmType].label}이 없는 거예요)</div>`;
    if (btn) btn.style.display = 'none';
    return;
  }
  const incApp = document.getElementById('pmIncApp')?.checked;
  const cell = 'padding:8px 6px;border-bottom:1px solid rgba(30,24,56,0.07);font-size:13px;vertical-align:top;';
  box.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:720px;">
    <thead><tr style="text-align:left;font-size:11.5px;color:var(--muted);">
      <th style="padding:6px;width:28px;"><input type="checkbox" id="pmAll" onchange="pmToggleAll(this.checked)"></th>
      <th style="padding:6px;">반</th><th style="padding:6px;">이름</th><th style="padding:6px;">받는 방법</th><th style="padding:6px;">보낼 내용</th><th style="padding:6px;">보낸 기록</th>
    </tr></thead><tbody>
    ${pmRows.map((r, i) => {
      const can = r.route.ch !== 'skip' && (r.route.ch !== 'app' || incApp);
      const def = can && !r.logged;
      const body = r.preview.split('\n').slice(2).join('\n').trim();
      return `<tr>
        <td style="${cell}"><input type="checkbox" class="pm-chk" data-i="${i}" ${def ? 'checked' : ''} ${can ? '' : 'disabled'}></td>
        <td style="${cell}color:var(--muted);white-space:nowrap;">${pmEsc(r.s.classGroup || '-')}</td>
        <td style="${cell}white-space:nowrap;"><b>${pmEsc(r.s.name)}</b> <small style="color:var(--muted);">${pmEsc(r.s.grade || '')}</small></td>
        <td style="${cell}">${pmBadge(r.route)}${r.route.ch === 'app' && !incApp ? '<div style="font-size:11px;color:var(--muted);margin-top:3px;">앱으로 이미 받음</div>' : ''}${r.route.phone && r.route.ch !== 'app' ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;">${pmPhoneFmt(r.route.phone)}</div>` : ''}</td>
        <td style="${cell}"><div style="white-space:pre-wrap;font-size:12.5px;max-height:84px;overflow:auto;color:var(--off-white);">${pmEsc(body)}</div></td>
        <td style="${cell}white-space:nowrap;font-size:12px;">${r.logged ? `<span style="color:#2E9E5B;font-weight:700;">보냄</span><br><small style="color:var(--muted);">${r.logged.sentAt?.toDate ? r.logged.sentAt.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}${(r.logged.count || 1) > 1 ? ' · ' + r.logged.count + '번' : ''}</small>` : '<span style="color:var(--muted);">-</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <div style="font-size:12px;color:var(--muted);margin-top:8px;">이미 보낸 학생은 체크가 빠져 있어요. 다시 보내려면 직접 체크하세요. 내용 전체 모양은 「연동 설정」의 템플릿에서 볼 수 있어요.</div>`;
  if (btn) btn.style.display = '';
  pmCountSel();
  box.querySelectorAll('.pm-chk').forEach((c) => c.addEventListener('change', pmCountSel));
}
window.pmRenderList = pmRenderList;
window.pmToggleAll = function (on) { document.querySelectorAll('.pm-chk:not([disabled])').forEach((c) => { c.checked = on; }); pmCountSel(); };
function pmCountSel() {
  const sel = [...document.querySelectorAll('.pm-chk:checked')].map((c) => pmRows[+c.dataset.i]);
  const n = { app: 0, kakao: 0, sms: 0 }; sel.forEach((r) => { n[r.route.ch] = (n[r.route.ch] || 0) + 1; });
  const btn = document.getElementById('pmSendBtn');
  if (btn) btn.textContent = sel.length ? `선택한 ${sel.length}명에게 보내기 (카톡 ${n.kakao} · 문자 ${n.sms}${n.app ? ' · 앱 ' + n.app : ''})` : '보낼 학생을 체크하세요';
}

window.pmSend = async function () {
  const sel = [...document.querySelectorAll('.pm-chk:checked')].map((c) => pmRows[+c.dataset.i]);
  if (!sel.length) { alert('보낼 학생을 체크해 주세요.'); return; }
  if (!pmSecretSet && sel.some((r) => r.route.ch !== 'app')) { alert('카톡·문자 연동 설정이 아직 안 돼 있어요. 원장님께 연동 설정을 부탁드려 주세요.'); return; }
  const again = sel.filter((r) => r.logged).length;
  if (!confirm(`${pmBranch} ${PM_TYPES[pmType].label} — ${sel.length}명에게 보낼까요?${again ? `\n(이 중 ${again}명은 이미 한 번 보냈어요)` : ''}`)) return;
  const btn = document.getElementById('pmSendBtn'); btn.disabled = true; btn.textContent = '보내는 중…';
  try {
    const fn = httpsCallable(functionsInstance, 'msgSend', { timeout: 300000 });
    const res = await fn({ items: sel.map((r) => ({ studentId: r.s.id, type: pmType, key: r.key, vars: r.vars })), includeApp: !!document.getElementById('pmIncApp')?.checked });
    const out = res.data.results || [];
    const ok = out.filter((x) => x.ok && x.why !== '앱 알림으로 이미 받음'), bad = out.filter((x) => !x.ok);
    const nm = (sid) => studentsCache.find((s) => s.id === sid)?.name || sid;
    showMsg('pmMsg', `보냄 ${ok.length}명${bad.length ? ` · 실패 ${bad.length}명 — ${bad.map((x) => nm(x.studentId) + '(' + (x.why || '오류') + ')').join(', ')}` : ''}`, bad.length ? 'error' : 'success');
    await pmLoad(); pmRenderStatus(); pmLoadLogs();
  } catch (e) {
    showMsg('pmMsg', '발송 오류: ' + (e.message || e) + (String(e.code || '').includes('not-found') ? ' — 서버 함수가 아직 안 올라갔어요. 카톡문자_배포.bat 을 먼저 실행해 주세요.' : ''), 'error');
  }
  btn.disabled = false; pmCountSel();
};

// ══ 학생별 받는 방법 설정 ══
window.pmRenderRouteList = function () {
  const el = document.getElementById('pmRouteList'); if (!el) return;
  const q = (document.getElementById('pmRouteSearch')?.value || '').trim();
  const onlyOdd = document.getElementById('pmRouteOdd')?.checked;
  let list = studentsCache.filter((s) => s.branch === pmBranch && s.status !== '퇴원' && (!q || (s.name || '').includes(q)));
  if (onlyOdd) list = list.filter((s) => (s.msgMode && s.msgMode !== 'auto') || pmRoute(s).ch === 'skip');
  list.sort((a, b) => (a.classGroup || '').localeCompare(b.classGroup || '', 'ko') || (a.name || '').localeCompare(b.name || '', 'ko'));
  const cell = 'padding:7px 6px;border-bottom:1px solid rgba(30,24,56,0.07);font-size:13px;vertical-align:middle;';
  const inp = 'padding:6px 8px;border:1px solid rgba(30,24,56,0.15);border-radius:6px;font-family:inherit;font-size:12.5px;background:#fff;color:var(--off-white);';
  el.innerHTML = list.length ? `<div style="overflow-x:auto;max-height:420px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;min-width:680px;">
    <thead><tr style="text-align:left;font-size:11.5px;color:var(--muted);position:sticky;top:0;background:#fff;"><th style="padding:6px;">반</th><th style="padding:6px;">이름</th><th style="padding:6px;">학부모 번호</th><th style="padding:6px;">지금 받는 방법</th><th style="padding:6px;">방식</th><th style="padding:6px;">문자 받을 번호</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr>
      <td style="${cell}color:var(--muted);">${pmEsc(s.classGroup || '-')}</td>
      <td style="${cell}"><b>${pmEsc(s.name)}</b></td>
      <td style="${cell}font-size:12px;">${s.parentPhone ? pmPhoneFmt(s.parentPhone) : '<span style="color:#C8541F;">없음</span>'}</td>
      <td style="${cell}">${pmBadge(pmRoute(s))}</td>
      <td style="${cell}"><select id="pmMode-${s.id}" style="${inp}" onchange="document.getElementById('pmPh-${s.id}').style.visibility=this.value==='sms'?'visible':'hidden'">
        <option value="auto" ${(s.msgMode || 'auto') === 'auto' ? 'selected' : ''}>자동 (앱 → 카톡)</option>
        <option value="sms" ${s.msgMode === 'sms' ? 'selected' : ''}>문자만</option>
        <option value="none" ${s.msgMode === 'none' ? 'selected' : ''}>보내지 않음</option></select></td>
      <td style="${cell}"><input id="pmPh-${s.id}" style="${inp}width:130px;visibility:${s.msgMode === 'sms' ? 'visible' : 'hidden'};" value="${pmEsc(s.msgPhone || '')}" placeholder="비우면 학부모 번호" inputmode="numeric"></td>
      <td style="${cell}"><button class="btn btn-sm btn-primary" onclick="pmSaveRoute('${s.id}')">저장</button></td>
    </tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--muted);font-size:13px;padding:8px 0;">해당 학생이 없습니다.</div>';
};
window.pmSaveRoute = async function (sid) {
  const s = studentsCache.find((x) => x.id === sid); if (!s) return;
  const mode = document.getElementById('pmMode-' + sid).value;
  const phone = pmDigits(document.getElementById('pmPh-' + sid).value);
  if (mode === 'sms' && !phone && !pmDigits(s.parentPhone)) { alert('문자 받을 번호를 적어 주세요.'); return; }
  if (phone && phone.length < 10) { alert('번호를 확인해 주세요.'); return; }
  try {
    await updateDoc(doc(db, 'students', sid), { msgMode: mode, msgPhone: mode === 'sms' ? phone : '' });
    s.msgMode = mode; s.msgPhone = mode === 'sms' ? phone : '';
    showMsg('pmRouteMsg', `✅ ${s.name} — ${mode === 'auto' ? '자동(앱 → 카톡)' : mode === 'sms' ? '문자만 ' + pmPhoneFmt(phone || s.parentPhone) : '보내지 않음'}으로 저장했습니다.`, 'success');
    pmRenderRouteList(); pmRenderStatus();
    if (pmRows.length) { pmRows.forEach((r) => { if (r.s.id === sid) r.route = pmRoute(s); }); pmRenderList(); }
  } catch (e) { showMsg('pmRouteMsg', '저장 실패: ' + e.message, 'error'); }
};

// ══ 등원·하원 자동 알림 + 연동 설정 ══
function pmRenderSettings() {
  const a = document.getElementById('pmAutoAtt'); if (a) a.checked = !!pmCfg.autoAttendance;
  const ab = pmCfg.autoBranches || [];
  ['평촌관', '산본관'].forEach((b) => { const c = document.getElementById('pmAutoBr-' + b); if (c) c.checked = !ab.length || ab.includes(b); });
  const box = document.getElementById('pmCfgBox'); if (!box) return;
  if (!pmIsMaster()) { box.innerHTML = '<div style="font-size:13px;color:var(--muted);">연동 설정은 원장 계정에서만 볼 수 있어요.</div>'; return; }
  const t = pmCfg.templates || {};
  const inp = 'width:100%;padding:9px 12px;border:1px solid rgba(30,24,56,0.15);border-radius:8px;font-family:inherit;font-size:13px;background:#fff;color:var(--off-white);';
  const lab = 'display:block;font-size:12px;color:var(--muted);margin:10px 0 4px;';
  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 14px;">
      <div><label style="${lab}">솔라피 키</label><input id="pmKey" style="${inp}" placeholder="${pmSecretSet ? '저장됨 (바꿀 때만 입력)' : '솔라피 → 개발/연동 → 키 관리'}"></div>
      <div><label style="${lab}">솔라피 비밀키</label><input id="pmSecret" type="password" style="${inp}" placeholder="${pmSecretSet ? '저장됨 (바꿀 때만 입력)' : ''}"></div>
      <div><label style="${lab}">발신번호 (솔라피에 등록한 학원 번호)</label><input id="pmFrom" style="${inp}" value="${pmEsc(pmCfg.from || '')}" placeholder="0313868899"></div>
      <div><label style="${lab}">카카오 채널 연동 아이디 (PF로 시작)</label><input id="pmPf" style="${inp}" value="${pmEsc(pmCfg.pfId || '')}" placeholder="KA01PF..."></div>
    </div>
    <div style="font-size:12.5px;font-weight:700;margin:16px 0 4px;">카톡 템플릿 아이디 — 아래 글을 솔라피에서 그대로 등록하고 승인되면 아이디를 붙여 넣으세요</div>
    ${Object.keys(PM_TPL).map((k) => `<div style="border:1px solid rgba(30,24,56,0.1);border-radius:10px;padding:10px 12px;margin-top:8px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><b style="font-size:13px;">${PM_TPL_NAME[k]}</b>
        <input id="pmTpl-${k}" style="${inp}flex:1;min-width:200px;width:auto;padding:6px 10px;" value="${pmEsc(t[k] || '')}" placeholder="템플릿 아이디 (승인 후)">
        <button class="btn btn-sm" style="background:rgba(30,24,56,0.06);color:var(--off-white);" onclick="pmCopyTpl('${k}')">본문 복사</button></div>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;color:var(--muted);margin:8px 0 0;background:rgba(30,24,56,0.03);padding:8px 10px;border-radius:8px;">${pmEsc(PM_TPL[k])}</pre></div>`).join('')}
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="btn btn-primary" onclick="pmSaveCfg()">연동 설정 저장</button>
      <span style="flex:1;"></span>
      <input id="pmTestPhone" style="${inp}width:150px;" placeholder="시험 받을 번호" inputmode="numeric">
      <select id="pmTestType" style="${inp}width:auto;">${Object.keys(PM_TPL).map((k) => `<option value="${k}">${PM_TPL_NAME[k]}</option>`).join('')}</select>
      <select id="pmTestCh" style="${inp}width:auto;"><option value="kakao">카톡</option><option value="sms">문자</option></select>
      <button class="btn btn-sm" style="background:#2E9E5B;color:#fff;" onclick="pmTest()">시험 발송</button>
    </div>
    <div id="pmCfgMsg" class="msg"></div>`;
}
window.pmCopyTpl = async function (k) { try { await navigator.clipboard.writeText(PM_TPL[k]); showMsg('pmCfgMsg', `「${PM_TPL_NAME[k]}」 본문을 복사했어요. 솔라피 템플릿 등록 화면에 붙여 넣으세요.`, 'success'); } catch (e) { alert(PM_TPL[k]); } };
window.pmSaveCfg = async function () {
  const key = document.getElementById('pmKey').value.trim(), sec = document.getElementById('pmSecret').value.trim();
  const from = pmDigits(document.getElementById('pmFrom').value);
  const templates = {}; Object.keys(PM_TPL).forEach((k) => { const v = document.getElementById('pmTpl-' + k).value.trim(); if (v) templates[k] = v; });
  if ((key && !sec) || (!key && sec)) { alert('솔라피 키와 비밀키는 같이 넣어 주세요.'); return; }
  try {
    if (key) await setDoc(doc(db, 'msgConfig', 'secret'), { apiKey: key, apiSecret: sec, updatedAt: new Date().toISOString() });
    const ready = !!((key || pmSecretSet) && from);
    await setDoc(doc(db, 'msgConfig', 'main'), { from, pfId: document.getElementById('pmPf').value.trim(), templates, ready, updatedAt: new Date().toISOString(), updatedBy: window.currentAdmin?.name || '' }, { merge: true });
    await pmLoadBase(); pmRenderSettings(); pmRenderStatus();
    showMsg('pmCfgMsg', '✅ 저장했습니다.', 'success');
  } catch (e) { showMsg('pmCfgMsg', '저장 실패: ' + e.message, 'error'); }
};
window.pmTest = async function () {
  const phone = pmDigits(document.getElementById('pmTestPhone').value);
  if (phone.length < 10) { alert('시험 받을 번호를 적어 주세요.'); return; }
  try {
    const r = await httpsCallable(functionsInstance, 'msgTest')({ phone, type: document.getElementById('pmTestType').value, channel: document.getElementById('pmTestCh').value });
    showMsg('pmCfgMsg', `✅ 시험 발송 완료 (${r.data.sent === 'kakao' ? '카톡' : '문자'}) — 휴대폰을 확인하세요.`, 'success');
  } catch (e) { showMsg('pmCfgMsg', '시험 발송 실패: ' + e.message, 'error'); }
};
window.pmSaveAuto = async function () {
  const on = document.getElementById('pmAutoAtt').checked;
  const brs = ['평촌관', '산본관'].filter((b) => document.getElementById('pmAutoBr-' + b).checked);
  if (on && !brs.length) { alert('관을 하나 이상 골라 주세요.'); return; }
  try {
    await setDoc(doc(db, 'msgConfig', 'main'), { autoAttendance: on, autoBranches: brs }, { merge: true });
    pmCfg.autoAttendance = on; pmCfg.autoBranches = brs;
    showMsg('pmAutoMsg', on ? `✅ 켰습니다 — ${brs.join(' · ')} 학생이 등원·하원하면 앱이 없는 학부모님께 카톡(안 되면 문자)이 자동으로 가요.` : '자동 알림을 껐습니다. (앱 알림은 그대로 가요)', 'success');
    pmRenderStatus();
  } catch (e) { showMsg('pmAutoMsg', '저장 실패: ' + e.message, 'error'); }
};

// ══ 발송 기록 (선택한 관) ══
async function pmLoadLogs() {
  const el = document.getElementById('pmLogs'); if (!el) return;
  try {
    const qs = await getDocs(query(collection(db, 'msgLogs'), where('month', '==', pmToday().slice(0, 7))));
    const rows = []; qs.forEach((d) => { const x = d.data(); if (x.branch === pmBranch && x.sentAt) rows.push(x); });
    rows.sort((a, b) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0));
    const chName = { kakao: '💬 카톡', sms: '✉️ 단문', lms: '✉️ 장문', app: '📱 앱' };
    const tName = { ...Object.fromEntries(Object.entries(PM_TYPES).map(([k, v]) => [k, v.label])), inout: '등원·하원(자동)' };
    el.innerHTML = rows.length ? rows.slice(0, 80).map((x) => `<div style="display:flex;gap:10px;font-size:12.5px;padding:6px 0;border-bottom:1px solid rgba(30,24,56,0.06);">
      <span style="color:var(--muted);width:92px;flex-shrink:0;">${x.sentAt.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      <b style="width:64px;flex-shrink:0;">${pmEsc(x.studentName || '')}</b>
      <span style="width:110px;flex-shrink:0;">${pmEsc(tName[x.type] || x.type)}</span>
      <span style="color:var(--muted);flex:1;">${pmEsc(x.key || '')}</span>
      <span>${x.ok === false ? `<span style="color:#D64545;">실패 ${pmEsc(x.why || '')}</span>` : (chName[x.channel] || '')}</span></div>`).join('')
      : '<div style="color:var(--muted);font-size:13px;">이번 달 보낸 기록이 없습니다.</div>';
  } catch (e) { el.innerHTML = `<div style="color:var(--muted);font-size:13px;">기록을 불러오지 못했습니다: ${pmEsc(e.message)}</div>`; }
}
window.pmLoadLogs = pmLoadLogs;
