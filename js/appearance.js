// 표현형 → 렌더 파라미터 (three.js와 무관한 순수 함수: 도감 중복 검사에도 사용)
import { hashSeed } from './rng.js';
import { COLOR_KO } from './engine.js';

export const BASE_HEX = {
  black: '#292c30', blue: '#858f9e', chocolate: '#865640', lilac: '#ae97aa',
  cinnamon: '#bf8060', fawn: '#d4b8a1', orange: '#e39b51', cream: '#edd0a0',
};

export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
// 농도 5단계: 양수=흰색 쪽, 음수=검정 쪽
const DENSITY_SHIFT = [0.30, 0.15, 0, -0.08, -0.16];

function adjust(hex, density, silver) {
  const s = DENSITY_SHIFT[density];
  let c = s >= 0 ? mix(hex, '#ffffff', s) : mix(hex, '#000000', -s);
  if (silver) c = mix(c, '#ffffff', 0.38);
  return c;
}

function tyrColors(c, tyr) {
  switch (tyr) {
    case 'point': return { body: mix(c, '#f1e6d3', 0.82), points: mix(c, '#000000', 0.1) };
    case 'sepia': { const b = mix(c, '#7a5a44', 0.35); return { body: b, points: mix(b, '#000000', 0.12) }; }
    case 'mink': return { body: mix(c, '#d9c3a8', 0.5), points: mix(c, '#000000', 0.05) };
    default: return { body: c, points: c };
  }
}

const EYES = ['#e0a030', '#8fc060', '#c97a35', '#d9b43c'];
export const FANTASY_PALETTE = {
  mint: ['#6dffc2', '#b9ffe3', '#3fd9a0'],
  galaxy: ['#2b1b5e', '#7d4fd6', '#d6a8ff'],
  holo: ['#ff9ad5', '#9ae7ff', '#fff29a'],
  aurora: ['#4aa8ff', '#5dffb0', '#b27cff'],
};

export function resolveAppearance(cat) {
  const ph = cat.ph;
  const mains = ph.colors.map((c) => adjust(BASE_HEX[c], ph.density, ph.silver));
  const tyrs = mains.map((c) => tyrColors(c, ph.tyr));
  const h = hashSeed(cat.seed || 'x');
  let eye;
  if (ph.tyr === 'point') eye = '#6aa8e8';
  else if (ph.tyr === 'mink') eye = '#6fc7c4';
  else if (ph.white === 'high' && h % 5 === 0) eye = '#6aa8e8';
  else eye = EYES[h % EYES.length];
  const app = {
    bodyColors: tyrs.map((t) => t.body),     // [어두운색, (오렌지색)]
    pointColors: tyrs.map((t) => t.points),
    tortie: ph.tortie,
    tabby: ph.pattern !== 'solid',
    tabbyDark: ph.darkTabby || ph.orangeKind === 'orange',  // 어두운 쪽에 줄무늬가 보이는가
    tabbyType: ph.tabbyType,
    white: ph.white,
    tyr: ph.tyr,
    long: ph.long,
    silver: ph.silver,
    eye,
    special: cat.special || null,
    fantasy: cat.fantasy || null,
    hairless: cat.special === 'sphynx',
  };
  // 시각 서명: 최종 색을 4bit/채널로 양자화 → 육안으로 구분 가능한 렌더 기준
  const q = (hex) => hexToRgb(hex).map((v) => v >> 4).join('.');
  app.renderSig = [
    app.bodyColors.map(q).join('/'), app.pointColors.map(q).join('/'),
    app.tabby ? app.tabbyType : 'solid', app.tabbyDark, app.tortie, app.white, app.long, app.silver,
    app.special, app.fantasy,
  ].join('|');
  return app;
}
void COLOR_KO;
