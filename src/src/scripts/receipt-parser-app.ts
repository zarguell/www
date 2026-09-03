/**
 * Receipt Parser DOM wiring — file input/drag-drop, OCR worker, and rendering.
 * Pure heuristics live in `lib/receipt-parser.ts`; OCR text comes from
 * Tesseract.js, loaded as a classic global by an integrity-pinned CDN script
 * on the page (same pattern as lz-string on splitcheck).
 */
import { escapeHtml } from '../lib/escape-html';
import { formatCurrency, parseReceipt, type ParsedReceipt } from '../lib/receipt-parser';

interface TesseractWorker {
	recognize(image: File | Blob | string): Promise<{ data: { text: string } }>;
	terminate(): Promise<unknown>;
}

declare global {
	interface Window {
		Tesseract?: {
			createWorker(
				lang: string,
				oem: number,
				options: { logger?: (message: { status: string; progress: number }) => void }
			): Promise<TesseractWorker>;
		};
	}
}

interface ReceiptParserEls {
	fileInput: HTMLInputElement;
	parseBtn: HTMLButtonElement;
	sampleBtn: HTMLButtonElement;
	clearBtn: HTMLButtonElement;
	previewBox: HTMLElement;
	rawText: HTMLTextAreaElement;
	metaGrid: HTMLElement;
	itemsSection: HTMLElement;
	itemsList: HTMLElement;
	statusBox: HTMLElement;
	progressBar: HTMLElement;
	uploadZone: HTMLElement;
}

// Same fixture as the source repo's sample button — lets visitors exercise the
// parsing heuristics without uploading an image or waiting on OCR.
const SAMPLE_TEXT = [
	'FRESH MART',
	'1458 OAK STREET',
	'ASHBURN, VA',
	'04/18/2026 10:41 AM',
	'',
	'MILK 2%            3.49',
	'BREAD WHEAT        2.99',
	'BANANAS            1.86',
	'EGGS LARGE         4.59',
	'',
	'SUBTOTAL          12.93',
	'TAX                0.78',
	'TOTAL             13.71',
	'VISA              13.71',
	'THANK YOU'
].join('\n');

const state = {
	file: null as File | null,
	previewUrl: null as string | null,
	worker: null as TesseractWorker | null
};

function setBtnDisabled(btn: HTMLButtonElement, disabled: boolean): void {
	btn.disabled = disabled;
	btn.classList.toggle('retro-button--disabled', disabled);
}

function setStatus(els: ReceiptParserEls, message: string, isError = false): void {
	els.statusBox.textContent = message;
	els.statusBox.classList.toggle('parse-status--error', isError);
}

function setProgress(els: ReceiptParserEls, value: number): void {
	const pct = Math.max(0, Math.min(100, value));
	els.progressBar.style.width = pct + '%';
}

function renderParsed(els: ReceiptParserEls, parsed: ParsedReceipt): void {
	// OCR text is untrusted input — every interpolated value gets escaped.
	const fields: Array<[string, string]> = [
		['Merchant', escapeHtml(parsed.merchant)],
		['Date', escapeHtml(parsed.date)],
		['Subtotal', formatCurrency(parsed.subtotal)],
		['Tax', formatCurrency(parsed.tax)],
		['Tip', formatCurrency(parsed.tip)],
		['Total', formatCurrency(parsed.total)],
		['Detected lines', String(parsed.lineCount)],
		['Items found', String(parsed.items.length)]
	];

	els.metaGrid.innerHTML = fields
		.map(
			([label, value]) =>
				`<div class="meta-item"><span class="meta-label">${label}</span><strong>${value}</strong></div>`
		)
		.join('');

	if (parsed.items.length) {
		els.itemsSection.classList.remove('hidden');
		els.itemsList.innerHTML = parsed.items
			.map(
				(item) =>
					`<div class="item-row"><div><strong>${escapeHtml(item.description)}</strong>` +
					`<small class="item-raw">${escapeHtml(item.raw)}</small></div>` +
					`<strong class="item-amount">${formatCurrency(item.amount)}</strong></div>`
			)
			.join('');
	} else {
		els.itemsSection.classList.add('hidden');
		els.itemsList.innerHTML = '';
	}
}

function resetOutput(els: ReceiptParserEls): void {
	els.rawText.value = '';
	els.metaGrid.innerHTML = '';
	els.itemsList.innerHTML = '';
	els.itemsSection.classList.add('hidden');
	setProgress(els, 0);
}

function showPlaceholder(els: ReceiptParserEls): void {
	els.previewBox.innerHTML = '<div class="preview-placeholder">No image loaded yet.</div>';
}

function loadPreview(els: ReceiptParserEls, file: File): void {
	if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
	state.previewUrl = URL.createObjectURL(file);
	els.previewBox.innerHTML = `<img src="${state.previewUrl}" alt="Receipt preview" />`;
}

function selectFile(els: ReceiptParserEls, file: File | null | undefined): void {
	if (!file || !file.type.startsWith('image/')) {
		setStatus(els, 'Please choose an image file.', true);
		return;
	}
	state.file = file;
	setBtnDisabled(els.parseBtn, false);
	loadPreview(els, file);
	resetOutput(els);
	setStatus(els, `Ready to parse ${file.name}.`);
}

function clearAll(els: ReceiptParserEls): void {
	state.file = null;
	els.fileInput.value = '';
	setBtnDisabled(els.parseBtn, true);
	resetOutput(els);
	showPlaceholder(els);
	setStatus(els, 'Select a receipt image to begin.');
	if (state.previewUrl) {
		URL.revokeObjectURL(state.previewUrl);
		state.previewUrl = null;
	}
}

async function ensureWorker(els: ReceiptParserEls): Promise<TesseractWorker> {
	if (state.worker) return state.worker;
	if (!window.Tesseract) {
		throw new Error('OCR engine not loaded');
	}
	state.worker = await window.Tesseract.createWorker('eng', 1, {
		logger: (message) => {
			if (!message.status) return;
			const pct = typeof message.progress === 'number' ? Math.round(message.progress * 100) : 0;
			setProgress(els, pct);
			const label = message.status.charAt(0).toUpperCase() + message.status.slice(1);
			setStatus(els, pct ? `${label} (${pct}%)` : label);
		}
	});
	return state.worker;
}

async function runOCR(els: ReceiptParserEls): Promise<void> {
	if (!state.file) return;
	setBtnDisabled(els.parseBtn, true);
	setBtnDisabled(els.sampleBtn, true);
	setBtnDisabled(els.clearBtn, true);
	setStatus(els, 'Preparing OCR worker...');
	setProgress(els, 4);
	try {
		const worker = await ensureWorker(els);
		const result = await worker.recognize(state.file);
		const text = result?.data?.text || '';
		els.rawText.value = text.trim();
		renderParsed(els, parseReceipt(text));
		setProgress(els, 100);
		setStatus(els, 'Receipt parsed. Review the inferred fields and raw OCR text.');
	} catch {
		setStatus(els, 'OCR failed. Try a clearer image, or use the sample text button to test parsing.', true);
	} finally {
		setBtnDisabled(els.parseBtn, false);
		setBtnDisabled(els.sampleBtn, false);
		setBtnDisabled(els.clearBtn, false);
	}
}

function initReceiptParserApp(): void {
	const get = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
	const fileInput = get<HTMLInputElement>('fileInput');
	const parseBtn = get<HTMLButtonElement>('parseBtn');
	const sampleBtn = get<HTMLButtonElement>('sampleBtn');
	const clearBtn = get<HTMLButtonElement>('clearBtn');
	const previewBox = get<HTMLElement>('previewBox');
	const rawText = get<HTMLTextAreaElement>('rawText');
	const metaGrid = get<HTMLElement>('metaGrid');
	const itemsSection = get<HTMLElement>('itemsSection');
	const itemsList = get<HTMLElement>('itemsList');
	const statusBox = get<HTMLElement>('statusBox');
	const progressBar = get<HTMLElement>('progressBar');
	const uploadZone = get<HTMLElement>('uploadZone');

	if (
		!fileInput ||
		!parseBtn ||
		!sampleBtn ||
		!clearBtn ||
		!previewBox ||
		!rawText ||
		!metaGrid ||
		!itemsSection ||
		!itemsList ||
		!statusBox ||
		!progressBar ||
		!uploadZone
	) {
		return;
	}

	const els: ReceiptParserEls = {
		fileInput,
		parseBtn,
		sampleBtn,
		clearBtn,
		previewBox,
		rawText,
		metaGrid,
		itemsSection,
		itemsList,
		statusBox,
		progressBar,
		uploadZone
	};

	fileInput.addEventListener('change', () => {
		selectFile(els, fileInput.files?.[0]);
	});

	['dragenter', 'dragover'].forEach((type) => {
		uploadZone.addEventListener(type, (event) => {
			event.preventDefault();
			uploadZone.classList.add('dragging');
		});
	});

	['dragleave', 'drop'].forEach((type) => {
		uploadZone.addEventListener(type, (event) => {
			event.preventDefault();
			uploadZone.classList.remove('dragging');
		});
	});

	uploadZone.addEventListener('drop', (event) => {
		const transfer = (event as DragEvent).dataTransfer;
		const file = transfer?.files?.[0];
		if (file && transfer) {
			fileInput.files = transfer.files;
			selectFile(els, file);
		}
	});

	parseBtn.addEventListener('click', () => runOCR(els));

	sampleBtn.addEventListener('click', () => {
		rawText.value = SAMPLE_TEXT;
		renderParsed(els, parseReceipt(SAMPLE_TEXT));
		setProgress(els, 100);
		setStatus(els, 'Loaded sample receipt text. Upload an image to run full OCR.');
	});

	clearBtn.addEventListener('click', () => clearAll(els));

	rawText.addEventListener('blur', () => {
		const value = rawText.value.trim();
		if (!value) return;
		renderParsed(els, parseReceipt(value));
		setStatus(els, 'Re-parsed edited OCR text.');
	});

	window.addEventListener('beforeunload', () => {
		if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
		void state.worker?.terminate().catch(() => {});
	});
}

export { initReceiptParserApp };
