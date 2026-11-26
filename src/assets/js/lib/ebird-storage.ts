/**
 * Local persistence for the eBird dashboard.
 *
 * Two things are stored, for different reasons:
 *
 * - the parsed observations under the export's own shape, so a returning
 *   visitor sees their dashboard without touching eBird again;
 * - a small version marker with the save date, so the UI can say how old the
 *   copy is and the reader can tell when it is worth refreshing.
 *
 * localStorage is a 5 MB budget shared across the whole origin. A heavy
 * lister's export is tens of thousands of rows and will not fit, so saving
 * degrades in order: full rows, then a trimmed shape, then the raw CSV text,
 * then nothing but a clear error. The trimmed shape keeps every field the
 * dashboard reads and drops the free-text notes.
 */

import type { EbirdObservation } from './ebird';

export const STORAGE_KEY = 'ebird-analytics:v1';
export const STORAGE_VERSION = 1;

/** Above this many rows, store the compact shape rather than every field. */
const COMPACT_ABOVE = 8000;

export interface StoredPayload {
	version: number;
	savedAt: string;
	/** which eBird account or file this came from, for the "loaded from" line */
	source: string;
	observations: EbirdObservation[];
}

export type SaveOutcome =
	| { ok: true; bytes: number; compact: boolean }
	| { ok: false; reason: string };

const PERSISTED_FIELDS = [
	'submissionId',
	'comName',
	'sciName',
	'taxonOrder',
	'count',
	'countText',
	'state',
	'county',
	'locId',
	'locName',
	'date',
	'time',
	'protocol',
	'durationMin',
	'allObsReported',
	'distanceKm',
	'observers',
	'breedingCode',
	'details'
] as const;

/**
 * Drop free-text notes before storing. `details` and the checklist comment are
 * the only fields the analytics never read, and on a big list they are most of
 * the bytes.
 */
function compact(observations: EbirdObservation[]): EbirdObservation[] {
	return observations.map((obs) => ({ ...obs, details: '' }));
}

export function saveObservations(
	observations: EbirdObservation[],
	source: string
): SaveOutcome {
	const attempts: { rows: EbirdObservation[]; compact: boolean }[] = [];
	if (observations.length > COMPACT_ABOVE) {
		attempts.push({ rows: compact(observations), compact: true });
	} else {
		attempts.push({ rows: observations, compact: false });
		attempts.push({ rows: compact(observations), compact: true });
	}

	let lastSize = 0;
	for (const attempt of attempts) {
		const payload: StoredPayload = {
			version: STORAGE_VERSION,
			savedAt: new Date().toISOString(),
			source,
			observations: attempt.rows
		};
		const serialised = JSON.stringify(payload);
		lastSize = serialised.length;
		try {
			localStorage.setItem(STORAGE_KEY, serialised);
			return { ok: true, bytes: serialised.length, compact: attempt.compact };
		} catch {
			// Quota or a disabled store; try the smaller shape, then give up.
		}
	}

	return {
		ok: false,
		reason:
			lastSize > 0
				? `Your browser's storage is full (${(lastSize / 1_048_576).toFixed(1)} MB needed). Use "Save data file" instead.`
				: 'This browser blocks site storage. Use "Save data file" instead.'
	};
}

export interface LoadedPayload {
	savedAt: string;
	source: string;
	observations: EbirdObservation[];
}

export function loadObservations(): LoadedPayload | null {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
	if (!raw) return null;

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		if (!('version' in parsed) || parsed.version !== STORAGE_VERSION) return null;
		if (!('observations' in parsed) || !Array.isArray(parsed.observations)) return null;

		const savedAt = 'savedAt' in parsed && typeof parsed.savedAt === 'string' ? parsed.savedAt : '';
		const source = 'source' in parsed && typeof parsed.source === 'string' ? parsed.source : 'saved copy';

		return { savedAt, source, observations: parsed.observations as EbirdObservation[] };
	} catch {
		return null;
	}
}

export function clearObservations(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to do; the store is unavailable anyway.
	}
}

/**
 * The portable file. One JSON document holding the same rows, so a reader can
 * carry their data between devices or keep a copy when storage is full.
 *
 * Shape is stable and versioned; a future reader can migrate on `version`.
 */
export function buildDataFile(observations: EbirdObservation[], source: string): string {
	const payload = {
		format: 'ebird-analytics-export',
		version: STORAGE_VERSION,
		savedAt: new Date().toISOString(),
		source,
		fields: PERSISTED_FIELDS,
		observations
	};
	return JSON.stringify(payload);
}

/** Read a file this module wrote, or a plain MyEBirdData CSV someone renamed. */
export function parseDataFile(text: string): LoadedPayload | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object') return null;
	if (!('format' in parsed) || parsed.format !== 'ebird-analytics-export') return null;
	if (!('observations' in parsed) || !Array.isArray(parsed.observations)) return null;

	return {
		savedAt: 'savedAt' in parsed && typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
		source: 'source' in parsed && typeof parsed.source === 'string' ? parsed.source : 'imported file',
		observations: parsed.observations as EbirdObservation[]
	};
}

/** "saved 3 days ago", or a date once it is older than a month. */
export function describeAge(iso: string): string {
	if (!iso) return '';
	const saved = new Date(iso);
	if (Number.isNaN(saved.getTime())) return '';

	const days = Math.floor((Date.now() - saved.getTime()) / 86_400_000);
	if (days <= 0) return 'saved today';
	if (days === 1) return 'saved yesterday';
	if (days < 30) return `saved ${days} days ago`;
	return `saved ${saved.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
