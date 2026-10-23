import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickVector } from '../js/touch-controls.js';
import { GameAudio } from '../js/audio.js';

test('touch stick has a dead zone and caps diagonal movement', () => {
  assert.deepEqual(stickVector(2, 2), {x:0,y:0,knobX:0,knobY:0});
  assert.deepEqual(stickVector(0, 0), {x:0,y:0,knobX:0,knobY:0});
  const v = stickVector(100, -100);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(v.knobX, v.knobY) - 42) < 1e-12);
  assert.ok(v.x > 0 && v.y < 0);
  assert.ok(stickVector(20, 0).x > 0 && stickVector(20, 0).x < 1);
});
test('audio starts only after enabling and releases notes on mute or hidden tab', async () => {
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.created = 0; }
    createGain() { return { gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){} }; }
    createOscillator() { this.created++; return { frequency:{value:0},connect(){},start(){},stop(){this.onended?.();},disconnect(){} }; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
  }
  globalThis.window = {AudioContext:FakeContext};
  const audio = new GameAudio();
  try {
    audio.play('birth'); assert.equal(audio.context, null);
    await audio.setEnabled(true); assert.ok(audio.context.created > 0); assert.ok(audio.timer);
    audio.play('birth'); const count = audio.context.created;
    await audio.visibility(true); assert.equal(audio.timer, null); assert.equal(audio.sources.size, 0);
    audio.play('birth'); assert.equal(audio.context.created, count);
    await audio.visibility(false); assert.ok(audio.timer);
    await audio.setEnabled(false); assert.equal(audio.enabled, false); assert.equal(audio.sources.size, 0); assert.equal(audio.timer, null);
  } finally { await audio.setEnabled(false); delete globalThis.window; }
});
