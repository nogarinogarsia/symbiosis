// 계단식 지형: 배치 파일의 terrain.lines(가로 경계선)마다 위쪽(-z)과 아래쪽(+z) 높이가 다름.
// 경계는 돌 축대 아래에서 절벽처럼 짧게, 계단(stairs) 자리에서는 걸을 수 있는 비탈로 이어짐.
// terrain 예: { lines: [ { z: -6.4 (또는 pts: [[x,z],...]), above: 1.73, below: 0.86, stairs: [{ x: 2, w: 3.4 }], ramp: 1.6 }, ... ] }
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = t => t * t * (3 - 2 * t);

export function makeTerrain(terrain) {
  // pts가 있으면 꺾인 경계선 [[x,z],...] (x 오름차순). 없으면 z 한 줄
  const zOf = L => {
    if (!L.pts?.length) return () => L.z;
    const P = L.pts.slice().sort((a, b) => a[0] - b[0]);
    return x => {
      if (x <= P[0][0]) return P[0][1];
      for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const t = (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; }
      return P[P.length - 1][1];
    };
  };
  const lines = (terrain?.lines ?? []).map(L => ({ ...L, zAt: zOf(L), zMid: L.pts?.length ? L.pts.reduce((a, q) => a + q[1], 0) / L.pts.length : L.z }))
    .sort((a, b) => a.zMid - b.zMid);
  if (!lines.length) return { height: () => 0, enabled: false };
  const CLIFF = 0.28, RAMP = 1.05, EDGE = 0.35;   // 절벽 반폭, 계단 비탈 반폭, 계단 옆 이어짐 폭
  function height(x, z) {
    let h = lines[0].above;
    for (const L of lines) {
      const d = z - L.zAt(x);
      const ramp = L.ramp ?? RAMP;   // 계단 비탈 반폭 (경계선마다 다르게 가능)
      const tCliff = clamp01((d + CLIFF) / (2 * CLIFF));
      let tStair = tCliff, w = 0;
      for (const s of L.stairs ?? []) {
        const inside = clamp01((s.w / 2 + EDGE - Math.abs(x - s.x)) / EDGE);
        if (inside > w) { w = inside; tStair = clamp01((d + ramp) / (2 * ramp)); }
      }
      const t = tCliff + (tStair - tCliff) * w;
      h += (L.below - L.above) * smooth(t);
    }
    return h;
  }
  return { height, enabled: true };
}
