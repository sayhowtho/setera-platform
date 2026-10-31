// Builds the web logo variants in public/brand/ from the original white
// wordmark in design-reference/setera-logo-white-original.png.
//
//   node scripts/build-logo.mjs
//
// What it does:
// 1. Cleans the grey haze inside two deliberate gaps of the wordmark (R stem
//    ↔ middle bar, A left leg ↔ crossbar). Only gap rows are rewritten: each
//    stroke edge is redrawn with the same soft edge profile measured on the
//    clean rows just above/below, and the haze between them is cleared.
// 2. Zeroes near-invisible alpha (≤ 8) — the stray specks along the right edge.
// 3. Trims transparent padding to the glyph bounds (+2px so edges aren't clipped).
// 4. Writes white, white + teal E, ink, and ink + emerald E variants.
import sharp from 'sharp';

const SRC = 'design-reference/setera-logo-white-original.png';
const OUT = 'public/brand';
const TEAL = [0x2d, 0xd4, 0xbf]; // hero E accent (.heroWordmarkAccent)
const INK = [0x0b, 0x15, 0x12]; // light-section ink (palette A)
const EMERALD = [0x04, 0x78, 0x57]; // light-section accent (palette A)

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const a = (x, y) => data[(y * W + x) * 4 + 3];
const setA = (x, y, v) => { data[(y * W + x) * 4 + 3] = Math.round(Math.max(0, Math.min(255, v))); };

// Edge softness measured on the clean R-stem rows, as alpha fraction vs.
// distance (px) from the 50% crossing. Interpolated in between.
const PROFILE = [[-2.1, 1], [-1.1, 0.77], [-0.1, 0.525], [0.9, 0.314], [1.9, 0.137], [2.9, 0]];
function ramp(d) {
  if (d <= PROFILE[0][0]) return 1;
  for (let i = 1; i < PROFILE.length; i++) {
    const [d1, v1] = PROFILE[i];
    if (d <= d1) {
      const [d0, v0] = PROFILE[i - 1];
      return v0 + ((d - d0) / (d1 - d0)) * (v1 - v0);
    }
  }
  return 0;
}

// Sub-pixel x where alpha crosses 50% on row y, scanning in direction dir
// (+1 = rightwards out of a stroke on the left, -1 = leftwards out of a
// stroke on the right) starting from inside the stroke at xStart.
function crossing(y, xStart, dir) {
  for (let x = xStart; x !== xStart + dir * 80; x += dir) {
    const v0 = a(x, y);
    const v1 = a(x + dir, y);
    if (v0 >= 128 && v1 < 128) return x + dir * ((v0 - 128) / (v0 - v1));
  }
  throw new Error(`no edge on row ${y} from x=${xStart}`);
}

// Rebuild gap rows [y0, y1]. Left edge position is interpolated between
// clean rows just outside the gap; the right edge comes from rightEdge(y).
function rebuildGap({ rows: [ya, yb], xFrom, xTo, leftInside, rightEdge, barCoverageX }) {
  const la = crossing(ya - 1, leftInside(ya - 1), 1);
  const lb = crossing(yb + 1, leftInside(yb + 1), 1);
  for (let y = ya; y <= yb; y++) {
    const t = (y - (ya - 1)) / (yb + 1 - (ya - 1));
    const lc = la + t * (lb - la);
    const rc = rightEdge(y);
    const v = a(barCoverageX, y) / 255; // vertical coverage of the right-hand bar on this row
    for (let x = xFrom; x <= xTo; x++) {
      setA(x, y, 255 * Math.max(ramp(x - lc), ramp(rc - x) * v));
    }
  }
}

// R: vertical stem ↔ middle bar. The bar's left edge only exists on hazy
// rows, so it mirrors the stem edge at the measured bar position.
rebuildGap({ rows: [164, 204], xFrom: 1918, xTo: 1956, leftInside: () => 1915, rightEdge: () => 1952, barCoverageX: 1962 });
// A: left leg ↔ crossbar, parallel diagonals. The crossbar's edge is
// measured on the clean rows below the haze and extended up the same slope.
const SLOPE = -0.39;
const barRef = crossing(246, 2425, -1);
rebuildGap({
  rows: [217, 245],
  xFrom: 2378,
  xTo: 2422,
  leftInside: (y) => Math.round(2392 + (y - 212) * SLOPE),
  rightEdge: (y) => barRef + (y - 246) * SLOPE,
  barCoverageX: 2440,
});

// Pixels outside the two gap boxes are untouched. Now clear faint specks
// everywhere (the right-edge junk is all alpha ≤ 6).
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (a(x, y) <= 8) { setA(x, y, 0); continue; }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
const PAD = 2;
const crop = {
  left: Math.max(0, x0 - PAD),
  top: Math.max(0, y0 - PAD),
  width: Math.min(W, x1 + PAD + 1) - Math.max(0, x0 - PAD),
  height: Math.min(H, y1 + PAD + 1) - Math.max(0, y0 - PAD),
};

// The E is three floating bars between x=521 and x=758 (source coordinates).
const isE = (x) => x >= 515 && x <= 765;

async function write(name, base, eColor) {
  const out = Buffer.from(data);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const c = eColor && isE(x) ? eColor : base;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract(crop)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(`${OUT}/${name}`);
}

await write('setera-logo-white.png', [255, 255, 255]);
await write('setera-logo-white-teal-e.png', [255, 255, 255], TEAL);
await write('setera-logo-ink.png', INK);
await write('setera-logo-ink-emerald-e.png', INK, EMERALD);
console.log(`trimmed ${W}x${H} -> ${crop.width}x${crop.height}`);
