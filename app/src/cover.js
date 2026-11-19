// Cover rendering — one code path for the live preview, shot mode and PNG export.

export const LAYOUTS = {
  hero: {
    label: "Hero + 2",
    panels: [
      { x: 0, y: 0, w: 1, h: 0.62 },
      { x: 0, y: 0.62, w: 0.5, h: 0.38 },
      { x: 0.5, y: 0.62, w: 0.5, h: 0.38 },
    ],
  },
  trio: {
    label: "Three panels",
    panels: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  grid: {
    label: "Grid + wide base",
    panels: [
      { x: 0, y: 0, w: 0.5, h: 0.36 },
      { x: 0.5, y: 0, w: 0.5, h: 0.36 },
      { x: 0, y: 0.36, w: 0.5, h: 0.36 },
      { x: 0.5, y: 0.36, w: 0.5, h: 0.36 },
      { x: 0, y: 0.72, w: 1, h: 0.28 },
    ],
  },
};

export const SIZES = {
  "1080x1080": { w: 1080, h: 1080, label: "Square · 1080 × 1080" },
  "1080x1350": { w: 1080, h: 1350, label: "Portrait · 1080 × 1350" },
  "1920x1080": { w: 1920, h: 1080, label: "Wide · 1920 × 1080" },
};

function drawPhoto(ctx, img, rect, panel, grade) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // Placeholder wash when a panel has no photo yet.
  const wash = ctx.createLinearGradient(x, y, x, y + h);
  wash.addColorStop(0, "#2b1055"); wash.addColorStop(0.55, "#ff2e88"); wash.addColorStop(1, "#ff9a3d");
  ctx.fillStyle = wash; ctx.fillRect(x, y, w, h);
  if (img) {
    const zoom = panel?.zoom ?? 1;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const maxOx = Math.max(0, (dw - w) / 2), maxOy = Math.max(0, (dh - h) / 2);
    const cx = x + w / 2 + (panel?.ox ?? 0) * maxOx;
    const cy = y + h / 2 + (panel?.oy ?? 0) * maxOy;
    ctx.filter = `saturate(${1 + grade * 0.55}) contrast(${1 + grade * 0.22}) brightness(${1 + grade * 0.05})`;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.filter = "none";
  }
  ctx.restore();
}

function gradePanel(ctx, rect, grade, duotone, idx = 0) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // Sunset wash: warm at the top, magenta through the middle, teal at the base.
  // Each panel leans a touch warmer or cooler so the collage feels printed, not pasted.
  const lean = (idx % 3) - 1; // -1 cooler, 0 neutral, +1 warmer
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(255,${154 + lean * 18},61,${0.20 * grade})`);
  g.addColorStop(0.5, `rgba(255,46,${136 - lean * 20},${0.16 * grade})`);
  g.addColorStop(1, `rgba(0,${229 + lean * 10},204,${0.14 * grade})`);
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (duotone) {
    ctx.globalCompositeOperation = "color";
    const d = ctx.createLinearGradient(x, y + h, x + w, y);
    d.addColorStop(0, "rgba(0,229,204,0.55)");
    d.addColorStop(0.5, "rgba(120,40,200,0.35)");
    d.addColorStop(1, "rgba(255,46,136,0.55)");
    ctx.fillStyle = d; ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function fitFont(ctx, text, maxW, startPx, weight = 900) {
  let px = startPx;
  const family = `"Arial Narrow","Liberation Sans Narrow",Impact,"Arial Black",Arial,sans-serif`;
  while (px > 18) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 4;
  }
  return px;
}

function drawCaption(ctx, W, H, caption, sub) {
  const cap = (caption || "").trim();
  if (!cap && !(sub || "").trim()) return;
  const pad = W * 0.045;
  // Soft scrim so lettering always reads over busy photos.
  const scrimH = H * 0.30;
  const scrim = ctx.createLinearGradient(0, H - scrimH, 0, H);
  scrim.addColorStop(0, "rgba(10,4,24,0)");
  scrim.addColorStop(1, "rgba(10,4,24,0.62)");
  ctx.fillStyle = scrim; ctx.fillRect(0, H - scrimH, W, scrimH);

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  let baseline = H - pad * 0.72;
  if ((sub || "").trim()) {
    const subPx = Math.max(15, W * 0.026);
    ctx.font = `700 ${subPx}px "Arial Narrow",Arial,sans-serif`;
    try { ctx.letterSpacing = `${Math.round(subPx * 0.34)}px`; } catch {}
    ctx.lineWidth = subPx * 0.16; ctx.strokeStyle = "rgba(10,4,24,0.85)"; ctx.fillStyle = "#7df9ec";
    ctx.strokeText(sub.trim().toUpperCase(), W / 2, baseline);
    ctx.fillText(sub.trim().toUpperCase(), W / 2, baseline);
    try { ctx.letterSpacing = "0px"; } catch {}
    baseline -= subPx * 1.45;
  }
  if (cap) {
    const px = fitFont(ctx, cap.toUpperCase(), W - pad * 2, W * 0.135);
    ctx.font = `900 ${px}px "Arial Narrow","Liberation Sans Narrow",Impact,"Arial Black",Arial,sans-serif`;
    try { ctx.letterSpacing = `${Math.round(px * 0.02)}px`; } catch {}
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255,46,136,0.55)"; ctx.shadowBlur = px * 0.22; ctx.shadowOffsetY = px * 0.05;
    ctx.lineWidth = px * 0.14; ctx.strokeStyle = "#12041f";
    ctx.strokeText(cap.toUpperCase(), W / 2, baseline);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const fill = ctx.createLinearGradient(0, baseline - px, 0, baseline);
    fill.addColorStop(0, "#ffffff"); fill.addColorStop(0.55, "#ffe9f4"); fill.addColorStop(1, "#ffb3d9");
    ctx.fillStyle = fill;
    ctx.fillText(cap.toUpperCase(), W / 2, baseline);
    try { ctx.letterSpacing = "0px"; } catch {}
  }
}

// state: { layout, panels:[{img,ox,oy,zoom}], caption, sub, grade:0..1, duotone:bool }
export function renderCover(ctx, W, H, state) {
  const layout = LAYOUTS[state.layout] ?? LAYOUTS.hero;
  const gutter = Math.max(4, Math.round(W * 0.008));
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  layout.panels.forEach((p, i) => {
    const rect = {
      x: p.x * W + gutter / 2, y: p.y * H + gutter / 2,
      w: p.w * W - gutter, h: p.h * H - gutter,
    };
    const panel = state.panels[i] ?? {};
    drawPhoto(ctx, panel.img ?? null, rect, panel, state.grade);
    gradePanel(ctx, rect, state.grade, state.duotone, i);
  });
  // Vignette for a printed-poster finish.
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(10,2,20,0.28)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // Thin inner keyline.
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = Math.max(3, W * 0.004);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
  drawCaption(ctx, W, H, state.caption, state.sub);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
