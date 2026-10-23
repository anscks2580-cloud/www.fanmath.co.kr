'use strict';
/* ═══════════════════════════════════════════════════════════
   영상 시청현황
   (admin.html에서 분리 — 원본 7989~8309줄. 모든 파일은 같은 전역 범위를 공유합니다)
   ═══════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════
// 영상 시청현황 탭
// ══════════════════════════════════════════
let wsProgressCache = [];   // videoProgress 컬렉션 원본
let wsAllRows = [];         // 학생 x 배정영상 조인 결과
let wsLoaded = false;

function wsGetStudentAssignedVideos(student, allVideos) {
  const assignedTags = Array.isArray(student.assignedTags)
    ? student.assignedTags.map(t => (t || '').trim()).filter(Boolean)
    : null;
  if (!assignedTags || !assignedTags.length) return [];
  return allVideos.filter(v => {
    const tag = (v.tag || '').trim();
    return assignedTags.some(a => a.endsWith('_') ? tag.startsWith(a) : (tag === a || tag.startsWith(a + '_')));
  });
}

function wsFormatDate(ts) {
  if (!ts) return '-';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch(e) { return '-'; }
}

let wsCourses = [];          // 접근 권한이 실제로 걸려 있는 강의 목록 [{tag,label,cat,order,videoCount}]
let wsCourse = '';           // 선택한 강의(태그). '' = 전체 강의 요약

// 강의(접근 권한 태그) 하나에 해당하는 영상 — 기존 매칭 규칙과 동일
function wsVideosForTag(a, allVideos) {
  a = (a || '').trim();
  if (!a) return [];
  return allVideos.filter(v => {
    const tag = (v.tag || '').trim();
    return a.endsWith('_') ? tag.startsWith(a) : (tag === a || tag.startsWith(a + '_'));
  });
}

function wsEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function loadWatchStatus(force) {
  if (wsLoaded && !force) { renderWatchStatus(); return; }
  document.getElementById('ws-list').innerHTML = '<div style="color:var(--muted);font-size:13px;">불러오는 중...</div>';
  const snap = await getDocs(collection(db, 'videoProgress'));
  wsProgressCache = [];
  snap.forEach(d => wsProgressCache.push({ id: d.id, ...d.data() }));
  const progressMap = new Map();
  wsProgressCache.forEach(p => progressMap.set(`${p.studentUid}_${p.videoId}`, p));

  // 강의 태그 → 표시명/카테고리 (강의 배정 화면과 같은 목록 기준)
  const tagInfo = new Map();
  let order = 0;
  getTagCategories().forEach(cat => (cat.tags || []).forEach(t => {
    if (!tagInfo.has(t.v)) tagInfo.set(t.v, { label: t.l, cat: cat.label, order: order++ });
  }));

  // 학생 × (접근 권한 강의) × 그 강의의 영상
  const videosByTag = new Map();
  const courseMap = new Map();
  wsAllRows = [];
  studentsCache.forEach(s => {
    const tags = [...new Set((Array.isArray(s.assignedTags) ? s.assignedTags : [])
      .map(t => (t || '').trim()).filter(Boolean))];
    tags.forEach(a => {
      if (!videosByTag.has(a)) videosByTag.set(a, wsVideosForTag(a, videosCache));
      const vids = videosByTag.get(a);
      if (!vids.length) return;
      if (!courseMap.has(a)) {
        const info = tagInfo.get(a) || { label: a, cat: '기타', order: 99999 };
        courseMap.set(a, { tag: a, ...info, videoCount: vids.length });
      }
      vids.forEach(v => {
        const p = progressMap.get(`${s.id}_${v.id}`);
        wsAllRows.push({
          courseTag: a,
          studentUid: s.id, studentName: s.name || '', branch: s.branch || '', grade: s.grade || '',
          teacherName: s.teacherName || '', videoId: v.id, videoTitle: v.title || '', tag: v.tag || '',
          percent: p ? (p.percent || 0) : 0,
          completed: p ? !!p.completed : false,
          lastWatchedAt: p ? p.lastWatchedAt : null,
        });
      });
    });
  });
  wsCourses = [...courseMap.values()].sort((x, y) => x.order - y.order || x.label.localeCompare(y.label, 'ko'));

  // 강의 선택 옵션 (카테고리별 묶음)
  const courseSel = document.getElementById('ws-course');
  const groups = [];
  wsCourses.forEach(c => {
    let g = groups.find(x => x.cat === c.cat);
    if (!g) { g = { cat: c.cat, list: [] }; groups.push(g); }
    g.list.push(c);
  });
  courseSel.innerHTML = '<option value="">전체 강의 (요약)</option>' + groups.map(g =>
    `<optgroup label="${wsEsc(g.cat)}">${g.list.map(c => `<option value="${wsEsc(c.tag)}">${wsEsc(c.label)}</option>`).join('')}</optgroup>`
  ).join('');
  if (!courseMap.has(wsCourse)) wsCourse = '';
  courseSel.value = wsCourse;

  // 담당T 필터 옵션 채우기
  const teacherSel = document.getElementById('ws-teacher');
  const prevTeacher = teacherSel.value;
  const teachers = [...new Set(studentsCache.map(s => s.teacherName).filter(Boolean))].sort();
  teacherSel.innerHTML = '<option value="">전체 담당T</option>' + teachers.map(t => `<option value="${wsEsc(t)}">${wsEsc(t)}</option>`).join('');
  if (teachers.includes(prevTeacher)) teacherSel.value = prevTeacher;

  wsLoaded = true;
  renderWatchStatus();
}

window.initWatchStatusTab = function() { loadWatchStatus(false); };

window.wsSelectCourse = function(tag) {
  wsCourse = tag || '';
  const sel = document.getElementById('ws-course');
  if (sel && sel.value !== wsCourse) sel.value = wsCourse;
  renderWatchStatus();
};

window.wsToggleDetail = function(i) {
  const row = document.getElementById('ws-detail-' + i);
  const arrow = document.getElementById('ws-arrow-' + i);
  if (!row) return;
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  if (arrow) arrow.textContent = open ? '▾' : '▸';
};

function wsBar(percent, color) {
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;height:6px;background:rgba(30,24,56,0.08);border-radius:4px;overflow:hidden;">
        <div style="width:${percent}%;height:100%;background:${color};"></div>
      </div>
      <span style="font-size:11px;color:var(--muted);min-width:32px;text-align:right;">${percent}%</span>
    </div>`;
}

window.renderWatchStatus = function renderWatchStatus() {
  const branch = document.getElementById('ws-branch').value;
  const teacher = document.getElementById('ws-teacher').value;
  const studentQ = (document.getElementById('ws-student').value || '').trim().toLowerCase();
  const videoQ = (document.getElementById('ws-video').value || '').trim().toLowerCase();
  const statusSel = document.getElementById('ws-status');
  const status = statusSel.value;

  let rows = wsAllRows;
  if (branch) rows = rows.filter(r => r.branch === branch);
  if (teacher) rows = rows.filter(r => r.teacherName === teacher);
  if (studentQ) rows = rows.filter(r => r.studentName.toLowerCase().includes(studentQ));

  const el = document.getElementById('ws-list');
  const summaryEl = document.getElementById('ws-summary');
  const empty = msg => `<div style="color:var(--muted);font-size:13px;padding:20px 0;">${msg}</div>`;

  // 상태 필터는 강의를 골랐을 때만 의미가 있음
  statusSel.disabled = !wsCourse;
  statusSel.style.opacity = wsCourse ? '1' : '0.45';

  // ─────────── 강의를 고르지 않았을 때: 강의별 요약 ───────────
  if (!wsCourse) {
    const stats = new Map();
    rows.forEach(r => {
      let c = stats.get(r.courseTag);
      if (!c) { c = { students: new Map(), pairs: 0, done: 0, sum: 0 }; stats.set(r.courseTag, c); }
      c.pairs++; c.sum += r.percent; if (r.completed) c.done++;
      let st = c.students.get(r.studentUid);
      if (!st) { st = { n: 0, done: 0, watched: 0 }; c.students.set(r.studentUid, st); }
      st.n++; if (r.completed) st.done++; if (r.percent > 0) st.watched++;
    });
    let list = wsCourses.filter(c => stats.has(c.tag));
    if (videoQ) list = list.filter(c =>
      c.label.toLowerCase().includes(videoQ) || c.tag.toLowerCase().includes(videoQ) ||
      rows.some(r => r.courseTag === c.tag && r.videoTitle.toLowerCase().includes(videoQ)));

    summaryEl.textContent = list.length ? `접근 권한이 걸린 강의 ${list.length}개` : '';
    if (!list.length) { el.innerHTML = empty('조건에 맞는 강의가 없습니다.'); return; }

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(245,197,24,0.3);color:var(--purple, #5B3FA6);text-align:left;">
            <th style="padding:8px 10px;">강의</th>
            <th style="padding:8px 10px;">접근 학생</th>
            <th style="padding:8px 10px;">영상</th>
            <th style="padding:8px 10px;">평균 시청률</th>
            <th style="padding:8px 10px;">전부 완료</th>
            <th style="padding:8px 10px;">미시청</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(c => {
            const st = stats.get(c.tag);
            const avg = st.pairs ? Math.round(st.sum / st.pairs) : 0;
            const studentArr = [...st.students.values()];
            const allDone = studentArr.filter(x => x.done === x.n).length;
            const none = studentArr.filter(x => x.watched === 0).length;
            return `
            <tr data-tag="${wsEsc(c.tag)}" onclick="wsSelectCourse(this.dataset.tag)"
              style="border-bottom:1px solid rgba(30,24,56,0.06);cursor:pointer;"
              onmouseover="this.style.background='rgba(245,197,24,0.06)'" onmouseout="this.style.background=''">
              <td style="padding:10px;">
                <div style="font-weight:600;">${wsEsc(c.label)}</div>
                <div style="font-size:11px;color:var(--muted);">${wsEsc(c.cat)}</div>
              </td>
              <td style="padding:10px;">${studentArr.length}명</td>
              <td style="padding:10px;color:var(--muted);">${c.videoCount}개</td>
              <td style="padding:10px;min-width:130px;">${wsBar(avg, avg >= 90 ? '#2E9E5B' : 'var(--gold)')}</td>
              <td style="padding:10px;color:#2E9E5B;font-weight:600;">${allDone}명</td>
              <td style="padding:10px;color:${none ? '#D64545' : 'var(--muted)'};font-weight:600;">${none}명</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    return;
  }

  // ─────────── 강의를 골랐을 때: 그 강의 접근 권한이 있는 학생만 ───────────
  const course = wsCourses.find(c => c.tag === wsCourse);
  rows = rows.filter(r => r.courseTag === wsCourse);
  if (videoQ) rows = rows.filter(r => r.videoTitle.toLowerCase().includes(videoQ) || r.tag.toLowerCase().includes(videoQ));

  const byStudent = new Map();
  rows.forEach(r => {
    let st = byStudent.get(r.studentUid);
    if (!st) {
      st = { name: r.studentName, branch: r.branch, teacherName: r.teacherName, grade: r.grade, videos: [] };
      byStudent.set(r.studentUid, st);
    }
    st.videos.push(r);
  });
  let students = [...byStudent.values()].map(st => {
    const n = st.videos.length;
    const done = st.videos.filter(v => v.completed).length;
    const unwatched = st.videos.filter(v => v.percent === 0).length;
    const avg = n ? Math.round(st.videos.reduce((a, v) => a + v.percent, 0) / n) : 0;
    const last = st.videos.reduce((m, v) => {
      if (!v.lastWatchedAt) return m;
      const t = v.lastWatchedAt.toDate ? v.lastWatchedAt.toDate().getTime() : new Date(v.lastWatchedAt).getTime();
      return (!m || t > m.t) ? { t, ts: v.lastWatchedAt } : m;
    }, null);
    const state = done === n ? 'completed' : (unwatched === n ? 'unwatched' : 'inprogress');
    return { ...st, n, done, unwatched, avg, last: last ? last.ts : null, state };
  });
  if (status) students = students.filter(st => st.state === status);
  students.sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name, 'ko'));

  const allDoneCnt = students.filter(st => st.state === 'completed').length;
  const noneCnt = students.filter(st => st.state === 'unwatched').length;
  summaryEl.textContent = students.length
    ? `접근 학생 ${students.length}명 · 영상 ${course ? course.videoCount : 0}개 · 전부 완료 ${allDoneCnt}명 · 미시청 ${noneCnt}명`
    : '';

  const head = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" onclick="wsSelectCourse('')">← 전체 강의</button>
      <div style="font-size:15px;font-weight:700;color:var(--purple, #5B3FA6);">${wsEsc(course ? course.label : wsCourse)}</div>
      <div style="font-size:12px;color:var(--muted);">${wsEsc(course ? course.cat : '')}</div>
    </div>`;

  if (!students.length) { el.innerHTML = head + empty('조건에 맞는 학생이 없습니다.'); return; }

  el.innerHTML = head + `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid rgba(245,197,24,0.3);color:var(--purple, #5B3FA6);text-align:left;">
          <th style="padding:8px 10px;">학생</th>
          <th style="padding:8px 10px;">관/담당T</th>
          <th style="padding:8px 10px;">평균 시청률</th>
          <th style="padding:8px 10px;">완료</th>
          <th style="padding:8px 10px;">상태</th>
          <th style="padding:8px 10px;">마지막 시청</th>
          <th style="padding:8px 10px;width:24px;"></th>
        </tr>
      </thead>
      <tbody>
        ${students.map((st, i) => {
          const barColor = st.state === 'completed' ? '#2E9E5B' : (st.avg > 0 ? 'var(--gold)' : 'rgba(30,24,56,0.15)');
          const statusLabel = st.state === 'completed' ? '✅ 완료' : (st.state === 'inprogress' ? '⏳ 시청중' : '⚠️ 미시청');
          const statusColor = st.state === 'completed' ? '#2E9E5B' : (st.state === 'inprogress' ? 'var(--gold)' : '#D64545');
          const videos = [...st.videos].sort((a, b) => a.videoTitle.localeCompare(b.videoTitle, 'ko', { numeric: true }));
          return `
          <tr onclick="wsToggleDetail(${i})" style="border-bottom:1px solid rgba(30,24,56,0.06);cursor:pointer;"
            onmouseover="this.style.background='rgba(245,197,24,0.06)'" onmouseout="this.style.background=''">
            <td style="padding:9px 10px;font-weight:600;">${wsEsc(st.name)}${st.grade ? `<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:6px;">${wsEsc(st.grade)}</span>` : ''}</td>
            <td style="padding:9px 10px;color:var(--muted);">${wsEsc(st.branch)}${st.teacherName ? ' · ' + wsEsc(st.teacherName) + 'T' : ''}</td>
            <td style="padding:9px 10px;min-width:130px;">${wsBar(st.avg, barColor)}</td>
            <td style="padding:9px 10px;">${st.done} / ${st.n}</td>
            <td style="padding:9px 10px;color:${statusColor};font-weight:600;font-size:12px;">${statusLabel}</td>
            <td style="padding:9px 10px;color:var(--muted);font-size:12px;">${wsFormatDate(st.last)}</td>
            <td style="padding:9px 10px;color:var(--muted);" id="ws-arrow-${i}">▸</td>
          </tr>
          <tr id="ws-detail-${i}" style="display:none;">
            <td colspan="7" style="padding:4px 10px 14px 24px;background:rgba(30,24,56,0.02);">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                ${videos.map(v => {
                  const c = v.completed ? '#2E9E5B' : (v.percent > 0 ? 'var(--gold)' : 'rgba(30,24,56,0.15)');
                  const lbl = v.completed ? '완료' : (v.percent > 0 ? '시청중' : '미시청');
                  const lc = v.completed ? '#2E9E5B' : (v.percent > 0 ? 'var(--gold)' : '#D64545');
                  return `
                  <tr style="border-bottom:1px solid rgba(30,24,56,0.04);">
                    <td style="padding:7px 8px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${wsEsc(v.videoTitle)}</td>
                    <td style="padding:7px 8px;min-width:120px;">${wsBar(v.percent, c)}</td>
                    <td style="padding:7px 8px;color:${lc};font-weight:600;">${lbl}</td>
                    <td style="padding:7px 8px;color:var(--muted);">${wsFormatDate(v.lastWatchedAt)}</td>
                  </tr>`;
                }).join('')}
              </table>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
};

