/**
 * Migration, phenology, effort, and hotspot analytics over an eBird export.
 *
 * All functions work on the parsed observations and are pure, so the page can
 * recompute them when a filter changes without re-reading the file.
 *
 * Percentages are shares of *checklists*, not of observations: a bird seen four
 * times on one checklist is one detection. That is the only basis on which
 * "how often did I see this in May" means anything, and it is what eBird's own
 * bar charts report.
 */

import type { EbirdObservation } from './ebird';

/** A species' detection rate per calendar month, 0-1, twelve entries. */
export interface PhenologyRow {
	sciName: string;
	comName: string;
	/** checklists on which the species appeared, per month */
	counts: number[];
	/** counts[m] / checklists[m], 0 when no checklists that month */
	rates: number[];
	/** month with the highest rate, 1-12 */
	peakMonth: number;
	/** other months tied for that peak, for a "Jan & Dec" label */
	peakMonths: number[];
	totalChecklists: number;
}

export interface PhenologyInput {
	observations: EbirdObservation[];
	isCountable: (sciName: string) => boolean;
	speciesBase: (sciName: string) => string;
}

/** Checklists per calendar month, 1-12, indexed from 0. */
export function checklistsByMonth(observations: EbirdObservation[]): number[] {
	const seen = new Set<string>();
	const months = new Array<number>(12).fill(0);
	for (const obs of observations) {
		const month = Number(obs.date.slice(5, 7));
		if (month < 1 || month > 12) continue;
		const key = `${obs.submissionId}|${month}`;
		if (seen.has(key)) continue;
		seen.add(key);
		months[month - 1] += 1;
	}
	return months;
}

/**
 * Monthly detection rate per species.
 *
 * `rates[m]` is the share of that month's checklists which included the
 * species, so a species seen on every May checklist scores 1.0 in May
 * regardless of how many years the list spans.
 */
export function buildPhenology(input: PhenologyInput): PhenologyRow[] {
	const { observations, isCountable, speciesBase } = input;
	const monthChecklists = checklistsByMonth(observations);

	// species -> month -> set of checklist ids
	const detections = new Map<string, { comName: string; months: Array<Set<string>> }>();

	for (const obs of observations) {
		if (!isCountable(obs.sciName)) continue;
		const base = speciesBase(obs.sciName);
		const month = Number(obs.date.slice(5, 7));
		if (month < 1 || month > 12) continue;

		let entry = detections.get(base);
		if (!entry) {
			entry = { comName: obs.comName, months: Array.from({ length: 12 }, () => new Set()) };
			detections.set(base, entry);
		}
		entry.months[month - 1].add(obs.submissionId);
	}

	const rows: PhenologyRow[] = [];
	for (const [sciName, entry] of detections) {
		const counts = entry.months.map((set) => set.size);
		const rates = counts.map((count, index) =>
			monthChecklists[index] > 0 ? count / monthChecklists[index] : 0
		);
		const peak = Math.max(...rates);
		const peakMonths = rates
			.map((rate, index) => (rate === peak && peak > 0 ? index + 1 : 0))
			.filter((month) => month > 0);

		rows.push({
			sciName,
			comName: entry.comName,
			counts,
			rates,
			peakMonth: peakMonths[0] ?? 0,
			peakMonths,
			totalChecklists: counts.reduce((sum, count) => sum + count, 0)
		});
	}

	return rows.sort((a, b) => b.totalChecklists - a.totalChecklists);
}

export interface MigrantRow {
	sciName: string;
	comName: string;
	/** share of the month's checklists this species appeared on */
	monthRate: number;
	/** same, across the other eleven months */
	restRate: number;
	/** monthRate - restRate; the ranking key */
	spike: number;
	/** this month's detections as a share of all its detections */
	concentration: number;
	monthChecklists: number;
	restChecklists: number;
}

/**
 * Species that surge in one month relative to the rest of the year.
 *
 * Requires a minimum number of appearances so a single checklist does not top
 * the list. The default of 2 matches Everybird's "min checklists" idea; a
 * one-off rarity is still visible in the phenology table.
 */
export function buildMigrants(
	observations: EbirdObservation[],
	month: number,
	options: { minimumDetections?: number; isCountable: (sciName: string) => boolean; speciesBase: (sciName: string) => string }
): MigrantRow[] {
	const { minimumDetections = 2, isCountable, speciesBase } = options;
	const monthChecklists = checklistsByMonth(observations);
	const restChecklists = monthChecklists.reduce((sum, count, index) => (index + 1 === month ? sum : sum + count), 0);

	const inMonth = new Map<string, { comName: string; ids: Set<string> }>();
	const inRest = new Map<string, Set<string>>();
	const allDetections = new Map<string, number>();

	for (const obs of observations) {
		if (!isCountable(obs.sciName)) continue;
		const base = speciesBase(obs.sciName);
		const obsMonth = Number(obs.date.slice(5, 7));
		allDetections.set(base, (allDetections.get(base) ?? 0) + 1);

		if (obsMonth === month) {
			const entry = inMonth.get(base) ?? { comName: obs.comName, ids: new Set<string>() };
			entry.ids.add(obs.submissionId);
			inMonth.set(base, entry);
		} else {
			const set = inRest.get(base) ?? new Set<string>();
			set.add(obs.submissionId);
			inRest.set(base, set);
		}
	}

	const rows: MigrantRow[] = [];
	for (const [sciName, entry] of inMonth) {
		if (entry.ids.size < minimumDetections) continue;
		const rest = inRest.get(sciName)?.size ?? 0;
		const monthRate = monthChecklists[month - 1] > 0 ? entry.ids.size / monthChecklists[month - 1] : 0;
		const restRate = restChecklists > 0 ? rest / restChecklists : 0;
		const total = allDetections.get(sciName) ?? entry.ids.size;

		rows.push({
			sciName,
			comName: entry.comName,
			monthRate,
			restRate,
			spike: monthRate - restRate,
			concentration: entry.ids.size / total,
			monthChecklists: monthChecklists[month - 1],
			restChecklists
		});
	}

	return rows.sort((a, b) => b.spike - a.spike || b.monthRate - a.monthRate);
}

export interface EffortMonth {
	month: number;
	checklists: number;
	hours: number;
	distanceKm: number;
	species: number;
}

export interface EffortYear {
	year: number;
	checklists: number;
	hours: number;
	distanceKm: number;
	species: number;
	lifers: number;
}

export interface EffortTotals {
	hours: number;
	distanceKm: number;
	checklists: number;
	/** mean minutes per checklist with a recorded duration */
	minutesPerChecklist: number;
	kilometresPerChecklist: number;
	peakMonth: EffortMonth | null;
}

export interface EffortSummary {
	months: EffortMonth[];
	years: EffortYear[];
	totals: EffortTotals;
}

/**
 * Effort over time. Duration and distance are checklist-level, so they are read
 * once per checklist rather than once per species row.
 */
export function summarizeEffort(
	observations: EbirdObservation[],
	isCountable: (sciName: string) => boolean,
	speciesBase: (sciName: string) => string
): EffortSummary {
	interface Bucket {
		checklists: Set<string>;
		minutes: number;
		distanceKm: number;
		species: Set<string>;
	}

	const monthBuckets = Array.from({ length: 12 }, (): Bucket => ({
		checklists: new Set(),
		minutes: 0,
		distanceKm: 0,
		species: new Set()
	}));
	const yearBuckets = new Map<number, Bucket & { lifers: Set<string> }>();
	const seenChecklists = new Set<string>();

	let totalMinutes = 0;
	let totalDistance = 0;

	for (const obs of observations) {
		const month = Number(obs.date.slice(5, 7));
		const year = Number(obs.date.slice(0, 4));
		if (month < 1 || month > 12 || Number.isNaN(year)) continue;

		const species = isCountable(obs.sciName) ? speciesBase(obs.sciName) : null;

		const monthBucket = monthBuckets[month - 1];
		const yearBucket = yearBuckets.get(year) ?? {
			checklists: new Set<string>(),
			minutes: 0,
			distanceKm: 0,
			species: new Set<string>(),
			lifers: new Set<string>()
		};
		yearBuckets.set(year, yearBucket);

		if (species) {
			monthBucket.species.add(species);
			yearBucket.species.add(species);
		}

		// Effort fields repeat on every row of a checklist; count them once.
		if (!seenChecklists.has(obs.submissionId)) {
			seenChecklists.add(obs.submissionId);
			const minutes = obs.durationMin ?? 0;
			const distance = obs.distanceKm ?? 0;

			monthBucket.checklists.add(obs.submissionId);
			monthBucket.minutes += minutes;
			monthBucket.distanceKm += distance;
			yearBucket.checklists.add(obs.submissionId);
			yearBucket.minutes += minutes;
			yearBucket.distanceKm += distance;
			totalMinutes += minutes;
			totalDistance += distance;
		}
	}

	// Lifers: the first year each species appears.
	const firstYear = new Map<string, number>();
	for (const obs of observations) {
		if (!isCountable(obs.sciName)) continue;
		const base = speciesBase(obs.sciName);
		const year = Number(obs.date.slice(0, 4));
		const current = firstYear.get(base);
		if (current === undefined || year < current) firstYear.set(base, year);
	}
	for (const [species, year] of firstYear) {
		yearBuckets.get(year)?.lifers.add(species);
	}

	const months: EffortMonth[] = monthBuckets.map((bucket, index) => ({
		month: index + 1,
		checklists: bucket.checklists.size,
		hours: bucket.minutes / 60,
		distanceKm: bucket.distanceKm,
		species: bucket.species.size
	}));

	const years: EffortYear[] = [...yearBuckets.entries()]
		.map(([year, bucket]) => ({
			year,
			checklists: bucket.checklists.size,
			hours: bucket.minutes / 60,
			distanceKm: bucket.distanceKm,
			species: bucket.species.size,
			lifers: bucket.lifers.size
		}))
		.sort((a, b) => a.year - b.year);

	const checklistCount = seenChecklists.size;
	const peakMonth = months.reduce<EffortMonth | null>(
		(best, month) => (month.hours > (best?.hours ?? 0) ? month : best),
		null
	);

	return {
		months,
		years,
		totals: {
			hours: totalMinutes / 60,
			distanceKm: totalDistance,
			checklists: checklistCount,
			minutesPerChecklist: checklistCount > 0 ? totalMinutes / checklistCount : 0,
			kilometresPerChecklist: checklistCount > 0 ? totalDistance / checklistCount : 0,
			peakMonth
		}
	};
}

export interface HotspotStat {
	name: string;
	state: string;
	county: string;
	species: number;
	checklists: number;
	lastDate: string;
}

/** Places ranked by species count, which is how birders pick where to go. */
export function rankHotspots(observations: EbirdObservation[], isCountable: (sciName: string) => boolean, speciesBase: (sciName: string) => string, limit = 10): HotspotStat[] {
	const map = new Map<string, { state: string; county: string; species: Set<string>; checklists: Set<string>; lastDate: string }>();

	for (const obs of observations) {
		const key = obs.locName || obs.locId;
		const entry = map.get(key) ?? {
			state: obs.state,
			county: obs.county,
			species: new Set<string>(),
			checklists: new Set<string>(),
			lastDate: ''
		};
		map.set(key, entry);

		entry.checklists.add(obs.submissionId);
		if (obs.date > entry.lastDate) entry.lastDate = obs.date;
		if (isCountable(obs.sciName)) entry.species.add(speciesBase(obs.sciName));
	}

	return [...map.entries()]
		.map(([name, entry]) => ({
			name,
			state: entry.state,
			county: entry.county,
			species: entry.species.size,
			checklists: entry.checklists.size,
			lastDate: entry.lastDate
		}))
		.sort((a, b) => b.species - a.species || b.checklists - a.checklists)
		.slice(0, limit);
}

export interface RegionStat {
	code: string;
	name: string;
	species: number;
	checklists: number;
	observations: number;
}

/**
 * Group by state/province code. eBird writes `US-MD` or `CA-BC`; a country is
 * the prefix before the dash.
 */
export function summarizeRegions(observations: EbirdObservation[], isCountable: (sciName: string) => boolean, speciesBase: (sciName: string) => string): RegionStat[] {
	const map = new Map<string, { species: Set<string>; checklists: Set<string>; observations: number }>();

	for (const obs of observations) {
		const code = obs.state || '—';
		const entry = map.get(code) ?? { species: new Set<string>(), checklists: new Set<string>(), observations: 0 };
		map.set(code, entry);

		entry.checklists.add(obs.submissionId);
		entry.observations += 1;
		if (isCountable(obs.sciName)) entry.species.add(speciesBase(obs.sciName));
	}

	return [...map.entries()]
		.map(([code, entry]) => ({
			code,
			name: code,
			species: entry.species.size,
			checklists: entry.checklists.size,
			observations: entry.observations
		}))
		.sort((a, b) => b.species - a.species || b.checklists - a.checklists);
}

export interface YearSpecies {
	year: number;
	species: number;
	lifers: number;
}

/** Species seen in each year, with lifers counted from first appearances. */
export function speciesByYear(effort: EffortSummary): YearSpecies[] {
	return effort.years.map((year) => ({ year: year.year, species: year.species, lifers: year.lifers }));
}
