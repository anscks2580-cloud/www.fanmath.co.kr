'use strict';
/* ═══════════════════════════════════════════════════════════
   시중교재 (Storage)
   (admin.html에서 분리 — 원본 11362~11619줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 📘 시중교재 — Storage 경로: textbooks/학교급/(학년/)교재/(하위폴더/)파일.pdf
//   예) textbooks/중등/중1/쎈/파일.pdf · textbooks/고등/쎈/22개정/파일.pdf
// 선택한 폴더 구조를 그대로 보존해서 올림. 선생님 포털(teacher.html "시중교재" 탭)에서
// 학교급 → 학년 → 교재 순으로 보여줌. 업로드·삭제는 관리자만 (storage.rules)
// ══════════════════════════════════════════
const TBA_MAX_MB = 500;
const TBA_LEVELS = ['초등', '중등', '고등'];
const TBA_GRADE_RE = /^(초|중|고)\s*[1-6]/;
let tbaQueue = [];   // { file, dir:[폴더...], name }
let tbaFiles = [];   // 올라간 파일 [{ level, grade, book, sub, name, path }]
let tbaBusy = false;

function tbaFmtSize(b) {
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2) + 'GB';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1) + 'MB';
  return Math.max(1, Math.round(b / 1024)) + 'KB';
}
function tbaPath(it) { return ['textbooks', ...it.dir, it.name].map(pxaClean).join('/'); }
// 저장 경로 → 학교급/학년/교재/하위폴더로 해석 (teacher.html과 같은 규칙)
function tbaParse(fullPath) {
  const parts = fullPath.split('/').slice(1);
  const name = parts.pop();
  const level = parts[0] || '기타';
  let grade = '', rest = parts.slice(1);
  if (rest.length && TBA_GRADE_RE.test(rest[0])) { grade = rest[0]; rest = rest.slice(1); }
  return { level, grade, book: rest[0] || '(분류 없음)', sub: rest.slice(1).join(' / '), name, path: fullPath };
}
const tbaBookKey = f => [f.level, f.grade, f.book].join('\u0000');
function tbaBookLabel(f) { return [f.level, f.grade, f.book].filter(Boolean).join(' › '); }
function tbaSortFiles(a, b) {
  return pxaOrder(TBA_LEVELS)(a.level, b.level) || pxaOrder(PXA_GRADES)(a.grade, b.grade) ||
    a.book.localeCompare(b.book, 'ko', { numeric: true }) || (a.sub + '/' + a.name).localeCompare(b.sub + '/' + b.name, 'ko', { numeric: true });
}

window.initTextbookAdminTab = async () => { await tbaLoadList(); };

// ── 폴더 선택 → 폴더 구조 그대로 (맨 위 선택 폴더 이름은 학교급(초등·중등·고등)일 때만 남김) ──
window.tbaOnFolder = (input) => {
  const ok = [], bad = [];
  [...input.files].forEach(f => {
    const rel = (f.webkitRelativePath || f.name).normalize('NFC');
    const parts = rel.split('/').map(s => s.trim());
    const name = parts.pop();
    if (name.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(name)) return;
    if (!/\.pdf$/i.test(name)) { bad.push(rel + ' — PDF가 아님'); return; }
    if (f.size > TBA_MAX_MB * 1024 * 1024) { bad.push(rel + ` — ${TBA_MAX_MB}MB 초과`); return; }
    let dir = parts;
    if (dir.length && !TBA_LEVELS.includes(dir[0])) dir = dir.slice(1);   // "시중교재" 같은 최상위 폴더는 빼기
    if (dir.length < 2) { bad.push(rel + ' — 학교급/교재 폴더 안에 있지 않음'); return; }
    ok.push({ file: f, dir, name });
  });
  tbaQueue = ok;
  pxaMsg('tba-folder-msg', '');
  tbaRenderPreview(bad);
};

function tbaRenderPreview(bad = []) {
  const box = document.getElementById('tba-preview');
  if (!tbaQueue.length) {
    box.innerHTML = bad.length
      ? `<div style="color:#D64545;font-size:13px;margin-bottom:8px;">올릴 수 있는 PDF가 없습니다.</div>${pxaBadList(bad)}`
      : '<div style="color:var(--muted);font-size:13px;">선택한 폴더에 PDF가 없습니다.</div>';
    return;
  }
  const existing = new Set(tbaFiles.map(f => f.path));
  const dup = tbaQueue.filter(it => existing.has(tbaPath(it))).length;
  const total = tbaQueue.reduce((s, x) => s + x.file.size, 0);
  const parsed = tbaQueue.map(it => ({ ...tbaParse(tbaPath(it)), size: it.file.size }));
  const groups = {};
  parsed.forEach(p => { const g = [p.level, p.grade].filter(Boolean).join(' › '); (groups[g] = groups[g] || []).push(p); });
  const gkeys = Object.keys(groups).sort((a, b) => tbaSortFiles(groups[a][0], groups[b][0]));
  const rows = gkeys.map(g => {
    const items = groups[g];
    const books = [...new Set(items.map(x => x.book))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    return `<details style="margin-bottom:6px;"><summary style="cursor:pointer;font-size:13.5px;color:var(--off-white);">
        <b>${pxaEsc(g)}</b> <span style="color:var(--muted);">· 교재 ${books.length}종 · 파일 ${items.length}개 · ${tbaFmtSize(items.reduce((s, x) => s + x.size, 0))}</span></summary>
      <div style="margin:6px 0 4px 14px;font-size:12.5px;color:var(--muted);line-height:1.8;">${books.map(b =>
        `📘 ${pxaEsc(b)} <span style="opacity:.7;">(${items.filter(x => x.book === b).length})</span>`).join('<br>')}</div></details>`;
  }).join('');
  box.innerHTML = `<div style="font-size:14px;font-weight:700;color:var(--off-white);margin-bottom:10px;">
      총 <span style="color:var(--purple, #5B3FA6);">${tbaQueue.length}개</span> · ${tbaFmtSize(total)}</div>
    ${rows}${bad.length ? pxaBadList(bad) : ''}
    ${dup ? `<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--off-white);margin:10px 0;cursor:pointer;">
      <input type="checkbox" id="tba-skip-dup" checked> 이미 올라간 파일 ${dup}개는 건너뛰기 (해제하면 덮어씀)</label>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
      <button class="btn btn-primary" id="tba-folder-btn" onclick="tbaUploadFolder()">업로드 시작</button>
      <button class="btn btn-secondary" onclick="tbaCancelFolder()">취소</button>
    </div>`;
}
window.tbaCancelFolder = () => {
  if (tbaBusy) return;
  tbaQueue = [];
  document.getElementById('tba-folder').value = '';
  document.getElementById('tba-preview').innerHTML = '';
  pxaMsg('tba-folder-msg', '');
};

// ── 큰 파일용 업로드 (진행률 표시, 동시에 3개) ──
async function tbaUpload(items, msgId, btn) {
  if (tbaBusy) { alert('다른 업로드가 진행 중입니다.'); return false; }
  tbaBusy = true;
  const btnText = btn ? btn.textContent : '';
  if (btn) btn.disabled = true;
  const wrap = document.getElementById('tba-progress');
  const showBar = msgId === 'tba-folder-msg';
  if (showBar) wrap.style.display = '';
  const totalBytes = items.reduce((s, x) => s + x.file.size, 0) || 1;
  const sent = new Array(items.length).fill(0);
  let done = 0, i = 0;
  const failed = [];
  const leave = e => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', leave);
  const paint = () => {
    const bytes = sent.reduce((s, v) => s + v, 0);
    const pct = Math.min(100, Math.floor(bytes / totalBytes * 100));
    if (showBar) {
      document.getElementById('tba-progress-bar').style.width = pct + '%';
      document.getElementById('tba-progress-pct').textContent = pct + '%';
      document.getElementById('tba-progress-text').textContent =
        `${done + failed.length} / ${items.length}개 · ${tbaFmtSize(bytes)} / ${tbaFmtSize(totalBytes)}`;
    } else {
      pxaMsg(msgId, `업로드 중... ${pct}% (${done + failed.length} / ${items.length})`, 'success');
    }
  };
  paint();
  async function worker() {
    while (i < items.length) {
      const idx = i++, it = items[idx];
      try {
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, tbaPath(it)), it.file, { contentType: 'application/pdf' });
          task.on('state_changed', s => { sent[idx] = s.bytesTransferred; paint(); }, reject, resolve);
        });
        sent[idx] = it.file.size; done++;
      } catch (e) {
        sent[idx] = it.file.size;
        failed.push(`${it.dir.join('/')}/${it.name} (${e.code || e.message})`);
      }
      paint();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  window.removeEventListener('beforeunload', leave);
  tbaBusy = false;
  if (btn) { btn.disabled = false; btn.textContent = btnText; }
  if (showBar) setTimeout(() => { wrap.style.display = 'none'; }, 1500);
  if (failed.length) {
    pxaMsg(msgId, `${done}개 완료 · <b>${failed.length}개 실패</b> — 같은 폴더를 다시 고르면 실패한 것만 이어서 올릴 수 있습니다.<br>${failed.slice(0, 30).map(pxaEsc).join('<br>')}`, 'error');
  } else {
    pxaMsg(msgId, `✓ ${done}개 업로드 완료 — 선생님 포털 "시중교재" 탭에 바로 보입니다.`, 'success');
  }
  await tbaLoadList();
  return !failed.length;
}

window.tbaUploadFolder = async () => {
  if (!tbaQueue.length) return;
  const skip = document.getElementById('tba-skip-dup');
  let items = tbaQueue;
  if (skip && skip.checked) {
    const existing = new Set(tbaFiles.map(f => f.path));
    items = tbaQueue.filter(it => !existing.has(tbaPath(it)));
  }
  if (!items.length) { pxaMsg('tba-folder-msg', '새로 올릴 파일이 없습니다 (모두 이미 올라가 있음).', 'success'); return; }
  const ok = await tbaUpload(items, 'tba-folder-msg', document.getElementById('tba-folder-btn'));
  if (ok) {
    tbaQueue = [];
    document.getElementById('tba-folder').value = '';
    document.getElementById('tba-preview').innerHTML = '';
  }
};

window.tbaManualUpload = async () => {
  const dirText = document.getElementById('tba-m-dir').value.trim();
  const dir = dirText.split(/\s*[\/›>]\s*/).map(s => s.trim()).filter(Boolean);
  const input = document.getElementById('tba-m-files');
  const files = [...input.files];
  if (dir.length < 2) { alert('폴더 경로를 "학교급/학년/교재" 또는 "고등/교재" 형태로 입력해주세요.\n예: 중등/중1/쎈'); return; }
  if (!TBA_LEVELS.includes(dir[0]) && !confirm(`첫 폴더가 "${dir[0]}"입니다. 보통 초등·중등·고등 중 하나로 시작합니다. 그대로 올릴까요?`)) return;
  if (!files.length) { alert('PDF 파일을 선택해주세요.'); return; }
  const notPdf = files.filter(f => !/\.pdf$/i.test(f.name));
  if (notPdf.length) { alert('PDF 파일만 올릴 수 있습니다: ' + notPdf.map(f => f.name).join(', ')); return; }
  const big = files.filter(f => f.size > TBA_MAX_MB * 1024 * 1024);
  if (big.length) { alert(`${TBA_MAX_MB}MB를 넘는 파일이 있습니다: ` + big.map(f => f.name).join(', ')); return; }
  const items = files.map(f => ({ file: f, dir, name: f.name.normalize('NFC') }));
  const ok = await tbaUpload(items, 'tba-m-msg', document.getElementById('tba-m-btn'));
  if (ok) input.value = '';
};

// ── 올라간 목록: 학교급 › 학년 › 교재 ──
window.tbaLoadList = async () => {
  const box = document.getElementById('tba-list');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  const files = [];
  async function walk(r) {
    const res = await listAll(r);
    res.items.forEach(it => files.push(tbaParse(it.fullPath)));
    await Promise.all(res.prefixes.map(walk));
  }
  try { await walk(ref(storage, 'textbooks')); }
  catch (e) { box.innerHTML = `<div style="color:#D64545;font-size:13px;">불러오지 못했습니다 (${pxaEsc(e.code || e.message)})</div>`; return; }
  files.sort(tbaSortFiles);
  tbaFiles = files;
  // 개별 추가용 경로 자동완성: 지금 있는 교재 폴더들
  const dirs = [...new Set(files.map(f => f.path.split('/').slice(1, -1).join('/')))];
  document.getElementById('tba-dir-list').innerHTML = dirs.map(d => `<option value="${pxaEsc(d)}">`).join('');
  if (tbaQueue.length) tbaRenderPreview();
  if (!files.length) { box.innerHTML = '<div style="color:var(--muted);font-size:13px;">아직 올라간 교재가 없습니다.</div>'; return; }

  const groups = {};   // "중등 › 중1" → { 교재키: [파일] }
  files.forEach(f => {
    const g = [f.level, f.grade].filter(Boolean).join(' › ');
    ((groups[g] = groups[g] || {})[tbaBookKey(f)] = groups[g][tbaBookKey(f)] || []).push(f);
  });
  box.innerHTML = Object.keys(groups).map(g => {
    const books = Object.keys(groups[g]);
    return `<div style="margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:var(--off-white);margin-bottom:8px;">${pxaEsc(g)} <span style="color:var(--muted);font-weight:500;font-size:12.5px;">교재 ${books.length}종</span></div>
      ${books.map(k => {
        const fs = groups[g][k], f0 = fs[0];
        return `<details style="border:1px solid var(--border-soft);border-radius:10px;padding:10px 14px;margin-bottom:8px;background:rgba(30,24,56,0.02);">
          <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;list-style:none;">
            <span style="color:var(--off-white);font-size:13.5px;font-weight:600;">📘 ${pxaEsc(f0.book)} <span style="color:var(--muted);font-weight:500;font-size:12px;">${fs.length}개 파일</span></span>
            <button class="btn btn-danger btn-sm" data-key="${pxaEsc(k)}" onclick="event.preventDefault();tbaDeleteBook(this.dataset.key)">교재 삭제</button>
          </summary>
          <div style="margin-top:8px;">${fs.map(f => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--off-white);">📄 ${f.sub ? pxaEsc(f.sub) + ' / ' : ''}${pxaEsc(f.name)}</span>
              <button class="btn btn-secondary btn-sm" data-path="${pxaEsc(f.path)}" onclick="pxaOpenFile(this.dataset.path)">미리보기</button>
              <button class="btn btn-danger btn-sm" data-path="${pxaEsc(f.path)}" onclick="tbaDeleteFile(this.dataset.path)">삭제</button>
            </div>`).join('')}</div>
        </details>`;
      }).join('')}</div>`;
  }).join('');
};

window.tbaDeleteFile = async (path) => {
  if (!confirm(`"${path.replace(/^textbooks\//, '')}" 파일을 삭제할까요?\n되돌릴 수 없습니다.`)) return;
  try { await deleteObject(ref(storage, path)); await tbaLoadList(); }
  catch (e) { alert('삭제 실패: ' + (e.code || e.message)); }
};

window.tbaDeleteBook = async (key) => {
  const files = tbaFiles.filter(f => tbaBookKey(f) === key);
  if (!files.length) return;
  if (!confirm(`${tbaBookLabel(files[0])} 교재 파일 ${files.length}개를 모두 삭제할까요?\n되돌릴 수 없습니다.`)) return;
  let i = 0; const failed = [];
  async function worker() {
    while (i < files.length) { const f = files[i++]; try { await deleteObject(ref(storage, f.path)); } catch (e) { failed.push(f.name); } }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (failed.length) alert(`${files.length - failed.length}개 삭제 · ${failed.length}개 실패:\n` + failed.slice(0, 20).join('\n'));
  await tbaLoadList();
};


