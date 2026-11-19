// Cover rendering engine. One code path draws the live preview, the
// exported PNG and the screenshot (shot) mode, so what you see in the
// editor is exactly what lands in the downloaded file.

export const SIZES = {
  square: { id: 'square', label: '1080 × 1080 — Square', w: 1080, h: 1080 },
  portrait: { id: 'portrait', label: '1080 × 1350 — Portrait', w: 1080, h: 1350 },
  wide: { id: 'wide', label: '1920 × 1080 — Wide', w: 1920, h: 1080 },
};

// Panel rectangles are fractions of the canvas. Every layout leaves the
// top strip readable for the big caption, like a real game cover.
export const LAYOUTS = {
  hero: {
    id: 'hero',
    label: 'Hero + Two',
    panels: [
      { x: 0, y: 0, w: 1, h: 0.62 },
      { x: 0, y: 0.62, w: 0.5, h: 0.38 },
      { x: 0.5, y: 0.62, w: 0.5, h: 0.38 },
    ],
  },
  trio: {
    id: 'trio',
    label: 'Three Columns',
    panels: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  grid: {
    id: 'grid',
    label: 'Grid + Wide Base',
    panels: [
      { x: 0, y: 0, w: 0.5, h: 0.36 },
      { x: 0.5, y: 0, w: 0.5, h: 0.36 },
      { x: 0, y: 0.36, w: 0.5, h: 0.3 },
      { x: 0.5, y: 0.36, w: 0.5, h: 0.3 },
      { x: 0, y: 0.66, w: 1, h: 0.34 },
    ],
  },
  split: {
    id: 'split',
    label: 'Tall Lead + Stack',
    panels: [
      { x: 0, y: 0, w: 0.58, h: 1 },
      { x: 0.58, y: 0, w: 0.42, h: 0.52 },
      { x: 0.58, y: 0.52, w: 0.42, h: 0.48 },
    ],
  },
};

export function makePanel() {
  return { img: null, ox: 0, oy: 0, zoom: 1 };
}

export function makeState() {
  return {
    layoutId: 'hero',
    panels: LAYOUTS.hero.panels.map(makePanel),
    caption: 'LEONIDA NIGHTS',
    sub: 'VICE CITY • EST. 2026',
    duotone: false,
    grade: 0.75,
    sizeId: 'portrait',
  };
}

export function setLayout(state, layoutId) {
  const next = LAYOUTS[layoutId];
  if (!next) return;
  const old = state.panels;
  state.layoutId = layoutId;
  state.panels = next.panels.map((_, i) => {
    const p = old[i % old.length] || makePanel();
    return { img: p.img, ox: p.ox, oy: p.oy, zoom: p.zoom };
  });
}

// Fill every empty panel by cycling through the loaded photos, so a
// single photo still produces a complete multi-panel cover. Filled
// panels get a deliberate framing: the wide hero panel focuses on the
// upper part of the photo (where faces live, instead of a centre crop
// that decapitates the subject), and later panels get a slight zoom
// with alternating offsets so one photo reads as a collage of crops
// rather than the same picture repeated.
export function autofill(state, images) {
  if (!images.length) return;
  const layout = LAYOUTS[state.layoutId] || LAYOUTS.hero;
  state.panels.forEach((p, i) => {
    if (p.img) return;
    p.img = images[i % images.length];
    const r = layout.panels[i];
    if (i === 0 && r && r.w >= 0.9 && r.h <= 0.7) {
      // Positive oy slides the photo down, so the visible window sits
      // on the upper part of the photo where the subject's face is.
      p.oy = 0.55;
    } else if (i > 0) {
      p.zoom = 1.06;
      p.oy = 0.18;
      p.ox = i % 2 ? 0.18 : -0.18;
    }
  });
}

function drawPanelImage(ctx, rect, panel, grade, duotone) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#1b0f24';
  ctx.fillRect(x, y, w, h);
  const img = panel.img;
  if (img && img.naturalWidth > 0) {
    const lift = 1 + grade * 0.55;
    const con = 1 + grade * 0.28;
    ctx.filter = duotone
      ? `saturate(0.25) contrast(${con}) brightness(1.02)`
      : `saturate(${lift}) contrast(${con}) brightness(1.04)`;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * panel.zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const maxOx = Math.max(0, (dw - w) / 2);
    const maxOy = Math.max(0, (dh - h) / 2);
    const dx = x + (w - dw) / 2 + panel.ox * maxOx;
    const dy = y + (h - dh) / 2 + panel.oy * maxOy;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.filter = 'none';
    if (duotone) {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#ff2e88');
      g.addColorStop(0.55, '#ff7a1a');
      g.addColorStop(1, '#00c2b8');
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Warm sunset wash inside each panel, stronger toward the bottom.
    const wash = ctx.createLinearGradient(x, y, x, y + h);
    wash.addColorStop(0, 'rgba(0,194,184,0.10)');
    wash.addColorStop(0.55, 'rgba(255,122,26,0.00)');
    wash.addColorStop(1, `rgba(255,46,136,${0.10 + grade * 0.16})`);
    ctx.fillStyle = wash;
    ctx.fillRect(x, y, w, h);
  } else {
    // Empty panel: a neon placeholder gradient, never a blank hole.
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#3b1150');
    g.addColorStop(0.5, '#8a1c5c');
    g.addColorStop(1, '#0d5f66');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `700 ${Math.max(14, w * 0.055)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD A PHOTO', x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function fitFont(ctx, text, maxWidth, startSize, family) {
  let size = startSize;
  ctx.font = `900 ${size}px ${family}`;
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `900 ${size}px ${family}`;
  }
  return size;
}

function wrapCaption(ctx, text, maxWidth, startSize, family) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  // Try one line first; fall back to a balanced two-line split.
  ctx.font = `900 ${startSize}px ${family}`;
  if (ctx.measureText(text).width <= maxWidth) return [text];
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  return best ? best.lines : [text];
}

function drawCaption(ctx, W, H, state) {
  const caption = (state.caption || '').trim().toUpperCase();
  const family = '"Arial Black", Impact, "Franklin Gothic Heavy", "Segoe UI", Arial, sans-serif';
  if (caption) {
    // Dark scrim behind the title so it reads over any photo.
    const scrimH = H * 0.30;
    const scrim = ctx.createLinearGradient(0, 0, 0, scrimH);
    scrim.addColorStop(0, 'rgba(10,4,20,0.72)');
    scrim.addColorStop(1, 'rgba(10,4,20,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, scrimH);

    const maxWidth = W * 0.92;
    let size = Math.min(W * 0.135, H * 0.11);
    const lines = wrapCaption(ctx, caption, maxWidth, size, family);
    if (lines.length > 1) size = Math.min(size, W * 0.105);
    size = Math.min(...lines.map((l) => fitFont(ctx, l, maxWidth, size, family)));
    ctx.font = `900 ${size}px ${family}`;
    try { ctx.letterSpacing = `${Math.round(size * 0.02)}px`; } catch { /* older engines */ }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lineH = size * 1.04;
    lines.forEach((line, i) => {
      const y = H * 0.035 + i * lineH;
      const grad = ctx.createLinearGradient(0, y, 0, y + size);
      grad.addColorStop(0, '#fff6c9');
      grad.addColorStop(0.45, '#ffb03a');
      grad.addColorStop(0.78, '#ff5e3a');
      grad.addColorStop(1, '#ff2e88');
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = size * 0.16;
      ctx.shadowOffsetY = size * 0.05;
      ctx.strokeStyle = '#2a0a2e';
      ctx.lineWidth = size * 0.16;
      ctx.strokeText(line, W / 2, y);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = grad;
      ctx.fillText(line, W / 2, y);
    });
    try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
  }
  const sub = (state.sub || '').trim().toUpperCase();
  if (sub) {
    const size = Math.max(18, W * 0.026);
    ctx.font = `800 ${size}px "Segoe UI", Arial, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(size * 0.32)}px`; } catch { /* older engines */ }
    const tw = ctx.measureText(sub).width;
    const padX = size * 0.9;
    const pillW = tw + padX * 2;
    const pillH = size * 2.0;
    const px = (W - pillW) / 2;
    const py = H - pillH - H * 0.028;
    ctx.beginPath();
    ctx.roundRect(px, py, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(12,5,24,0.78)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, W * 0.0022);
    ctx.strokeStyle = '#00e0d0';
    ctx.stroke();
    ctx.fillStyle = '#ffe9f6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sub, W / 2 + size * 0.16, py + pillH / 2 + 1);
    try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
  }
}

// The single render entry point used by preview, export and shot mode.
export function drawCover(ctx, W, H, state) {
  const layout = LAYOUTS[state.layoutId] || LAYOUTS.hero;
  const gutter = Math.max(6, W * 0.008);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, W, H);
  for (const p of layout.panels) {
    const rect = {
      x: p.x * W + gutter / 2,
      y: p.y * H + gutter / 2,
      w: p.w * W - gutter,
      h: p.h * H - gutter,
    };
    const idx = layout.panels.indexOf(p);
    drawPanelImage(ctx, rect, state.panels[idx] || makePanel(), state.grade, state.duotone);
  }
  // Panel dividers: crisp cream keylines over the gutter.
  ctx.strokeStyle = '#f4f1ea';
  ctx.lineWidth = gutter;
  for (const p of layout.panels) {
    ctx.strokeRect(p.x * W, p.y * H, p.w * W, p.h * H);
  }
  // Global sunset grade: a soft sun glow low on the canvas plus a
  // gentle diagonal tint so separate photos feel like one poster.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.98, 0, W * 0.5, H * 0.98, W * 0.85);
  glow.addColorStop(0, `rgba(255,140,40,${0.20 * state.grade})`);
  glow.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const tint = ctx.createLinearGradient(0, 0, W, H);
  tint.addColorStop(0, `rgba(0,194,184,${0.06 * state.grade})`);
  tint.addColorStop(1, `rgba(255,46,136,${0.07 * state.grade})`);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  // Vignette to seat the edges.
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8,2,16,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  drawCaption(ctx, W, H, state);

  // Outer frame.
  ctx.strokeStyle = '#12061c';
  ctx.lineWidth = Math.max(6, W * 0.007);
  ctx.strokeRect(0, 0, W, H);
}

export function panelAt(state, W, H, px, py) {
  const layout = LAYOUTS[state.layoutId] || LAYOUTS.hero;
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    const p = layout.panels[i];
    if (px >= p.x * W && px <= (p.x + p.w) * W && py >= p.y * H && py <= (p.y + p.h) * H) return i;
  }
  return -1;
}
