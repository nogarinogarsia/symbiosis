const AUDIO_KEY = 'catgene-audio-v1';
export const DEFAULT_AUDIO = Object.freeze({music:.55,effects:.8});
export function audioPreferences(value) {
  return Object.fromEntries(Object.entries(DEFAULT_AUDIO).map(([key,fallback]) => [key,
    Number.isFinite(value?.[key]) && value[key]>=0 && value[key]<=1 ? value[key] : fallback]));
}
export function loadAudioPreferences(storage) {
  try { return audioPreferences(JSON.parse(storage.getItem(AUDIO_KEY))); }
  catch { return {...DEFAULT_AUDIO}; }
}
export function saveAudioPreferences(storage,value) {
  try { storage.setItem(AUDIO_KEY,JSON.stringify(audioPreferences(value)));return true; }
  catch { return false; }
}
