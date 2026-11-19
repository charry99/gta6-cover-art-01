// Cinematic Intelligence cover renderer.
// One render path (drawCover) drives the live preview, the PNG export and
// the deterministic shot modes, so what you see is exactly what you export.
//
// The pipeline, in order:
//   1. per-panel photo grade (S-curve, saturation, midnight split tone)
//   2. neon bloom pass (screen blend of the bright, saturated highlights)
//   3. full-width top and bottom scrims, plus the dark facts band
//   4. vignette and fine monochrome grain
//   5. the editorial type system (Cinzel / Archivo / Anton / Playfair Italic)

export const GOLD = '#dca83f';
export const CYAN = '#2fc3ea';
export const PAPER = '#f6f1e7';
export const INK = '#01020a';

export const SAMPLES = [
  { id: 'neon-drive', file: 'samples/neon-drive.jpg', caption: 'NEON OVER OCEAN DRIVE' },
  { id: 'storm-drive', file: 'samples/storm-drive.jpg', caption: 'STORM OVER OCEAN DRIVE' },
  { id: 'aerial-watch', file: 'samples/aerial-watch.jpg', caption: 'THE HUNT FROM ABOVE' },
  { id: 'open-top', file: 'samples/open-top.jpg', caption: 'OPEN TOP OVER THE STRIP' },
];

export const DEFAULT_TEXT = {
  masthead: 'CINEMATIC INTELLIGENCE',
  issue: 'LAUNCH DAY ISSUE · 19 · 11 · 2026',
  kicker: 'GRAND THEFT AUTO VI · ROCKSTAR GAMES',
  title: 'VICE CITY',
  deck: 'Thirteen years after GTA V, Jason Duval and Lucia Caminos take Leonida. The wait is over.',
  facts: 'OUT NOW · PLAYSTATION 5 · XBOX SERIES X|S · LEONIDA · 8 GAME AWARDS NOMINATIONS',
};

export const LAYOUTS = [
  { id: 'editorial', label: 'Editorial', panels: 1 },
  { id: 'diptych', label: 'Diptych', panels: 2 },
  { id: 'triptych', label: 'Triptych', panels: 3 },
];

export function panelCount(layout) {
  const found = LAYOUTS.find((l) => l.id === layout);
  return found ? found.panels : 1;
}

// ---------------------------------------------------------------- utilities

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Deterministic PRNG so grain (and therefore screenshots) never changes
// between loads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 256);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

// ------------------------------------------------------------- photo grade

// Build a contrast / saturation lookup table for one grade strength.
function buildLut(strength) {
  const lut = new Uint8ClampedArray(256);
  const bend = 0.30 * strength; // S-curve amount
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    // S-curve: shadows pulled down, highlights lifted slightly.
    let y = x + bend * Math.sin((x - 0.5) * Math.PI) * (x * (1 - x)) * 2;
    // A gentle overall contrast push around the midpoint.
    y = 0.5 + (y - 0.5) * (1 + 0.12 * strength);
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

function gradePixels(ctx, w, h, strength) {
  if (strength <= 0.001) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lut = buildLut(Math.min(strength, 1.6));
  const sat = 1 + 0.30 * strength; // ~1.3x at full strength
  const shadowTint = [10, 16, 48]; // midnight blue #0a1030
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
    // Saturation around luminance.
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;
    // Split tone: shadows fall toward midnight blue, highlights stay warm.
    const l = lum / 255;
    const shadowW = (1 - l) * (1 - l) * 0.34 * strength;
    r += (shadowTint[0] - r) * shadowW;
    g += (shadowTint[1] - g) * shadowW;
    b += (shadowTint[2] - b) * shadowW;
    const hiW = l * l * 0.10 * strength;
    r += 255 * hiW * 0.35;
    g += 255 * hiW * 0.12;
    b -= 255 * hiW * 0.30;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

// Draw one photo cover-fit into a rect, graded, on its own canvas.
function gradedPanel(photo, w, h, strength) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05070f';
  ctx.fillRect(0, 0, w, h);
  if (photo && photo.img) {
    const img = photo.img;
    const zoom = photo.zoom || 1;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (w - dw) * (photo.panX != null ? photo.panX : 0.5);
    const dy = (h - dh) * (photo.panY != null ? photo.panY : 0.5);
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  gradePixels(ctx, c.width, c.height, strength);
  return c;
}

// Neon bloom: keep only bright pixels, blur them, screen them back.
function applyBloom(ctx, graded, w, h, strength) {
  const sw = Math.max(2, Math.round(w / 4));
  const sh = Math.max(2, Math.round(h / 4));
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext('2d');
  sctx.drawImage(graded, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const keep = Math.max(0, (lum - 0.52) / 0.48);
    const boost = keep * keep * 1.6;
    d[i] = Math.min(255, d[i] * boost);
    d[i + 1] = Math.min(255, d[i + 1] * boost);
    d[i + 2] = Math.min(255, d[i + 2] * boost);
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.55 * Math.min(strength, 1.4);
  try { ctx.filter = `blur(${Math.max(6, Math.round(w * 0.012))}px) saturate(1.7)`; } catch (e) { /* older engines */ }
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();
}

// ------------------------------------------------------------------- type

// Width of a string drawn one character at a time with extra tracking.
function spacedWidth(ctx, text, tracking) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return text.length ? w - tracking : 0;
}

function drawSpaced(ctx, text, x, y, tracking, align = 'left') {
  const total = spacedWidth(ctx, text, tracking);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = prevAlign;
  return total;
}

// Shrink the font (same family/weight/style) until the spaced text fits.
// A small safety factor is applied: per-character advances and the plain
// measureText width can disagree by a percent or two on some faces.
function fitSpaced(ctx, text, baseFont, maxWidth, trackingRatio) {
  const limit = maxWidth * 0.97;
  let size = parseFloat(baseFont.match(/([\d.]+)px/)[1]);
  const build = (s) => baseFont.replace(/([\d.]+)px/, `${s}px`);
  ctx.font = build(size);
  let tracking = size * trackingRatio;
  while (spacedWidth(ctx, text, tracking) > limit && size > 6) {
    size *= 0.96;
    ctx.font = build(size);
    tracking = size * trackingRatio;
  }
  return { size, tracking };
}

function fitPlain(ctx, text, baseFont, maxWidth) {
  const limit = maxWidth * 0.97;
  let size = parseFloat(baseFont.match(/([\d.]+)px/)[1]);
  const build = (s) => baseFont.replace(/([\d.]+)px/, `${s}px`);
  ctx.font = build(size);
  while (ctx.measureText(text).width > limit && size > 6) {
    size *= 0.96;
    ctx.font = build(size);
  }
  return size;
}

// The deck is always exactly two lines, breaking after "Caminos" for the
// default copy; a custom deck breaks after its first sentence clause in the
// same place when the marker word is present, otherwise at the midpoint word.
export function deckLines(deck) {
  const text = (deck || '').trim();
  const marker = 'Caminos';
  const idx = text.indexOf(marker);
  if (idx >= 0) {
    const cut = idx + marker.length;
    return [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean);
  }
  const words = text.split(/\s+/);
  if (words.length < 4) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

// -------------------------------------------------------------- main render

export function drawCover(ctx, W, H, state) {
  const text = { ...DEFAULT_TEXT, ...(state.text || {}) };
  const layout = state.layout || 'editorial';
  const count = panelCount(layout);
  const photos = state.photos || [];
  const strength = (state.grade != null ? state.grade : 100) / 100;
  const margin = 0.0375 * W;

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // --- panels: graded photos -------------------------------------------
  const panelW = W / count;
  const pendingCaptions = [];
  for (let i = 0; i < count; i++) {
    const px = i * panelW;
    const graded = gradedPanel(photos[i], panelW, H, strength);
    ctx.drawImage(graded, px, 0);
    if (state.bloom !== false && strength > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.rect(px, 0, panelW, H); ctx.clip();
      ctx.translate(px, 0);
      applyBloom(ctx, graded, panelW, H, strength);
      ctx.restore();
    }
    if (count > 1) {
      // Per-panel bottom scrim, gold frame and caption.
      const scrim = ctx.createLinearGradient(0, H * 0.86, 0, H);
      scrim.addColorStop(0, 'rgba(1,2,10,0)');
      scrim.addColorStop(1, 'rgba(1,2,10,0.82)');
      ctx.fillStyle = scrim;
      ctx.fillRect(px, H * 0.86, panelW, H * 0.14);
      ctx.strokeStyle = 'rgba(220,168,63,0.9)';
      ctx.lineWidth = Math.max(1.25, H * 0.0016);
      const inset = Math.max(5, H * 0.007);
      ctx.strokeRect(px + inset, inset, panelW - inset * 2, H - inset * 2);
      const caption = (photos[i] && photos[i].caption) || '';
      if (caption) {
        // Deferred: captions are drawn after the full-width scrims, which
        // would otherwise darken them to near-invisible.
        pendingCaptions.push({ caption, px, panelW, inset });
      }
    }
  }

  // Gold dividers between panels.
  if (count > 1) {
    ctx.fillStyle = GOLD;
    const dw = Math.max(2, Math.round(H * 0.0028));
    for (let i = 1; i < count; i++) {
      ctx.fillRect(i * panelW - dw / 2, 0, dw, H);
    }
  }

  // --- scrims ------------------------------------------------------------
  const topScrim = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  topScrim.addColorStop(0, 'rgba(2,4,16,0.88)');
  topScrim.addColorStop(1, 'rgba(2,4,16,0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, H * 0.22);

  const bottomScrim = ctx.createLinearGradient(0, H * 0.52, 0, H);
  bottomScrim.addColorStop(0, 'rgba(1,2,10,0)');
  bottomScrim.addColorStop(1, 'rgba(1,2,10,0.94)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, H * 0.52, W, H * 0.48);

  // Dark facts band between the facts bar's two gold rules.
  const factsTop = 0.952 * H;
  const factsBottom = 0.992 * H;
  ctx.fillStyle = 'rgba(1,2,10,0.55)';
  ctx.fillRect(0, factsTop, W, factsBottom - factsTop);

  // --- vignette + grain ---------------------------------------------------
  const vig = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.36, W / 2, H * 0.52, Math.max(W, H) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.60)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (state.grain !== false) {
    const tile = getGrainTile();
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  // Panel captions, on top of the scrims: a gold line at each panel's
  // bottom, in the row between the deck and the facts band.
  for (const { caption, px, panelW: pw, inset } of pendingCaptions) {
    const capFont = `${Math.round(0.02 * H)}px Archivo, sans-serif`;
    const { size: capSize, tracking } = fitSpaced(ctx, caption, capFont, pw - inset * 4, 0.32);
    ctx.font = `${capSize}px Archivo, sans-serif`;
    ctx.fillStyle = GOLD;
    ctx.textBaseline = 'alphabetic';
    drawSpaced(ctx, caption, px + pw / 2, 0.934 * H, tracking, 'center');
  }

  // In multi-panel layouts the whole bottom type block rides a little
  // higher, leaving the caption row its own clear space.
  const blockShift = count > 1 ? 0.035 * H : 0;

  // --- type ---------------------------------------------------------------
  ctx.textBaseline = 'alphabetic';

  // Masthead (left) and issue line (right), one shared baseline. Fit the
  // issue line first, then shrink the masthead into whatever width remains,
  // so the two never collide or clip at narrow (square/portrait) sizes.
  const mastBaseline = 0.085 * H;
  const issueFont = `${Math.round(0.028 * H)}px Archivo, sans-serif`;
  const issueFit = fitSpaced(ctx, text.issue, issueFont, W * 0.36, 0.30);
  ctx.font = `${issueFit.size}px Archivo, sans-serif`;
  const issueWidth = spacedWidth(ctx, text.issue, issueFit.tracking);

  const mastFont = `${Math.round(0.05 * H)}px Cinzel, serif`;
  const mastMax = Math.max(40, W - margin * 2 - issueWidth - W * 0.035);
  const mastFit = fitSpaced(ctx, text.masthead, mastFont, mastMax, 0.34);
  ctx.font = `${mastFit.size}px Cinzel, serif`;
  ctx.fillStyle = GOLD;
  drawSpaced(ctx, text.masthead, margin, mastBaseline, mastFit.tracking, 'left');

  ctx.font = `${issueFit.size}px Archivo, sans-serif`;
  ctx.fillStyle = '#ffffff';
  drawSpaced(ctx, text.issue, W - margin, mastBaseline, issueFit.tracking, 'right');

  // Full-width gold rule under the masthead.
  ctx.fillStyle = GOLD;
  ctx.fillRect(margin, 0.11 * H, W - margin * 2, Math.max(2, H * 0.002));

  // Title — the lead element, about 0.275H, auto-fit to 92% of the width.
  // Measure its real glyph ascent first: Anton's caps rise much higher
  // than the nominal em, and the kicker must clear them.
  const titleBaseline = 0.855 * H - blockShift;
  const titleFont = `${Math.round(0.275 * H)}px Anton, sans-serif`;
  const titleSize = fitPlain(ctx, text.title, titleFont, W * 0.92 - margin);
  ctx.font = `${titleSize}px Anton, sans-serif`;
  const titleMetrics = ctx.measureText(text.title);
  const titleAscent = titleMetrics.actualBoundingBoxAscent || titleSize * 0.72;

  // Kicker, just above the title's actual cap top.
  const kickerFont = `700 ${Math.round(0.032 * H)}px Archivo, sans-serif`;
  const kickFit = fitSpaced(ctx, text.kicker, kickerFont, W - margin * 2, 0.30);
  ctx.font = `700 ${kickFit.size}px Archivo, sans-serif`;
  ctx.fillStyle = CYAN;
  const kickerBaseline = titleBaseline - titleAscent - 0.022 * H;
  drawSpaced(ctx, text.kicker, margin, kickerBaseline, kickFit.tracking, 'left');

  ctx.font = `${titleSize}px Anton, sans-serif`;
  ctx.fillStyle = PAPER;
  ctx.fillText(text.title, margin, titleBaseline);

  // Deck — exactly two Playfair Italic lines.
  const lines = deckLines(text.deck);
  const deckFont = `italic ${Math.round(0.042 * H)}px PlayfairItalic, serif`;
  let deckSize = parseFloat(deckFont.match(/([\d.]+)px/)[1]);
  for (const line of lines) {
    deckSize = Math.min(deckSize, fitPlain(ctx, line, `italic ${deckSize}px PlayfairItalic, serif`, W - margin * 2));
  }
  ctx.font = `italic ${deckSize}px PlayfairItalic, serif`;
  ctx.fillStyle = '#ffffff';
  const deckLineH = deckSize * 1.14;
  lines.forEach((line, i) => {
    ctx.fillText(line, margin, 0.89 * H - blockShift + i * deckLineH);
  });

  // Facts bar — white Archivo between two gold rules, over the dark band.
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, factsTop, W, Math.max(1.5, H * 0.0018));
  ctx.fillRect(0, factsBottom, W, Math.max(1.5, H * 0.0018));
  const factsFont = `${Math.round(0.028 * H)}px Archivo, sans-serif`;
  const factsFit = fitSpaced(ctx, text.facts, factsFont, W - margin * 2, 0.26);
  ctx.font = `${factsFit.size}px Archivo, sans-serif`;
  ctx.fillStyle = '#ffffff';
  const factsMid = (factsTop + factsBottom) / 2;
  drawSpaced(ctx, text.facts, W / 2, factsMid + factsFit.size * 0.35, factsFit.tracking, 'center');

  ctx.restore();
}
