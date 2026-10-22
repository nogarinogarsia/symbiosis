import { G, load, newGame, tick, save } from './game.js';
import { init, U } from './ui.js';

if (!load()) newGame();
tick();
save();
init();
window.__game = G; // 디버깅용
window.__ui = U;
