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
  btnTheme.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', handleKeys);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('resize', () => { if (pdfDoc) renderPage(currentPage); });
  initDividerDrag();
  initHighlightSystem();
}

function handleKeys(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToPage(currentPage - 1); }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1); }
  if (e.key === 'Escape') { contextMenu.classList.add('hidden'); noteEditor.classList.add('hidden'); dismissNotePopover(); }
}

function handleHashChange() {
  const hash = location.hash.slice(1);
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

init();
