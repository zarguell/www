import { describe, it, expect } from 'vitest';
import {
	escapeCell,
	parseDelimited,
	sniffDelimiter,
	stripBom,
	toMarkdownTable,
	trimGrid
} from '../xlsx-to-md';

describe('stripBom', () => {
	it('removes a leading UTF-8 BOM', () => {
		expect(stripBom('\uFEFFa,b')).toBe('a,b');
		expect(stripBom('a,b')).toBe('a,b');
	});
});

describe('sniffDelimiter', () => {
	it('prefers the most frequent candidate outside quotes', () => {
		expect(sniffDelimiter('a;b\nc;d')).toBe(';');
		expect(sniffDelimiter('a,b\nc,d')).toBe(',');
		expect(sniffDelimiter('a\tb\nc\td')).toBe('\t');
		expect(sniffDelimiter('a|b\nc|d')).toBe('|');
	});

	it('ignores delimiters inside quoted fields', () => {
		expect(sniffDelimiter('"a,b";x\n"1,000";2')).toBe(';');
	});

	it('defaults to comma', () => {
		expect(sniffDelimiter('abc')).toBe(',');
	});
});

describe('parseDelimited', () => {
	it('parses plain rows and handles CRLF', () => {
		expect(parseDelimited('a,b\r\nc,d')).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
	});

	it('handles quoted fields with commas, escaped quotes, and newlines', () => {
		const grid = parseDelimited('name,note\n"Smith, John","said ""hi"""\n"line1\nline2",ok');
		expect(grid).toEqual([
			['name', 'note'],
			['Smith, John', 'said "hi"'],
			['line1\nline2', 'ok']
		]);
	});

	it('sniffs semicolons automatically', () => {
		expect(parseDelimited('a;b\n1;2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('keeps ragged rows instead of inventing cells', () => {
		expect(parseDelimited('a,b,c\n1')).toEqual([['a', 'b', 'c'], ['1']]);
	});

	it('does not add a phantom trailing row for well-formed input', () => {
		expect(parseDelimited('a,b\n1,2\n')).toHaveLength(2);
		expect(parseDelimited('a,b\n1,2')).toHaveLength(2);
	});

	it('keeps genuinely empty trailing rows', () => {
		expect(parseDelimited('a,b\n1,2\n\n')).toEqual([
			['a', 'b'],
			['1', '2'],
			['']
		]);
	});

	it('strips a BOM before parsing', () => {
		expect(parseDelimited('\uFEFFa,b\n1,2')[0]).toEqual(['a', 'b']);
	});
});

describe('trimGrid', () => {
	it('drops all-empty rows when asked', () => {
		const grid = [
			['a', 'b'],
			['', ''],
			['c', 'd']
		];
		expect(trimGrid(grid, true, false)).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
	});

	it('drops all-empty columns when asked', () => {
		const grid = [
			['a', '', 'b'],
			['1', '', '2']
		];
		expect(trimGrid(grid, false, true)).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('leaves grids alone by default', () => {
		const grid = [['', '']];
		expect(trimGrid(grid, false, false)).toBe(grid);
	});
});

describe('escapeCell', () => {
	it('escapes pipes and turns newlines into <br>', () => {
		expect(escapeCell('a|b')).toBe('a\\|b');
		expect(escapeCell('a\nb')).toBe('a<br>b');
		expect(escapeCell('a\r\nb')).toBe('a<br>b');
	});
});

describe('toMarkdownTable', () => {
	it('builds a header table from equal-width rows', () => {
		const md = toMarkdownTable(
			[
				['Name', 'Qty'],
				['Apples', '3']
			],
			{ header: true, padColumns: false }
		);
		// Column width follows the longest cell (Apples → 6), floored at 3.
		expect(md).toBe('| Name | Qty |\n| ------ | --- |\n| Apples | 3 |');
	});

	it('pads ragged rows so every line has the same cell count', () => {
		const md = toMarkdownTable([['A', 'B'], ['1']], { header: true, padColumns: false });
		const lines = md.split('\n');
		expect(lines).toHaveLength(3);
		for (const line of lines) {
			expect(line.split('|').length - 2).toBe(2);
		}
		expect(lines[2]).toBe('| 1 |  |');
	});

	it('emits a blank header row when header is false', () => {
		const md = toMarkdownTable([['x']], { header: false, padColumns: false });
		expect(md).toBe('|  |\n| --- |\n| x |');
	});

	it('pads columns for aligned source when padColumns is on', () => {
		const md = toMarkdownTable(
			[
				['Name', 'Q'],
				['Apples', '3']
			],
			{ header: true, padColumns: true }
		);
		expect(md.split('\n')[0]).toBe('| Name   | Q   |');
	});

	it('escapes pipes and newlines in cells', () => {
		const md = toMarkdownTable([['H'], ['a|b\nc']], { header: true, padColumns: false });
		expect(md).toContain('| a\\|b<br>c |');
	});

	it('returns an empty string for an empty grid', () => {
		expect(toMarkdownTable([], { header: true, padColumns: false })).toBe('');
	});
});
