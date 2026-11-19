// Editor wiring plus the deterministic shot modes used for screenshots.
// Photos are only ever read into local Image objects — nothing uploads.
import { LAYOUTS, SIZES, autofill, drawCover, makeState, panelAt, setLayout } from './cover.js';

const SAMPLES = [
  { name: 'boulevard', label: 'Boulevard', src: 'samples/boulevard.jpg' },
  { name: 'pier', label: 'Pier', src: 'samples/pier.jpg' },
];

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const state = makeState();
const library = []; // { name, img }
let selectedPanel = 0;

const $ = (id) => document.getElementById(id);

function loadImage(src, name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ name, img });
    img.onerror = reject;
    img.src = src;
  });
}

function findSample(raw) {
  if (!raw) return SAMPLES[0];
  const clean = raw.replace(/\.jpe?g$/i, '').toLowerCase();
  return SAMPLES.find((s) => s.name === clean) || SAMPLES[0];
}

/* ---------------- shot modes (no interaction, deterministic) -------- */
async function runShotCover() {
  document.body.classList.add('shot-cover');
  document.body.innerHTML = '<canvas id="shotCanvas"></canvas>';
  const sample = findSample(params.get('photo'));
  const entry = await loadImage(sample.src, sample.name);
  library.push(entry);
  if (params.get('caption')) state.caption = params.get('caption');
  if (params.get('sub')) state.sub = params.get('sub');
  const layout = params.get('layout');
  if (layout && LAYOUTS[layout]) setLayout(state, layout);
  state.sizeId = params.get('size') === 'square' ? 'square' : 'portrait';
  autofill(state, library.map((e) => e.img));
  const size = SIZES[state.sizeId];
  const canvas = $('shotCanvas');
  canvas.width = size.w;
  canvas.height = size.h;
  drawCover(canvas.getContext('2d'), size.w, size.h, state);
  document.title = 'Cover — ready';
}

async function runShotEditor() {
  const sample = findSample(params.get('photo'));
  const entry = await loadImage(sample.src, sample.name);
  library.push(entry);
  if (params.get('caption')) {
    state.caption = params.get('caption');
    $('captionInput').value = state.caption;
  }
  autofill(state, library.map((e) => e.img));
  buildLibraryUI();
  renderPreview();
  document.title = 'Editor — ready';
}

/* ---------------- editor ------------------------------------------- */
const preview = () => $('preview');

function renderPreview() {
  const canvas = preview();
  if (!canvas) return;
  const size = SIZES[state.sizeId];
  // Preview renders at half export resolution: same drawing, cheaper.
  const w = Math.round(size.w / 2);
  const h = Math.round(size.h / 2);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  drawCover(canvas.getContext('2d'), w, h, state);
  document.querySelectorAll('.panel-chip').forEach((el, i) => {
    el.classList.toggle('active', i === selectedPanel);
  });
  const zoom = $('zoomRange');
  if (zoom && state.panels[selectedPanel]) zoom.value = state.panels[selectedPanel].zoom;
}

function buildLibraryUI() {
  const wrap = $('library');
  wrap.innerHTML = '';
  library.forEach((entry, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.type = 'button';
    b.title = `${entry.name} — click to place in the selected panel`;
    const im = document.createElement('img');
    im.src = entry.img.src;
    im.alt = entry.name;
    const cap = document.createElement('span');
    cap.textContent = entry.name;
    b.append(im, cap);
    b.addEventListener('click', () => {
      state.panels[selectedPanel].img = entry.img;
      state.panels[selectedPanel].ox = 0;
      state.panels[selectedPanel].oy = 0;
      autofill(state, library.map((e) => e.img));
      renderPreview();
    });
    wrap.appendChild(b);
  });
}

function buildPanelChips() {
  const wrap = $('panels');
  wrap.innerHTML = '';
  state.panels.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-chip' + (i === selectedPanel ? ' active' : '');
    b.textContent = `Panel ${i + 1}`;
    b.addEventListener('click', () => { selectedPanel = i; renderPreview(); buildPanelChips(); });
    wrap.appendChild(b);
  });
}

function refreshAfterLayout() {
  selectedPanel = 0;
  buildPanelChips();
  autofill(state, library.map((e) => e.img));
  renderPreview();
}

function wireEditor() {
  document.querySelectorAll('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-layout]').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      setLayout(state, btn.dataset.layout);
      refreshAfterLayout();
    });
  });
  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const s = SAMPLES.find((x) => x.name === btn.dataset.sample);
      if (!s || library.some((e) => e.name === s.name)) {
        if (s) {
          const e = library.find((x) => x.name === s.name);
          if (e) { state.panels[selectedPanel].img = e.img; renderPreview(); }
        }
        return;
      }
      const entry = await loadImage(s.src, s.name);
      library.push(entry);
      state.panels[selectedPanel].img = entry.img;
      autofill(state, library.map((e) => e.img));
      buildLibraryUI();
      renderPreview();
    });
  });
  $('fileInput').addEventListener('change', async (ev) => {
    const files = [...ev.target.files];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const entry = await loadImage(url, f.name.replace(/\.[^.]+$/, ''));
      library.push(entry);
    }
    if (files.length) {
      state.panels[selectedPanel].img = library[library.length - files.length].img;
      autofill(state, library.map((e) => e.img));
    }
    buildLibraryUI();
    renderPreview();
    ev.target.value = '';
  });
  $('captionInput').addEventListener('input', (e) => { state.caption = e.target.value; renderPreview(); });
  $('subInput').addEventListener('input', (e) => { state.sub = e.target.value; renderPreview(); });
  $('gradeRange').addEventListener('input', (e) => { state.grade = Number(e.target.value); renderPreview(); });
  $('zoomRange').addEventListener('input', (e) => {
    state.panels[selectedPanel].zoom = Number(e.target.value);
    renderPreview();
  });
  $('duotoneToggle').addEventListener('change', (e) => { state.duotone = e.target.checked; renderPreview(); });
  $('sizeSelect').addEventListener('change', (e) => { state.sizeId = e.target.value; renderPreview(); });
  $('resetBtn').addEventListener('click', () => {
    const p = state.panels[selectedPanel];
    p.ox = 0; p.oy = 0; p.zoom = 1;
    renderPreview();
  });
  $('exportBtn').addEventListener('click', () => {
    const size = SIZES[state.sizeId];
    const off = document.createElement('canvas');
    off.width = size.w;
    off.height = size.h;
    drawCover(off.getContext('2d'), size.w, size.h, state);
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leonida-cover.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });

  // Drag to reposition, wheel to zoom, straight on the preview.
  const canvas = preview();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * canvas.width;
    const py = ((e.clientY - r.top) / r.height) * canvas.height;
    const idx = panelAt(state, canvas.width, canvas.height, px, py);
    if (idx < 0) return;
    selectedPanel = idx;
    buildPanelChips();
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const p = state.panels[selectedPanel];
    p.ox = Math.max(-1, Math.min(1, p.ox + ((e.clientX - drag.x) / r.width) * 2.2));
    p.oy = Math.max(-1, Math.min(1, p.oy + ((e.clientY - drag.y) / r.height) * 2.2));
    drag = { x: e.clientX, y: e.clientY };
    renderPreview();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * canvas.width;
    const py = ((e.clientY - r.top) / r.height) * canvas.height;
    const idx = panelAt(state, canvas.width, canvas.height, px, py);
    if (idx < 0) return;
    selectedPanel = idx;
    const p = state.panels[idx];
    p.zoom = Math.max(1, Math.min(3, p.zoom * (e.deltaY < 0 ? 1.07 : 0.93)));
    buildPanelChips();
    renderPreview();
  }, { passive: false });
}

/* ---------------- boot ---------------------------------------------- */
if (shot === 'cover') {
  runShotCover();
} else {
  wireEditor();
  buildPanelChips();
  if (shot === 'editor') {
    runShotEditor();
  } else {
    // Friendly first paint: load the boulevard sample automatically.
    loadImage(SAMPLES[0].src, SAMPLES[0].name).then((entry) => {
      library.push(entry);
      autofill(state, library.map((e) => e.img));
      buildLibraryUI();
      renderPreview();
    }).catch(() => renderPreview());
    renderPreview();
  }
}
