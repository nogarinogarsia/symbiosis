// Personality affects motion only. Genetically inherited proportions stay intact.
export const BEHAVIORS = [
  { speed: 1.7, chance: .82, rest: 1.4, bounce: .17, sway: .08, tail: .42 },
  { speed: .75, chance: .28, rest: 5, bounce: .04, sway: .02, tail: .08 },
  { speed: 1.15, chance: .6, rest: 2.6, bounce: .08, sway: .1, tail: .35 },
  { speed: .85, chance: .35, rest: 4, bounce: .04, sway: .025, tail: .14 },
  { speed: 1.25, chance: .75, rest: 2, bounce: .09, sway: .07, tail: .3 },
  { speed: .6, chance: .2, rest: 8, bounce: .025, sway: .02, tail: .06 },
  { speed: 1.5, chance: .85, rest: 1.8, bounce: .2, sway: .12, tail: .48 },
  { speed: 1.3, chance: .45, rest: 3, bounce: .06, sway: .035, tail: .22 },
];
export const behaviorOf = c => BEHAVIORS[c.personality] ?? { speed: .8, chance: .5, rest: 3, bounce: .1, sway: .06, tail: .2 };

export const ACTIVITY_NAMES = { idle: '주변을 둘러봐요', roam: '산책해요', explore: '새로운 곳을 살펴봐요', nap: '낮잠을 자요',
  groom: '앞발을 핥고 단장해요', hide: '조용한 구석에서 쉬어요', shelter: '포근한 쉼터에서 쉬어요', watch: '혼자 느긋하게 구경해요', rub: '친구와 얼굴을 비벼요',
  pounce: '친구 곁에서 장난쳐요', greet: '친구의 인사를 받아 줘요', alert: '주변 움직임에 귀를 기울여요', care: '집사와 함께 놀아요' };

export const clampTarget = (point, pen) => ({ x: Math.max(pen.minX, Math.min(pen.maxX, point.x)), z: Math.max(pen.minZ, Math.min(pen.maxZ, point.z)) });
export function socialTarget(position, friend, pen) {
  const dx = position.x - friend.x, dz = position.z - friend.z, d = Math.hypot(dx, dz);
  return clampTarget({ x: friend.x + (d > 1e-6 ? dx / d : 1) * .8, z: friend.z + (d > 1e-6 ? dz / d : 0) * .8 }, pen);
}
export const canReceiveGreeting = activity => ['idle', 'roam', 'explore', 'watch', 'groom'].includes(activity);

// Pure planner: social partners are supplied only from the same pen.
export function chooseActivity(personality, position, peers, pen, random = Math.random, shelters = []) {
  const behavior = behaviorOf({ personality });
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const target = (x, z) => ({ x: clamp(x, pen.minX, pen.maxX), z: clamp(z, pen.minZ, pen.maxZ) });
  const roam = () => target(pen.minX + random() * (pen.maxX - pen.minX), pen.minZ + random() * (pen.maxZ - pen.minZ));
  let nearest = null, distance = Infinity;
  for (const peer of peers) {
    const d = Math.hypot(peer.x - position.x, peer.z - position.z);
    if (d < distance) { nearest = peer; distance = d; }
  }
  const duration = behavior.rest * (1 + random());
  const shouldMove = random() < behavior.chance;
  if (personality === 1 && shelters.length) {
    const other = nearest ?? position;
    const quietest = [...shelters].sort((a,b) => Math.hypot(b.x-other.x,b.z-other.z)-Math.hypot(a.x-other.x,a.z-other.z))[0];
    return { kind: 'shelter', duration: 8 + random() * 8, target: target(quietest.x,quietest.z), shelterId: quietest.id };
  }
  if (personality === 5 && !shouldMove) return { kind: 'nap', duration: 9 + random() * 9 };
  if (personality === 7 && nearest && distance < 1.5) return { kind: 'alert', duration: 3 };
  if (!shouldMove) return { kind: personality === 3 ? 'watch' : personality === 1 ? 'hide' : 'groom', duration };
  if (personality === 1 || personality === 3) {
    const other = nearest ?? position;
    const corners = [target(pen.minX, pen.minZ), target(pen.maxX, pen.minZ), target(pen.minX, pen.maxZ), target(pen.maxX, pen.maxZ)];
    corners.sort((a, b) => Math.hypot(b.x - other.x, b.z - other.z) - Math.hypot(a.x - other.x, a.z - other.z));
    return { kind: personality === 1 ? 'hide' : 'watch', duration, target: corners[0] };
  }
  if ((personality === 2 || personality === 6) && nearest) {
    return { kind: personality === 2 ? 'rub' : 'pounce', duration: personality === 2 ? 4 : 2,
      target: socialTarget(position, nearest, pen), partnerId: nearest.id };
  }
  return { kind: personality === 4 ? 'explore' : 'roam', duration, target: roam() };
}
