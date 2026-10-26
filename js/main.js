import { G, load, newGame, tick, save, loadIssue } from './game.js';
import { showRecovery } from './recovery.js';

async function start() {
  tick(); save();
  const { init, U } = await import('./ui.js');
  const development=['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('dev')==='1';
  init({development});
  if(development){window.__game = G;window.__ui = U;}
}
if (load()) await start();
else if (loadIssue) showRecovery(start);
else { newGame(); await start(); }
