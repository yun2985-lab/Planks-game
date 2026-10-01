import * as THREE from './vendor/three.module.js';
let physicsCarry=0;const SIMULATION_RATE=1.40;let attackCues=[],impactCues=[],progressLastUpdate=-1;
'use strict';
const belcatImg = new Image();

const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const W=460,VH=640,PLAY_L=70,PLAY_R=390,CX=230;
const NECK_W=82, NECK_L=CX-NECK_W/2, NECK_R=CX+NECK_W/2;
const ELBOW_START_Y=2840, ELBOW_R=220, TUBE_HALF=41;
const ELBOW_CX=CX+ELBOW_R, ELBOW_CY=ELBOW_START_Y;
const HORIZ_CY=ELBOW_START_Y+ELBOW_R;
const HORIZ_START_X=CX+ELBOW_R;
const HORIZ_LEN=3000, FINISH_X=HORIZ_START_X+HORIZ_LEN, GOAL_X=FINISH_X+100;
const WORLD_W=GOAL_X+100, WORLD_H=HORIZ_CY+120;
const GRAV=345, REST=.42, WALL_REST=.55, MAX_SPEED=320, BASE_R=8.5;
const state={mode:'PLACEMENT',startTs:null,elapsed:0,cameraX:0,cameraY:0,dropX:CX,finishOrder:[],selected:null,placed:0};

const ui={
  count:document.getElementById('playerCount'),start:document.getElementById('startBtn'),reset:document.getElementById('resetBtn'),
  left:document.getElementById('leftCount'),legend:document.getElementById('legend'),board:document.getElementById('leaderboard'),
  timer:document.getElementById('timer'),status:document.getElementById('status'),wind:document.getElementById('wind'),announce:document.getElementById('announce')
};
const obstacleBtns=[...document.querySelectorAll('.obstacleBtn')];

let balls=[],pegs=[],bombs=[],windmills=[],ufos=[],mushrooms=[],particles=[],projectiles=[],laser=null;
let windX=0,windY=0,windTimer=.6,lastTs=performance.now(),shake=0;
let fireTimer=4.5/1.5, qTimer=6.0, rTimer=12.0, lightningTimer=7.0, globalFlash=0;
let lightTimer=7.0, tornadoTimer=11.0, event45Fired=false, event60Fired=false;
let walkers=[], walkerTimer=2.2, healer=null, healerTimer=9.0, mole=null, moleTimer=5.5;
let missiles=[], belcatAnimA=0, belcatAnimB=0, belcatActionA='idle', belcatActionB='idle';
let goalBelcatEvent={active:false,announced:false,t:0,shotTimer:6,shotT:0,targetId:null,hit:new Set()};
let wallHits=[];
const skillChoices=[];
const playerSkills={magnet:{name:'🧲 자석',desc:'6초마다 가까운 상대 1명을 3초간 끌어당깁니다.'},ice:{name:'❄ 얼리기',desc:'6초마다 상대 1명을 2초간 움직이지 못하게 합니다.'},grow:{name:'🟣 커져라',desc:'6초마다 상대 1명의 반지름을 한 단계(+3) 키웁니다. 최대 34.'}};
function renderSkillChoices(){
  const grid=document.getElementById('skillGrid');
  grid.innerHTML=ballInfo(playerCount()).map((p,i)=>{const key=skillChoices[i]||'magnet';skillChoices[i]=key;return `<fieldset class="skillPlayer"><legend style="color:${p.color}">${p.name}</legend><select aria-label="${p.name} 스킬" data-player="${i}" ${state.mode==='RACING'?'disabled':''}>${Object.entries(playerSkills).map(([k,v])=>`<option value="${k}" ${k===key?'selected':''}>${v.name}</option>`).join('')}</select><p class="skillDesc">${playerSkills[key].desc}</p></fieldset>`}).join('');
}
document.getElementById('skillGrid').addEventListener('change',e=>{
  const i=Number(e.target.dataset.player),key=e.target.value;
  if(state.mode==='RACING'||!Number.isInteger(i)||i<0||i>=playerCount()||!playerSkills[key])return;
  skillChoices[i]=key;renderSkillChoices();
});
function updatePlayerSkills(dt){
  for(const b of balls){
    b.magnetTime=Math.max(0,(b.magnetTime||0)-dt);
    if(b.landed||b.recorded)continue;
    b.skillTimer-=dt;if(b.skillTimer>0)continue;b.skillTimer+=6;
    const targets=balls.filter(o=>o!==b&&!o.landed&&!o.recorded);
    targets.sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y));
    const target=targets[0];if(!target)continue;
    if(b.skill==='magnet'){b.magnetTime=3;b.magnetTarget=target.id}
    if(b.skill==='ice'){target.freeze=2;target.vx=0;target.vy=0}
    if(b.skill==='grow'){target.r=Math.min(34,target.r+3);burst(target.x,target.y,'225,130,255',10)}
    announce(`${b.name} ${playerSkills[b.skill].name} → ${target.name}`);
  }
}
function applyMagnet(b,dt){
  for(const source of balls){
    if(source.landed||source.recorded||source.magnetTime<=0||source.magnetTarget!==b.id)continue;
    const dx=source.x-b.x,dy=source.y-b.y,d=Math.hypot(dx,dy)||1;
    if(d>b.r+source.r){b.vx+=dx/d*420*dt;b.vy+=dy/d*420*dt}
  }
}
function drawSkillEffects(){
  for(const b of balls){
    if(b.freeze>0){ctx.fillStyle='rgba(120,215,255,.3)';ctx.strokeStyle='#b8f3ff';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(b.x-b.r-3,b.y-b.r-3,2*b.r+6,2*b.r+6,4);ctx.fill();ctx.stroke()}
    if(b.magnetTime>0&&!b.landed&&!b.recorded){const t=balls.find(o=>o.id===b.magnetTarget&&!o.landed&&!o.recorded);if(t){ctx.strokeStyle='rgba(255,120,220,.8)';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(t.x,t.y);ctx.stroke();ctx.setLineDash([])}}
  }
  const active=state.elapsed%6<2;
  ctx.fillStyle=active?'#ffd39e':'#d4b8ef';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(active?'↶ 교차로 역풍':'교차로 · 회전 관문',ELBOW_CX-25,ELBOW_CY-22);
}
function respawnBall(b){
  const row=Math.floor(b.id/15), col=b.id%15, rowN=Math.min(15,balls.length-row*15), spacing=19;
  const sx=state.dropX-(rowN-1)*spacing/2;
  b.x=clamp(sx+col*spacing,PLAY_L+20,PLAY_R-20);b.y=30+row*19;
  b.vx=rand(-24,24);b.vy=0;b.zone='vertical';b.freeze=0;b.burn=0;b.slow=0;b.knockTime=0;b.hitGuard=.8;
  b.recorded=false;b.landed=false;b.lastProg=b.y;
  burst(b.x,b.y,'255,150,245',16);
}
function laserImpact(x,y){emitImpact(x,y,'boss');
  burst(x,y,'255,90,255',58);
  burst(x,y,'255,235,135',32);
  particles.push({x,y,vx:0,vy:0,age:0,life:.55,c:'255,245,255',ring:true,r:6,top:true});
  particles.push({x,y,vx:0,vy:0,age:0,life:.85,c:'205,70,255',ring:true,r:14,top:true});
  particles.push({x,y,vx:0,vy:0,age:0,life:.35,c:'255,120,255',flash:true,r:34,top:true});
}
function isLowerHorizontalBall(b){
  if(b.landed||b.recorded||b.zone!=='horizontal'||b.x<HORIZ_START_X+90)return false;
  const hb=horizontalBounds(b.x,performance.now());
  return b.y>=hb.top-b.r-6&&b.y<=hb.bot+b.r+6;
}
function lineDistance(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy||1;
  const u=clamp(((px-ax)*dx+(py-ay)*dy)/len,0,1);
  return Math.hypot(px-(ax+dx*u),py-(ay+dy*u));
}
function goalBelcatPos(){
  const t=goalBelcatEvent.t||0, enter=clamp(t/4.2,0,1);
  return {x:GOAL_X+160-enter*108,y:HORIZ_CY-8+Math.sin(t*4.2)*4+Math.sin(t*10)*3*(1-enter)};
}
function pickGoalBelcatTarget(){
  const pos=goalBelcatPos();
  const candidates=balls.filter(b=>isLowerHorizontalBall(b)&&!(b.bossGuard>0));
  return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null;
}
function goalBelcatBeam(){
  const pos=goalBelcatPos(), target=balls.find(b=>b.id===goalBelcatEvent.targetId&&!b.landed&&!b.recorded);
  const sx=pos.x-66, sy=pos.y-2;
  if(target)return {sx,sy,ex:target.x,ey:target.y,target};
  return {sx,sy,ex:HORIZ_START_X-28,ey:HORIZ_CY,target:null};
}
function updateGoalBelcatEvent(dt){
  if(!goalBelcatEvent.active&&state.elapsed>=10&&state.finishOrder.length>=1&&balls.some(isLowerHorizontalBall)){
    goalBelcatEvent={active:true,announced:true,t:0,shotTimer:2.2,shotT:0,targetId:null,hit:new Set()};announce('보스 몬스터가 등장합니다');
  }
  if(!goalBelcatEvent.active)return;
  goalBelcatEvent.t+=dt;
  if(goalBelcatEvent.t<4.2)return;
  goalBelcatEvent.shotTimer-=dt;
  if(goalBelcatEvent.shotTimer<=0){
    goalBelcatEvent.shotTimer+=6;
    const target=pickGoalBelcatTarget();
    if(target){const pos=goalBelcatPos();emitAttack(pos.x-66,pos.y-2,target.x,target.y,'boss','boss');goalBelcatEvent.shotT=.95;goalBelcatEvent.targetId=target.id;goalBelcatEvent.hit=new Set();announce(`💜 보스 벨켓 레이저 → ${target.name}`)}
  }
  if(goalBelcatEvent.shotT>0){
    goalBelcatEvent.shotT=Math.max(0,goalBelcatEvent.shotT-dt);
    const beam=goalBelcatBeam();
    for(const b of balls){
      if(b.landed||b.recorded||goalBelcatEvent.hit.has(b.id))continue;
      if(!isLowerHorizontalBall(b)||b.bossGuard>0)continue;
      if(lineDistance(b.x,b.y,beam.sx,beam.sy,beam.ex,beam.ey)<b.r+15){
        goalBelcatEvent.hit.add(b.id);laserImpact(b.x,b.y);
        const dx=b.x-beam.sx,dy=b.y-beam.sy,d=Math.hypot(dx,dy)||1;
        b.vx=dx/d*2400;b.vy=dy/d*2400;b.knockTime=1.35;b.bossGuard=14;b.hitGuard=.8;
        deformWall('h',b.x,dy<0?-1:1,10);
        shake=Math.max(shake,22);announce(`💜 보스 레이저 · ${b.name} 초강력 넉백!`);
      }
    }
  }
}
const sentries=Array.from({length:6},(_,i)=>({x:HORIZ_START_X+680+Math.floor(i/2)*860,y:HORIZ_CY+(i%2?74:-74),timer:2+i*.9,anim:0,phase:i*1.7}));
const verticalSentries=[560,1000,1580,2340].flatMap((y,j)=>[-1,1].map((side,i)=>({x:side<0?funnelBounds(y).left-20:funnelBounds(y).right+20,y,timer:3+j+i*1.7,anim:0,phase:j*1.4+i,vertical:true})));
function skillKnockback(b,dx,dy,power=720){
  if((b.hitGuard||0)>0)return;
  
  const d=Math.hypot(dx,dy)||1;
  b.vx=dx/d*power;b.vy=dy/d*power;b.knockTime=.72;b.hitGuard=.8;b.slow=0;
  burst(b.x,b.y,'245,140,255',18);shake=Math.max(shake,5);
}
function updateSentries(dt){
  for(const c of [...sentries,...verticalSentries]){
    c.anim=Math.max(0,c.anim-dt);c.timer-=dt;
    if(c.timer>0)continue;
    const candidates=balls.filter(b=>!b.landed&&!b.recorded&&(b.hitGuard||0)<=0&&(c.vertical?b.zone==='vertical'&&Math.abs(b.y-c.y)<280:b.zone==='horizontal'&&Math.abs(b.x-c.x)<350));
    if(!candidates.length){c.timer=.4;continue;}
    const t=candidates[Math.floor(Math.random()*candidates.length)];
    c.anim=.85;c.timer=(5.5+c.phase*.15)/(c.vertical?1.5:1);
    const a=Math.atan2(t.y-c.y,t.x-c.x);emitAttack(c.x,c.y,t.x,t.y,'q',c);
    projectiles.push({type:'q',x:c.x,y:c.y,tx:t.id,life:3,angleOff:0});
  }
}
let staticCanvas=document.createElement('canvas'); staticCanvas.width=WORLD_W; staticCanvas.height=WORLD_H;
let sctx=staticCanvas.getContext('2d');

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rand(a,b){return a+Math.random()*(b-a)}
function wallOffset(kind,pos,side){
  let off=0;
  for(const h of wallHits){
    if(h.kind!==kind||h.side!==side)continue;
    const d=(pos-h.pos)/h.w;
    off+=h.power*Math.exp(-d*d);
  }
  return clamp(off,0,kind==='v'?24:28);
}
function deformWall(kind,pos,side,energy=1){
  const power=clamp(energy,0.7,7);
  wallHits.push({kind,pos,side,power,w:kind==='v'?72:96,age:0});
  if(wallHits.length>80)wallHits.shift();
  burst(kind==='v'?(side<0?funnelBounds(pos).left:funnelBounds(pos).right):pos,kind==='v'?pos:(side<0?HORIZ_CY-TUBE_HALF:HORIZ_CY+TUBE_HALF),'255,185,220',10);
}
function funnelBounds(y){
  if(y>=ELBOW_START_Y)return{left:NECK_L,right:NECK_R};
  const t=clamp(y/ELBOW_START_Y,0,1);
  const full=(PLAY_R-PLAY_L)/2, neck=NECK_W/2;
  const wave=Math.cos(t*Math.PI*6)*54*(1-t*.82);
  const half=clamp(full+(neck-full)*t+wave,neck,full);
  return{left:CX-half-wallOffset('v',y,-1),right:CX+half+wallOffset('v',y,1)}
}
function tubeWave(x,t){const u=clamp((x-HORIZ_START_X)/180,0,1);return Math.sin((x-HORIZ_START_X)/165-t/520)*14*u*u*(3-2*u)}
function horizontalBounds(x,t){
  const wave=tubeWave(x,t);
  return {top:HORIZ_CY-TUBE_HALF+wave-wallOffset('h',x,-1),bot:HORIZ_CY+TUBE_HALF+wave+wallOffset('h',x,1)};
}
function readPlayerCount(commit=false){
  const raw=String(ui.count.value||'').trim();
  const parsed=parseInt(raw,10);
  const n=clamp(Number.isFinite(parsed)?parsed:8,1,50);
  if(commit)ui.count.value=n;
  return n;
}
function playerCount(){return readPlayerCount(false)}
function ballInfo(n){return Array.from({length:n},(_,i)=>({name:`P${i+1}`,color:`hsl(${Math.round(i*360/n)},74%,61%)`}))}
function refreshLegend(){
  const info=ballInfo(playerCount());
  ui.legend.innerHTML=info.map(x=>`<span><i class="dot" style="background:${x.color}"></i>${x.name}</span>`).join('');
  ui.left.textContent=Math.max(0,playerCount()-state.placed);
}
let announceTimeout;function announce(text){clearTimeout(announceTimeout);ui.announce.textContent=text;ui.announce.classList.remove('show');void ui.announce.offsetWidth;ui.announce.classList.add('show');announceTimeout=setTimeout(()=>ui.announce.classList.remove('show'),1800)}
function burst(x,y,c='220,190,255',n=12){
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=rand(50,180);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,age:0,life:rand(.25,.55),c})}
}
function damage(b,amt=1){b.hit=Math.min(30,(b.hit||0)+amt)}
function buildPegs(){
  pegs=[]; const rows=44,gap=62,start=128;
  for(let r=0;r<rows;r++){
    const y=start+r*gap,b=funnelBounds(y),width=b.right-b.left;
    const holes=Math.max(2,Math.round(14*width/(PLAY_R-PLAY_L)));
    const cuts=[];for(let i=0;i<holes;i++)cuts.push(rand(b.left+12,b.right-12));cuts.sort((a,b)=>a-b);
    let cur=b.left+3;
    for(const hx of cuts){const hs=hx-rand(10,15),he=hx+rand(10,15);if(hs-cur>10)pegs.push({x:(cur+hs)/2,y,hw:(hs-cur)/2,hh:3.5});cur=he}
    if(b.right-cur>10)pegs.push({x:(cur+b.right-3)/2,y,hw:(b.right-3-cur)/2,hh:3.5});
  }
}
function nearestPeg(x,y,maxD=70){
  let best=null,bd=maxD;
  for(const p of pegs){const d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=p}}
  return best;
}
function carve(peg,x,w=12){
  if(!peg)return;const idx=pegs.indexOf(peg);if(idx<0)return;
  const a=peg.x-peg.hw,b=peg.x+peg.hw,h1=x-w/2,h2=x+w/2;pegs.splice(idx,1);
  if(h1-a>7)pegs.push({x:(a+h1)/2,y:peg.y,hw:(h1-a)/2,hh:peg.hh});
  if(b-h2>7)pegs.push({x:(h2+b)/2,y:peg.y,hw:(b-h2)/2,hh:peg.hh});
}
function buildStatic(){
  sctx.clearRect(0,0,WORLD_W,WORLD_H);
  const g=sctx.createLinearGradient(0,0,0,WORLD_H);g.addColorStop(0,'#141933');g.addColorStop(.6,'#0d1126');g.addColorStop(1,'#080a15');sctx.fillStyle=g;sctx.fillRect(0,0,WORLD_W,WORLD_H);
  // world-wide stars
  for(let i=0;i<360;i++){const x=Math.random()*WORLD_W,y=Math.random()*WORLD_H,r=Math.random()*1.35+.3;sctx.fillStyle=`rgba(210,220,255,${rand(.12,.55)})`;sctx.beginPath();sctx.arc(x,y,r,0,Math.PI*2);sctx.fill()}

}
buildPegs();

function reset(){attackCues=[];impactCues=[];progressLastUpdate=-1;
  state.mode='PLACEMENT';state.startTs=null;state.elapsed=0;state.cameraX=0;state.cameraY=0;state.finishOrder=[];state.selected=null;state.placed=0;state.dropX=CX;wallHits=[];
  balls=[];bombs=[];particles=[];projectiles=[];laser=null;windmills=[
    {x:CX-45,y:700,a:0.00,s:0.85,hp:100},{x:CX+40,y:920,a:0.47,s:-0.89,hp:100},{x:CX,y:1180,a:0.94,s:0.93,hp:100},{x:CX-45,y:1420,a:1.41,s:-0.97,hp:100},{x:CX+40,y:1700,a:1.88,s:1.01,hp:100},{x:CX,y:1940,a:2.35,s:-1.05,hp:100},{x:CX-45,y:2160,a:2.82,s:1.09,hp:100},{x:CX+40,y:2400,a:3.29,s:-1.13,hp:100},{x:CX,y:2640,a:3.76,s:1.17,hp:100},
  ...([2.78,2.05].map((a,i)=>({x:ELBOW_CX+Math.cos(a)*ELBOW_R,y:ELBOW_CY+Math.sin(a)*ELBOW_R,a:0,s:i?-1.15:1.1,hp:100})))];ufos=[{x:CX,y:1240,t:7}];mushrooms=[];windX=windY=0;windTimer=.6;shake=0;fireTimer=4.5/1.5;qTimer=6;rTimer=12;lightningTimer=7;globalFlash=0;
  walkers=[];walkerTimer=2.2;healer=null;healerTimer=9.0;mole=null;moleTimer=5.5;missiles=[];goalBelcatEvent={active:false,announced:false,t:0,shotTimer:6,shotT:0,hit:new Set()};
lightTimer=7.0;tornadoTimer=11.0;event45Fired=false;event60Fired=false;
[...sentries,...verticalSentries].forEach((c,i)=>{c.timer=(2+i*.9)/(c.vertical?1.5:1);c.anim=0});belcatAnimA=0;belcatAnimB=0;belcatActionA='idle';belcatActionB='idle';
buildPegs();ui.count.disabled=false;ui.start.disabled=false;ui.status.textContent='배치 단계';ui.start.textContent='▶ 레이스 시작';ui.timer.textContent='0.0';ui.board.innerHTML='';
  refreshLegend();updateObstacleButtons();renderSkillChoices();
}
function updateObstacleButtons(){
  const rem=Math.max(0,playerCount()-state.placed);
  ui.left.textContent=rem;
  obstacleBtns.forEach(b=>{b.disabled=state.mode==='RACING'||rem<=0;b.classList.toggle('active',state.selected===b.dataset.type)})
}
obstacleBtns.forEach(b=>b.onclick=()=>{if(b.disabled)return;state.selected=state.selected===b.dataset.type?null:b.dataset.type;updateObstacleButtons()});
ui.count.addEventListener('input',()=>{
  if(state.mode!=='PLACEMENT')return;
  refreshLegend();updateObstacleButtons();renderSkillChoices();
});
ui.count.addEventListener('change',()=>{
  readPlayerCount(true);
  refreshLegend();updateObstacleButtons();renderSkillChoices();
});
ui.reset.onclick=()=>{physicsCarry=0;reset();cameraMode='follow';cameraSnap=true;syncViewButtons()};

function placeObstacle(type,x,y){
  if(state.mode!=='PLACEMENT'||state.placed>=playerCount())return;
  if(y<ELBOW_START_Y){const b=funnelBounds(y);x=clamp(x,b.left+24,b.right-24);y=clamp(y,35,ELBOW_START_Y-20)}
  else{x=clamp(x,HORIZ_START_X+28,FINISH_X-30);y=HORIZ_CY+tubeWave(x,performance.now())}
  if(type==='bomb')bombs.push({x,y,w:Math.random()*6.28,peg:nearestPeg(x,y,85)});
  if(type==='windmill')windmills.push({x,y,a:Math.random()*6.28,s:Math.random()<.5?.8:-.8,hp:100,player:true});
  if(type==='ufo')ufos.push({x,y,t:rand(3,7),player:true});
  if(type==='mushroom')mushrooms.push({x,y,r:7,seed:Math.random()*6.28});
  state.placed++;state.selected=null;burst(x,y,'205,220,255',10);updateObstacleButtons()
}

canvas.addEventListener('click',e=>{
  const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width+state.cameraX,y=(e.clientY-r.top)*VH/r.height+state.cameraY;
  if(state.selected){placeObstacle(state.selected,x,y);return}
  if(state.mode==='PLACEMENT')state.dropX=clamp(x,PLAY_L+45,PLAY_R-45)
});

ui.start.onclick=()=>{
  if(state.mode==='RACING')return;
  if(state.mode==='FINISHED')reset();state.elapsed=0;physicsCarry=0;const n=readPlayerCount(true),info=ballInfo(n);balls=[];state.finishOrder=[];ui.board.innerHTML='';
  const maxPerRow=15,spacing=19;
  for(let i=0;i<n;i++){const row=Math.floor(i/maxPerRow),col=i%maxPerRow,rowN=Math.min(maxPerRow,n-row*maxPerRow),sx=state.dropX-(rowN-1)*spacing/2;
    balls.push({id:i,name:info[i].name,color:info[i].color,x:clamp(sx+col*spacing,PLAY_L+20,PLAY_R-20),y:30+row*19,vx:rand(-25,25),vy:0,r:BASE_R,skill:skillChoices[i]||'magnet',skillTimer:6,magnetTime:0,
      zone:'vertical',landed:false,recorded:false,hit:0,rot:0,freeze:0,burn:0,grow:0,slow:0,stuckT:0,lastProg:30})
  }
  state.mode='RACING';state.startTs=performance.now();ui.count.disabled=true;ui.start.disabled=true;ui.status.textContent='레이스 중';ui.start.textContent='레이스 진행 중';updateObstacleButtons();renderSkillChoices();announce('🏁 레이스 시작!');document.getElementById('raceStart').scrollIntoView({block:'start',behavior:'auto'})
};

function rectColl(b,p){
  const cx=clamp(b.x,p.x-p.hw,p.x+p.hw),cy=clamp(b.y,p.y-p.hh,p.y+p.hh),dx=b.x-cx,dy=b.y-cy,d2=dx*dx+dy*dy;
  if(d2<b.r*b.r){const d=Math.sqrt(d2)||.001;return{nx:dx/d,ny:dy/d,pen:b.r-d}}return null
}
function windmillHit(b,w){
  const len=23*Math.max(0,w.hp/100);
  for(let i=0;i<4;i++){const a=w.a+i*Math.PI/2,c=Math.cos(a),s=Math.sin(a),dx=b.x-w.x,dy=b.y-w.y,lx=dx*c+dy*s,ly=-dx*s+dy*c,
    px=clamp(lx,0,len),py=clamp(ly,-3.5,3.5),ddx=lx-px,ddy=ly-py,d=Math.hypot(ddx,ddy);
    if(d<b.r){const nx=(ddx/d||1)*c-(ddy/d||0)*s,ny=(ddx/d||1)*s+(ddy/d||0)*c,pen=b.r-d;b.x+=nx*pen;b.y+=ny*pen;
      const dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=1.45*dot*nx;b.vy-=1.45*dot*ny}
      b.vx+=-Math.sin(a)*Math.sign(w.s)*100;b.vy+=Math.cos(a)*Math.sign(w.s)*100;
      if(b.r>14&&w.hp>0){w.hp=Math.max(0,w.hp-10);burst(b.x,b.y,'255,180,100',7)}
    }
  }
}
function elbowPhysics(b,dt){
  const dx=b.x-ELBOW_CX,dy=b.y-ELBOW_CY;
  let ang=Math.atan2(dy,dx);
  // 엘보에서 허용되는 각도 범위 밖으로 빠지는 것을 강제로 막음.
  ang=clamp(ang,Math.PI/2,Math.PI);
  const dist=Math.hypot(dx,dy)||1;
  const inner=ELBOW_R-TUBE_HALF+b.r+2;
  const outer=ELBOW_R+TUBE_HALF-b.r-2;
  const targetDist=clamp(dist,inner,outer);
  const nx=Math.cos(ang),ny=Math.sin(ang);

  // 위치를 실제 ㄴ자 곡선 통로 내부로 투영.
  if(Math.abs(dist-targetDist)>0.01 || Math.atan2(dy,dx)!==ang){
    b.x=ELBOW_CX+nx*targetDist;
    b.y=ELBOW_CY+ny*targetDist;
  }

  // 벽 바깥 방향 속도를 제거해 접합부에서 튀어나가는 현상을 억제.
  const radial=b.vx*nx+b.vy*ny;
  if((dist<=inner+4&&radial<0)||(dist>=outer-4&&radial>0)){
    b.vx-=radial*nx*1.55;
    b.vy-=radial*ny*1.55;
  }

  // 엘보 진행 방향의 부드러운 가이드 힘.
  const tx=Math.sin(ang),ty=-Math.cos(ang);
  const guide=state.elapsed%6<2?-220:95;
  b.vx+=tx*guide*dt;
  b.vy+=ty*guide*dt;

  // 수평 통로 입구에 확실히 들어온 뒤에만 horizontal 상태로 전환.
  if(ang<=Math.PI/2+0.07 && b.x>=HORIZ_START_X-8){
    b.zone='horizontal';
    const hb=horizontalBounds(b.x,performance.now()), top=hb.top, bot=hb.bot;
    b.y=clamp(b.y,top+b.r+2,bot-b.r-2);
    b.vx=Math.max(55,Math.abs(b.vx)*.72);
  }
}
function physics(b,dt){
  b.bossGuard=Math.max(0,(b.bossGuard||0)-dt);b.knockTime=Math.max(0,(b.knockTime||0)-dt);b.hitGuard=Math.max(0,(b.hitGuard||0)-dt);
  if(b.landed)return;if(b.falling){b.fallTime=(b.fallTime||0)+dt;if(b.fallTime>=1.15){b.landed=true;b.vx=b.vy=0;}return;}if(b.freeze>0){b.freeze=Math.max(0,b.freeze-dt);b.vx=0;b.vy=0;return}applyMagnet(b,dt);
  if(b.burn>0){b.burn-=dt;b.r=Math.max(4,b.r-.8*dt)}if(b.grow>0){b.grow-=dt;b.r=Math.min(34,b.r+1.2*dt)}
  const slow=b.slow>0?.52:1;if(b.slow>0)b.slow-=dt;
  b.vy+=GRAV*dt*slow;b.vx*=.997;b.vy*=.999;b.x+=b.vx*dt*slow;b.y+=b.vy*dt*slow;

  if(b.zone==='vertical'){
    const bd=funnelBounds(b.y);
    if(b.x-b.r<bd.left){const e=Math.abs(b.vx)/210;b.x=bd.left+b.r;b.vx=Math.abs(b.vx)*WALL_REST;if(e>.85)deformWall('v',b.y,-1,e)}
    if(b.x+b.r>bd.right){const e=Math.abs(b.vx)/210;b.x=bd.right-b.r;b.vx=-Math.abs(b.vx)*WALL_REST;if(e>.85)deformWall('v',b.y,1,e)}
    if(b.y-b.r<2){b.y=2+b.r;b.vy=Math.abs(b.vy)*WALL_REST}
    // only test nearby pegs
    for(const p of pegs){if(Math.abs(p.y-b.y)>18||Math.abs(p.x-b.x)>p.hw+b.r+4)continue;const c=rectColl(b,p);if(c){b.x+=c.nx*c.pen;b.y+=c.ny*c.pen;const dot=b.vx*c.nx+b.vy*c.ny;if(dot<0){b.vx-=1.42*dot*c.nx;b.vy-=1.42*dot*c.ny;b.vx+=rand(-40,40)}}}
    if(b.y>=ELBOW_START_Y-10){
      // 접합부 진입 전 목을 실제 NECK 폭 안으로 한 번 더 조임.
      b.x=clamp(b.x,NECK_L+b.r+3,NECK_R-b.r-3);
      b.zone='elbow';
    }
  }else if(b.zone==='elbow') elbowPhysics(b,dt);
  else{
    const hb=horizontalBounds(b.x,performance.now()),top=hb.top,bot=hb.bot;
    if(b.y-b.r<top){const e=Math.abs(b.vy)/210;b.y=top+b.r;b.vy=Math.abs(b.vy)*WALL_REST;if(e>.85)deformWall('h',b.x,-1,e)}
    if(b.y+b.r>bot){const e=Math.abs(b.vy)/210;b.y=bot-b.r;b.vy=-Math.abs(b.vy)*WALL_REST;if(e>.85)deformWall('h',b.x,1,e)}
    b.vx+=145*dt;b.vy+=Math.sin(performance.now()/520+b.id)*30*dt;
    if(b.x-b.r<HORIZ_START_X-8){
      b.x=HORIZ_START_X-8+b.r;
      b.vx=Math.max(45,Math.abs(b.vx)*.65);
    }
    if(b.x+b.r>GOAL_X){b.x=GOAL_X-b.r;b.vx=-Math.abs(b.vx)*.3}
    if(!b.recorded&&b.x+b.r>=FINISH_X){b.recorded=true;b.falling=true;b.fallTime=0;b.fallX=b.x;b.fallY=b.y;state.finishOrder.push({name:b.name,color:b.color,time:state.elapsed});announce(`${state.finishOrder.length}등 도착 · ${b.name}`);renderBoard()}
    if(b.recorded&&b.x>=GOAL_X-b.r-8){b.landed=true;b.vx=b.vy=0}
  }
  b.vx+=windX*(b.zone==='horizontal'?.65:1.65)*dt;b.vy+=windY*1.65*dt;
  for(const u of ufos){if(u.pullId===b.id&&u.pull>0){const dx=u.x-b.x,dy=u.y-b.y,d=Math.hypot(dx,dy)||1;b.vx+=dx/d*180*dt;b.vy+=dy/d*180*dt}}
  for(let i=bombs.length-1;i>=0;i--){const q=bombs[i],dx=b.x-q.x,dy=b.y-q.y,d=Math.hypot(dx,dy);if(d<b.r+8){const nx=dx/(d||1),ny=dy/(d||1);b.vx=nx*430+rand(-80,80);b.vy=ny*430-120;damage(b);burst(q.x,q.y,'255,130,80',18);carve(q.peg,q.x,10);bombs.splice(i,1);shake=8}}
  for(const m of mushrooms){if(!m.used&&Math.hypot(b.x-m.x,b.y-m.y)<b.r+m.r){m.used=true;b.grow=4;burst(m.x,m.y,'90,230,140',11)}}
  for(const w of windmills)windmillHit(b,w);
  const speedLimit=b.knockTime>0?820:MAX_SPEED;b.vx=clamp(b.vx,-speedLimit,speedLimit);b.vy=clamp(b.vy,-speedLimit,speedLimit);b.rot+=b.vx/(b.r*20)*dt;
  b.stuckT+=dt;if(b.stuckT>1.4){const prog=b.zone==='horizontal'?b.x:b.y;if(prog-b.lastProg<15){b.vx+=rand(-110,110);b.vy+=b.zone==='horizontal'?rand(-80,80):rand(60,110)}b.lastProg=prog;b.stuckT=0}
}
function resolveBalls(){
  const cell=70,grid=new Map();
  for(const b of balls){if(b.landed)continue;const k=`${Math.floor(b.x/cell)},${Math.floor(b.y/cell)}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(b)}
  const seen=new Set();
  for(const b of balls){if(b.landed)continue;const gx=Math.floor(b.x/cell),gy=Math.floor(b.y/cell);
    for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const arr=grid.get(`${gx+ox},${gy+oy}`)||[];
      for(const o of arr){if(o===b||o.landed||b.freeze>0||o.freeze>0)continue;const a=Math.min(b.id,o.id),c=Math.max(b.id,o.id),key=a+':'+c;if(seen.has(key))continue;seen.add(key);
        const dx=o.x-b.x,dy=o.y-b.y,d=Math.hypot(dx,dy),md=b.r+o.r;if(d<md&&d>.001){const nx=dx/d,ny=dy/d,pen=md-d;b.x-=nx*pen/2;b.y-=ny*pen/2;o.x+=nx*pen/2;o.y+=ny*pen/2;
          const rv=(o.vx-b.vx)*nx+(o.vy-b.vy)*ny;if(rv<0){const imp=-rv*.72;b.vx-=imp*nx;b.vy-=imp*ny;o.vx+=imp*nx;o.vy+=imp*ny;if(rv<-65){damage(b);damage(o)}}}
      }
    }}
}
function renderBoard(){
  const medal=['🥇','🥈','🥉'];ui.board.innerHTML=state.finishOrder.map((x,i)=>`<div class="rank"><b>${medal[i]||i+1}</b><i class="dot" style="background:${x.color}"></i><span>${x.name}</span><span class="small">${x.time.toFixed(2)}s</span></div>`).join('')
}
function pickActive(){const a=balls.filter(b=>!b.landed&&!b.recorded);return a.length?a[Math.floor(Math.random()*a.length)]:null}
function pickHorizontalTarget(){
  const a=balls.filter(b=>!b.landed && (b.zone==='horizontal'||b.zone==='elbow'));
  if(!a.length)return null;
  // 앞선 공을 조금 더 자주 노리되 완전 고정 타깃은 아니게 함.
  a.sort((x,y)=>(y.zone==='horizontal'?y.x:0)-(x.zone==='horizontal'?x.x:0));
  const top=Math.min(a.length,Math.max(1,Math.ceil(a.length*.55)));
  return a[Math.floor(Math.random()*top)];
}
function horizontalBallsExist(){
  return balls.some(b=>!b.landed && (b.zone==='horizontal'||b.zone==='elbow'));
}
function triggerFire(){
  const candidates=balls.filter(b=>!b.landed&&!b.recorded&&b.zone==='vertical');
  const t=candidates[Math.floor(Math.random()*candidates.length)];if(!t)return;
  belcatAnimA=.85;belcatActionA='Q';emitAttack(356,1300,t.x,t.y,'q','A');
  for(const off of [-.22,0,.22])projectiles.push({type:'q',x:356,y:1300,tx:t.id,angleOff:off,life:4});
  announce(`💜 벨켓 Q · 플라즈마 분열 → ${t.name}`);
}
function applyLaserHit(b,dx,dy){emitImpact(b.x,b.y,'laser');
  skillKnockback(b,dx,dy,800);
  if(Math.random()<.30){b.r=Math.min(34,b.r*1.35);b.grow=Math.max(b.grow||0,2);burst(b.x,b.y,'255,205,115',16);announce(`🔮 R 변이 · ${b.name} 커져라!`)}
}
function triggerQ(){
  const t=pickHorizontalTarget();if(!t)return;belcatAnimB=.85;belcatActionB='Q';const sx=HORIZ_START_X+95,sy=HORIZ_CY-84;
  emitAttack(sx,sy,t.x,t.y,'q','B');for(const off of [-.22,0,.22])projectiles.push({type:'q',x:sx,y:sy,tx:t.id,angleOff:off,life:3});announce(`💜 벨켓 Q · 플라즈마 분열`)
}
function triggerR(){
  const t=pickHorizontalTarget();if(!t)return;
  belcatAnimB=.85;belcatActionB='R';
  const sx=HORIZ_START_X+120, sy=HORIZ_CY-84;
  emitAttack(sx,sy,t.x,t.y,'laser','B');laser={age:0,life:2.2,x:sx,y:sy,targetId:t.id,angle:Math.atan2(t.y-sy,t.x-sx),locked:false};
  announce(`🔮 벨켓 R 조준 → ${t.name}`);
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life-=dt;const t=balls.find(b=>b.id===p.tx&&!b.landed);if(!t||p.life<=0){projectiles.splice(i,1);continue}
    const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy)||1;
    const angle=Math.atan2(dy,dx)+(p.angleOff||0),speed=p.type==='fire'?430:580;
    const mx=Math.cos(angle)*speed*dt,my=Math.sin(angle)*speed*dt;
    const u=clamp(((t.x-p.x)*mx+(t.y-p.y)*my)/(mx*mx+my*my||1),0,1);
    const hit=Math.hypot(t.x-p.x-mx*u,t.y-p.y-my*u)<t.r+9;
    p.x+=mx;p.y+=my;
    if(hit){emitImpact(t.x,t.y,'q');skillKnockback(t,mx,my,p.type==='fire'?780:720);if(p.type==='fire')t.burn=5;damage(t);projectiles.splice(i,1)}
  }
  if(laser){
    laser.age+=dt;
    const target=balls.find(b=>b.id===laser.targetId&&!b.landed&&(b.zone==='horizontal'||b.zone==='elbow'));
    if(target && laser.age<0.55){
      const desired=Math.atan2(target.y-laser.y,target.x-laser.x);
      let diff=((desired-laser.angle+Math.PI*3)%(Math.PI*2))-Math.PI;
      laser.angle+=diff*Math.min(1,dt*8.5);
    }
    const a=laser.angle,dx=Math.cos(a),dy=Math.sin(a);
    for(const b of balls){
      if(b.landed||!(b.zone==='horizontal'||b.zone==='elbow'))continue;
      const px=b.x-laser.x,py=b.y-laser.y,proj=px*dx+py*dy;
      if(proj<0||proj>650)continue;
      const perp=Math.abs(px*dy-py*dx);
      if(laser.age>=.55&&perp<b.r+8){laser.hits=laser.hits||new Set();if(!laser.hits.has(b.id)){applyLaserHit(b,dx,dy);laser.hits.add(b.id)}}
    }
    if(laser.age>=laser.life)laser=null;
  }
}

// ===== 복원된 맵 캐릭터 / 시간 기믹 =====
const WALKER_SPEED=82, MAX_WALKERS=2;
function startWalker(){
  if(walkers.length>=MAX_WALKERS)return;
  const t=pickActive(); if(!t)return;
  const peg=nearestPeg(t.x,t.y+rand(90,230),180) || pegs[Math.floor(Math.random()*pegs.length)];
  if(!peg)return;
  const fromLeft=Math.random()<.5, targetX=clamp(peg.x,PLAY_L+20,PLAY_R-20);
  walkers.push({x:fromLeft?PLAY_L-28:PLAY_R+28,y:peg.y-11,targetX,dir:fromLeft?1:-1,state:'enter',t:0,peg});
}
function updateWalkers(dt){
  for(let i=walkers.length-1;i>=0;i--){
    const w=walkers[i];w.t+=dt;
    if(w.state==='enter'){w.x+=w.dir*WALKER_SPEED*dt;if((w.dir>0&&w.x>=w.targetX)||(w.dir<0&&w.x<=w.targetX)){w.x=w.targetX;w.state='plant';w.t=0}}
    else if(w.state==='plant'&&w.t>.45){
      if(bombs.length<45){bombs.push({x:w.x,y:w.y-2,w:Math.random()*6.28,peg:w.peg});burst(w.x,w.y,'195,180,150',7)}
      w.state='leave';w.t=0;
    } else if(w.state==='leave'){w.x+=w.dir*WALKER_SPEED*dt;if(w.x<PLAY_L-45||w.x>PLAY_R+45)walkers.splice(i,1)}
  }
}
function drawWalkers(){
  for(const w of walkers){const walk=Math.sin(w.t*12)*2.5;ctx.save();ctx.translate(w.x,w.y);
    if(w.dir<0)ctx.scale(-1,1);ctx.strokeStyle='#584432';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(-3,5);ctx.lineTo(-3+walk,11);ctx.moveTo(3,5);ctx.lineTo(3-walk,11);ctx.stroke();
    ctx.fillStyle='#789657';ctx.beginPath();ctx.ellipse(0,0,7,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#315c33';ctx.beginPath();ctx.moveTo(-8,-5);ctx.lineTo(8,-5);ctx.lineTo(0,-14);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(3,-1,2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#222';ctx.beginPath();ctx.arc(3.5,-1,1,0,Math.PI*2);ctx.fill();ctx.restore()}
}
function startHealer(){
  let target=null;for(const b of balls)if(!b.landed&&b.hit>0&&(!target||b.hit>target.hit))target=b;if(!target)return;
  healer={x:PLAY_L-26,y:clamp(target.y,80,ELBOW_START_Y-40),targetId:target.id,state:'enter',t:0};
}
function updateHealer(dt){
  if(!healer)return;healer.t+=dt;
  const target=balls.find(b=>b.id===healer.targetId&&!b.landed);if(!target){healer=null;return}
  const tx=clamp(target.x-30,PLAY_L+20,PLAY_R-20);
  if(healer.state==='enter'){healer.x+=WALKER_SPEED*dt;if(healer.x>=tx){healer.state='heal';healer.t=0}}
  else if(healer.state==='heal'&&healer.t>.5){target.hit=Math.max(0,target.hit-2);burst(target.x,target.y,'140,255,180',12);healer.state='leave'}
  else if(healer.state==='leave'){healer.x-=WALKER_SPEED*dt;if(healer.x<PLAY_L-40)healer=null}
}
function drawHealer(){
  if(!healer)return;ctx.save();ctx.translate(healer.x,healer.y);ctx.fillStyle='#f6f7ff';ctx.beginPath();ctx.ellipse(0,0,7,8,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ff718a';ctx.fillRect(-1,-8,2,7);ctx.fillRect(-4,-5,8,2);ctx.restore()
}
function startMole(){
  const t=pickActive();if(!t)return;const peg=nearestPeg(t.x,t.y+rand(70,160),170);if(!peg)return;mole={x:peg.x,y:peg.y,peg,state:'rise',t:0}
}
function updateMole(dt){
  if(!mole)return;mole.t+=dt;if(mole.state==='rise'&&mole.t>.3){mole.state='dig';mole.t=0}
  else if(mole.state==='dig'&&mole.t>.45){carve(mole.peg,mole.x,22);burst(mole.x,mole.y,'180,150,120',9);mole.state='sink';mole.t=0}
  else if(mole.state==='sink'&&mole.t>.3)mole=null
}
function drawMole(){
  if(!mole)return;let s=1;if(mole.state==='rise')s=clamp(mole.t/.3,0,1);if(mole.state==='sink')s=1-clamp(mole.t/.3,0,1);
  ctx.save();ctx.translate(mole.x,mole.y);ctx.scale(1,s);ctx.fillStyle='#6f5138';ctx.beginPath();ctx.ellipse(0,-3,7,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff9eb0';ctx.beginPath();ctx.arc(0,-8,1.5,0,Math.PI*2);ctx.fill();ctx.restore()
}
function triggerSkyLight(){
  const t=pickActive();if(!t)return;const blessed=Math.random()<.35;
  t.r=clamp(t.r*(blessed?.72:1.38),4,34);burst(t.x,t.y,blessed?'255,240,150':'205,120,255',15);
  announce(blessed?`✨ 작아져라! ${t.name}`:`🔺 커져라! ${t.name}`);
}
function triggerTornado(){
  const t=pickActive();if(!t)return;const a=Math.random()*Math.PI*2,s=260;t.vx=Math.cos(a)*s;t.vy=Math.sin(a)*s;burst(t.x,t.y,'180,220,255',15);announce(`🌪️ 회오리 → ${t.name}`)
}
function triggerMissiles(){
  missiles=[];for(let i=0;i<10;i++)missiles.push({x:rand(NECK_L+8,NECK_R-8),y:ELBOW_START_Y-15,vy:-240});announce('🚀 90초 기믹 · 미사일 10발!')
}
function updateMissiles(dt){
  for(let i=missiles.length-1;i>=0;i--){const m=missiles[i];m.y+=m.vy*dt;if(m.y<0){missiles.splice(i,1);continue}
    for(const b of balls){if(b.landed)continue;if(Math.hypot(b.x-m.x,b.y-m.y)<b.r+5){b.vy-=300;b.vx+=rand(-90,90);burst(m.x,m.y,'255,190,90',10);missiles.splice(i,1);break}}
  }
}
function drawMissiles(){
  for(const m of missiles){ctx.save();ctx.translate(m.x,m.y);ctx.fillStyle='#ff654a';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(4,6);ctx.lineTo(-4,6);ctx.closePath();ctx.fill();ctx.fillStyle='#ffd36b';ctx.fillRect(-2,6,4,7);ctx.restore()}
}

function updateEvents(dt){
  if(state.mode!=='RACING')return;
  updateSentries(dt);fireTimer-=dt;qTimer-=dt;rTimer-=dt;lightningTimer-=dt;lightTimer-=dt;tornadoTimer-=dt;
  walkerTimer-=dt;healerTimer-=dt;moleTimer-=dt;
  if(fireTimer<=0){fireTimer=14/1.5;triggerFire()}
  if(qTimer<=0){qTimer=horizontalBallsExist()?7:1.0;if(horizontalBallsExist())triggerQ()}
  if(rTimer<=0){rTimer=horizontalBallsExist()?18:1.0;if(horizontalBallsExist())triggerR()}
  if(lightningTimer<=0){lightningTimer=8;const t=pickActive();if(t){t.vy-=220;t.vx+=rand(-150,150);damage(t);burst(t.x,t.y,'220,240,255',15);shake=6;announce(`⚡ 낙뢰 → ${t.name}`)}}
  if(lightTimer<=0){lightTimer=10;triggerSkyLight()}
  if(tornadoTimer<=0){tornadoTimer=13;triggerTornado()}
  if(walkerTimer<=0){walkerTimer=2.4;startWalker()}
  if(healerTimer<=0){healerTimer=10;startHealer()}
  if(moleTimer<=0){moleTimer=7;startMole()}
  updateWalkers(dt);updateHealer(dt);updateMole(dt);
  for(const u of ufos){u.t-=dt;if(u.pull>0)u.pull-=dt;if(u.t<=0){u.t=10;const t=pickActive();if(t){u.pullId=t.id;u.pull=1.2}}}
  if(!event45Fired&&state.elapsed>=90){event45Fired=true;triggerMissiles()}
  if(!event60Fired&&state.elapsed>=120){event60Fired=true;globalFlash=1.0;for(const b of balls)if(!b.landed)b.r=Math.max(4,b.r*.5);announce('🟣 120초 기믹 · 모든 공 절반 크기')}
  updateMissiles(dt);
}
function updateWind(dt){
  windTimer-=dt;if(windTimer<=0){windTimer=rand(.7,1.3);const a=Math.random()*Math.PI*2,m=rand(0,145);windX=Math.cos(a)*m;windY=Math.sin(a)*m}
  const m=Math.hypot(windX,windY);ui.wind.textContent=m<12?'💨 고요':`💨 ${windX>0?'→':'←'} ${'▮'.repeat(Math.max(1,Math.round(m/35)))}`
}
function updateCamera(dt){
  if(goalBelcatEvent.active&&goalBelcatEvent.t<4.2){
    const pos=goalBelcatPos();
    const tx=clamp(pos.x-W*.58,0,WORLD_W-W), ty=clamp(pos.y-VH*.52,0,WORLD_H-VH);
    state.cameraX+=(tx-state.cameraX)*Math.min(1,dt*4.6);state.cameraY+=(ty-state.cameraY)*Math.min(1,dt*4.6);
    return;
  }
  let leader=null;for(const b of balls){if(b.landed)continue;if(!leader||((b.zone==='horizontal'?(ELBOW_START_Y+ELBOW_R-HORIZ_START_X)+b.x:b.y)>(leader.zone==='horizontal'?(ELBOW_START_Y+ELBOW_R-HORIZ_START_X)+leader.x:leader.y)))leader=b}
  let tx=0,ty=0;if(leader){if(leader.zone==='horizontal'){tx=leader.x-W*.33;ty=HORIZ_CY-VH*.56}else{ty=leader.y-VH*.38}}
  state.cameraX+= (clamp(tx,0,WORLD_W-W)-state.cameraX)*Math.min(1,dt*3.5);state.cameraY+=(clamp(ty,0,WORLD_H-VH)-state.cameraY)*Math.min(1,dt*3.5)
}
// Each appendage and facial feature is drawn independently; no flat sprite.
function drawBelcat(x,y,scale=.28,flip=false,role='A',ts=0,actor=null){
  if(x<state.cameraX-100||x>state.cameraX+W+100||y<state.cameraY-100||y>state.cameraY+VH+100)return;
  const t=ts/1000+(actor?actor.phase:role==='A'?0:1.4);
  const anim=actor?actor.anim:role==='A'?belcatAnimA:belcatAnimB;
  const charge=anim>0?Math.sin((1-anim/.85)*Math.PI):0;
  const target=balls.filter(b=>!b.landed).reduce((best,b)=>!best||Math.hypot(b.x-x,b.y-y)<Math.hypot(best.x-x,best.y-y)?b:best,null);
  const aim=target?Math.atan2(target.y-y,target.x-x):Math.PI/2;
  ctx.save();ctx.translate(x-Math.cos(aim)*charge*6,y+Math.sin(t*2.8)*4-Math.sin(aim)*charge*6);ctx.scale(scale/.5,scale/.5);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(let i=0;i<5;i++){
    const side=i%2?-1:1, rootX=side*15,rootY=-9+i*6;
    const endX=side*(40+9*Math.sin(t*3+i)),endY=22+20*Math.cos(t*2.5+i);
    ctx.beginPath();ctx.moveTo(rootX,rootY);ctx.bezierCurveTo(side*(46+charge*9),-40+12*Math.sin(t*3+i),side*12,55+12*Math.cos(t*2+i),endX,endY);
    ctx.strokeStyle='#532579';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#c160ed';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#ffb2f4';ctx.beginPath();ctx.moveTo(endX,endY-6);ctx.lineTo(endX+4,endY);ctx.lineTo(endX,endY+6);ctx.lineTo(endX-4,endY);ctx.closePath();ctx.fill();
  }
  ctx.save();ctx.rotate(Math.sin(t*2)*.09);ctx.scale(1+Math.sin(t*3)*.035+charge*.08,1-Math.sin(t*3)*.035);
  const g=ctx.createRadialGradient(-8,-10,2,0,0,30);g.addColorStop(0,'#c45dde');g.addColorStop(1,'#301448');ctx.fillStyle=g;
  ctx.beginPath();ctx.ellipse(0,0,25,27,0,0,Math.PI*2);ctx.fill();
  for(const side of [-1,1]){ctx.save();ctx.translate(side*17,-18);ctx.rotate(side*(.15+Math.sin(t*3.2+side)*.12));ctx.fillStyle='#a04ac7';ctx.strokeStyle='#ed97ef';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-8,4);ctx.lineTo(side*6,-16);ctx.lineTo(9,6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9+t*.12;ctx.save();ctx.rotate(a);ctx.fillStyle=i%2?'#c99753':'#f3d293';ctx.beginPath();ctx.moveTo(20,-5);ctx.lineTo(29,0);ctx.lineTo(20,5);ctx.closePath();ctx.fill();ctx.restore();}
  const blink=(t%4.1)>3.88?Math.max(.08,Math.abs((t%4.1)-3.99)/.11):1;
  ctx.save();ctx.scale(1,blink);ctx.fillStyle='#f6b0ff';ctx.beginPath();ctx.ellipse(0,0,15,12,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#631484';ctx.beginPath();ctx.ellipse(Math.cos(aim)*4,Math.sin(aim)*3,7+charge*2,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-3+Math.cos(aim)*4,-4+Math.sin(aim)*3,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.restore();
  if(charge>0){ctx.strokeStyle=`rgba(255,170,255,${charge})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(Math.cos(aim)*21,Math.sin(aim)*21,5+charge*10,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
function drawGoalBelcatEvent(ts){
  if(!goalBelcatEvent.active)return;
  const t=goalBelcatEvent.t, pos=goalBelcatPos(), x=pos.x, y=pos.y;
  const firing=goalBelcatEvent.shotT>0;
  const charge=!firing&&t>=4.2&&goalBelcatEvent.shotTimer<1.2;
  drawBelcat(x,y,.72,true,'G',ts,{phase:3.3,anim:(firing||charge) ? .85 : 0});
  ctx.save();
  if(firing||charge){
    const p=firing?1:clamp((1.2-goalBelcatEvent.shotTimer)/1.2,0,1);
    const {sx,sy,ex,ey}=goalBelcatBeam();
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=`rgba(255,110,255,${.35+.55*p})`;ctx.lineWidth=firing?18:8+8*p;
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.strokeStyle=`rgba(255,235,255,${.45+.45*p})`;ctx.lineWidth=firing?5:2+3*p;
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
    for(let i=0;i<5;i++){
      const u=(i*.21+ts/820)%1, lx=sx+(ex-sx)*u, ly=sy+(ey-sy)*u;
      ctx.fillStyle=`rgba(255,170,255,${.3+.3*Math.sin(ts/120+i)})`;
      ctx.beginPath();ctx.arc(lx,ly,2+i%2,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.restore();
  ctx.fillStyle='#ffd5ff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';
  ctx.fillText(firing?'보스 레이저!':'보스 몬스터 등장',x-6,y-94);
}
function drawTopEffects(){
  for(const p of particles){
    if(!p.top)continue;
    const alpha=1-p.age/p.life;
    if(p.flash){
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*(1+p.age/p.life));
      g.addColorStop(0,`rgba(${p.c},${alpha*.8})`);g.addColorStop(1,`rgba(${p.c},0)`);
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1+p.age/p.life),0,Math.PI*2);ctx.fill();
    }else if(p.ring){
      ctx.strokeStyle=`rgba(${p.c},${alpha})`;ctx.lineWidth=4+alpha*8;ctx.beginPath();ctx.arc(p.x,p.y,p.r+p.age/p.life*46,0,Math.PI*2);ctx.stroke();
    }
  }
}
function drawPegs(){
  for(const p of pegs){
    if(p.y<state.cameraY-12||p.y>state.cameraY+VH+12)continue;
    const g=ctx.createLinearGradient(0,p.y-p.hh,0,p.y+p.hh);g.addColorStop(0,'#ffd0dc');g.addColorStop(.45,'#d28ba7');g.addColorStop(1,'#854969');
    ctx.fillStyle=g;ctx.strokeStyle='#eeb5ca';ctx.lineWidth=.8;ctx.beginPath();ctx.roundRect(p.x-p.hw,p.y-p.hh,p.hw*2,p.hh*2,Math.min(3,p.hh));ctx.fill();ctx.stroke();
  }
}
function drawObstacles(ts){
  for(const q of bombs){const bob=Math.sin(ts/260+q.w)*1.2;ctx.fillStyle='#c259d5';ctx.beginPath();ctx.arc(q.x,q.y+bob,7,Math.PI,0);ctx.fill();ctx.fillStyle='#fff0d8';ctx.fillRect(q.x-1.5,q.y+bob,3,5)}
  for(const m of mushrooms){if(m.used)continue;ctx.fillStyle='#45d996';ctx.beginPath();ctx.arc(m.x,m.y-4+Math.sin(ts/500+m.seed),7,Math.PI,0);ctx.fill();ctx.fillStyle='#e5f5de';ctx.fillRect(m.x-2,m.y-4,4,7)}
  for(const w of windmills){ctx.save();ctx.translate(w.x,w.y);for(let i=0;i<4;i++){ctx.save();ctx.rotate(w.a+i*Math.PI/2);ctx.fillStyle=w.hp>30?'#ffd66b':'#8c6241';ctx.fillRect(0,-3.5,23*w.hp/100,7);ctx.restore()}ctx.fillStyle='#6d78bf';ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.restore()}
  for(const u of ufos){ctx.save();ctx.translate(u.x,u.y+Math.sin(ts/480+u.x)*3);ctx.fillStyle='#8fa3ff';ctx.beginPath();ctx.ellipse(0,0,20,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d5ecff';ctx.beginPath();ctx.ellipse(0,-5,9,6,0,Math.PI,0);ctx.fill();ctx.restore()}
}
function drawElbowDynamic(ts){
  // One closed silhouette, one material, no strokes across the two joints.
  const outer=[],inner=[];
  for(let y=0;y<ELBOW_START_Y;y+=8){const b=funnelBounds(y);outer.push([b.left,y]);inner.push([b.right,y]);}
  outer.push([NECK_L,ELBOW_START_Y]);inner.push([NECK_R,ELBOW_START_Y]);
  for(let i=1;i<=32;i++){const a=Math.PI-i/32*Math.PI/2;outer.push([ELBOW_CX+Math.cos(a)*(ELBOW_R+TUBE_HALF),ELBOW_CY+Math.sin(a)*(ELBOW_R+TUBE_HALF)]);inner.push([ELBOW_CX+Math.cos(a)*(ELBOW_R-TUBE_HALF),ELBOW_CY+Math.sin(a)*(ELBOW_R-TUBE_HALF)]);}
  for(let x=HORIZ_START_X+8;x<GOAL_X;x+=8){const hb=horizontalBounds(x,ts);outer.push([x,hb.bot]);inner.push([x,hb.top]);}
  {const hb=horizontalBounds(GOAL_X,ts);outer.push([GOAL_X,hb.bot]);inner.push([GOAL_X,hb.top]);}
  ctx.save();ctx.beginPath();outer.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));[...inner].reverse().forEach(([x,y])=>ctx.lineTo(x,y));ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,WORLD_H);g.addColorStop(0,'#bc7186');g.addColorStop(.65,'#ac5c76');g.addColorStop(1,'#a05270');ctx.fillStyle=g;ctx.fill();
  ctx.strokeStyle='rgba(255,192,207,.55)';ctx.lineWidth=2;
  for(const edge of [outer,inner]){ctx.beginPath();edge.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  ctx.restore();
}
function drawFinish(ts){
  const y=HORIZ_CY+tubeWave(FINISH_X,ts), hb=horizontalBounds(FINISH_X,ts);for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#202033':'#fff';ctx.fillRect(FINISH_X-8,hb.top+i*((hb.bot-hb.top)/10),16,(hb.bot-hb.top)/10)}
  ctx.fillStyle='rgba(255,215,100,.14)';ctx.fillRect(FINISH_X+8,hb.top,GOAL_X-FINISH_X-8,hb.bot-hb.top);
  ctx.fillStyle='#ffd86a';ctx.font='24px sans-serif';ctx.fillText('🏆',(FINISH_X+GOAL_X)/2-14,y+8)
}
function drawProjectiles(){
  for(const p of projectiles){const c=p.type==='fire'?'255,120,40':'220,90,255',r=p.type==='fire'?9:7,g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*2.3);g.addColorStop(0,`rgba(${c},1)`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r*2.3,0,Math.PI*2);ctx.fill()}
  if(laser){const a=laser.angle,x2=laser.x+Math.cos(a)*650,y2=laser.y+Math.sin(a)*650;ctx.strokeStyle='rgba(240,120,255,.18)';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(laser.x,laser.y);ctx.lineTo(x2,y2);ctx.stroke();ctx.strokeStyle='rgba(255,210,255,.82)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(laser.x,laser.y);ctx.lineTo(x2,y2);ctx.stroke()}
}
function drawBall(b){
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);const t=Math.min(1,b.hit/30);ctx.beginPath();if(t<.05)ctx.arc(0,0,b.r,0,Math.PI*2);else{const sides=10;for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,r=b.r*(1-t*.25+(i%2?t*.15:0));i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath()}
  ctx.fillStyle=b.color;ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=4;ctx.fill();ctx.strokeStyle=t>.2?'#ff6952':'rgba(255,255,255,.9)';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
  if(b.burn>0){ctx.strokeStyle='rgba(255,130,40,.8)';ctx.beginPath();ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2);ctx.stroke()}
  if(b.knockTime>0){ctx.strokeStyle='rgba(255,190,255,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.035,b.y-b.vy*.035);ctx.stroke();}
  if(b.slow>0){ctx.strokeStyle='rgba(215,120,255,.7)';ctx.beginPath();ctx.arc(b.x,b.y,b.r+3,0,Math.PI*2);ctx.stroke()}
  ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=3;ctx.strokeText(b.name,b.x,b.y-b.r-6);ctx.fillStyle='#fff';ctx.fillText(b.name,b.x,b.y-b.r-6)
}
function drawLegacy(ts){
  ctx.clearRect(0,0,W,VH);ctx.save();if(shake>.1)ctx.translate(rand(-shake/2,shake/2),rand(-shake/2,shake/2));ctx.translate(-state.cameraX,-state.cameraY);
  // static background + base tunnel
  ctx.drawImage(staticCanvas,0,0);
  drawElbowDynamic(ts);drawPegs();drawObstacles(ts);drawWalkers();drawHealer();drawMole();drawMissiles();drawFinish(ts);
  // Belcat A replaces old Shiba, Belcat B controls the L-corner with Q/R
  drawBelcat(356,650,.25,false,'A',ts);
  drawBelcat(HORIZ_START_X+98,HORIZ_CY-88,.22,true,'B',ts);
  drawGoalBelcatEvent(ts);
  for(const c of [...sentries,...verticalSentries])drawBelcat(c.x,c.y,.25,false,'C',ts,c);
  drawProjectiles();
  for(const p of particles){
    const alpha=1-p.age/p.life;
    if(p.ring){
      ctx.strokeStyle=`rgba(${p.c},${alpha})`;ctx.lineWidth=2+alpha*4;ctx.beginPath();ctx.arc(p.x,p.y,p.r+p.age/p.life*30,0,Math.PI*2);ctx.stroke();
    }else{
      ctx.fillStyle=`rgba(${p.c},${alpha})`;ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill();
    }
  }
  for(const b of balls)drawBall(b);drawSkillEffects();drawTopEffects();
  if(state.mode==='PLACEMENT'&&!balls.length){const n=playerCount(),info=ballInfo(n),max=15,sp=19;ctx.globalAlpha=.48;for(let i=0;i<n;i++){const row=Math.floor(i/max),col=i%max,rowN=Math.min(max,n-row*max),sx=state.dropX-(rowN-1)*sp/2,x=clamp(sx+col*sp,PLAY_L+20,PLAY_R-20),y=30+row*19;ctx.fillStyle=info[i].color;ctx.beginPath();ctx.arc(x,y,BASE_R,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
  if(globalFlash>0){ctx.fillStyle=`rgba(180,80,255,${globalFlash*.28})`;ctx.fillRect(0,0,WORLD_W,WORLD_H)}
  ctx.restore()
}
function tick(ts){
  const dt=Math.min(.05,(ts-lastTs)/1000)*SIMULATION_RATE;lastTs=ts;updateCamera(dt);updateWind(dt);
  for(const p of particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.94;p.vy*=.94}particles=particles.filter(p=>p.age<p.life);
  if(shake>0)shake=Math.max(0,shake-dt*16);if(globalFlash>0)globalFlash=Math.max(.001,globalFlash-dt);
  if(belcatAnimA>0){belcatAnimA=Math.max(0,belcatAnimA-dt);if(belcatAnimA===0)belcatActionA='idle'}
  if(belcatAnimB>0){belcatAnimB=Math.max(0,belcatAnimB-dt);if(belcatAnimB===0)belcatActionB='idle'}
  if(state.mode==='RACING'){
    state.elapsed+=dt;ui.timer.textContent=state.elapsed.toFixed(1);updateEvents(dt);updateProjectiles(dt);updatePlayerSkills(dt);updateGoalBelcatEvent(dt);
    for(const u of ufos)if(u.pull>0)u.pull-=dt;
    for(const w of windmills)w.a+=w.s*dt*(.25+.75*w.hp/100);
    physicsCarry+=dt;while(physicsCarry>=1/120){for(const b of balls){b.prevX=b.x;b.prevY=b.y;physics(b,1/120)}resolveBalls();physicsCarry-=1/120}
    if(balls.length&&balls.every(b=>b.landed)){state.mode='FINISHED';ui.status.textContent='게임 종료';ui.start.textContent='다시 달리기';ui.start.disabled=false;announce(`🏁 우승 ${state.finishOrder[0]?.name||''}`)}
  }
  draw(ts);requestAnimationFrame(tick)
}


// 3D presentation shares the v16 simulation coordinates. Physics remains planar.
const stage=document.getElementById('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#ddc7a4');scene.fog=new THREE.Fog('#ddc7a4',160,280);
const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,250);const cameraTarget=new THREE.Vector3(0,3,7),cameraOffset=new THREE.Vector3(-4,23,20);
let cameraMode='follow',cameraSnap=true,zoomFactor=1,viewSpan=20,lastDraw=performance.now(),qualityHigh=true;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
scene.add(new THREE.HemisphereLight(0xfff8e8,0x9778a4,1.75));const sun=new THREE.DirectionalLight(0xffefd8,2.35);sun.position.set(-18,45,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:.1,far:180});sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;sun.shadow.radius=3;scene.add(sun);scene.add(new THREE.AmbientLight(0xffffff,.22));
const S=.022;
function heightAt(y){return .12}function groundBend(y){return y<ELBOW_START_Y?Math.sin(y/270)*1.15*Math.pow(Math.sin(Math.PI*clamp(y/ELBOW_START_Y,0,1)),2):0}
function world(x,y,lift=0){return new THREE.Vector3((x-CX)*S+groundBend(y),heightAt(y)+lift,y*S)}
const mats=new Map();function mat(color,roughness=.52,metalness=0){const key=color+':'+roughness+':'+metalness;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));return mats.get(key)}
const geo={ball:new THREE.SphereGeometry(1,20,14),smallBall:new THREE.SphereGeometry(1,12,8),box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,12),cone:new THREE.ConeGeometry(1,1,12),ring:new THREE.TorusGeometry(1,.09,6,24),smile:new THREE.TorusGeometry(.14,.028,5,12,Math.PI)};
function mesh(g,m,parent=scene){const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function box(parent,color,x,y,z,w,h,d){const o=mesh(geo.box,mat(color),parent);o.position.set(x,y,z);o.scale.set(w,h,d);return o}
function sphere(parent,color,x,y,z,r){const o=mesh(geo.smallBall,mat(color),parent);o.position.set(x,y,z);o.scale.setScalar(r);return o}
function cyl(parent,color,x,y,z,r,h){const o=mesh(geo.cylinder,mat(color),parent);o.position.set(x,y,z);o.scale.set(r,h,r);return o}
function label(text,size=.6,color='#614b3c',bg=''){const c=document.createElement('canvas');c.width=512;c.height=128;const ct=c.getContext('2d');if(bg){ct.fillStyle=bg;ct.beginPath();ct.roundRect(5,5,502,118,25);ct.fill()}ct.font='800 52px system-ui,sans-serif';ct.textAlign='center';ct.textBaseline='middle';ct.fillStyle=color;ct.fillText(text,256,66,480);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const m=new THREE.SpriteMaterial({map:tex,depthTest:true,toneMapped:false});const sp=new THREE.Sprite(m);sp.scale.set(size*4,size,1);sp.renderOrder=3;return sp}
// Seamless procedural maple: no network-dependent image assets.
const woodCanvas=document.createElement('canvas');woodCanvas.width=1024;woodCanvas.height=1024;const wc=woodCanvas.getContext('2d');let seed=731;function rng(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
for(let i=0;i<8;i++){const y=i*128;wc.fillStyle=i%2?'#ceb083':'#dfc291';wc.fillRect(0,y,1024,128);for(let j=0;j<110;j++){wc.strokeStyle=`rgba(128,89,49,${.018+rng()*.04})`;wc.lineWidth=.5+rng();const gy=y+rng()*126;wc.beginPath();wc.moveTo(0,gy);for(let x=0;x<=1024;x+=32)wc.lineTo(x,gy+Math.sin(x/90+j)*1.5);wc.stroke()}wc.fillStyle='#b7956b';wc.fillRect(0,y,1024,1);const joint=(i%3)*341;wc.fillRect(joint,y,1,128)}
// Continuous sand terrain with a real opening, no bridge or supports.
const holeCentre=world(FINISH_X+36,HORIZ_CY),holeRadius=1.18;
const terrainShape=new THREE.Shape();terrainShape.moveTo(-75,-45);terrainShape.lineTo(130,-45);terrainShape.lineTo(130,135);terrainShape.lineTo(-75,135);terrainShape.closePath();const opening=new THREE.Path();opening.absarc(holeCentre.x,holeCentre.z,holeRadius,0,Math.PI*2,true);terrainShape.holes.push(opening);
const terrainGeo=new THREE.ShapeGeometry(terrainShape,64);terrainGeo.rotateX(Math.PI/2);const table=mesh(terrainGeo,mat('#e3bd7c',.95));table.position.y=.085;table.material.side=THREE.DoubleSide;table.castShadow=false;wc.fillStyle='#e5c891';wc.fillRect(0,0,1024,1024);for(let i=0;i<14000;i++){wc.fillStyle=i%2?'#d8b87b':'#ebd4a4';wc.globalAlpha=.15;wc.fillRect(rng()*1024,rng()*1024,1+rng()*3,1+rng()*3)}wc.globalAlpha=1;const sand=new THREE.CanvasTexture(woodCanvas);sand.wrapS=sand.wrapT=THREE.RepeatWrapping;sand.repeat.set(18,18);sand.colorSpace=THREE.SRGBColorSpace;table.material=new THREE.MeshStandardMaterial({color:'#ffffff',map:sand,roughness:.95,side:THREE.DoubleSide});
const shaft=mesh(new THREE.CylinderGeometry(holeRadius,holeRadius*.82,7,48,1,true),mat('#53266c',.8));shaft.material.side=THREE.DoubleSide;shaft.position.set(holeCentre.x,-3.42,holeCentre.z);shaft.castShadow=false;
const abyss=mesh(new THREE.CircleGeometry(holeRadius*.83,48),new THREE.MeshBasicMaterial({color:'#120c23'}));abyss.rotation.x=-Math.PI/2;abyss.position.set(holeCentre.x,-6.9,holeCentre.z);
const lip=mesh(new THREE.TorusGeometry(holeRadius,.10,8,48),mat('#b983dc'));lip.rotation.x=Math.PI/2;lip.position.copy(holeCentre);lip.position.y=.14;
const fallStreaks=new THREE.InstancedMesh(geo.cylinder,new THREE.MeshBasicMaterial({color:'#e5c9ff',transparent:true,opacity:.32,depthWrite:false,toneMapped:false}),14);fallStreaks.castShadow=false;fallStreaks.frustumCulled=false;scene.add(fallStreaks);function updateFallStreaks(t){fallStreaks.visible=balls.some(b=>b.falling&&!b.landed);if(!fallStreaks.visible)return;for(let i=0;i<14;i++){const a=i*2.399,r=.38+(i%3)*.20;dummy.position.set(holeCentre.x+Math.cos(a)*r,-((t*3+i*.43)%4.5),holeCentre.z+Math.sin(a)*r);dummy.rotation.set(0,0,0);dummy.scale.set(.012,.65+(i%4)*.3,.012);dummy.updateMatrix();fallStreaks.setMatrixAt(i,dummy.matrix)}fallStreaks.instanceMatrix.needsUpdate=true;}
// Ribbon floor and flexible rails match the collision bounds every frame.
const samples=[];for(let i=0;i<=160;i++)samples.push({kind:'v',y:i/160*ELBOW_START_Y});for(let i=1;i<=22;i++)samples.push({kind:'e',a:Math.PI-i/22*Math.PI/2});for(let i=1;i<=280;i++)samples.push({kind:'h',x:HORIZ_START_X+i/280*(GOAL_X-HORIZ_START_X)});
const floorPositions=new Float32Array(samples.length*2*3),indices=[];for(let i=0;i<samples.length-1;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3)}const floorGeo=new THREE.BufferGeometry();floorGeo.setAttribute('position',new THREE.BufferAttribute(floorPositions,3).setUsage(THREE.DynamicDrawUsage));floorGeo.setIndex(indices);const floorMesh=mesh(floorGeo,mat('#f4dfb2'));floorMesh.material.side=THREE.DoubleSide;floorMesh.castShadow=false;floorMesh.visible=false;
const rails=new THREE.InstancedMesh(geo.box,mat('#ffffff'),(samples.length-1)*2);rails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);rails.castShadow=true;rails.receiveShadow=true;rails.frustumCulled=false;scene.add(rails);const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);let trackSides=[];
function trackPoints(s,ts){if(s.kind==='v'){const b=funnelBounds(s.y);return[world(b.left,s.y),world(b.right,s.y)]}if(s.kind==='e'){return[world(ELBOW_CX+Math.cos(s.a)*(ELBOW_R-TUBE_HALF),ELBOW_CY+Math.sin(s.a)*(ELBOW_R-TUBE_HALF)),world(ELBOW_CX+Math.cos(s.a)*(ELBOW_R+TUBE_HALF),ELBOW_CY+Math.sin(s.a)*(ELBOW_R+TUBE_HALF))]}const b=horizontalBounds(s.x,ts);return[world(s.x,b.top),world(s.x,b.bot)]}
function updateTrack(ts){trackSides=samples.map(s=>trackPoints(s,ts));for(let i=0;i<samples.length;i++)for(let j=0;j<2;j++)trackSides[i][j].toArray(floorPositions,(i*2+j)*3);floorGeo.attributes.position.needsUpdate=true;floorGeo.computeVertexNormals();floorGeo.computeBoundingSphere();for(let i=0;i<samples.length-1;i++)for(let j=0;j<2;j++){const a=trackSides[i][j],b=trackSides[i+1][j],delta=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.position.y+=.16;dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());dummy.scale.set(.10,delta.length()+.025,.32);dummy.updateMatrix();if(samples[i].kind==='h'&&samples[i].x>FINISH_X-35)dummy.scale.set(0,0,0);dummy.updateMatrix();rails.setMatrixAt(i*2+j,dummy.matrix);rails.setColorAt(i*2+j,new THREE.Color('#a66cd3'))}rails.instanceMatrix.needsUpdate=true;if(rails.instanceColor)rails.instanceColor.needsUpdate=true;}
// Pegs are instanced; carving in the original simulation updates their width.
const pegMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),mat('#9a87ae',.85),700);pegMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);pegMesh.castShadow=true;pegMesh.receiveShadow=true;pegMesh.frustumCulled=false;scene.add(pegMesh);
function updatePegs(){pegMesh.count=Math.min(700,pegs.length);for(let i=0;i<pegMesh.count;i++){const p=pegs[i];dummy.position.copy(world(p.x,p.y,.105));dummy.rotation.set(0,0,0);dummy.scale.set(p.hw*S,.20,p.hh*S*1.7);dummy.updateMatrix();pegMesh.setMatrixAt(i,dummy.matrix)}pegMesh.instanceMatrix.needsUpdate=true;}
const startGate=new THREE.Group();scene.add(startGate);startGate.position.copy(world(CX,2));box(startGate,'#a98dc5',-3.6,.8,0,.18,1.6,.18);box(startGate,'#a98dc5',3.6,.8,0,.18,1.6,.18);box(startGate,'#bea3da',0,1.62,0,7.4,.28,.18);const startLabel=label('LITTLE RACE',.45,'#6e4d8e','#fff8ec');startLabel.position.set(0,2.15,0);startGate.add(startLabel);
const finish=new THREE.Group();scene.add(finish);for(let i=0;i<10;i++)box(finish,i%2?'#685a76':'#fffaf0',0,.018,(i-4.5)*.18,.34,.03,.18);box(finish,'#ecb26d',0,1,-1.05,.13,2,.13);box(finish,'#ecb26d',0,1,1.05,.13,2,.13);box(finish,'#ffe1a0',0,2.02,0,.16,.23,2.25);const goalLabel=label('☕ FINISH',.48,'#7b5938','#fff7d9');goalLabel.position.set(0,2.6,0);finish.add(goalLabel);
function plant(x,z,scale=1){const g=new THREE.Group();scene.add(g);g.position.set(x,0,z);g.scale.setScalar(scale);cyl(g,'#d49c78',0,.3,0,.35,.6);for(let i=0;i<5;i++){const a=i*1.256;const l=sphere(g,'#92af85',Math.cos(a)*.23,.85+i*.06,Math.sin(a)*.23,.23);l.scale.set(.20,.6,.16);l.rotation.z=Math.cos(a)*.5}return g}
for(let i=0;i<24;i++){const y=130+i*110,p=world(i%2?PLAY_L-65:PLAY_R+65,y);plant(p.x,p.z,.35+(i%3)*.1)}for(let i=0;i<30;i++){const x=HORIZ_START_X+100+i*98,p=world(x,HORIZ_CY+(i%2?90:-90));plant(p.x,p.z,.30+(i%3)*.12);const rock=mesh(new THREE.IcosahedronGeometry(.25+(i%4)*.07,0),mat('#9a87ae',.9));rock.position.copy(world(x+35,HORIZ_CY+(i%2?75:-75),.20));}
function coffee(x,z){const g=new THREE.Group();scene.add(g);g.position.set(x,.02,z);cyl(g,'#fdf7e7',0,.07,0,.9,.14);cyl(g,'#fff9ec',0,.48,0,.48,.72);cyl(g,'#624b3e',0,.849,0,.405,.025);const handle=mesh(geo.ring,mat('#fff9ec'),g);handle.position.set(.5,.55,0);handle.rotation.y=Math.PI/2;handle.scale.setScalar(.3);const sign=label('COFFEE BREAK',.28,'#8c7359');sign.position.set(0,1.6,0);g.add(sign)}
// Procedural articulated Belcat: floating body, blinking iris and flexible tentacle chains.
function belcat(){const g=new THREE.Group(),body=new THREE.Group();g.add(body);const head=sphere(body,'#8c4cbb',0,.95,0,.53);head.scale.set(.55,.43,.48);sphere(body,'#fff2ff',0,.99,.46,.25);const iris=sphere(body,'#572082',0,1.01,.67,.13);sphere(body,'#fffaf8',-.04,1.07,.78,.045);for(const x of[-.27,.27]){const ear=mesh(geo.cone,mat('#8c4cbb'),body);ear.position.set(x,1.44,-.04);ear.scale.set(.16,.34,.13);ear.rotation.z=x>0?-.28:.28;sphere(body,'#f0b5cf',x*.95,.85,.50,.065)}const tentacles=new THREE.InstancedMesh(geo.smallBall,mat('#ab70db'),21);tentacles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);tentacles.castShadow=true;tentacles.frustumCulled=false;body.add(tentacles);g.userData={body,head,iris,tentacles};g.scale.setScalar(1.15);scene.add(g);return g}
const cats=[{g:belcat(),x:356,y:1300,role:'A'},{g:belcat(),x:HORIZ_START_X+98,y:HORIZ_CY-88,role:'B'},...[...sentries,...verticalSentries].map(c=>({g:belcat(),x:c.x,y:c.y,c,role:'C'}))];const boss=belcat();boss.scale.setScalar(3.3);boss.visible=false;
function animateCat(g,x,y,t,action=0,phase=0,owner=null){
 const cue=attackCues.findLast(c=>c.owner===owner),age=cue?Math.max(0,visualTime-cue.born):10;
 const charging=cue&&(cue.type==='laser'||cue.type==='boss')&&age<.55, recoil=cue?Math.exp(-Math.pow((age-.18)/.18,2)):0,charge=charging?Math.sin(age/.55*Math.PI):0;
 g.position.copy(world(x,y,.12+Math.sin(t*2.1+phase)*.06));const d=g.userData;
 let aim=-.68;if(cue&&age<2.3){const a=world(cue.sx,cue.sy),b=world(cue.tx,cue.ty);aim=Math.atan2(b.x-a.x,b.z-a.z)}
 let diff=((aim-g.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;g.rotation.y+=diff*.16;
 d.body.rotation.z=Math.sin(t*1.6+phase)*.04+Math.sin(t*19)*charge*.10+Math.sin(age*25)*recoil*.08;
 d.body.rotation.x=charge*.18-recoil*.58;d.body.position.z=-charge*.10-recoil*.36;d.body.position.y=charge*.12+recoil*.08;d.body.scale.set(1+charge*.24-recoil*.12,1-charge*.16+recoil*.23,1+charge*.24-recoil*.12);
 const blink=Math.pow(Math.max(0,Math.sin(t*.85+phase)),55);d.iris.scale.y=.13*(1-blink*.9);d.iris.position.x=Math.sin(diff)*.045;d.head.scale.y=.43+Math.sin(t*2+phase)*.018;
 for(let a=0;a<3;a++)for(let k=0;k<7;k++){const u=(k+1)/7,ang=(a-1)*1.08,spread=1+charge*.85+recoil*.65;dummy.position.set(Math.sin(ang)*u*.8*spread+Math.sin(t*2.5+k*.5+phase)*u*.09,.72-u*.58+Math.sin(t*3+k*.7+a)*u*.08+charge*u*.45+recoil*Math.sin(k*.65-age*18)*u*.25,Math.cos(ang)*u*.36-.12+charge*u*.40-recoil*u*.30);dummy.rotation.set(0,0,0);dummy.scale.setScalar((.12-k*.009)*(1+charge*.2));dummy.updateMatrix();d.tentacles.setMatrixAt(a*7+k,dummy.matrix)}d.tentacles.instanceMatrix.needsUpdate=true;
}
const ballModels=new Map();function makeBall(id){const g=new THREE.Group();scene.add(g);const body=mesh(geo.ball,mat('#f6b785'),g);const face=new THREE.Group();g.add(face);face.rotation.y=-.66;for(const x of[-.28,.28]){sphere(face,'#fffaf4',x,.19,.88,.19);sphere(face,'#4b3d4d',x,.18,1.03,.083);sphere(face,'#ffffff',x-.02,.22,1.10,.027);sphere(face,'#f3a5b9',x*1.9,-.1,.80,.13)}const smile=mesh(geo.smile,mat('#69516a'),face);smile.position.set(0,-.18,.99);smile.rotation.z=Math.PI;const tag=label('P'+(id+1),.27,'#493a50','#fff9ec');tag.position.y=.72;tag.material.depthTest=false;g.add(tag);const ice=mesh(geo.box,new THREE.MeshStandardMaterial({color:'#92d9f3',transparent:true,opacity:.36,roughness:.15}),g);ice.visible=false;const halo=mesh(geo.ring,mat('#efb859'),g);halo.rotation.x=Math.PI/2;halo.scale.setScalar(1.2);halo.visible=false;return{g,body,face,tag,ice,halo,last:new THREE.Vector3()}}
function updateBalls(ts){const t=ts*.001,alpha=physicsCarry*120;const list=balls.length?balls:ballInfo(playerCount()).map((p,i)=>{const row=Math.floor(i/15),col=i%15,n=Math.min(15,playerCount()-row*15);return{id:i,color:p.color,x:clamp(state.dropX-(n-1)*19/2+col*19,PLAY_L+20,PLAY_R-20),y:30+row*19,r:BASE_R}});const active=new Set();for(const b of list){active.add(b.id);if(!ballModels.has(b.id))ballModels.set(b.id,makeBall(b.id));const m=ballModels.get(b.id);m.g.visible=true;m.body.material=mat(b.color);const x=b.prevX!==undefined?THREE.MathUtils.lerp(b.prevX,b.x,alpha):b.x,y=b.prevY!==undefined?THREE.MathUtils.lerp(b.prevY,b.y,alpha):b.y;const radius=b.r*S;const squash=b.knockTime>0?.15:0;m.g.position.copy(world(x,y,radius+.02));if(b.falling){const f=clamp((b.fallTime||0)/1.15,0,1),start=world(b.fallX,b.fallY,radius+.02);m.g.position.lerpVectors(start,holeCentre,Math.min(1,f*3));m.g.position.y=.12+radius-f*f*6.2;m.g.rotation.z=f*5;m.g.visible=f<.97;}else m.g.rotation.z=0;m.g.scale.set(radius,radius*(1-squash),radius);m.body.rotation.x=(b.rot||0)*2;m.face.rotation.y=-.66+Math.sin(t*1.2+b.id)*.025;m.tag.position.y=(radius+.38+(b.id%3)*.08)/radius;m.tag.scale.set(1.25/radius,.46/radius,1);m.tag.visible=false;m.ice.visible=b.freeze>0;m.ice.scale.setScalar(2.25);m.halo.visible=!!b.recorded||b.bossGuard>0;m.halo.material=mat(b.recorded?'#efb859':'#55ba9c');m.halo.rotation.z=t;m.halo.position.y=-.7;}for(const[id,m]of ballModels)m.g.visible=active.has(id);}
const toyModels=new Map();function toy(type){const g=new THREE.Group();if(type==='windmill'){cyl(g,'#c9aa8b',0,.18,0,.07,.36);const rotor=new THREE.Group();g.add(rotor);rotor.position.y=.4;for(let i=0;i<4;i++){const arm=new THREE.Group();rotor.add(arm);arm.rotation.y=i*Math.PI/2;box(arm,['#e876a3','#46b991','#edbc4d','#658ccc'][i],.25,0,0,.50,.13,.14)}sphere(rotor,'#fff0cf',0,.03,0,.12);g.userData.rotor=rotor}else if(type==='bomb'){sphere(g,'#766784',0,.20,0,.20);box(g,'#d2b985',0,.46,0,.05,.16,.05);sphere(g,'#ffca7a',0,.55,0,.07)}else if(type==='ufo'){const saucer=sphere(g,'#609cab',0,.6,0,.37);saucer.scale.y=.11;sphere(g,'#aa62dc',0,.72,0,.21);for(let i=0;i<5;i++)sphere(g,'#fff0a4',Math.cos(i*1.256)*.3,.63,Math.sin(i*1.256)*.3,.045)}else if(type==='mushroom'){cyl(g,'#fff3d9',0,.12,0,.10,.25);const cap=sphere(g,'#df689a',0,.3,0,.25);cap.scale.y=.15;for(let i=0;i<4;i++)sphere(g,'#fff5e5',Math.sin(i*1.57)*.12,.44,Math.cos(i*1.57)*.12,.05)}else{const color=type==='healer'?'#f8ede2':type==='mole'?'#b48a69':'#aac298';sphere(g,color,0,.2,0,.17);sphere(g,'#f4d5ad',0,.43,0,.13);sphere(g,'#695568',-.045,.46,.10,.025);sphere(g,'#695568',.045,.46,.10,.025);if(type==='walker'){const cap=mesh(geo.cone,mat('#b4a0d0'),g);cap.position.y=.61;cap.scale.set(.17,.25,.17)}if(type==='healer'){box(g,'#ee9ea8',0,.46,.12,.04,.14,.025);box(g,'#ee9ea8',0,.46,.12,.13,.04,.025)}const legs=[];for(const x of[-.08,.08])legs.push(box(g,'#776681',x,.035,0,.09,.13,.1));g.userData.legs=legs}scene.add(g);return g}
function updateToys(t){const items=[...windmills.map(o=>[o,'windmill']),...bombs.map(o=>[o,'bomb']),...ufos.map(o=>[o,'ufo']),...mushrooms.filter(o=>!o.used).map(o=>[o,'mushroom']),...walkers.map(o=>[o,'walker']),...(healer?[[healer,'healer']]:[]),...(mole?[[mole,'mole']]:[])];const seen=new Set();for(const[o,type]of items){seen.add(o);if(!toyModels.has(o))toyModels.set(o,toy(type));const g=toyModels.get(o);g.position.copy(world(o.x,o.y,.015));if(type==='windmill'){g.userData.rotor.rotation.y=-o.a;g.userData.rotor.scale.setScalar(Math.max(.1,o.hp/100))}if(type==='ufo')g.position.y+=Math.sin(t*3)*.08;if(g.userData.legs)g.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(t*12+i*Math.PI)*.5);if(type==='mole')g.scale.y=o.state==='sink'?Math.max(.05,1-o.t/.3):Math.min(1,o.t/.3+.1)}for(const[o,g]of toyModels)if(!seen.has(o)){scene.remove(g);toyModels.delete(o)}}
// Shared pools for projectiles, impact sparks and beam meshes.
const boltCore=new THREE.MeshBasicMaterial({color:'#fff4ff',toneMapped:false}),boltShell=new THREE.MeshBasicMaterial({color:'#a329fa',transparent:true,opacity:.80,depthWrite:false,toneMapped:false});const projectilePool=Array.from({length:100},()=>{const g=new THREE.Group();scene.add(g);const shell=mesh(geo.cylinder,boltShell,g),core=mesh(geo.cylinder,boltCore,g),tip=mesh(geo.smallBall,boltCore,g);shell.castShadow=core.castShadow=tip.castShadow=false;shell.scale.set(.19,2.3,.19);shell.position.y=-.75;core.scale.set(.075,2.5,.075);core.position.y=-.75;tip.scale.setScalar(.15);g.visible=false;return g});
const particleGeo=new THREE.BufferGeometry(),pPos=new Float32Array(900*3),pCol=new Float32Array(900*3);particleGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));particleGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));const sparkMaterial=new THREE.PointsMaterial({size:.09,vertexColors:true,transparent:true,opacity:.85,depthWrite:false});const sparks=new THREE.Points(particleGeo,sparkMaterial);sparks.frustumCulled=false;scene.add(sparks);
const glowMat=new THREE.MeshBasicMaterial({color:'#e7aaff',transparent:true,opacity:.24,depthWrite:false}),coreMat=new THREE.MeshBasicMaterial({color:'#ffe5ff'});const beams=Array.from({length:3},()=>{const g=new THREE.Group();scene.add(g);const glow=mesh(geo.cylinder,glowMat,g),core=mesh(geo.cylinder,coreMat,g);glow.castShadow=core.castShadow=false;g.visible=false;return{g,glow,core}});
function beam(index,sx,sy,ex,ey,r,visible=true){const o=beams[index];o.g.visible=visible;if(!visible)return;const a=world(sx,sy,.5),b=world(ex,ey,.3),d=b.clone().sub(a);o.g.position.copy(a).add(b).multiplyScalar(.5);o.g.quaternion.setFromUnitVectors(up,d.clone().normalize());const pulse=1+Math.sin(visualTime*34)*.12;o.glow.scale.set(r*4.5*pulse,d.length(),r*4.5*pulse);o.core.scale.set(r*1.35*pulse,d.length(),r*1.35*pulse);}
function updateEffects(ts){const list=[...projectiles,...missiles.map(p=>({...p,type:'missile'}))];for(let i=0;i<projectilePool.length;i++){const m=projectilePool[i],p=list[i];m.visible=!!p;if(p){m.position.copy(world(p.x,p.y,.32));const previous=projectileHistory.get(p),target=balls.find(b=>b.id===p.tx),direction=previous?m.position.clone().sub(previous):target?world(target.x,target.y,.32).sub(m.position):new THREE.Vector3(p.vx||1,0,p.vy||0);if(direction.lengthSq()<.00001)direction.set(1,0,0);direction.normalize();m.quaternion.setFromUnitVectors(up,direction);m.scale.setScalar(p.type==='missile'?.65:1)}}let n=Math.min(particles.length,900);for(let i=0;i<n;i++){const p=particles[i];world(p.x,p.y,.14+(p.ring?.2:0)).toArray(pPos,i*3);new THREE.Color('rgb('+p.c+')').multiplyScalar(Math.max(0,1-p.age/p.life)).toArray(pCol,i*3)}particleGeo.setDrawRange(0,n);particleGeo.attributes.position.needsUpdate=true;particleGeo.attributes.color.needsUpdate=true;beams.forEach(b=>b.g.visible=false);if(laser)beam(0,laser.x,laser.y,laser.x+Math.cos(laser.angle)*650,laser.y+Math.sin(laser.angle)*650,laser.age<.55?.012:.05);if(goalBelcatEvent.shotT>0){const b=goalBelcatBeam();beam(1,b.sx,b.sy,b.ex,b.ey,.10)}const magnet=balls.find(b=>b.magnetTime>0&&!b.recorded);if(magnet){const target=balls.find(b=>b.id===magnet.magnetTarget&&!b.landed);if(target)beam(2,magnet.x,magnet.y,target.x,target.y,.016)}}
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();let drag=null,pointers=new Map(),pinchDistance=0,manualTarget=new THREE.Vector3();
function syncViewButtons(){document.getElementById('followBtn').classList.toggle('active',cameraMode==='follow');document.getElementById('overviewBtn').classList.toggle('active',cameraMode==='overview');document.getElementById('viewHint').textContent=cameraMode==='manual'?'둘러보기 · 추적 버튼으로 복귀':'선두 추적 · 드래그 / 핀치'}
document.getElementById('followBtn').onclick=()=>{cameraMode='follow';zoomFactor=1;syncViewButtons()};document.getElementById('overviewBtn').onclick=()=>{cameraMode='overview';zoomFactor=1;syncViewButtons()};document.getElementById('zoomIn').onclick=()=>{zoomFactor=clamp(zoomFactor*1.2,.5,4)};document.getElementById('zoomOut').onclick=()=>{zoomFactor=clamp(zoomFactor/1.2,.5,4)};
document.getElementById('qualityBtn').onclick=()=>{qualityHigh=!qualityHigh;renderer.setPixelRatio(Math.min(devicePixelRatio,qualityHigh?1.75:1));renderer.shadowMap.enabled=qualityHigh;sun.castShadow=qualityHigh;document.getElementById('qualityBtn').innerHTML=qualityHigh?'✦<small>고화질</small>':'✧<small>가볍게</small>';resize()};
function tap(e){if(state.mode!=='PLACEMENT')return;const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);const hits=ray.intersectObject(table);if(!hits.length){if(state.selected)announce('코스 안쪽을 눌러 주세요');return}const p=hits[0].point,y=p.z/S,x=(p.x-groundBend(y))/S+CX;if(state.selected)placeObstacle(state.selected,x,y);else if(y<160)state.dropX=clamp(x,PLAY_L+45,PLAY_R-45)}
renderer.domElement.addEventListener('pointerdown',e=>{renderer.domElement.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};else if(pointers.size===2){const a=[...pointers.values()];pinchDistance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(drag)drag.moved=true}});
renderer.domElement.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const a=[...pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(pinchDistance>0)zoomFactor=clamp(zoomFactor*d/pinchDistance,.5,4);pinchDistance=d;return}if(!drag)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.lastX=e.clientX;drag.lastY=e.clientY;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;if(drag.moved){if(cameraMode!=='manual'){manualTarget.copy(cameraTarget);cameraMode='manual';syncViewButtons()}const k=viewSpan/Math.max(1,stage.clientHeight)/zoomFactor;const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),vertical=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);manualTarget.addScaledVector(right,-dx*k).addScaledVector(vertical,dy*k);manualTarget.y=clamp(manualTarget.y,.5,7);manualTarget.x=clamp(manualTarget.x,-8,80);manualTarget.z=clamp(manualTarget.z,-2,75)}});
function endPointer(e){if(drag&&!drag.moved&&pointers.size===1)tap(e);pointers.delete(e.pointerId);if(pointers.size===0)drag=null;pinchDistance=0}renderer.domElement.addEventListener('pointerup',endPointer);renderer.domElement.addEventListener('pointercancel',()=>{pointers.clear();drag=null;pinchDistance=0});renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoomFactor=clamp(zoomFactor*Math.exp(-e.deltaY*.001),.5,4)},{passive:false});
function resize(){const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setSize(w,h,false);camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(stage);resize();
let fpsFrames=0,fpsTs=performance.now();function draw(ts){const dt=Math.min(.05,(ts-lastDraw)/1000);lastDraw=ts;const t=ts*.001;updateTrack(ts);updateFallStreaks(t);updatePegs();updateBalls(ts);updateToys(t);updateEffects(ts);updateAttackVisuals(ts);updateProgress(ts);for(const c of cats)animateCat(c.g,c.x,c.y,t,c.role==='A'?belcatAnimA:c.role==='B'?belcatAnimB:(c.c.anim||0),c.c?.phase||0,c.c||c.role);boss.visible=goalBelcatEvent.active;if(boss.visible){const p=goalBelcatPos();animateCat(boss,p.x,p.y,t,goalBelcatEvent.shotT,2,'boss')}finish.visible=false;
let target=world(state.cameraX+W*.5,state.cameraY+VH*.5),span=18;const fallingFocus=balls.find(b=>b.falling&&!b.landed);if(cameraMode==='follow'&&(fallingFocus||state.mode==='FINISHED')){target.copy(holeCentre);target.y=-.35;span=8;}
if(cameraMode==='overview'){const bounds=new THREE.Box3().setFromObject(floorMesh),centre=bounds.getCenter(new THREE.Vector3());target.copy(centre);target.y=.12;span=Math.max(78,100/(stage.clientWidth/stage.clientHeight))}else if(cameraMode==='manual'){target.copy(manualTarget);span=20;}
const blend=cameraSnap||reducedMotion||cameraMode==='follow'?1:1-Math.exp(-dt*2.5);cameraTarget.lerp(target,blend);viewSpan=THREE.MathUtils.lerp(viewSpan,span,blend);cameraSnap=false;const aspect=stage.clientWidth/stage.clientHeight,half=viewSpan/zoomFactor/2;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();const activeLeader=balls.find(b=>b.id===progressLeaderId),viewOffset=cameraMode==='follow'&&(fallingFocus||state.mode==='FINISHED')?new THREE.Vector3(0,23,3):cameraMode==='follow'&&activeLeader?.zone==='horizontal'?new THREE.Vector3(-20,23,3):cameraOffset;camera.position.copy(cameraTarget).add(viewOffset);camera.lookAt(cameraTarget);renderer.render(scene,camera);document.getElementById('racerCount').textContent=playerCount();fpsFrames++;if(ts-fpsTs>1000){document.getElementById('fps').textContent=Math.round(fpsFrames*1000/(ts-fpsTs))+' FPS';fpsFrames=0;fpsTs=ts;}}
document.addEventListener('visibilitychange',()=>{lastTs=performance.now();lastDraw=lastTs;physicsCarry=0});
// Read-only diagnostics for automated regression checks.
window.raceDiagnostics=()=>({courseLength:COURSE_LENGTH,simulationRate:SIMULATION_RATE,leaderId:progressLeaderId,progress:progressLeaderValue,projectiles:projectiles.length,attackCues:attackCues.length,impactCues:impactCues.length,cameraX:state.cameraX,cameraY:state.cameraY,mode:state.mode,elapsed:state.elapsed,balls:balls.map(b=>({id:b.id,x:b.x,y:b.y,radius:b.r,vx:b.vx,vy:b.vy,zone:b.zone,landed:b.landed,recorded:b.recorded})),finishOrder:state.finishOrder.map(b=>({...b})),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cameraMode,wallHits:wallHits.length,falling:balls.filter(b=>b.falling&&!b.landed).length,holeRadius,models:toyModels.size});
// Edition 02 presentation diagnostics and cues are separate from collision decisions.
const COURSE_LENGTH=ELBOW_START_Y+ELBOW_R*Math.PI/2+HORIZ_LEN;
let visualTime=0,progressLeaderId=-1,progressLeaderValue=0;
function railColor(u){const c=new THREE.Color();if(u<.52)c.setHSL(.78-u*.12,.58,.56);else c.setHSL(.48-(u-.52)*.48,.59,.53);return c}
function courseProgress(b){if(b.recorded||b.landed)return 1;if(b.zone==='vertical')return clamp(b.y/COURSE_LENGTH,0,1);if(b.zone==='elbow'){const a=clamp(Math.atan2(b.y-ELBOW_CY,b.x-ELBOW_CX),Math.PI/2,Math.PI);return(ELBOW_START_Y+(Math.PI-a)*ELBOW_R)/COURSE_LENGTH}return clamp((ELBOW_START_Y+ELBOW_R*Math.PI/2+b.x-HORIZ_START_X)/COURSE_LENGTH,0,1)}
function updateProgress(ts){
 if(ts-progressLastUpdate<100)return;progressLastUpdate=ts;
 const order=balls.slice().sort((a,b)=>courseProgress(b)-courseProgress(a));const leader=order[0];progressLeaderId=leader?.id??-1;progressLeaderValue=leader?courseProgress(leader):0;
 document.getElementById('progressText').textContent='선두 '+Math.floor(progressLeaderValue*100)+'%';
 document.getElementById('finishText').textContent='완주 '+state.finishOrder.length+' / '+playerCount();document.getElementById('progressFill').style.width=progressLeaderValue*100+'%';
 document.getElementById('sectionText').textContent=state.mode==='PLACEMENT'?'출발 준비':leader?.recorded?'구멍 낙하':leader?.zone==='vertical'?'경사 코스':leader?.zone==='elbow'?'회전 관문':'수평 레이스';
 document.getElementById('leaderText').textContent=leader?'선두 '+leader.name:'선두 —';
 const mc=document.getElementById('courseMap'),c=mc.getContext('2d'),w=mc.width,h=mc.height;c.clearRect(0,0,w,h);const pad=16,mx=x=>pad+(x-PLAY_L)/(GOAL_X-PLAY_L)*(w-pad*2),my=y=>pad+y/(HORIZ_CY+TUBE_HALF)*(h-pad*2);
 c.lineWidth=6;c.lineCap='round';c.strokeStyle='#69c69f';c.beginPath();c.moveTo(mx(CX),my(0));c.lineTo(mx(CX),my(ELBOW_START_Y));for(let i=0;i<=24;i++){const a=Math.PI-i/24*Math.PI/2;c.lineTo(mx(ELBOW_CX+Math.cos(a)*ELBOW_R),my(ELBOW_CY+Math.sin(a)*ELBOW_R))}c.lineTo(mx(FINISH_X),my(HORIZ_CY));c.stroke();
 c.strokeStyle='#ffffff22';c.lineWidth=1;c.stroke();c.fillStyle='#f8de8d';c.fillRect(mx(FINISH_X)-2,my(HORIZ_CY)-7,4,14);
 for(const b of [...balls.filter(b=>b.id!==progressLeaderId),...balls.filter(b=>b.id===progressLeaderId)]){const lead=b.id===progressLeaderId;c.beginPath();c.arc(mx(b.x),my(b.y),lead?7:4.6,0,Math.PI*2);c.fillStyle=b.color;c.fill();c.strokeStyle='#ffffff';c.lineWidth=lead?2.8:2;c.stroke();if(lead){c.beginPath();c.arc(mx(b.x),my(b.y),10,0,Math.PI*2);c.strokeStyle='#ffdc51';c.lineWidth=2;c.stroke()}}
 const dist=order.slice(0,3).map(b=>b.name+' '+Math.floor(courseProgress(b)*100)+'%').join(' · ');document.getElementById('frontRunners').textContent=dist||'시작 → 회전 관문 → 커피';
}
function emitAttack(sx,sy,tx,ty,type,owner){attackCues.push({sx,sy,tx,ty,type,owner,born:performance.now()/1000});if(attackCues.length>40)attackCues.shift()}
function emitImpact(x,y,type){impactCues.push({x,y,type,born:performance.now()/1000});if(impactCues.length>30)impactCues.shift()}
const effectPurple=new THREE.MeshBasicMaterial({color:'#aa36e0',transparent:true,opacity:.92,depthWrite:false,toneMapped:false}),effectCore=new THREE.MeshBasicMaterial({color:'#ffe3ff',toneMapped:false}),effectGlow=new THREE.MeshBasicMaterial({color:'#ed67cf',transparent:true,opacity:.36,depthWrite:false,toneMapped:false});
const muzzlePool=Array.from({length:24},()=>{const g=new THREE.Group();scene.add(g);const orb=mesh(geo.smallBall,effectPurple,g),glow=mesh(geo.smallBall,effectGlow,g),ring=mesh(geo.ring,effectCore,g);orb.castShadow=glow.castShadow=ring.castShadow=false;g.visible=false;return{g,orb,glow,ring}});
const impactPool=Array.from({length:20},()=>{const g=new THREE.Group();scene.add(g);const ring=mesh(geo.ring,effectCore,g),outer=mesh(geo.ring,effectPurple,g);ring.rotation.x=outer.rotation.x=Math.PI/2;ring.castShadow=outer.castShadow=false;const spikes=[];for(let k=0;k<6;k++){const m=mesh(geo.cone,effectPurple,g);m.castShadow=false;spikes.push(m)}g.visible=false;return{g,ring,outer,spikes}});
const trailMesh=new THREE.InstancedMesh(geo.cylinder,boltShell,180);trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);trailMesh.frustumCulled=false;trailMesh.castShadow=false;scene.add(trailMesh);const projectileHistory=new WeakMap();
function updateAttackVisuals(ts){visualTime=ts/1000;attackCues=attackCues.filter(c=>visualTime-c.born<2.3);impactCues=impactCues.filter(c=>visualTime-c.born<.85);
 for(let i=0;i<muzzlePool.length;i++){const m=muzzlePool[i],cue=attackCues[i];const age=cue?visualTime-cue.born:99;m.g.visible=!!cue&&age<(cue.type==='laser'||cue.type==='boss'?.65:.24);if(!m.g.visible)continue;const charge=cue.type==='laser'?clamp(age/.55,0,1):Math.max(0,1-age/.60),radius=cue.type==='q'?.12+.80*Math.exp(-age*12):.18+charge*.42;m.g.position.copy(world(cue.sx,cue.sy,.6));m.g.lookAt(world(cue.tx,cue.ty,.5));m.orb.scale.setScalar(radius);m.glow.scale.setScalar(radius*2.6);m.ring.scale.setScalar(cue.type==='q'?.25+age*3.8:radius*2.2);m.ring.rotation.z=visualTime*7;}
 for(let i=0;i<impactPool.length;i++){const m=impactPool[i],cue=impactCues[i];m.g.visible=!!cue;if(!cue)continue;const age=(visualTime-cue.born)/.85,r=(cue.type==='boss'?2.1:1.05)*(1-Math.pow(1-age,2));m.g.position.copy(world(cue.x,cue.y,.22));m.ring.scale.setScalar(r);m.outer.scale.setScalar(r*.73);for(let k=0;k<6;k++){const a=k*Math.PI/3;const spike=m.spikes[k];spike.position.set(Math.cos(a)*r,.05+Math.sin(age*Math.PI)*.35,Math.sin(a)*r);spike.rotation.z=-a;spike.scale.set(.06*(1-age),.65*(1-age),.06*(1-age))}}
 let count=0;for(const p of projectiles){const current=world(p.x,p.y,.32),last=projectileHistory.get(p)||current.clone();const direction=current.clone().sub(last);projectileHistory.set(p,current.clone());if(direction.lengthSq()<.00001)continue;const tail=current.clone().addScaledVector(direction.clone().normalize(),-2.8);const d=current.clone().sub(tail);dummy.position.copy(current).add(tail).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,d.clone().normalize());dummy.scale.set(.11,d.length(),.11);dummy.updateMatrix();trailMesh.setMatrixAt(count++,dummy.matrix);if(count>=180)break}trailMesh.count=count;trailMesh.instanceMatrix.needsUpdate=true;
}

reset();ui.start.disabled=false;ui.reset.disabled=false;window.raceReady=true;requestAnimationFrame(tick);
