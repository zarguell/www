/**
 * Randy Danger canvas/DOM wiring — ported from zarguell/randydanger.
 * Pure simulation lives in `lib/randydanger.ts`; this module owns the
 * raycast renderer, keyboard/mouse/touch input, HUD, screens, and audio.
 *
 * Adaptations vs the source: the game renders into a contained stage
 * (not the full viewport), pointer lock is actually requested on canvas
 * click (the source never called requestPointerLock, so desktop
 * mouse-look was dead code), and held-fire uses a proper down/up pair
 * (the source's click flag never cleared, giving permanent full-auto).
 */
import {
	FOV,
	HALF_FOV,
	MAX_DEPTH,
	MAP_W,
	MAP_H,
	ROT_SPEED,
	QUIPS,
	OUCH_QUIPS,
	WALL_COLORS,
	FLOOR_COLOR,
	CEIL_COLOR,
	JOYSTICK_RADIUS,
	TRACKPAD_SENSITIVITY,
	TAP_MAX_DURATION,
	TAP_MAX_MOVEMENT,
	AUTO_AIM_ANGLE,
	LEFT_ZONE_RATIO,
	buildMap,
	createPlayer,
	spawnEnemies,
	spawnAmmo,
	castRay,
	shadeColor,
	moveWithCollision,
	updateEnemies,
	shoot,
	reload,
	finishReload,
	type AmmoPickup,
	type Enemy,
	type GameCore,
	type Player
} from '../lib/randydanger';

type GameState = 'title' | 'playing' | 'paused' | 'gameover' | 'victory';

const game = {
	state: 'title' as GameState,
	core: null as GameCore | null,
	ammoPickups: [] as AmmoPickup[],
	wave: 1,
	gameTime: 0,
	lastTime: 0,
	gunBob: 0,
	gunShootFlash: 0,
	titleAngle: 0,
	_frames: 0,
	_lastDbg: 0,
	_fps: 0,
	_ft: 0,
	_prev: 0
};

// ─── CANVAS STATE ───────────────────────────────────────────────────
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let stageEl: HTMLElement;
let W = 0;
let H = 0;
let HALF_H = 0;
let SCALE = 1;
let COLS = 320;

function resize(): void {
	const rect = stageEl.getBoundingClientRect();
	const vw = Math.max(160, Math.floor(rect.width));
	const vh = Math.max(120, Math.floor(rect.height));
	SCALE = Math.max(1, Math.floor(Math.min(vw, vh * 1.6) / 320));
	W = Math.floor(vw / SCALE) * SCALE;
	H = Math.floor(vh / SCALE) * SCALE;
	canvas.width = W;
	canvas.height = H;
	HALF_H = H >> 1;
	COLS = Math.floor(W / SCALE);
}

// ─── INPUT ──────────────────────────────────────────────────────────
const keys: Record<string, boolean> = {};
const mouse = { dx: 0, down: false, locked: false };
const mobile = {
	leftJoy: { dx: 0, dy: 0, active: false },
	rightPad: { deltaX: 0, active: false, tapShoot: false },
	fireHeld: false,
	reloadPressed: false,
	pausePressed: false
};
let escapePressed = false;

function onKeyDown(e: KeyboardEvent): void {
	keys[e.code] = true;
	if (e.code === 'Escape') {
		escapePressed = true;
		return;
	}
	if (e.code === 'KeyR') {
		mobile.reloadPressed = true;
	}
	// Only hijack page keys while actually playing — the game shares the
	// page with normal scrolling otherwise.
	if (game.state === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
		e.preventDefault();
	}
}

function onKeyUp(e: KeyboardEvent): void {
	keys[e.code] = false;
}

function onCanvasClick(): void {
	if (game.state !== 'playing') return;
	if (!mouse.locked) {
		// The source intended click-to-capture but never requested the lock.
		try {
			const req = canvas.requestPointerLock() as unknown;
			if (req instanceof Promise) req.catch(() => {});
		} catch {
			/* pointer lock unavailable — keyboard arrows still rotate */
		}
		return;
	}
	mouse.down = true;
}

function onMouseDown(): void {
	mouse.down = true;
}

function onMouseUp(): void {
	mouse.down = false;
}

function onMouseMove(e: MouseEvent): void {
	if (mouse.locked) {
		mouse.dx += e.movementX || 0;
	}
}

function onPointerLockChange(): void {
	mouse.locked = document.pointerLockElement === canvas;
	if (!mouse.locked) mouse.down = false;
}

// ── touch controls (stage-relative zones) ──
function makeRing(id: string): HTMLDivElement {
	const ring = document.createElement('div');
	ring.className = 'dpad-ring';
	ring.id = id;
	const knob = document.createElement('div');
	knob.className = 'dpad-knob';
	ring.appendChild(knob);
	ring.style.display = 'none';
	document.getElementById('mc-overlay')?.appendChild(ring);
	return ring;
}

let ringL: HTMLDivElement;
let knobL: HTMLDivElement;

function showRing(x: number, y: number): void {
	ringL.style.display = '';
	ringL.style.left = x + 'px';
	ringL.style.top = y + 'px';
	const knob = ringL.querySelector<HTMLDivElement>('.dpad-knob');
	if (knob) {
		knob.style.left = '50%';
		knob.style.top = '50%';
	}
}

function hideRing(): void {
	ringL.style.display = 'none';
	mobile.leftJoy.active = false;
	mobile.leftJoy.dx = 0;
	mobile.leftJoy.dy = 0;
}

function updateJoystick(ox: number, oy: number, cx: number, cy: number): void {
	const knob = ringL.querySelector<HTMLDivElement>('.dpad-knob');
	let dx = cx - ox, dy = cy - oy;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len > JOYSTICK_RADIUS) {
		dx = (dx / len) * JOYSTICK_RADIUS;
		dy = (dy / len) * JOYSTICK_RADIUS;
	}
	if (knob) {
		knob.style.left = 50 + (dx / JOYSTICK_RADIUS) * 42 + '%';
		knob.style.top = 50 + (dy / JOYSTICK_RADIUS) * 42 + '%';
	}
	mobile.leftJoy.dx = dx / JOYSTICK_RADIUS;
	mobile.leftJoy.dy = dy / JOYSTICK_RADIUS;
	mobile.leftJoy.active = true;
}

interface TouchSlot {
	side: 'joystick' | 'trackpad';
	startX: number;
	startY: number;
	startTime?: number;
	lastX?: number;
	totalMovement?: number;
}

const trackSlots: Record<number, TouchSlot> = {};

function stageRect(): DOMRect {
	return stageEl.getBoundingClientRect();
}

function isTap(slot: TouchSlot): boolean {
	const dur = performance.now() - (slot.startTime ?? 0);
	return dur < TAP_MAX_DURATION && (slot.totalMovement ?? 0) < TAP_MAX_MOVEMENT;
}

function onTouchStart(e: TouchEvent): void {
	const rect = stageRect();
	const leftThreshold = rect.width * LEFT_ZONE_RATIO;
	for (const t of Array.from(e.changedTouches)) {
		const x = t.clientX - rect.left, y = t.clientY - rect.top;
		if (x < leftThreshold) {
			showRing(x, y);
			trackSlots[t.identifier] = { side: 'joystick', startX: x, startY: y };
		} else {
			trackSlots[t.identifier] = {
				side: 'trackpad',
				startX: x, startY: y, startTime: performance.now(),
				lastX: x, totalMovement: 0
			};
			mobile.rightPad.active = true;
		}
	}
}

function onTouchMove(e: TouchEvent): void {
	for (const t of Array.from(e.changedTouches)) {
		const slot = trackSlots[t.identifier];
		if (!slot) continue;
		const rect = stageRect();
		const x = t.clientX - rect.left, y = t.clientY - rect.top;
		if (slot.side === 'joystick') {
			updateJoystick(slot.startX, slot.startY, x, y);
		} else if (slot.lastX !== undefined) {
			const deltaX = x - slot.lastX;
			slot.lastX = x;
			slot.totalMovement = (slot.totalMovement ?? 0) + Math.abs(deltaX);
			mobile.rightPad.deltaX += deltaX;
			mobile.rightPad.active = true;
		}
	}
}

function onTouchEnd(e: TouchEvent): void {
	for (const t of Array.from(e.changedTouches)) {
		const slot = trackSlots[t.identifier];
		if (!slot) continue;
		if (slot.side === 'joystick') {
			hideRing();
		} else {
			if (isTap(slot)) mobile.rightPad.tapShoot = true;
			mobile.rightPad.deltaX = 0;
			mobile.rightPad.active = false;
		}
		delete trackSlots[t.identifier];
	}
}

function initMobileButtons(): void {
	const fireBtn = document.getElementById('mc-fire');
	const reloadBtn = document.getElementById('mc-reload');
	const pauseBtn = document.getElementById('mc-pause');

	if (fireBtn) {
		fireBtn.addEventListener('touchstart', (e) => {
			e.preventDefault();
			e.stopPropagation();
			fireBtn.classList.add('active');
			mobile.fireHeld = true;
		}, { passive: false });
		fireBtn.addEventListener('touchend', (e) => {
			e.preventDefault();
			e.stopPropagation();
			fireBtn.classList.remove('active');
			mobile.fireHeld = false;
		}, { passive: false });
		fireBtn.addEventListener('touchcancel', () => {
			fireBtn.classList.remove('active');
			mobile.fireHeld = false;
		}, { passive: false });
	}

	if (reloadBtn) {
		reloadBtn.addEventListener('touchstart', (e) => {
			e.preventDefault();
			e.stopPropagation();
			reloadBtn.classList.add('active');
			mobile.reloadPressed = true;
		}, { passive: false });
		reloadBtn.addEventListener('touchend', (e) => {
			e.preventDefault();
			reloadBtn.classList.remove('active');
		}, { passive: false });
		reloadBtn.addEventListener('touchcancel', () => {
			reloadBtn.classList.remove('active');
		}, { passive: false });
		reloadBtn.addEventListener('mousedown', () => { mobile.reloadPressed = true; });
	}

	if (pauseBtn) {
		pauseBtn.addEventListener('touchstart', (e) => {
			e.preventDefault();
			e.stopPropagation();
			mobile.pausePressed = true;
		}, { passive: false });
		pauseBtn.addEventListener('click', () => { mobile.pausePressed = true; });
	}
}

function initInput(): void {
	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);

	canvas.addEventListener('click', onCanvasClick);
	canvas.addEventListener('mousedown', onMouseDown);
	document.addEventListener('mouseup', onMouseUp);
	document.addEventListener('mousemove', onMouseMove);
	document.addEventListener('pointerlockchange', onPointerLockChange);

	canvas.addEventListener('touchstart', onTouchStart, { passive: false });
	canvas.addEventListener('touchmove', onTouchMove, { passive: false });
	canvas.addEventListener('touchend', onTouchEnd, { passive: false });
	canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

	stageEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

	initMobileButtons();
}

function clearInput(): void {
	mobile.rightPad.tapShoot = false;
	mobile.reloadPressed = false;
	mobile.pausePressed = false;
	escapePressed = false;
	mobile.leftJoy.dx = 0;
	mobile.leftJoy.dy = 0;
	mobile.leftJoy.active = false;
}

// ─── AUDIO ──────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudio(): AudioContext | null {
	try {
		if (!audioCtx) {
			const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctor) return null;
			audioCtx = new Ctor();
		}
		if (audioCtx.state === 'suspended') void audioCtx.resume();
		return audioCtx;
	} catch {
		return null;
	}
}

function playSFX(type: OscillatorType, freq = 440, dur = 0.12, vol = 0.25): void {
	try {
		const ac = getAudio();
		if (!ac) return;
		const osc = ac.createOscillator();
		const gain = ac.createGain();
		const dist = ac.createWaveShaper();
		const curve = new Float32Array(256);
		for (let i = 0; i < 256; i++) curve[i] = (i / 128 - 1) * 3;
		dist.curve = curve;
		osc.type = type;
		osc.frequency.setValueAtTime(freq, ac.currentTime);
		osc.frequency.exponentialRampToValueAtTime(freq * 0.1, ac.currentTime + dur);
		gain.gain.setValueAtTime(vol, ac.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
		osc.connect(dist).connect(gain).connect(ac.destination);
		osc.start();
		osc.stop(ac.currentTime + dur);
	} catch {
		/* ignore audio errors */
	}
}

const playShoot = () => playSFX('sawtooth', 200, 0.08, 0.3);
const playHit = () => playSFX('square', 120, 0.1, 0.2);
const playDie = () => playSFX('sawtooth', 80, 0.4, 0.35);
const playPickup = () => playSFX('sine', 880, 0.15, 0.2);
const playEmpty = () => playSFX('square', 60, 0.05, 0.15);

let musicEl: HTMLAudioElement | null = null;

function startMusic(): void {
	if (!musicEl) {
		musicEl = new Audio('/assets/randy-danger/hell-keep.mp3');
		musicEl.loop = true;
		musicEl.volume = 0.4;
	}
	musicEl.currentTime = 0;
	musicEl.play().catch(() => {});
}

function stopMusic(): void {
	if (musicEl) {
		musicEl.pause();
		musicEl.currentTime = 0;
	}
}

function pauseMusic(): void {
	musicEl?.pause();
}

function resumeMusic(): void {
	musicEl?.play().catch(() => {});
}

// ─── HUD ────────────────────────────────────────────────────────────
function updateHUD(player: Player): void {
	const hp = Math.max(0, player.hp);
	const healthVal = document.getElementById('health-val');
	if (healthVal) {
		healthVal.textContent = String(Math.ceil(hp));
		healthVal.className = 'hud-value' + (hp < 30 ? ' danger' : hp < 60 ? ' warn' : '');
	}

	const healthBar = document.getElementById('health-bar-inner');
	if (healthBar) {
		healthBar.style.width = (hp / player.maxHp) * 100 + '%';
		healthBar.style.background = hp < 30 ? 'var(--danger)' : hp < 60 ? 'var(--warning)' : 'var(--success)';
	}

	const ammoEl = document.getElementById('ammo-val');
	if (ammoEl) {
		ammoEl.textContent = player.reloading ? 'RELOADING' : String(player.ammo);
		ammoEl.className = 'hud-value' + (player.ammo <= 0 ? ' danger' : player.ammo < 8 ? ' warn' : '');
	}
}

function updateScoreboard(score: number, wave: number, kills: number): void {
	const scoreEl = document.getElementById('score-val');
	const waveEl = document.getElementById('wave-val');
	const killsEl = document.getElementById('kills-val');
	if (scoreEl) scoreEl.textContent = String(score);
	if (waveEl) waveEl.textContent = String(wave);
	if (killsEl) killsEl.textContent = String(kills);
}

function addMsg(text: string, isDanger = false): void {
	const container = document.getElementById('messages');
	if (!container) return;
	const el = document.createElement('div');
	el.className = 'msg' + (isDanger ? ' danger-msg' : '');
	el.textContent = text;
	container.appendChild(el);
	setTimeout(() => el.remove(), 2700);
}

function flashHit(): void {
	const el = document.getElementById('hit-flash');
	if (!el) return;
	el.classList.add('flash');
	setTimeout(() => el.classList.remove('flash'), 120);
}

// ─── SCREENS ────────────────────────────────────────────────────────
const GAMEOVER_MSGS = [
	'Randy got got. Happens to the best of us.',
	'Even legends have bad days.',
	"Randy's down. Not out. But definitely down.",
	"Carl would've done worse, honestly."
];

const VICTORY_MSGS = ['They never stood a chance. Randy is THAT guy.'];

const SCREEN_IDS = ['title-screen', 'pause-screen', 'gameover-screen', 'victory-screen'];

function showScreen(id: string | null): void {
	for (const sid of SCREEN_IDS) {
		const el = document.getElementById(sid);
		if (el) el.style.display = sid === id ? '' : 'none';
	}
}

function showHUD(visible: boolean): void {
	const hud = document.getElementById('hud');
	const crosshair = document.getElementById('crosshair');
	if (hud) hud.style.display = visible ? '' : 'none';
	if (crosshair) crosshair.style.display = visible ? '' : 'none';
}

function releasePointerLock(): void {
	if (document.pointerLockElement) document.exitPointerLock();
}

function goToTitle(): void {
	showScreen('title-screen');
	showHUD(false);
	game.state = 'title';
	stopMusic();
	releasePointerLock();
}

function pauseGame(): void {
	game.state = 'paused';
	showScreen('pause-screen');
	pauseMusic();
	releasePointerLock();
}

function resumeGame(): void {
	game.state = 'playing';
	showScreen(null);
	resumeMusic();
}

function gameOver(): void {
	game.state = 'gameover';
	showScreen('gameover-screen');
	showHUD(false);
	const msgEl = document.getElementById('gameover-msg');
	if (msgEl) msgEl.textContent = GAMEOVER_MSGS[Math.floor(Math.random() * GAMEOVER_MSGS.length)];
	const statsEl = document.getElementById('final-stats');
	if (statsEl && game.core) {
		statsEl.innerHTML = `Score: ${game.core.score} &nbsp;|&nbsp; Kills: ${game.core.kills} &nbsp;|&nbsp; Wave: ${game.wave}`;
	}
	stopMusic();
	releasePointerLock();
}

function winWave(): void {
	game.wave++;
	game.state = 'victory';
	showScreen('victory-screen');
	showHUD(false);
	const msgEl = document.getElementById('victory-msg');
	if (msgEl) msgEl.textContent = VICTORY_MSGS[Math.floor(Math.random() * VICTORY_MSGS.length)];
	const statsEl = document.getElementById('victory-stats');
	if (statsEl && game.core) {
		statsEl.innerHTML = `Score: ${game.core.score} &nbsp;|&nbsp; Kills: ${game.core.kills} &nbsp;|&nbsp; Next wave: ${game.wave}`;
	}
	stopMusic();
	releasePointerLock();
}

function onGameStart(): void {
	showScreen(null);
	showHUD(true);
	game.state = 'playing';
	addMsg("Randy's on the job. Heaven help us.", false);
	startMusic();
}

// ─── RENDERER ───────────────────────────────────────────────────────
function renderScene(): void {
	const core = game.core;
	if (!core) return;
	const p = core.player;
	const cols = COLS;
	const scale = W / cols;

	ctx.fillStyle = CEIL_COLOR;
	ctx.fillRect(0, 0, W, HALF_H);
	ctx.fillStyle = FLOOR_COLOR;
	ctx.fillRect(0, HALF_H, W, H - HALF_H);

	const zBuffer = new Float32Array(cols);
	for (let col = 0; col < cols; col++) {
		const rayAngle = p.angle - HALF_FOV + (col / cols) * FOV;
		const { dist, wall } = castRay(core.map, core.enemies, p.x, p.y, rayAngle);
		zBuffer[col] = dist;
		if (wall === 0) continue;
		const corrected = dist * Math.cos(rayAngle - p.angle);
		const wallH = Math.min(H, (H / corrected) | 0);
		const wallTop = (HALF_H - wallH / 2) | 0;
		const shade = Math.max(0, 1 - dist / MAX_DEPTH);
		const colors = WALL_COLORS[Math.min(wall, WALL_COLORS.length - 1)] || WALL_COLORS[1];
		const base = (colors as string[])[col % 2 === 0 ? 0 : 1];
		ctx.fillStyle = shadeColor(base, shade);
		ctx.fillRect(col * scale, wallTop, Math.ceil(scale), wallH);
		const gradH = Math.floor(wallH * 0.1);
		ctx.fillStyle = 'rgba(0,0,0,0.4)';
		ctx.fillRect(col * scale, wallTop, Math.ceil(scale), gradH);
		ctx.fillRect(col * scale, wallTop + wallH - gradH, Math.ceil(scale), gradH);
	}

	const allSprites: Array<{ type: 'enemy' | 'ammo'; obj: Enemy | AmmoPickup }> = [];
	for (const e of core.enemies) {
		if (!e.alive) continue;
		const dx = e.x - p.x, dy = e.y - p.y;
		e.dist = Math.sqrt(dx * dx + dy * dy);
		allSprites.push({ type: 'enemy', obj: e });
	}
	for (const a of game.ammoPickups) {
		if (!a.active) continue;
		const dx = a.x - p.x, dy = a.y - p.y;
		a.dist = Math.sqrt(dx * dx + dy * dy);
		allSprites.push({ type: 'ammo', obj: a });
	}
	allSprites.sort((a, b) => b.obj.dist - a.obj.dist);

	for (const sp of allSprites) {
		const obj = sp.obj;
		const dx = obj.x - p.x, dy = obj.y - p.y;
		const dist = obj.dist;
		if (dist < 0.2) continue;
		let spriteAngle = Math.atan2(dy, dx) - p.angle;
		while (spriteAngle > Math.PI) spriteAngle -= 2 * Math.PI;
		while (spriteAngle < -Math.PI) spriteAngle += 2 * Math.PI;
		if (Math.abs(spriteAngle) > HALF_FOV + 0.3) continue;

		const proj = (spriteAngle / FOV + 0.5) * W;
		const spriteH = Math.min(H * 2, (H / dist) | 0);
		const spriteW = spriteH;
		const sx = (proj - spriteW / 2) | 0;
		const sy = (HALF_H - spriteH / 2) | 0;
		const shade = Math.max(0.2, 1 - dist / MAX_DEPTH);

		const startCol = Math.max(0, (sx / (W / cols)) | 0);
		const endCol = Math.min(cols - 1, ((sx + spriteW) / (W / cols)) | 0);
		let blocked = true;
		for (let c = startCol; c <= endCol; c++) {
			if (zBuffer[c] > dist) { blocked = false; break; }
		}
		if (blocked) continue;

		if (sp.type === 'enemy') drawEnemy(obj as Enemy, sx, sy, spriteW, spriteH, shade);
		else drawAmmoPickup(obj as AmmoPickup, sx, sy, spriteW, spriteH, shade);
	}

	drawGun();
}

function drawGun(): void {
	const core = game.core;
	if (!core) return;
	const cx = W / 2, cy = H;
	const bob = Math.sin(game.gunBob) * 6;
	const flash = game.gunShootFlash;
	const gw = Math.min(W * 0.45, 220);
	const gh = gw * 0.7;
	const gx = cx - gw / 2;
	const gy = cy - gh * 0.6 + bob;

	ctx.save();
	ctx.fillStyle = flash > 0.5 ? '#aaccaa' : '#556655';
	ctx.fillRect(gx + gw * 0.42, gy + gh * 0.18, gw * 0.16, gh * 0.28);
	ctx.fillStyle = flash > 0.5 ? '#88aa88' : '#3a4a3a';
	ctx.beginPath();
	ctx.moveTo(gx + gw * 0.32, gy + gh * 0.38);
	ctx.lineTo(gx + gw * 0.68, gy + gh * 0.38);
	ctx.lineTo(gx + gw * 0.72, gy + gh);
	ctx.lineTo(gx + gw * 0.28, gy + gh);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = '#223322';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(gx + gw * 0.5, gy + gh * 0.75, gw * 0.1, 0, Math.PI);
	ctx.stroke();
	if (flash > 0) {
		ctx.fillStyle = `rgba(255,220,100,${flash})`;
		ctx.beginPath();
		ctx.arc(gx + gw * 0.5, gy + gh * 0.18, gw * 0.07 * flash, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawEnemy(e: Enemy, sx: number, sy: number, sw: number, sh: number, shade: number): void {
	ctx.save();
	const bodyAlpha = Math.max(0.1, shade);
	ctx.globalAlpha = bodyAlpha;
	const headR = sh * 0.18;
	const headX = sx + sw / 2, headY = sy + headR * 1.2;
	ctx.fillStyle = '#cc9966';
	ctx.beginPath();
	ctx.arc(headX, headY, headR, 0, Math.PI * 2);
	ctx.fill();
	const bx = sx + sw * 0.25, by = sy + sh * 0.38;
	const bw = sw * 0.5, bh = sh * 0.38;
	ctx.fillStyle = '#4a5a2a';
	ctx.fillRect(bx, by, bw, bh);
	ctx.fillStyle = '#2a1a0a';
	ctx.fillRect(bx, by + bh * 0.75, bw, bh * 0.15);
	ctx.fillStyle = '#3a4a2a';
	ctx.fillRect(bx, by + bh, bw * 0.42, sh * 0.22);
	ctx.fillRect(bx + bw * 0.58, by + bh, bw * 0.42, sh * 0.22);
	if (e.hp < e.maxHp) {
		ctx.globalAlpha = 0.85;
		const barW = sw * 0.8, barH = 4;
		const barX = sx + sw * 0.1, barY = sy - 8;
		ctx.fillStyle = '#330000';
		ctx.fillRect(barX, barY, barW, barH);
		ctx.fillStyle = '#00ff50';
		ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
	}
	ctx.globalAlpha = 1;
	ctx.restore();
}

function drawAmmoPickup(a: AmmoPickup, sx: number, sy: number, sw: number, sh: number, shade: number): void {
	ctx.save();
	ctx.globalAlpha = Math.max(0.3, shade);
	const cx = sx + sw / 2, cy = sy + sh * 0.6;
	const r = Math.min(sw, sh) * 0.22;
	ctx.fillStyle = '#ccaa00';
	ctx.fillRect(cx - r * 0.4, cy - r * 1.2, r * 0.8, r * 2.2);
	ctx.fillStyle = '#ffdd33';
	ctx.fillRect(cx - r * 0.55, cy - r * 1.2, r * 1.1, r * 0.5);
	ctx.globalAlpha = 1;
	ctx.restore();
}

function drawMinimap(): void {
	const core = game.core;
	if (!core) return;
	const ms = 5, ox = 8, oy = 8;
	const mw = MAP_W * ms, mh = MAP_H * ms;
	ctx.save();
	ctx.globalAlpha = 0.7;
	ctx.fillStyle = '#000a00';
	ctx.fillRect(ox - 2, oy - 2, mw + 4, mh + 4);
	for (let my = 0; my < MAP_H; my++) {
		for (let mx = 0; mx < MAP_W; mx++) {
			const tile = core.map[my * MAP_W + mx];
			ctx.fillStyle = tile !== 0 ? '#2a5a2a' : '#0a1a0a';
			ctx.fillRect(ox + mx * ms, oy + my * ms, ms - 1, ms - 1);
		}
	}
	for (const e of core.enemies) {
		if (!e.alive) continue;
		ctx.fillStyle = '#ff3333';
		ctx.fillRect(ox + e.x * ms - 1, oy + e.y * ms - 1, 3, 3);
	}
	for (const a of game.ammoPickups) {
		if (!a.active) continue;
		ctx.fillStyle = '#ffdd33';
		ctx.fillRect(ox + a.x * ms - 1, oy + a.y * ms - 1, 3, 3);
	}
	const p = core.player;
	ctx.fillStyle = '#00ff50';
	ctx.fillRect(ox + p.x * ms - 2, oy + p.y * ms - 2, 4, 4);
	ctx.strokeStyle = '#00ff50';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(ox + p.x * ms, oy + p.y * ms);
	ctx.lineTo(ox + (p.x + Math.cos(p.angle) * 2) * ms, oy + (p.y + Math.sin(p.angle) * 2) * ms);
	ctx.stroke();
	ctx.globalAlpha = 1;
	ctx.restore();
}

function renderTitleAnimation(): void {
	ctx.fillStyle = '#000a00';
	ctx.fillRect(0, 0, W, H);
	game.titleAngle += 0.008;
	ctx.fillStyle = CEIL_COLOR;
	ctx.fillRect(0, 0, W, H / 2);
	ctx.fillStyle = FLOOR_COLOR;
	ctx.fillRect(0, H / 2, W, H / 2);
	const vanishX = W / 2, vanishY = H / 2;
	for (let i = 1; i <= 6; i++) {
		const t = i / 6;
		const wallW = W * t, wallH = H * t;
		const x1 = vanishX - wallW / 2, y1 = vanishY - wallH / 2;
		const shade = Math.floor(30 + 30 * t);
		ctx.strokeStyle = `rgb(0,${shade},0)`;
		ctx.lineWidth = 1;
		ctx.strokeRect(x1, y1, wallW, wallH);
	}
	for (let y = 0; y < H; y += 4) {
		ctx.fillStyle = 'rgba(0,0,0,0.2)';
		ctx.fillRect(0, y, W, 2);
	}
}

function updateDebug(): void {
	game._frames++;
	const n = performance.now();
	game._ft = n - (game._prev || n);
	game._prev = n;
	if (!game._lastDbg) game._lastDbg = n;
	if (n - game._lastDbg >= 1000) {
		game._fps = (game._frames * 1000) / (n - game._lastDbg);
		game._frames = 0;
		game._lastDbg = n;
	}
}

function drawDebug(): void {
	ctx.save();
	ctx.fillStyle = 'rgba(0,0,0,0.7)';
	ctx.fillRect(W - 140, 0, 140, 16);
	ctx.font = '10px monospace';
	ctx.fillStyle = game._fps < 30 ? '#ff4444' : '#00ff50';
	ctx.fillText(`FPS:${game._fps.toFixed(0)} ${game._ft.toFixed(1)}ms`, W - 135, 12);
	ctx.restore();
}

// ─── GAME FLOW ──────────────────────────────────────────────────────
function handleStartGame(): void {
	const map = buildMap(game.wave);
	const player = createPlayer();
	game.core = { map, player, enemies: spawnEnemies(game.wave, map), score: 0, kills: 0 };
	game.ammoPickups = spawnAmmo();
	game.gameTime = 0;
	game.gunBob = 0;
	game.gunShootFlash = 0;
	onGameStart();
	updateHUD(player);
	updateScoreboard(game.core.score, game.wave, game.core.kills);
}

function applyAutoAim(): void {
	const core = game.core;
	if (!core) return;
	const p = core.player;
	let closestDiff: number | null = null;
	let closestAngle = AUTO_AIM_ANGLE;
	for (const e of core.enemies) {
		if (!e.alive) continue;
		const dx = e.x - p.x, dy = e.y - p.y;
		const targetAngle = Math.atan2(dy, dx);
		let diff = targetAngle - p.angle;
		while (diff > Math.PI) diff -= Math.PI * 2;
		while (diff < -Math.PI) diff += Math.PI * 2;
		const absDiff = Math.abs(diff);
		if (absDiff < closestAngle) {
			closestDiff = diff;
			closestAngle = absDiff;
		}
	}
	if (closestDiff !== null) {
		const strength = 1 - closestAngle / AUTO_AIM_ANGLE;
		p.angle += closestDiff * strength * 0.12;
	}
}

function triggerShoot(): boolean {
	const core = game.core;
	if (!core) return false;
	const result = shoot(core);
	if (result.outOfAmmo) {
		playEmpty();
		addMsg('Out of ammo! Press R!', true);
		return false;
	}
	if (!result.shot) return false;
	playShoot();
	if (result.killed) {
		playDie();
		addMsg(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
	} else if (result.enemyHpLeft !== null) {
		playHit();
		addMsg(`Hit! ${result.enemyHpLeft} HP left`);
	}
	if (result.waveClear) {
		winWave();
		return true;
	}
	return false;
}

function update(dt: number): void {
	const core = game.core;
	if (game.state !== 'playing' || !core) return;
	const p = core.player;
	game.gameTime += dt;

	const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
	const spd = p.speed * (sprint ? 1.6 : 1);
	const fwd = (keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -1 : 0)
		+ (mobile.leftJoy.active ? -mobile.leftJoy.dy : 0);
	const strafe = (keys['KeyD'] ? 1 : keys['KeyA'] ? -1 : 0)
		+ (mobile.leftJoy.active ? mobile.leftJoy.dx : 0);
	const moveX = Math.cos(p.angle) * fwd * spd * dt + Math.cos(p.angle + Math.PI / 2) * strafe * spd * dt;
	const moveY = Math.sin(p.angle) * fwd * spd * dt + Math.sin(p.angle + Math.PI / 2) * strafe * spd * dt;

	const kbRot = (keys['ArrowLeft'] ? -1 : 0) + (keys['ArrowRight'] ? 1 : 0);
	p.angle += kbRot * ROT_SPEED * dt;
	if (mouse.locked) {
		p.angle += mouse.dx * 0.003;
		mouse.dx = 0;
	}
	if (mobile.rightPad.active) {
		p.angle += mobile.rightPad.deltaX * TRACKPAD_SENSITIVITY;
		mobile.rightPad.deltaX = 0;
		applyAutoAim();
	}

	moveWithCollision(core.map, p, moveX, moveY);

	const moving = moveX !== 0 || moveY !== 0;
	game.gunBob += moving ? dt * 6 : 0;
	if (game.gunShootFlash > 0) game.gunShootFlash -= dt * 5;

	if (p.shootCool > 0) p.shootCool -= dt;

	if (p.reloading) {
		p.reloadT -= dt;
		if (p.reloadT <= 0) {
			finishReload(p);
			playPickup();
			addMsg('Locked and loaded, baby.');
		}
	}

	if (mobile.rightPad.tapShoot) {
		if (triggerShoot()) return;
	}
	if ((keys['Space'] && mouse.locked) || mobile.fireHeld || (mouse.down && mouse.locked)) {
		if (triggerShoot()) return;
	}

	if (mobile.reloadPressed) {
		if (reload(p)) addMsg('Reloading...');
	}

	for (const a of game.ammoPickups) {
		if (!a.active) continue;
		const dx = a.x - p.x, dy = a.y - p.y;
		a.dist = Math.sqrt(dx * dx + dy * dy);
		if (a.dist < 0.7 && (keys['KeyE'] || a.dist < 0.5)) {
			if (p.ammo < p.maxAmmo) {
				p.ammo = Math.min(p.maxAmmo, p.ammo + a.amount);
				a.active = false;
				playPickup();
				addMsg('+10 ammo. Classic Randy.');
			}
		}
	}

	const enemyResult = updateEnemies(dt, core.map, core.player, core.enemies);
	for (const ev of enemyResult.events) {
		if (ev.type === 'shot') {
			flashHit();
			playHit();
			addMsg(OUCH_QUIPS[Math.floor(Math.random() * OUCH_QUIPS.length)], true);
		}
	}
	if (enemyResult.playerDied) {
		gameOver();
		return;
	}

	updateHUD(p);
	updateScoreboard(core.score, game.wave, core.kills);
}

function loop(timestamp: number): void {
	const dt = Math.min((timestamp - game.lastTime) / 1000, 0.05);
	game.lastTime = timestamp;
	updateDebug();

	ctx.clearRect(0, 0, W, H);

	if (game.state === 'title' || game.state === 'gameover' || game.state === 'victory') {
		renderTitleAnimation();
	} else if (game.state === 'playing' || game.state === 'paused') {
		renderScene();
		drawMinimap();
	}
	drawDebug();

	if (game.state === 'playing') update(dt);

	if (escapePressed) {
		escapePressed = false;
		if (game.state === 'playing') pauseGame();
		else if (game.state === 'paused') resumeGame();
	}
	if (mobile.pausePressed) {
		mobile.pausePressed = false;
		if (game.state === 'playing') pauseGame();
		else if (game.state === 'paused') resumeGame();
	}

	clearInput();
	requestAnimationFrame(loop);
}

// Test hooks kept from the source — used by automated browser checks.
function installDebugHooks(): void {
	window.render_game_to_text = function () {
		const core = game.core;
		return JSON.stringify({
			state: game.state,
			player: core
				? {
						x: +core.player.x.toFixed(2),
						y: +core.player.y.toFixed(2),
						angle: +core.player.angle.toFixed(2),
						hp: core.player.hp,
						ammo: core.player.ammo
					}
				: null,
			enemies: (core?.enemies ?? []).filter((e) => e.alive).map((e) => ({ x: +e.x.toFixed(2), y: +e.y.toFixed(2), hp: e.hp })),
			score: core?.score ?? 0,
			kills: core?.kills ?? 0,
			wave: game.wave
		});
	};
	window.advanceTime = function (ms: number) {
		const steps = Math.max(1, Math.round(ms / (1000 / 60)));
		for (let i = 0; i < steps; i++) update(1 / 60);
	};
}

declare global {
	interface Window {
		render_game_to_text?: () => string;
		advanceTime?: (ms: number) => void;
	}
}

// ─── INIT ───────────────────────────────────────────────────────────
function requireEl<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Randy Danger: missing #${id}`);
	return el as T;
}

export function initRandydangerApp(): void {
	canvas = requireEl<HTMLCanvasElement>('gameCanvas');
	const ctx2d = canvas.getContext('2d');
	if (!ctx2d) return;
	ctx = ctx2d;
	stageEl = requireEl<HTMLElement>('stage');

	window.addEventListener('resize', resize);
	resize();

	requireEl<HTMLDivElement>('mc-overlay');
	ringL = makeRing('ring-left');

	initInput();
	goToTitle();

	requireEl<HTMLButtonElement>('start-btn').addEventListener('click', handleStartGame);
	requireEl<HTMLButtonElement>('btn-resume').addEventListener('click', resumeGame);
	requireEl<HTMLButtonElement>('btn-pause-menu').addEventListener('click', goToTitle);
	requireEl<HTMLButtonElement>('btn-retry').addEventListener('click', handleStartGame);
	requireEl<HTMLButtonElement>('btn-gameover-menu').addEventListener('click', goToTitle);
	requireEl<HTMLButtonElement>('btn-next-wave').addEventListener('click', handleStartGame);
	requireEl<HTMLButtonElement>('btn-victory-menu').addEventListener('click', goToTitle);

	installDebugHooks();

	game.lastTime = performance.now();
	requestAnimationFrame(loop);
}
