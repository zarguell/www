/**
 * eBird export parsing and analytics.
 *
 * The input is `MyEBirdData.csv` from eBird's "Download My Data", or the zip
 * that wraps it. One row per species per checklist; checklist-level fields
 * repeat on every row of that checklist.
 *
 * A life list is not the row count. Taxa that are not full species — `sp.`,
 * slashes, hybrids, domestic types — appear in the file but do not count.
 * A subspecies group does count, folded into its parent species by taking the
 * first two words of the scientific name.
 */

export interface EbirdObservation {
	submissionId: string;
	comName: string;
	sciName: string;
	taxonOrder: number;
	count: number | null;
	countText: string;
	state: string;
	county: string;
	locId: string;
	locName: string;
	date: string;
	time: string;
	protocol: string;
	durationMin: number | null;
	allObsReported: boolean;
	distanceKm: number | null;
	observers: number | null;
	breedingCode: string;
	details: string;
}

export interface Checklist {
	submissionId: string;
	locName: string;
	state: string;
	county: string;
	date: string;
	protocol: string;
	durationMin: number | null;
	distanceKm: number | null;
	species: string;
	rows: number;
}

export interface LifeListEntry {
	sciName: string;
	comName: string;
	firstDate: string;
	lastDate: string;
	checklists: number;
	/** most recent place the species was recorded, for the hover card */
	lastPlace: string;
	/** highest count on any single checklist, 0 when never counted */
	bestCount: number;
}

export interface FamilyStat {
	name: string;
	order: string;
	species: number;
	observations: number;
}

export interface YearStat {
	year: number;
	lifers: number;
	checklists: number;
	species: number;
}

export interface LocationStat {
	name: string;
	state: string;
	species: number;
	checklists: number;
}

export interface EbirdSummary {
	observations: EbirdObservation[];
	checklists: Checklist[];
	lifeList: LifeListEntry[];
	skippedTaxa: string[];
	stats: {
		species: number;
		checklists: number;
		observationRows: number;
		families: number;
		orders: number;
		regions: number;
		firstDate: string;
		lastDate: string;
		hours: number;
		distanceKm: number;
		countedBirds: number;
	};
	families: FamilyStat[];
	years: YearStat[];
	locations: LocationStat[];
}

/** Taxonomy payload baked at build time from the eBird reference API. */
export interface Taxonomy {
	/** [common name, scientific name], indexed by the numbers in `m` */
	f: [string, string][];
	/** order display names, indexed by the numbers in `m` */
	o: string[];
	/** species base (`Genus species`) -> [family index, order index, mass in grams] */
	m: Record<string, [number, number, number]>;
	/** state/province code (`US-MD`) -> display name */
	s: Record<string, string>;
	/** country code (`US`) -> display name */
	c: Record<string, string>;
}

export interface TaxonomyEntry {
	family: string;
	/** scientific family name, used to build the sticker path */
	familySci: string;
	order: string;
	/** body mass in grams, 0 when the source has none */
	mass: number;
}

/** Strip a UTF-8 BOM. eBird writes one, and it corrupts the first header name. */
export function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC 4180 parser. eBird quotes any field containing a comma (location names
 * like "Rio Park, Gaithersburg"), so splitting on commas loses columns.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];

		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				quoted = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}

		if (ch === '"') {
			quoted = true;
			i += 1;
			continue;
		}
		if (ch === ',') {
			row.push(field);
			field = '';
			i += 1;
			continue;
		}
		if (ch === '\r') {
			i += 1;
			continue;
		}
		if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i += 1;
			continue;
		}
		field += ch;
		i += 1;
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

const COLUMNS = {
	submissionId: 'Submission ID',
	comName: 'Common Name',
	sciName: 'Scientific Name',
	taxonOrder: 'Taxonomic Order',
	count: 'Count',
	state: 'State/Province',
	county: 'County',
	locId: 'Location ID',
	locName: 'Location',
	date: 'Date',
	time: 'Time',
	protocol: 'Protocol',
	durationMin: 'Duration (Min)',
	allObs: 'All Obs Reported',
	distanceKm: 'Distance Traveled (km)',
	observers: 'Number of Observers',
	breedingCode: 'Breeding Code',
	details: 'Observation Details'
} as const;

type ColumnKey = keyof typeof COLUMNS;

function numberOrNull(value: string | undefined): number | null {
	if (value === undefined) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Two-word base of a scientific name; subspecies groups fold into their parent. */
export function speciesBase(sciName: string): string {
	return sciName.trim().split(/\s+/).slice(0, 2).join(' ');
}

/**
 * Whether a row is a full species and therefore counts on a life list.
 *
 * Excluded by shape: `sp.` groups, hybrids, domestic types, and slashes that
 * span the two-word binomial ("Anas rubripes/platyrhynchos" = either species).
 *
 * Not excluded: subspecies groups like "Dryobates pubescens pubescens/medianus"
 * and "Colaptes auratus auratus/luteus". eBird treats those as their parent
 * species, so the slash only matters when it sits inside the binomial.
 *
 * The domestic label is matched exactly, not by the word "domestic": the Latin
 * epithet `domesticus` (House Sparrow, `Passer domesticus`) contains it.
 *
 * Anything left over must exist in the species taxonomy, which also rejects
 * non-species taxa the shape rules miss.
 */
export function isCountableSpecies(sciName: string, taxonomy: Taxonomy): boolean {
	const name = sciName.trim();
	if (!name) return false;
	if (/(^|\s)sp\.?(\s|$)/i.test(name)) return false;
	if (/\sx\s/.test(name)) return false;
	if (/\(domestic type\)/i.test(name)) return false;
	const base = speciesBase(name);
	if (base.includes('/')) return false;
	return base in taxonomy.m;
}

export interface ParseResult {
	observations: EbirdObservation[];
	skippedTaxa: string[];
}

/**
 * Map CSV text to observations. Rows whose scientific name is not a countable
 * species stay in the output (they are real sightings) but are flagged through
 * `skippedTaxa` for the caller to report.
 */
export function parseEbirdCsv(text: string, taxonomy: Taxonomy): ParseResult {
	const table = parseCsv(stripBom(text));
	if (table.length < 2) return { observations: [], skippedTaxa: [] };

	const header = table[0].map((cell) => cell.trim());
	const index = {} as Record<ColumnKey, number>;
	for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
		index[key] = header.indexOf(COLUMNS[key]);
	}
	if (index.sciName < 0 || index.submissionId < 0) {
		throw new Error('This does not look like a MyEBirdData.csv export.');
	}

	const observations: EbirdObservation[] = [];
	const skipped = new Set<string>();

	for (let r = 1; r < table.length; r += 1) {
		const row = table[r];
		if (!row.length || (row.length === 1 && !row[0])) continue;

		const cell = (key: ColumnKey): string => {
			const at = index[key];
			return at >= 0 && at < row.length ? row[at].trim() : '';
		};

		const sciName = cell('sciName');
		if (!sciName) continue;

		const countText = cell('count');
		const observation: EbirdObservation = {
			submissionId: cell('submissionId'),
			comName: cell('comName') || sciName,
			sciName,
			taxonOrder: numberOrNull(cell('taxonOrder')) ?? 0,
			count: numberOrNull(countText),
			countText,
			state: cell('state'),
			county: cell('county'),
			locId: cell('locId'),
			locName: cell('locName'),
			date: cell('date'),
			time: cell('time'),
			protocol: cell('protocol'),
			durationMin: numberOrNull(cell('durationMin')),
			allObsReported: cell('allObs') === '1',
			distanceKm: numberOrNull(cell('distanceKm')),
			observers: numberOrNull(cell('observers')),
			breedingCode: cell('breedingCode'),
			details: cell('details')
		};

		observations.push(observation);
		if (!isCountableSpecies(sciName, taxonomy)) skipped.add(observation.comName);
	}

	return { observations, skippedTaxa: [...skipped].sort() };
}

/** Collapse observations into checklists. Checklist effort is not additive. */
export function buildChecklists(observations: EbirdObservation[]): Checklist[] {
	const map = new Map<string, Checklist>();
	for (const obs of observations) {
		const key = obs.submissionId;
		const existing = map.get(key);
		if (existing) {
			existing.rows += 1;
			continue;
		}
		map.set(key, {
			submissionId: key,
			locName: obs.locName,
			state: obs.state,
			county: obs.county,
			date: obs.date,
			protocol: obs.protocol,
			durationMin: obs.durationMin,
			distanceKm: obs.distanceKm,
			species: obs.sciName,
			rows: 1
		});
	}
	return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** One entry per countable species, with first and last encounter dates. */
export function buildLifeList(
	observations: EbirdObservation[],
	taxonomy: Taxonomy
): LifeListEntry[] {
	const map = new Map<string, LifeListEntry & { ids: Set<string> }>();

	for (const obs of observations) {
		if (!isCountableSpecies(obs.sciName, taxonomy)) continue;
		const base = speciesBase(obs.sciName);
		const existing = map.get(base);
		if (existing) {
			if (obs.date < existing.firstDate) existing.firstDate = obs.date;
			if (obs.date > existing.lastDate) {
				existing.lastDate = obs.date;
				existing.comName = obs.comName;
				existing.lastPlace = obs.locName;
			}
			if ((obs.count ?? 0) > existing.bestCount) existing.bestCount = obs.count ?? 0;
			existing.ids.add(obs.submissionId);
			continue;
		}
		map.set(base, {
			sciName: base,
			comName: obs.comName,
			firstDate: obs.date,
			lastDate: obs.date,
			checklists: 0,
			lastPlace: obs.locName,
			bestCount: obs.count ?? 0,
			ids: new Set([obs.submissionId])
		});
	}

	return [...map.values()]
		.map((entry) => ({
			sciName: entry.sciName,
			comName: entry.comName,
			firstDate: entry.firstDate,
			lastDate: entry.lastDate,
			checklists: entry.ids.size,
			lastPlace: entry.lastPlace,
			bestCount: entry.bestCount
		}))
		.sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}

/** Taxonomy lookup with a name-based fallback for anything the index misses. */
export function taxonomyFor(sciName: string, taxonomy: Taxonomy): TaxonomyEntry {
	const hit = taxonomy.m[speciesBase(sciName)];
	if (!hit) {
		return { family: 'Unclassified', familySci: '', order: 'Unclassified', mass: 0 };
	}
	const family = taxonomy.f[hit[0]];
	return {
		family: family?.[0] ?? 'Unclassified',
		familySci: family?.[1] ?? '',
		order: taxonomy.o[hit[1]] ?? 'Unclassified',
		mass: hit[2] ?? 0
	};
}

/** Display name for a state/province code, falling back to the code itself. */
export function regionName(code: string, taxonomy: Taxonomy): string {
	if (!code) return '—';
	return taxonomy.s[code] ?? taxonomy.c[code.split('-')[0]] ?? code;
}

/** Everything the page needs, computed in one pass over the rows. */
export function summarize(
	observations: EbirdObservation[],
	taxonomy: Taxonomy
): EbirdSummary {
	const checklists = buildChecklists(observations);
	const lifeList = buildLifeList(observations, taxonomy);

	const families = new Map<string, FamilyStat>();
	const seenPerFamily = new Map<string, Set<string>>();
	const years = new Map<number, { lifers: number; ids: Set<string>; species: Set<string> }>();
	const locations = new Map<string, { state: string; ids: Set<string>; species: Set<string> }>();
	const regions = new Set<string>();
	const countable = new Set<string>();

	let hours = 0;
	let distanceKm = 0;
	let firstDate = '';
	let lastDate = '';
	let countedBirds = 0;

	const liferYear = new Map<string, number>();
	for (const entry of lifeList) {
		liferYear.set(entry.sciName, Number(entry.firstDate.slice(0, 4)));
	}

	for (const checklist of checklists) {
		hours += (checklist.durationMin ?? 0) / 60;
		distanceKm += checklist.distanceKm ?? 0;
		if (!firstDate || checklist.date < firstDate) firstDate = checklist.date;
		if (!lastDate || checklist.date > lastDate) lastDate = checklist.date;
	}

	for (const obs of observations) {
		const year = Number(obs.date.slice(0, 4));
		const region = obs.state.split('-')[0];
		if (region) regions.add(region);

		const yearEntry = years.get(year) ?? { lifers: 0, ids: new Set<string>(), species: new Set<string>() };
		yearEntry.ids.add(obs.submissionId);
		years.set(year, yearEntry);

		const locEntry = locations.get(obs.locName) ?? {
			state: obs.state,
			ids: new Set<string>(),
			species: new Set<string>()
		};
		locEntry.ids.add(obs.submissionId);
		locations.set(obs.locName, locEntry);

		if (!isCountableSpecies(obs.sciName, taxonomy)) continue;

		const base = speciesBase(obs.sciName);
		countable.add(base);
		yearEntry.species.add(base);
		locEntry.species.add(base);
		if (obs.count !== null) countedBirds += obs.count;

		const tax = taxonomyFor(obs.sciName, taxonomy);
		const familyEntry = families.get(tax.family) ?? {
			name: tax.family,
			order: tax.order,
			species: 0,
			observations: 0
		};
		familyEntry.observations += 1;
		families.set(tax.family, familyEntry);

		const familySpecies = seenPerFamily.get(tax.family) ?? new Set<string>();
		familySpecies.add(base);
		seenPerFamily.set(tax.family, familySpecies);
	}

	for (const [family, members] of seenPerFamily) {
		const entry = families.get(family);
		if (entry) entry.species = members.size;
	}

	for (const entry of lifeList) {
		const year = liferYear.get(entry.sciName) ?? 0;
		const yearEntry = years.get(year);
		if (yearEntry) yearEntry.lifers += 1;
	}

	const orders = new Set<string>();
	for (const family of families.values()) {
		if (family.order !== 'Unclassified') orders.add(family.order);
	}

	return {
		observations,
		checklists,
		lifeList,
		skippedTaxa: [],
		stats: {
			species: countable.size,
			checklists: checklists.length,
			observationRows: observations.length,
			families: families.size,
			orders: orders.size,
			regions: regions.size,
			firstDate,
			lastDate,
			hours,
			distanceKm,
			countedBirds
		},
		families: [...families.values()].sort(
			(a, b) => b.species - a.species || b.observations - a.observations
		),
		years: [...years.entries()]
			.map(([year, entry]) => ({
				year,
				lifers: entry.lifers,
				checklists: entry.ids.size,
				species: entry.species.size
			}))
			.sort((a, b) => a.year - b.year),
		locations: [...locations.entries()]
			.map(([name, entry]) => ({
				name,
				state: entry.state,
				species: entry.species.size,
				checklists: entry.ids.size
			}))
			.sort((a, b) => b.species - a.species || b.checklists - a.checklists)
	};
}

/** Peak month for a species, from its observation dates. */
export function monthlyHistogram(observations: EbirdObservation[]): number[] {
	const months = new Array<number>(12).fill(0);
	for (const obs of observations) {
		const month = Number(obs.date.slice(5, 7));
		if (month >= 1 && month <= 12) months[month - 1] += 1;
	}
	return months;
}
