export const PLACE_NAMES={home:'🏠 우리집',breed:'💞 교배집',shop:'🛍️ 동물샵',dex:'📖 유전 도서관',npc:'🏘️ 이웃 마을'};
export const tabOfZone=id=>id?.startsWith('npc:')?'npc':id;
export function nearbyZones(position,zones) {
  return zones.filter(zone=>Math.hypot(position.x-zone.x,position.z-zone.z)<=zone.r+.35);
}
export function canOpenAt(tab,position,zones) {
  return tab==='home'||nearbyZones(position,zones).some(zone=>tabOfZone(zone.id)===tab);
}
