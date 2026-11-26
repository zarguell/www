/**
 * Minimal zip reader for the single-entry eBird export.
 *
 * eBird's "Download My Data" produces `ebird_<uuid>.zip` holding one
 * `MyEBirdData.csv`, deflate-compressed. Reading it here rather than in the
 * Worker keeps a multi-MB CSV off the free plan's 10 ms CPU budget, and the
 * same code runs unchanged in a browser.
 *
 * Braced deliberately: only stored and deflate entries are supported, and
 * anything else is reported rather than silently mis-decoded.
 */

export interface ZipEntry {
	name: string;
	/** byte offset of the compressed payload in the source buffer */
	start: number;
	compressedSize: number;
	uncompressedSize: number;
	/** 0 = stored, 8 = deflate */
	method: number;
}

const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function findEndOfCentralDirectory(bytes: Uint8Array): number {
	// EOCD is at least 22 bytes and at most 22 + 65535 (comment) from the end.
	const floor = Math.max(0, bytes.length - 22 - 0xffff);
	for (let i = bytes.length - 22; i >= floor; i -= 1) {
		if (
			bytes[i] === 0x50 &&
			bytes[i + 1] === 0x4b &&
			bytes[i + 2] === 0x05 &&
			bytes[i + 3] === 0x06
		) {
			return i;
		}
	}
	return -1;
}

/** Read the central directory and return every entry it describes. */
export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = findEndOfCentralDirectory(bytes);
	if (eocd < 0) throw new Error('Not a zip file.');

	const count = view.getUint16(eocd + 10, true);
	let offset = view.getUint32(eocd + 16, true);
	const entries: ZipEntry[] = [];

	for (let n = 0; n < count; n += 1) {
		if (view.getUint32(offset, true) !== SIG_CENTRAL) {
			throw new Error('Corrupt zip central directory.');
		}
		const method = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const uncompressedSize = view.getUint32(offset + 24, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const name = new TextDecoder('utf-8').decode(
			bytes.subarray(offset + 46, offset + 46 + nameLength)
		);

		if (view.getUint32(localOffset, true) !== SIG_LOCAL) {
			throw new Error('Corrupt zip local header.');
		}
		const localNameLength = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		const start = localOffset + 30 + localNameLength + localExtraLength;

		entries.push({ name, start, compressedSize, uncompressedSize, method });
		offset += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

/** Pick the CSV out of an export, tolerating extra members. */
export function findCsvEntry(entries: ZipEntry[]): ZipEntry {
	const csv = entries.filter(
		(entry) => /^(?:.*\/)?MyEBirdData.*\.csv$/i.test(entry.name) || /\.csv$/i.test(entry.name)
	);
	if (csv.length === 0) {
		throw new Error('No CSV inside the zip. Is this an eBird "Download My Data" file?');
	}
	return csv[0];
}

/**
 * Decompress one entry. Uses the platform `DecompressionStream`, so this works
 * in browsers and Workers with no library and no wasm.
 */
export async function readZipEntryText(
	bytes: Uint8Array,
	entry: ZipEntry
): Promise<string> {
	const payload = bytes.subarray(entry.start, entry.start + entry.compressedSize);

	if (entry.method === 0) {
		return new TextDecoder('utf-8').decode(payload);
	}
	if (entry.method !== 8) {
		throw new Error(`Unsupported zip compression method ${entry.method}.`);
	}
	if (typeof DecompressionStream === 'undefined') {
		throw new Error('This browser cannot unzip files. Try a current Chrome, Firefox, or Safari.');
	}

	// Copy out of the source view: Response() will not take a possibly-shared
	// buffer, and this also keeps the decoder off the caller's bytes.
	const owned = new Uint8Array(payload.byteLength);
	owned.set(payload);
	const body = new Response(owned).body;
	if (!body) throw new Error('Could not read the zip payload.');
	const stream = body.pipeThrough(new DecompressionStream('deflate-raw'));
	const inflated = await new Response(stream).arrayBuffer();
	return new TextDecoder('utf-8').decode(inflated);
}

/** True when the bytes start with a zip local-file signature. */
export function isZip(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
	);
}
