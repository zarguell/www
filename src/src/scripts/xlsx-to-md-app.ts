/**
 * Excel → Markdown DOM wiring. File intake (drag & drop / picker), routing
 * between SheetJS (xlsx/xls/ods) and the lib's RFC 4180 parser (csv/tsv/txt),
 * option handling, and output (clipboard API + download).
 *
 * The source tool built markdown from `sheet_to_json` objects keyed by the
 * header row — any missing cell shifted every following column. This port
 * works on 2D arrays end-to-end, so ragged sheets pad instead of corrupting.
 */
import {
	parseDelimited,
	toMarkdownTable,
	trimGrid,
	type Delimiter,
	type Grid
} from '../lib/xlsx-to-md';

interface SheetJsWorksheet {
	['!ref']?: string;
}

interface SheetJsUtils {
	sheet_to_json(
		ws: SheetJsWorksheet,
		opts: { header: 1; raw: false; defval: string }
	): unknown[][];
}

interface SheetJsStatic {
	read(data: Uint8Array, opts: { type: 'array' }): {
		SheetNames: string[];
		Sheets: Record<string, SheetJsWorksheet>;
	};
	utils: SheetJsUtils;
}

declare global {
	interface Window {
		XLSX?: SheetJsStatic;
	}
}

interface SheetData {
	name: string;
	grid: Grid;
}

const SPREADSHEET_EXT = /\.(xlsx|xls|ods)$/i;
const TEXT_EXT = /\.(csv|tsv|txt)$/i;

const state = {
	sheets: [] as SheetData[],
	activeSheet: 0,
	fileName: ''
};

function setStatus(message: string, isError = false): void {
	const box = document.getElementById('x2mStatus');
	if (!box) return;
	box.textContent = message;
	box.classList.toggle('parse-status--error', isError);
}

function setBtnDisabled(id: string, disabled: boolean): void {
	const btn = document.getElementById(id) as HTMLButtonElement | null;
	if (!btn) return;
	btn.disabled = disabled;
	btn.classList.toggle('retro-button--disabled', disabled);
}

function gridFromAoa(aoa: unknown[][]): Grid {
	return aoa.map((row) => (row ?? []).map((cell) => String(cell ?? '')));
}

async function parseSpreadsheet(file: File): Promise<SheetData[]> {
	if (!window.XLSX) {
		throw new Error('The SheetJS engine has not loaded (network blocked?). Try a CSV/TSV file instead.');
	}
	const buf = await file.arrayBuffer();
	const wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
	const sheets: SheetData[] = [];
	for (const name of wb.SheetNames) {
		const aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[name], {
			header: 1,
			raw: false,
			defval: ''
		});
		sheets.push({ name, grid: gridFromAoa(aoa) });
	}
	return sheets;
}

function parseTextFile(file: File, forceDelimiter?: Delimiter): Promise<SheetData[]> {
	return file.text().then((text) => [
		{ name: file.name, grid: parseDelimited(text, forceDelimiter) }
	]);
}

async function routeFile(file: File): Promise<SheetData[]> {
	const name = file.name;
	if (SPREADSHEET_EXT.test(name)) return parseSpreadsheet(file);
	if (TEXT_EXT.test(name)) {
		// .tsv gets a forced tab; everything else sniffs , ; tab |
		const force: Delimiter | undefined = /\.tsv$/i.test(name) ? '\t' : undefined;
		return parseTextFile(file, force);
	}
	throw new Error(`Unsupported file type: ${name}. Use xlsx, xls, ods, csv, tsv, or txt.`);
}

function renderMarkdown(): void {
	const out = document.getElementById('x2mOutput') as HTMLTextAreaElement | null;
	if (!out) return;
	const sheet = state.sheets[state.activeSheet];
	if (!sheet) {
		out.value = '';
		return;
	}
	const header = (document.getElementById('x2mHeaderRow') as HTMLInputElement | null)?.checked ?? true;
	const skipEmpty = (document.getElementById('x2mSkipEmpty') as HTMLInputElement | null)?.checked ?? true;
	const grid = trimGrid(sheet.grid, skipEmpty, skipEmpty);
	if (!grid.length) {
		out.value = '';
		setStatus(`"${sheet.name}" has no rows left after cleanup.`, true);
		return;
	}
	out.value = toMarkdownTable(grid, { header, padColumns: true });
}

function refreshSheetPicker(): void {
	const picker = document.getElementById('x2mSheetPicker') as HTMLSelectElement | null;
	if (!picker) return;
	picker.innerHTML = '';
	if (state.sheets.length <= 1) {
		picker.style.display = 'none';
		return;
	}
	picker.style.display = '';
	for (const [i, sheet] of state.sheets.entries()) {
		const opt = document.createElement('option');
		opt.value = String(i);
		const rows = sheet.grid.length;
		opt.textContent = `${sheet.name} (${rows} row${rows === 1 ? '' : 's'})`;
		picker.appendChild(opt);
	}
	picker.value = String(state.activeSheet);
}

function adoptSheets(sheets: SheetData[], fileName: string): void {
	const nonEmpty = sheets.filter((s) => s.grid.length > 0);
	if (!nonEmpty.length) {
		setStatus(`"${fileName}" parsed, but no rows were found.`, true);
		return;
	}
	state.sheets = nonEmpty;
	state.activeSheet = 0;
	state.fileName = fileName;
	refreshSheetPicker();
	renderMarkdown();
	const sheetWord = nonEmpty.length === 1 ? 'sheet' : `${nonEmpty.length} sheets`;
	const rows = nonEmpty[0].grid.length;
	setStatus(`Converted ${fileName} — ${sheetWord}, first sheet has ${rows} rows.`);
}

async function handleFile(file: File | null | undefined): Promise<void> {
	if (!file) {
		setStatus('Choose a spreadsheet file first.', true);
		return;
	}
	setStatus(`Converting ${file.name}...`);
	try {
		const sheets = await routeFile(file);
		adoptSheets(sheets, file.name);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Could not convert: ${message}`, true);
	}
}

function convertPasted(): void {
	const box = document.getElementById('x2mPasteText') as HTMLTextAreaElement | null;
	const text = (box?.value ?? '').trim();
	if (!text) {
		setStatus('Paste some CSV/TSV text first.', true);
		return;
	}
	adoptSheets([{ name: 'pasted-text', grid: parseDelimited(text) }], 'pasted-text');
}

async function copyOutput(): Promise<void> {
	const out = document.getElementById('x2mOutput') as HTMLTextAreaElement | null;
	if (!out?.value) {
		setStatus('Nothing to copy yet — convert a file first.', true);
		return;
	}
	try {
		await navigator.clipboard.writeText(out.value);
		setStatus('Markdown copied to clipboard. ✓');
	} catch {
		out.select();
		document.execCommand('copy');
		out.setSelectionRange(0, 0);
		setStatus('Markdown copied (fallback path). ✓');
	}
}

function downloadOutput(): void {
	const out = document.getElementById('x2mOutput') as HTMLTextAreaElement | null;
	if (!out?.value) {
		setStatus('Nothing to download yet — convert a file first.', true);
		return;
	}
	const base = state.fileName.replace(/\.[^.]+$/, '') || 'table';
	const blob = new Blob([out.value], { type: 'text/markdown' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${base}.md`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
	setStatus(`Saved ${base}.md.`);
}

const SAMPLE_CSV = [
	'Item,Price,Notes',
	'"Coffee, whole bean",$12.50,"Grind: medium-fine"',
	'"Filters ""unbleached""",$4.00,',
	'Kettle,$38.99,"Temp settings:\n80°C, 92°C, 100°C"'
].join('\n');

function loadSample(): void {
	adoptSheets([{ name: 'sample.csv', grid: parseDelimited(SAMPLE_CSV) }], 'sample.csv');
}

function wireDropZone(zone: HTMLElement, input: HTMLInputElement): void {
	['dragenter', 'dragover'].forEach((type) => {
		zone.addEventListener(type, (event) => {
			event.preventDefault();
			zone.classList.add('dragging');
		});
	});
	['dragleave', 'drop'].forEach((type) => {
		zone.addEventListener(type, (event) => {
			event.preventDefault();
			zone.classList.remove('dragging');
		});
	});
	zone.addEventListener('drop', (event) => {
		const file = (event as DragEvent).dataTransfer?.files?.[0];
		if (file) {
			input.files = (event as DragEvent).dataTransfer!.files;
			void handleFile(file);
		}
	});
}

export function initXlsxToMdApp(): void {
	const input = document.getElementById('x2mFileInput') as HTMLInputElement | null;
	const zone = document.getElementById('x2mDropZone');
	const output = document.getElementById('x2mOutput') as HTMLTextAreaElement | null;
	const picker = document.getElementById('x2mSheetPicker') as HTMLSelectElement | null;
	if (!input || !zone || !output || !picker) return;

	input.addEventListener('change', () => void handleFile(input.files?.[0]));
	wireDropZone(zone, input);

	for (const id of ['x2mHeaderRow', 'x2mSkipEmpty'] as const) {
		document.getElementById(id)?.addEventListener('change', renderMarkdown);
	}
	picker.addEventListener('change', () => {
		state.activeSheet = Number(picker.value) || 0;
		renderMarkdown();
	});
	document.getElementById('x2mCopy')?.addEventListener('click', () => void copyOutput());
	document.getElementById('x2mDownload')?.addEventListener('click', downloadOutput);
	document.getElementById('x2mConvertPasted')?.addEventListener('click', convertPasted);
	document.getElementById('x2mSample')?.addEventListener('click', loadSample);

	setStatus('Drop an xlsx/csv/tsv file above, or paste delimited text below. Everything runs locally.');
}
