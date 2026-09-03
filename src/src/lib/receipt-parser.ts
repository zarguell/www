/**
 * Receipt parsing heuristics — ported from zarguell/receipt-parser.
 * Pure text-in/structure-out: OCR text goes in, inferred fields come out.
 * No DOM/OCR here — OCR wiring lives in `scripts/receipt-parser-app.ts`.
 */

export interface ParsedItem {
	description: string;
	amount: number;
	raw: string;
}

export interface ParsedReceipt {
	merchant: string;
	date: string;
	subtotal: number | null;
	tax: number | null;
	tip: number | null;
	total: number | null;
	items: ParsedItem[];
	lineCount: number;
}

interface AmountHit {
	line: string;
	index: number;
	amount: number | null;
}

export function normalizeAmount(value: unknown): number | null {
	if (!value) return null;
	const cleaned = String(value)
		.replace(/[^0-9,.-]/g, '')
		.replace(/,(?=\d{2}\b)/g, '.')
		.replace(/,/g, '');
	const match = cleaned.match(/-?\d+(?:\.\d{2})?/);
	return match ? Number(match[0]) : null;
}

export function formatCurrency(value: number | null): string {
	if (typeof value !== 'number' || Number.isNaN(value)) return '—';
	return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

export function cleanMerchant(lines: string[]): string | null {
	const ignore = /receipt|invoice|thank|welcome|www\.|tel\b|phone|store|cashier|server|table|order|date|time/i;
	const candidates = lines
		.map((line) => line.replace(/[^\p{L}\p{N}&'.\-\s]/gu, ' ').replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.filter((line) => line.length >= 3 && line.length <= 42)
		.filter((line) => !ignore.test(line))
		.slice(0, 6);
	if (!candidates.length) return null;
	const ranked = candidates.sort((a, b) => {
		const score = (s: string) => {
			const upperRatio = (s.match(/[A-Z]/g) || []).length / Math.max(s.replace(/\s/g, '').length, 1);
			return upperRatio + (s.includes('&') ? 0.15 : 0) - (s.split(' ').length > 5 ? 0.25 : 0);
		};
		return score(b) - score(a);
	});
	return ranked[0];
}

export function extractDate(lines: string[]): string | null {
	const patterns = [
		/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/,
		/\b(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/,
		/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b/i
	];
	for (const line of lines) {
		for (const pattern of patterns) {
			const match = line.match(pattern);
			if (match) return match[1];
		}
	}
	return null;
}

export function findAmountByKeywords(lines: string[], keywords: string[]): AmountHit | null {
	const regex = new RegExp('(?:' + keywords.join('|') + ')', 'i');
	const candidates: AmountHit[] = [];
	lines.forEach((line, index) => {
		if (!regex.test(line)) return;
		const amounts = line.match(/-?\$?\d+[\d,]*[\.,]\d{2}\b/g) || [];
		const last = amounts[amounts.length - 1];
		if (last) {
			candidates.push({ line, index, amount: normalizeAmount(last) });
		}
	});
	return candidates.length ? candidates[candidates.length - 1] : null;
}

export function inferTotal(lines: string[]): AmountHit | null {
	const direct = findAmountByKeywords(lines, ['grand\\s*total', 'amount\\s*due', '^total\\b', '\\btotal\\b']);
	if (direct?.amount != null) return direct;
	const bottomLines = lines.slice(Math.max(lines.length - 8, 0));
	const candidates = bottomLines
		.flatMap((line, idx) => {
			const amounts = line.match(/-?\$?\d+[\d,]*[\.,]\d{2}\b/g) || [];
			return amounts.map((amount) => ({
				line,
				index: lines.length - bottomLines.length + idx,
				amount: normalizeAmount(amount)
			}));
		})
		.filter((entry) => entry.amount != null);
	return candidates.sort((a, b) => (b.amount || 0) - (a.amount || 0))[0] || null;
}

export function extractItems(lines: string[]): ParsedItem[] {
	const skip =
		/subtotal|total|tax|tip|change|cash|visa|mastercard|debit|credit|balance|amount due|payment|auth|date|time|thank|receipt|invoice/i;
	return lines
		.map((line) => line.trim())
		.filter((line) => line && !skip.test(line))
		.map((line) => {
			const amountMatch = line.match(/(-?\$?\d+[\d,]*[\.,]\d{2})\b(?!.*\d)/);
			if (!amountMatch) return null;
			const amount = normalizeAmount(amountMatch[1]);
			const description = line
				.replace(amountMatch[1], '')
				.replace(/^[\d\sxX*.-]+/, '')
				.replace(/\s{2,}/g, ' ')
				.trim();
			if (!description || description.length < 2) return null;
			return { description, amount, raw: line };
		})
		.filter((item): item is ParsedItem => item !== null && item.amount != null)
		.slice(0, 12);
}

export function parseReceipt(text: string): ParsedReceipt {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/[|]/g, 'I').replace(/\s+/g, ' ').trim())
		.filter(Boolean);

	const subtotal = findAmountByKeywords(lines, ['subtotal', 'sub total']);
	const tax = findAmountByKeywords(lines, ['tax', 'vat', 'gst']);
	const tip = findAmountByKeywords(lines, ['tip', 'gratuity']);
	const total = inferTotal(lines);
	const merchant = cleanMerchant(lines);
	const date = extractDate(lines);
	const items = extractItems(lines).filter(
		(item) => !total || Math.abs(item.amount - (total.amount || 0)) > 0.001
	);

	return {
		merchant: merchant || '—',
		date: date || '—',
		subtotal: subtotal?.amount ?? null,
		tax: tax?.amount ?? null,
		tip: tip?.amount ?? null,
		total: total?.amount ?? null,
		items,
		lineCount: lines.length
	};
}
