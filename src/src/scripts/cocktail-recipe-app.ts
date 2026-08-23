/**
 * Cocktail recipe tool DOM wiring — document/URL/localStorage access lives here.
 * Pure math (units, batch scaling, freezer tags, presets) is in `lib/cocktail.ts`;
 * encode/decode plumbing in `lib/url-state.ts` (LZString is a classic global
 * loaded by the page).
 */
import {
	PRESETS,
	baseTotals,
	computeBatch as computeBatchPure,
	fmt,
	freezerTag,
	fromMl,
	toMl,
	type Ingredient,
	type ScaleMode,
	type PreparationMethod
} from '../lib/cocktail';
import { encodeState, decodeState, getParamsFor, linkWithParams } from '../lib/url-state';

declare const LZString: { decompressFromEncodedURIComponent(s: string): string | null } | undefined;
declare const htmlToImage: {
	toPng(node: HTMLElement, opts?: Record<string, unknown>): Promise<string>;
} | undefined;

// -------- App Mode --------
interface CocktailApp {
	mode: 'manage' | 'view';
	batchMode: boolean;
	preparationMethod: PreparationMethod;
	recipe: { name: string; ingredients: Ingredient[]; createdAt: number };
	batchSettings: { scaleMode: 'servings' | 'volume'; targetValue: number; dilution: number };
	lastURLWriteOk: boolean;
}

const app: CocktailApp = {
	mode: 'manage',
	batchMode: false,
	preparationMethod: 'none',
	recipe: {
		name: '',
		ingredients: [],
		createdAt: Date.now()
	},
	batchSettings: {
		scaleMode: 'servings',
		targetValue: 1,
		dilution: 0.2
	},
	lastURLWriteOk: true
};

// -------- App state --------
const STORAGE_KEY = 'cocktail_recipe_tool_v1';

let recipe: Ingredient[] = [
	{ emoji: '🍸', name: 'Gin', amount: 2, unit: 'oz', abv: 40 },
	{ emoji: '🍋', name: 'Lemon juice', amount: 1, unit: 'oz', abv: 0 },
	{ emoji: '🍯', name: 'Simple syrup', amount: 0.75, unit: 'oz', abv: 0 }
];

// -------- DOM helpers --------
function el<T extends HTMLElement = HTMLElement>(id: string): T {
	const node = document.getElementById(id);
	if (!node) throw new Error(`cocktail-recipe: missing #${id} in markup`);
	return node as T;
}

function initPresetSelect(): void {
	const s = el<HTMLSelectElement>('presetSelect');
	s.innerHTML = '';
	PRESETS.forEach((p, i) => {
		const opt = document.createElement('option');
		opt.value = String(i);
		opt.textContent = `${p.emoji} ${p.name} (${p.abv}% ABV)`;
		s.appendChild(opt);
	});
}

// -------- Compression & URL helpers --------
// Chunk size for delimiter insertion (helps iMessage URL detection);
// encode/decode live in lib/url-state (shared with splitcheck).
const CHUNK_SIZE = 120;
const DELIMITER = '.';

interface EncodedState {
	n: string;
	i: Array<{ e: string; n: string; a: number; u: string; ab: number }>;
	no: string;
	bm: boolean;
	pm: string;
	du: string;
	bs?: { sm: string; tv: string | number; d: number; tu?: string };
	// legacy fields
	sm?: string;
	tt?: string;
	tu?: string;
	sv?: string;
	dm?: string;
	cd?: string;
}

function encodeChunked(obj: unknown): string | null {
	return encodeState(obj, { chunkSize: CHUNK_SIZE, delimiter: DELIMITER });
}

function decodeChunked<T = unknown>(str: string): T | null {
	return decodeState<T>(str, DELIMITER);
}

function getParams(): { v: string | null; e: string | null } {
	const p = getParamsFor(['v', 'e']);
	return { v: p.v, e: p.e };
}

function buildLink(kind: 'view' | 'edit'): string | null {
	// kind: 'view' => v=, 'manage' => e=
	const encoded = encodeChunked(getStateForEncoding());
	if (!encoded) return null;
	return linkWithParams(kind === 'view' ? { v: encoded } : { e: encoded });
}

function getStateForEncoding(): EncodedState {
	const state: EncodedState = {
		n: app.recipe.name || '',
		i: recipe.map((ing) => ({
			e: ing.emoji,
			n: ing.name,
			a: ing.amount,
			u: ing.unit,
			ab: ing.abv
		})),
		no: el<HTMLInputElement>('cardNoteInput').value || '',
		bm: app.batchMode,
		pm: app.preparationMethod || 'none',
		du: el<HTMLSelectElement>('displayUnit').value
	};

	// Only include batch settings if batch mode is enabled
	if (app.batchMode) {
		const sm = getScaleMode();
		state.bs = {
			sm,
			tv: el<HTMLInputElement>(sm === 'servings' ? 'servings' : 'targetTotal').value,
			d: getDilutionPct()
		};

		// Include target unit only if in volume mode
		if (sm === 'total') {
			state.bs.tu = el<HTMLSelectElement>('targetUnit').value;
		}
	}

	return state;
}

function decodeStateToApp(state: Partial<EncodedState> | null): boolean {
	if (!state) return false;

	try {
		syncNameInputs(state.n || '');
		el<HTMLInputElement>('cardNoteInput').value = state.no || '';

		// Decode recipe from new format
		if (Array.isArray(state.i)) {
			recipe = state.i.map((ing) => ({
				emoji: ing.e,
				name: ing.n,
				amount: ing.a,
				unit: ing.u,
				abv: ing.ab
			}));
		}

		// Preparation method (defaults to 'none' for backward compatibility)
		app.preparationMethod = (state.pm as PreparationMethod) || 'none';
		el<HTMLSelectElement>('preparationMethod').value = app.preparationMethod;

		// Display unit is always present
		el<HTMLSelectElement>('displayUnit').value = state.du ?? 'ml';

		// Check if this is the new format (with bm field) or old format (with sm field)
		if (state.bm !== undefined) {
			// NEW FORMAT: Hierarchical batch mode and settings
			app.batchMode = state.bm;

			if (state.bs && app.batchMode) {
				// Restore batch settings
				app.batchSettings = {
					scaleMode: (state.bs.sm as 'servings' | 'volume') || 'servings',
					targetValue: Number(state.bs.tv) || 1,
					dilution: state.bs.d || 0.2
				};

				// Apply settings to DOM
				const radio = document.querySelector<HTMLInputElement>(
					`input[name="scaleMode"][value="${state.bs.sm || 'servings'}"]`
				);
				if (radio) radio.checked = true;

				if (state.bs.sm === 'servings') {
					el<HTMLInputElement>('servings').value = String(state.bs.tv || '1');
				} else {
					el<HTMLInputElement>('targetTotal').value = String(state.bs.tv || '750');
					el<HTMLSelectElement>('targetUnit').value = state.bs.tu || 'ml';
				}

				// Convert dilution decimal to mode and custom value
				const dilution = state.bs.d || 0.2;
				if (dilution === 0) {
					el<HTMLSelectElement>('dilutionMode').value = 'none';
				} else if (dilution === 0.2) {
					el<HTMLSelectElement>('dilutionMode').value = 'stirred';
				} else if (dilution === 0.3) {
					el<HTMLSelectElement>('dilutionMode').value = 'shaken';
				} else {
					el<HTMLSelectElement>('dilutionMode').value = 'custom';
					el<HTMLInputElement>('customDilution').value = String(dilution * 100);
				}
			}
		} else {
			// OLD FORMAT: Backward compatibility
			app.batchMode = false; // Default to false for old links
			const radio = document.querySelector<HTMLInputElement>(
				`input[name="scaleMode"][value="${state.sm || 'total'}"]`
			);
			if (radio) radio.checked = true;
			el<HTMLInputElement>('targetTotal').value = state.tt ?? '750';
			el<HTMLSelectElement>('targetUnit').value = state.tu ?? 'ml';
			el<HTMLInputElement>('servings').value = state.sv ?? '10';
			el<HTMLSelectElement>('dilutionMode').value = state.dm ?? 'stirred';
			el<HTMLInputElement>('customDilution').value = state.cd ?? '20';
		}

		applyScaleVisibility();

		return true;
	} catch (e) {
		console.error('Failed to decode state:', e);
		return false;
	}
}

function applyScaleVisibility(): void {
	const mode = getScaleMode();
	el('totalRow').style.display = mode === 'total' ? '' : 'none';
	el('servingsRow').style.display = mode === 'servings' ? '' : 'none';
	el('customDilution').style.display = el<HTMLSelectElement>('dilutionMode').value === 'custom' ? '' : 'none';
}

function parseURLIntoState(): boolean {
	const { v, e } = getParams();

	if (v) {
		app.mode = 'view';
		const parsed = decodeChunked<EncodedState>(v);
		if (parsed && decodeStateToApp(parsed)) return true;
	}

	if (e) {
		app.mode = 'manage';
		const parsed = decodeChunked<EncodedState>(e);
		if (parsed && decodeStateToApp(parsed)) return true;
	}

	if ((v || e) && typeof LZString === 'undefined') {
		toast('Could not read shared recipe (compression library failed to load)');
	}

	app.mode = 'manage';
	return false;
}

function writeManageURL(): void {
	if (app.mode !== 'manage') return;

	const url = new URL(window.location.href);
	url.searchParams.delete('v');
	const encoded = encodeChunked(getStateForEncoding());
	if (encoded === null) {
		// LZ-String failed to load; keep the current URL rather than corrupt it
		app.lastURLWriteOk = false;
		return;
	}
	url.searchParams.set('e', encoded);

	if (url.toString().length > 2000) {
		app.lastURLWriteOk = false;
		return;
	}
	app.lastURLWriteOk = true;
	history.replaceState({}, '', url);
}

const writeManageURLDebounced = (() => {
	let t: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (t !== null) clearTimeout(t);
		t = setTimeout(writeManageURL, 300);
	};
})();

// -------- Helpers --------
function toast(msg: string): void {
	const t = el('toast');
	t.textContent = msg;
	t.classList.add('show');
	setTimeout(() => t.classList.remove('show'), 2200);
}

function getScaleMode(): ScaleMode {
	return document.querySelector<HTMLInputElement>('input[name="scaleMode"]:checked')?.value as ScaleMode;
}

function getDilutionPct(): number {
	const mode = el<HTMLSelectElement>('dilutionMode').value;
	if (mode === 'none') return 0;
	if (mode === 'shaken') return 0.3;
	if (mode === 'stirred') return 0.2;
	if (mode === 'custom') return Number(el<HTMLInputElement>('customDilution').value || 0) / 100;
	return 0;
}

function methodLabel(): string {
	const mode = el<HTMLSelectElement>('dilutionMode').value;
	if (mode === 'none') return 'No dilution';
	if (mode === 'stirred') return 'Stirred';
	if (mode === 'shaken') return 'Shaken';
	if (mode === 'custom') return 'Custom dilution';
	return '—';
}

function computeBatch() {
	return computeBatchPure({
		recipe,
		scaleMode: getScaleMode(),
		servings: el<HTMLInputElement>('servings').value,
		targetTotal: el<HTMLInputElement>('targetTotal').value,
		targetUnit: el<HTMLSelectElement>('targetUnit').value,
		dilutionPct: getDilutionPct()
	});
}

// -------- Rendering --------
function applyModeUI(): void {
	const modeNotice = el('modeNotice');
	const manageUI = el('manageUI');
	const settingsColumn = el('settingsColumn');
	const shareRecipeBtn = document.getElementById('share-recipe-btn');
	const copyToEditBtn = document.getElementById('copy-to-edit-btn');
	const recipeNameInput = document.getElementById('recipe-name') as HTMLInputElement | null;
	const batchToggle = document.getElementById('batch-mode-toggle') as HTMLInputElement | null;

	if (app.mode === 'view') {
		modeNotice.textContent = '📖 View-only mode - Recipe is read-only';
		modeNotice.className = 'mode-notice mode-notice--view';
		modeNotice.style.display = 'block';
		manageUI.style.display = 'none';

		// In view mode, hide settings column, only show recipe card
		settingsColumn.style.display = 'none';

		// Show "Copy to Edit" button, hide "Share Recipe" button
		if (shareRecipeBtn) shareRecipeBtn.style.display = 'none';
		if (copyToEditBtn) copyToEditBtn.style.display = 'inline-block';

		// Disable recipe name input in view mode
		if (recipeNameInput) recipeNameInput.disabled = true;

		// Disable and sync batch toggle in view mode
		if (batchToggle) {
			batchToggle.disabled = true;
			batchToggle.checked = app.batchMode;
		}
	} else {
		modeNotice.textContent = '✏️ Edit mode - Share the view link with others';
		modeNotice.className = 'mode-notice mode-notice--manage';
		modeNotice.style.display = 'block';
		manageUI.style.display = 'block';
		settingsColumn.style.display = 'flex';

		// Show "Share Recipe" button, hide "Copy to Edit" button
		if (shareRecipeBtn) shareRecipeBtn.style.display = 'inline-block';
		if (copyToEditBtn) copyToEditBtn.style.display = 'none';

		// Enable recipe name input in manage mode
		if (recipeNameInput) recipeNameInput.disabled = false;

		// Enable and sync batch toggle in manage mode
		if (batchToggle) {
			batchToggle.disabled = false;
			batchToggle.checked = app.batchMode;
		}
	}
}

function updateBaseKpis(): void {
	const { baseTotal, ethanol } = baseTotals(recipe);
	el('baseTotalMl').textContent = fmt(baseTotal, 1);
	el('baseEthanolMl').textContent = fmt(ethanol, 1);
}

function renderRecipe(): void {
	const tb = el('recipeTbody');
	tb.innerHTML = '';

	const canEdit = app.mode === 'manage';

	recipe.forEach((ing, idx) => {
		const tr = document.createElement('tr');

		const tdName = document.createElement('td');
		tdName.textContent = `${ing.emoji} ${ing.name}`;
		tr.appendChild(tdName);

		const tdAmt = document.createElement('td');
		tdAmt.className = 'right';
		if (canEdit) {
			const amt = document.createElement('input');
			amt.type = 'number';
			amt.step = '0.01';
			amt.min = '0';
			amt.value = String(ing.amount);
			amt.setAttribute('aria-label', `Amount of ${ing.name}`);
			amt.oninput = () => {
				ing.amount = Number(amt.value || 0);
				updateBaseKpis();
				calculateAndRenderCard();
				writeManageURLDebounced();
			};
			tdAmt.appendChild(amt);
		} else {
			tdAmt.textContent = `${fmt(ing.amount, 2)} ${ing.unit}`;
		}
		tr.appendChild(tdAmt);

		const tdUnit = document.createElement('td');
		if (canEdit) {
			const unit = document.createElement('select');
			unit.setAttribute('aria-label', `Unit for ${ing.name}`);
			['ml', 'oz', 'cup', 'l'].forEach((u) => {
				const o = document.createElement('option');
				o.value = u;
				o.textContent = u;
				if (u === ing.unit) o.selected = true;
				unit.appendChild(o);
			});
			unit.onchange = () => {
				ing.unit = unit.value;
				updateBaseKpis();
				calculateAndRenderCard();
				writeManageURLDebounced();
			};
			tdUnit.appendChild(unit);
		} else {
			tdUnit.textContent = ing.unit;
		}
		tr.appendChild(tdUnit);

		const tdAbv = document.createElement('td');
		tdAbv.className = 'right';
		if (canEdit) {
			const abv = document.createElement('input');
			abv.type = 'number';
			abv.step = '0.1';
			abv.min = '0';
			abv.max = '100';
			abv.value = String(ing.abv);
			abv.setAttribute('aria-label', `ABV percent for ${ing.name}`);
			abv.oninput = () => {
				ing.abv = Number(abv.value || 0);
				updateBaseKpis();
				calculateAndRenderCard();
				writeManageURLDebounced();
			};
			tdAbv.appendChild(abv);
		} else {
			tdAbv.textContent = `${ing.abv}%`;
		}
		tr.appendChild(tdAbv);

		const tdMove = document.createElement('td');
		tdMove.className = 'center';
		if (canEdit) {
			const up = document.createElement('button');
			up.className = 'icon-button';
			up.textContent = '↑';
			up.disabled = idx === 0;
			up.onclick = () => {
				[recipe[idx - 1], recipe[idx]] = [recipe[idx], recipe[idx - 1]];
				renderRecipe();
				calculateAndRenderCard();
				writeManageURLDebounced();
			};
			const down = document.createElement('button');
			down.className = 'icon-button';
			down.textContent = '↓';
			down.disabled = idx === recipe.length - 1;
			down.onclick = () => {
				[recipe[idx + 1], recipe[idx]] = [recipe[idx], recipe[idx + 1]];
				renderRecipe();
				calculateAndRenderCard();
				writeManageURLDebounced();
			};
			tdMove.appendChild(up);
			tdMove.appendChild(down);
		}
		tr.appendChild(tdMove);

		const tdX = document.createElement('td');
		tdX.className = 'center';
		if (canEdit) {
			const x = document.createElement('button');
			x.className = 'icon-button icon-button--danger';
			x.textContent = '✕';
			x.onclick = () => {
				recipe.splice(idx, 1);
				renderRecipe();
				calculateAndRenderCard();
				writeManageURLDebounced();
			};
			tdX.appendChild(x);
		}
		tr.appendChild(tdX);

		tb.appendChild(tr);
	});

	updateBaseKpis();
}

function setHeadline(msg: string, kind: 'ok' | 'danger' = 'ok'): void {
	const pill = el('headlinePill');
	pill.textContent = msg;
	pill.className = `status-pill status-pill--${kind}`;
}

function calculateAndRenderCard(): void {
	// Update normal mode card
	updateNormalModeCard();

	// Update batch mode card (if batch mode is enabled)
	if (!app.batchMode) return;

	el('cardTitle').textContent = app.recipe.name || 'Batch Cocktail';

	const batch = computeBatch();
	if (!batch) {
		el('cardFinalVol').textContent = '—';
		el('cardAbv').textContent = '—';
		el('cardWater').textContent = '—';
		el('cardBody').innerHTML = '';
		setHeadline('Add ingredients', 'danger');
		return;
	}

	const dispUnit = el<HTMLSelectElement>('displayUnit').value;

	el('tagMethod').textContent = `Method: ${methodLabel()}`;
	const freezer = freezerTag(batch.abvPct);
	el('tagFreezer').textContent = `Freezer: ${freezer.label}`;
	el('tagFreezer').className = `tag tag--${freezer.cls}`;

	el('cardMeta').textContent =
		getScaleMode() === 'servings'
			? `Scaled to ${batch.servings} servings (dilution ${fmt(batch.dilutionPct * 100, 1)}%)`
			: `Scaled to target total (dilution ${fmt(batch.dilutionPct * 100, 1)}%)`;

	const finalDisp = fromMl(batch.finalMl, dispUnit);
	el('cardFinalVol').textContent = `${fmt(finalDisp, dispUnit === 'ml' ? 0 : 2)} ${dispUnit}`;

	el('cardAbv').textContent = `${fmt(batch.abvPct, 1)}%`;

	const waterDisp = fromMl(batch.waterMl, dispUnit);
	el('cardWater').textContent = `${fmt(waterDisp, dispUnit === 'ml' ? 0 : 2)} ${dispUnit}`;

	const body = el('cardBody');
	body.innerHTML = '';
	batch.scaled.forEach((i) => {
		const tr = document.createElement('tr');
		const td1 = document.createElement('td');
		td1.textContent = `${i.emoji} ${i.name}`;
		const td2 = document.createElement('td');
		td2.className = 'right';
		const v = fromMl(i.ml, dispUnit);
		td2.textContent = `${fmt(v, dispUnit === 'ml' ? 0 : 2)} ${dispUnit}`;
		tr.appendChild(td1);
		tr.appendChild(td2);
		body.appendChild(tr);
	});

	const noteInput = el<HTMLInputElement>('cardNoteInput').value.trim();
	if (noteInput) {
		el('cardNotes').textContent = `Notes: ${noteInput}`;
		el('cardNotes').style.display = 'block';
	} else {
		el('cardNotes').style.display = 'none';
	}

	if (getScaleMode() === 'servings') {
		setHeadline(`Scaled ×${fmt(batch.scale, 2)} (servings)`);
	} else {
		const tgtMl = toMl(el<HTMLInputElement>('targetTotal').value, el<HTMLSelectElement>('targetUnit').value);
		setHeadline(`Target ${fmt(tgtMl, 0)} ml final • ABV ${fmt(batch.abvPct, 1)}%`);
	}
}

function updateNormalModeCard(): void {
	const name = app.recipe.name || 'My Cocktail';
	el('normalCardTitle').textContent = name;

	// Calculate totals for single serving
	const totalVolume = recipe.reduce((sum, ing) => sum + toMl(ing.amount, ing.unit), 0);
	const totalAlcohol = recipe.reduce((sum, ing) => sum + (toMl(ing.amount, ing.unit) * ing.abv) / 100, 0);
	const finalABV = totalVolume > 0 ? (totalAlcohol / totalVolume) * 100 : 0;

	// Update stats
	el('normalCardVol').textContent = recipe.length > 0 ? `${Math.round(totalVolume)} ml` : '—';
	el('normalCardAbv').textContent = recipe.length > 0 ? `${finalABV.toFixed(1)}%` : '—';

	// Update preparation method
	const prepLabels: Record<string, string> = {
		none: 'Build in glass',
		stirred: 'Stirred',
		shaken: 'Shaken'
	};
	el('normalCardPrep').textContent = prepLabels[app.preparationMethod] || '—';
	el('normalTagMethod').textContent = `Method: ${prepLabels[app.preparationMethod] || 'None'}`;

	// Update ingredients
	const body = el('normalCardBody');
	body.innerHTML = '';

	if (recipe.length === 0) {
		setHeadline('Add ingredients', 'danger');
		return;
	}

	recipe.forEach((ing) => {
		const tr = document.createElement('tr');
		const td1 = document.createElement('td');
		td1.textContent = `${ing.emoji} ${ing.name}`;
		const td2 = document.createElement('td');
		td2.className = 'right';
		td2.textContent = `${ing.amount} ${ing.unit}`;
		tr.appendChild(td1);
		tr.appendChild(td2);
		body.appendChild(tr);
	});

	setHeadline('Ready');
}

function syncAll(): void {
	applyModeUI();
	updateBatchVisibility();
	renderRecipe();
	calculateAndRenderCard();
	if (app.mode === 'manage') writeManageURLDebounced();
}

// -------- State Persistence --------
// Single source of truth for the cocktail name is app.recipe.name;
// both name inputs (#cocktailName, #recipe-name) mirror it.
function syncNameInputs(name: string): void {
	app.recipe.name = name || '';
	for (const input of [document.getElementById('cocktailName'), document.getElementById('recipe-name')]) {
		if (input && (input as HTMLInputElement).value !== app.recipe.name) {
			(input as HTMLInputElement).value = app.recipe.name;
		}
	}
}

function setRecipeName(name: string): void {
	syncNameInputs(name);
	calculateAndRenderCard();
	writeManageURLDebounced();
	saveState();
}

interface SavedState {
	cocktailName?: string;
	cardNote?: string;
	recipe?: Ingredient[];
	preparationMethod?: PreparationMethod;
	batchMode?: boolean;
	scaleMode?: string;
	targetTotal?: string;
	targetUnit?: string;
	servings?: string;
	dilutionMode?: string;
	customDilution?: string;
	displayUnit?: string;
}

// The only shape written to STORAGE_KEY: autosave and the Save button
// both go through here. `recipe` is the live ingredient-row array.
function saveState(): void {
	const state: SavedState = {
		cocktailName: app.recipe.name,
		cardNote: el<HTMLInputElement>('cardNoteInput').value || '',
		recipe: recipe.map((i) => ({ ...i })),
		preparationMethod: app.preparationMethod,
		batchMode: app.batchMode,
		scaleMode: getScaleMode(),
		targetTotal: el<HTMLInputElement>('targetTotal').value,
		targetUnit: el<HTMLSelectElement>('targetUnit').value,
		servings: el<HTMLInputElement>('servings').value,
		dilutionMode: el<HTMLSelectElement>('dilutionMode').value,
		customDilution: el<HTMLInputElement>('customDilution').value,
		displayUnit: el<HTMLSelectElement>('displayUnit').value
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState(): boolean {
	let state: SavedState | null;
	try {
		state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as SavedState | null;
	} catch (e) {
		console.warn('Discarding unreadable cocktail state:', e);
		return false;
	}
	if (!state) return false;

	// Legacy autosave blobs stored {recipe: {name, ingredients, ...}} with the
	// ingredients never populated. Only the flat shape (recipe as an array)
	// written by saveState is valid.
	if (!Array.isArray(state.recipe)) {
		console.warn('Discarding legacy cocktail state with unrecognized shape');
		return false;
	}

	syncNameInputs(state.cocktailName || '');
	el<HTMLInputElement>('cardNoteInput').value = state.cardNote || '';
	recipe = state.recipe.map((i) => ({
		emoji: i.emoji || '',
		name: i.name || '',
		amount: Number(i.amount) || 0,
		unit: i.unit || 'ml',
		abv: Number(i.abv) || 0
	}));

	app.preparationMethod = state.preparationMethod || 'none';
	el<HTMLSelectElement>('preparationMethod').value = app.preparationMethod;

	app.batchMode = !!state.batchMode;
	const batchToggle = document.getElementById('batch-mode-toggle') as HTMLInputElement | null;
	if (batchToggle) batchToggle.checked = app.batchMode;

	const radio = document.querySelector<HTMLInputElement>(`input[name="scaleMode"][value="${state.scaleMode || 'total'}"]`);
	if (radio) radio.checked = true;
	el<HTMLInputElement>('targetTotal').value = state.targetTotal ?? '750';
	el<HTMLSelectElement>('targetUnit').value = state.targetUnit ?? 'ml';
	el<HTMLInputElement>('servings').value = state.servings ?? '10';
	el<HTMLSelectElement>('dilutionMode').value = state.dilutionMode ?? 'stirred';
	el<HTMLInputElement>('customDilution').value = state.customDilution ?? '20';
	el<HTMLSelectElement>('displayUnit').value = state.displayUnit || 'ml';

	// Restore visibility that depends on the loaded controls
	applyScaleVisibility();

	return true;
}

function updateBatchVisibility(): void {
	const batchSection = document.getElementById('batch-calculator');
	const normalCardSection = document.getElementById('normal-mode-card-section');

	if (batchSection) {
		batchSection.style.display = app.batchMode ? 'block' : 'none';
	}
	if (normalCardSection) {
		normalCardSection.style.display = app.batchMode ? 'none' : 'block';
	}
}

function wireEvents(): void {
	// Share recipe button (edit mode) - copies view link
	document.getElementById('share-recipe-btn')?.addEventListener('click', () => {
		const link = buildLink('view');
		if (!link) return toast('Sharing unavailable (compression library failed to load)');
		void navigator.clipboard.writeText(link);
		toast('Recipe link copied!');
	});

	// Copy to edit button (view mode)
	document.getElementById('copy-to-edit-btn')?.addEventListener('click', () => {
		const link = buildLink('edit');
		if (!link) return toast('Editing unavailable (compression library failed to load)');
		window.location.href = link;
	});

	el('addPresetBtn').addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		const p = PRESETS[Number(el<HTMLSelectElement>('presetSelect').value)];
		recipe.push({ ...p, amount: 1, unit: 'oz' });
		syncAll();
		toast('Added ingredient');
	});

	el('addCustomBtn').addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		const emoji = (el<HTMLInputElement>('custEmoji').value || '🧪').trim();
		const name = (el<HTMLInputElement>('custName').value || 'Custom').trim();
		const abv = Number(el<HTMLInputElement>('custAbv').value || 0);

		recipe.push({ emoji, name, amount: 1, unit: 'oz', abv });
		el<HTMLInputElement>('custEmoji').value = '';
		el<HTMLInputElement>('custName').value = '';
		el<HTMLInputElement>('custAbv').value = '';
		syncAll();
		toast('Added custom ingredient');
	});

	// Both name inputs drive the same source of truth (app.recipe.name)
	el('cocktailName').addEventListener('input', (e) => {
		setRecipeName((e.target as HTMLInputElement).value);
	});
	el('cardNoteInput').addEventListener('input', () => {
		calculateAndRenderCard();
		writeManageURLDebounced();
	});

	document.getElementById('recipe-name')?.addEventListener('input', (e) => {
		setRecipeName((e.target as HTMLInputElement).value);
	});

	// Preparation method listener
	el('preparationMethod').addEventListener('change', (e) => {
		app.preparationMethod = (e.target as HTMLSelectElement).value as PreparationMethod;
		calculateAndRenderCard();
		saveState();
		writeManageURLDebounced();
	});

	// Batch mode toggle listener
	const batchToggle = document.getElementById('batch-mode-toggle') as HTMLInputElement | null;
	batchToggle?.addEventListener('change', (e) => {
		app.batchMode = (e.target as HTMLInputElement).checked;
		saveState();
		updateBatchVisibility();
		calculateAndRenderCard(); // recalc so the freshly-shown card isn't stale
		writeManageURLDebounced();
	});

	document.querySelectorAll<HTMLInputElement>('input[name="scaleMode"]').forEach((r) => {
		r.addEventListener('change', () => {
			applyScaleVisibility();
			calculateAndRenderCard();
			writeManageURLDebounced();
		});
	});

	['targetTotal', 'targetUnit', 'servings', 'displayUnit'].forEach((id) => {
		el(id).addEventListener('input', () => {
			calculateAndRenderCard();
			writeManageURLDebounced();
		});
		el(id).addEventListener('change', () => {
			calculateAndRenderCard();
			writeManageURLDebounced();
		});
	});

	el('dilutionMode').addEventListener('change', () => {
		const mode = el<HTMLSelectElement>('dilutionMode').value;
		el('customDilution').style.display = mode === 'custom' ? '' : 'none';
		if (mode === 'custom') el<HTMLInputElement>('customDilution').value = '25';
		if (mode === 'stirred') el<HTMLInputElement>('customDilution').value = '20';
		if (mode === 'shaken') el<HTMLInputElement>('customDilution').value = '30';
		calculateAndRenderCard();
		writeManageURLDebounced();
	});

	el('customDilution').addEventListener('input', () => {
		calculateAndRenderCard();
		writeManageURLDebounced();
	});
	el('calcBtn').addEventListener('click', () => {
		calculateAndRenderCard();
		writeManageURLDebounced();
	});

	el('clearBtn').addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		recipe = [];
		syncAll();
		toast('Cleared');
	});

	el('exampleBtn').addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		recipe = [
			{ emoji: '🥃', name: 'Bourbon', amount: 2, unit: 'oz', abv: 45 },
			{ emoji: '🍋', name: 'Lemon juice', amount: 0.75, unit: 'oz', abv: 0 },
			{ emoji: '🍯', name: 'Simple syrup', amount: 0.75, unit: 'oz', abv: 0 },
			{ emoji: '🌿', name: 'Bitters', amount: 0.1, unit: 'oz', abv: 44 }
		];
		setRecipeName('Whiskey Sour-ish Batch');
		el<HTMLSelectElement>('dilutionMode').value = 'shaken';
		el<HTMLInputElement>('customDilution').value = '30';
		syncAll();
		toast('Loaded example');
	});

	el('saveBtn').addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		saveState();
		toast('Saved');
	});

	el('loadBtn').addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		if (!localStorage.getItem(STORAGE_KEY)) return toast('Nothing saved yet');
		if (!loadState()) return toast('No valid saved recipe');
		syncAll();
		toast('Loaded');
	});

	el('exportBtn').addEventListener('click', async () => {
		if (typeof htmlToImage === 'undefined') return toast('Export unavailable (image library failed to load)');
		const node = el('card');
		try {
			toast('Rendering PNG…');
			const dataUrl = await htmlToImage.toPng(node, {
				pixelRatio: 2,
				cacheBust: true,
				backgroundColor: '#ffffff'
			});
			const a = document.createElement('a');
			const name = (el<HTMLInputElement>('cocktailName').value || 'batch-recipe').trim().replace(/[^\w-]+/g, '_');
			a.download = `${name}.png`;
			a.href = dataUrl;
			a.click();
			toast('Downloaded PNG');
		} catch (err) {
			console.error(err);
			toast('Export failed (try another browser)');
		}
	});

	el('exportNormalBtn').addEventListener('click', async () => {
		if (typeof htmlToImage === 'undefined') return toast('Export unavailable (image library failed to load)');
		const node = el('normalCard');
		try {
			toast('Rendering PNG…');
			const dataUrl = await htmlToImage.toPng(node, {
				pixelRatio: 2,
				cacheBust: true,
				backgroundColor: '#ffffff'
			});
			const a = document.createElement('a');
			const name = (app.recipe.name || el<HTMLInputElement>('cocktailName').value || 'recipe')
				.trim()
				.replace(/[^\w-]+/g, '_');
			a.download = `${name}.png`;
			a.href = dataUrl;
			a.click();
			toast('Downloaded PNG');
		} catch (err) {
			console.error(err);
			toast('Export failed (try another browser)');
		}
	});

	window.addEventListener('popstate', () => {
		parseURLIntoState();
		syncAll();
	});
}

/** Boot the cocktail recipe tool (call on DOMContentLoaded). */
export function initCocktailRecipeApp(): void {
	initPresetSelect();
	wireEvents();

	// -------- Init --------
	loadState();
	parseURLIntoState();
	syncAll();

	// Creator flow: if no params, create manage link immediately
	const { v, e } = getParams();
	if (!v && !e) {
		app.mode = 'manage';
		const encoded = encodeChunked(getStateForEncoding());
		if (encoded !== null) {
			const url = new URL(window.location.origin + window.location.pathname);
			url.searchParams.set('e', encoded);
			history.replaceState({}, '', url);
		}
		syncAll();
	}
}
