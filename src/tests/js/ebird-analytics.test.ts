import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildChecklists,
	buildLifeList,
	isCountableSpecies,
	parseCsv,
	parseEbirdCsv,
	speciesBase,
	stripBom,
	summarize,
	type Taxonomy
} from '../../assets/js/lib/ebird';
import {
	buildMigrants,
	buildPhenology,
	checklistsByMonth,
	rankHotspots,
	speciesByYear,
	summarizeEffort,
	summarizeRegions
} from '../../assets/js/lib/ebird-stats';
import { findCsvEntry, isZip, readZipEntries, readZipEntryText } from '../../assets/js/lib/zip';

const TAXONOMY: Taxonomy = {
	f: [
		['Ducks, Geese, and Waterfowl', 'Anatidae'],
		['Pigeons and Doves', 'Columbidae'],
		['Thrushes and Allies', 'Turdidae']
	],
	o: ['Anseriformes', 'Columbiformes', 'Passeriformes'],
	m: {
		'Branta canadensis': [0, 0, 4800],
		'Anas platyrhynchos': [0, 0, 1100],
		'Turdus migratorius': [2, 2, 77],
		'Columba livia': [1, 1, 350],
		'Passer domesticus': [1, 2, 26],
		'Cairina moschata': [0, 0, 3000],
		'Dryobates pubescens': [1, 2, 27],
		'Colaptes auratus': [1, 2, 130]
	},
	s: { 'US-MD': 'Maryland', 'US-VA': 'Virginia' },
	c: { US: 'United States' }
};

// jsdom rewrites import.meta.url, so resolve fixtures from the project root.
const csvFixture = (): string => readFileSync('tests/js/fixtures/sample.csv', 'utf8');
const zipFixture = (): Uint8Array =>
	new Uint8Array(readFileSync('tests/js/fixtures/sample.zip'));

describe('csv reader', () => {
	it('keeps commas inside quoted fields in one column', () => {
		const rows = parseCsv('a,b\n"x, y",z\n');
		expect(rows).toEqual([
			['a', 'b'],
			['x, y', 'z']
		]);
	});

	it('unescapes doubled quotes', () => {
		expect(parseCsv('a\n"say ""hi"""\n')[1]).toEqual(['say "hi"']);
	});

	it('strips a leading BOM and leaves clean text alone', () => {
		expect(stripBom('\ufeffSubmission ID')).toBe('Submission ID');
		expect(stripBom('Submission ID')).toBe('Submission ID');
	});
});

describe('taxonomy rules', () => {
	it('folds a subspecies group into its parent species', () => {
		expect(speciesBase('Anas platyrhynchos diazi')).toBe('Anas platyrhynchos');
		expect(speciesBase('Turdus migratorius')).toBe('Turdus migratorius');
	});

	it('rejects non-species taxa that appear in real exports', () => {
		expect(isCountableSpecies('Anatidae (duck sp.)', TAXONOMY)).toBe(false);
		expect(isCountableSpecies('Anas rubripes/platyrhynchos', TAXONOMY)).toBe(false);
		expect(isCountableSpecies('Anser sp. (Domestic type)', TAXONOMY)).toBe(false);
		expect(isCountableSpecies('Corvus brachyrhynchos x ossifragus', TAXONOMY)).toBe(false);
		expect(isCountableSpecies('Branta canadensis', TAXONOMY)).toBe(true);
	});

	// A trinomial slash is a subspecies group, which eBird counts as the parent
	// species. Only a slash inside the binomial means "one of two species".
	it('counts subspecies groups whose trinomial carries a slash', () => {
		expect(isCountableSpecies('Dryobates pubescens pubescens/medianus', TAXONOMY)).toBe(true);
		expect(speciesBase('Colaptes auratus auratus/luteus')).toBe('Colaptes auratus');
		expect(isCountableSpecies('Anas rubripes/platyrhynchos', TAXONOMY)).toBe(false);
	});

	// House Sparrow is "Passer domesticus"; the Latin epithet contains
	// "domestic" and must not be mistaken for a domestic-type label.
	it('does not confuse the epithet domesticus with a domestic type', () => {
		expect(isCountableSpecies('Passer domesticus', TAXONOMY)).toBe(true);
		expect(isCountableSpecies('Cairina moschata (Domestic type)', TAXONOMY)).toBe(false);
	});
});

describe('export parsing', () => {
	it('reads rows, keeps non-species observations, and flags them', () => {
		const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);
		expect(parsed.observations).toHaveLength(6);
		expect(parsed.skippedTaxa).toEqual(['American Black Duck/Mallard', 'duck sp.']);
		expect(parsed.observations[0].locName).toBe('Rio Park, Gaithersburg');
		expect(parsed.observations[0].durationMin).toBe(12);
	});

	it('treats an X count as present-but-uncounted', () => {
		const duck = parseEbirdCsv(csvFixture(), TAXONOMY).observations.find(
			(row) => row.comName === 'duck sp.'
		);
		expect(duck?.count).toBeNull();
		expect(duck?.countText).toBe('X');
	});

	it('rejects a file that is not an export', () => {
		expect(() => parseEbirdCsv('a,b\n1,2\n', TAXONOMY)).toThrow(/MyEBirdData/);
	});
});

describe('life list and summary', () => {
	const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);

	it('counts one entry per species, folding subspecies groups', () => {
		const life = buildLifeList(parsed.observations, TAXONOMY);
		const names = life.map((entry) => entry.sciName);
		expect(names).toContain('Anas platyrhynchos');
		expect(names).toContain('Branta canadensis');
		expect(names).toContain('Turdus migratorius');
		expect(names.filter((name) => name === 'Anas platyrhynchos')).toHaveLength(1);
		expect(names).not.toContain('Anatidae (duck sp.)');
	});

	it('tracks first and last encounter dates', () => {
		const mallard = buildLifeList(parsed.observations, TAXONOMY).find(
			(entry) => entry.sciName === 'Anas platyrhynchos'
		);
		expect(mallard?.firstDate).toBe('2024-06-08');
		expect(mallard?.lastDate).toBe('2025-03-02');
		expect(mallard?.checklists).toBe(2);
	});

	it('keeps the latest place and the best single count for the hover card', () => {
		const life = buildLifeList(parsed.observations, TAXONOMY);
		const mallard = life.find((entry) => entry.sciName === 'Anas platyrhynchos');
		// The sticker card names the most recent spot and the highest count,
		// both of which come from rows the last-date branch already walks.
		expect(mallard?.lastPlace).toBe('Rio Park, Gaithersburg');
		expect(mallard?.bestCount).toBe(7);

		// A species seen once keeps that row's place and count.
		const goose = life.find((entry) => entry.sciName === 'Branta canadensis');
		expect(goose?.lastPlace).toBeTruthy();
		expect(goose?.bestCount).toBeGreaterThan(0);
	});

	it('collapses rows into checklists without summing effort', () => {
		const checklists = buildChecklists(parsed.observations);
		expect(checklists).toHaveLength(3);
		const first = checklists.find((entry) => entry.submissionId === 'S1');
		expect(first?.rows).toBe(3);
		expect(first?.durationMin).toBe(12);
	});

	it('summarizes effort, species, and per-year lifers', () => {
		const summary = summarize(parsed.observations, TAXONOMY);
		expect(summary.stats.species).toBe(3);
		expect(summary.stats.checklists).toBe(3);
		expect(summary.stats.observationRows).toBe(6);
		expect(summary.stats.hours).toBeCloseTo(0.7, 5);
		expect(summary.stats.distanceKm).toBeCloseTo(0.187, 5);
		expect(summary.stats.firstDate).toBe('2024-06-08');
		expect(summary.stats.lastDate).toBe('2026-01-14');
		expect(summary.stats.regions).toBe(1);

		const byYear = Object.fromEntries(summary.years.map((year) => [year.year, year]));
		// Goose and Mallard both debut on the same checklist.
		expect(byYear[2024].lifers).toBe(2);
		expect(byYear[2024].species).toBe(2);
		expect(byYear[2025].lifers).toBe(1);
		expect(byYear[2025].species).toBe(2);
		expect(byYear[2026].species).toBe(0);
	});

	it('ranks families by species count', () => {
		const summary = summarize(parsed.observations, TAXONOMY);
		expect(summary.families[0]).toEqual({
			name: 'Ducks, Geese, and Waterfowl',
			order: 'Anseriformes',
			species: 2,
			observations: 3
		});
	});
});

describe('zip reader', () => {
	it('finds the csv inside an eBird export', () => {
		const bytes = zipFixture();
		expect(isZip(bytes)).toBe(true);
		const entry = findCsvEntry(readZipEntries(bytes));
		expect(entry.name).toBe('MyEBirdData.csv');
		expect(entry.method).toBe(8);
	});

	it('inflates the deflated csv', async () => {
		const bytes = zipFixture();
		const text = await readZipEntryText(bytes, findCsvEntry(readZipEntries(bytes)));
		expect(text).toContain('Submission ID');
		expect(parseEbirdCsv(text, TAXONOMY).observations).toHaveLength(6);
	});

	it('reports a zip with no csv instead of guessing', () => {
		expect(() => findCsvEntry([{ name: 'notes.txt', start: 0, compressedSize: 0, uncompressedSize: 0, method: 0 }])).toThrow(/No CSV/);
	});

	it('rejects bytes that are not a zip', () => {
		expect(isZip(new Uint8Array([1, 2, 3, 4]))).toBe(false);
		expect(() => readZipEntries(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a zip/);
	});
});


describe('checklist monthly tally', () => {
	const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);

	it('counts each checklist once per month, not once per species row', () => {
		const months = checklistsByMonth(parsed.observations);
		// S1 has three species rows in June; it must contribute one.
		expect(months[5]).toBe(1);
		expect(months[2]).toBe(1);
		expect(months[0]).toBe(1);
		expect(months.reduce((sum, count) => sum + count, 0)).toBe(3);
	});
});

describe('phenology', () => {
	const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);
	const isCountable = (sciName: string): boolean => isCountableSpecies(sciName, TAXONOMY);
	const rows = buildPhenology({ observations: parsed.observations, isCountable, speciesBase });

	it('reports detection as a share of that month\'s checklists', () => {
		const mallard = rows.find((row) => row.sciName === 'Anas platyrhynchos');
		// Seen in June 2024 and March 2025, one checklist in each.
		expect(mallard?.rates[5]).toBe(1);
		expect(mallard?.rates[2]).toBe(1);
		expect(mallard?.rates[0]).toBe(0);
	});

	it('names every month tied for the peak', () => {
		const mallard = rows.find((row) => row.sciName === 'Anas platyrhynchos');
		expect(mallard?.peakMonths).toEqual([3, 6]);
	});

	it('leaves non-species taxa out', () => {
		expect(rows.some((row) => row.sciName.includes(' sp.'))).toBe(false);
	});
});

describe('migrants', () => {
	const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);
	const isCountable = (sciName: string): boolean => isCountableSpecies(sciName, TAXONOMY);

	it('ranks by spike against the rest of the year', () => {
		const rows = buildMigrants(parsed.observations, 6, {
			minimumDetections: 1,
			isCountable,
			speciesBase
		});
		const robin = rows.find((row) => row.sciName === 'Turdus migratorius');
		// Robin is March-only, so it has no June presence at all.
		expect(robin).toBeUndefined();

		const goose = rows.find((row) => row.sciName === 'Branta canadensis');
		expect(goose?.monthRate).toBe(1);
		expect(goose?.restRate).toBe(0);
		expect(goose?.spike).toBe(1);
	});

	it('drops species below the minimum checklist count', () => {
		const strict = buildMigrants(parsed.observations, 6, {
			minimumDetections: 5,
			isCountable,
			speciesBase
		});
		expect(strict).toHaveLength(0);
	});
});

describe('effort', () => {
	const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);
	const isCountable = (sciName: string): boolean => isCountableSpecies(sciName, TAXONOMY);
	const effort = summarizeEffort(parsed.observations, isCountable, speciesBase);

	it('counts checklist effort once even when species repeat', () => {
		expect(effort.totals.checklists).toBe(3);
		// 12 + 30 minutes.
		expect(effort.totals.hours).toBeCloseTo(0.7, 5);
		expect(effort.totals.distanceKm).toBeCloseTo(0.187, 5);
		expect(effort.totals.minutesPerChecklist).toBeCloseTo(14, 5);
	});

	it('breaks effort out by month and year', () => {
		const june = effort.months[5];
		expect(june.checklists).toBe(1);
		expect(june.hours).toBeCloseTo(0.2, 5);
		const byYear = Object.fromEntries(effort.years.map((year) => [year.year, year]));
		expect(byYear[2024].checklists).toBe(1);
		expect(byYear[2025].species).toBe(2);
		expect(byYear[2024].lifers).toBe(2);
	});

	it('feeds the year chart the same numbers', () => {
		const years = speciesByYear(effort);
		expect(years.find((year) => year.year === 2025)).toEqual({
			year: 2025,
			species: 2,
			lifers: 1
		});
	});
});

describe('places', () => {
	const parsed = parseEbirdCsv(csvFixture(), TAXONOMY);
	const isCountable = (sciName: string): boolean => isCountableSpecies(sciName, TAXONOMY);

	it('ranks hotspots by species count', () => {
		const hotspots = rankHotspots(parsed.observations, isCountable, speciesBase, 5);
		expect(hotspots[0].name).toBe('Rio Park, Gaithersburg');
		expect(hotspots[0].species).toBe(3);
		expect(hotspots[0].checklists).toBe(2);
	});

	it('groups regions by state code', () => {
		const regions = summarizeRegions(parsed.observations, isCountable, speciesBase);
		expect(regions.map((region) => region.code)).toEqual(['US-MD', 'US-VA']);
		expect(regions[0].species).toBe(3);
	});
});
