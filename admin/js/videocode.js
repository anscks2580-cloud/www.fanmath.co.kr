'use strict';
/* ═══════════════════════════════════════════════════════════
   영상 고유 코드
   (admin.html에서 분리 — 원본 10513~10925줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════════════════════════════════
// 🔢 영상 고유 코드 시스템
//   형식:  YY-ABCD-NNN   (예: 26-1111-003)
//     YY   : 등록 연도 끝 두 자리 (영상 date 기준, 없으면 올해)
//     A    : 학년·구분  0 중등 / 1 고1 / 2 고2 / 3 고3 / 4 (예비) /
//                      5 기출해설 / 6 수리논술 / 7 Song's Tip / 8 보충강의실 / 9 선생님전용
//     BCD  : 구분별 세부 (아래 표 참고)
//     NNN  : 강 번호 (강의 목록의 순서 기준, 중복 시 다음 빈 번호)
//   ※ 코드는 한 번 부여되면 고정됩니다. (순서를 바꾸거나 제목을 바꿔도 그대로)
//     카테고리를 옮긴 영상은 '확인 필요'로 표시되고, 필요하면 [재발급] 하면 됩니다.
//   ※ 과목·교재·선생님이 추가되면 아래 표에 한 줄만 추가하세요.
// ══════════════════════════════════════════════════════════════════════

// 과목 (A=학년, B=과목 번호) — when: 관리부 안내용 '배우는 시기' (학교마다 다를 수 있으니 필요하면 수정)
const VC_SUBJECTS = {
  '공통수학1': { code:'11', grade:'고1', when:'고1 1학기' },
  '공통수학2': { code:'12', grade:'고1', when:'고1 2학기' },
  '대수':      { code:'21', grade:'고2', when:'고2 1학기' },
  '미적분1':   { code:'22', grade:'고2', when:'고2 2학기' },
  '확통':      { code:'23', grade:'고2', when:'고2~고3 (선택)' },
  '미적분2':   { code:'31', grade:'고3', when:'고3 (선택)' },
  '기하':      { code:'32', grade:'고3', when:'고3 (선택)' },
};
// 구형 기출 태그의 과목명 별칭
const VC_SUBJECT_ALIAS = { '미적분':'미적분1' };

// 교재 (C) — 0 = 교재 구분 없음
const VC_BOOKS = {
  '세쌍둥이개념':   { code:'1', name:'개념편', desc:'기본 개념 강의' },
  '세쌍둥이심화':   { code:'2', name:'심화편', desc:'개념 이후 심화 문제 강의' },
  '세쌍둥이라이트': { code:'3', name:'라이트', desc:'가볍게 핵심만 정리하는 과정' },
  '세쌍둥이파이널': { code:'4', name:'파이널', desc:'시험 대비 마무리' },
};

// 선생님 (D) — 0 = 선생님 구분 없음 / 새 선생님은 8, 9 순서로 추가
const VC_TEACHERS = {
  '송우찬 원장T':'1', '송문찬 원장T':'2', '공민정T':'3', '조현주 부원장T':'4',
  '김영진T':'5', '신민훈T':'6', '장미현T':'7',
};

// 보충강의실 관
const VC_BRANCH = { '평촌':'1', '산본':'2' };

// 기출 시험 구분
const VC_EXAMS = { '':'0', '1중간':'1', '1기말':'2', '2중간':'3', '2기말':'4' };
const VC_EXAM_LABEL = { '':'연도 전체', '1중간':'1학기 중간', '1기말':'1학기 기말', '2중간':'2학기 중간', '2기말':'2학기 기말' };

const VC_CODE_RE = /^\d{2}-\d{4}-\d{3}$/;

function vcEsc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function vcPad(n) { return String(n).padStart(3, '0'); }

// 태그 → 코드 앞부분(ABCD) + 관리부용 설명
function vcParseTag(tagRaw) {
  const tag = (tagRaw || '').trim();
  if (!tag) return null;
  let m;

  // 중등
  if ((m = tag.match(/^중([123])$/))) {
    return { prefix:`0${m[1]}00`, type:'중등', grade:`중${m[1]}`, when:`중${m[1]}`, subject:`중${m[1]} 수학`, book:'', teacher:'' };
  }

  // 고등 강의: 과목 / 과목_교재 / 과목_교재_선생님
  const parts = tag.split('_');
  if (VC_SUBJECTS[parts[0]]) {
    const s = VC_SUBJECTS[parts[0]];
    const b = parts[1] ? VC_BOOKS[parts[1]] : null;
    if (parts[1] && !b) return null;
    const tName = parts.slice(2).join('_');
    const tCode = tName ? VC_TEACHERS[tName] : '0';
    if (!tCode) return null;
    return {
      prefix: s.code + (b ? b.code : '0') + tCode,
      type: s.grade, grade: s.grade, when: s.when,
      subject: parts[0], book: b ? b.name : '', bookDesc: b ? b.desc : '', teacher: tName,
    };
  }

  // 기출해설 (신형): 기출_고1_2025 / 기출_고1_2025_1중간
  if ((m = tag.match(/^기출_고([123])_(\d{4})(?:_(1중간|1기말|2중간|2기말))?$/))) {
    const ex = m[3] || '';
    return {
      prefix: `5${m[1]}${VC_EXAMS[ex]}${m[2].slice(-1)}`,
      type:'기출해설', grade:`고${m[1]}`, when:`고${m[1]} 내신 대비`,
      subject:`${m[2]}년 ${VC_EXAM_LABEL[ex]} 기출`, book:'', teacher:'',
    };
  }
  // 기출해설 (구형): 기출_공통수학1 등 / 기출해설
  if ((m = tag.match(/^기출_(.+)$/))) {
    const sName = VC_SUBJECT_ALIAS[m[1]] || m[1];
    const s = VC_SUBJECTS[sName];
    if (s) return { prefix:`59${s.code}`, type:'기출해설', grade:s.grade, when:`${s.grade} 내신 대비`, subject:`${sName} 기출 (구형)`, book:'', teacher:'' };
  }
  if (tag === '기출해설') return { prefix:'5900', type:'기출해설', grade:'', when:'내신 대비', subject:'기출해설 (구형)', book:'', teacher:'' };

  if (tag === '수리논술') return { prefix:'6000', type:'수리논술', grade:'고2~N수', when:'논술 전형 대비', subject:'수리논술', book:'', teacher:'' };

  if ((m = tag.match(/^송팁_(.+)$/)) && VC_SUBJECTS[m[1]]) {
    const s = VC_SUBJECTS[m[1]];
    return { prefix:`7${s.code}0`, type:"Song's Tip", grade:s.grade, when:s.when, subject:`Song's Tip · ${m[1]}`, book:'', teacher:'' };
  }

  if ((m = tag.match(/^보충_(평촌|산본)_(.+)$/)) && VC_TEACHERS[m[2]]) {
    return { prefix:`8${VC_BRANCH[m[1]]}${VC_TEACHERS[m[2]]}0`, type:'보충강의실', grade:'', when:'반별 보충', subject:`보충강의실 · ${m[1]}관`, book:'', teacher:m[2] };
  }

  if (tag === '선생님전용') return { prefix:'9000', type:'선생님전용', grade:'', when:'학생 비공개', subject:'선생님전용', book:'', teacher:'' };

  return null;
}

// 영상의 등록 연도 두 자리
function vcYear(v) {
  const src = String(v.date || v.createdAt || '');
  const m = src.match(/(20\d{2})/);
  return (m ? m[1] : String(new Date().getFullYear())).slice(-2);
}

// 현재 사용 중인 코드 집합
function vcUsedCodes(excludeId) {
  const set = new Set();
  videosCache.forEach(v => { if (v.code && v.id !== excludeId) set.add(v.code); });
  return set;
}

// 코드 생성: 강의 순서 번호를 우선 사용, 이미 쓰였으면 같은 묶음의 다음 빈 번호
function generateVideoCode(v, used, allowOrder = true) {
  const p = vcParseTag(v.tag);
  if (!p) return null;
  const base = `${vcYear(v)}-${p.prefix}-`;
  const ord = Number(v.order);
  if (allowOrder && ord >= 1 && ord <= 999 && !used.has(base + vcPad(ord))) {
    used.add(base + vcPad(ord));
    return base + vcPad(ord);
  }
  let max = 0;
  used.forEach(c => { if (c.startsWith(base)) max = Math.max(max, Number(c.slice(base.length)) || 0); });
  let n = max + 1;
  while (used.has(base + vcPad(n)) && n < 999) n++;
  if (n > 999) return null;
  used.add(base + vcPad(n));
  return base + vcPad(n);
}
window.generateVideoCode = generateVideoCode;

// 코드 앞부분(ABCD) → 대표 태그 (코드만 보고 해석할 때 사용)
function vcPrefixMap() {
  const map = {};
  const tags = new Set([
    ...VIDEO_GROUPS.flatMap(g => g.tags).filter(Boolean),
    ...KNOWN_TAGS_SYNC,
    ...videosCache.map(v => v.tag).filter(Boolean),
  ]);
  tags.forEach(t => { const p = vcParseTag(t); if (p && !map[p.prefix]) map[p.prefix] = p; });
  return map;
}

// 영상 1개의 표시 정보
function vcInfo(v) {
  const p = vcParseTag(v.tag);
  const mismatch = !!(v.code && p && v.code.split('-')[1] !== p.prefix);
  const seq = v.code ? Number(v.code.split('-')[2]) : (v.order != null ? Number(v.order) : null);
  return { p, mismatch, seq };
}

function vcDescribe(p) {
  if (!p) return '';
  return [p.grade, p.subject, p.book, p.teacher].filter(Boolean).join(' · ');
}

// ── 코드표 (범례) ──
function renderVideoCodeLegend() {
  const el = document.getElementById('vcLegend');
  if (!el || el.dataset.done) return;
  const subj = Object.entries(VC_SUBJECTS).map(([n, s]) => `<div><code>${s.code}</code>${n} <span style="color:var(--muted);">— ${s.when}</span></div>`).join('');
  const books = `<div><code>0</code>교재 구분 없음</div>` + Object.values(VC_BOOKS).map(b => `<div><code>${b.code}</code>${b.name} <span style="color:var(--muted);">— ${b.desc}</span></div>`).join('');
  const teachers = `<div><code>0</code>선생님 구분 없음</div>` + Object.entries(VC_TEACHERS).map(([n, c]) => `<div><code>${c}</code>${n}</div>`).join('');
  el.innerHTML = `
    <div class="vc-legend-grid">
      <div class="vc-legend-box"><b class="t">① 가운데 첫 숫자 = 학년·구분</b>
        <div><code>0</code>중등</div><div><code>1</code>고1 강의</div><div><code>2</code>고2 강의</div><div><code>3</code>고3 강의</div>
        <div><code>4</code><span style="color:var(--muted);">(비워둠 — 추후 과정 추가용)</span></div>
        <div><code>5</code>기출해설</div><div><code>6</code>수리논술</div><div><code>7</code>Song's Tip</div>
        <div><code>8</code>보충강의실</div><div><code>9</code>선생님전용</div>
      </div>
      <div class="vc-legend-box"><b class="t">② 고등 강의 (가운데 1~3으로 시작)</b>
        <div style="color:var(--muted);margin-bottom:4px;">앞 두 자리 = 과목</div>${subj}
      </div>
      <div class="vc-legend-box"><b class="t">③ 셋째 자리 = 교재</b>${books}</div>
      <div class="vc-legend-box"><b class="t">④ 넷째 자리 = 선생님</b>${teachers}</div>
      <div class="vc-legend-box"><b class="t">⑤ 그 외 구분</b>
        <div><code>0100</code>중1 · <code>0200</code>중2 · <code>0300</code>중3</div>
        <div><code>5ABC</code>기출해설 — A 학년, B 시험(0 전체·1 1학기중간·2 1학기기말·3 2학기중간·4 2학기기말), C 시험연도 끝자리</div>
        <div style="color:var(--muted);">예) 5135 = 고1 · 2학기 중간 · 2025년</div>
        <div><code>59__</code>구형 기출 (뒤 두 자리 = 과목)</div>
        <div><code>6000</code>수리논술</div>
        <div><code>7__0</code>Song's Tip (가운데 두 자리 = 과목)</div>
        <div><code>8AB0</code>보충강의실 — A 관(1 평촌·2 산본), B 선생님</div>
        <div><code>9000</code>선생님전용</div>
      </div>
      <div class="vc-legend-box"><b class="t">⑥ 예시</b>
        <div><code>26-1111-003</code>2026 · 고1 공통수학1 · 개념편 · 송우찬T · 3강</div>
        <div><code>26-2222-012</code>2026 · 고2 미적분1 · 심화편 · 송문찬T · 12강</div>
        <div><code>26-1240-005</code>2026 · 고1 공통수학2 · 파이널 · 5강</div>
        <div><code>26-5135-002</code>2026 등록 · 고1 2025년 2학기 중간 기출 · 2번</div>
        <div><code>26-8120-001</code>2026 · 보충강의실 평촌관 송문찬T · 1번</div>
      </div>
    </div>`;
  el.dataset.done = '1';
}

// ── 탭 초기화 ──
window.initVideoCodeTab = async function () {
  renderVideoCodeLegend();
  const tSel = document.getElementById('vcFilterTeacher');
  if (tSel && tSel.options.length <= 1) {
    tSel.innerHTML = '<option value="">선생님 전체</option>' +
      Object.keys(VC_TEACHERS).map(t => `<option value="${vcEsc(t)}">${vcEsc(t)}</option>`).join('');
  }
  if (!videosCache.length) { try { await loadVideos(); } catch (e) {} }
  renderVideoCodeTab();
};

function vcFilteredList() {
  const q = (document.getElementById('vcSearch')?.value || '').trim();
  const type = document.getElementById('vcFilterType')?.value || '';
  const book = document.getElementById('vcFilterBook')?.value || '';
  const teacher = document.getElementById('vcFilterTeacher')?.value || '';
  // 영상 코드: 하이픈(-, ‐, –, —, －)·공백·점 등 구분기호를 모두 무시하고 숫자만 비교
  const qCode = q.toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]/g, '');
  const qText = q.toLowerCase();

  let list = videosCache.map(v => ({ v, ...vcInfo(v) }));

  if (type === '__nocode') list = list.filter(x => !x.v.code);
  else if (type === '__mismatch') list = list.filter(x => x.mismatch || (x.v.code && !x.p));
  else if (type) list = list.filter(x => x.p && x.p.type === type);
  if (book) list = list.filter(x => x.p && x.p.book === book);
  if (teacher) list = list.filter(x => x.p && x.p.teacher === teacher);

  if (q) {
    list = list.filter(x => {
      const code = String(x.v.code || '').replace(/\D/g, '');
      if (qCode && /^\d+$/.test(qCode) && code.includes(qCode)) return true;
      const hay = [x.v.code, x.v.title, x.v.tag, x.p && x.p.subject, x.p && x.p.book, x.p && x.p.teacher, x.p && x.p.when, x.v.vimeoId]
        .filter(Boolean).join(' ').toLowerCase();
      return qText.split(/\s+/).every(w => hay.includes(w));
    });
  }

  list.sort((a, b) => {
    if (!!a.v.code !== !!b.v.code) return a.v.code ? -1 : 1;
    if (a.v.code && b.v.code) {
      // 같은 연도 안에서 과목 순 → 강 순 (연도는 최신이 위)
      const [ay, ap, an] = a.v.code.split('-'), [by, bp, bn] = b.v.code.split('-');
      return ap.localeCompare(bp) || by.localeCompare(ay) || an.localeCompare(bn);
    }
    return (a.v.tag || '').localeCompare(b.v.tag || '') || (Number(a.v.order) || 9999) - (Number(b.v.order) || 9999);
  });
  return list;
}

// 검색어가 코드 형태면 의미 풀이
function renderVcDecode(q) {
  const el = document.getElementById('vcDecode');
  if (!el) return;
  const digits = q.replace(/[^0-9a-z가-힣ㄱ-ㅎ]/gi, '');
  if (!/^\d{6,9}$/.test(digits)) { el.style.display = 'none'; return; }
  const yy = digits.slice(0, 2), prefix = digits.slice(2, 6), seq = digits.slice(6);
  const p = vcPrefixMap()[prefix];
  if (!p) {
    el.style.display = 'block';
    el.innerHTML = `⚠️ <b>${yy}-${prefix}</b> 은(는) 코드표에 없는 번호예요. 코드를 다시 확인해주세요.`;
    return;
  }
  el.style.display = 'block';
  el.innerHTML = `💡 <b style="color:var(--gold);font-family:'SF Mono',Menlo,Consolas,monospace;">${yy}-${prefix}${seq ? '-' + seq : ''}</b> 는
    <b>20${yy}년 등록</b> · <b>${vcEsc(vcDescribe(p))}</b>${seq ? ` · <b>${Number(seq)}${p.type === '기출해설' ? '번' : '강'}</b>` : ''}
    <span style="color:var(--muted);">(배우는 시기: ${vcEsc(p.when)})</span>`;
}

window.renderVideoCodeTab = function () {
  const tbody = document.getElementById('vcTbody');
  if (!tbody) return;
  const q = (document.getElementById('vcSearch')?.value || '').trim();
  renderVcDecode(q);

  const list = vcFilteredList();
  const total = videosCache.length;
  const noCode = videosCache.filter(v => !v.code).length;
  const mism = videosCache.filter(v => vcInfo(v).mismatch).length;
  document.getElementById('vcSummary').innerHTML =
    `전체 ${total}개 중 <b style="color:var(--off-white);">${list.length}개</b> 표시` +
    (noCode ? ` · <span style="color:#ffd060;">코드 없음 ${noCode}개</span>` : '') +
    (mism ? ` · <span style="color:#ffd060;">확인 필요 ${mism}개</span>` : '');

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--muted);padding:16px;">검색 결과가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(({ v, p, mismatch, seq }) => `
    <tr>
      <td>
        ${v.code
          ? `<span class="vc-code" title="클릭하면 복사" onclick="copyVideoCode('${vcEsc(v.code)}')">${vcEsc(v.code)}</span>`
          : `<span class="vc-code none">${p ? '미부여' : '—'}</span>`}
        ${mismatch ? `<span class="vc-warn" title="코드 부여 후 카테고리가 바뀌었어요. 필요하면 재발급하세요.">확인 필요</span>` : ''}
        ${!p ? `<span class="vc-warn" title="카테고리가 비어있거나 코드표에 없는 카테고리예요.">미분류</span>` : ''}
      </td>
      <td style="white-space:nowrap;">${p ? `<b>${vcEsc(p.grade || '-')}</b> <span style="color:var(--muted);">${vcEsc(p.when)}</span>` : '<span style="color:var(--muted);">-</span>'}</td>
      <td>${p ? vcEsc(p.subject) : `<span style="color:var(--muted);">${vcEsc(v.tag || '태그 없음')}</span>`}</td>
      <td style="white-space:nowrap;" title="${p && p.bookDesc ? vcEsc(p.bookDesc) : ''}">${p && p.book ? vcEsc(p.book) : '<span style="color:var(--muted);">-</span>'}</td>
      <td style="white-space:nowrap;">${p && p.teacher ? vcEsc(p.teacher) : '<span style="color:var(--muted);">-</span>'}</td>
      <td style="white-space:nowrap;color:var(--gold);">${seq != null && !isNaN(seq) ? seq : '-'}</td>
      <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${vcEsc(v.title)}">${vcEsc(v.title || '-')}</td>
      <td style="white-space:nowrap;text-align:right;">
        ${v.vimeoId ? `<a href="https://vimeo.com/${vcEsc(v.vimeoId)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">▶ 보기</a>` : ''}
        ${p ? `<button class="btn btn-secondary btn-sm" onclick="editVideoCode('${vcEsc(v.id)}')">수정</button>` : ''}
        ${p && (mismatch || !v.code) ? `<button class="btn btn-secondary btn-sm" style="border-color:var(--gold);color:var(--gold);" onclick="reissueVideoCode('${vcEsc(v.id)}')">${v.code ? '재발급' : '부여'}</button>` : ''}
      </td>
    </tr>`).join('');
};

window.copyVideoCode = async function (code) {
  try { await navigator.clipboard.writeText(code); showToast(`📋 ${code} 복사됨`); }
  catch (e) { showToast(code); }
};

// ── 코드 없는 영상 일괄 부여 ──
window.assignMissingVideoCodes = async function () {
  const targets = videosCache.filter(v => !v.code && vcParseTag(v.tag));
  const unparsable = videosCache.filter(v => !v.code && !vcParseTag(v.tag)).length;
  if (!targets.length) {
    showToast(unparsable ? `⚠️ 부여할 영상이 없어요. (미분류 ${unparsable}개는 카테고리부터 지정해주세요)` : '✅ 모든 영상에 코드가 있어요.');
    return;
  }
  if (!confirm(`코드가 없는 영상 ${targets.length}개에 코드를 부여할까요?\n\n· 강의 목록의 순서 번호가 그대로 강 번호가 됩니다.\n· 한 번 부여된 코드는 순서를 바꿔도 바뀌지 않아요.` +
    (unparsable ? `\n· 카테고리가 없는 영상 ${unparsable}개는 건너뜁니다.` : ''))) return;

  const used = vcUsedCodes();
  const sorted = [...targets].sort((a, b) =>
    (a.tag || '').localeCompare(b.tag || '') || (Number(a.order) || 9999) - (Number(b.order) || 9999) || (a.date || '').localeCompare(b.date || ''));

  // 1차: 순서 번호가 비어있는 경우 그대로 사용 / 2차: 겹치는 영상은 다음 빈 번호
  const assigned = new Map();
  sorted.forEach(v => {
    const p = vcParseTag(v.tag);
    const ord = Number(v.order);
    const c = `${vcYear(v)}-${p.prefix}-${vcPad(ord)}`;
    if (ord >= 1 && ord <= 999 && !used.has(c)) { used.add(c); assigned.set(v.id, c); }
  });
  sorted.forEach(v => {
    if (assigned.has(v.id)) return;
    const c = generateVideoCode(v, used, false);
    if (c) assigned.set(v.id, c);
  });

  const now = new Date().toISOString();
  let ok = 0, fail = 0;
  for (const [id, code] of assigned) {
    try {
      await updateDoc(doc(db, 'videos', id), { code, codeAssignedAt: now });
      const c = videosCache.find(v => v.id === id); if (c) c.code = code;
      ok++;
    } catch (e) { console.error('코드 부여 실패', id, e); fail++; }
  }
  showToast(`✅ ${ok}개 코드 부여 완료${fail ? ` · 실패 ${fail}개` : ''}`);
  renderVideoCodeTab();
  renderVideos();
};

// ── 코드 직접 수정 ──
window.editVideoCode = async function (id) {
  const v = videosCache.find(x => x.id === id);
  if (!v) return;
  const input = prompt(`"${v.title}"\n\n새 코드를 입력하세요. (형식: 26-1111-003)\n비워두면 코드가 삭제됩니다.`, v.code || '');
  if (input === null) return;
  let code = input.trim();
  if (/^\d{9}$/.test(code.replace(/\D/g, ''))) { code = code.replace(/\D/g, ''); }
  if (/^\d{9}$/.test(code)) code = `${code.slice(0,2)}-${code.slice(2,6)}-${code.slice(6)}`;
  if (code && !VC_CODE_RE.test(code)) { alert('형식이 맞지 않아요. 예) 26-1111-003'); return; }
  if (code && vcUsedCodes(id).has(code)) {
    const other = videosCache.find(x => x.code === code && x.id !== id);
    alert(`이미 사용 중인 코드예요.\n→ ${other ? other.title : ''}`); return;
  }
  try {
    await updateDoc(doc(db, 'videos', id), { code: code || null, codeAssignedAt: new Date().toISOString() });
    v.code = code || null;
    showToast(code ? `✅ ${code} 저장` : '코드 삭제됨');
    renderVideoCodeTab(); renderVideos();
  } catch (e) { alert('저장 실패: ' + e.message); }
};

// ── 재발급 (카테고리를 옮긴 영상 등) ──
window.reissueVideoCode = async function (id) {
  const v = videosCache.find(x => x.id === id);
  if (!v) return;
  const code = generateVideoCode(v, vcUsedCodes(id));
  if (!code) { alert('이 영상의 카테고리로는 코드를 만들 수 없어요. 카테고리를 먼저 지정해주세요.'); return; }
  if (v.code && !confirm(`코드를 다시 발급할까요?\n\n${v.code}  →  ${code}\n\n※ 학생·학부모에게 이미 안내한 코드가 있다면 바뀐다는 점 참고하세요.`)) return;
  try {
    await updateDoc(doc(db, 'videos', id), { code, codeAssignedAt: new Date().toISOString() });
    v.code = code;
    showToast(`✅ ${code} 발급`);
    renderVideoCodeTab(); renderVideos();
  } catch (e) { alert('저장 실패: ' + e.message); }
};


