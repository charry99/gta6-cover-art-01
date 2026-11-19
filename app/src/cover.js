// Cinematic Intelligence cover renderer.
// One draw path powers the live preview, the PNG export and shot mode,
// so what you see in the editor is exactly what you download.

export const DEFAULTS = {
  masthead: 'CINEMATIC INTELLIGENCE',
  issue: 'LAUNCH DAY ISSUE · 19 · 11 · 2026',
  kicker: 'GRAND THEFT AUTO VI · ROCKSTAR GAMES',
  title: 'VICE CITY',
  deck: 'Thirteen years after GTA V, Jason Duval and Lucia Caminos take Leonida. The wait is over.',
  facts: 'OUT NOW · PLAYSTATION 5 · XBOX SERIES X|S · LEONIDA · 8 GAME AWARDS NOMINATIONS',
  layout: 'editorial',
  grade: 55,
  neon: true,
  grain: true,
};

export const LAYOUT_PANELS = { editorial: 1, diptych: 2, triptych: 3 };

const GOLD = '#d9a441';
const GOLD_SOFT = 'rgba(217,164,65,0.9)';
const CYAN = '#37d5e8';
const CREAM = '#f5efe2';
const INK = '#05070f';

// Draw text with an explicit per-character advance (canvas has no
// letter-spacing for fillText in every engine, so we walk the string).
export function drawSpaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prevAlign;
  return total;
}

export function spacedWidth(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
}

// Shrink font size until the spaced text fits maxWidth. Returns used size.
function fitSpaced(ctx, text, baseSize, spacingRatio, maxWidth, fontFn) {
  let size = baseSize;
  while (size > 8) {
    ctx.font = fontFn(size);
    if (spacedWidth(ctx, text, size * spacingRatio) <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width <= maxWidth || !line) line = trial;
    else { lines.push(line); line = word; if (lines.length === maxLines) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    // Ellipsize the tail of the last line if words were dropped.
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + '…';
    }
  }
  return lines;
}

// Deterministic grain so shot mode renders identically on every load.
function grainCanvas(w, h, alpha) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w / 3)); c.height = Math.max(2, Math.round(h / 3));
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawPanel(ctx, photo, px, py, pw, ph, state) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  ctx.fillStyle = INK; ctx.fillRect(px, py, pw, ph);
  if (photo && photo.img) {
    const img = photo.img;
    const zoom = photo.zoom || 1;
    const base = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
    const dw = img.naturalWidth * base * zoom, dh = img.naturalHeight * base * zoom;
    const cx = px + pw / 2 + (photo.x || 0) * pw - dw / 2;
    const cy = py + ph / 2 + (photo.y || 0) * ph - dh / 2;
    const g = state.grade / 100; // 0..1
    ctx.filter = `contrast(${1 + 0.28 * g}) saturate(${1 + 0.45 * g}) brightness(${1 - 0.06 * g})`;
    ctx.drawImage(img, cx, cy, dw, dh);
    ctx.filter = 'none';
    if (state.neon) {
      // Soft neon bloom: a blurred, screened copy lifts cyan/pink highlights.
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.16 + 0.14 * g;
      ctx.filter = 'blur(18px) saturate(1.8)';
      ctx.drawImage(img, cx, cy, dw, dh);
      ctx.filter = 'none';
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // Midnight-blue shadow tint, stronger low in the frame.
    const tint = ctx.createLinearGradient(0, py, 0, py + ph);
    tint.addColorStop(0, 'rgba(16,24,64,0.20)');
    tint.addColorStop(0.55, 'rgba(10,14,40,0.05)');
    tint.addColorStop(1, 'rgba(6,8,28,0.42)');
    ctx.fillStyle = tint; ctx.fillRect(px, py, pw, ph);
  }
  ctx.restore();
}

export function drawCover(ctx, w, h, state) {
  const s = w / 1280; // design scale, tuned at 1280 wide
  const margin = 52 * s;
  ctx.save();
  ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);

  // --- photo panels ---
  const panels = LAYOUT_PANELS[state.layout] || 1;
  const gap = panels > 1 ? 5 * s : 0;
  const pw = (w - gap * (panels - 1)) / panels;
  for (let i = 0; i < panels; i++) {
    drawPanel(ctx, state.photos[i] || state.photos[0], i * (pw + gap), 0, pw, h, state);
    if (i > 0) { ctx.fillStyle = GOLD_SOFT; ctx.fillRect(i * (pw + gap) - gap, 0, gap, h); }
  }

  // --- vignette + legibility gradients ---
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,3,10,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.2);
  top.addColorStop(0, 'rgba(3,4,12,0.62)'); top.addColorStop(1, 'rgba(3,4,12,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, w, h * 0.2);
  const bot = ctx.createLinearGradient(0, h * 0.52, 0, h);
  bot.addColorStop(0, 'rgba(3,4,12,0)'); bot.addColorStop(1, 'rgba(3,4,12,0.78)');
  ctx.fillStyle = bot; ctx.fillRect(0, h * 0.52, w, h * 0.48);

  if (state.grain) {
    ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(grainCanvas(w, h, 255), 0, 0, w, h);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  ctx.textBaseline = 'alphabetic';

  // --- masthead block (shrinks on narrow canvases so masthead and
  // issue line never collide, e.g. square triptych covers) ---
  let mastSize = 30 * s;
  let issueSize = 17 * s;
  const mastW = () => { ctx.font = `600 ${mastSize}px Cinzel, serif`; return spacedWidth(ctx, state.masthead, mastSize * 0.24); };
  const issueW = () => { ctx.font = `600 ${issueSize}px Archivo, sans-serif`; return spacedWidth(ctx, state.issue, issueSize * 0.18); };
  while (mastSize > 11 && mastW() + issueW() + 36 * s > w - margin * 2) { mastSize -= 1; issueSize *= 0.97; }
  ctx.fillStyle = GOLD;
  ctx.font = `600 ${mastSize}px Cinzel, serif`;
  drawSpaced(ctx, state.masthead, margin, 62 * s, mastSize * 0.24);
  ctx.font = `600 ${issueSize}px Archivo, sans-serif`;
  ctx.fillStyle = CREAM;
  drawSpaced(ctx, state.issue, w - margin, 60 * s, issueSize * 0.18, 'right');
  ctx.fillStyle = GOLD;
  ctx.fillRect(margin, 80 * s, w - margin * 2, Math.max(1.4, 1.6 * s));

  // --- bottom editorial block ---
  const factsBaseline = h - 26 * s;
  const factsRuleY = factsBaseline - 24 * s;
  const deckSize = 30 * s;
  ctx.font = `italic 500 ${deckSize}px "Playfair Italic", serif`;
  const deckLines = wrapLines(ctx, state.deck, w * 0.56, 2);
  const deckLineH = deckSize * 1.22;
  const deckTop = factsRuleY - 16 * s - deckLineH * deckLines.length;

  // Title: fit Anton to the text column width.
  const titleMax = w - margin * 2;
  let titleSize = 168 * s;
  ctx.font = `${titleSize}px Anton, sans-serif`;
  while (titleSize > 20 && spacedWidth(ctx, state.title, titleSize * 0.015) > titleMax) {
    titleSize -= 2; ctx.font = `${titleSize}px Anton, sans-serif`;
  }
  const titleBaseline = deckTop - 14 * s;
  ctx.fillStyle = CREAM;
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18 * s; ctx.shadowOffsetY = 3 * s;
  drawSpaced(ctx, state.title, margin, titleBaseline, titleSize * 0.015);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  const kickerSize = 19 * s;
  ctx.font = `700 ${kickerSize}px Archivo, sans-serif`;
  ctx.fillStyle = CYAN;
  drawSpaced(ctx, state.kicker, margin, titleBaseline - titleSize * 0.92, kickerSize * 0.22);

  ctx.font = `italic 500 ${deckSize}px "Playfair Italic", serif`;
  ctx.fillStyle = 'rgba(245,239,226,0.96)';
  deckLines.forEach((line, i) => ctx.fillText(line, margin, deckTop + deckLineH * (i + 1) - deckSize * 0.22));

  // --- facts bar between gold rules ---
  ctx.fillStyle = GOLD;
  ctx.fillRect(margin, factsRuleY, w - margin * 2, Math.max(1.2, 1.4 * s));
  ctx.fillRect(margin, factsBaseline + 12 * s, w - margin * 2, Math.max(1.2, 1.4 * s));
  const factsSize = fitSpaced(ctx, state.facts, 16.5 * s, 0.16, w - margin * 2,
    (z) => `600 ${z}px Archivo, sans-serif`);
  ctx.fillStyle = CREAM;
  drawSpaced(ctx, state.facts, margin, factsBaseline, factsSize * 0.16);

  ctx.restore();
}
