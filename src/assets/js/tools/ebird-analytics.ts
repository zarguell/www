/**
 * eBird Field Analytics page wiring.
 *
 * Two intake paths: a pasted export link (relayed through `/api/ebird-import`
 * because the bucket sends no CORS headers) and a local zip file. Bytes are
 * unzipped and parsed here; after the fetch the file never leaves the browser.
 *
 * The dashboard is tabbed and every panel is rendered once per import, then
 * re-filtered in place — the export is a few thousand rows, so recomputing is
 * cheaper than the bookkeeping a cache would need.
 */

import {
	parseEbirdCsv,
	regionName,
	speciesBase,
	summarize,
	taxonomyFor,
	type EbirdObservation,
	type EbirdSummary,
	type Taxonomy
} from '../lib/ebird';
import {
	buildMigrants,
	buildPhenology,
	rankHotspots,
	speciesByYear,
	summarizeEffort,
	summarizeRegions,
	type EffortSummary,
	type PhenologyRow
} from '../lib/ebird-stats';
import { StickerCard, type StickerDetail } from '../lib/ebird-card';
import { barChart } from '../lib/ebird-chart';
import { packCollage, type CollageItem } from '../lib/ebird-collage';
import {
	buildPoster,
	capturePoster,
	downloadBlob,
	downloadDataUrl,
	jpegToPdf,
	stickerRefs,
	timestamp,
	type ExportContext,
	type StickerRef
} from '../lib/ebird-export';
import {
	buildDataFile,
	clearObservations,
	describeAge,
	formatBytes,
	loadObservations,
	parseDataFile,
	saveObservations
} from '../lib/ebird-storage';
import {
	compareLists,
	decodeCompare,
	decodeShare,
	encodeCompare,
	encodeShare,
	monthsSince1900,
	shareUrl,
	ymToIso,
	URL_BUDGET,
	type CompareList,
	type ShareBird
} from '../lib/ebird-share';
import { findCsvEntry, isZip, readZipEntries, readZipEntryText } from '../lib/zip';

const TAXONOMY_URL = '/data/ebird-taxonomy.json';
/**
 * Common names by binomial, fetched only when a share link needs them: a full
 * export writes the name on every row, so only the shared view has to look it
 * up, and it costs nothing for visitors who import their own data.
 */
const NAMES_URL = '/data/ebird-names.json';
let commonNames: Record<string, string> | null = null;
const MAX_LOCAL_BYTES = 96 * 1024 * 1024;
const COLLAGE_MAX = 400;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

function el<T extends HTMLElement>(id: string): T {
	const node = document.getElementById(id);
	if (!node) throw new Error(`missing element #${id}`);
	return node as T;
}

const linkInput = el<HTMLInputElement>('ebirdLink');
const fileInput = el<HTMLInputElement>('ebirdFile');
const fetchButton = el<HTMLButtonElement>('ebirdFetch');
const pickButton = el<HTMLButtonElement>('ebirdPick');
const statusLine = el<HTMLParagraphElement>('ebirdStatus');
const results = el<HTMLDivElement>('ebirdResults');
const statsBox = el<HTMLDivElement>('ebirdStats');
const yearChart = el<HTMLDivElement>('ebirdYearChart');
const effortChart = el<HTMLDivElement>('ebirdEffortChart');
const monthChart = el<HTMLDivElement>('ebirdMonthChart');
const collageBox = el<HTMLDivElement>('ebirdCollage');
const stickerCount = el<HTMLSpanElement>('ebirdStickerCount');
const pngButton = el<HTMLButtonElement>('ebirdPng');
const pdfButton = el<HTMLButtonElement>('ebirdPdf');
const zipButton = el<HTMLButtonElement>('ebirdStickerZip');
const exportStatus = el<HTMLParagraphElement>('ebirdExportStatus');
const loadingBox = el<HTMLDivElement>('ebirdLoading');
const loadingText = el<HTMLSpanElement>('ebirdLoadingText');
const savedPanel = el<HTMLDivElement>('ebirdSavedPanel');
const savedLine = el<HTMLParagraphElement>('ebirdSavedLine');
const savedOpen = el<HTMLButtonElement>('ebirdSavedOpen');
const savedForget = el<HTMLButtonElement>('ebirdSavedForget');
const saveDataButton = el<HTMLButtonElement>('ebirdSaveData');
const loadDataButton = el<HTMLButtonElement>('ebirdLoadData');
const dataFileInput = el<HTMLInputElement>('ebirdDataFile');
const autoSaveToggle = el<HTMLInputElement>('ebirdAutoSave');
const storageNote = el<HTMLParagraphElement>('ebirdStorageNote');
const shareName = el<HTMLInputElement>('ebirdShareName');
const shareButton = el<HTMLButtonElement>('ebirdShareLink');
const copyLinkButton = el<HTMLButtonElement>('ebirdCopyLink');
const shareStatus = el<HTMLParagraphElement>('ebirdShareStatus');
const shareOut = el<HTMLInputElement>('ebirdShareOut');
const shareOutWrap = el<HTMLLabelElement>('ebirdShareOutWrap');
const compareA = el<HTMLInputElement>('ebirdCompareA');
const compareB = el<HTMLInputElement>('ebirdCompareB');
const compareRun = el<HTMLButtonElement>('ebirdCompareRun');
const compareLinkButton = el<HTMLButtonElement>('ebirdCompareLink');
const compareStatus = el<HTMLParagraphElement>('ebirdCompareStatus');
const compareOut = el<HTMLDivElement>('ebirdCompareOut');
const migrantMonth = el<HTMLSelectElement>('ebirdMigrantMonth');
const migrantMin = el<HTMLSelectElement>('ebirdMigrantMin');
const migrantBox = el<HTMLDivElement>('ebirdMigrants');
const migrantCaption = el<HTMLParagraphElement>('ebirdMigrantCaption');
const phenologyFilter = el<HTMLInputElement>('ebirdPhenologyFilter');
const phenologyEmpty = el<HTMLParagraphElement>('ebirdPhenologyEmpty');
const lifeFilter = el<HTMLInputElement>('ebirdLifeFilter');
const lifeSort = el<HTMLSelectElement>('ebirdLifeSort');
const lifeEmpty = el<HTMLParagraphElement>('ebirdLifeEmpty');
const lifeCount = el<HTMLSpanElement>('ebirdLifeCount');
const lifeNote = el<HTMLParagraphElement>('ebirdLifeNote');
const skippedNote = el<HTMLParagraphElement>('ebirdSkipped');
const skippedCount = el<HTMLSpanElement>('ebirdSkippedCount');

const tableBody = (id: string): HTMLTableSectionElement | null =>
	document.getElementById(id)?.querySelector('tbody') ?? null;

const familiesBody = tableBody('ebirdFamilies');
const effortBody = tableBody('ebirdEffortTable');
const hotspotsBody = tableBody('ebirdHotspots');
const regionsBody = tableBody('ebirdRegions');
const lifeBody = tableBody('ebirdLifeList');
const lifeTable = el<HTMLTableElement>('ebirdLifeList');
const phenologyBody = tableBody('ebirdPhenology');

interface Loaded {
	taxonomy: Taxonomy;
	summary: EbirdSummary;
	observations: EbirdObservation[];
}

let state: Loaded | null = null;
let taxonomy: Taxonomy | null = null;
let phenology: PhenologyRow[] = [];
let effort: EffortSummary | null = null;
let stickers: StickerRef[] = [];
/** What to record as the data's origin in a saved copy. */
let sourceLabel = 'imported export';

const SV = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SV, tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
	return node;
}

function setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
	statusLine.textContent = message;
	statusLine.dataset.tone = tone;
}

/**
 * Show the spinner for one step. The steps are sequential and the whole import
 * runs on the main thread, so the yield after each label is what lets the
 * browser paint it before the next blocking chunk.
 */
function setLoading(label: string | null): void {
	if (label === null) {
		loadingBox.classList.add('is-hidden');
		return;
	}
	loadingText.textContent = label;
	loadingBox.classList.remove('is-hidden');
}

function setBusy(busy: boolean): void {
	fetchButton.disabled = busy;
	pickButton.disabled = busy;
	fetchButton.textContent = busy ? 'Working…' : 'Import from link';
}

async function loadCommonNames(): Promise<Record<string, string>> {
	if (commonNames) return commonNames;
	const response = await fetch(NAMES_URL);
	if (!response.ok) throw new Error('Could not load the species name table.');
	commonNames = (await response.json()) as Record<string, string>;
	return commonNames;
}

async function loadTaxonomy(): Promise<Taxonomy> {
	if (taxonomy) return taxonomy;
	setStatus('Loading taxonomy…');
	const response = await fetch(TAXONOMY_URL);
	if (!response.ok) throw new Error('Could not load the taxonomy file.');
	taxonomy = (await response.json()) as Taxonomy;
	return taxonomy;
}

/**
 * A shared list stores months, not days, so calling its dates "Jun 1, 2024"
 * would invent a day. `monthOnly` keeps those views to what was stored.
 */
function formatDate(iso: string, monthOnly = false): string {
	if (!iso) return '—';
	const date = new Date(`${iso}T00:00:00`);
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				...(monthOnly ? {} : { day: 'numeric' })
			});
}

function formatMass(grams: number): string {
	if (!grams) return '—';
	return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`;
}

/**
 * Let the browser paint a frame before starting the next blocking step.
 *
 * Unzipping a multi-megabyte export and summing tens of thousands of rows both
 * run on the main thread. Without this the spinner text set just before them
 * never appears, so the page looks frozen for exactly the seconds it needs to
 * explain itself.
 */
function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (): void => {
			if (settled) return;
			settled = true;
			resolve();
		};
		requestAnimationFrame(finish);
		// rAF stops firing in a background tab and in views that never composite.
		// Without this fallback the import would wait forever for a frame that
		// will not arrive, leaving the spinner up and the data unloaded.
		setTimeout(finish, 50);
	});
}

async function ingest(bytes: Uint8Array): Promise<void> {
	setLoading('Loading the bird taxonomy…');
	const tax = await loadTaxonomy();
	let csv: string;

	if (isZip(bytes)) {
		setLoading('Unzipping your export…');
		await nextFrame();
		const entry = findCsvEntry(readZipEntries(bytes));
		csv = await readZipEntryText(bytes, entry);
	} else {
		csv = new TextDecoder('utf-8').decode(bytes);
	}

	setLoading(`Parsing ${formatBytes(csv.length)} of observations…`);
	await nextFrame();
	const parsed = parseEbirdCsv(csv, tax);
	if (parsed.observations.length === 0) throw new Error('No observations found in that file.');

	setLoading(`Crunching ${parsed.observations.length.toLocaleString()} records…`);
	await nextFrame();
	const summary = summarize(parsed.observations, tax);
	summary.skippedTaxa = parsed.skippedTaxa;
	state = { taxonomy: tax, summary, observations: parsed.observations };

	const isCountable = (sciName: string): boolean => {
		// Mirrors the library's rule: the base binomial must be a known species.
		return speciesBase(sciName) in tax.m;
	};

	phenology = buildPhenology({ observations: parsed.observations, isCountable, speciesBase });
	effort = summarizeEffort(parsed.observations, isCountable, speciesBase);
	stickers = stickerRefs(summary, tax);

	setLoading('Building your collage…');
	await nextFrame();
	renderAll();
	setLoading(null);
	results.classList.remove('is-hidden');
	el('ebirdIntake').classList.add('ebird-intake--done');
	saveDataButton.disabled = false;
	setStatus(
		`Loaded ${parsed.observations.length.toLocaleString()} records from ` +
			`${summary.stats.checklists.toLocaleString()} checklists.`
	);

	if (autoSaveToggle.checked) {
		const outcome = saveObservations(parsed.observations, sourceLabel);
		storageNote.textContent = outcome.ok
			? `Saved ${formatBytes(outcome.bytes)} on this device${outcome.compact ? ' (trimmed notes)' : ''}. ` +
				'It will be here next time, so you only need a new export when you want this year\'s birds.'
			: outcome.reason;
		refreshSavedPanel();
	}
}

/** Rebuild every view from rows already in memory, skipping the file path. */
async function activate(observations: EbirdObservation[], source: string): Promise<void> {
	const tax = taxonomy;
	if (!tax) return;

	const summary = summarize(observations, tax);
	state = { taxonomy: tax, summary, observations };

	const isCountable = (sciName: string): boolean => speciesBase(sciName) in tax.m;
	phenology = buildPhenology({ observations, isCountable, speciesBase });
	effort = summarizeEffort(observations, isCountable, speciesBase);
	stickers = stickerRefs(summary, tax);

	setLoading('Building your collage…');
	await nextFrame();
	renderAll();
	setLoading(null);
	results.classList.remove('is-hidden');
	el('ebirdIntake').classList.add('ebird-intake--done');
	saveDataButton.disabled = false;
	setStatus(
		`Loaded ${observations.length.toLocaleString()} records from ` +
			`${summary.stats.checklists.toLocaleString()} checklists (${source}).`
	);
}

function refreshSavedPanel(): void {
	const saved = loadObservations();
	if (!saved) {
		savedPanel.classList.add('is-hidden');
		return;
	}
	savedPanel.classList.remove('is-hidden');
	const age = describeAge(saved.savedAt);
	savedLine.textContent =
		`A saved copy is on this device: ${saved.observations.length.toLocaleString()} records` +
		(age ? `, ${age}` : '') + '.';
}

async function importFromLink(): Promise<void> {
	const url = linkInput.value.trim();
	if (!url) {
		setStatus('Paste the export link from the eBird email first.', 'error');
		return;
	}

	setBusy(true);
	try {
		setStatus('Fetching your export…');
		const response = await fetch('/api/ebird-import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		});

		if (!response.ok) {
			// A Cloudflare rate-limit block is answered before the Worker runs, so
			// the body is the edge's plain-text `error code: 1015`, not our JSON.
			if (response.status === 429) {
				throw new Error(
					'Too many import attempts from this connection. Wait about ten seconds and try again.'
				);
			}
			const payload: unknown = await response.json().catch(() => null);
			const message =
				payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
					? payload.error
					: 'That export could not be fetched.';
			throw new Error(message);
		}

		sourceLabel = 'eBird export link';
		await ingest(new Uint8Array(await response.arrayBuffer()));
		linkInput.value = '';
	} catch (error) {
		setStatus(error instanceof Error ? error.message : 'Import failed.', 'error');
	} finally {
		setLoading(null);
		setBusy(false);
	}
}

async function importFromFile(file: File): Promise<void> {
	if (file.size > MAX_LOCAL_BYTES) {
		setStatus('That file is too large to parse here.', 'error');
		return;
	}
	setBusy(true);
	try {
		sourceLabel = `file ${file.name}`;
		await ingest(new Uint8Array(await file.arrayBuffer()));
	} catch (error) {
		setStatus(error instanceof Error ? error.message : 'Could not read that file.', 'error');
	} finally {
		setLoading(null);
		setBusy(false);
	}
}

/* ---------- summary ---------- */

function statCard(label: string, value: string, note?: string): HTMLElement {
	const card = document.createElement('div');
	card.className = 'result-card';

	const labelNode = document.createElement('span');
	labelNode.className = 'result-card__label';
	labelNode.textContent = label;
	card.append(labelNode);

	const valueNode = document.createElement('span');
	valueNode.className = 'result-card__value';
	valueNode.textContent = value;
	card.append(valueNode);

	if (note) {
		const noteNode = document.createElement('small');
		noteNode.className = 'ebird-stat__note';
		noteNode.textContent = note;
		card.append(noteNode);
	}
	return card;
}

function renderStats(target: EbirdSummary): void {
	const { stats } = target;
	const peak = effort?.totals.peakMonth;

	// A share link rebuilds one synthetic observation per species, so the
	// checklist count it would report is the species count wearing a different
	// label. Show only what the payload actually knows.
	if (sparseView) {
		const cards = [
			statCard('Species', stats.species.toLocaleString()),
			statCard('Families', stats.families.toLocaleString()),
			statCard('Orders', stats.orders.toLocaleString())
		];
		// A comparison link stores no dates at all, so a span card there would
		// read "— → —" on a list that plainly has history.
		if (stats.firstDate) {
			cards.push(
				statCard(
					'Span',
					`${formatDate(stats.firstDate, sparseView)} →`,
					formatDate(stats.lastDate, sparseView)
				)
			);
		}
		statsBox.replaceChildren(...cards);
		return;
	}

	const cards: HTMLElement[] = [
		statCard('Species', stats.species.toLocaleString()),
		statCard('Checklists', stats.checklists.toLocaleString()),
		statCard('Families', stats.families.toLocaleString()),
		statCard('Orders', stats.orders.toLocaleString()),
		statCard('Records', stats.observationRows.toLocaleString(), 'species × checklist rows'),
		statCard('Individuals', stats.countedBirds.toLocaleString(), 'rows with a numeric count'),
		statCard('Hours afield', stats.hours.toFixed(1)),
		statCard('Distance', `${stats.distanceKm.toFixed(0)} km`),
		statCard('Countries', stats.regions.toLocaleString(), 'from state codes'),
		statCard(
			'Avg / checklist',
			stats.checklists ? (stats.observationRows / stats.checklists).toFixed(1) : '—',
			'species per checklist'
		),
		statCard('Peak month', peak ? `${MONTHS[peak.month - 1]} · ${peak.hours.toFixed(1)} h` : '—', `${peak?.checklists ?? 0} lists`),
		statCard('Span', `${formatDate(stats.firstDate)} →`, formatDate(stats.lastDate))
	];

	statsBox.replaceChildren(...cards);
}

/* ---------- charts ---------- */

function renderYearChart(): void {
	if (!effort) return;
	yearChart.replaceChildren(
		barChart(
			speciesByYear(effort).map((year) => ({
				label: String(year.year),
				value: year.species,
				overlay: year.lifers,
				title: `${year.year}: ${year.species} species, ${year.lifers} lifers`
			}))
		)
	);
}

function renderEffortCharts(): void {
	if (!effort) return;
	effortChart.replaceChildren(
		barChart(
			effort.years.map((year) => ({
				label: String(year.year),
				value: Math.round(year.hours * 10) / 10,
				title: `${year.year}: ${year.hours.toFixed(1)} h, ${year.distanceKm.toFixed(0)} km`
			}))
		)
	);
	monthChart.replaceChildren(
		barChart(
			effort.months.map((month) => ({
				label: MONTHS[month.month - 1],
				value: Math.round(month.hours * 10) / 10,
				title: `${MONTHS_LONG[month.month - 1]}: ${month.hours.toFixed(1)} h across ${month.checklists} lists`
			}))
		)
	);
}

/* ---------- collage ---------- */

/**
 * Lay the life list out as a packed collage.
 *
 * The junk drawer of a sticker wall is a grid only because a grid is easy; the
 * point of these stickers is that they have silhouettes and scales. So: pack
 * them by mass, biggest at the centre, and leave a hole in the middle for the
 * species count.
 */
function renderCollage(target: EbirdSummary, tax: Taxonomy): void {
	const shown = stickers.slice(0, COLLAGE_MAX);
	stickerCount.textContent = `${target.lifeList.length} species`;

	const items: CollageItem[] = shown.map((ref) => ({ id: ref.sciName, mass: ref.mass, aspect: 1 }));
	const width = collageBox.clientWidth || 720;

	// Search for the largest tile size whose pack still fits the container.
	// Scaling a packed stage down afterwards is what turns a collage into dust:
	// it shrinks the gaps with the tiles, so neighbours collide at 8px.
	const gapFor = (base: number): number => Math.max(5, Math.round(base * 0.12));
	let best = packCollage(items, { base: 24, gap: gapFor(24) });
	for (let base = 140; base >= 24; base -= 4) {
		const candidate = packCollage(items, { base, gap: gapFor(base) });
		if (candidate.width <= width) {
			best = candidate;
			break;
		}
	}

	// No upscale: the base search already picked the largest pack that fits, and
	// scaling the result moves positions and sizes together, which quietly eats
	// the gap between neighbours. Leftover width becomes honest margin.
	const scale = 1;
	collageBox.style.height = `${Math.round(best.height * scale)}px`;

	const byId = new Map(shown.map((ref) => [ref.sciName, ref]));
	const entryById = new Map(target.lifeList.map((entry) => [entry.sciName, entry]));
	const nodes: HTMLElement[] = [];
	for (const box of best.boxes) {
		const ref = byId.get(box.id);
		if (!ref) continue;
		const img = document.createElement('img');
		img.src = ref.url;
		img.loading = 'lazy';
		img.decoding = 'async';
		img.className = 'ebird-collage__sticker';
		img.style.left = `${(box.x * scale).toFixed(1)}px`;
		img.style.top = `${(box.y * scale).toFixed(1)}px`;
		img.style.width = `${(box.width * scale).toFixed(1)}px`;
		img.style.height = `${(box.height * scale).toFixed(1)}px`;
		img.addEventListener('error', () => img.remove(), { once: true });

		// Hover detail. A shared list has no place, so those rows drop out on
		// their own; the card renders whatever the payload actually supports.
		const entry = entryById.get(ref.sciName);
		const taxonomyEntry = taxonomyFor(ref.sciName, tax);

		StickerCard.annotate(img, {
			comName: ref.comName,
			sciName: ref.sciName,
			family: taxonomyEntry.family,
			order: taxonomyEntry.order,
			mass: ref.mass,
			firstDate: entry?.firstDate ?? '',
			lastDate: entry?.lastDate ?? '',
			// A shared list has one synthetic checklist per species and no
			// places at all; those rows would be the format talking.
			checklists: sparseView ? 0 : (entry?.checklists ?? 0),
			lastPlace: sparseView ? '' : (entry?.lastPlace ?? ''),
			bestCount: sparseView ? 0 : (entry?.bestCount ?? 0),
			monthOnly: sparseView
		} satisfies StickerDetail);

		nodes.push(img);
	}

	// The species count sits in the hole the packer left at the centre.
	const hole = collageBox.querySelector('.ebird-collage__hole');
	collageBox.replaceChildren(...nodes);
	if (hole) {
		hole.textContent = '';
		const strong = document.createElement('strong');
		strong.textContent = String(target.lifeList.length);
		const span = document.createElement('span');
		span.textContent = 'species';
		hole.append(strong, span);
		collageBox.append(hole);
	}
}

/* ---------- export ---------- */

function setExportStatus(message: string, tone: 'info' | 'error' = 'info'): void {
	exportStatus.textContent = message;
	exportStatus.dataset.tone = tone;
}

function setExportBusy(busy: boolean): void {
	pngButton.disabled = busy;
	pdfButton.disabled = busy;
	zipButton.disabled = busy;
}

function exportContext(): ExportContext | null {
	if (!state) return null;
	const peak = effort?.totals.peakMonth;
	return {
		summary: state.summary,
		taxonomy: state.taxonomy,
		stickers,
		hours: state.summary.stats.hours,
		distanceKm: state.summary.stats.distanceKm,
		peakMonthLabel: peak ? MONTHS_LONG[peak.month - 1] : '—'
	};
}

type HtmlToImage = {
	toPng(node: HTMLElement, options?: Record<string, unknown>): Promise<string>;
	toJpeg(node: HTMLElement, options?: Record<string, unknown>): Promise<string>;
};

function htmlToImage(): HtmlToImage | null {
	const global = globalThis as unknown as { htmlToImage?: HtmlToImage };
	return global.htmlToImage ?? null;
}

async function exportPng(): Promise<void> {
	const context = exportContext();
	const lib = htmlToImage();
	if (!context) return;
	if (!lib) {
		setExportStatus('The image library did not load. Reload the page.', 'error');
		return;
	}

	setExportBusy(true);
	try {
		setExportStatus('Rendering poster…');
		const dataUrl = await capturePoster(buildPoster(context), (node) =>
			lib.toPng(node, { pixelRatio: 1, cacheBust: true, backgroundColor: '#0a0a0a' })
		);
		downloadDataUrl(dataUrl, `ebird-field-${timestamp()}.png`);
		setExportStatus('Poster downloaded.');
	} catch (error) {
		const detail =
			error instanceof Error
				? error.message
				: typeof error === 'string'
					? error
					: `Poster render failed (${Object.prototype.toString.call(error)}).`;
		setExportStatus(detail, 'error');
	} finally {
		setExportBusy(false);
	}
}

async function exportPdf(): Promise<void> {
	const context = exportContext();
	const lib = htmlToImage();
	if (!context) return;
	if (!lib) {
		setExportStatus('The image library did not load. Reload the page.', 'error');
		return;
	}

	setExportBusy(true);
	try {
		setExportStatus('Rendering PDF…');
		// JPEG rather than PNG: the PDF writer embeds it with /DCTDecode, which
		// takes JPEG bytes as-is. Feeding it PNG bytes produces a file readers
		// refuse, which is exactly what an earlier version did.
		const dataUrl = await capturePoster(buildPoster(context), (node) =>
			lib.toJpeg(node, { pixelRatio: 2, quality: 0.92, cacheBust: true, backgroundColor: '#0a0a0a' })
		);
		const binary = atob(dataUrl.split(',')[1]);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const pdf = jpegToPdf(bytes, 1080, 1350);
		downloadBlob(new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' }), `ebird-field-${timestamp()}.pdf`);
		setExportStatus(`PDF downloaded (${Math.round(pdf.length / 1024)} KB).`);
	} catch (error) {
		setExportStatus(error instanceof Error ? error.message : 'PDF render failed.', 'error');
	} finally {
		setExportBusy(false);
	}
}

async function exportStickerZip(): Promise<void> {
	if (!state) return;
	const JSZipCtor = (globalThis as unknown as { JSZip?: new () => JSZipInstance }).JSZip;
	if (!JSZipCtor) {
		setExportStatus('The zip library did not load. Reload the page.', 'error');
		return;
	}

	setExportBusy(true);
	try {
		setExportStatus(`Fetching ${stickers.length} stickers…`);
		const zip = new JSZipCtor();
		let stored = 0;

		// Fetch a few at a time: a burst of 400 requests gets throttled by the CDN.
		const queue = [...stickers];
		const workers = Array.from({ length: 6 }, async () => {
			while (queue.length > 0) {
				const ref = queue.shift();
				if (!ref) break;
				const entry = taxonomyFor(ref.sciName, state!.taxonomy);
				const folder = entry.familySci || 'Unclassified';
				try {
					const response = await fetch(ref.url);
					if (!response.ok) continue;
					const blob = await response.blob();
					zip.file(`${folder}/${ref.sciName.replace(/\s+/g, '_')}.webp`, blob);
					stored += 1;
					if (stored % 40 === 0) setExportStatus(`Fetched ${stored} stickers…`);
				} catch {
					// One missing sticker should not fail the archive.
				}
			}
		});
		await Promise.all(workers);

		if (stored === 0) throw new Error('No stickers could be fetched.');
		setExportStatus(`Zipping ${stored} stickers…`);
		const blob = await zip.generateAsync({ type: 'blob' });
		downloadBlob(blob, `ebird-stickers-${timestamp()}.zip`);
		setExportStatus(`Sticker pack downloaded (${stored} files).`);
	} catch (error) {
		setExportStatus(error instanceof Error ? error.message : 'Sticker export failed.', 'error');
	} finally {
		setExportBusy(false);
	}
}

interface JSZipInstance {
	file(name: string, data: Blob): void;
	generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

/* ---------- tables ---------- */

function renderFamilies(target: EbirdSummary): void {
	if (!familiesBody) return;
	familiesBody.replaceChildren(
		...target.families.slice(0, 12).map((family) => {
			const tr = document.createElement('tr');
			const name = document.createElement('td');
			name.textContent = family.name;
			const species = document.createElement('td');
			species.className = 'num';
			species.textContent = family.species.toLocaleString();
			const observations = document.createElement('td');
			observations.className = 'num';
			observations.textContent = family.observations.toLocaleString();
			tr.append(name, species, observations);
			return tr;
		})
	);
}

function renderEffortTable(): void {
	if (!effortBody || !effort) return;
	effortBody.replaceChildren(
		...[...effort.years].reverse().map((year) => {
			const tr = document.createElement('tr');
			const cells: [string, boolean][] = [
				[String(year.year), false],
				[year.checklists.toLocaleString(), true],
				[year.hours.toFixed(1), true],
				[`${year.distanceKm.toFixed(0)} km`, true],
				[year.species.toLocaleString(), true],
				[year.lifers.toLocaleString(), true]
			];
			for (const [text, numeric] of cells) {
				const td = document.createElement('td');
				if (numeric) td.className = 'num';
				td.textContent = text;
				tr.append(td);
			}
			return tr;
		})
	);
}

function renderHotspots(target: EbirdSummary, tax: Taxonomy): void {
	if (!hotspotsBody) return;
	const isCountable = (sciName: string): boolean => speciesBase(sciName) in tax.m;
	const hotspots = rankHotspots(target.observations, isCountable, speciesBase, 15);

	hotspotsBody.replaceChildren(
		...hotspots.map((hotspot) => {
			const tr = document.createElement('tr');
			const name = document.createElement('td');
			name.textContent = hotspot.name;
			const species = document.createElement('td');
			species.className = 'num';
			species.textContent = hotspot.species.toLocaleString();
			const lists = document.createElement('td');
			lists.className = 'num';
			lists.textContent = hotspot.checklists.toLocaleString();
			tr.append(name, species, lists);
			return tr;
		})
	);
}

function renderRegions(target: EbirdSummary, tax: Taxonomy): void {
	if (!regionsBody) return;
	const isCountable = (sciName: string): boolean => speciesBase(sciName) in tax.m;
	const regions = summarizeRegions(target.observations, isCountable, speciesBase);

	regionsBody.replaceChildren(
		...regions.map((region) => {
			const tr = document.createElement('tr');
			const name = document.createElement('td');
			name.textContent = regionName(region.code, tax);
			const species = document.createElement('td');
			species.className = 'num';
			species.textContent = region.species.toLocaleString();
			const lists = document.createElement('td');
			lists.className = 'num';
			lists.textContent = region.checklists.toLocaleString();
			tr.append(name, species, lists);
			return tr;
		})
	);
}

/* ---------- migrants ---------- */

function renderMigrants(): void {
	if (!state) return;
	const month = Number(migrantMonth.value) || 1;
	const minimum = Number(migrantMin.value) || 1;
	const rows = buildMigrants(state.observations, month, {
		minimumDetections: minimum,
		isCountable: (sciName) => speciesBase(sciName) in state!.taxonomy.m,
		speciesBase
	});

	const monthChecklists = new Set(
		state.observations
			.filter((obs) => Number(obs.date.slice(5, 7)) === month)
			.map((obs) => obs.submissionId)
	).size;

	migrantCaption.textContent = rows.length
		? `${MONTHS_LONG[month - 1]}: ${monthChecklists} checklists · ${rows.length} species above the baseline`
		: `No species met the minimum of ${minimum} checklist${minimum === 1 ? '' : 's'} in ${MONTHS_LONG[month - 1]}.`;

	migrantBox.replaceChildren(
		...rows.slice(0, 24).map((row) => {
			const card = document.createElement('div');
			card.className = 'ebird-migrant';

			const head = document.createElement('div');
			head.className = 'ebird-migrant__head';
			const name = document.createElement('strong');
			name.textContent = row.comName;
			const spike = document.createElement('span');
			spike.className = 'ebird-migrant__spike';
			spike.textContent = `+${Math.round(row.spike * 100)}%`;
			head.append(name, spike);

			const detail = document.createElement('p');
			detail.className = 'ebird-migrant__detail';
			detail.textContent =
				`${Math.round(row.monthRate * 100)}% of ${MONTHS_LONG[month - 1]} checklists ` +
				`vs ${Math.round(row.restRate * 100)}% across the rest of the year`;

			const sci = document.createElement('small');
			sci.className = 'ebird-migrant__sci';
			sci.textContent = row.sciName;

			card.append(head, detail, sci);
			return card;
		})
	);
}

/* ---------- phenology ---------- */

function heatClass(rate: number): string {
	if (rate >= 0.55) return 'ebird-heat ebird-heat--peak';
	if (rate >= 0.25) return 'ebird-heat ebird-heat--common';
	if (rate >= 0.1) return 'ebird-heat ebird-heat--fair';
	if (rate > 0) return 'ebird-heat ebird-heat--scarce';
	return 'ebird-heat';
}

function renderPhenology(): void {
	if (!phenologyBody) return;
	const query = phenologyFilter.value.trim().toLowerCase();

	const rows = phenology.filter((row) => {
		if (!query) return true;
		return `${row.comName} ${row.sciName}`.toLowerCase().includes(query);
	});

	const peakLabel = (row: PhenologyRow): string => {
		if (row.peakMonths.length === 0) return '—';
		if (row.peakMonths.length === 1) return MONTHS[row.peakMonths[0] - 1];
		if (row.peakMonths.length === 12) return 'All year';
		return row.peakMonths.map((month) => MONTHS[month - 1]).join(' & ');
	};

	phenologyBody.replaceChildren(
		...rows.slice(0, 150).map((row) => {
			const tr = document.createElement('tr');
			const name = document.createElement('td');
			const common = document.createElement('span');
			common.textContent = row.comName;
			const sci = document.createElement('small');
			sci.className = 'ebird-life__sci';
			sci.textContent = row.sciName;
			name.append(common, sci);

			const peak = document.createElement('td');
			peak.className = 'num';
			peak.textContent = peakLabel(row);

			tr.append(name, peak);

			for (let month = 0; month < 12; month += 1) {
				const cell = document.createElement('td');
				cell.className = 'num ebird-phenology__cell';
				const rate = row.rates[month];
				const chip = document.createElement('span');
				chip.className = heatClass(rate);
				chip.textContent = rate > 0 ? `${Math.round(rate * 100)}%` : '·';
				chip.title = `${MONTHS_LONG[month]}: ${row.counts[month]} of ${row.counts[month] || 0} detections`;
				cell.append(chip);
				tr.append(cell);
			}
			return tr;
		})
	);

	phenologyEmpty.classList.toggle('is-hidden', rows.length > 0);
}

/* ---------- life list ---------- */

function renderLifeList(): void {
	if (!lifeBody || !state) return;
	const { summary, taxonomy: tax } = state;
	const query = lifeFilter.value.trim().toLowerCase();
	const sortKey = lifeSort.value;

	// A sparse payload hides the checklists column (it would be the synthetic
	// row count); one with no dates at all also hides "First seen", which would
	// otherwise be a column of dashes.
	const undated = sparseView && !summary.stats.firstDate;
	lifeTable.classList.toggle('is-sparse', sparseView);
	lifeTable.classList.toggle('is-undated', undated);
	lifeCount.textContent = `${summary.lifeList.length} species`;

	const massOf = (sciName: string): number => taxonomyFor(sciName, tax).mass;

	const matches = summary.lifeList.filter((entry) => {
		if (!query) return true;
		const haystack = `${entry.comName} ${entry.sciName} ${taxonomyFor(entry.sciName, tax).family} ${entry.firstDate}`;
		return haystack.toLowerCase().includes(query);
	});

	const sorted = [...matches].sort((a, b) => {
		switch (sortKey) {
			case 'name':
				return a.comName.localeCompare(b.comName);
			case 'family': {
				const famA = taxonomyFor(a.sciName, tax).family;
				const famB = taxonomyFor(b.sciName, tax).family;
				return famA.localeCompare(famB) || a.comName.localeCompare(b.comName);
			}
			case 'checklists':
				return b.checklists - a.checklists || a.comName.localeCompare(b.comName);
			case 'mass':
				return massOf(b.sciName) - massOf(a.sciName);
			default:
				return a.firstDate.localeCompare(b.firstDate) || a.comName.localeCompare(b.comName);
		}
	});

	lifeBody.replaceChildren(
		...sorted.slice(0, 500).map((entry) => {
			const tr = document.createElement('tr');

			const name = document.createElement('td');
			const common = document.createElement('span');
			common.textContent = entry.comName;
			const sci = document.createElement('small');
			sci.className = 'ebird-life__sci';
			sci.textContent = entry.sciName;
			name.append(common, sci);

			const family = document.createElement('td');
			family.textContent = taxonomyFor(entry.sciName, tax).family;

			const first = document.createElement('td');
			first.className = 'num';
			first.textContent = formatDate(entry.firstDate, sparseView);

			const mass = document.createElement('td');
			mass.className = 'num';
			mass.textContent = formatMass(massOf(entry.sciName));

			// "Checklists: 1" on every row would be the share format talking,
			// not the birder's history, so the column is dropped in that view.
			// A comparison link has no dates either, so that cell goes too.
			if (sparseView && undated) {
				tr.append(name, family, mass);
			} else if (sparseView) {
				tr.append(name, family, first, mass);
			} else {
				const checklists = document.createElement('td');
				checklists.className = 'num';
				checklists.textContent = entry.checklists.toLocaleString();
				tr.append(name, family, first, checklists, mass);
			}
			return tr;
		})
	);

	lifeEmpty.classList.toggle('is-hidden', sorted.length > 0);
	lifeNote.textContent =
		sorted.length > 500
			? `Showing the first 500 of ${sorted.length.toLocaleString()} matching species.`
			: `${sorted.length.toLocaleString()} of ${summary.lifeList.length.toLocaleString()} species.`;
}

/* ---------- skipped ---------- */

function renderSkipped(target: EbirdSummary): void {
	skippedCount.textContent = String(target.skippedTaxa.length);
	skippedNote.textContent = target.skippedTaxa.length
		? `${target.skippedTaxa.length} taxon names in the export are not full species, so they stay out of the life list: ` +
			target.skippedTaxa.join(', ') + '.'
		: 'Every record resolved to a full species.';
}

/* ---------- tabs ---------- */

const TABS = ['overview', 'migrants', 'phenology', 'effort', 'places', 'life'] as const;

/**
 * True when the data came from a share link, which carries species and
 * first-seen months but no checklists, effort or places. Stat cards that a
 * sparse payload cannot fill are dropped instead of printed as zero.
 */
let sparseView = false;

/** Tabs a share link cannot fill, hidden together so the list stays in one place. */
const SPARSE_HIDDEN_TABS = ['migrants', 'phenology', 'effort', 'places'] as const;

function selectTab(name: (typeof TABS)[number]): void {
	for (const tab of TABS) {
		const button = el<HTMLButtonElement>(`tab-${tab}`);
		const panel = el<HTMLElement>(`panel-${tab}`);
		const active = tab === name;
		button.setAttribute('aria-selected', String(active));
		button.classList.toggle('is-active', active);
		panel.classList.toggle('is-hidden', !active);
	}
}

function renderAll(): void {
	if (!state) return;
	const { summary, taxonomy: tax } = state;
	renderStats(summary);
	renderYearChart();
	renderFamilies(summary);
	renderCollage(summary, tax);
	renderEffortCharts();
	renderEffortTable();
	renderHotspots(summary, tax);
	renderRegions(summary, tax);
	// Their panels are hidden in a sparse view, so skip the work entirely.
	if (!sparseView) {
		renderMigrants();
		renderPhenology();
	}
	renderLifeList();
	renderSkipped(summary);
}

/* ---------- wiring ---------- */

for (const tab of TABS) {
	el<HTMLButtonElement>(`tab-${tab}`).addEventListener('click', () => selectTab(tab));
}

// Tallies for the month picker, so empty months are obvious before selecting.
function fillMonths(): void {
	migrantMonth.replaceChildren(
		...MONTHS_LONG.map((label, index) => {
			const option = document.createElement('option');
			option.value = String(index + 1);
			option.textContent = label;
			return option;
		})
	);
	const current = new Date().getMonth();
	migrantMonth.value = String(current + 1);
}

/* ---------- export wiring ---------- */

pngButton.addEventListener('click', () => void exportPng());
pdfButton.addEventListener('click', () => void exportPdf());
zipButton.addEventListener('click', () => void exportStickerZip());

/* ---------- share ---------- */

function setShareStatus(message: string, tone: 'info' | 'error' = 'info'): void {
	shareStatus.textContent = message;
	shareStatus.dataset.tone = tone;
}

function setCompareStatus(message: string, tone: 'info' | 'error' = 'info'): void {
	compareStatus.textContent = message;
	compareStatus.dataset.tone = tone;
}

function showShareUrl(url: string): void {
	shareOut.value = url;
	shareOut.classList.remove('is-hidden');
	shareOutWrap.classList.remove('is-hidden');
	copyLinkButton.disabled = false;
}

async function createShareLink(): Promise<void> {
	if (!state || !taxonomy) return;
	shareButton.disabled = true;
	try {
		// Dates ride along: they cost ~400 characters for a 300-species list and
		// keep the shared page's year chart and life list truthful. The encoder
		// drops them by itself if the token would bust the budget.
		const species = state.summary.lifeList.map((entry) => ({
			sciName: entry.sciName,
			ym: monthsSince1900(entry.firstDate)
		}));
		const index = new Map(Object.keys(taxonomy.m).sort().map((code, at) => [code, at]));
		const payload = {
			name: shareName.value.trim() || undefined,
			birds: species
		};
		const { token, level, dropped } = await encodeShare(payload, index, URL_BUDGET - 48);

		const url = `${window.location.origin}/tools/ebird-analytics/?s=${token}`;
		showShareUrl(url);
		setShareStatus(
			`Link created: ${url.length} characters, ${species.length} species` +
				(level === 'species' ? ' (names only)' : '') +
				(dropped > 0 ? `, ${dropped} omitted` : '') + '.'
		);
	} catch (error) {
		setShareStatus(
			error instanceof Error ? error.message : 'Could not build a share link.', 'error'
		);
	} finally {
		shareButton.disabled = false;
	}
}

copyLinkButton.addEventListener('click', () => {
	void (async () => {
		try {
			await navigator.clipboard.writeText(shareOut.value);
			setShareStatus('Copied to the clipboard.');
		} catch {
			shareOut.select();
			setShareStatus('Press copy in your browser to copy the selected link.');
		}
	})();
});

shareButton.addEventListener('click', () => void createShareLink());

/** Pull the token out of a pasted share URL, or accept a bare token. */
function tokenFrom(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		const token = url.searchParams.get('s');
		if (token) return token;
		// Also accept Everybird's /s/<token> shape.
		const match = url.pathname.match(/\/s\/([A-Za-z0-9_-]+)/);
		return match ? match[1] : null;
	} catch {
		return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
	}
}

function renderCompare(a: { name?: string; birds: ShareBird[] }, b: { name?: string; birds: ShareBird[] }): void {
	const result = compareLists(
		a.birds.map((bird) => bird.sciName),
		b.birds.map((bird) => bird.sciName)
	);

	const column = (title: string, names: string[], emptyText: string): HTMLElement => {
		const section = document.createElement('section');
		section.className = 'ebird-compare__col';
		const head = document.createElement('h3');
		head.className = 'ebird-compare__head';
		head.textContent = `${title} · ${names.length}`;
		const body = document.createElement('div');
		body.className = 'ebird-compare__list';
		if (names.length === 0) {
			const empty = document.createElement('p');
			empty.className = 'panel-note';
			empty.textContent = emptyText;
			body.append(empty);
		} else {
			for (const name of names) {
				const chip = document.createElement('span');
				chip.className = 'ebird-compare__chip';
				const known = state?.summary.lifeList.find((entry) => entry.sciName === name);
				chip.textContent = known?.comName ?? name;
				chip.title = name;
				body.append(chip);
			}
		}
		section.append(head, body);
		return section;
	};

	const aName = a.name || 'First list';
	const bName = b.name || 'Second list';

	compareOut.replaceChildren(
		column('Shared', result.shared, 'No species in common.'),
		column(`Only ${aName}`, result.onlyFirst, 'Nothing unique to this list.'),
		column(`Only ${bName}`, result.onlySecond, 'Nothing unique to this list.')
	);
	compareOut.classList.remove('is-hidden');
}

async function runCompare(): Promise<void> {
	if (!taxonomy) return;
	compareRun.disabled = true;
	try {
		const codes = Object.keys(taxonomy.m).sort();
		const aToken = tokenFrom(compareA.value);
		const bToken = tokenFrom(compareB.value);

		if (!aToken && !bToken) throw new Error('Paste at least one share link.');

		const load = async (token: string | null, fallbackToMine: boolean) => {
			if (!token) {
				if (!fallbackToMine || !state) throw new Error('Paste a share link first.');
				return {
					name: 'Mine',
					birds: state.summary.lifeList.map((entry) => ({ sciName: entry.sciName }))
				};
			}
			try {
				return await decodeShare(token, codes);
			} catch (error) {
				// A comparison link holds several lists; use its first two.
				const multi = await decodeCompare(token, codes).catch(() => null);
				if (multi && multi.lists.length >= 2) return multi.lists[0];
				throw error;
			}
		};

		const first = await load(aToken, false);
		const second = await load(bToken, true);
		renderCompare(first, second);

		const shared = compareLists(
			first.birds.map((bird) => bird.sciName),
			second.birds.map((bird) => bird.sciName)
		);
		setCompareStatus(
			`${shared.shared.length} shared · ${shared.onlyFirst.length} only ${first.name ?? 'first'} · ` +
				`${shared.onlySecond.length} only ${second.name ?? 'second'}.`
		);
		compareLinkButton.disabled = false;
	} catch (error) {
		setCompareStatus(
			error instanceof Error ? error.message : 'Those links could not be read.', 'error'
		);
	} finally {
		compareRun.disabled = false;
	}
}

compareRun.addEventListener('click', () => void runCompare());

compareLinkButton.addEventListener('click', () => {
	void (async () => {
		if (!taxonomy) return;
		try {
			const codes = Object.keys(taxonomy.m).sort();
			const lists: CompareList[] = [];
			for (const [input, label] of [
				[compareA, 'First'],
				[compareB, 'Second']
			] as const) {
				const token = tokenFrom(input.value);
				if (token) {
					const decoded = await decodeShare(token, codes).catch(() => null);
					if (decoded) lists.push({ name: decoded.name ?? label, birds: decoded.birds });
				} else if (state) {
					// The comparison format stores species only, so the dates
					// the single-list format carries have nowhere to go here.
					lists.push({
						name: 'Mine',
						birds: state.summary.lifeList.map((entry) => ({ sciName: entry.sciName }))
					});
				}
			}
			if (lists.length < 2) throw new Error('Two lists are needed for a comparison link.');

			const { token, dropped } = await encodeCompare(lists, new Map(codes.map((c, at) => [c, at])), URL_BUDGET - 64);
			const url = `${window.location.origin}/tools/ebird-analytics/?c=${token}`;
			await navigator.clipboard.writeText(url).catch(() => undefined);
			setCompareStatus(`Comparison link copied (${url.length} characters${dropped ? `, ${dropped} omitted` : ''}).`);
		} catch (error) {
			setCompareStatus(
				error instanceof Error ? error.message : 'Could not build a comparison link.', 'error'
			);
		}
	})();
});

/* ---------- persistence wiring ---------- */

async function openSaved(): Promise<void> {
	const saved = loadObservations();
	if (!saved) {
		setStatus('No saved copy on this device.', 'error');
		return;
	}
	setBusy(true);
	try {
		sourceLabel = saved.source;
		await loadTaxonomy();
		await activate(saved.observations, `saved copy, ${describeAge(saved.savedAt)}`);
	} catch (error) {
		setStatus(error instanceof Error ? error.message : 'Could not open the saved copy.', 'error');
	} finally {
		setBusy(false);
	}
}

savedOpen.addEventListener('click', () => void openSaved());
savedForget.addEventListener('click', () => {
	clearObservations();
	refreshSavedPanel();
	storageNote.textContent = 'Saved copy removed from this device.';
});

saveDataButton.addEventListener('click', () => {
	if (!state) return;
	const text = buildDataFile(state.observations, sourceLabel);
	downloadBlob(new Blob([text], { type: 'application/json' }), `ebird-data-${timestamp()}.json`);
	storageNote.textContent =
		`Data file downloaded (${formatBytes(text.length)}). Keep it somewhere safe; ` +
		'load it here to get your dashboard back on any device.';
});

loadDataButton.addEventListener('click', () => dataFileInput.click());
dataFileInput.addEventListener('change', () => {
	const file = dataFileInput.files?.[0];
	if (!file) return;
	void (async () => {
		setBusy(true);
		try {
			const text = await file.text();
			const delivered = parseDataFile(text);
			if (!delivered) {
				throw new Error('That is not an eBird Analytics data file. Use the eBird zip instead.');
			}
			await loadTaxonomy();
			sourceLabel = delivered.source;
			await activate(delivered.observations, delivered.source);
			if (autoSaveToggle.checked) {
				const outcome = saveObservations(delivered.observations, delivered.source);
				storageNote.textContent = outcome.ok
					? `Data file loaded and saved here (${formatBytes(outcome.bytes)}).`
					: outcome.reason;
			}
			refreshSavedPanel();
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Could not read that data file.', 'error');
		} finally {
			setBusy(false);
			dataFileInput.value = '';
		}
	})();
});

fetchButton.addEventListener('click', () => void importFromLink());
pickButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
	const file = fileInput.files?.[0];
	if (file) void importFromFile(file);
});
linkInput.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') void importFromLink();
});
migrantMonth.addEventListener('change', renderMigrants);
migrantMin.addEventListener('change', renderMigrants);
phenologyFilter.addEventListener('input', renderPhenology);
lifeFilter.addEventListener('input', renderLifeList);
lifeSort.addEventListener('change', renderLifeList);

fillMonths();
selectTab('overview');
refreshSavedPanel();
new StickerCard(collageBox);

/**
 * A share link opens a read-only view of someone else's list. Render it from
 * the token and hide the import controls: there is nothing for the visitor to
 * load or save, and offering "forget" on a stranger's list would be confusing.
 */
async function openFromLink(): Promise<void> {
	const params = new URLSearchParams(window.location.search);
	const single = params.get('s');
	const multi = params.get('c');

	const tax = await loadTaxonomy();
	const codes = Object.keys(tax.m).sort();
	// Only the shared views need the name table; every other path skips it.
	const names = await loadCommonNames();

	if (single) {
		const payload = await decodeShare(single, codes);
		const observations = payload.birds.map((bird, at) => syntheticObservation(bird, at, names));
		sourceLabel = payload.name ? `${payload.name}'s shared list` : 'a shared list';
		// Set before activate: renderStats reads it while rendering.
		sparseView = true;
		await activate(observations, sourceLabel);
		enterViewerMode(payload.name ?? 'Shared list', payload.birds.some((bird) => bird.ym !== undefined));
		return;
	}

	if (multi) {
		const payload = await decodeCompare(multi, codes);
		// The comparison itself lives in the compare panel; the first list is
		// what the dashboard shows, so the numbers are not blank.
		const first = payload.lists[0];
		const observations = first.birds.map((bird, at) => syntheticObservation(bird, at, names));
		sourceLabel = first.name ? `${first.name}'s list` : 'a shared list';
		sparseView = true;
		await activate(observations, sourceLabel);
		enterViewerMode(first.name ?? 'Shared list', false);
		compareA.value = '';
		compareB.value = '';
		if (payload.lists.length >= 2) {
			renderCompare(
				{ name: payload.lists[0].name, birds: payload.lists[0].birds },
				{ name: payload.lists[1].name, birds: payload.lists[1].birds }
			);
		}
	}
}

/**
 * A share link carries each species and the month it was first seen — not the
 * checklists, effort, or places. Rebuild one synthetic observation per species
 * so the species, year, family and mass views are exact, and mark the payload
 * sparse so the views that need checklist data are hidden rather than showing
 * zeroes that read as real.
 */
function syntheticObservation(bird: ShareBird, at: number, names: Record<string, string>): EbirdObservation {
	const date = bird.ym !== undefined ? `${ymToIso(bird.ym)}-01` : '';
	return {
		submissionId: `share-${at}`,
		// Share links carry the scientific name only; the name table turns it
		// back into a common name so the page reads like a bird list.
		comName: names[speciesBase(bird.sciName)] ?? bird.sciName,
		sciName: bird.sciName,
		taxonOrder: at,
		count: null,
		countText: '',
		state: '',
		county: '',
		locId: '',
		locName: '',
		date,
		time: '',
		protocol: '',
		durationMin: null,
		allObsReported: false,
		distanceKm: null,
		observers: null,
		breedingCode: '',
		details: ''
	};
}

/**
 * A shared list has species and first-seen months, nothing else.
 *
 * Hiding the panels beats showing zeroes: an "Effort: 0 h" card or an empty
 * hotspot table reads as real data to a visitor who was sent the link. The
 * tabs that survive are the ones the payload can actually answer.
 */
const importLink = (text: string): HTMLAnchorElement => {
	const link = document.createElement('a');
	link.href = '/tools/ebird-analytics/';
	link.textContent = text;
	return link;
};

function enterViewerMode(title: string, hasDates: boolean): void {
	el('ebirdIntake').classList.add('is-hidden');
	document.getElementById('ebirdPng')?.closest('section')?.classList.add('is-hidden');
	saveDataButton.disabled = true;

	const heading = document.querySelector('.tool-hero h1');
	if (heading) heading.textContent = title;

	// Effort, places, migrants and phenology all need the checklist history.
	// Migrants ranks this month against the rest of the year; phenology needs
	// every sighting, not the first one per species.
	for (const tab of SPARSE_HIDDEN_TABS) {
		el<HTMLButtonElement>(`tab-${tab}`).classList.add('is-hidden');
		el<HTMLElement>(`panel-${tab}`).classList.add('is-hidden');
	}

	const notice = document.getElementById('ebirdViewerNote');
	if (notice) {
		// A single-list link carries first-seen months; a comparison link
		// carries species only. Say which one the visitor is looking at.
		notice.replaceChildren(
			hasDates
				? 'This is a shared list, so it carries each species and the month it was first seen. ' +
						'Checklists, effort, hotspots and monthly migration need a full export, so those views are not shown. '
				: 'This is a comparison of shared lists, which carry species only — no dates, checklists or places. ',
			importLink('Import your own data'),
			' for the rest.'
		);
	}
	if (notice) notice.classList.remove('is-hidden');

	// Occupied tabs are gone; land on one that exists.
	selectTab('overview');
}

if (new URLSearchParams(window.location.search).has('s') || new URLSearchParams(window.location.search).has('c')) {
	void openFromLink().catch((error: unknown) => {
		setStatus(
			error instanceof Error ? error.message : 'That share link could not be read.', 'error'
		);
	});
} else if (loadObservations()) {
	// A saved copy opens straight away: the point is not having to ask eBird again.
	void openSaved();
}
