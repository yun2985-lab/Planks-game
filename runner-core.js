export const SURFACE=130,DEPTH=64,CAVE=160,MAX_PLAYERS=5;
export const COLORS=['#a344e0','#f16f94','#46c9be','#f6c653','#6d9aef'];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function centre(s,phase=0){return phase===2?Math.sin(s*.065)*2:Math.sin(s*.065)*2.5*Math.sin(Math.PI*s/SURFACE);}
export function position(p){if(p.phase===0)return{x:centre(p.s)+p.lane*3,y:0,z:p.s};if(p.phase===1)return{x:centre(SURFACE-3.5)*(1-p.fall)+p.lane*3,y:-DEPTH*(.7171875*p.fall+.2828125*p.fall*p.fall),z:SURFACE-3.5+3.5*(1-Math.exp(-p.fall*10))/(1-Math.exp(-10))};return{x:centre(p.s,2)+p.lane*3,y:-DEPTH,z:SURFACE+p.s};}
export const rocks=Array.from({length:22},(_,i)=>({phase:i<10?0:2,s:12+(i%12)*12,lane:Math.sin(i*13.2)*.78}));
export const gems=Array.from({length:32},(_,i)=>({id:i,phase:i<14?0:2,s:8+(i%18)*8,lane:Math.sin(i*2.3)*.62}));
export const cats=[{phase:0,s:35,lane:-1.5},{phase:0,s:77,lane:1.5},{phase:0,s:109,lane:-1.5},{phase:2,s:32,lane:1.5},{phase:2,s:88,lane:-1.5},{phase:2,s:132,lane:1.5}];
export function createGame(ids){if(ids.length<1||ids.length>5)throw Error('참가 인원은 1~5명입니다.');return{version:1,time:0,mode:'lobby',paused:false,players:ids.map((id,i)=>({id,color:COLORS[i],name:'P'+(i+1),phase:0,s:0,lane:(i-(ids.length-1)/2)*.15,input:0,fall:0,guard:0,slow:0,score:0,gems:[],hits:0,finished:false,finishTime:null})),shots:[],effects:[],catTimers:cats.map((_,i)=>1.5+i*.5),seq:0};}
export function startGame(g){g.mode='running';g.time=0;}
export function input(g,id,value){const p=g.players.find(p=>p.id===id);if(p)p.input=Number.isFinite(value)?clamp(value,-1,1):0;}
export function progress(p){return p.finished?1:p.phase===0?p.s/(SURFACE+CAVE+30):p.phase===1?(SURFACE+p.fall*30)/(SURFACE+CAVE+30):(SURFACE+30+p.s)/(SURFACE+CAVE+30);}
function effect(g,p,type){g.effects.push({id:++g.seq,phase:p.phase,s:p.s,lane:p.lane,type,age:0});}
export function step(g,dt){if(g.mode!=='running'||g.paused)return;dt=clamp(dt,0,1/30);g.time+=dt;
 for(const p of g.players){if(p.finished)continue;p.guard=Math.max(0,p.guard-dt);p.slow=Math.max(0,p.slow-dt);p.lane=clamp(p.lane+p.input*1.55*dt,-.94,.94);
  if(p.phase===1){p.fall+=dt/2.7;if(p.fall>=1){p.phase=2;p.fall=1;p.s=0;p.guard=.9;effect(g,p,'land');}continue;}
  p.s+=17*(p.slow>0?.45:1)*dt;
  for(const r of rocks)if(r.phase===p.phase&&Math.abs(p.s-r.s)<.65&&Math.abs(p.lane-r.lane)<.21&&p.guard<=0){p.s=Math.max(0,p.s-1.5);p.slow=.65;p.guard=1.1;p.hits++;effect(g,p,'hit');}
  for(const gem of gems)if(gem.phase===p.phase&&Math.abs(p.s-gem.s)<.9&&Math.abs(p.lane-gem.lane)<.3&&!p.gems.includes(gem.id)){p.gems.push(gem.id);p.score++;effect(g,p,'gem');}
  if(p.phase===0&&p.s>=SURFACE-3.5){p.s=SURFACE-3.5;p.phase=1;p.fall=0;effect(g,p,'dive');}
  if(p.phase===2&&p.s>=CAVE){p.s=CAVE;p.phase=3;p.finished=true;p.finishTime=g.time;effect(g,p,'finish');}
 }
 for(let i=0;i<cats.length;i++){g.catTimers[i]-=dt;if(g.catTimers[i]>0)continue;g.catTimers[i]=2.7;const c=cats[i],targets=g.players.filter(p=>!p.finished&&p.phase===c.phase&&Math.abs(p.s-c.s)<18);if(!targets.length)continue;const target=targets[(g.seq+i)%targets.length],dx=(target.lane-c.lane)*3,dz=target.s-c.s,len=Math.hypot(dx,dz)||1;g.shots.push({id:++g.seq,phase:c.phase,s:c.s,x:c.lane*3,vx:dx/len*35,vs:dz/len*35,age:0});effect(g,{...c},'fire');}
 for(const q of g.shots){const oldX=q.x,oldS=q.s;q.x+=q.vx*dt;q.s+=q.vs*dt;q.age+=dt;for(const p of g.players){if(p.finished||p.phase!==q.phase||p.guard>0)continue;const dx=q.x-oldX,dz=q.s-oldS,t=clamp(((p.lane*3-oldX)*dx+(p.s-oldS)*dz)/(dx*dx+dz*dz||1),0,1);if(Math.hypot(p.lane*3-oldX-dx*t,p.s-oldS-dz*t)<.6){p.s=Math.max(0,p.s-2);p.slow=.7;p.guard=1.1;p.hits++;q.age=5;effect(g,p,'hit');break;}}}
 g.shots=g.shots.filter(q=>q.age<1.8&&Math.abs(q.x)<9);for(const e of g.effects)e.age+=dt;g.effects=g.effects.filter(e=>e.age<.65);if(g.players.every(p=>p.finished))g.mode='finished';
}
export function snapshot(g){return JSON.parse(JSON.stringify(g));}
