import { describe, it, expect } from 'vitest';
import {
	MAPS,
	MAP_W,
	buildMap,
	castRay,
	createPlayer,
	finishReload,
	hasLineOfSight,
	moveWithCollision,
	reload,
	shadeColor,
	shoot,
	spawnAmmo,
	spawnEnemies,
	updateEnemies,
	type GameCore
} from '../randydanger';

function makeCore(overrides: Partial<GameCore> = {}): GameCore {
	const map = buildMap(1);
	const player = createPlayer();
	return { map, player, enemies: [], score: 0, kills: 0, ...overrides };
}

describe('buildMap', () => {
	it('returns a copy of wave 1 map', () => {
		const map = buildMap(1);
		expect(map).toEqual(MAPS[0]);
		expect(map).not.toBe(MAPS[0]);
	});

	it('clamps to the last map for high waves', () => {
		expect(buildMap(99)).toEqual(MAPS[MAPS.length - 1]);
	});

	it('drops spawn points inside the player-exclusion radius', () => {
		// [4,4] sits 2.12 units from the player start (2.5,2.5) — wave 99
		// requests all 12 spots but [4,4] must be filtered out.
		const map = buildMap(1);
		const spots = spawnEnemies(99, map).map((e) => `${e.x},${e.y}`);
		expect(spots).toHaveLength(11);
		expect(spots).not.toContain('4,4');
	});
});

describe('createPlayer', () => {
	it('starts at 2.5,2.5 with full health and ammo', () => {
		const p = createPlayer();
		expect(p.x).toBe(2.5);
		expect(p.y).toBe(2.5);
		expect(p.hp).toBe(100);
		expect(p.ammo).toBe(30);
		expect(p.reloading).toBe(false);
	});
});

describe('spawnEnemies', () => {
	it('scales count with the wave (3 + wave*2, capped at 12 spots)', () => {
		const map = buildMap(1);
		expect(spawnEnemies(1, map)).toHaveLength(5);
		expect(spawnEnemies(2, map)).toHaveLength(7);
		expect(spawnEnemies(99, map)).toHaveLength(11); // 12 spots minus excluded [4,4]
	});

	it('never spawns inside walls or next to the player start', () => {
		const map = buildMap(1);
		for (const e of spawnEnemies(5, map)) {
			expect(map[Math.floor(e.y) * MAP_W + Math.floor(e.x)]).toBe(0);
			const dx = e.x - 2.5, dy = e.y - 2.5;
			expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(3);
		}
	});

	it('scales enemy hp and speed with the wave', () => {
		const map = buildMap(1);
		const [w1] = spawnEnemies(1, map);
		const [w3] = spawnEnemies(3, map);
		expect(w3.maxHp).toBeGreaterThan(w1.maxHp);
		expect(w3.speed).toBeGreaterThan(w1.speed);
	});
});

describe('spawnAmmo', () => {
	it('places 8 active pickups of 10 rounds', () => {
		const pickups = spawnAmmo();
		expect(pickups).toHaveLength(8);
		expect(pickups.every((a) => a.active && a.amount === 10)).toBe(true);
	});
});

describe('castRay', () => {
	const map = buildMap(1);

	it('hits the border wall looking out from the start', () => {
		const hit = castRay(buildMap(1), [], 2.5, 2.5, Math.PI, false);
		expect(hit.wall).toBeGreaterThan(0);
		expect(hit.dist).toBeLessThanOrEqual(20);
	});

	it('detects an enemy before a wall when checkEnemy is set', () => {
		const e = {
			x: 4.0, y: 7.5, hp: 2, maxHp: 2, angle: 0, speed: 1, shootCool: 2, shootRate: 2,
			alertRange: 8, alerted: false, alive: true, bobT: 0, dist: 0
		};
		const hit = castRay(buildMap(1), [e], 2.5, 7.5, 0, true);
		expect(hit.enemy).toBe(e);
		expect(hit.dist).toBeLessThan(1.6);
	});

	it('crosses open space and stops at the far border wall', () => {
		// Row 7 is fully open cols 1-14; heading east from x=2.5 the ray
		// must reach the border wall (col 15) at dist ≈ 12.5.
		const hit = castRay(buildMap(1), [], 2.5, 7.5, 0, false);
		expect(hit.wall).toBe(1);
		expect(hit.dist).toBeGreaterThan(12);
		expect(hit.dist).toBeLessThan(13);
	});
});

describe('shadeColor', () => {
	it('darkens a hex color by the given factor', () => {
		expect(shadeColor('#ffffff', 0)).toBe('rgb(0,0,0)');
		expect(shadeColor('#ffffff', 1)).toBe('rgb(255,255,255)');
		expect(shadeColor('#2a4a2a', 0.5)).toBe('rgb(21,37,21)');
	});
});

describe('moveWithCollision', () => {
	it('lets the player move through open space', () => {
		const map = buildMap(1);
		const p = { x: 2.5, y: 7.5 };
		moveWithCollision(map, p, 0.5, 0);
		expect(p.x).toBeCloseTo(3.0);
	});

	it('stops the player at a wall while sliding along it', () => {
		const map = buildMap(1);
		// Row 3 has walls at cols 3-4. Walk east from x=1.5 in small
		// (realistic per-frame) steps — the body pad must stop us at x≈2.7.
		const p = { x: 1.5, y: 3.5 };
		for (let i = 0; i < 60; i++) moveWithCollision(map, p, 0.1, 0);
		// A step is allowed only while nx + pad stays out of col 3 (x < 2.7),
		// so 0.1-sized steps stop at 2.6.
		expect(p.x).toBeLessThan(2.7);
		expect(p.x).toBeCloseTo(2.6, 5);
		// The face of that wall is open to the north/south — sliding works.
		const q = { x: 2.5, y: 3.5 };
		moveWithCollision(map, q, 0, 0.5);
		expect(q.y).toBeCloseTo(4.0);
	});
});

describe('hasLineOfSight', () => {
	it('is true across an open room and false through a wall', () => {
		const map = buildMap(1);
		// Row 7 is fully open between cols 1 and 6
		expect(hasLineOfSight(map, { x: 1.5, y: 7.5 }, { x: 6.5, y: 7.5 })).toBe(true);
		// Col 3 has a wall at row 3 between these points
		expect(hasLineOfSight(map, { x: 3.5, y: 2.5 }, { x: 3.5, y: 5.5 })).toBe(false);
	});
});

describe('updateEnemies', () => {
	it('does not shoot without line of sight', () => {
		const map = buildMap(1);
		const player = createPlayer();
		player.x = 1.5; player.y = 1.5;
		// The line from (1.5,1.5) to (3.5,5.5) crosses the wall at row 3, col 3
		const enemy = {
			x: 3.5, y: 5.5, hp: 2, maxHp: 2, angle: 0, speed: 0, shootCool: 0.01, shootRate: 2,
			alertRange: 8, alerted: true, alive: true, bobT: 0, dist: 0
		};
		const result = updateEnemies(0.02, map, player, [enemy]);
		expect(result.events).toHaveLength(0);
		expect(player.hp).toBe(100);
	});

	it('fires on line of sight and reports 8-14 damage', () => {
		const map = buildMap(1);
		const player = createPlayer();
		player.x = 1.5; player.y = 7.5;
		const enemy = {
			x: 4.5, y: 7.5, hp: 2, maxHp: 2, angle: 0, speed: 0, shootCool: 0.01, shootRate: 2,
			alertRange: 8, alerted: true, alive: true, bobT: 0, dist: 0
		};
		const result = updateEnemies(0.02, map, player, [enemy]);
		expect(result.events).toHaveLength(1);
		const dmg = result.events[0];
		expect(dmg.type).toBe('shot');
		if (dmg.type === 'shot') {
			expect(dmg.dmg).toBeGreaterThanOrEqual(8);
			expect(dmg.dmg).toBeLessThanOrEqual(14);
		}
		expect(player.hp).toBe(100 - (result.events[0] as { dmg: number }).dmg);
	});

	it('reports playerDied when health is depleted', () => {
		const map = buildMap(1);
		const player = createPlayer();
		player.x = 1.5; player.y = 7.5;
		player.hp = 8;
		const enemy = {
			x: 4.5, y: 7.5, hp: 2, maxHp: 2, angle: 0, speed: 0, shootCool: 0.01, shootRate: 2,
			alertRange: 8, alerted: true, alive: true, bobT: 0, dist: 0
		};
		const result = updateEnemies(0.02, map, player, [enemy]);
		expect(result.playerDied).toBe(true);
	});

	it('ignores dead enemies', () => {
		const map = buildMap(1);
		const player = createPlayer();
		const enemy = {
			x: 4.5, y: 7.5, hp: 0, maxHp: 2, angle: 0, speed: 0, shootCool: 0.01, shootRate: 2,
			alertRange: 8, alerted: true, alive: false, bobT: 0, dist: 0
		};
		const result = updateEnemies(0.02, map, player, [enemy]);
		expect(result.events).toHaveLength(0);
		expect(result.playerDied).toBe(false);
	});
});

describe('shoot', () => {
	it('decrements ammo and can miss in open space', () => {
		const core = makeCore();
		core.player.x = 2.5; core.player.y = 7.5; // facing open corridor east
		const result = shoot(core);
		expect(result.shot).toBe(true);
		expect(result.killed).toBe(false);
		expect(core.player.ammo).toBe(29);
	});

	it('hits and kills an enemy directly ahead, awarding score', () => {
		const core = makeCore();
		core.player.x = 2.5; core.player.y = 7.5;
		const enemy = {
			x: 4.0, y: 7.5, hp: 1, maxHp: 1, angle: 0, speed: 0, shootCool: 2, shootRate: 2,
			alertRange: 8, alerted: false, alive: true, bobT: 0, dist: 0
		};
		core.enemies = [enemy];
		const result = shoot(core);
		expect(result.shot).toBe(true);
		expect(result.killed).toBe(true);
		expect(result.waveClear).toBe(true);
		expect(enemy.alive).toBe(false);
		expect(core.score).toBe(60);
		expect(core.kills).toBe(1);
	});

	it('refuses to fire while reloading, on cooldown, or out of ammo', () => {
		const core = makeCore();
		core.player.reloading = true;
		expect(shoot(core).shot).toBe(false);

		core.player.reloading = false;
		core.player.shootCool = 0.1;
		expect(shoot(core).shot).toBe(false);

		core.player.shootCool = 0;
		core.player.ammo = 0;
		const result = shoot(core);
		expect(result.shot).toBe(false);
		expect(result.outOfAmmo).toBe(true);
		expect(core.player.ammo).toBe(0);
	});
});

describe('reload / finishReload', () => {
	it('starts a 1.5s reload only when not full', () => {
		const p = createPlayer();
		p.ammo = 10;
		expect(reload(p)).toBe(true);
		expect(p.reloading).toBe(true);
		expect(p.reloadT).toBe(1.5);
		expect(reload(p)).toBe(false);

		finishReload(p);
		expect(p.reloading).toBe(false);
		expect(p.ammo).toBe(30);
		expect(reload(p)).toBe(false);
	});
});
