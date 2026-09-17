export const ARENA = { width: 960, height: 600, duration: 300 };
export const upgrades = {
  power: { name: "강화 탄환", description: "탄환 피해 +35%", max: 8 },
  haste: { name: "속사", description: "공격 간격 12% 감소", max: 7 },
  volley: { name: "다중 발사", description: "한 번에 발사하는 탄환 +1", max: 4 },
  orbit: { name: "수호 위성", description: "주위를 도는 위성 +1 · 접촉 피해", max: 4 },
  pulse: { name: "충격파", description: "주변 적을 밀어내는 범위 공격 강화", max: 4 },
  vitality: { name: "생명력", description: "최대 체력 +25 · 체력 40 회복", max: 6 },
  speed: { name: "기동력", description: "이동 속도 +12%", max: 5 },
  magnet: { name: "흡수", description: "경험치 획득 범위 +35", max: 5 },
} as const;
export type Upgrade = keyof typeof upgrades;
type Point = { x: number; y: number };
export type Enemy = Point & { id: number; hp: number; maxHp: number; radius: number; speed: number; boss: boolean; hit: number };
export type Survivor = {
  phase: "ready" | "playing" | "paused" | "upgrade" | "dead" | "won";
  time: number; player: Point; hp: number; maxHp: number; xp: number; level: number; kills: number;
  enemies: Enemy[]; bullets: (Point & { vx: number; vy: number; life: number; damage: number })[];
  gems: (Point & { value: number })[]; ranks: Record<Upgrade, number>; choices: Upgrade[];
  spawn: number; shot: number; pulse: number; pulseFlash: number; invulnerable: number; dash: number; dashTime: number; bossAt: number; nextId: number;
};
export function createSurvivor(): Survivor {
  return { phase: "ready", time: 0, player: { x: 480, y: 300 }, hp: 100, maxHp: 100, xp: 0, level: 1, kills: 0,
    enemies: [], bullets: [], gems: [], ranks: { power: 0, haste: 0, volley: 0, orbit: 0, pulse: 0, vitality: 0, speed: 0, magnet: 0 }, choices: [],
    spawn: 0, shot: 0, pulse: 1, pulseFlash: 0, invulnerable: 0, dash: 0, dashTime: 0, bossAt: 60, nextId: 1 };
}
export const nextLevelXp = (level: number) => 6 + level * 3;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function levelUp(game: Survivor, random: () => number) {
  if (game.xp < nextLevelXp(game.level)) return;
  game.xp -= nextLevelXp(game.level); game.level++; game.hp = Math.min(game.maxHp, game.hp + 12);
  const pool = (Object.keys(upgrades) as Upgrade[]).filter(key => game.ranks[key] < upgrades[key].max);
  game.choices = [];
  while (pool.length && game.choices.length < 3) game.choices.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  if (game.choices.length) game.phase = "upgrade";
}
export function chooseUpgrade(game: Survivor, key: Upgrade, random = Math.random) {
  if (game.phase !== "upgrade" || !game.choices.includes(key) || game.ranks[key] >= upgrades[key].max) return;
  game.ranks[key]++;
  if (key === "vitality") { game.maxHp += 25; game.hp = Math.min(game.maxHp, game.hp + 40); }
  game.choices = []; game.phase = "playing"; levelUp(game, random);
}
export function dash(game: Survivor) {
  if (game.phase !== "playing" || game.dash > 0) return;
  game.dash = 3; game.dashTime = .22; game.invulnerable = .35;
}
function spawnEnemy(game: Survivor, boss: boolean, random: () => number) {
  const edge = Math.floor(random() * 4); const fast = !boss && random() < .25;
  const hp = boss ? 170 + game.time * 1.1 : (fast ? 12 : 20) + game.time * .16;
  game.enemies.push({ id: game.nextId++, x: edge < 2 ? (edge === 0 ? -20 : 980) : random() * 960,
    y: edge >= 2 ? (edge === 2 ? -20 : 620) : random() * 600, hp, maxHp: hp,
    radius: boss ? 25 : fast ? 9 : 13, speed: boss ? 43 : (fast ? 78 : 43) + game.time * .08, boss, hit: 0 });
}
export function tickSurvivor(game: Survivor, seconds: number, input: Point, random = Math.random) {
  if (game.phase !== "playing" || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, .04); game.time += dt;
  if (game.time >= ARENA.duration) { game.time = ARENA.duration; game.phase = "won"; return; }
  game.invulnerable = Math.max(0, game.invulnerable - dt); game.dash = Math.max(0, game.dash - dt);
  game.dashTime = Math.max(0, game.dashTime - dt); game.pulseFlash = Math.max(0, game.pulseFlash - dt);
  const length = Math.hypot(input.x, input.y); const movement = 180 * (1 + game.ranks.speed * .12) * (game.dashTime > 0 ? 3 : 1);
  if (Number.isFinite(length) && length > 0) {
    game.player.x = Math.max(16, Math.min(944, game.player.x + input.x / Math.max(1, length) * movement * dt));
    game.player.y = Math.max(16, Math.min(584, game.player.y + input.y / Math.max(1, length) * movement * dt));
  }
  game.spawn -= dt; game.shot -= dt; game.pulse -= dt;
  if (game.spawn <= 0 && game.enemies.length < 100) { spawnEnemy(game, false, random); game.spawn = Math.max(.14, .8 - game.time / 450); }
  if (game.time >= game.bossAt) { spawnEnemy(game, true, random); game.bossAt += 60; }
  if (game.shot <= 0 && game.enemies.length) {
    const target = game.enemies.reduce((a, b) => distance(a, game.player) < distance(b, game.player) ? a : b);
    const angle = Math.atan2(target.y - game.player.y, target.x - game.player.x); const count = 1 + game.ranks.volley;
    for (let i = 0; i < count && game.bullets.length < 160; i++) {
      const direction = angle + (i - (count - 1) / 2) * .13;
      game.bullets.push({ ...game.player, vx: Math.cos(direction) * 480, vy: Math.sin(direction) * 480, life: 1.8, damage: 22 * (1 + .35 * game.ranks.power) });
    }
    game.shot = .6 * .88 ** game.ranks.haste;
  }
  const pulse = game.ranks.pulse > 0 && game.pulse <= 0;
  if (pulse) { game.pulse = 3; game.pulseFlash = .3; }
  for (const enemy of game.enemies) {
    const dist = Math.max(1, distance(enemy, game.player));
    enemy.x += (game.player.x - enemy.x) / dist * enemy.speed * dt;
    enemy.y += (game.player.y - enemy.y) / dist * enemy.speed * dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    if (pulse && dist < 100 + game.ranks.pulse * 25) { enemy.hp -= 22 * game.ranks.pulse; enemy.x += (enemy.x - game.player.x) / dist * 35; enemy.y += (enemy.y - game.player.y) / dist * 35; }
    for (let i = 0; i < game.ranks.orbit; i++) {
      const angle = game.time * 2.5 + i * Math.PI * 2 / game.ranks.orbit;
      if (distance(enemy, { x: game.player.x + Math.cos(angle) * 65, y: game.player.y + Math.sin(angle) * 65 }) < enemy.radius + 12) enemy.hp -= 50 * dt;
    }
    if (enemy.hp > 0 && dist < enemy.radius + 12 && game.invulnerable <= 0) { game.hp = Math.max(0, game.hp - (enemy.boss ? 24 : 12)); game.invulnerable = .75; }
  }
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
    for (const enemy of game.enemies) if (enemy.hp > 0 && distance(bullet, enemy) < enemy.radius + 5) { enemy.hp -= bullet.damage; enemy.hit = .12; bullet.life = 0; break; }
  }
  game.bullets = game.bullets.filter(item => item.life > 0);
  for (const enemy of game.enemies) if (enemy.hp <= 0) {
    game.kills++; const value = enemy.boss ? 18 : 1;
    if (game.gems.length < 200) game.gems.push({ x: enemy.x, y: enemy.y, value });
    else game.gems[0].value += value;
    if (enemy.boss) game.hp = Math.min(game.maxHp, game.hp + 25);
  }
  game.enemies = game.enemies.filter(item => item.hp > 0);
  game.gems = game.gems.filter(gem => {
    const dist = distance(gem, game.player);
    if (dist < 24) { game.xp += gem.value; return false; }
    if (dist < 80 + game.ranks.magnet * 35) { gem.x += (game.player.x - gem.x) / dist * Math.min(dist, 350 * dt); gem.y += (game.player.y - gem.y) / dist * Math.min(dist, 350 * dt); }
    return true;
  });
  if (game.hp <= 0) { game.phase = "dead"; return; }
  levelUp(game, random);
}
