import { LAYOUTS, SIZES, renderCover, loadImage } from "./cover.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const shot = params.get("shot");

const state = {
  layout: "hero",
  photos: [], // {img, name}
  panels: [], // {photo: index|-1, ox, oy, zoom}
  caption: params.get("caption") || "LEONIDA NIGHTS",
  sub: "VICE CITY · EST. SUNSET",
  grade: 0.8,
  duotone: false,
  size: "1080x1080",
  selected: 0,
};

function ensurePanels() {
  const n = LAYOUTS[state.layout].panels.length;
  while (state.panels.length < n) {
    const i = state.panels.length;
    state.panels.push({ photo: state.photos.length ? i % state.photos.length : -1, ox: 0, oy: 0, zoom: 1 });
  }
  state.panels.length = n;
  state.panels.forEach((p, i) => {
    if ((p.photo < 0 || p.photo >= state.photos.length) && state.photos.length) p.photo = i % state.photos.length;
  });
  if (state.selected >= n) state.selected = 0;
}

function coverState() {
  ensurePanels();
  return {
    layout: state.layout,
    panels: state.panels.map((p) => ({
      img: p.photo >= 0 ? state.photos[p.photo]?.img ?? null : null,
      ox: p.ox, oy: p.oy, zoom: p.zoom,
    })),
    caption: state.caption, sub: state.sub, grade: state.grade, duotone: state.duotone,
  };
}

const preview = $("#preview");
function drawPreview() {
  if (!preview) return;
  const { w, h } = SIZES[state.size];
  const maxW = preview.parentElement.clientWidth || 640;
  const scale = Math.min(1, maxW / w);
  preview.width = Math.round(w * scale); preview.height = Math.round(h * scale);
  renderCover(preview.getContext("2d"), preview.width, preview.height, coverState());
  markSelected();
}

function markSelected() {
  const wrap = $("#previewWrap");
  const badge = $("#panelBadge");
  if (!badge || !preview) return;
  const layout = LAYOUTS[state.layout];
  const p = layout.panels[state.selected];
  badge.textContent = `Panel ${state.selected + 1} of ${layout.panels.length} — drag the cover to move it, scroll to zoom`;
  wrap.dataset.panel = String(state.selected + 1);
  void p;
}

function refreshPanelControls() {
  ensurePanels();
  const sel = $("#panelSelect");
  sel.innerHTML = "";
  LAYOUTS[state.layout].panels.forEach((_, i) => {
    const o = document.createElement("option");
    o.value = String(i); o.textContent = `Panel ${i + 1}`;
    sel.appendChild(o);
  });
  sel.value = String(state.selected);
  const photoSel = $("#panelPhoto");
  photoSel.innerHTML = "";
  if (!state.photos.length) {
    const o = document.createElement("option"); o.textContent = "No photos yet"; photoSel.appendChild(o);
  }
  state.photos.forEach((ph, i) => {
    const o = document.createElement("option");
    o.value = String(i); o.textContent = ph.name;
    photoSel.appendChild(o);
  });
  const p = state.panels[state.selected];
  if (p && state.photos.length) photoSel.value = String(Math.max(0, p.photo));
  $("#zoom").value = String(p?.zoom ?? 1);
}

function refreshThumbs() {
  const box = $("#thumbs"); box.innerHTML = "";
  state.photos.forEach((ph, i) => {
    const b = document.createElement("button");
    b.className = "thumb"; b.type = "button"; b.title = ph.name;
    const im = document.createElement("img"); im.src = ph.img.src; im.alt = ph.name;
    b.appendChild(im);
    b.addEventListener("click", () => {
      ensurePanels();
      state.panels[state.selected].photo = i;
      drawPreview(); refreshPanelControls();
    });
    box.appendChild(b);
  });
}

async function addPhoto(img, name) {
  state.photos.push({ img, name });
  ensurePanels();
  refreshThumbs(); refreshPanelControls(); drawPreview();
}

async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(f);
    try { await addPhoto(await loadImage(url), f.name); } catch { /* skip unreadable file */ }
  }
}

function exportPng() {
  const { w, h } = SIZES[state.size];
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  renderCover(c.getContext("2d"), w, h, coverState());
  const a = document.createElement("a");
  a.download = "leonida-cover.png";
  a.href = c.toDataURL("image/png");
  a.click();
}

// ---- wiring ----
function wire() {
  $("#fileInput").addEventListener("change", (e) => addFiles(e.target.files));
  document.querySelectorAll("[data-sample]").forEach((b) =>
    b.addEventListener("click", async () => {
      const name = b.dataset.sample;
      if (state.photos.some((p) => p.name === name)) return;
      await addPhoto(await loadImage(`samples/${name}`), name);
    }));
  document.querySelectorAll("[data-layout]").forEach((b) =>
    b.addEventListener("click", () => {
      state.layout = b.dataset.layout;
      document.querySelectorAll("[data-layout]").forEach((x) => x.classList.toggle("on", x === b));
      ensurePanels(); refreshPanelControls(); drawPreview();
    }));
  $("#caption").addEventListener("input", (e) => { state.caption = e.target.value; drawPreview(); });
  $("#sub").addEventListener("input", (e) => { state.sub = e.target.value; drawPreview(); });
  $("#grade").addEventListener("input", (e) => { state.grade = Number(e.target.value); drawPreview(); });
  $("#duotone").addEventListener("change", (e) => { state.duotone = e.target.checked; drawPreview(); });
  $("#size").addEventListener("change", (e) => { state.size = e.target.value; drawPreview(); });
  $("#panelSelect").addEventListener("change", (e) => { state.selected = Number(e.target.value); refreshPanelControls(); markSelected(); });
  $("#panelPhoto").addEventListener("change", (e) => {
    ensurePanels(); state.panels[state.selected].photo = Number(e.target.value); drawPreview();
  });
  $("#zoom").addEventListener("input", (e) => {
    ensurePanels(); state.panels[state.selected].zoom = Number(e.target.value); drawPreview();
  });
  $("#resetPanel").addEventListener("click", () => {
    ensurePanels(); const p = state.panels[state.selected];
    p.ox = 0; p.oy = 0; p.zoom = 1; $("#zoom").value = "1"; drawPreview();
  });
  $("#exportBtn").addEventListener("click", exportPng);
  window.addEventListener("resize", drawPreview);

  // Drag to reposition + wheel to zoom, hit-tested per panel.
  let drag = null;
  const panelAt = (e) => {
    const r = preview.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    const layout = LAYOUTS[state.layout];
    const i = layout.panels.findIndex((p) => nx >= p.x && nx < p.x + p.w && ny >= p.y && ny < p.y + p.h);
    return { i: i < 0 ? state.selected : i, nx, ny };
  };
  preview.addEventListener("pointerdown", (e) => {
    const { i } = panelAt(e);
    state.selected = i; refreshPanelControls();
    drag = { x: e.clientX, y: e.clientY };
    preview.setPointerCapture(e.pointerId);
  });
  preview.addEventListener("pointermove", (e) => {
    if (!drag) return;
    ensurePanels();
    const p = state.panels[state.selected];
    const r = preview.getBoundingClientRect();
    p.ox = Math.max(-1, Math.min(1, p.ox + (e.clientX - drag.x) / (r.width * 0.5)));
    p.oy = Math.max(-1, Math.min(1, p.oy + (e.clientY - drag.y) / (r.height * 0.5)));
    drag = { x: e.clientX, y: e.clientY };
    drawPreview();
  });
  preview.addEventListener("pointerup", () => { drag = null; });
  preview.addEventListener("dblclick", (e) => {
    ensurePanels();
    const { i } = panelAt(e); state.selected = i;
    const p = state.panels[state.selected];
    p.ox = 0; p.oy = 0; p.zoom = 1; $("#zoom").value = "1";
    refreshPanelControls(); drawPreview();
  });
  preview.addEventListener("wheel", (e) => {
    e.preventDefault();
    ensurePanels();
    const { i } = panelAt(e); state.selected = i;
    const p = state.panels[state.selected];
    p.zoom = Math.max(1, Math.min(3, p.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
    $("#zoom").value = String(p.zoom);
    refreshPanelControls(); drawPreview();
  }, { passive: false });

  const drop = $("#drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
}

async function boot() {
  const sample = params.get("photo");
  if (shot === "cover") {
    document.body.classList.add("shot-cover");
    const name = sample || "boulevard.jpg";
    const img = await loadImage(`samples/${name}`);
    state.photos = [{ img, name }];
    state.caption = params.get("caption") || state.caption;
    ensurePanels();
    const c = $("#shotCanvas");
    const fit = () => {
      c.width = window.innerWidth; c.height = window.innerHeight;
      renderCover(c.getContext("2d"), c.width, c.height, coverState());
    };
    fit(); window.addEventListener("resize", fit);
    document.body.dataset.ready = "1";
    return;
  }
  wire();
  $("#caption").value = state.caption;
  $("#sub").value = state.sub;
  if (sample) {
    const img = await loadImage(`samples/${sample}`);
    await addPhoto(img, sample);
  } else {
    // Start with both samples ready so the first cover is one click away.
    for (const n of ["boulevard.jpg", "pier.jpg"]) {
      try { state.photos.push({ img: await loadImage(`samples/${n}`), name: n }); } catch {}
    }
    ensurePanels(); refreshThumbs();
  }
  refreshPanelControls(); drawPreview();
  document.body.dataset.ready = "1";
}

boot();
