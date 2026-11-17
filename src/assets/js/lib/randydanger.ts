/**
 * Randy Danger game core — ported from zarguell/randydanger.
 * Pure simulation: raycasting, combat, enemy AI, spawning. No DOM/audio —
 * the app script (scripts/randydanger-app.ts) owns canvas, input, HUD and
 * sound, and maps the events returned here to feedback.
 */

// ─── CONSTANTS ──────────────────────────────────────────────────────
export const MAP_W = 16;
export const MAP_H = 16;
export const FOV = Math.PI / 3;
export const HALF_FOV = FOV / 2;
export const MAX_DEPTH = 20;
export const MOVE_SPEED = 3.5;
export const ROT_SPEED = 2.0;

export const QUIPS = [
	'That\'ll learn ya.',
	'Randy 1, Bad guys 0.',
	'I am SO good at this.',
	'Heh. Danger zone.',
	'Aw yeah, buddy.',
	'Too easy. Too easy.',
	'That\'s what I thought.',
	'Eat it, chump.',
	'Randy Danger does NOT miss.',
	'Carl would\'ve been dead by now.'
];

export const OUCH_QUIPS = [
	'OW! Come on!',
	'That tickled. Mostly.',
	'You got lucky, pal.',
	'Randy doesn\'t go down easy!',
	'Watch the face!'
];

export const MAPS: number[][] = [
	[
		1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
		1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1,
		1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1,
		1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1,
		1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
	]
];

export const WALL_COLORS: (string[] | null)[] = [
	null,
	['#2a4a2a', '#1a3a1a']
];
export const FLOOR_COLOR = '#111a11';
export const CEIL_COLOR = '#0a120a';

// Input tuning shared with the app script
export const JOYSTICK_RADIUS = 52;
export const TRACKPAD_SENSITIVITY = 0.006;
export const TAP_MAX_DURATION = 150;
export const TAP_MAX_MOVEMENT = 20;
export const AUTO_AIM_ANGLE = 0.09;
export const LEFT_ZONE_RATIO = 0.4;

// ─── TYPES ──────────────────────────────────────────────────────────
export type GameMap = number[];

export interface Enemy {
	x: number;
	y: number;
	hp: number;
	maxHp: number;
	angle: number;
	speed: number;
	shootCool: number;
	shootRate: number;
	alertRange: number;
	alerted: boolean;
	alive: boolean;
	bobT: number;
	dist: number;
}

export interface AmmoPickup {
	x: number;
	y: number;
	amount: number;
	active: boolean;
	dist: number;
}

export interface Player {
	x: number;
	y: number;
	angle: number;
	hp: number;
	maxHp: number;
	ammo: number;
	maxAmmo: number;
	reloading: boolean;
	reloadT: number;
	shootCool: number;
	speed: number;
}

/** Mutable simulation state the combat functions operate on. */
export interface GameCore {
	map: GameMap;
	player: Player;
	enemies: Enemy[];
	score: number;
	kills: number;
}

export interface RayHit {
	dist: number;
	wall: number;
	x: number;
	y: number;
	enemy?: Enemy;
}

export interface ShootResult {
	shot: boolean;
	outOfAmmo: boolean;
	killed: boolean;
	waveClear: boolean;
	enemyHpLeft: number | null;
}

export type EnemyEvent = { type: 'shot'; dmg: number } | { type: 'bumped' };

export interface EnemyUpdateResult {
	playerDied: boolean;
	events: EnemyEvent[];
}

// ─── SETUP ──────────────────────────────────────────────────────────
export function buildMap(waveNum: number): GameMap {
	const src = MAPS[Math.min(waveNum - 1, MAPS.length - 1)];
	return src.slice();
}

export function createPlayer(): Player {
	return {
		x: 2.5, y: 2.5,
		angle: 0,
		hp: 100, maxHp: 100,
		ammo: 30, maxAmmo: 30,
		reloading: false, reloadT: 0,
		shootCool: 0,
		speed: MOVE_SPEED
	};
}

export function spawnEnemies(waveNum: number, map: GameMap): Enemy[] {
	const count = 3 + waveNum * 2;
	const spawnPts: Array<[number, number]> = [
		[13.5, 13.5], [14.5, 1.5], [1.5, 14.5], [14.5, 14.5],
		[8, 1.5], [1.5, 8], [14.5, 8], [8, 14.5],
		[4, 4], [12, 4], [4, 12], [12, 12]
	];
	const result: Enemy[] = [];
	for (let i = 0; i < Math.min(count, spawnPts.length); i++) {
		const [ex, ey] = spawnPts[i];
		if (map[Math.floor(ey) * MAP_W + Math.floor(ex)] !== 0) continue;
		const pdx = ex - 2.5, pdy = ey - 2.5;
		if (Math.sqrt(pdx * pdx + pdy * pdy) < 3) continue;
		result.push({
			x: ex, y: ey,
			hp: 2 + Math.floor(waveNum / 2),
			maxHp: 2 + Math.floor(waveNum / 2),
			angle: Math.random() * Math.PI * 2,
			speed: 1.0 + waveNum * 0.3,
			shootCool: 2.0,
			shootRate: 2.5 - waveNum * 0.15,
			alertRange: 8,
			alerted: false,
			alive: true,
			bobT: Math.random() * 10,
			dist: 0
		});
	}
	return result;
}

export function spawnAmmo(): AmmoPickup[] {
	const spots: Array<[number, number]> = [[5, 5], [10, 5], [5, 10], [10, 10], [7, 2], [2, 7], [13, 7], [7, 13]];
	return spots.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, amount: 10, active: true, dist: 0 }));
}

// ─── RAYCASTING ─────────────────────────────────────────────────────
export function castRay(
	map: GameMap,
	enemies: Enemy[],
	ox: number,
	oy: number,
	angle: number,
	checkEnemy = false
): RayHit {
	const cos = Math.cos(angle), sin = Math.sin(angle);
	let x = ox, y = oy;
	let dist = 0;
	const step = 0.05;
	for (let i = 0; i < MAX_DEPTH / step; i++) {
		x += cos * step; y += sin * step;
		dist += step;
		const mx = Math.floor(x), my = Math.floor(y);
		if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return { dist, wall: 1, x, y };
		if (map[my * MAP_W + mx] !== 0) return { dist, wall: map[my * MAP_W + mx], x, y };
		if (checkEnemy) {
			for (const e of enemies) {
				if (!e.alive) continue;
				const dx = e.x - x, dy = e.y - y;
				if (Math.sqrt(dx * dx + dy * dy) < 0.35) return { dist, wall: 0, enemy: e, x, y };
			}
		}
		if (dist > MAX_DEPTH) break;
	}
	return { dist: MAX_DEPTH, wall: 0, x, y };
}

export function shadeColor(hex: string, t: number): string {
	const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
	return `rgb(${(r * t) | 0},${(g * t) | 0},${(b * t) | 0})`;
}

// ─── MOVEMENT ───────────────────────────────────────────────────────
/** Per-axis wall slide with a 0.3 body pad, matching the source. */
export function moveWithCollision(map: GameMap, p: { x: number; y: number }, moveX: number, moveY: number): void {
	const pad = 0.3;
	const nx = p.x + moveX, ny = p.y + moveY;
	if (map[Math.floor(p.y) * MAP_W + Math.floor(nx + (moveX > 0 ? pad : -pad))] === 0) p.x = nx;
	if (map[Math.floor(ny + (moveY > 0 ? pad : -pad)) * MAP_W + Math.floor(p.x)] === 0) p.y = ny;
}

// ─── ENEMY AI ───────────────────────────────────────────────────────
export function updateEnemies(dt: number, map: GameMap, player: Player, enemies: Enemy[]): EnemyUpdateResult {
	const events: EnemyEvent[] = [];
	let playerDied = false;

	for (const e of enemies) {
		if (!e.alive) continue;
		e.bobT += dt;
		const dx = player.x - e.x, dy = player.y - e.y;
		const distToPlayer = Math.sqrt(dx * dx + dy * dy);
		if (distToPlayer < e.alertRange) e.alerted = true;
		if (!e.alerted) continue;

		const moveSpd = e.speed * dt;
		const ang = Math.atan2(dy, dx);
		const nx = e.x + Math.cos(ang) * moveSpd;
		const ny = e.y + Math.sin(ang) * moveSpd;
		if (map[Math.floor(e.y) * MAP_W + Math.floor(nx)] === 0) e.x = nx;
		if (map[Math.floor(ny) * MAP_W + Math.floor(e.x)] === 0) e.y = ny;

		e.shootCool -= dt;
		if (e.shootCool <= 0 && distToPlayer < 8) {
			e.shootCool = e.shootRate;
			if (hasLineOfSight(map, e, player)) {
				const dmg = 8 + Math.floor(Math.random() * 7);
				player.hp -= dmg;
				events.push({ type: 'shot', dmg });
				if (player.hp <= 0) { playerDied = true; break; }
			}
		}
		if (distToPlayer < 0.4) {
			player.hp -= 0.5;
			events.push({ type: 'bumped' });
			if (player.hp <= 0) { playerDied = true; break; }
		}
	}

	return { playerDied, events };
}

// ─── COMBAT ─────────────────────────────────────────────────────────
export function shoot(core: GameCore): ShootResult {
	const p = core.player;
	const base: ShootResult = { shot: false, outOfAmmo: false, killed: false, waveClear: false, enemyHpLeft: null };
	if (p.reloading) return base;
	if (p.ammo <= 0) return { ...base, outOfAmmo: true };
	if (p.shootCool > 0) return base;

	p.ammo--;
	p.shootCool = 0.25;

	const hitInfo = castRay(core.map, core.enemies, p.x, p.y, p.angle, true);
	if (hitInfo.enemy) {
		const e = hitInfo.enemy;
		e.hp -= 1;
		core.score += 10;
		if (e.hp <= 0) {
			e.alive = false;
			core.kills++;
			core.score += 50;
			const waveClear = core.enemies.every((en) => !en.alive);
			return { shot: true, outOfAmmo: false, killed: true, waveClear, enemyHpLeft: 0 };
		}
		return { shot: true, outOfAmmo: false, killed: false, waveClear: false, enemyHpLeft: e.hp };
	}
	return { shot: true, outOfAmmo: false, killed: false, waveClear: false, enemyHpLeft: null };
}

export function reload(player: Player): boolean {
	if (player.reloading || player.ammo >= player.maxAmmo) return false;
	player.reloading = true;
	player.reloadT = 1.5;
	return true;
}

export function finishReload(player: Player): void {
	player.reloading = false;
	player.ammo = player.maxAmmo;
}

export function hasLineOfSight(map: GameMap, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
	const dx = to.x - from.x, dy = to.y - from.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	const steps = Math.ceil(dist * 5);
	for (let i = 1; i < steps; i++) {
		const t = i / steps;
		const cx = from.x + dx * t, cy = from.y + dy * t;
		if (map[Math.floor(cy) * MAP_W + Math.floor(cx)] !== 0) return false;
	}
	return true;
}
