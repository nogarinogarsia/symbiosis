// Exact Mendelian probabilities for the game's independent loci, without sampling.
import {alleleOptions} from './simulation.js';

export function crossDistribution(first,second) {
  const distribution={};
  for(const a of first)for(const b of second){
    const key=[a,b].sort().join('/');
    distribution[key]=(distribution[key]??0)+1/(first.length*second.length);
  }
  return distribution;
}
const probability=(distribution,predicate)=>Object.entries(distribution).reduce((sum,[key,p])=>sum+(predicate(key.split('/'))?p:0),0);
export function expectedCross(father,mother) {
  if(father?.sex!=='M' || mother?.sex!=='F')throw Error('아빠와 엄마의 성별을 확인해 주세요');
  for(const parent of [father,mother])for(const [locus,options]of Object.entries(alleleOptions)){
    const pair=parent.genome?.[locus];
    if(!Array.isArray(pair)||pair.length!==(locus==='O'&&parent.sex==='M'?1:2)||pair.some(a=>!options.includes(a)))throw Error(`${locus} 유전자형을 확인해 주세요`);
  }
  const loci={};
  for(const locus of Object.keys(alleleOptions))if(locus!=='O')loci[locus]=crossDistribution(father.genome[locus],mother.genome[locus]);
  const daughters=crossDistribution(father.genome.O,mother.genome.O),sons={};
  for(const allele of mother.genome.O)sons[allele]=(sons[allele]??0)+.5;
  const tyr=loci.C;
  return {loci,daughters,sons,sexes:{M:.5,F:.5},traits:{
    dilute:probability(loci.D,a=>a.every(v=>v==='d')),
    long:probability(loci.L,a=>a.every(v=>v==='l')),
    tortie:.5*probability(daughters,a=>a.includes('O')&&a.includes('o')),
    point:probability(tyr,a=>a.every(v=>v==='cs')),
    mink:probability(tyr,a=>a.includes('cb')&&a.includes('cs')),
    sepia:probability(tyr,a=>a.every(v=>v==='cb')),
  }};
}
