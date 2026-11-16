/**
 * Contour map generator.
 *
 * Draws the topographic field that sits behind every page: a set of nested,
 * organically deformed rings around two hills, plus a few open ridgelines.
 *
 * Everything is deterministic — the same seed always produces the same map,
 * so a rebuild does not shuffle the art.
 *
 * Output is plain SVG markup, inlined into the page so the drawing exists in
 * the HTML before any script runs and so CSS can recolour it per theme.
 */

const W = 1440;
const H = 900;

// --- tiny seeded PRNG (mulberry32) -------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Radius of a deformed ring at angle t.
 * A base circle plus a few integer harmonics: smooth, closed, never self
 * crossing as long as the amplitudes stay small.
 */
function radiusAt(t, base, harmonics) {
  let r = base;
  for (const h of harmonics) {
    r += base * h.amp * Math.sin(h.freq * t + h.phase);
  }
  return r;
}

/** Closed ring sampled at `steps` points, around (cx, cy). */
function ringPoints(cx, cy, base, harmonics, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radiusAt(t, base, harmonics);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.78]);
  }
  return pts;
}

/** Catmull-Rom through the points, emitted as cubic bezier segments. */
function toPath(pts, closed = true) {
  const n = pts.length;
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i % n];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r1(c1x)},${r1(c1y)} ${r1(c2x)},${r1(c2y)} ${r1(p2[0])},${r1(p2[1])}`;
  }
  if (closed) d += 'Z';
  return d;
}

export function buildContour(seed = 20261116) {
  const rand = rng(seed);
  const pick = (a, b) => a + rand() * (b - a);

  const hills = [
    { cx: 1120, cy: 250, base: 60, rings: 13, step: 46 },
    { cx: 250, cy: 720, base: 48, rings: 11, step: 52 }
  ];

  const out = [];

  for (const hill of hills) {
    // One shared set of harmonics keeps the rings nested instead of crossing.
    const harmonics = [
      { freq: 2, amp: pick(0.05, 0.10), phase: pick(0, 6.28) },
      { freq: 3, amp: pick(0.03, 0.07), phase: pick(0, 6.28) },
      { freq: 5, amp: pick(0.02, 0.04), phase: pick(0, 6.28) }
    ];
    for (let i = 0; i < hill.rings; i++) {
      const base = hill.base + i * hill.step;
      const steps = base > 380 ? 26 : base > 180 ? 22 : 18;
      const pts = ringPoints(hill.cx, hill.cy, base, harmonics, steps);
      const d = toPath(pts, true);
      // Outer rings fade out, inner rings stay present.
      const depth = 1 - i / hill.rings;
      const cls = i % 3 === 2 ? 'c-gold' : 'c-violet';
      const dash = i % 5 === 3 ? ' dash' : '';
      out.push(
        `<path class="${cls}${dash}" d="${d}" style="--d:${(depth * 0.9 + 0.1).toFixed(2)}"/>`
      );
    }
  }

  // A few open ridgelines sweeping across the field.
  for (let k = 0; k < 5; k++) {
    const y = 120 + k * 165 + pick(-30, 30);
    const pts = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const x = -60 + (i / steps) * (W + 120);
      const yy = y + Math.sin(i * 0.9 + k * 1.7) * pick(38, 74) + pick(-14, 14);
      pts.push([x, yy]);
    }
    out.push(
      `<path class="c-gold${k % 2 ? ' dash' : ''}" d="${toPath(pts, false)}" style="--d:0.4"/>`
    );
  }

  return out.join('\n      ');
}

export function contourSvg() {
  return `<svg class="contour" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      ${buildContour()}
    </svg>`;
}
