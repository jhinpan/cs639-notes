const LECTURES = [
  { id: 1,  file: 'lecture1-course-overview.pdf',      title: 'Lecture 1: Course Overview & What Is an FM?' },
  { id: 2,  file: 'lecture2-ml-intro.pdf',             title: 'Lecture 2: Machine Learning Review' },
  { id: 3,  file: 'lecture3-dl-1.pdf',                 title: 'Lecture 3: Deep Learning I' },
  { id: 4,  file: 'lecture4-dl-2.pdf',                 title: 'Lecture 4: Deep Learning II' },
  { id: 5,  file: 'lecture5-ssl.pdf',                  title: 'Lecture 5: Self-Supervised Learning' },
  { id: 7,  file: 'lecture7-transformers-i.pdf',       title: 'Lecture 7: Transformers & Attention I' },
  { id: 8,  file: 'lecture8-transformers-ii.pdf',      title: 'Lecture 8: Transformers & Attention II' },
  { id: 9,  file: 'lecture9-architectures.pdf',        title: 'Lecture 9: Architectures I' },
  { id: 10, file: 'lecture10-architectures-ii.pdf',    title: 'Lecture 10: Architectures II' },
  { id: 11, file: 'lecture11-attention_variants.pdf',  title: 'Lecture 11: Attention Variants' },
  { id: 12, file: 'lecture12-multimodal-i.pdf',        title: 'Lecture 12: Multimodal I' },
  { id: 13, file: 'lecture13-multimodal-ii.pdf',       title: 'Lecture 13: Multimodal II' },
  { id: 14, file: 'lecture14-prompting-ICL.pdf',       title: 'Lecture 14: Prompting & ICL' },
];

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let currentLecture = null;
let lectureData = null;
let renderTask = null;

const canvas = document.getElementById('slide-canvas');
const ctx = canvas.getContext('2d');
const loadingEl = document.getElementById('slide-loading');
const counterEl = document.getElementById('slide-counter');
const notesEl = document.getElementById('notes-content');
const selectEl = document.getElementById('lecture-select');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnToc = document.getElementById('btn-toc');
const btnTheme = document.getElementById('btn-theme');
const btnAnnotations = document.getElementById('btn-annotations');
const tocPanel = document.getElementById('toc-panel');
const tocClose = document.getElementById('toc-close');
const tocList = document.getElementById('toc-list');
const divider = document.getElementById('divider');
const slidePane = document.getElementById('slide-pane');
const contextMenu = document.getElementById('context-menu');
const noteEditor = document.getElementById('note-editor');
const annotationsPanel = document.getElementById('annotations-panel');
const annotationsList = document.getElementById('annotations-list');
const qaPane = document.getElementById('qa-pane');
const qaDivider = document.getElementById('divider-qa');
const qaMessages = document.getElementById('qa-messages');
const qaInput = document.getElementById('qa-input');
const qaForm = document.getElementById('qa-form');
const btnQa = document.getElementById('btn-qa');

// ---- Initialize ----
function init() {
  populateLectureSelect();
  populateTOC();
  bindEvents();
  loadTheme();
  handleHashChange();
}

function populateLectureSelect() {
  selectEl.innerHTML = '<option value="">-- Select Lecture --</option>';
  for (const lec of LECTURES) {
    const opt = document.createElement('option');
    opt.value = lec.id;
    opt.textContent = lec.title;
    selectEl.appendChild(opt);
  }
}

function populateTOC() {
  tocList.innerHTML = '';
  for (const lec of LECTURES) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#lecture=${lec.id}&page=1`;
    a.textContent = lec.title;
    a.dataset.id = lec.id;
    li.appendChild(a);
    tocList.appendChild(li);
  }
}

function bindEvents() {
  selectEl.addEventListener('change', () => {
    const id = parseInt(selectEl.value);
    if (id) loadLecture(id);
  });
  btnPrev.addEventListener('click', () => goToPage(currentPage - 1));
  btnNext.addEventListener('click', () => goToPage(currentPage + 1));
  btnToc.addEventListener('click', () => { tocPanel.classList.toggle('hidden'); annotationsPanel.classList.add('hidden'); });
  tocClose.addEventListener('click', () => tocPanel.classList.add('hidden'));
  btnAnnotations.addEventListener('click', () => { annotationsPanel.classList.toggle('hidden'); tocPanel.classList.add('hidden'); renderAnnotationsPanel(); });
  document.getElementById('annotations-close').addEventListener('click', () => annotationsPanel.classList.add('hidden'));
  btnQa.addEventListener('click', toggleQaPane);
  btnTheme.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', handleKeys);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('resize', () => { if (pdfDoc) renderPage(currentPage); });
  initDividerDrag();
  initHighlightSystem();
  initQa();
}

function handleKeys(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  if (examMode) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); examGoTo(examCurrentIdx - 1); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); examGoTo(examCurrentIdx + 1); }
    if (e.key === 'Enter') { e.preventDefault(); submitExamAnswer(); }
    if (e.key === 'Escape') { exitExam(); }
    if (e.key >= '1' && e.key <= '5') {
      const labels = ['A','B','C','D','E'];
      const label = labels[parseInt(e.key) - 1];
      const q = examQuestions[examCurrentIdx];
      const state = examAnswers[q.id];
      if (!(state && state.submitted)) {
        const optEl = examOptions.querySelector(`[data-label="${label}"]`);
        if (optEl) optEl.click();
      }
    }
    return;
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToPage(currentPage - 1); }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1); }
  if (e.key === 'Escape') { contextMenu.classList.add('hidden'); noteEditor.classList.add('hidden'); dismissNotePopover(); }
}

function handleHashChange() {
  const hash = location.hash.slice(1);

  if (hash === 'exam' || hash.startsWith('exam=')) {
    const match = hash.match(/exam=(\d+)/);
    if (match) examCurrentIdx = parseInt(match[1]) - 1;
    enterExam();
    return;
  }

  if (examMode) {
    examMode = false;
    examView.classList.add('hidden');
    document.getElementById('split-view').style.display = '';
  }

  const params = new URLSearchParams(hash);
  const lecId = parseInt(params.get('lecture'));
  const page = parseInt(params.get('page')) || 1;
  if (lecId && LECTURES.find(l => l.id === lecId)) {
    if (!currentLecture || currentLecture.id !== lecId) {
      loadLecture(lecId, page);
    } else {
      goToPage(page);
    }
  }
}

// ---- Divider drag ----
function initDividerDrag() {
  let dragging = false;
  divider.addEventListener('mousedown', (e) => { dragging = true; divider.classList.add('active'); e.preventDefault(); });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const pct = (e.clientX / window.innerWidth) * 100;
    const clamped = Math.max(25, Math.min(75, pct));
    slidePane.style.flex = `0 0 ${clamped}%`;
    if (pdfDoc) renderPage(currentPage);
  });
  document.addEventListener('mouseup', () => { dragging = false; divider.classList.remove('active'); });
}

// ---- Theme ----
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  btnTheme.textContent = isDark ? 'Dark' : 'Light';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  btnTheme.textContent = saved === 'dark' ? 'Light' : 'Dark';
}

// ---- PDF Loading ----
async function loadLecture(lecId, startPage = 1) {
  const lec = LECTURES.find(l => l.id === lecId);
  if (!lec) return;
  currentLecture = lec;
  selectEl.value = lec.id;

  tocList.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', parseInt(a.dataset.id) === lecId);
  });

  loadingEl.style.display = 'block';
  notesEl.innerHTML = '<p class="placeholder">Loading lecture data...</p>';

  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

  try {
    pdfDoc = await pdfjsLib.getDocument(`slides/${lec.file}`).promise;
    totalPages = pdfDoc.numPages;
  } catch (err) {
    loadingEl.style.display = 'none';
    notesEl.innerHTML = `<p class="placeholder">Failed to load PDF: ${err.message}</p>`;
    return;
  }

  try {
    const resp = await fetch(`data/lecture${lec.id}.json`);
    lectureData = resp.ok ? await resp.json() : null;
  } catch { lectureData = null; }

  goToPage(startPage);
  tocPanel.classList.add('hidden');
}

// ---- Page Navigation ----
function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  counterEl.textContent = `${currentPage} / ${totalPages}`;
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;
  location.hash = `lecture=${currentLecture.id}&page=${currentPage}`;
  renderPage(currentPage);
  renderNotes(currentPage);
  if (qaOpen) { loadQaHistory(); renderQaMessages(); }
}

// ---- Render Slide ----
async function renderPage(pageNum) {
  if (!pdfDoc) return;
  if (renderTask) { renderTask.cancel(); renderTask = null; }

  loadingEl.style.display = 'block';
  const page = await pdfDoc.getPage(pageNum);
  const paneRect = slidePane.getBoundingClientRect();
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    (paneRect.width * 0.94) / unscaledViewport.width,
    (paneRect.height * 0.94) / unscaledViewport.height
  );
  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: scale * dpr });

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width / dpr}px`;
  canvas.style.height = `${viewport.height / dpr}px`;

  try {
    renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
  } catch (e) {
    if (e.name !== 'RenderingCancelledException') console.error(e);
  }
  loadingEl.style.display = 'none';
  renderTask = null;
}

// ---- Render Notes ----
function renderNotes(pageNum) {
  if (!lectureData || !lectureData.slides) {
    notesEl.innerHTML = `
      <h1>${currentLecture.title}</h1>
      <p class="placeholder">Explanation content is being generated. Check back soon!</p>`;
    return;
  }

  const slide = lectureData.slides.find(s => s.page === pageNum);
  if (!slide) {
    notesEl.innerHTML = `<h1>Page ${pageNum}</h1><p class="placeholder">No explanation available for this slide.</p>`;
    return;
  }

  let html = '';
  if (slide.explanation) {
    html += marked.parse(slide.explanation);
  }
  if (slide.keyPoints && slide.keyPoints.length > 0) {
    html += '<div class="key-points"><h4>Key Takeaways</h4><ul>';
    for (const pt of slide.keyPoints) {
      html += `<li>${marked.parse(pt)}</li>`;
    }
    html += '</ul></div>';
  }

  notesEl.innerHTML = html;

  if (window.renderMathInElement) {
    renderMathInElement(notesEl, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }

  notesEl.scrollTop = 0;

  applyHighlights();
}

// ============================================================================
// Highlight & Notes System
// ============================================================================

function getStorageKey() {
  if (!currentLecture) return null;
  return `cs639_annotations_L${currentLecture.id}_P${currentPage}`;
}

function loadAnnotations(lecId, page) {
  try {
    const raw = localStorage.getItem(`cs639_annotations_L${lecId}_P${page}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAnnotations(lecId, page, annotations) {
  localStorage.setItem(`cs639_annotations_L${lecId}_P${page}`, JSON.stringify(annotations));
}

function getAllAnnotations() {
  const all = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('cs639_annotations_L')) continue;
    const match = key.match(/L(\d+)_P(\d+)/);
    if (!match) continue;
    const lecId = parseInt(match[1]);
    const page = parseInt(match[2]);
    const lec = LECTURES.find(l => l.id === lecId);
    try {
      const items = JSON.parse(localStorage.getItem(key));
      for (const ann of items) {
        all.push({ ...ann, lecId, page, lecTitle: lec ? lec.title : `Lecture ${lecId}` });
      }
    } catch { /* skip */ }
  }
  all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return all;
}

let pendingSelection = null;

function initHighlightSystem() {
  notesEl.addEventListener('mouseup', onTextSelect);
  document.addEventListener('mousedown', (e) => {
    if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    dismissNotePopover(e);
  });

  document.getElementById('ctx-highlight').addEventListener('click', () => doHighlight('yellow'));
  document.getElementById('ctx-highlight-blue').addEventListener('click', () => doHighlight('blue'));
  document.getElementById('ctx-highlight-green').addEventListener('click', () => doHighlight('green'));
  document.getElementById('ctx-note').addEventListener('click', openNoteEditor);

  document.getElementById('note-editor-save').addEventListener('click', saveNote);
  document.getElementById('note-editor-cancel').addEventListener('click', () => noteEditor.classList.add('hidden'));
  document.getElementById('note-editor-close').addEventListener('click', () => noteEditor.classList.add('hidden'));

  notesEl.addEventListener('click', onHighlightClick);
}

function onTextSelect(e) {
  const sel = window.getSelection();
  const text = sel.toString().trim();
  if (!text || text.length < 2) return;

  if (!notesEl.contains(sel.anchorNode) || !notesEl.contains(sel.focusNode)) return;

  pendingSelection = {
    text,
    range: sel.getRangeAt(0).cloneRange(),
  };

  const rect = sel.getRangeAt(0).getBoundingClientRect();
  contextMenu.style.left = `${rect.left + rect.width / 2 - 80}px`;
  contextMenu.style.top = `${rect.top - 40}px`;
  contextMenu.classList.remove('hidden');
}

function doHighlight(color) {
  if (!pendingSelection || !currentLecture) return;
  contextMenu.classList.add('hidden');

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const annotations = loadAnnotations(currentLecture.id, currentPage);
  annotations.push({
    id,
    text: pendingSelection.text.slice(0, 500),
    color,
    note: '',
    timestamp: Date.now(),
  });
  saveAnnotations(currentLecture.id, currentPage, annotations);

  wrapRangeWithMark(pendingSelection.range, id, color, false);
  window.getSelection().removeAllRanges();
  pendingSelection = null;
}

function openNoteEditor() {
  if (!pendingSelection) return;
  contextMenu.classList.add('hidden');

  const quote = noteEditor.querySelector('.note-editor-quote');
  quote.textContent = pendingSelection.text.slice(0, 200) + (pendingSelection.text.length > 200 ? '...' : '');

  const rect = pendingSelection.range.getBoundingClientRect();
  noteEditor.style.left = `${Math.min(rect.left, window.innerWidth - 380)}px`;
  noteEditor.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 280)}px`;

  document.getElementById('note-editor-text').value = '';
  noteEditor.classList.remove('hidden');
  document.getElementById('note-editor-text').focus();
}

function saveNote() {
  if (!pendingSelection || !currentLecture) return;
  const noteText = document.getElementById('note-editor-text').value.trim();
  noteEditor.classList.add('hidden');

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const annotations = loadAnnotations(currentLecture.id, currentPage);
  annotations.push({
    id,
    text: pendingSelection.text.slice(0, 500),
    color: 'yellow',
    note: noteText,
    timestamp: Date.now(),
  });
  saveAnnotations(currentLecture.id, currentPage, annotations);

  wrapRangeWithMark(pendingSelection.range, id, 'yellow', !!noteText);
  if (noteText) {
    const indicator = document.createElement('span');
    indicator.className = 'note-indicator';
    indicator.textContent = 'N';
    indicator.dataset.hlId = id;
    const marks = notesEl.querySelectorAll(`mark[data-hl-id="${id}"]`);
    if (marks.length) marks[marks.length - 1].after(indicator);
  }

  window.getSelection().removeAllRanges();
  pendingSelection = null;
}

function wrapRangeWithMark(range, id, color, hasNote) {
  const mark = document.createElement('mark');
  mark.dataset.hlId = id;
  mark.dataset.hlColor = color;
  if (hasNote) mark.classList.add('has-note');

  try {
    range.surroundContents(mark);
  } catch {
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }
}

function applyHighlights() {
  if (!currentLecture) return;
  const annotations = loadAnnotations(currentLecture.id, currentPage);
  if (!annotations.length) return;

  for (const ann of annotations) {
    const textToFind = ann.text;
    if (!textToFind) continue;

    const walker = document.createTreeWalker(notesEl, NodeFilter.SHOW_TEXT, null);
    let found = false;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.textContent.indexOf(textToFind.slice(0, 60));
      if (idx === -1) continue;

      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, Math.min(idx + textToFind.length, node.textContent.length));
      wrapRangeWithMark(range, ann.id, ann.color, !!ann.note);

      if (ann.note) {
        const indicator = document.createElement('span');
        indicator.className = 'note-indicator';
        indicator.textContent = 'N';
        indicator.dataset.hlId = ann.id;
        const marks = notesEl.querySelectorAll(`mark[data-hl-id="${ann.id}"]`);
        if (marks.length) marks[marks.length - 1].after(indicator);
      }
      found = true;
      break;
    }
  }
}

function onHighlightClick(e) {
  const mark = e.target.closest('mark[data-hl-id]');
  const indicator = e.target.closest('.note-indicator');
  const hlId = mark?.dataset?.hlId || indicator?.dataset?.hlId;
  if (!hlId || !currentLecture) return;

  const annotations = loadAnnotations(currentLecture.id, currentPage);
  const ann = annotations.find(a => a.id === hlId);
  if (!ann) return;

  dismissNotePopover();

  const target = mark || indicator;
  const rect = target.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'note-popover';
  popover.id = 'active-popover';
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 6}px`;

  let html = '';
  if (ann.note) html += `<div style="margin-bottom:8px">${ann.note}</div>`;
  html += `<div style="display:flex;gap:6px;justify-content:flex-end">`;
  html += `<button onclick="editAnnotationNote('${hlId}')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-pane);color:var(--text);cursor:pointer">${ann.note ? 'Edit' : 'Add note'}</button>`;
  html += `<button onclick="removeAnnotation('${hlId}')" style="font-size:11px;padding:3px 8px;border:1px solid #fca5a5;border-radius:4px;background:#fee2e2;color:#dc2626;cursor:pointer">Delete</button>`;
  html += `</div>`;
  popover.innerHTML = html;
  document.body.appendChild(popover);
}

function dismissNotePopover(e) {
  const existing = document.getElementById('active-popover');
  if (existing && (!e || !existing.contains(e.target))) existing.remove();
}

window.removeAnnotation = function(hlId) {
  if (!currentLecture) return;
  dismissNotePopover();
  let annotations = loadAnnotations(currentLecture.id, currentPage);
  annotations = annotations.filter(a => a.id !== hlId);
  saveAnnotations(currentLecture.id, currentPage, annotations);
  renderNotes(currentPage);
};

window.editAnnotationNote = function(hlId) {
  if (!currentLecture) return;
  dismissNotePopover();
  const annotations = loadAnnotations(currentLecture.id, currentPage);
  const ann = annotations.find(a => a.id === hlId);
  if (!ann) return;

  pendingSelection = { text: ann.text, _editId: hlId };

  const mark = notesEl.querySelector(`mark[data-hl-id="${hlId}"]`);
  const quote = noteEditor.querySelector('.note-editor-quote');
  quote.textContent = ann.text.slice(0, 200);
  document.getElementById('note-editor-text').value = ann.note || '';

  if (mark) {
    const rect = mark.getBoundingClientRect();
    noteEditor.style.left = `${Math.min(rect.left, window.innerWidth - 380)}px`;
    noteEditor.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 280)}px`;
  } else {
    noteEditor.style.left = '50%';
    noteEditor.style.top = '30%';
  }

  noteEditor.classList.remove('hidden');
  document.getElementById('note-editor-text').focus();

  document.getElementById('note-editor-save').onclick = () => {
    const newNote = document.getElementById('note-editor-text').value.trim();
    ann.note = newNote;
    ann.timestamp = Date.now();
    saveAnnotations(currentLecture.id, currentPage, annotations);
    noteEditor.classList.add('hidden');
    pendingSelection = null;
    renderNotes(currentPage);
  };
};

function renderAnnotationsPanel() {
  const all = getAllAnnotations();
  if (!all.length) {
    annotationsList.innerHTML = '<div class="ann-empty">No annotations yet. Select text in the notes pane and click Highlight or Add Note.</div>';
    return;
  }

  let html = '';
  for (const ann of all) {
    const date = new Date(ann.timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const colorDot = `<span class="ann-color-dot" style="background:${ann.color === 'yellow' ? '#facc15' : ann.color === 'blue' ? '#60a5fa' : '#4ade80'}"></span>`;
    html += `<div class="annotation-card" onclick="window.location.hash='lecture=${ann.lecId}&page=${ann.page}'">`;
    html += `<div class="ann-quote">${escapeHtml(ann.text.slice(0, 120))}${ann.text.length > 120 ? '...' : ''}</div>`;
    if (ann.note) html += `<div class="ann-note">${escapeHtml(ann.note)}</div>`;
    html += `<div class="ann-meta"><span>${colorDot}${ann.lecTitle} p.${ann.page}</span><span>${date}</span>`;
    html += `<button class="ann-delete" onclick="event.stopPropagation();removeAnnotationById(${ann.lecId},${ann.page},'${ann.id}')">&times;</button>`;
    html += `</div></div>`;
  }
  annotationsList.innerHTML = html;
}

window.removeAnnotationById = function(lecId, page, hlId) {
  let annotations = loadAnnotations(lecId, page);
  annotations = annotations.filter(a => a.id !== hlId);
  saveAnnotations(lecId, page, annotations);
  renderAnnotationsPanel();
  if (currentLecture && currentLecture.id === lecId && currentPage === page) {
    renderNotes(currentPage);
  }
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================================
// Q&A Chat Pane
// ============================================================================

const QA_API_URL = 'http://127.0.0.1:8082/v1/messages';
const QA_MODEL = 'claude-opus-4-6';
let qaHistory = [];
let qaAbortController = null;
let qaOpen = false;

function toggleQaPane() {
  qaOpen = !qaOpen;
  qaPane.classList.toggle('hidden', !qaOpen);
  qaDivider.classList.toggle('hidden', !qaOpen);
  if (qaOpen) {
    loadQaHistory();
    renderQaMessages();
    qaInput.focus();
    if (pdfDoc) renderPage(currentPage);
  }
}

function initQa() {
  qaForm.addEventListener('submit', (e) => { e.preventDefault(); sendQaMessage(); });
  document.getElementById('qa-close').addEventListener('click', () => { qaOpen = false; qaPane.classList.add('hidden'); qaDivider.classList.add('hidden'); if (pdfDoc) renderPage(currentPage); });
  document.getElementById('qa-clear').addEventListener('click', clearQaHistory);

  qaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQaMessage(); }
  });

  initQaDividerDrag();
}

function initQaDividerDrag() {
  let dragging = false;
  qaDivider.addEventListener('mousedown', (e) => { dragging = true; qaDivider.classList.add('active'); e.preventDefault(); });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const right = window.innerWidth - e.clientX;
    const clamped = Math.max(240, Math.min(500, right));
    qaPane.style.flex = `0 0 ${clamped}px`;
  });
  document.addEventListener('mouseup', () => { dragging = false; qaDivider.classList.remove('active'); });
}

function getQaStorageKey() {
  if (!currentLecture) return null;
  return `cs639_qa_L${currentLecture.id}_P${currentPage}`;
}

function loadQaHistory() {
  const key = getQaStorageKey();
  if (!key) { qaHistory = []; return; }
  try {
    const raw = localStorage.getItem(key);
    qaHistory = raw ? JSON.parse(raw) : [];
  } catch { qaHistory = []; }
}

function saveQaHistory() {
  const key = getQaStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(qaHistory.slice(-30)));
}

function clearQaHistory() {
  qaHistory = [];
  const key = getQaStorageKey();
  if (key) localStorage.removeItem(key);
  renderQaMessages();
}

function getSlideContext() {
  if (!lectureData || !currentLecture) return '';
  const slide = lectureData.slides.find(s => s.page === currentPage);
  if (!slide) return '';
  let ctx = `Lecture: ${currentLecture.title}\nSlide ${currentPage}/${totalPages}\n\n`;
  if (slide.explanation) ctx += `Explanation:\n${slide.explanation}\n\n`;
  if (slide.keyPoints?.length) ctx += `Key Points:\n${slide.keyPoints.join('\n')}\n`;
  return ctx;
}

function renderQaMessages() {
  if (!qaHistory.length) {
    qaMessages.innerHTML = '<div class="qa-msg-system">Ask any question about this slide. The AI will use the current slide content as context.</div>';
    return;
  }
  let html = '';
  for (const msg of qaHistory) {
    if (msg.role === 'user') {
      html += `<div class="qa-msg qa-msg-user">${escapeHtml(msg.content)}</div>`;
    } else if (msg.role === 'assistant') {
      html += `<div class="qa-msg qa-msg-assistant">${marked.parse(msg.content)}</div>`;
    }
  }
  qaMessages.innerHTML = html;

  qaMessages.querySelectorAll('.qa-msg-assistant').forEach(el => {
    if (window.renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    }
  });

  qaMessages.scrollTop = qaMessages.scrollHeight;
}

async function sendQaMessage() {
  const text = qaInput.value.trim();
  if (!text) return;

  qaInput.value = '';
  qaHistory.push({ role: 'user', content: text });
  renderQaMessages();

  const sendBtn = document.getElementById('qa-send');
  sendBtn.disabled = true;
  qaInput.disabled = true;

  const typingEl = document.createElement('div');
  typingEl.className = 'qa-typing';
  typingEl.textContent = 'Thinking';
  qaMessages.appendChild(typingEl);
  qaMessages.scrollTop = qaMessages.scrollHeight;

  const slideCtx = getSlideContext();
  const systemPrompt = `You are a helpful CS professor tutoring a student on Foundation Models (CS639 at UW-Madison). The student is currently studying the following slide content. Answer their questions clearly, using Chinese for explanations with English technical terms. Use LaTeX math notation ($...$ inline, $$...$$ display) when relevant. Be concise but thorough.

Current slide context:
${slideCtx}`;

  const apiMessages = qaHistory.slice(-10).map(m => ({ role: m.role, content: m.content }));

  try {
    qaAbortController = new AbortController();
    const resp = await fetch(QA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'not-used',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: QA_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: apiMessages,
      }),
      signal: qaAbortController.signal,
    });

    typingEl.remove();

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`API error (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    let assistantText = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') assistantText += block.text;
    }

    if (!assistantText) assistantText = '(No response received)';
    qaHistory.push({ role: 'assistant', content: assistantText });
    saveQaHistory();
    renderQaMessages();

  } catch (err) {
    typingEl.remove();
    if (err.name === 'AbortError') return;

    let errorMsg = `Error: ${err.message}`;
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      errorMsg = 'Cannot reach the API. Make sure the Claude API proxy is running at 127.0.0.1:8082. This Q&A feature requires the local API proxy.';
    }

    const errDiv = document.createElement('div');
    errDiv.className = 'qa-msg qa-msg-system';
    errDiv.textContent = errorMsg;
    qaMessages.appendChild(errDiv);
    qaMessages.scrollTop = qaMessages.scrollHeight;

    qaHistory.pop();
  } finally {
    sendBtn.disabled = false;
    qaInput.disabled = false;
    qaInput.focus();
    qaAbortController = null;
  }
}

// ============================================================================
// Exam Mode
// ============================================================================

let examData = null;
let examQuestions = [];
let examCurrentIdx = 0;
let examAnswers = {};
let examMode = false;

const examView = document.getElementById('exam-view');
const examBody = document.getElementById('exam-body');
const examSummary = document.getElementById('exam-summary');
const examProgressFill = document.getElementById('exam-progress-fill');
const examProgressText = document.getElementById('exam-progress-text');
const examScoreDisplay = document.getElementById('exam-score-display');
const examTopicTag = document.getElementById('exam-topic-tag');
const examQuestionText = document.getElementById('exam-question-text');
const examOptions = document.getElementById('exam-options');
const examSubmitBtn = document.getElementById('exam-submit');
const examFeedback = document.getElementById('exam-feedback');
const examPrevBtn = document.getElementById('exam-prev');
const examNextBtn = document.getElementById('exam-next');

document.getElementById('btn-exam').addEventListener('click', () => {
  location.hash = 'exam';
});
document.getElementById('exam-back').addEventListener('click', exitExam);
document.getElementById('exam-back-lectures').addEventListener('click', exitExam);
examSubmitBtn.addEventListener('click', submitExamAnswer);
examPrevBtn.addEventListener('click', () => examGoTo(examCurrentIdx - 1));
examNextBtn.addEventListener('click', () => {
  if (examCurrentIdx >= examQuestions.length - 1) {
    showExamSummary();
  } else {
    examGoTo(examCurrentIdx + 1);
  }
});
document.getElementById('exam-retry').addEventListener('click', () => retryExam(false));
document.getElementById('exam-retry-wrong').addEventListener('click', () => retryExam(true));

async function enterExam() {
  if (!examData) {
    try {
      const resp = await fetch('data/exam.json');
      examData = await resp.json();
    } catch (e) {
      console.error('Failed to load exam data:', e);
      return;
    }
  }

  if (!examQuestions.length) {
    examQuestions = examData.questions;
    examAnswers = {};
    examCurrentIdx = 0;
  }

  examMode = true;
  examView.classList.remove('hidden');
  document.getElementById('split-view').style.display = 'none';
  examSummary.classList.add('hidden');
  examBody.style.display = '';
  renderExamQuestion();
}

function exitExam() {
  examMode = false;
  examView.classList.add('hidden');
  document.getElementById('split-view').style.display = '';
  location.hash = '';
}

function examGoTo(idx) {
  if (idx < 0 || idx >= examQuestions.length) return;
  examCurrentIdx = idx;
  location.hash = `exam=${idx + 1}`;
  renderExamQuestion();
}

function renderExamQuestion() {
  const q = examQuestions[examCurrentIdx];
  const state = examAnswers[q.id];
  const answered = state && state.submitted;
  const totalQ = examQuestions.length;
  const answeredCount = Object.values(examAnswers).filter(a => a.submitted).length;

  examProgressFill.style.width = `${(answeredCount / totalQ) * 100}%`;
  examProgressText.textContent = `${answeredCount} / ${totalQ}`;

  const correctCount = Object.values(examAnswers).filter(a => a.submitted && a.correct).length;
  if (answeredCount > 0) {
    examScoreDisplay.textContent = `Score: ${correctCount}/${answeredCount}`;
  } else {
    examScoreDisplay.textContent = '';
  }

  examTopicTag.textContent = q.topic;
  examQuestionText.innerHTML = marked.parse(q.question);
  renderKatex(examQuestionText);

  let optionsHtml = '';
  for (const opt of q.options) {
    const selectedClass = (state && state.selected === opt.label) ? 'selected' : '';
    let resultClass = '';
    if (answered) {
      if (opt.label === q.answer) resultClass = 'correct';
      else if (state.selected === opt.label) resultClass = 'wrong';
      if (opt.label === q.answer && state.selected !== opt.label) resultClass = 'show-correct';
    }
    const lockedClass = answered ? 'locked' : '';
    optionsHtml += `<div class="exam-option ${selectedClass} ${resultClass} ${lockedClass}" data-label="${opt.label}">
      <span class="exam-option-label">${opt.label}</span>
      <span class="exam-option-text">${opt.text}</span>
    </div>`;
  }
  examOptions.innerHTML = optionsHtml;

  examOptions.querySelectorAll('.exam-option-text').forEach(el => renderKatex(el));

  if (!answered) {
    examOptions.querySelectorAll('.exam-option').forEach(optEl => {
      optEl.addEventListener('click', () => {
        examOptions.querySelectorAll('.exam-option').forEach(o => o.classList.remove('selected'));
        optEl.classList.add('selected');
        if (!examAnswers[q.id]) examAnswers[q.id] = {};
        examAnswers[q.id].selected = optEl.dataset.label;
        examSubmitBtn.disabled = false;
      });
    });
    examSubmitBtn.style.display = '';
    examSubmitBtn.disabled = !(state && state.selected);
  } else {
    examSubmitBtn.style.display = 'none';
  }

  if (answered) {
    examFeedback.classList.remove('hidden', 'feedback-correct', 'feedback-wrong');
    if (state.correct) {
      examFeedback.classList.add('feedback-correct');
      examFeedback.innerHTML = `<div class="feedback-header correct-header">Correct!</div><div class="feedback-body">${marked.parse(q.explanation)}</div>`;
    } else {
      examFeedback.classList.add('feedback-wrong');
      examFeedback.innerHTML = `<div class="feedback-header wrong-header">Incorrect — you chose (${state.selected}), correct answer is (${q.answer})</div><div class="feedback-body">${marked.parse(q.explanation)}</div>`;
    }
    renderKatex(examFeedback);
  } else {
    examFeedback.classList.add('hidden');
    examFeedback.classList.remove('feedback-correct', 'feedback-wrong');
  }

  examPrevBtn.disabled = examCurrentIdx <= 0;
  examNextBtn.textContent = examCurrentIdx >= totalQ - 1 ? 'Finish' : 'Next →';

  examBody.querySelector('#exam-question-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function submitExamAnswer() {
  const q = examQuestions[examCurrentIdx];
  const state = examAnswers[q.id];
  if (!state || !state.selected) return;
  state.submitted = true;
  state.correct = state.selected === q.answer;
  renderExamQuestion();
}

function showExamSummary() {
  examBody.style.display = 'none';
  examSummary.classList.remove('hidden');

  const total = examQuestions.length;
  const answered = Object.values(examAnswers).filter(a => a.submitted).length;
  const correct = Object.values(examAnswers).filter(a => a.submitted && a.correct).length;
  const wrong = answered - correct;
  const unanswered = total - answered;
  const pct = answered > 0 ? Math.round((correct / total) * 100) : 0;

  let scoreClass = 'score-low';
  if (pct >= 80) scoreClass = 'score-good';
  else if (pct >= 50) scoreClass = 'score-mid';

  document.getElementById('exam-summary-score').innerHTML =
    `<span class="${scoreClass}">${correct} / ${total}</span><br><span style="font-size:0.35em;color:var(--text-muted)">${pct}% correct</span>`;

  let breakdownHtml = `<span class="breakdown-tag tag-correct">✓ ${correct} correct</span>`;
  if (wrong > 0) breakdownHtml += `<span class="breakdown-tag tag-wrong">✗ ${wrong} wrong</span>`;
  if (unanswered > 0) breakdownHtml += `<span class="breakdown-tag tag-unanswered">○ ${unanswered} skipped</span>`;
  document.getElementById('exam-summary-breakdown').innerHTML = breakdownHtml;

  examProgressFill.style.width = '100%';
  examProgressText.textContent = `${answered} / ${total}`;
}

function retryExam(wrongOnly) {
  if (wrongOnly) {
    const wrongIds = new Set();
    for (const [id, state] of Object.entries(examAnswers)) {
      if (state.submitted && !state.correct) wrongIds.add(parseInt(id));
    }
    const unansweredIds = new Set(
      examQuestions.filter(q => !examAnswers[q.id]?.submitted).map(q => q.id)
    );
    examQuestions = examData.questions.filter(q => wrongIds.has(q.id) || unansweredIds.has(q.id));
    if (examQuestions.length === 0) {
      examQuestions = examData.questions;
    }
  } else {
    examQuestions = examData.questions;
  }
  examAnswers = {};
  examCurrentIdx = 0;
  examSummary.classList.add('hidden');
  examBody.style.display = '';
  renderExamQuestion();
}

function renderKatex(el) {
  if (window.renderMathInElement) {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }
}

init();

// Add exam entry to TOC (after init populates the list)
(function addExamToToc() {
  const examLi = document.createElement('li');
  examLi.style.borderTop = '1px solid var(--border)';
  examLi.style.marginTop = '8px';
  examLi.style.paddingTop = '8px';
  const examA = document.createElement('a');
  examA.href = '#exam';
  examA.textContent = 'Sample Exams';
  examA.style.color = '#7c3aed';
  examA.style.fontWeight = '600';
  examLi.appendChild(examA);
  tocList.appendChild(examLi);
})();
