import {PLACE_NAMES,tabOfZone} from './locations.js';
import {getMapLayout,MAP_BOUNDS} from './map-layout.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function destinationName(id,npcs){
  if(id?.startsWith('npc:')){const npc=npcs.find(n=>n.id===id.slice(4));if(npc)return `${npc.icon} ${npc.name}의 집`;}
  return PLACE_NAMES[tabOfZone(id)]??'마을';
}
// 마을 범위(MAP_BOUNDS + 여백 2)를 지도 600×370에 맞춤
const MB={x0:MAP_BOUNDS.minX-2,w:MAP_BOUNDS.maxX-MAP_BOUNDS.minX+4,z0:MAP_BOUNDS.minZ-2,d:MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ+4};
export const mapPoint=p=>({x:(p.x-MB.x0)/MB.w*600,y:(p.z-MB.z0)/MB.d*370});
export function villageMap(pens,zones,player,npcs){
  const yards=Object.values(pens).map(pen=>{
    const p=mapPoint({x:pen.cx-pen.w/2,z:pen.cz-pen.d/2});
    return `<rect x="${p.x}" y="${p.y}" width="${pen.w/MB.w*600}" height="${pen.d/MB.d*370}" rx="6" fill="${pen.id==='mine'?'#f5e3b0':'#e4ddba'}" stroke="#b59062" stroke-width="2"/>`;
  }).join('');
  const markers=zones.map(zone=>{
    const p=mapPoint(zone),npc=zone.id.startsWith('npc:'),index=npcs.findIndex(n=>n.id===zone.id.slice(4));
    const label=npc&&index>=0?`${index+1} ${npcs[index].name}`:destinationName(zone.id,npcs);
    return `<g><circle cx="${p.x}" cy="${p.y}" r="${npc?7:10}" fill="${npc?'#8a987a':'#e5ac99'}" stroke="white" stroke-width="2"/><text x="${p.x}" y="${p.y+(npc?25:-18)}" text-anchor="middle" font-size="19">${esc(label)}</text></g>`;
  }).join('');
  // 흙길: 맵 배치 데이터의 사각형을 그대로 그림
  const L=getMapLayout();
  // 곡선 흙길·둥근 광장
  const curves=(L.roads??[]).map(r=>`<polyline points="${r.pts.map(q=>{const m=mapPoint({x:q[0],z:q[1]});return `${m.x.toFixed(1)},${m.y.toFixed(1)}`;}).join(' ')}" fill="none" stroke="#e9d4aa" stroke-width="${(r.w/MB.w*600).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')
    +(L.plazas??[]).filter(q=>q.kind!=='grass').map(q=>{const m=mapPoint(q);return `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${(q.r/MB.w*600).toFixed(1)}" fill="${q.kind==='stone'?'#efe4d0':'#e9d4aa'}"/>`;}).join('');
  const roads=curves+L.paths.map(r=>{const a=mapPoint({x:r.x-r.w/2,z:r.z-r.d/2});return `<rect x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${(r.w/MB.w*600).toFixed(1)}" height="${(r.d/MB.d*370).toFixed(1)}" rx="4" fill="#e9d4aa"/>`;}).join('');
  const p=mapPoint(player),home=mapPoint({x:pens.mine.cx,z:pens.mine.cz});
  return `<svg class="village-map" viewBox="0 0 600 370" role="img" aria-label="마을 지도: 위쪽에 이웃 다섯 집, 왼쪽에 도서관과 우리집, 오른쪽에 교배집과 동물샵. 파란 점은 현재 위치입니다."><rect width="600" height="370" rx="18" fill="#dbeacc"/>${roads}${yards}<text x="${home.x}" y="${home.y}" text-anchor="middle" font-size="20">🏠 우리집</text>${markers}<circle cx="${p.x}" cy="${p.y}" r="9" fill="#3d8dba" stroke="white" stroke-width="3"/><text x="${p.x+(p.x>480?-14:14)}" y="${Math.max(20,p.y-10)}" text-anchor="${p.x>480?'end':'start'}" font-size="18" fill="#245675">현재 위치</text></svg>`;
}
