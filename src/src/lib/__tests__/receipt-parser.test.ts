import { describe, it, expect } from 'vitest';
import {
	cleanMerchant,
	extractDate,
	extractItems,
	findAmountByKeywords,
	formatCurrency,
	inferTotal,
	normalizeAmount,
	parseReceipt
} from '../receipt-parser';

// Same fixture as the source tool's "Load sample receipt text" button.
const SAMPLE = [
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

describe('normalizeAmount', () => {
	it('parses plain amounts', () => {
		expect(normalizeAmount('12.93')).toBe(12.93);
		expect(normalizeAmount('3.49')).toBe(3.49);
	});

	it('strips currency symbols and whitespace', () => {
		expect(normalizeAmount('$13.71')).toBe(13.71);
		expect(normalizeAmount(' $ 1,234.56 ')).toBe(1234.56);
	});

	it('treats comma as decimal when followed by exactly two digits', () => {
		expect(normalizeAmount('12,93')).toBe(12.93);
		expect(normalizeAmount('1,234')).toBe(1234);
	});

	it('returns null for junk and empties', () => {
		expect(normalizeAmount(null)).toBeNull();
		expect(normalizeAmount('')).toBeNull();
		expect(normalizeAmount('no numbers here')).toBeNull();
	});
});

describe('formatCurrency', () => {
	it('formats numbers as USD', () => {
		expect(formatCurrency(13.71)).toBe('$13.71');
		expect(formatCurrency(1234.56)).toMatch(/1,234\.56/);
	});

	it('renders an em dash for missing values', () => {
		expect(formatCurrency(null)).toBe('—');
		expect(formatCurrency(Number.NaN)).toBe('—');
	});
});

describe('cleanMerchant', () => {
	it('picks the uppercase header line from the sample', () => {
		const lines = SAMPLE.split('\n');
		expect(cleanMerchant(lines)).toBe('FRESH MART');
	});

	it('ignores boilerplate like THANK YOU', () => {
		expect(cleanMerchant(['THANK YOU', 'HAVE A NICE DAY'])).toBe('HAVE A NICE DAY');
	});

	it('returns null when nothing qualifies', () => {
		expect(cleanMerchant([])).toBeNull();
		expect(cleanMerchant(['thank you for shopping'])).toBeNull();
	});
});

describe('extractDate', () => {
	it('finds numeric dates', () => {
		expect(extractDate(['04/18/2026 10:41 AM'])).toBe('04/18/2026');
		expect(extractDate(['2026-04-18'])).toBe('2026-04-18');
	});

	it('finds month-name dates', () => {
		expect(extractDate(['April 18, 2026'])).toBe('April 18, 2026');
	});

	it('returns null without a date', () => {
		expect(extractDate(['TOTAL 13.71'])).toBeNull();
	});
});

describe('findAmountByKeywords', () => {
	it('takes the last amount on keyword lines, last matching line wins', () => {
		const lines = ['SUBTOTAL 12.93', 'TOTAL 13.71'];
		expect(findAmountByKeywords(lines, ['total'])?.amount).toBe(13.71);
	});

	it('returns null when no line matches', () => {
		expect(findAmountByKeywords(['MILK 3.49'], ['gratuity'])).toBeNull();
	});
});

describe('inferTotal', () => {
	it('prefers a keyword total', () => {
		const lines = SAMPLE.split('\n');
		expect(inferTotal(lines)?.amount).toBe(13.71);
	});

	it('falls back to the largest bottom-of-receipt amount', () => {
		const lines = ['COFFEE 4.50', 'DONUT 2.25'];
		expect(inferTotal(lines)?.amount).toBe(4.5);
	});
});

describe('extractItems', () => {
	it('extracts item lines with amounts from the sample', () => {
		const items = extractItems(SAMPLE.split('\n'));
		expect(items.map((item) => item.description)).toEqual([
			'MILK 2%',
			'BREAD WHEAT',
			'BANANAS',
			'EGGS LARGE'
		]);
		expect(items.map((item) => item.amount)).toEqual([3.49, 2.99, 1.86, 4.59]);
	});

	it('skips totals, tax, and payment lines', () => {
		const items = extractItems(SAMPLE.split('\n'));
		expect(items.some((item) => /subtotal|tax|total|visa/i.test(item.raw))).toBe(false);
	});
});

describe('parseReceipt', () => {
	it('parses the sample receipt end to end', () => {
		const parsed = parseReceipt(SAMPLE);
		expect(parsed.merchant).toBe('FRESH MART');
		expect(parsed.date).toBe('04/18/2026');
		expect(parsed.subtotal).toBe(12.93);
		expect(parsed.tax).toBe(0.78);
		expect(parsed.tip).toBeNull();
		expect(parsed.total).toBe(13.71);
		expect(parsed.items).toHaveLength(4);
		expect(parsed.lineCount).toBe(13);
	});

	it('drops item lines that equal the total (payment dupes)', () => {
		const text = 'CAFE 5.00\nTOTAL 5.00';
		const parsed = parseReceipt(text);
		expect(parsed.total).toBe(5);
		expect(parsed.items).toHaveLength(0);
	});

	it('returns em-dash merchant/date and null amounts for empty text', () => {
		const parsed = parseReceipt('');
		expect(parsed.merchant).toBe('—');
		expect(parsed.date).toBe('—');
		expect(parsed.subtotal).toBeNull();
		expect(parsed.tax).toBeNull();
		expect(parsed.total).toBeNull();
		expect(parsed.items).toEqual([]);
		expect(parsed.lineCount).toBe(0);
	});

	it('normalizes OCR pipe-for-I confusion', () => {
		const parsed = parseReceipt('M|LK 2% 3.49\nTOTAL 9.99');
		expect(parsed.items[0]?.description).toBe('MILK 2%');
	});
});
