export const SURFACE=260,DEPTH=64,CAVE=320,MAX_PLAYERS=5;
export const COLORS=['#a344e0','#f16f94','#46c9be','#f6c653','#6d9aef'];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function centre(s,phase=0){return phase===2?Math.sin(s*.065)*2:Math.sin(s*.065)*2.5*Math.sin(Math.PI*s/SURFACE);}
export function position(p){if(p.phase===0)return{x:centre(p.s)+p.lane*3,y:0,z:p.s};if(p.phase===1)return{x:centre(SURFACE-3.5)*(1-p.fall)+p.lane*3,y:-DEPTH*(.7171875*p.fall+.2828125*p.fall*p.fall),z:SURFACE-3.5+3.5*(1-Math.exp(-p.fall*10))/(1-Math.exp(-10))};return{x:centre(p.s,2)+p.lane*3,y:-DEPTH,z:SURFACE+p.s};}
export const rocks=Array.from({length:44},(_,i)=>({phase:i<20?0:2,s:12+(i%24)*12,lane:Math.sin(i*13.2)*.78}));
export const gems=[];
export const fallObstacles=[{depth:14,lane:-.55,width:.33},{depth:29,lane:.5,width:.36},{depth:44,lane:-.12,width:.4},{depth:56,lane:.65,width:.28}];
export const boostZones=[{id:0,phase:0,s:50,lane:-.7},{id:1,phase:0,s:142,lane:.7},{id:2,phase:0,s:214,lane:0},{id:3,phase:2,s:56,lane:.7},{id:4,phase:2,s:168,lane:-.7},{id:5,phase:2,s:264,lane:0}];
export const cats=Array.from({length:12},(_,i)=>({phase:i<6?0:2,s:30+(i%6)*(i<6?40:49),lane:i%2?1.5:-1.5}));
export function createGame(ids){if(ids.length<1||ids.length>5)throw Error('참가 인원은 1~5명입니다.');return{version:2,time:0,mode:'lobby',paused:false,players:ids.map((id,i)=>({id,color:COLORS[i],name:'P'+(i+1),phase:0,s:0,lane:(i-(ids.length-1)/2)*.36,input:0,vx:0,boost:0,boostZone:null,elasticity:.85,wallCooldown:0,fall:0,guard:0,slow:0,score:0,gems:[],hits:0,finished:false,finishTime:null})),shots:[],warnings:[],effects:[],catTimers:cats.map((_,i)=>1+i*.19),seq:0};}
export function startGame(g){g.mode='running';g.time=0;}
export function input(g,id,value){const p=g.players.find(p=>p.id===id);if(p)p.input=Number.isFinite(value)?clamp(value,-1,1):0;}
export function progress(p){return p.finished?1:p.phase===0?p.s/(SURFACE+CAVE+30):p.phase===1?(SURFACE+p.fall*30)/(SURFACE+CAVE+30):(SURFACE+30+p.s)/(SURFACE+CAVE+30);}
function effect(g,p,type){g.effects.push({id:++g.seq,phase:p.phase,s:p.s,lane:p.lane,player:p.id??null,type,depth:p.phase===1?-position(p).y:0,age:0});}
export function step(g,dt){if(g.mode!=='running'||g.paused)return;dt=clamp(dt,0,1/30);g.time+=dt;
 for(const p of g.players){if(p.finished)continue;p.guard=Math.max(0,p.guard-dt);p.slow=Math.max(0,p.slow-dt);p.boost=Math.max(0,p.boost-dt);p.wallCooldown=Math.max(0,p.wallCooldown-dt);p.vx+=(p.input*1.85-p.vx)*(1-Math.exp(-dt*7));p.lane+=p.vx*dt;const limit=p.phase===1?.94:1.4;if(Math.abs(p.lane)>limit){const side=Math.sign(p.lane);p.lane=side*limit;p.vx=-side*Math.max(.8,Math.abs(p.vx)*p.elasticity);if(p.wallCooldown<=0){p.wallCooldown=.35;p.hits++;effect(g,p,'wall');}}
  if(p.phase===1){const oldDepth=-position(p).y;p.fall+=dt/2.7*(p.slow>0?.75:1);const newDepth=-position(p).y;for(const o of fallObstacles)if(oldDepth<o.depth+.6&&newDepth>=o.depth-.6&&Math.abs(p.lane-o.lane)<o.width+.17&&p.guard<=0){p.vx=(p.lane>=o.lane?1:-1)*2.7;p.slow=.16;p.guard=.32;p.hits++;effect(g,p,'fallHit');}if(p.fall>=1){p.phase=2;p.fall=1;p.s=0;p.guard=.9;effect(g,p,'land');}continue;}
  const zone=boostZones.find(z=>z.phase===p.phase&&Math.abs(p.s-z.s)<1.4&&Math.abs(p.lane-z.lane)<.48);if(zone&&p.boostZone!==zone.id){p.boost=3;effect(g,p,'boost');}p.boostZone=zone?.id??null;
  p.s+=17*(p.boost>0?1.5:1)*(p.slow>0?.45:1)*dt;
  for(const r of rocks)if(r.phase===p.phase&&Math.abs(p.s-r.s)<.65&&Math.abs(p.lane-r.lane)<.21&&p.guard<=0){p.s=Math.max(0,p.s-1.5);p.vx=(p.lane>=r.lane?1:-1)*2.6;p.slow=.65;p.guard=1.1;p.hits++;effect(g,p,'hit');}
  if(p.phase===0&&p.s>=SURFACE-3.5){p.s=SURFACE-3.5;p.phase=1;p.fall=0;effect(g,p,'dive');}
  if(p.phase===2&&p.s>=CAVE){p.s=CAVE;p.phase=3;p.finished=true;p.finishTime=g.time;effect(g,p,'finish');}
 }
 // Resolve ball contacts once per pair; impulses use the approaching relative velocity.
 for(let i=0;i<g.players.length;i++)for(let j=i+1;j<g.players.length;j++){const a=g.players[i],b=g.players[j];if(a.finished||b.finished||a.phase!==b.phase)continue;const dx=(b.lane-a.lane)*3,dz=a.phase===1?(-position(b).y+position(a).y):b.s-a.s,d=Math.hypot(dx,dz);if(d>=1.02||Math.abs(dz)>.85)continue;const normal=Math.abs(dx)>.001?Math.sign(dx):(i%2?1:-1),overlap=(1.02-d)/6;a.lane-=normal*overlap;b.lane+=normal*overlap;const closing=(a.vx-b.vx)*normal;if(closing>0){const impulse=(1+Math.min(a.elasticity,b.elasticity))*closing/2;a.vx-=normal*impulse;b.vx+=normal*impulse;}else if(a.wallCooldown<=0){a.vx-=normal*1.2;b.vx+=normal*1.2;}if(a.wallCooldown<=0){a.hits++;a.wallCooldown=.2;effect(g,a,'bump');}if(b.wallCooldown<=0){b.hits++;b.wallCooldown=.2;effect(g,b,'bump');}const limit=a.phase===1?.94:1.4;a.lane=clamp(a.lane,-limit,limit);b.lane=clamp(b.lane,-limit,limit);}
 for(const w of g.warnings){w.age+=dt;if(w.age>=.35&&!w.fired){w.fired=true;const c=cats[w.cat];g.shots.push({id:++g.seq,phase:c.phase,s:c.s,x:c.lane*3,vx:w.vx,vs:w.vs,age:0});effect(g,c,'fire');}}
 g.warnings=g.warnings.filter(w=>!w.fired);
 for(let i=0;i<cats.length;i++){g.catTimers[i]-=dt;if(g.catTimers[i]>0)continue;g.catTimers[i]=1.15;const c=cats[i];if(!g.players.some(p=>!p.finished&&p.phase===c.phase&&Math.abs(p.s-c.s)<25))continue;const angle=((Math.floor(g.time/1.15)+i)%3-1)*.28;g.warnings.push({cat:i,age:0,vx:-Math.sign(c.lane)*42*Math.cos(angle),vs:42*Math.sin(angle)});}
 for(const q of g.shots){const oldX=q.x,oldS=q.s;q.x+=q.vx*dt;q.s+=q.vs*dt;q.age+=dt;for(const p of g.players){if(p.finished||p.phase!==q.phase||p.guard>0)continue;const dx=q.x-oldX,dz=q.s-oldS,t=clamp(((p.lane*3-oldX)*dx+(p.s-oldS)*dz)/(dx*dx+dz*dz||1),0,1);if(Math.hypot(p.lane*3-oldX-dx*t,p.s-oldS-dz*t)<.6){p.s=Math.max(0,p.s-2);p.vx=Math.sign(q.vx)*2.8;p.slow=.7;p.guard=1.1;p.hits++;q.age=5;effect(g,p,'hit');break;}}}
 g.shots=g.shots.filter(q=>q.age<1.8&&Math.abs(q.x)<9);for(const e of g.effects)e.age+=dt;g.effects=g.effects.filter(e=>e.age<.65);if(g.players.every(p=>p.finished))g.mode='finished';
}
export function snapshot(g){return JSON.parse(JSON.stringify(g));}
