// Reproducible early-game estimate: four founders + two free own-parent litters.
// No shop spending, sales, time skips, milestone rewards or player idle time.
import {createFounder,breed,incomePerHour} from '../js/engine.js';
import {PARAMS} from '../js/params.js';
const samples=2000,hours=[],rates=[];
for(let i=0;i<samples;i++){
  const cats=['M','F','M','F'].map((sex,j)=>createFounder(`economy:${i}:${j}`,{sex,specialChance:0}));
  const dex=new Set(cats.map(c=>c.catalogId));let coins=PARAMS.startCoins;
  for(let j=0;j<2;j++){
    const c=breed(cats[j*2],cats[j*2+1],`early:${i}:${j}`);cats.push(c);
    if(!dex.has(c.catalogId)){coins+=(c.special?PARAMS.dexRewardSpecial:PARAMS.dexRewardByGrade[c.grade])+(c.fantasy?500:0);dex.add(c.catalogId);}
  }
  const rate=cats.reduce((sum,c)=>sum+incomePerHour(c),0);
  rates.push(rate);hours.push(Math.max(0,(PARAMS.penLevels[1].cost-coins)/rate));
}
const quantiles=values=>{values.sort((a,b)=>a-b);return Object.fromEntries([['p10',.1],['median',.5],['p90',.9]].map(([key,p])=>[key,Number(values[Math.floor(samples*p)].toFixed(3))]));};
console.log(JSON.stringify({samples,startCoins:PARAMS.startCoins,firstUpgradeCost:PARAMS.penLevels[1].cost,hoursAfterTwoLitters:quantiles(hours),hourlyIncomeAtSixCats:quantiles(rates),levels:PARAMS.penLevels},null,2));
