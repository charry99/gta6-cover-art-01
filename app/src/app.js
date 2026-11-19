// Editor wiring + shot modes. Everything runs locally; photos never
// leave the device (they are read as object URLs / data in memory only).
import { drawCover, DEFAULTS, LAYOUT_PANELS } from './cover.js';

const SAMPLES = [
  { id: 'neon-drive', label: 'Neon Drive' },
  { id: 'storm-drive', label: 'Storm Drive' },
  { id: 'aerial-watch', label: 'Aerial Watch' },
  { id: 'open-top', label: 'Open Top' },
];

const state = {
  ...DEFAULTS,
  photos: [], // [{img, x, y, zoom}]
  size: [1920, 1080],
  activePanel: 0,
};

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const params = new URLSearchParams(location.search);
const shot = params.get('shot');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function setPhoto(panel, src) {
  const img = await loadImage(src);
  state.photos[panel] = { img, x: 0, y: 0, zoom: 1 };
  render();
}

function render() {
  const [w, h] = state.size;
  const dpr = shot === 'cover' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w; canvas.height = h;
  if (shot !== 'cover') {
    canvas.style.aspectRatio = `${w} / ${h}`;
  }
  drawCover(canvas.getContext('2d'), w, h, state);
}

async function loadSample(name, panel = 0) {
  const found = SAMPLES.find((x) => x.id === name) || SAMPLES[0];
  await setPhoto(panel, `samples/${found.id}.jpg`);
  // Fill remaining panels with the other samples for multi-panel layouts.
  const need = LAYOUT_PANELS[state.layout] || 1;
  for (let i = 0; i < need; i++) {
    if (!state.photos[i]) {
      const extra = SAMPLES[(SAMPLES.indexOf(found) + i) % SAMPLES.length];
      await setPhoto(i, `samples/${extra.id}.jpg`);
    }
  }
  render();
}

function bindEditor() {
  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => loadSample(btn.dataset.sample, state.activePanel));
  });
  $('file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    for (let i = 0; i < files.length; i++) {
      const panel = Math.min(state.activePanel + i, (LAYOUT_PANELS[state.layout] || 1) - 1);
      await setPhoto(panel, URL.createObjectURL(files[i]));
    }
  });
  document.querySelectorAll('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.layout = btn.dataset.layout;
      document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b === btn));
      $('panelRow').style.display = state.layout === 'editorial' ? 'none' : 'flex';
      const need = LAYOUT_PANELS[state.layout];
      for (let i = 0; i < need; i++) if (!state.photos[i]) await setPhoto(i, `samples/${SAMPLES[i % SAMPLES.length].id}.jpg`);
      render();
    });
  });
  document.querySelectorAll('[data-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activePanel = Number(btn.dataset.panel);
      document.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('on', b === btn));
    });
  });
  $('size').addEventListener('change', (e) => {
    state.size = e.target.value.split('x').map(Number);
    render();
  });
  for (const key of ['masthead', 'issue', 'kicker', 'title', 'deck', 'facts']) {
    $(key).addEventListener('input', (e) => { state[key] = e.target.value; render(); });
  }
  $('grade').addEventListener('input', (e) => { state.grade = Number(e.target.value); render(); });
  $('neon').addEventListener('change', (e) => { state.neon = e.target.checked; render(); });
  $('grain').addEventListener('change', (e) => { state.grain = e.target.checked; render(); });
  $('zoom').addEventListener('input', (e) => {
    const p = state.photos[state.activePanel];
    if (p) { p.zoom = Number(e.target.value); render(); }
  });

  // Drag to reposition the active panel, wheel to zoom it.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = state.photos[state.activePanel]; if (!p) return;
    const r = canvas.getBoundingClientRect();
    p.x += (e.clientX - drag.x) / r.width; p.y += (e.clientY - drag.y) / r.height;
    drag = { x: e.clientX, y: e.clientY }; render();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = state.photos[state.activePanel]; if (!p) return;
    p.zoom = Math.min(3, Math.max(1, (p.zoom || 1) * (e.deltaY < 0 ? 1.06 : 0.94)));
    $('zoom').value = p.zoom; render();
  }, { passive: false });

  $('export').addEventListener('click', () => {
    const [w, h] = state.size;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    drawCover(off.getContext('2d'), w, h, state);
    const a = document.createElement('a');
    a.download = `cinematic-intelligence-cover-${w}x${h}.png`;
    a.href = off.toDataURL('image/png');
    a.click();
  });
}

async function boot() {
  // Fonts load lazily — force every canvas family to load before the
  // first render, otherwise the title falls back to a generic sans.
  await Promise.all([
    document.fonts.load('100px Anton'),
    document.fonts.load('600 30px Cinzel'),
    document.fonts.load('italic 500 30px "Playfair Italic"'),
    document.fonts.load('700 19px Archivo'),
    document.fonts.load('600 16px Archivo'),
  ]);
  await document.fonts.ready;
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const size = (params.get('size') || '1920x1080').split('x').map(Number);
    state.size = size;
    state.layout = params.get('layout') || 'editorial';
    canvas.width = size[0]; canvas.height = size[1];
    canvas.style.width = '100vw'; canvas.style.height = '100vh';
    await loadSample(params.get('photo') || 'neon-drive');
    render();
    document.title = 'cover-ready';
    return;
  }
  bindEditor();
  if (shot === 'editor') {
    await loadSample(params.get('photo') || 'neon-drive');
    document.title = 'editor-ready';
  } else {
    await loadSample('neon-drive');
  }
  render();
}

boot();
