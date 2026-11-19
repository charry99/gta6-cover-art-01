// Cinematic Intelligence — editor and shot-mode entry point.
// Photos are loaded locally and never leave the device.

import { drawCover, SAMPLES, DEFAULT_TEXT, panelCount } from './cover.js';

const SIZES = [
  { id: '1920x1080', w: 1920, h: 1080, label: '1920 × 1080 — landscape' },
  { id: '1080x1080', w: 1080, h: 1080, label: '1080 × 1080 — square' },
  { id: '1080x1350', w: 1080, h: 1350, label: '1080 × 1350 — portrait' },
];

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

const state = {
  layout: params.get('layout') || 'editorial',
  size: '1920x1080',
  text: { ...DEFAULT_TEXT },
  grade: 100,
  bloom: true,
  grain: true,
  photos: [null, null, null].map(() => ({ img: null, caption: '', panX: 0.5, panY: 0.5, zoom: 1 })),
};

function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) || SAMPLES[0];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function setPanelSample(index, id) {
  const sample = sampleById(id);
  const img = await loadImage(sample.file);
  state.photos[index] = { img, caption: sample.caption, panX: 0.5, panY: 0.5, zoom: 1, sampleId: id };
}

// Sensible default panels: slot 0 is the chosen photo; a triptych fills the
// other two slots with the aerial and neon stills so every caption shows.
async function loadDefaults(photoId) {
  const first = sampleById(photoId || 'neon-drive');
  await setPanelSample(0, first.id);
  const fillers = ['aerial-watch', 'neon-drive', 'storm-drive'].filter((id) => id !== first.id);
  await setPanelSample(1, fillers[0]);
  await setPanelSample(2, fillers[1]);
}

async function preloadFonts() {
  const loads = [
    document.fonts.load('80px Anton'),
    document.fonts.load('54px Cinzel'),
    document.fonts.load('700 30px Archivo'),
    document.fonts.load('30px Archivo'),
    document.fonts.load('italic 44px PlayfairItalic'),
  ];
  await Promise.all(loads);
  await document.fonts.ready;
}

// ------------------------------------------------------------------ editor

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');

function currentSize() {
  return SIZES.find((s) => s.id === state.size) || SIZES[0];
}

function renderPreview() {
  if (shot === 'cover') return;
  const { w, h } = currentSize();
  // Preview at a workable resolution, same drawCover path as the export.
  const scale = Math.min(1, 1100 / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  drawCover(ctx, canvas.width, canvas.height, state);
}

function renderShotCover() {
  const sizeParam = params.get('size') || '1920x1080';
  const [w, h] = sizeParam.split('x').map((n) => parseInt(n, 10) || 0);
  canvas.width = w || 1920;
  canvas.height = h || 1080;
  drawCover(ctx, canvas.width, canvas.height, state);
}

function syncCaptionFields() {
  const count = panelCount(state.layout);
  document.querySelectorAll('[data-caption-wrap]').forEach((wrap) => {
    const idx = Number(wrap.getAttribute('data-caption-wrap'));
    wrap.style.display = count > 1 && idx < count ? '' : 'none';
    const input = wrap.querySelector('input');
    if (input && document.activeElement !== input) input.value = state.photos[idx].caption || '';
  });
}

function bindEditor() {
  const textFields = {
    masthead: document.getElementById('f-masthead'),
    issue: document.getElementById('f-issue'),
    kicker: document.getElementById('f-kicker'),
    title: document.getElementById('f-title'),
    deck: document.getElementById('f-deck'),
    facts: document.getElementById('f-facts'),
  };
  for (const [key, el] of Object.entries(textFields)) {
    if (!el) continue;
    el.value = state.text[key];
    el.addEventListener('input', () => { state.text[key] = el.value; renderPreview(); });
  }

  document.querySelectorAll('[data-layout]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-layout') === state.layout);
    btn.addEventListener('click', () => {
      state.layout = btn.getAttribute('data-layout');
      document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('active', b === btn));
      syncCaptionFields();
      renderPreview();
    });
  });

  const sizeSel = document.getElementById('f-size');
  SIZES.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.label;
    sizeSel.appendChild(opt);
  });
  sizeSel.value = state.size;
  sizeSel.addEventListener('change', () => { state.size = sizeSel.value; renderPreview(); });

  const grade = document.getElementById('f-grade');
  grade.value = String(state.grade);
  grade.addEventListener('input', () => { state.grade = Number(grade.value); renderPreview(); });
  const bloom = document.getElementById('f-bloom');
  bloom.checked = state.bloom;
  bloom.addEventListener('change', () => { state.bloom = bloom.checked; renderPreview(); });
  const grain = document.getElementById('f-grain');
  grain.checked = state.grain;
  grain.addEventListener('change', () => { state.grain = grain.checked; renderPreview(); });

  document.querySelectorAll('[data-caption]').forEach((input) => {
    const idx = Number(input.getAttribute('data-caption'));
    input.addEventListener('input', () => { state.photos[idx].caption = input.value; renderPreview(); });
  });

  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = panelCount(state.layout) > 1 ? Number(document.getElementById('f-panel-target').value) : 0;
      await setPanelSample(target, btn.getAttribute('data-sample'));
      syncCaptionFields();
      renderPreview();
    });
  });

  const fileInput = document.getElementById('f-file');
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    for (let i = 0; i < files.length && i < 3; i++) {
      const url = URL.createObjectURL(files[i]);
      const img = await loadImage(url);
      const slot = panelCount(state.layout) > 1 ? i : 0;
      state.photos[slot] = { img, caption: '', panX: 0.5, panY: 0.5, zoom: 1 };
      if (panelCount(state.layout) === 1) break;
    }
    syncCaptionFields();
    renderPreview();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const { w, h } = currentSize();
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    drawCover(off.getContext('2d'), w, h, state);
    const a = document.createElement('a');
    a.download = `cinematic-intelligence-cover-${state.size}.png`;
    a.href = off.toDataURL('image/png');
    a.click();
  });

  // Drag to reposition the photo in a panel, wheel to zoom it.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const count = panelCount(state.layout);
    const idx = Math.min(count - 1, Math.floor(x * count));
    drag = { idx, startX: e.clientX, startY: e.clientY, panX: state.photos[idx].panX, panY: state.photos[idx].panY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const photo = state.photos[drag.idx];
    photo.panX = Math.min(1, Math.max(0, drag.panX - (e.clientX - drag.startX) / rect.width * panelCount(state.layout)));
    photo.panY = Math.min(1, Math.max(0, drag.panY - (e.clientY - drag.startY) / rect.height));
    renderPreview();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const count = panelCount(state.layout);
    const idx = Math.min(count - 1, Math.floor(x * count));
    const photo = state.photos[idx];
    photo.zoom = Math.min(3, Math.max(1, (photo.zoom || 1) * (e.deltaY < 0 ? 1.06 : 0.94)));
    renderPreview();
  }, { passive: false });
}

// -------------------------------------------------------------------- boot

async function boot() {
  await preloadFonts();
  await loadDefaults(params.get('photo') || 'neon-drive');
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    if (params.get('layout')) state.layout = params.get('layout');
    renderShotCover();
    document.title = 'cover-ready';
    return;
  }
  bindEditor();
  syncCaptionFields();
  renderPreview();
  if (shot === 'editor') document.title = 'editor-ready';
}

boot();
