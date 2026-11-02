'use strict';
/* ═══════════════════════════════════════════════════════════
   기출문제 (Storage)
   (admin.html에서 분리 — 원본 11086~11361줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 📚 기출문제 — Storage 경로 (지역 구분 없음)
//   고2      : pastExams/시험명/고2/과목/파일.pdf   (과목: 미적분1 · 확률과 통계 · 기하)
//   그 외 학년: pastExams/시험명/학년/파일.pdf
// 선생님 포털(teacher.html "기출문제" 탭)에서 열람. 업로드·삭제는 관리자만 (storage.rules)
// ※ 예전 구조(…/학년/지역/파일.pdf)로 올라간 파일도 그대로 읽힘 — 지역 폴더는 무시
// ══════════════════════════════════════════
const PXA_GRADES   = ['중1','중2','중3','고1','고2','고3'];
const PXA_SUBJECTS = ['미적분1','확률과 통계','기하'];
const PXA_SUBJECT_GRADES = ['고2'];     // 과목으로 나누는 학년
const PXA_UNSORTED = '과목 미분류';
const PXA_MAX_MB  = 50;
let pxaQueue = [];      // 폴더 선택으로 준비된 업로드 목록
let pxaData  = {};      // 시험명 → [{ grade, subject, name, path }]
let pxaBusy  = false;

function pxaEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function pxaOrder(order) {
  return (a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, 'ko');
  };
}
function pxaExamScore(name) {
  const m = String(name).match(/(\d{4})\s*년?\s*(\d)\s*학기\s*(중간|기말)?/);
  if (!m) return 0;
  return (+m[1]) * 100 + (+m[2]) * 10 + (m[3] === '기말' ? 2 : m[3] === '중간' ? 1 : 0);
}
// 저장 경로에 쓰면 곤란한 문자만 바꿔줌 (한글·공백은 그대로)
function pxaClean(s) { return String(s).normalize('NFC').trim().replace(/[#\[\]\*\?\/\\]/g, '_'); }
// 폴더 이름 → 학년 ("고2", "고등2학년", "중 1" 등)
function pxaGradeOf(part) {
  const m = String(part).normalize('NFC').replace(/\s/g, '').match(/^(중|고)(?:등학교|등)?([123])(?:학년)?/);
  return m ? m[1] + m[2] : '';
}
// 폴더/파일 이름 → 고2 과목
function pxaSubjectOf(text) {
  const t = String(text).normalize('NFC').replace(/\s/g, '');
  if (/확률|확통/.test(t)) return '확률과 통계';
  if (/미적/.test(t)) return '미적분1';
  if (/기하/.test(t)) return '기하';
  return '';
}
// 학년 폴더 아래 경로 조각들(+파일명)로 과목 결정 — 고2만
function pxaPickSubject(grade, folders, fileName) {
  if (!PXA_SUBJECT_GRADES.includes(grade)) return '';
  for (const f of folders) { const s = pxaSubjectOf(f); if (s) return s; }
  return pxaSubjectOf(fileName) || PXA_UNSORTED;
}
function pxaLabel(grade, subject) { return subject ? `${grade} · ${subject}` : grade; }
// 분류 선택지: 중1 … 고1, 고2 · 미적분1, 고2 · 확률과 통계, 고2 · 기하, 고2 · 과목 미분류, 고3
function pxaClassOptions(grade, subject) {
  const cur = grade + '|' + (subject || '');
  const opts = [];
  PXA_GRADES.forEach(g => {
    if (PXA_SUBJECT_GRADES.includes(g)) PXA_SUBJECTS.concat([PXA_UNSORTED]).forEach(sb => opts.push([g, sb]));
    else opts.push([g, '']);
  });
  if (!opts.some(([g, sb]) => g + '|' + sb === cur)) opts.push([grade, subject || '']);
  return opts.map(([g, sb]) => `<option value="${pxaEsc(g + '|' + sb)}"${g + '|' + sb === cur ? ' selected' : ''}>${pxaEsc(pxaLabel(g, sb))}</option>`).join('');
}
const PXA_SEL_STYLE = 'padding:4px 6px;font-size:12.5px;border:1px solid var(--border-soft);border-radius:6px;background:#fff;color:var(--off-white);font-family:inherit;max-width:170px;';
function pxaPath(it) {
  return `pastExams/${pxaClean(it.exam)}/${pxaClean(it.grade)}/` + (it.subject ? `${pxaClean(it.subject)}/` : '') + pxaClean(it.name);
}
function pxaMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!text) { el.style.display = 'none'; return; }
  el.className = 'msg ' + (type || 'success');
  el.innerHTML = text;
  el.style.display = 'block';
}

window.initPastExamAdminTab = async () => {
  const g = document.getElementById('pxa-m-grade'), s = document.getElementById('pxa-m-subject');
  if (g && !g.options.length) g.innerHTML = PXA_GRADES.map(v => `<option>${v}</option>`).join('');
  if (s && !s.options.length) s.innerHTML = PXA_SUBJECTS.map(v => `<option>${v}</option>`).join('');
  pxaToggleSubject();
  await pxaLoadList();
};
window.pxaToggleSubject = () => {
  const g = document.getElementById('pxa-m-grade'), w = document.getElementById('pxa-m-subjectwrap');
  if (g && w) w.style.display = PXA_SUBJECT_GRADES.includes(g.value) ? '' : 'none';
};

function pxaFillExamSelect() {
  const sel = document.getElementById('pxa-m-exam');
  if (!sel) return;
  const prev = sel.value;
  const exams = Object.keys(pxaData).sort((a, b) => (pxaExamScore(b) - pxaExamScore(a)) || b.localeCompare(a, 'ko'));
  sel.innerHTML = exams.map(e => `<option value="${pxaEsc(e)}">${pxaEsc(e)}</option>`).join('') +
    '<option value="__new__">+ 새 시험 만들기</option>';
  sel.value = exams.includes(prev) ? prev : (exams[0] || '__new__');
  pxaToggleNewExam();
}
window.pxaToggleNewExam = () => {
  const isNew = document.getElementById('pxa-m-exam').value === '__new__';
  document.getElementById('pxa-m-newwrap').style.display = isNew ? '' : 'none';
};

// ── 폴더 선택 → 경로에서 시험명/학년(/고2 과목) 자동 분류 ──
// 학년 폴더 바로 위 폴더가 시험명. 학년 폴더 아래 지역 폴더 등은 무시.
// 고2는 하위 폴더 이름이나 파일 이름에서 미적분1·확률과 통계·기하를 찾아 나눔.
window.pxaOnFolder = (input) => {
  const ok = [], bad = [];
  [...input.files].forEach(f => {
    const rel = (f.webkitRelativePath || f.name).normalize('NFC');
    const parts = rel.split('/');
    const base = parts[parts.length - 1];
    if (base.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(base)) return;
    if (!/\.pdf$/i.test(base)) { bad.push(rel + ' — PDF가 아님'); return; }
    if (f.size > PXA_MAX_MB * 1024 * 1024) { bad.push(rel + ` — ${PXA_MAX_MB}MB 초과`); return; }
    const folders = parts.slice(0, -1);
    const gi = folders.findIndex(p => pxaGradeOf(p));
    if (gi === -1) { bad.push(rel + ' — 학년 폴더(중1~고3) 안에 있지 않음'); return; }
    const grade = pxaGradeOf(folders[gi]);
    const exam = gi >= 1 ? folders[gi - 1] : '';
    ok.push({ file: f, exam, grade, subject: pxaPickSubject(grade, folders.slice(gi + 1), base), name: base });
  });
  pxaQueue = ok;
  pxaMsg('pxa-folder-msg', '');
  pxaRenderPreview(bad);
};

function pxaGroupKeys(items) {
  const keys = [...new Set(items.map(x => x.grade + '\u0000' + (x.subject || '')))];
  return keys.sort((a, b) => {
    const [ga, sa] = a.split('\u0000'), [gb, sb] = b.split('\u0000');
    return pxaOrder(PXA_GRADES)(ga, gb) || pxaOrder(PXA_SUBJECTS)(sa, sb);
  });
}

function pxaRenderPreview(bad = []) {
  pxaLastBad = bad;
  const box = document.getElementById('pxa-preview');
  if (!pxaQueue.length) {
    box.innerHTML = bad.length
      ? `<div style="color:#D64545;font-size:13px;margin-bottom:8px;">올릴 수 있는 PDF가 없습니다.</div>${pxaBadList(bad)}`
      : '<div style="color:var(--muted);font-size:13px;">선택한 폴더에 PDF가 없습니다.</div>';
    return;
  }
  const exams = [...new Set(pxaQueue.map(x => x.exam))];
  const tables = exams.map(exam => {
    const items = pxaQueue.filter(x => x.exam === exam);
    const exists = exam && pxaData[pxaClean(exam)] ? ` <span style="color:#D97B1A;font-size:12px;font-weight:500;">· 이미 있는 시험 — 같은 이름 파일은 덮어씀</span>` : '';
    const td = 'padding:6px 10px;border-bottom:1px solid rgba(30,24,56,0.05);';
    const rows = pxaGroupKeys(items).map(k => {
      const [g, s] = k.split('\u0000');
      const c = items.filter(x => x.grade === g && (x.subject || '') === s).length;
      const warn = s === PXA_UNSORTED ? ' style="color:#D97B1A;"' : '';
      return `<tr><td style="${td}font-weight:600;color:var(--off-white);"><span${warn}>${pxaEsc(pxaLabel(g, s))}</span></td><td style="${td}text-align:right;color:var(--off-white);">${c}개</td></tr>`;
    }).join('');
    const un = pxaQueue.map((x, i) => [x, i]).filter(([x]) => x.exam === exam && x.subject === PXA_UNSORTED);
    const unsorted = un.length ? `<div style="margin-top:10px;padding:10px 12px;border:1px solid rgba(217,123,26,0.35);border-radius:8px;background:rgba(217,123,26,0.05);">
        <div style="font-size:12.5px;color:#D97B1A;font-weight:600;margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          과목을 이름에서 찾지 못한 고2 파일 ${un.length}개 — 올리기 전에 과목을 골라주세요
          <select style="${PXA_SEL_STYLE}" data-exam="${pxaEsc(exam)}" onchange="pxaQueueSetAll(this)"><option value="">한꺼번에 지정…</option>${PXA_SUBJECTS.map(sb => `<option>${sb}</option>`).join('')}</select>
        </div>
        ${un.map(([x, i]) => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--off-white);">📄 ${pxaEsc(x.name)}</span>
          <select style="${PXA_SEL_STYLE}" data-i="${i}" onchange="pxaQueueSet(this)">${PXA_SUBJECTS.concat([PXA_UNSORTED]).map(sb => `<option${sb === x.subject ? ' selected' : ''}>${sb}</option>`).join('')}</select>
        </div>`).join('')}
      </div>` : '';
    return `<div style="margin-bottom:14px;">
      <div style="font-size:14px;font-weight:700;color:var(--off-white);margin-bottom:8px;">${exam ? pxaEsc(exam) : '<span style="color:#D64545;">(시험명 폴더 없음 — 아래에 시험명 입력)</span>'} <span style="color:var(--purple, #5B3FA6);">${items.length}개</span>${exists}</div>
      <table style="border-collapse:collapse;font-size:13px;min-width:260px;">${rows}</table>${unsorted}</div>`;
  }).join('');
  const rename = exams.length === 1
    ? `<div class="form-group" style="max-width:420px;margin-bottom:12px;"><label>시험명 (필요하면 수정)</label><input type="text" id="pxa-exam-name" value="${pxaEsc(exams[0])}" placeholder="예: 2026년 2학기 기말고사"></div>`
    : '';
  box.innerHTML = tables + (bad.length ? pxaBadList(bad) : '') + rename +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary" id="pxa-folder-btn" onclick="pxaUploadFolder()">${pxaQueue.length}개 업로드</button>
      <button class="btn btn-secondary" onclick="pxaCancelFolder()">취소</button>
    </div>`;
}
window.pxaQueueSet = (sel) => {
  const it = pxaQueue[+sel.dataset.i];
  if (it) it.subject = sel.value;
};
window.pxaQueueSetAll = (sel) => {
  if (!sel.value) return;
  pxaQueue.forEach(x => { if (x.exam === sel.dataset.exam && x.subject === PXA_UNSORTED) x.subject = sel.value; });
  pxaRenderPreview(pxaLastBad);
};
let pxaLastBad = [];
function pxaBadList(bad) {
  return `<details style="margin:4px 0 14px;font-size:12.5px;color:#D97B1A;"><summary style="cursor:pointer;">제외된 파일 ${bad.length}개</summary>
    <div style="margin-top:6px;line-height:1.7;color:var(--muted);">${bad.slice(0, 200).map(pxaEsc).join('<br>')}</div></details>`;
}
window.pxaCancelFolder = () => {
  pxaQueue = [];
  document.getElementById('pxa-folder').value = '';
  document.getElementById('pxa-preview').innerHTML = '';
  pxaMsg('pxa-folder-msg', '');
};

// ── 공통 업로드 (동시에 4개씩) ──
async function pxaUpload(items, msgId, btn) {
  if (pxaBusy) { alert('다른 업로드가 진행 중입니다.'); return false; }
  pxaBusy = true;
  const btnText = btn ? btn.textContent : '';
  if (btn) btn.disabled = true;
  let done = 0, i = 0;
  const failed = [];
  const tick = () => pxaMsg(msgId, `업로드 중... ${done + failed.length} / ${items.length}`, 'success');
  tick();
  async function worker() {
    while (i < items.length) {
      const it = items[i++];
      try {
        await uploadBytes(ref(storage, pxaPath(it)), it.file, { contentType: 'application/pdf' });
        done++;
      } catch (e) { failed.push(`${pxaLabel(it.grade, it.subject)}/${it.name} (${e.code || e.message})`); }
      tick();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  pxaBusy = false;
  if (btn) { btn.disabled = false; btn.textContent = btnText; }
  if (failed.length) {
    pxaMsg(msgId, `${done}개 완료 · <b>${failed.length}개 실패</b><br>${failed.slice(0, 30).map(pxaEsc).join('<br>')}`, 'error');
  } else {
    pxaMsg(msgId, `✓ ${done}개 업로드 완료 — 선생님 포털 "기출문제" 탭에 바로 보입니다.`, 'success');
  }
  await pxaLoadList();
  return !failed.length;
}

window.pxaUploadFolder = async () => {
  if (!pxaQueue.length) return;
  const nameEl = document.getElementById('pxa-exam-name');
  let items = pxaQueue;
  if (nameEl) {
    const nm = nameEl.value.trim();
    if (!nm) { alert('시험명을 입력해주세요.'); nameEl.focus(); return; }
    items = pxaQueue.map(x => ({ ...x, exam: nm }));
  } else if (items.some(x => !x.exam)) {
    alert('시험명 폴더가 없는 파일이 있습니다. 시험명 폴더째로 골라주세요.'); return;
  }
  const ok = await pxaUpload(items, 'pxa-folder-msg', document.getElementById('pxa-folder-btn'));
  if (ok) {
    pxaQueue = [];
    document.getElementById('pxa-folder').value = '';
    document.getElementById('pxa-preview').innerHTML = '';
  }
};

window.pxaManualUpload = async () => {
  const sel = document.getElementById('pxa-m-exam').value;
  const exam = sel === '__new__' ? document.getElementById('pxa-m-new').value.trim() : sel;
  const grade = document.getElementById('pxa-m-grade').value;
  const subject = PXA_SUBJECT_GRADES.includes(grade) ? document.getElementById('pxa-m-subject').value : '';
  const input = document.getElementById('pxa-m-files');
  const files = [...input.files];
  if (!exam) { alert('시험명을 입력해주세요.'); return; }
  if (!files.length) { alert('PDF 파일을 선택해주세요.'); return; }
  const notPdf = files.filter(f => !/\.pdf$/i.test(f.name));
  if (notPdf.length) { alert('PDF 파일만 올릴 수 있습니다: ' + notPdf.map(f => f.name).join(', ')); return; }
  const big = files.filter(f => f.size > PXA_MAX_MB * 1024 * 1024);
  if (big.length) { alert(`${PXA_MAX_MB}MB를 넘는 파일이 있습니다: ` + big.map(f => f.name).join(', ')); return; }
  const items = files.map(f => ({ file: f, exam, grade, subject, name: f.name.normalize('NFC') }));
  const ok = await pxaUpload(items, 'pxa-m-msg', document.getElementById('pxa-m-btn'));
  if (ok) { input.value = ''; document.getElementById('pxa-m-new').value = ''; document.getElementById('pxa-m-exam').value = pxaClean(exam); pxaToggleNewExam(); }
};

// ── 올라간 목록 ──
window.pxaLoadList = async () => {
  const box = document.getElementById('pxa-list');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  const data = {};
  try {
    const root = await listAll(ref(storage, 'pastExams'));
    await Promise.all(root.prefixes.map(async ex => {
      const files = [];
      async function walk(r, parts) {
        const res = await listAll(r);
        res.items.forEach(it => {
          const grade = pxaGradeOf(parts[0] || '') || parts[0] || '기타';
          files.push({ grade, subject: pxaPickSubject(grade, parts.slice(1), it.name), name: it.name, path: it.fullPath });
        });
        await Promise.all(res.prefixes.map(p => walk(p, [...parts, p.name])));
      }
      await walk(ex, []);
      data[ex.name] = files;
    }));
  } catch (e) {
    box.innerHTML = `<div style="color:#D64545;font-size:13px;">불러오지 못했습니다 (${pxaEsc(e.code || e.message)})</div>`;
    return;
  }
  pxaData = data;
  pxaFillExamSelect();
  const exams = Object.keys(data).sort((a, b) => (pxaExamScore(b) - pxaExamScore(a)) || b.localeCompare(a, 'ko'));
  if (!exams.length) { box.innerHTML = '<div style="color:var(--muted);font-size:13px;">아직 올라간 기출문제가 없습니다.</div>'; return; }
  box.innerHTML = exams.map(exam => {
    const files = data[exam];
    const keys = pxaGroupKeys(files);
    const inKey = k => { const [g, s] = k.split('\u0000'); return files.filter(f => f.grade === g && (f.subject || '') === s); };
    const summary = keys.map(k => { const [g, s] = k.split('\u0000'); return `${pxaEsc(pxaLabel(g, s))} ${inKey(k).length}`; }).join(' · ');
    return `<details style="border:1px solid var(--border-soft);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:rgba(30,24,56,0.02);">
      <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;list-style:none;">
        <span><b style="color:var(--off-white);font-size:14px;">${pxaEsc(exam)}</b>
          <span style="color:var(--purple, #5B3FA6);font-size:13px;margin-left:6px;">${files.length}개</span>
          <span style="color:var(--muted);font-size:12px;margin-left:8px;">${summary}</span></span>
        <button class="btn btn-danger btn-sm" data-exam="${pxaEsc(exam)}" onclick="event.preventDefault();pxaDeleteExam(this.dataset.exam)">시험 전체 삭제</button>
      </summary>
      <div style="margin-top:12px;">${keys.map(k => { const [g, s] = k.split('\u0000'); const list = inKey(k); return `
        <div style="margin-bottom:10px;">
          <div style="font-size:12.5px;font-weight:700;color:${s === PXA_UNSORTED ? '#D97B1A' : 'var(--off-white)'};margin-bottom:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${pxaEsc(pxaLabel(g, s))} <span style="color:var(--muted);font-weight:500;">${list.length}개</span>
            <select style="${PXA_SEL_STYLE}font-weight:500;" data-exam="${pxaEsc(exam)}" data-key="${pxaEsc(g + '|' + s)}" onchange="pxaMoveGroup(this)"><option value="">이 묶음 전체 분류 변경…</option>${pxaClassOptions(g, s).replace(/ selected/g, '')}</select></div>
          ${list.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true })).map(f => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;font-size:13px;">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--off-white);">📄 ${pxaEsc(f.name)}</span>
              <select style="${PXA_SEL_STYLE}" title="분류 변경" data-exam="${pxaEsc(exam)}" data-path="${pxaEsc(f.path)}" onchange="pxaMoveOne(this)">${pxaClassOptions(f.grade, f.subject)}</select>
              <button class="btn btn-secondary btn-sm" data-path="${pxaEsc(f.path)}" onclick="pxaOpenFile(this.dataset.path)">열기</button>
              <button class="btn btn-danger btn-sm" data-path="${pxaEsc(f.path)}" onclick="pxaDeleteFile(this.dataset.path)">삭제</button>
            </div>`).join('')}
        </div>`; }).join('')}</div>
    </details>`;
  }).join('');
};

// ── 분류 변경 (파일을 새 위치로 복사 후 원래 파일 삭제) ──
async function pxaMoveFiles(exam, files, grade, subject) {
  if (pxaBusy) { alert('다른 작업이 진행 중입니다.'); return; }
  const sub = PXA_SUBJECT_GRADES.includes(grade) ? subject : '';
  const taken = new Set((pxaData[exam] || []).map(f => f.path));
  const todo = files.map(f => {
    let name = f.name, n = 2, to = pxaPath({ exam, grade, subject: sub, name });
    if (to === f.path) return null;
    while (taken.has(to)) { name = f.name.replace(/(\.pdf)?$/i, ` (${n++})$1`); to = pxaPath({ exam, grade, subject: sub, name }); }
    taken.add(to);
    return { from: f.path, to, name: f.name };
  }).filter(Boolean);
  if (!todo.length) return;
  pxaBusy = true;
  const box = document.getElementById('pxa-list');
  const note = document.createElement('div');
  note.className = 'msg success'; note.style.display = 'block'; note.style.marginBottom = '10px';
  box.prepend(note);
  let i = 0, done = 0; const failed = [];
  const tick = () => { note.textContent = `분류 변경 중... ${done + failed.length} / ${todo.length}`; };
  tick();
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      try {
        const res = await fetch(await getDownloadURL(ref(storage, t.from)));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        await uploadBytes(ref(storage, t.to), blob, { contentType: 'application/pdf' });
        await deleteObject(ref(storage, t.from));
        done++;
      } catch (e) { failed.push(`${t.name} (${e.code || e.message})`); }
      tick();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  pxaBusy = false;
  if (failed.length) alert(`${done}개 변경 · ${failed.length}개 실패:\n` + failed.slice(0, 20).join('\n'));
  await pxaLoadList();
  // 방금 작업한 시험은 펼친 채로
  [...document.querySelectorAll('#pxa-list details')].forEach(d => {
    if (d.querySelector(`[data-exam="${CSS.escape(exam)}"]`)) d.open = true;
  });
}
window.pxaMoveOne = async (sel) => {
  const exam = sel.dataset.exam, path = sel.dataset.path;
  const f = (pxaData[exam] || []).find(x => x.path === path);
  if (!f) return;
  const [grade, subject] = sel.value.split('|');
  await pxaMoveFiles(exam, [f], grade, subject);
};
window.pxaMoveGroup = async (sel) => {
  if (!sel.value) return;
  const exam = sel.dataset.exam;
  const [g0, s0] = sel.dataset.key.split('|');
  const [grade, subject] = sel.value.split('|');
  const files = (pxaData[exam] || []).filter(f => f.grade === g0 && (f.subject || '') === s0);
  if (!confirm(`${pxaLabel(g0, s0)} ${files.length}개를 "${pxaLabel(grade, PXA_SUBJECT_GRADES.includes(grade) ? subject : '')}"(으)로 옮길까요?`)) { sel.value = ''; return; }
  await pxaMoveFiles(exam, files, grade, subject);
};

window.pxaOpenFile = async (path) => {
  const w = window.open('', '_blank');
  try { const url = await getDownloadURL(ref(storage, path)); if (w) w.location.href = url; else location.href = url; }
  catch (e) { if (w) w.close(); alert('파일을 열지 못했습니다 (' + (e.code || e.message) + ')'); }
};

window.pxaDeleteFile = async (path) => {
  const name = path.split('/').slice(2).join(' / ');
  if (!confirm(`"${name}" 파일을 삭제할까요?\n되돌릴 수 없습니다.`)) return;
  try { await deleteObject(ref(storage, path)); await pxaLoadList(); }
  catch (e) { alert('삭제 실패: ' + (e.code || e.message)); }
};

window.pxaDeleteExam = async (exam) => {
  const files = pxaData[exam] || [];
  if (!confirm(`"${exam}" 기출문제 ${files.length}개를 모두 삭제할까요?\n되돌릴 수 없습니다.`)) return;
  const typed = prompt(`확인을 위해 시험명을 그대로 입력해주세요.\n${exam}`);
  if (typed === null) return;
  if (typed.trim() !== exam) { alert('시험명이 일치하지 않아 취소했습니다.'); return; }
  let i = 0; const failed = [];
  async function worker() {
    while (i < files.length) {
      const f = files[i++];
      try { await deleteObject(ref(storage, f.path)); } catch (e) { failed.push(f.name); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (failed.length) alert(`${files.length - failed.length}개 삭제 · ${failed.length}개 실패:\n` + failed.slice(0, 20).join('\n'));
  await pxaLoadList();
};

