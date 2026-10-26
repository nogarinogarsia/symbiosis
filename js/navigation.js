// Small grid A* for the village's static buildings and fences, with continuous segment checks.
export function segmentClear(a,b,obstacles,radius=.42) {
  return !obstacles.some(([x0,x1,z0,z1])=>{
    let low=0,high=1;
    for(const [origin,delta,min,max] of [[a.x,b.x-a.x,x0-radius,x1+radius],[a.z,b.z-a.z,z0-radius,z1+radius]]){
      if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return false;}
      else{let u=(min-origin)/delta,v=(max-origin)/delta;if(u>v)[u,v]=[v,u];low=Math.max(low,u);high=Math.min(high,v);if(low>high)return false;}
    }
    return high>=0&&low<=1;
  });
}
export function findPath(start,end,obstacles,bounds,step=.75) {
  const within=p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
  if(!within(start)||!within(end)||!segmentClear(start,start,obstacles)||!segmentClear(end,end,obstacles))return [];
  if(segmentClear(start,end,obstacles))return [{...end}];
  const point=(x,z)=>({x:bounds.minX+x*step,z:bounds.minZ+z*step});
  const nodeNear=p=>{
    const x=Math.round((p.x-bounds.minX)/step),z=Math.round((p.z-bounds.minZ)/step),options=[];
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
      const q=point(x+dx,z+dz);if(within(q)&&segmentClear(p,q,obstacles))options.push({x:x+dx,z:z+dz,p:q,d:Math.hypot(p.x-q.x,p.z-q.z)});
    }
    return options.sort((a,b)=>a.d-b.d)[0];
  };
  const first=nodeNear(start),last=nodeNear(end);if(!first||!last)return [];
  const key=(x,z)=>`${x},${z}`,target=key(last.x,last.z),open=[{...first,g:0,f:0}],scores=new Map([[key(first.x,first.z),0]]),parents=new Map(),closed=new Set();
  let found=null;
  while(open.length){
    open.sort((a,b)=>a.f-b.f);const current=open.shift(),id=key(current.x,current.z);
    if(closed.has(id))continue;if(id===target){found=current;break;}closed.add(id);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=current.x+dx,z=current.z+dz,p=point(x,z),nextKey=key(x,z),g=current.g+Math.hypot(dx,dz)*step;
      if(closed.has(nextKey)||!within(p)||g>=(scores.get(nextKey)??Infinity)||!segmentClear(current.p,p,obstacles))continue;
      scores.set(nextKey,g);parents.set(nextKey,current);open.push({x,z,p,g,f:g+Math.hypot(p.x-last.p.x,p.z-last.p.z)});
    }
  }
  if(!found)return [];
  const route=[{...end}];for(let node=found;node;node=parents.get(key(node.x,node.z)))route.unshift(node.p);
  const compact=[];let anchor=start,index=0;
  while(index<route.length){let far=index;while(far+1<route.length&&segmentClear(anchor,route[far+1],obstacles))far++;compact.push(route[far]);anchor=route[far];index=far+1;}
  return compact;
}
