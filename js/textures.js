// 부위별 털 텍스처를 캔버스로 절차 생성 (태비·흰반점·토티 패치·TYR 포인트·실버·판타지)
import { RNG, hashSeed } from './rng.js';
import { hexToRgb, mix, FANTASY_PALETTE } from './appearance.js';
import { patchMap } from './patches.js';
import { ResourcePool } from './resource-pool.js';

const SIZES = { body: [256, 128], head: [256, 128], legs: [128, 64], thigh: [128, 64], tail: [256, 64], ears: [32, 32] };
const cache = new ResourcePool(16, set => Object.values(set).forEach(texture => texture.dispose()));
export const texturePoolStats = () => cache.stats();
export const clearUnusedTextures = () => cache.trim(0);
export const releasePartTextures = set => cache.release(set);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function noise1(x, seed) { return Math.sin(x * 12.9898 + seed) * 43758.5453 % 1; }

/* 줄무늬 레이어 (알파만 사용) */
function stripeLayer(part, app, W, H, rng) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
  const classic = app.tabbyType === 'classic';
  // 가는 줄무늬: 등(위)에서 시작해 아래로 갈수록 가늘어지며 끝나는 모양
  const taper = (x0, y0, len, w0, bend) => {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      g.lineWidth = Math.max(1.2, w0 * (1 - t0 * 0.85));
      g.beginPath();
      g.moveTo(x0 + bend * t0 * t0 * 12, y0 + len * t0);
      g.lineTo(x0 + bend * t1 * t1 * 12, y0 + len * t1);
      g.stroke();
    }
  };
  if (part === 'body') {
    // 몸통 구형의 극을 앞뒤(z)축에 맞춰 두었으므로: 등(척추)은 u=0.75(x=0.75W), 옆구리는 x=0.5W·W, 배는 x=0.25W.
    // 줄무늬 = 등의 척추선에서 양쪽 옆구리로 내려오다 배 전에 끝나는 가로줄, 몸 길이(y)를 따라 균일 간격
    const spine = 0.75 * W;
    g.lineWidth = 6; g.beginPath(); g.moveTo(spine, 0); g.lineTo(spine, H); g.stroke();
    if (!classic) {
      const N = 11;
      for (let i = 0; i < N; i++) {
        const y = H * (0.2 + 0.73 * (i + 0.5) / N) + rng.range(-1.5, 1.5);
        const len = W * rng.range(0.17, 0.22);
        for (const dir of [-1, 1]) {
          const n = 6;
          for (let k = 0; k < n; k++) {
            g.lineWidth = Math.max(1.5, 6 * (1 - k / n * 0.8));
            g.beginPath();
            g.moveTo(spine + dir * len * (k / n), y + Math.sin(k * 0.9 + i) * 0.8);
            g.lineTo(spine + dir * len * ((k + 1) / n), y + Math.sin((k + 1) * 0.9 + i) * 0.8);
            g.stroke();
          }
        }
      }
    } else {
      // 클래식태비: 옆구리의 소용돌이(불스아이) + 굵은 척추선 + 등에서 내려오는 굵은 줄
      for (const cx of [0.5 * W, 0.0, W]) {
        g.lineWidth = 6;
        for (let r = 0; r < 2; r++) { g.beginPath(); g.ellipse(cx, H * 0.5, 13 + r * 17, 9 + r * 12, 0, 0, Math.PI * 2); g.stroke(); }
        g.beginPath(); g.arc(cx, H * 0.5, 2.5, 0, Math.PI * 2); g.stroke();
      }
      g.lineWidth = 10; g.beginPath(); g.moveTo(spine, 0); g.lineTo(spine, H); g.stroke();
      for (const y of [0.12, 0.26, 0.74, 0.88]) for (const dir of [-1, 1]) {
        g.lineWidth = 6; g.beginPath(); g.moveTo(spine, H * y); g.lineTo(spine + dir * W * 0.2, H * y); g.stroke();
      }
    }
    // 어깨선: 목 뒤에서 옆구리 아래로 비스듬히 내려오는 선 앞쪽(가슴·어깨)에는 줄무늬를 그리지 않음
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x <= W; x += 8) { const dx = x < 0.25 * W ? 0.25 * W + x : Math.abs(x - 0.75 * W); g.lineTo(x, H * (0.17 + 0.33 * dx / (0.5 * W))); }
    g.lineTo(W, 0); g.closePath(); g.fill(); g.globalCompositeOperation = 'source-over';
  } else if (part === 'head') {
    const fx = W * 0.25;
    g.lineWidth = 6;
    // 이마 M
    g.beginPath(); g.moveTo(fx - 22, H * 0.38); g.lineTo(fx - 22, H * 0.2); g.lineTo(fx - 8, H * 0.32); g.lineTo(fx, H * 0.18);
    g.lineTo(fx + 8, H * 0.32); g.lineTo(fx + 22, H * 0.2); g.lineTo(fx + 22, H * 0.38); g.stroke();
    // 정수리 줄
    g.lineWidth = 7;
    for (const dx of [-8, 0, 8]) { g.beginPath(); g.moveTo(fx + dx, H * 0.15); g.lineTo(fx + dx * 1.2, 0); g.stroke(); }
    // 볼 줄
    g.lineWidth = 5;
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      g.beginPath(); g.moveTo(fx + s * 36, H * (0.55 + k * 0.08)); g.quadraticCurveTo(fx + s * 54, H * (0.58 + k * 0.1), fx + s * 74, H * (0.55 + k * 0.1)); g.stroke();
    }
  } else if (part === 'legs' || part === 'thigh') {
    g.lineWidth = 5;
    for (let k = 0; k < 3; k++) { const y = H * (0.14 + k * 0.22); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  } else if (part === 'tail') {
    g.lineWidth = 7;
    for (let k = 1; k < 8; k++) { const x = W * (k / 8); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  }
  return g.getImageData(0, 0, W, H).data;
}

/* 흰 반점 레이어 */
function whiteLayer(part, app, W, H, rng) {
  const lv = app.white === 'none' ? 0 : app.white === 'bicolor' ? 1 : 2;
  const c = canvas(W, H), g = c.getContext('2d');
  if (lv === 0 || part === 'ears' || (part === 'thigh' && lv === 1)) return null;
  g.fillStyle = '#000';
  const blob = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, rng.range(-0.4, 0.4), 0, Math.PI * 2); g.fill(); };
  if (part === 'body') {
    if (lv === 1) {
      g.fillRect(W * 0.07, 0, W * 0.36, H);                // 배(x=0.25W 주변)
      blob(W * 0.25, H * 0.08, W * 0.16, H * 0.14);        // 가슴
      for (let i = 0; i < rng.int(3); i++) blob(rng.range(0.6 * W, 0.95 * W), rng.range(H * 0.15, H * 0.85), W * 0.05, H * 0.1);
    } else {
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 2 + rng.int(3); i++) blob(0.75 * W + rng.range(-0.1, 0.1) * W, rng.range(H * 0.1, H * 0.9), W * rng.range(0.05, 0.1), H * rng.range(0.1, 0.2));
    }
  } else if (part === 'head') {
    if (lv === 1) { blob(W * 0.25, H * 0.72, W * 0.1, H * 0.2); if (rng.chance(0.5)) { g.fillRect(W * 0.25 - 5, H * 0.1, 10, H * 0.5); } }
    else {
      g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-out';
      blob(W * 0.07, H * 0.2, W * 0.1, H * 0.18); blob(W * 0.43, H * 0.2, W * 0.1, H * 0.18); blob(W * 0.75, H * 0.15, W * 0.2, H * 0.3);
      if (rng.chance(0.5)) blob(W * 0.19, H * 0.5, W * 0.05, H * 0.1);
    }
  } else if (part === 'legs' || part === 'thigh') {
    if (lv === 1) g.fillRect(0, H * 0.55, W, H * 0.45); else g.fillRect(0, 0, W, H);
  } else if (part === 'tail') {
    if (lv === 1) g.fillRect(W * 0.8, 0, W * 0.2, H); else { g.fillRect(W * 0.25, 0, W * 0.75, H); }
  }
  return g.getImageData(0, 0, W, H).data;
}

function speckleLayer(W, H, rng, n, rmax) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000';
  for (let i = 0; i < n; i++) { g.beginPath(); g.arc(rng.range(0, W), rng.range(0, H), rng.range(0.6, rmax), 0, Math.PI * 2); g.fill(); }
  return g.getImageData(0, 0, W, H).data;
}

const rgbCache = new Map();
function rgb(hex) { let v = rgbCache.get(hex); if (!v) { v = hexToRgb(hex); rgbCache.set(hex, v); } return v; }

function pointMask(part, x, y, W, H, tyr) {
  // 1 = 포인트(말단) 색, 0 = 몸통 색
  if (tyr === 'full') return 1;
  if (part === 'legs' || part === 'tail' || part === 'ears') return 1;
  if (part === 'head') {
    const dx = (x - W * 0.25) / (W * 0.16), dy = (y - H * 0.62) / (H * 0.32);
    const d = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, Math.min(1, 1.4 - d));
  }
  return 0; // body
}

export function makePartCanvas(part, app, seed) {
  const [W, H] = SIZES[part];
  const rng = new RNG(seed + ':' + part);
  const out = canvas(W, H), og = out.getContext('2d');
  const img = og.createImageData(W, H), d = img.data;

  if (app.fantasy) {
    const pal = FANTASY_PALETTE[app.fantasy].map(rgb);
    const star = speckleLayer(W, H, rng, part === 'ears' ? 4 : 160, 1.8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = ((x / W) * 2 + (y / H) * 0.6 + rng.next() * 0.0) % 1;
      const f = t * 3, i = Math.floor(f) % 3, j = (i + 1) % 3, k = f - Math.floor(f);
      const p = (y * W + x) * 4;
      let r = pal[i][0] + (pal[j][0] - pal[i][0]) * k, gg = pal[i][1] + (pal[j][1] - pal[i][1]) * k, b = pal[i][2] + (pal[j][2] - pal[i][2]) * k;
      const sp = star[p + 3] / 255;
      r += (255 - r) * sp * 0.9; gg += (255 - gg) * sp * 0.9; b += (255 - b) * sp * 0.9;
      d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    return out;
  }

  const tort = app.tortie && part !== 'ears' ? patchMap(W, H, rng) : null;
  const stripes = app.tabby && part !== 'ears' ? stripeLayer(part, app, W, H, rng) : null;
  const white = whiteLayer(part, app, W, H, rng);
  const tick = null; // 실버의 점박이 표현 제거 (밝은 색조로만 표현)
  const skin = rgb('#eec0b0');

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4, idx = y * W + x;
    const ci = tort ? tort[idx] : 0;             // 0=어두운색, 1=오렌지(토티일 때)
    const bi = app.tortie ? (ci === 0 ? 0 : 1) : 0;
    const pm = pointMask(part, x, y, W, H, app.tyr);
    const bc = rgb(app.bodyColors[bi]), pc = rgb(app.pointColors[bi]);
    let r = bc[0] + (pc[0] - bc[0]) * pm, g = bc[1] + (pc[1] - bc[1]) * pm, b = bc[2] + (pc[2] - bc[2]) * pm;
    // 줄무늬: 오렌지 패치는 항상, 어두운 패치는 A_ 일 때만
    if (stripes) {
      const sa = stripes[p + 3] / 255;
      const allowed = app.tortie ? (bi === 1 || app.tabbyDark) : true;
      if (sa > 0 && allowed) {
        const dark = r + g + b < 260;
        const lr = dark ? 0.16 : 0, ground = 1;
        void ground;
        const sr = dark ? Math.min(255, r + 20) : r * 0.74, sg = dark ? Math.min(255, g + 20) : g * 0.74, sb = dark ? Math.min(255, b + 22) : b * 0.72;
        void lr;
        // 검은 털은 줄무늬가 은은하게 보이도록 밝게, 나머지는 어둡게
        r += (sr - r) * sa * 0.9; g += (sg - g) * sa * 0.9; b += (sb - b) * sa * 0.9;
      }
    }
    if (tick) {
      const ta = tick[p + 3] / 255;
      if (ta > 0 && y < H * 0.7) { r *= 1 - 0.28 * ta; g *= 1 - 0.28 * ta; b *= 1 - 0.28 * ta; }
    }
    if (white) {
      const wa = white[p + 3] / 255;
      if (wa > 0) { r += (252 - r) * wa; g += (250 - g) * wa; b += (246 - b) * wa; }
    }
    if (app.hairless) {
      r = r * 0.4 + skin[0] * 0.6; g = g * 0.4 + skin[1] * 0.6; b = b * 0.4 + skin[2] * 0.6;
    }
    d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  if (app.hairless && part !== 'ears') { // 주름
    og.strokeStyle = 'rgba(160,100,95,0.35)'; og.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const y = rng.range(0, H); og.beginPath(); og.moveTo(0, y); for (let x = 0; x <= W; x += 16) og.lineTo(x, y + Math.sin(x * 0.1 + i) * 4); og.stroke(); }
  }
  return out;
}

export function partTextures(THREE, cat, app) {
  const key = cat.seed + '|' + app.renderSig;
  return cache.acquire(key, () => {
    const set = {};
    try {
      for (const part of Object.keys(SIZES)) {
        const tex = new THREE.CanvasTexture(makePartCanvas(part, app, cat.seed));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
        set[part] = tex;
      }
      return set;
    } catch (error) { Object.values(set).forEach(texture => texture.dispose()); throw error; }
  });
}

/* 눈 텍스처: 성격별 눈 모양 8종 + 갓 태어난(성격 미정) 기본형 */
const eyeCache = new Map();
export function eyeTexture(THREE, personality, color, mirror) {
  const key = `${personality}|${color}|${mirror ? 1 : 0}`;
  if (eyeCache.has(key)) return eyeCache.get(key);
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  if (mirror) g.scale(-1, 1);
  const INK = '#2f2222';
  const iris = (rx, ry, pr, pry, ox = 0, oy = 0) => {
    const gr = g.createLinearGradient(0, -ry, 0, ry);
    gr.addColorStop(0, mix(color, '#ffffff', 0.25)); gr.addColorStop(1, mix(color, '#000000', 0.2));
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK; g.beginPath(); g.ellipse(ox, oy, pr, pry ?? pr, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  };
  const hl = (x, y, r) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const stroke = (w) => { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; };
  switch (personality) {
    case 0: iris(48, 48, 22); hl(-15, -17, 11); hl(15, 14, 5); break;                       // 활발함: 크고 동그란 눈
    case 1: iris(50, 50, 13); hl(-16, -16, 7); hl(10, 14, 4); hl(18, -6, 3);                // 소심함: 작은 동공, 불안한 눈썹
      stroke(6); g.beginPath(); g.moveTo(-48, -52); g.quadraticCurveTo(0, -64, 44, -40); g.stroke(); break;
    case 2: iris(50, 52, 26); hl(-16, -16, 12); hl(16, 16, 6);                              // 애교쟁이: 반짝이는 큰 눈
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(18, -22); g.lineTo(22, -12); g.lineTo(32, -10); g.lineTo(23, -4); g.lineTo(26, 6); g.lineTo(18, -1); g.lineTo(10, 6); g.lineTo(13, -4); g.lineTo(4, -10); g.lineTo(14, -12); g.closePath(); g.fill(); break;
    case 3: g.save(); g.beginPath(); g.rect(-60, -8, 120, 80); g.clip(); iris(46, 46, 11, 24); hl(-14, 2, 6); g.restore();   // 도도함: 반쯤 감긴 눈
      stroke(9); g.beginPath(); g.moveTo(-50, -8); g.lineTo(50, -12); g.stroke(); break;
    case 4: iris(40, 54, 26); hl(-12, -20, 12); hl(12, 18, 6); break;                       // 호기심쟁이: 세로로 큰 눈
    case 5: stroke(10); g.beginPath(); g.arc(0, -8, 38, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); break; // 느긋함: 감은 눈
    case 6: g.save(); g.beginPath(); g.moveTo(-60, -60); g.lineTo(60, -60); g.lineTo(60, -6); g.lineTo(-60, -22); g.closePath();
      g.clip(); g.restore(); g.save(); g.beginPath(); g.rect(-60, -14, 120, 90); g.clip(); iris(46, 46, 18, 18, 14, 8); hl(-6, -2, 6); g.restore();
      stroke(9); g.beginPath(); g.moveTo(-50, -26); g.lineTo(50, -10); g.stroke();       // 장난꾸러기: 짓궂게 흘겨보는 눈
      stroke(6); g.beginPath(); g.moveTo(-40, -52); g.lineTo(34, -64); g.stroke(); break;
    case 7: g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 54, 54, 0, 0, Math.PI * 2); g.fill();  // 예민함: 흰자가 보이는 눈, 가는 동공
      iris(40, 44, 6, 32); hl(-12, -14, 5); stroke(6); g.beginPath(); g.ellipse(0, 0, 54, 54, 0, 0, Math.PI * 2); g.stroke(); break;
    default: g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill(); break;                              // 갓 태어남
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  eyeCache.set(key, tex);
  return tex;
}

export function hashStr(s) { return hashSeed(s); }
void noise1;

/* 장모 솜털 셸용 알파맵: 값이 임계치보다 클 때만 그려짐 → 바깥 셸일수록 듬성듬성한 솜털 가장자리 */
const furCache = new Map();
export function furAlpha(THREE, key, faceMask) {
  if (furCache.has(key)) return furCache.get(key);
  const lo = canvas(64, 32), lg = lo.getContext('2d'), li = lg.createImageData(64, 32), r = new RNG('fur' + key);
  for (let i = 0; i < 64 * 32; i++) { const v = Math.floor(r.next() * 255); li.data[i * 4] = li.data[i * 4 + 1] = li.data[i * 4 + 2] = v; li.data[i * 4 + 3] = 255; }
  lg.putImageData(li, 0, 0);
  const c = canvas(512, 256), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.drawImage(lo, 0, 0, 512, 256);
  if (faceMask) { g.fillStyle = '#000'; g.beginPath(); g.ellipse(128, 140, 70, 80, 0, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  furCache.set(key, t);
  return t;
}
