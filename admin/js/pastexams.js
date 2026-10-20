'use strict';
/* ═══════════════════════════════════════════════════════════
   기출문제 (Storage)
   (admin.html에서 분리 — 원본 11086~11361줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 📚 기출문제 — Storage 경로: pastExams/시험명/학년/지역/파일.pdf
// 선생님 포털(teacher.html "기출문제" 탭)에서 열람. 업로드·삭제는 관리자만 (storage.rules)
// ══════════════════════════════════════════
const PXA_GRADES  = ['중1','중2','중3','고1','고2','고3'];
const PXA_REGIONS = ['군포','안양','의왕','과천'];
const PXA_MAX_MB  = 50;
let pxaQueue = [];      // 폴더 선택으로 준비된 업로드 목록
let pxaData  = {};      // 시험명 → [{ grade, region, name, path }]
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
function pxaMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!text) { el.style.display = 'none'; return; }
  el.className = 'msg ' + (type || 'success');
  el.innerHTML = text;
  el.style.display = 'block';
}

window.initPastExamAdminTab = async () => {
  const g = document.getElementById('pxa-m-grade'), r = document.getElementById('pxa-m-region');
  if (g && !g.options.length) g.innerHTML = PXA_GRADES.map(v => `<option>${v}</option>`).join('');
  if (r && !r.options.length) r.innerHTML = PXA_REGIONS.map(v => `<option>${v}</option>`).join('');
  await pxaLoadList();
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

// ── 폴더 선택 → 경로에서 시험명/학년/지역 자동 분류 ──
window.pxaOnFolder = (input) => {
  const ok = [], bad = [];
  [...input.files].forEach(f => {
    const rel = (f.webkitRelativePath || f.name).normalize('NFC');
    const parts = rel.split('/');
    const base = parts[parts.length - 1];
    if (base.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(base)) return;
    if (!/\.pdf$/i.test(base)) { bad.push(rel + ' — PDF가 아님'); return; }
    if (parts.length < 4) { bad.push(rel + ' — 학년/지역 폴더 안에 있지 않음'); return; }
    if (f.size > PXA_MAX_MB * 1024 * 1024) { bad.push(rel + ` — ${PXA_MAX_MB}MB 초과`); return; }
    const n = parts.length;
    ok.push({ file: f, exam: parts[n - 4], grade: parts[n - 3], region: parts[n - 2], name: base });
  });
  pxaQueue = ok;
  pxaMsg('pxa-folder-msg', '');
  pxaRenderPreview(bad);
};

function pxaRenderPreview(bad = []) {
  const box = document.getElementById('pxa-preview');
  if (!pxaQueue.length) {
    box.innerHTML = bad.length
      ? `<div style="color:#ff9090;font-size:13px;margin-bottom:8px;">올릴 수 있는 PDF가 없습니다.</div>${pxaBadList(bad)}`
      : '<div style="color:var(--muted);font-size:13px;">선택한 폴더에 PDF가 없습니다.</div>';
    return;
  }
  const exams = [...new Set(pxaQueue.map(x => x.exam))];
  const tables = exams.map(exam => {
    const items = pxaQueue.filter(x => x.exam === exam);
    const grades  = [...new Set(items.map(x => x.grade))].sort(pxaOrder(PXA_GRADES));
    const regions = [...new Set(items.map(x => x.region))].sort(pxaOrder(PXA_REGIONS));
    const exists = pxaData[pxaClean(exam)] ? ` <span style="color:#ffb35c;font-size:12px;font-weight:500;">· 이미 있는 시험 — 같은 이름 파일은 덮어씀</span>` : '';
    const th = 'padding:6px 10px;border-bottom:1px solid var(--border-soft);font-weight:600;color:var(--muted);text-align:center;';
    const td = 'padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:center;';
    return `<div style="margin-bottom:14px;">
      <div style="font-size:14px;font-weight:700;color:var(--off-white);margin-bottom:8px;">${pxaEsc(exam)} <span style="color:var(--gold);">${items.length}개</span>${exists}</div>
      <div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:13px;min-width:320px;">
        <tr><th style="${th}text-align:left;">학년</th>${regions.map(r => `<th style="${th}">${pxaEsc(r)}</th>`).join('')}</tr>
        ${grades.map(g => `<tr><td style="${td}text-align:left;font-weight:600;color:var(--off-white);">${pxaEsc(g)}</td>${regions.map(r => {
          const c = items.filter(x => x.grade === g && x.region === r).length;
          return `<td style="${td}color:${c ? 'var(--off-white)' : 'var(--muted)'};">${c || '-'}</td>`;
        }).join('')}</tr>`).join('')}
      </table></div></div>`;
  }).join('');
  const rename = exams.length === 1
    ? `<div class="form-group" style="max-width:420px;margin-bottom:12px;"><label>시험명 (필요하면 수정)</label><input type="text" id="pxa-exam-name" value="${pxaEsc(exams[0])}"></div>`
    : '';
  box.innerHTML = tables + (bad.length ? pxaBadList(bad) : '') + rename +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary" id="pxa-folder-btn" onclick="pxaUploadFolder()">${pxaQueue.length}개 업로드</button>
      <button class="btn btn-secondary" onclick="pxaCancelFolder()">취소</button>
    </div>`;
}
function pxaBadList(bad) {
  return `<details style="margin:4px 0 14px;font-size:12.5px;color:#ffb35c;"><summary style="cursor:pointer;">제외된 파일 ${bad.length}개</summary>
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
      const path = `pastExams/${pxaClean(it.exam)}/${pxaClean(it.grade)}/${pxaClean(it.region)}/${pxaClean(it.name)}`;
      try {
        await uploadBytes(ref(storage, path), it.file, { contentType: 'application/pdf' });
        done++;
      } catch (e) { failed.push(`${it.grade}/${it.region}/${it.name} (${e.code || e.message})`); }
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
  const region = document.getElementById('pxa-m-region').value;
  const input = document.getElementById('pxa-m-files');
  const files = [...input.files];
  if (!exam) { alert('시험명을 입력해주세요.'); return; }
  if (!files.length) { alert('PDF 파일을 선택해주세요.'); return; }
  const notPdf = files.filter(f => !/\.pdf$/i.test(f.name));
  if (notPdf.length) { alert('PDF 파일만 올릴 수 있습니다: ' + notPdf.map(f => f.name).join(', ')); return; }
  const big = files.filter(f => f.size > PXA_MAX_MB * 1024 * 1024);
  if (big.length) { alert(`${PXA_MAX_MB}MB를 넘는 파일이 있습니다: ` + big.map(f => f.name).join(', ')); return; }
  const items = files.map(f => ({ file: f, exam, grade, region, name: f.name.normalize('NFC') }));
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
        res.items.forEach(it => files.push({ grade: parts[0] || '기타', region: parts[1] || '기타', name: it.name, path: it.fullPath }));
        await Promise.all(res.prefixes.map(p => walk(p, [...parts, p.name])));
      }
      await walk(ex, []);
      data[ex.name] = files;
    }));
  } catch (e) {
    box.innerHTML = `<div style="color:#ff9090;font-size:13px;">불러오지 못했습니다 (${pxaEsc(e.code || e.message)})</div>`;
    return;
  }
  pxaData = data;
  pxaFillExamSelect();
  const exams = Object.keys(data).sort((a, b) => (pxaExamScore(b) - pxaExamScore(a)) || b.localeCompare(a, 'ko'));
  if (!exams.length) { box.innerHTML = '<div style="color:var(--muted);font-size:13px;">아직 올라간 기출문제가 없습니다.</div>'; return; }
  box.innerHTML = exams.map(exam => {
    const files = data[exam];
    const byGrade = {};
    files.forEach(f => { ((byGrade[f.grade] = byGrade[f.grade] || {})[f.region] = byGrade[f.grade][f.region] || []).push(f); });
    const grades = Object.keys(byGrade).sort(pxaOrder(PXA_GRADES));
    const summary = grades.map(g => `${pxaEsc(g)} ${Object.values(byGrade[g]).reduce((s, a) => s + a.length, 0)}`).join(' · ');
    return `<details style="border:1px solid var(--border-soft);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:rgba(255,255,255,0.02);">
      <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;list-style:none;">
        <span><b style="color:var(--off-white);font-size:14px;">${pxaEsc(exam)}</b>
          <span style="color:var(--gold);font-size:13px;margin-left:6px;">${files.length}개</span>
          <span style="color:var(--muted);font-size:12px;margin-left:8px;">${summary}</span></span>
        <button class="btn btn-danger btn-sm" data-exam="${pxaEsc(exam)}" onclick="event.preventDefault();pxaDeleteExam(this.dataset.exam)">시험 전체 삭제</button>
      </summary>
      <div style="margin-top:12px;">${grades.map(g => Object.keys(byGrade[g]).sort(pxaOrder(PXA_REGIONS)).map(r => `
        <div style="margin-bottom:10px;">
          <div style="font-size:12.5px;font-weight:700;color:var(--off-white);margin-bottom:4px;">${pxaEsc(g)} · ${pxaEsc(r)} <span style="color:var(--muted);font-weight:500;">${byGrade[g][r].length}개</span></div>
          ${byGrade[g][r].sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true })).map(f => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;font-size:13px;">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--off-white);">📄 ${pxaEsc(f.name)}</span>
              <button class="btn btn-secondary btn-sm" data-path="${pxaEsc(f.path)}" onclick="pxaOpenFile(this.dataset.path)">열기</button>
              <button class="btn btn-danger btn-sm" data-path="${pxaEsc(f.path)}" onclick="pxaDeleteFile(this.dataset.path)">삭제</button>
            </div>`).join('')}
        </div>`).join('')).join('')}</div>
    </details>`;
  }).join('');
};

window.pxaOpenFile = async (path) => {
  const w = window.open('', '_blank');
  try { const url = await getDownloadURL(ref(storage, path)); if (w) w.location.href = url; else location.href = url; }
  catch (e) { if (w) w.close(); alert('파일을 열지 못했습니다 (' + (e.code || e.message) + ')'); }
};

window.pxaDeleteFile = async (path) => {
  const name = path.split('/').slice(-3).join(' / ');
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

