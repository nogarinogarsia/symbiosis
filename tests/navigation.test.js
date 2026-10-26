import {test} from 'node:test';import assert from 'node:assert/strict';
import {findPath,segmentClear} from '../js/navigation.js';
import {canOpenAt,nearbyZones} from '../js/locations.js';
const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10};
test('location menus require the matching nearby place while home works everywhere',()=>{
  const zones=[{id:'shop',x:0,z:0,r:2},{id:'npc:n1',x:8,z:0,r:2}];
  assert.equal(canOpenAt('home',{x:50,z:50},zones),true);assert.equal(canOpenAt('shop',{x:5,z:5},zones),false);
  assert.equal(canOpenAt('shop',{x:1,z:1},zones),true);assert.equal(canOpenAt('npc',{x:8,z:0},zones),true);
  assert.equal(canOpenAt('breed',{x:0,z:0},zones),false);assert.equal(nearbyZones({x:0,z:0},zones).length,1);
});
test('navigation goes around walls and every returned segment keeps avatar clearance',()=>{
  const start={x:-7,z:0},end={x:7,z:0},walls=[[-1,1,-5,5]];
  assert.equal(segmentClear(start,end,walls),false);const path=findPath(start,end,walls,bounds);assert.ok(path.length>=3);
  let previous=start;for(const point of path){assert.ok(segmentClear(previous,point,walls));previous=point;}assert.deepEqual(path.at(-1),end);
});
test('thin fences are not skipped and a fully enclosed goal is unreachable',()=>{
  const start={x:-5,z:0},end={x:5,z:0};assert.equal(segmentClear(start,end,[[0,.1,-10,10]]),false);
  assert.deepEqual(findPath(start,end,[[0,.1,-10,10]],bounds),[]);
  assert.deepEqual(findPath(start,{x:30,z:0},[],bounds),[]);assert.deepEqual(findPath(start,{x:0,z:0},[[-1,1,-1,1]],bounds),[]);
});
test('the narrow pen gate remains passable without cutting through fence rails',()=>{
  const walls=[[-5,5,-5.1,-4.9],[-5.1,-4.9,-5,5],[4.9,5.1,-5,5],[-5,-.9,4.9,5.1],[.9,5,4.9,5.1]];
  const start={x:0,z:0},end={x:0,z:9},path=findPath(start,end,walls,bounds);assert.ok(path.length);
  let previous=start;for(const point of path){assert.ok(segmentClear(previous,point,walls));previous=point;}
});
