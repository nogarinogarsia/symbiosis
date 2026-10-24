import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_AUDIO,audioPreferences,loadAudioPreferences,saveAudioPreferences} from '../js/preferences.js';
import {GameAudio} from '../js/audio.js';

test('volume preferences preserve zero and reject invalid values without touching game data',()=>{
  const data=new Map([['catgene-save-v1','original game']]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  assert.deepEqual(loadAudioPreferences(storage),DEFAULT_AUDIO);
  assert.equal(saveAudioPreferences(storage,{music:0,effects:.27}),true);
  assert.deepEqual(loadAudioPreferences(storage),{music:0,effects:.27});
  assert.equal(data.get('catgene-save-v1'),'original game');
  for(const music of [NaN,Infinity,-1,1.1,'0',null])assert.equal(audioPreferences({music}).music,DEFAULT_AUDIO.music);
  assert.deepEqual(audioPreferences({music:1,effects:0}),{music:1,effects:0});
  data.set('catgene-audio-v1','{broken');assert.deepEqual(loadAudioPreferences(storage),DEFAULT_AUDIO);
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.deepEqual(loadAudioPreferences(blocked),DEFAULT_AUDIO);assert.equal(saveAudioPreferences(blocked,{music:.2,effects:.4}),false);
});

test('music and effects have independent gains and zero music stops its scheduler',async()=>{
  class FakeContext {
    constructor(){this.state='suspended';this.currentTime=0;this.created=0;}
    createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator(){this.created++;return {frequency:{value:0},connect(){},start(){},stop(){this.onended?.();},disconnect(){}};}
    async resume(){this.state='running';}async suspend(){this.state='suspended';}
  }
  globalThis.window={AudioContext:FakeContext};const audio=new GameAudio();
  try{
    audio.setVolumes({music:0,effects:.3});assert.equal(audio.context,null);
    await audio.setEnabled(true);assert.equal(audio.timer,null);assert.equal(audio.context.created,0);
    assert.equal(audio.channels.music.gain.value,0);assert.equal(audio.channels.effects.gain.value,.3);
    audio.play('birth');const effects=audio.context.created;assert.equal(effects,4);
    audio.setVolumes({music:.4,effects:0});assert.ok(audio.timer);assert.ok(audio.musicSources.size);
    const count=audio.context.created;audio.play('birth');assert.equal(audio.context.created,count);
    audio.setVolumes({music:0,effects:0});assert.equal(audio.timer,null);assert.equal(audio.musicSources.size,0);
    await audio.visibility(true);await audio.visibility(false);assert.equal(audio.timer,null);
    await audio.setEnabled(false);assert.equal(audio.sources.size,0);
  }finally{await audio.setEnabled(false);delete globalThis.window;}
});
