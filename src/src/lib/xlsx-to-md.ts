/**
 * Spreadsheet → Markdown conversion core.
 *
 * Two responsibilities, both pure:
 * 1. RFC 4180 delimited-text parsing (CSV/TSV) with delimiter sniffing —
 *    quoted fields, escaped quotes, embedded newlines. Binary workbooks
 *    (xlsx/xls/ods) are parsed by SheetJS in the app layer; text formats
 *    route here so the fragile path stays unit-tested.
 * 2. A markdown table builder that cannot produce broken tables: rows are
 *    padded to a uniform width, pipes and newlines in cells are escaped,
 *    and columns are aligned for readable source.
 */

export type Grid = string[][];

export type Delimiter = ',' | ';' | '\t' | '|';

/** Strip a UTF-8 BOM if present. */
export function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Pick the delimiter that appears most often outside of quoted fields.
 * Defaults to comma when nothing conclusive is found.
 */
export function sniffDelimiter(text: string): Delimiter {
	const candidates: Delimiter[] = [',', ';', '\t', '|'];
	const sample = text.slice(0, 4096);
	const counts = new Map<Delimiter, number>();
	let inQuotes = false;
	for (let i = 0; i < sample.length; i++) {
		const ch = sample[i];
		if (ch === '"') {
			if (inQuotes && sample[i + 1] === '"') i++;
			else inQuotes = !inQuotes;
			continue;
		}
		if (inQuotes) continue;
		if ((candidates as string[]).includes(ch)) {
			counts.set(ch as Delimiter, (counts.get(ch as Delimiter) ?? 0) + 1);
		}
	}
	let best: Delimiter = ',';
	let bestCount = 0;
	for (const [d, n] of counts) {
		if (n > bestCount) {
			best = d;
			bestCount = n;
		}
	}
	return best;
}

/** Parse delimited text (RFC 4180: quoting, "" escapes, embedded newlines). */
export function parseDelimited(text: string, delimiter?: Delimiter): Grid {
	text = stripBom(text);
	const d = delimiter ?? sniffDelimiter(text);
	const rows: Grid = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;
	let cellStarted = false;

	const pushCell = () => {
		row.push(cell);
		cell = '';
		cellStarted = false;
	};
	const pushRow = () => {
		pushCell();
		rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cell += ch;
			}
			cellStarted = true;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			cellStarted = true;
			continue;
		}
		if (ch === d) {
			pushCell();
			continue;
		}
		if (ch === '\r') {
			if (text[i + 1] === '\n') i++;
			pushRow();
			continue;
		}
		if (ch === '\n') {
			pushRow();
			continue;
		}
		cell += ch;
		cellStarted = true;
	}
	// Final cell/row — but a text ending exactly at a row break must not add
	// an empty phantom row.
	if (cell !== '' || row.length > 0 || cellStarted) pushRow();
	return rows;
}

/** Drop all-empty rows/columns when asked. Returns the grid unchanged otherwise. */
export function trimGrid(grid: Grid, skipEmptyRows: boolean, skipEmptyCols: boolean): Grid {
	let out = grid;
	if (skipEmptyRows) {
		out = out.filter((row) => row.some((cell) => cell.trim() !== ''));
	}
	if (skipEmptyCols && out.length) {
		const width = Math.max(...out.map((row) => row.length));
		const keep: number[] = [];
		for (let c = 0; c < width; c++) {
			if (out.some((row) => (row[c] ?? '').trim() !== '')) keep.push(c);
		}
		out = out.map((row) => keep.map((c) => row[c] ?? ''));
	}
	return out;
}

/** Make a cell safe for a markdown table: pipes escaped, line breaks visible. */
export function escapeCell(value: string): string {
	return value
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.replace(/\n/g, '<br>')
		.replace(/\|/g, '\\|');
}

export interface MarkdownTableOptions {
	/** Treat the first row as a header (emits a blank header row when false). */
	header: boolean;
	/** Pad cells to column width so the markdown source lines up. */
	padColumns: boolean;
}

/**
 * Build a GFM table from a grid. Rows may be ragged — they are padded to the
 * widest row, so every output line always has the same cell count.
 */
export function toMarkdownTable(grid: Grid, opts: MarkdownTableOptions): string {
	if (!grid.length) return '';
	const width = Math.max(...grid.map((row) => row.length));
	if (width === 0) return '';
	const rows = grid.map((row) => {
		const cells = row.map(escapeCell);
		while (cells.length < width) cells.push('');
		return cells;
	});

	const widths: number[] = [];
	for (let c = 0; c < width; c++) {
		widths[c] = Math.max(...rows.map((row) => row[c].length), 3);
	}

	const fmtRow = (cells: string[]) =>
		'| ' + cells.map((cell, c) => (opts.padColumns ? cell.padEnd(widths[c]) : cell)).join(' | ') + ' |';
	const separator = '|' + widths.map((w) => ' ' + '-'.repeat(w) + ' ').join('|') + '|';

	const lines: string[] = [];
	if (opts.header) {
		lines.push(fmtRow(rows[0]));
		lines.push(separator);
		for (let r = 1; r < rows.length; r++) lines.push(fmtRow(rows[r]));
	} else {
		const blank = widths.map(() => '');
		lines.push(fmtRow(blank));
		lines.push(separator);
		for (const row of rows) lines.push(fmtRow(row));
	}
	return lines.join('\n');
}
