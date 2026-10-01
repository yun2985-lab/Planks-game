// Physics stays fixed at 60 Hz; drawing interpolates without changing collision state.
export class MotionSampler {
 constructor(){this.previous=new Map();this.displayed=new Map();this.offsets=new Map();}
 reset(){this.previous.clear();this.displayed.clear();this.offsets.clear();}
 capture(game){this.previous=new Map(game.players.map(p=>[p.id,{phase:p.phase,lane:p.lane,s:p.s,fall:p.fall}]));}
 reconcile(game){this.offsets.clear();for(const p of game.players){const old=this.displayed.get(p.id);if(!old||old.phase!==p.phase||p.finished)continue;const d={lane:old.lane-p.lane,s:old.s-p.s,fall:old.fall-p.fall};if(Math.abs(d.lane)<.7&&Math.abs(d.s)<8&&Math.abs(d.fall)<.12)this.offsets.set(p.id,d);}this.capture(game);}
 sample(game,alpha,dt){const a=Math.max(0,Math.min(1,alpha)),decay=Math.exp(-18*Math.min(dt,.1));const players=game.players.map(p=>{const old=this.previous.get(p.id),v={...p};if(old&&old.phase===p.phase&&!p.finished&&game.mode==='running'&&!game.paused)for(const k of ['lane','s','fall'])v[k]=old[k]+(p[k]-old[k])*a;const offset=this.offsets.get(p.id);if(offset){for(const k of ['lane','s','fall']){offset[k]*=decay;v[k]+=offset[k];}}this.displayed.set(p.id,{phase:v.phase,lane:v.lane,s:v.s,fall:v.fall});return v;});return {...game,players};}
}
