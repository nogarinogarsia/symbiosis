// Barr-body patch layout is visual only and depends on the individual's seed.
import { RNG } from './rng.js';

export function patchMap(W, H, rng) {
  const K = 16, seeds = [];
  for (let i = 0; i < K; i++) seeds.push({ x: rng.range(0, W), y: rng.range(0, H), v: rng.chance(0.5) ? 1 : 0 });
  const m = new Uint8Array(W * H);
  const wob = rng.range(0, 100);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x + Math.sin(y * 0.15 + wob) * 6, py = y + Math.sin(x * 0.11 + wob) * 4;
    let best = 1e9, v = 0;
    for (const s of seeds) {
      let dx = Math.abs(px - s.x); if (dx > W / 2) dx = W - dx;
      const dy = py - s.y, d = dx * dx + dy * dy;
      if (d < best) { best = d; v = s.v; }
    }
    m[y * W + x] = v;
  }
  return m;
}
export function barrMask(part, seed, width = 64, height = 32) {
  return patchMap(width, height, new RNG(`${seed}:${part}`));
}
