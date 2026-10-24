// Original synthesized notes: no external music, samples, or autoplay.
const MELODY = [0, 4, 7, 11, 9, 7, 4, 2, 0, 4, 9, 7, 4, 2, -1, 2];
const EFFECTS = { care: [72, 76, 79], yarn: [79, 76, 81], feed: [67, 72], clean: [76, 84], income: [72, 79, 84], breed: [64, 67, 72], birth: [72, 76, 79, 84] };
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
import { DEFAULT_AUDIO, audioPreferences } from './preferences.js';

export class GameAudio {
  constructor() { this.enabled = false; this.context = null; this.timer = null; this.step = 0; this.sources = new Set(); this.musicSources = new Set(); this.hidden = false; this.volumes = {...DEFAULT_AUDIO}; }
  stopNotes() { for (const source of this.sources) { try { source.stop(); } catch { /* already ended */ } } this.sources.clear(); this.musicSources.clear(); }
  setVolumes(value) {
    const previous = this.volumes.music; this.volumes = audioPreferences(value);
    for (const key of ['music','effects']) if(this.channels) this.channels[key].gain.value=this.volumes[key];
    if (!this.volumes.music) {
      clearInterval(this.timer);this.timer=null;
      for(const source of this.musicSources) {try{source.stop();}catch{/* already ended */}}
      this.musicSources.clear();
    } else if (!previous && this.enabled && !this.hidden && this.context?.state==='running') {
      this.nextNote=this.context.currentTime+.05;this.startMusic();
    }
  }
  async setEnabled(enabled) {
    if (!enabled) {
      this.enabled = false; clearInterval(this.timer); this.timer = null;
      this.stopNotes();
      if (this.context?.state === 'running') await this.context.suspend();
      return false;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('이 브라우저에서는 소리를 재생할 수 없어요');
    this.context ??= new Context();
    if (!this.master) {
      this.master = this.context.createGain(); this.master.gain.value = .075; this.master.connect(this.context.destination);
      this.channels = Object.fromEntries(['music','effects'].map(key=>{
        const gain=this.context.createGain();gain.gain.value=this.volumes[key];gain.connect(this.master);return [key,gain];
      }));
    }
    await this.context.resume(); this.enabled = true;
    this.nextNote = this.context.currentTime + .05;
    if (this.hidden) await this.context.suspend(); else this.startMusic();
    return true;
  }
  note(midi, at, duration = .7, volume = .12, channel = 'music') {
    const context = this.context;
    const oscillator = context.createOscillator(), envelope = context.createGain();
    this.sources.add(oscillator);
    if(channel==='music')this.musicSources.add(oscillator);
    oscillator.type = 'triangle'; oscillator.frequency.value = frequency(midi);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + .025);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(this.channels[channel]);
    oscillator.start(at); oscillator.stop(at + duration + .02);
    oscillator.onended = () => { this.sources.delete(oscillator);this.musicSources.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
  }
  startMusic() {
    clearInterval(this.timer);
    this.timer=null;
    if(!this.volumes.music)return;
    const schedule = () => {
      if (!this.enabled || this.context.state !== 'running') return;
      if (this.nextNote < this.context.currentTime) this.nextNote = this.context.currentTime + .05;
      while (this.nextNote < this.context.currentTime + 1.5) {
        this.note(60 + MELODY[this.step % MELODY.length], this.nextNote, 1.1, .11);
        if (this.step % 4 === 0) this.note(48 + (this.step % 16 < 8 ? 0 : 5), this.nextNote, 2.4, .055);
        this.step++; this.nextNote += .8;
      }
    };
    schedule(); this.timer = setInterval(schedule, 400);
  }
  play(effect = 'care') {
    if (!this.enabled || !this.volumes.effects || this.context?.state !== 'running') return;
    const notes = EFFECTS[effect] ?? EFFECTS.care;
    notes.forEach((midi, i) => this.note(midi, this.context.currentTime + i * .11, .28, .22, 'effects'));
  }
  async visibility(hidden) {
    this.hidden = hidden;
    if (!this.enabled || !this.context) return;
    if (hidden) { clearInterval(this.timer); this.timer = null; this.stopNotes(); await this.context.suspend(); }
    else { await this.context.resume(); if (!this.enabled || this.hidden) { await this.context.suspend(); return; } this.nextNote = this.context.currentTime + .05; this.startMusic(); }
  }
}
export const sound = new GameAudio();
