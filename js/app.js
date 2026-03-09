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
const tocPanel = document.getElementById('toc-panel');
const tocClose = document.getElementById('toc-close');
const tocList = document.getElementById('toc-list');
const divider = document.getElementById('divider');
const slidePane = document.getElementById('slide-pane');

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
  btnToc.addEventListener('click', () => tocPanel.classList.toggle('hidden'));
  tocClose.addEventListener('click', () => tocPanel.classList.add('hidden'));
  btnTheme.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', handleKeys);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('resize', () => { if (pdfDoc) renderPage(currentPage); });
  initDividerDrag();
}

function handleKeys(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToPage(currentPage - 1); }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1); }
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
}

init();
