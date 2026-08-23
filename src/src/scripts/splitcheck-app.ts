/**
 * SplitCheck DOM wiring — document/URL/clipboard access lives here.
 * Pure math is in `lib/splitcheck.ts`; encode/decode plumbing in
 * `lib/url-state.ts` (LZString is loaded as a classic global by the page).
 */
import {
	computeBalances,
	computeSettlements,
	participantsOf,
	round2,
	type Expense,
	type SplitCheckState
} from '../lib/splitcheck';
import { escapeHtml } from '../lib/escape-html';
import { encodeState, decodeState, getParamsFor, linkWithParams, debounce } from '../lib/url-state';

// Provided by the lz-string CDN script on the page (classic, blocking) —
// guaranteed defined before this deferred module executes.
declare const LZString: {
	compressToEncodedURIComponent(input: string): string;
	decompressFromEncodedURIComponent(input: string): string | null;
};
void LZString; // referenced only via lib/url-state; declaration keeps the contract visible

// Internal mechanics:
// - "view" link uses param e
// - "manage" link uses param d
//
// UX rules:
// - View pages never show alternate links or "manage" affordances.
// - Manage pages show both "view link" and "manage link".
// - Top-right "Copy link" behaves contextually:
//   - In view mode: copies the current (view) link
//   - In manage mode: copies the view link (default share-first)

const DEFAULT_STATE: SplitCheckState = { people: [], expenses: [] };

type Mode = 'manage' | 'view';

const app = {
	data: structuredClone(DEFAULT_STATE) as SplitCheckState,
	mode: 'manage' as Mode,
	lastURLWriteOk: true
};

interface SplitcheckEls {
	modeValue: HTMLElement;
	modeNotice: HTMLElement;
	topActions: HTMLElement | null;
	copyLinkBtn: HTMLButtonElement;
	manageUI: HTMLElement;
	viewUI: HTMLElement;
	copyViewBtn: HTMLButtonElement | null;
	copyManageBtn: HTMLButtonElement | null;
	shareStatus: HTMLElement | null;
	urlBox: HTMLInputElement | null;
	urlLen: HTMLElement | null;
	personName: HTMLInputElement;
	addPersonBtn: HTMLButtonElement;
	peopleList: HTMLElement;
	expenseDesc: HTMLInputElement;
	expenseAmount: HTMLInputElement;
	expensePayer: HTMLSelectElement;
	splitType: HTMLSelectElement;
	customSplitInputs: HTMLElement;
	customHint: HTMLElement;
	addExpenseBtn: HTMLButtonElement;
	exportBtn: HTMLButtonElement | null;
	importBtn: HTMLButtonElement | null;
	resetBtn: HTMLButtonElement | null;
	ioStatus: HTMLElement | null;
	expensesList: HTMLElement;
	balancesList: HTMLElement;
	settlementsList: HTMLElement;
}

const els = {} as SplitcheckEls;

/** Fail fast with a clear message if the markup contract is broken. */
function req<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`splitcheck: missing #${id} in markup`);
	return el as T;
}

function bindEls(): void {
	els.modeValue = req('modeValue');
	els.modeNotice = req('modeNotice');

	els.topActions = document.getElementById('topActions');
	els.copyLinkBtn = req('copyLinkBtn');

	els.manageUI = req('manageUI');
	els.viewUI = req('viewUI');

	els.copyViewBtn = document.getElementById('copyViewBtn') as HTMLButtonElement | null;
	els.copyManageBtn = document.getElementById('copyManageBtn') as HTMLButtonElement | null;
	els.shareStatus = document.getElementById('shareStatus');
	els.urlBox = document.getElementById('urlBox') as HTMLInputElement | null;
	els.urlLen = document.getElementById('urlLen');

	els.personName = req('personName');
	els.addPersonBtn = req('addPersonBtn');
	els.peopleList = req('peopleList');

	els.expenseDesc = req('expenseDesc');
	els.expenseAmount = req('expenseAmount');
	els.expensePayer = req('expensePayer');
	els.splitType = req('splitType');
	els.customSplitInputs = req('customSplitInputs');
	els.customHint = req('customHint');
	els.addExpenseBtn = req('addExpenseBtn');

	els.exportBtn = document.getElementById('exportBtn') as HTMLButtonElement | null;
	els.importBtn = document.getElementById('importBtn') as HTMLButtonElement | null;
	els.resetBtn = document.getElementById('resetBtn') as HTMLButtonElement | null;
	els.ioStatus = document.getElementById('ioStatus');

	els.expensesList = req('expensesList');
	els.balancesList = req('balancesList');
	els.settlementsList = req('settlementsList');
}

// --- URL helpers (encode/decode live in lib/url-state) ---
function getParams(): { e: string | null; d: string | null } {
	const p = getParamsFor(['e', 'd']);
	return { e: p.e, d: p.d };
}

function buildLink(kind: Mode): string | null {
	// kind: 'view' => e=, 'manage' => d=
	const encoded = encodeState(app.data);
	if (!encoded) return null;
	return linkWithParams(kind === 'view' ? { e: encoded } : { d: encoded });
}

function parseURLIntoState(): void {
	const { e, d } = getParams();

	if (e) {
		app.mode = 'view';
		const parsed = decodeState<SplitCheckState>(e);
		if (parsed && typeof parsed === 'object') app.data = parsed;
		return;
	}

	if (d) {
		app.mode = 'manage';
		const parsed = decodeState<SplitCheckState>(d);
		if (parsed && typeof parsed === 'object') app.data = parsed;
		return;
	}

	app.mode = 'manage';
	app.data = structuredClone(DEFAULT_STATE);
}

function writeManageURL(): void {
	if (app.mode !== 'manage') return;

	const encoded = encodeState(app.data);
	if (!encoded) {
		// CDN compression unavailable — don't write a bogus URL.
		app.lastURLWriteOk = false;
		renderURLMeta();
		return;
	}

	const url = new URL(window.location.href);
	url.searchParams.delete('e');
	url.searchParams.set('d', encoded);

	if (url.toString().length > 2000) {
		app.lastURLWriteOk = false;
		renderURLMeta();
		return;
	}
	app.lastURLWriteOk = true;
	history.replaceState({}, '', url);
	renderURLMeta();
}

const writeManageURLDebounced = debounce(writeManageURL, 300);

// --- Clipboard ---
async function copy(kind: Mode): Promise<void> {
	const url = buildLink(kind);
	if (!url) {
		if (els.shareStatus) {
			els.shareStatus.textContent = 'Could not build a share link (compression unavailable).';
			els.shareStatus.className = 'hint warn';
		}
		return;
	}
	const tooLong = url.length > 2000;

	try {
		await navigator.clipboard.writeText(url);
		if (els.shareStatus) {
			els.shareStatus.textContent = kind === 'view' ? 'Copied view link.' : 'Copied manage link.';
			els.shareStatus.className = 'hint ok';
		}
	} catch {
		if (els.shareStatus) {
			els.shareStatus.textContent = 'Could not copy automatically. Copy from the box below.';
			els.shareStatus.className = 'hint warn';
		}
	}

	if (els.urlBox) els.urlBox.value = url;
	renderURLMeta(tooLong);
}

// --- Manage actions ---
function addPerson(): void {
	if (app.mode !== 'manage') return;
	const name = (els.personName.value || '').trim();
	if (!name) return;
	if (app.data.people.includes(name)) return;
	app.data.people.push(name);
	els.personName.value = '';
	syncAll();
}

function removePerson(name: string): void {
	if (app.mode !== 'manage') return;
	// Removing a person only affects new expenses: past expenses keep
	// their participant snapshot, so history and balances stay intact.
	app.data.people = app.data.people.filter((p) => p !== name);
	syncAll();
}

function updatePayerSelect(): void {
	const opts = app.data.people
		.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
		.join('');
	els.expensePayer.innerHTML = opts;
}

function toggleCustomSplit(): void {
	const type = els.splitType.value;
	if (type === 'custom') {
		els.customSplitInputs.classList.remove('hidden');
		renderCustomSplitInputs();
	} else {
		els.customSplitInputs.classList.add('hidden');
		els.customSplitInputs.innerHTML = '';
		els.customHint.textContent = '';
	}
}

function renderCustomSplitInputs(): void {
	const people = app.data.people;
	if (!people.length) {
		els.customSplitInputs.innerHTML = '<div class="muted">Add people first.</div>';
		return;
	}
	els.customSplitInputs.innerHTML = people
		.map(
			(p) => `
				<div class="row" style="grid-template-columns:1fr 140px;align-items:center">
					<label for="cs_${cssId(p)}">${escapeHtml(p)}</label>
					<input id="cs_${cssId(p)}" class="form-control" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal" />
				</div>
			`
		)
		.join('');
	els.customHint.textContent = 'Custom amounts must sum exactly to the expense amount.';
	els.customHint.className = 'hint muted';
}

function addExpense(): void {
	if (app.mode !== 'manage') return;
	if (!app.data.people.length) return;

	const description = (els.expenseDesc.value || '').trim();
	const amount = Number(els.expenseAmount.value);
	const payer = els.expensePayer.value;
	const splitType = els.splitType.value;

	if (!description || !isFinite(amount) || amount <= 0 || !payer) return;

	const expense: Expense = {
		id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2),
		description,
		amount: round2(amount),
		payer,
		splitType,
		// Snapshot who is in the split right now, so later changes to the
		// people list never retroactively reshare this expense.
		participants: [...app.data.people]
	};

	if (splitType === 'custom') {
		const customSplits: Record<string, number> = {};
		let sum = 0;
		for (const person of app.data.people) {
			const el = document.getElementById(`cs_${cssId(person)}`) as HTMLInputElement | null;
			const val = Number(el?.value || 0);
			if (val > 0) {
				customSplits[person] = round2(val);
				sum += round2(val);
			}
		}
		sum = round2(sum);
		if (Math.abs(sum - expense.amount) > 0.01) {
			els.customHint.textContent = `Custom split sums to $${sum.toFixed(2)} but needs $${expense.amount.toFixed(2)}.`;
			els.customHint.className = 'hint warn';
			return;
		}
		expense.customSplits = customSplits;
	}

	app.data.expenses.push(expense);
	els.expenseDesc.value = '';
	els.expenseAmount.value = '';
	syncAll();
}

function removeExpense(id: string): void {
	if (app.mode !== 'manage') return;
	app.data.expenses = app.data.expenses.filter((e) => e.id !== id);
	syncAll();
}

// --- Rendering ---
function applyModeUI(): void {
	if (app.mode === 'view') {
		els.modeValue.textContent = 'View-only';
		els.modeNotice.textContent = 'This page is read-only.';
		els.modeNotice.className = 'notice view';
		els.modeNotice.classList.remove('hidden');

		els.manageUI.classList.add('hidden');
		els.viewUI.classList.remove('hidden');

		// In view mode, do not show any alternative links.
		if (els.urlBox) els.urlBox.value = '';
		els.copyLinkBtn.textContent = 'Copy link';
	} else {
		els.modeValue.textContent = 'Manage';
		els.modeNotice.textContent = 'Share the view link with friends. Keep the manage link private.';
		els.modeNotice.className = 'notice manage';
		els.modeNotice.classList.remove('hidden');

		els.manageUI.classList.remove('hidden');
		els.viewUI.classList.add('hidden');

		// Share-first: top "Copy link" copies view link.
		els.copyLinkBtn.textContent = 'Copy view link';
	}
}

function renderPeople(): void {
	els.peopleList.innerHTML = app.data.people.length
		? app.data.people
				.map(
					(p) => `
						<div class="chip">
							<span>${escapeHtml(p)}</span>
							<button class="retro-button retro-button--danger" type="button" aria-label="Remove ${escapeHtml(p)}" data-remove-person="${escapeHtml(p)}">×</button>
						</div>
					`
				)
				.join('')
		: `<div class="muted">Add at least 2 people to start splitting.</div>`;
}

function renderExpenses(): void {
	const canEdit = app.mode === 'manage';
	if (!app.data.expenses.length) {
		els.expensesList.innerHTML = `<div class="muted">No expenses yet.</div>`;
		return;
	}
	els.expensesList.innerHTML = app.data.expenses
		.map(
			(e) => `
				<div class="card">
					<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
						<div>
							<div><strong>${escapeHtml(e.description)}</strong></div>
						<div class="muted">$${Number(e.amount).toFixed(2)} • paid by ${escapeHtml(e.payer)} • ${e.splitType === 'even' ? `even split among ${participantsOf(e, app.data.people).length}` : 'custom split'}</div>
						</div>
						${canEdit ? `<button class="retro-button retro-button--danger" style="width:auto;padding:8px 10px" type="button" data-remove-expense="${escapeHtml(e.id)}">Delete</button>` : ``}
					</div>
				</div>
			`
		)
		.join('');
}

function renderBalancesAndSettlements(): void {
	const balances = computeBalances(app.data);
	// Key order: current people first, then anyone who only exists on
	// past expenses (removed but still owed / owing).
	const people = Object.keys(balances);

	els.balancesList.innerHTML = people.length
		? people
				.map((p) => {
					const amt = round2(balances[p] || 0);
					const cls = amt >= 0 ? 'card owes' : 'card is-owed';
					const label = amt >= 0 ? `Owes $${amt.toFixed(2)}` : `Is owed $${Math.abs(amt).toFixed(2)}`;
					const removed = app.data.people.includes(p) ? '' : ' <span class="muted">(removed)</span>';
					return `<div class="${cls}"><strong>${escapeHtml(p)}</strong>${removed}: ${label}</div>`;
				})
				.join('')
		: `<div class="muted">Add people to see balances.</div>`;

	const settlements = computeSettlements(balances);
	els.settlementsList.innerHTML = settlements.length
		? settlements
				.map((t) => `<div class="card settle">${escapeHtml(t.from)} pays ${escapeHtml(t.to)} <strong>$${t.amount.toFixed(2)}</strong></div>`)
				.join('')
		: `<div class="muted">No payments needed.</div>`;
}

function renderURLMeta(overrideTooLong: boolean | null = null): void {
	if (app.mode !== 'manage') return;

	const url = buildLink('manage'); // current working URL box in manage mode can show manage link by default
	if (!url) {
		if (els.urlLen) {
			els.urlLen.textContent = 'Share links unavailable (compression failed to load).';
			els.urlLen.className = 'hint warn';
		}
		return;
	}
	const tooLong = overrideTooLong === null ? url.length > 2000 : overrideTooLong;

	if (els.urlBox) els.urlBox.value = url;

	if (els.urlLen) {
		els.urlLen.textContent = `URL length: ${url.length} chars` + (app.lastURLWriteOk ? '' : ' (too long to auto-write)');
		els.urlLen.className = 'hint ' + (tooLong ? 'warn' : 'muted');
	}
}

function render(): void {
	applyModeUI();

	if (app.mode === 'manage') {
		renderPeople();
		updatePayerSelect();
		toggleCustomSplit();
	}

	renderExpenses();
	renderBalancesAndSettlements();
	renderURLMeta();
}

function syncAll(): void {
	render();
	writeManageURLDebounced();
}

// --- Import/Export/Reset (manage only) ---
async function exportJSON(): Promise<void> {
	if (app.mode !== 'manage') return;
	try {
		await navigator.clipboard.writeText(JSON.stringify(app.data, null, 2));
		if (els.ioStatus) {
			els.ioStatus.textContent = 'Copied JSON to clipboard.';
			els.ioStatus.className = 'hint ok';
		}
	} catch {
		if (els.ioStatus) {
			els.ioStatus.textContent = 'Could not copy JSON automatically.';
			els.ioStatus.className = 'hint warn';
		}
	}
}

async function importJSON(): Promise<void> {
	if (app.mode !== 'manage') return;
	const raw = prompt('Paste JSON:');
	if (!raw) return;
	try {
		const parsed = JSON.parse(raw) as SplitCheckState;
		if (!parsed || !Array.isArray(parsed.people) || !Array.isArray(parsed.expenses)) throw new Error('Bad shape');
		app.data = parsed;
		if (els.ioStatus) {
			els.ioStatus.textContent = 'Imported JSON.';
			els.ioStatus.className = 'hint ok';
		}
		syncAll();
	} catch {
		if (els.ioStatus) {
			els.ioStatus.textContent = 'Invalid JSON.';
			els.ioStatus.className = 'hint warn';
		}
	}
}

function resetAll(): void {
	if (app.mode !== 'manage') return;
	app.data = structuredClone(DEFAULT_STATE);
	const url = new URL(window.location.origin + window.location.pathname);
	const encoded = encodeState(app.data);
	if (encoded) url.searchParams.set('d', encoded);
	history.replaceState({}, '', url);
	els.customHint.textContent = '';
	if (els.shareStatus) els.shareStatus.textContent = '';
	syncAll();
}

// --- Utilities ---
function cssId(s: string): string {
	return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// --- Events ---
function wireEvents(): void {
	// Contextual top button:
	// - view: copies view link (current)
	// - manage: copies view link (default)
	els.copyLinkBtn.addEventListener('click', () => void copy('view'));

	// Manage-only share buttons
	els.copyViewBtn?.addEventListener('click', () => void copy('view'));
	els.copyManageBtn?.addEventListener('click', () => void copy('manage'));

	// Manage actions
	els.addPersonBtn.addEventListener('click', addPerson);
	els.personName.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			addPerson();
		}
	});

	els.splitType.addEventListener('change', () => {
		toggleCustomSplit();
	});

	els.addExpenseBtn.addEventListener('click', addExpense);

	els.peopleList.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-person]');
		if (!btn) return;
		const name = btn.getAttribute('data-remove-person');
		if (name && confirm(`Remove ${name}?`)) removePerson(name);
	});

	els.expensesList.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-expense]');
		if (!btn) return;
		const id = btn.getAttribute('data-remove-expense');
		if (id) removeExpense(id);
	});

	els.exportBtn?.addEventListener('click', () => void exportJSON());
	els.importBtn?.addEventListener('click', () => void importJSON());
	els.resetBtn?.addEventListener('click', () => {
		if (app.mode !== 'manage') return;
		if (confirm('Reset everything?')) resetAll();
	});

	document.addEventListener('keydown', (e) => {
		const key = e.key.toLowerCase();
		const mod = e.ctrlKey || e.metaKey;
		if (!mod) return;
		if (key === 'k' && !e.shiftKey) {
			e.preventDefault();
			void copy('view');
		}
		if (key === 'k' && e.shiftKey) {
			e.preventDefault();
			void copy('manage');
		}
	});

	window.addEventListener('popstate', () => {
		parseURLIntoState();
		render();
	});
}

/** Boot the SplitCheck app (call on DOMContentLoaded). */
export function initSplitcheckApp(): void {
	bindEls();
	parseURLIntoState();
	wireEvents();
	render();

	// Creator flow: if no params, create manage link immediately (so they can bookmark/return)
	const { e, d } = getParams();
	if (!e && !d) {
		const url = new URL(window.location.origin + window.location.pathname);
		const encoded = encodeState(app.data);
		if (encoded) {
			url.searchParams.set('d', encoded);
			history.replaceState({}, '', url);
		}
		app.mode = 'manage';
		els.modeValue.textContent = 'Manage';
		els.modeNotice.textContent = 'New split created. Share the view link with friends and keep the manage link private.';
		els.modeNotice.className = 'notice manage';
		els.modeNotice.classList.remove('hidden');
		els.manageUI.classList.remove('hidden');
		els.viewUI.classList.add('hidden');
		renderURLMeta();
	}

	// View mode: hide any hint/status areas that imply alternative links
	if (app.mode === 'view') {
		// remove share/status elements if present (defense-in-depth)
		if (els.manageUI) els.manageUI.classList.add('hidden');
		if (els.shareStatus) els.shareStatus.textContent = '';
	}
}
