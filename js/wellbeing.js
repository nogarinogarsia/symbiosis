// Comfort is separate from personality and never changes genes or breeding odds.
export const DAILY_CARE = [
  { id: 'feed', name: '밥 채워 주기', icon: '🐟', key: 'food', hours: 8 },
  { id: 'yarn', name: '털실 놀이', icon: '🧶', key: 'play', hours: 6 },
  { id: 'pet', name: '쓰다듬기', icon: '💗', key: 'affection', hours: 6 },
  { id: 'clean', name: '화장실 치우기', icon: '🧹', key: 'clean', hours: 12 },
];
export function comfort(cat, now) {
  return DAILY_CARE.map(a => {
    const last = cat.wellbeing?.[a.key] ?? cat.birthTime;
    return { ...a, value: Math.round(Math.max(0, Math.min(1, 1 - (now - last) / (a.hours * 3600e3))) * 100) };
  });
}
export function dailyCare(cat, action, now) {
  const a = DAILY_CARE.find(a => a.id === action);
  if (!cat || !a) return { ok: false, msg: '돌봄 대상을 확인해 주세요' };
  const last = cat.wellbeing?.[a.key];
  if (last != null && now - last < 60e3) return { ok: false, msg: '조금 쉬었다가 다시 돌봐 주세요 (1분)' };
  cat.wellbeing ??= {};
  cat.wellbeing[a.key] = now;
  cat.lastInteraction = { action, at: now };
  return { ok: true, fx: a.icon };
}
