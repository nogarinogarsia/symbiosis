import { G, load, newGame, tick, save, loadIssue } from './game.js';
import { showRecovery } from './recovery.js';

async function start() {
  tick(); save();
  const { init, U } = await import('./ui.js');
  init();
  window.__game = G; // 디버깅용
  window.__ui = U;
}
if (load()) await start();
else if (loadIssue) showRecovery(start);
else { newGame(); await start(); }
