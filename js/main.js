import { G, load, newGame, tick, save } from './game.js';
import { init } from './ui.js';

if (!load() || !Object.keys(G.cats).length || !G.mine.length) newGame();
tick();
save();
init();
window.__game = G; // 디버깅용
