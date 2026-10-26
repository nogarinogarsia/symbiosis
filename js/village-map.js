import {PLACE_NAMES,tabOfZone} from './locations.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function destinationName(id,npcs){
  if(id?.startsWith('npc:')){const npc=npcs.find(n=>n.id===id.slice(4));if(npc)return `${npc.icon} ${npc.name}의 집`;}
  return PLACE_NAMES[tabOfZone(id)]??'마을';
}
export const mapPoint=p=>({x:(p.x+38)/76*600,y:(p.z+28)/53*370});
export function villageMap(pens,zones,player,npcs){
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${mapPoint(p).x.toFixed(1)},${mapPoint(p).y.toFixed(1)}`).join(' ');
  const yards=Object.values(pens).map(pen=>{
    const p=mapPoint({x:pen.cx-pen.w/2,z:pen.cz-pen.d/2});
    return `<rect x="${p.x}" y="${p.y}" width="${pen.w/76*600}" height="${pen.d/53*370}" rx="6" fill="${pen.id==='mine'?'#f5e3b0':'#e4ddba'}" stroke="#b59062" stroke-width="2"/>`;
  }).join('');
  const markers=zones.map(zone=>{
    const p=mapPoint(zone),npc=zone.id.startsWith('npc:'),index=npcs.findIndex(n=>n.id===zone.id.slice(4));
    const label=npc&&index>=0?`${index+1} ${npcs[index].name}`:destinationName(zone.id,npcs);
    return `<g><circle cx="${p.x}" cy="${p.y}" r="${npc?7:10}" fill="${npc?'#8a987a':'#e5ac99'}" stroke="white" stroke-width="2"/><text x="${p.x}" y="${p.y+(npc?25:-18)}" text-anchor="middle" font-size="19">${esc(label)}</text></g>`;
  }).join('');
  const p=mapPoint(player),home=mapPoint({x:pens.mine.cx,z:pens.mine.cz});
  return `<svg class="village-map" viewBox="0 0 600 370" role="img" aria-label="마을 지도: 위쪽에 이웃 다섯 집, 왼쪽에 도서관과 우리집, 오른쪽에 교배집과 동물샵. 파란 점은 현재 위치입니다."><rect width="600" height="370" rx="18" fill="#dbeacc"/><path d="${path([{x:-32,z:13},{x:32,z:13}])} ${path([{x:0,z:13},{x:0,z:-10.4}])} ${path([{x:-28,z:-10.4},{x:30,z:-10.4}])}" stroke="#e9d4aa" stroke-width="22" fill="none"/>${yards}<text x="${home.x}" y="${home.y}" text-anchor="middle" font-size="20">🏠 우리집</text>${markers}<circle cx="${p.x}" cy="${p.y}" r="9" fill="#3d8dba" stroke="white" stroke-width="3"/><text x="${p.x+(p.x>480?-14:14)}" y="${Math.max(20,p.y-10)}" text-anchor="${p.x>480?'end':'start'}" font-size="18" fill="#245675">현재 위치</text></svg>`;
}
