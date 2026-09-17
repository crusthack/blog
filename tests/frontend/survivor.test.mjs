import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurvivor, tickSurvivor, chooseUpgrade, dash, nextLevelXp, upgrades } from '../../apps/frontend/src/lib/survivor.ts';
const rng = () => .5;
const input = {x:0,y:0};
test('survivor movement is time based, bounded, and pauses during choices', () => {
  const a=createSurvivor(), b=createSurvivor(); a.phase=b.phase='playing';
  for(let i=0;i<60;i++) tickSurvivor(a,1/60,{x:1,y:0},rng);
  for(let i=0;i<120;i++) tickSurvivor(b,1/120,{x:1,y:0},rng);
  assert.ok(Math.abs(a.player.x-b.player.x)<.01);
  a.phase='paused'; const before=JSON.stringify(a); tickSurvivor(a,10,input,rng); assert.equal(JSON.stringify(a),before);
  a.phase='playing'; tickSurvivor(a,100,{x:100,y:100},rng); assert.ok(a.time<1.1); assert.ok(a.player.x<=944);
});
test('experience opens unique capped choices and upgrades preserve queued levels', () => {
  const g=createSurvivor(); g.phase='playing';g.xp=100;
  tickSurvivor(g,.01,input,rng); assert.equal(g.phase,'upgrade'); assert.equal(g.level,2); assert.equal(new Set(g.choices).size,3);
  const first=g.choices[0]; chooseUpgrade(g,first,rng);assert.equal(g.ranks[first],1);assert.equal(g.phase,'upgrade');assert.equal(g.level,3);
  const paused=JSON.stringify(g);tickSurvivor(g,1,input,rng);assert.equal(JSON.stringify(g),paused);
  g.choices=['vitality'];g.hp=10;chooseUpgrade(g,'vitality',rng);assert.equal(g.maxHp,125);assert.ok(g.hp>=50);
  for(const key of Object.keys(upgrades))g.ranks[key]=upgrades[key].max;
  g.phase='playing';g.xp=nextLevelXp(g.level);tickSurvivor(g,.01,input,rng);assert.equal(g.phase,'playing');assert.equal(g.choices.length,0);
});
test('auto fire kills enemies, collects experience and awards boss healing', () => {
  const g=createSurvivor();g.phase='playing';g.hp=50;g.spawn=99;
  g.enemies=[{id:1,x:500,y:300,hp:1,maxHp:1,radius:10,speed:0,boss:true,hit:0}];
  tickSurvivor(g,.02,input,rng); assert.equal(g.kills,1);assert.equal(g.enemies.length,0);assert.ok(g.hp>50);assert.equal(g.level,2);
});
test('dash has a cooldown, contact damage has invulnerability, and end states stop time', () => {
  const g=createSurvivor();g.phase='playing'; dash(g);assert.equal(g.dash,3);g.dash=2;dash(g);assert.equal(g.dash,2);
  g.invulnerable=0;g.shot=99;g.spawn=99;
  g.enemies=Array.from({length:3},(_,i)=>({id:i,x:480,y:300,hp:999,maxHp:999,radius:10,speed:0,boss:false,hit:0}));
  tickSurvivor(g,.01,input,rng);assert.equal(g.hp,88);tickSurvivor(g,.01,input,rng);assert.equal(g.hp,88);
  g.hp=1;g.invulnerable=0;tickSurvivor(g,.01,input,rng);assert.equal(g.phase,'dead');const time=g.time;tickSurvivor(g,1,input,rng);assert.equal(g.time,time);
  const won=createSurvivor();won.phase='playing';won.time=299.99;tickSurvivor(won,.02,input,rng);assert.equal(won.phase,'won');assert.equal(won.time,300);
});
test('boss waves spawn and long runs keep entity counts bounded', () => {
  const g=createSurvivor();g.phase='playing';g.time=59.99;tickSurvivor(g,.02,input,rng);assert.equal(g.enemies.filter(e=>e.boss).length,1);
  for(let i=0;i<15000;i++){g.hp=100;g.invulnerable=1;if(g.phase==='upgrade')chooseUpgrade(g,g.choices[0],rng);tickSurvivor(g,.02,input,rng);assert.ok(g.enemies.length<=104);assert.ok(g.bullets.length<=160);assert.ok(g.gems.length<=200);}
});
