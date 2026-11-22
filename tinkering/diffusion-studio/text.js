// Sets the words on a canvas the size of the render, seen through the camera (cam: the render's affine onto the
// pane, in cm), as three channels:
//   red    the letters (filled, or outlined)
//   green  the letters' centre lines as tubes, for neon
//   blue   which letter each pixel belongs to (1 … 255), spread a little past each letter's edge
// Also returns the words' box (in uv, y up) and points inside the letters near their lower edges, where a
// fingertip's drips start.

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const titleCase = (s) => s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

export function setWords(S, W, H, family, cam, wantPoints) {
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const pxCm = cam.pxCm;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  let text = S['tx.text'] || '';
  if (S['tx.case'] === 'upper') text = text.toUpperCase();
  else if (S['tx.case'] === 'lower') text = text.toLowerCase();
  else if (S['tx.case'] === 'title') text = titleCase(text);
  const lines = text.split('\n');

  const size = S['tx.size'] * pxCm;
  const face = S['tx.face'];
  ctx.font = face ? `${size}px "${family}"` : `${S['tx.italic'] ? 'italic ' : ''}${S['tx.weight']} ${size}px "${family}", sans-serif`;
  try { ctx.fontStretch = face ? 'normal' : S['tx.stretch']; } catch (e) { /* older engines */ }
  ctx.fontKerning = S['tx.kern'] ? 'normal' : 'none';
  ctx.fontVariantCaps = S['tx.case'] === 'small-caps' || S['tx.case'] === 'all-small-caps' ? S['tx.case'] : 'normal';
  ctx.textRendering = S['tx.liga'] ? 'optimizeLegibility' : 'optimizeSpeed';
  ctx.letterSpacing = `${(S['tx.track'] / 1000) * size}px`;
  ctx.wordSpacing = `${S['tx.word'] * size}px`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // the block's measure: each line's width, and the font's own ascent and descent for vertical centring
  const widths = lines.map((l) => ctx.measureText(l).width);
  const m = ctx.measureText('Hxgy');
  const asc = m.fontBoundingBoxAscent ?? size * 0.8, desc = m.fontBoundingBoxDescent ?? size * 0.2;
  const lead = size * S['tx.lead'];
  const maxW = Math.max(1, ...widths);
  const blockH = lead * (lines.length - 1) + asc + desc;
  const top = -blockH / 2;
  const startX = (i) => S['tx.align'] === 'left' ? -maxW / 2 : S['tx.align'] === 'right' ? maxW / 2 - widths[i] : -widths[i] / 2;
  const baseY = (i) => top + asc + i * lead;

  // place: from pane cm (y up) to canvas px through the camera, then to the text's centre, turned, stretched,
  // slanted, mirrored, in px-sized units with y down
  const [a, b, c, d] = cam.toUv, [ox, oy] = cam.O;
  const base = [W * a, -H * b, W * c, -H * d, -W * (a * ox + c * oy), H * (1 + b * ox + d * oy)];   // cm → canvas
  const rot = (S['tx.rot'] * Math.PI) / 180, hs = S['tx.hscale'] / 100 * (S['tx.mirror'] ? -1 : 1), sk = Math.tan((-S['tx.skew'] * Math.PI) / 180);
  const place = () => {
    ctx.setTransform(...base); ctx.translate(S['tx.x'], S['tx.y']); ctx.rotate(rot); ctx.scale(1 / pxCm, -1 / pxCm);
    ctx.scale(hs, 1); ctx.transform(1, 0, sk, 1, 0, 0);
  };
  const toUvCm = (X, Y) => [a * (X - ox) + c * (Y - oy), b * (X - ox) + d * (Y - oy)];
  // a point in the text's own px units (y down) to uv
  const local = (x, y) => {
    const xs = (x + sk * y) * hs / pxCm, ys = -y / pxCm;
    return toUvCm(S['tx.x'] + xs * Math.cos(rot) - ys * Math.sin(rot), S['tx.y'] + xs * Math.sin(rot) + ys * Math.cos(rot));
  };

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  place();
  // red: the letters
  const outline = S['tx.outline'] * pxCm;
  lines.forEach((l, i) => {
    if (outline > 0) { ctx.strokeStyle = '#f00'; ctx.lineWidth = outline; ctx.strokeText(l, startX(i), baseY(i)); }
    else { ctx.fillStyle = '#f00'; ctx.fillText(l, startX(i), baseY(i)); }
  });
  // green: tubes along the letters' outlines, for neon
  ctx.strokeStyle = '#0f0'; ctx.lineWidth = Math.max(1, S['ne.tube'] * pxCm);
  lines.forEach((l, i) => ctx.strokeText(l, startX(i), baseY(i)));
  // blue: each letter's number, spread past its edge so the blur around it knows whose it is
  ctx.globalCompositeOperation = 'lighten';
  ctx.lineWidth = size * 0.14;
  let n = 0;
  lines.forEach((l, i) => {
    const chars = [...l];
    let prefix = '';
    for (const ch of chars) {
      const x = startX(i) + ctx.measureText(prefix).width;
      prefix += ch;
      if (!ch.trim()) continue;
      const id = (n % 254) + 1; n++;
      ctx.fillStyle = ctx.strokeStyle = `rgb(0,0,${id})`;
      ctx.fillText(ch, x, baseY(i));
      ctx.strokeText(ch, x, baseY(i));
    }
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // the box, its four corners carried through the same placement, then into uv (y up)
  const corners = [[-maxW / 2, top], [maxW / 2, top], [-maxW / 2, top + blockH], [maxW / 2, top + blockH]].map(([x, y]) => local(x, y));
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

  // drip starts: inside a letter, with nothing a little below
  const points = [];
  if (!wantPoints) return { canvas, bbox, points: null, centre: toUvCm(S['tx.x'], S['tx.y']) };
  const step = Math.max(2, Math.round(W / 320));
  const img = ctx.getImageData(0, 0, W, H).data;
  const below = Math.max(2, Math.round(pxCm * 0.6));
  for (let y = 0; y < H - below; y += step) {
    for (let x = 0; x < W; x += step) {
      if (img[(y * W + x) * 4] > 200 && img[((y + below) * W + x) * 4] < 40) points.push([x / W, 1 - y / H]);
    }
  }
  return { canvas, bbox, points, centre: toUvCm(S['tx.x'], S['tx.y']) };
}
