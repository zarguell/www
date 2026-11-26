/**
 * Two jobs:
 *
 * 1. `/api/ebird-import` — validate and forward an eBird export link for the
 *    browser to parse.
 * 2. Shared-list pages — rewrite the head of `/tools/ebird-analytics/?s=…` so a
 *    chat client's link preview names the list and its size. Crawlers do not run
 *    JavaScript, so the numbers have to be in the HTML they receive.
 *
 * The second job does inflate a token, which is the one place this Worker parses
 * anything. It is bounded: a share token is a few hundred bytes, anything longer
 * than `MAX_SHARE_TOKEN` is left to the browser, and a failure falls through to
 * the untouched page.
 *
 * The relay exists because the bucket that holds "Download My Data" archives
 * sends no CORS headers, so a page cannot fetch it directly. It checks the URL
 * against the one host it accepts, fetches, and returns the bytes without ever
 * reading them. Parsing happens client-side, which keeps a large export off the
 * free plan's 10 ms CPU budget.
 */

const MAX_SHARE_TOKEN = 4000;

/**
 * The subset of the Workers `HTMLRewriter` we use.
 *
 * Declared structurally instead of pulling in `@cloudflare/workers-types`: the
 * repo has no type-only dependencies, the surface here is two methods, and a
 * narrow local type keeps `tsc` honest about what we actually call.
 */
interface RewritableElement {
	setInnerContent(content: string): void;
	setAttribute(name: string, value: string): void;
}

interface Rewriter {
	on(selector: string, handlers: { element(element: RewritableElement): void }): Rewriter;
	transform(response: Response): Response;
}

interface RewriterGlobal {
	HTMLRewriter: new () => Rewriter;
}

function newRewriter(): Rewriter {
	const scope = globalThis as unknown as Partial<RewriterGlobal>;
	if (!scope.HTMLRewriter) throw new Error('HTMLRewriter is unavailable in this runtime.');
	return new scope.HTMLRewriter();
}

export interface Env {
	/** Static-asset binding declared in wrangler.toml. */
	ASSETS: { fetch(request: Request): Promise<Response> };
}

/** Shape of a link from eBird's export email. The UUID is the only secret. */
const EXPORT_LINK =
	/^https:\/\/is-ebird-datadownload-projects-prod\.s3\.amazonaws\.com\/download_my_data\/ebird_[0-9a-f-]{36}\.zip$/;

/** A year of daily checklists is a few MB; anything far past that is not ours. */
const MAX_BYTES = 96 * 1024 * 1024;

/** A request carrying one URL. Anything near a kilobyte is not a real caller. */
const MAX_BODY_BYTES = 1024;

const json = (body: unknown, status: number): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/api/ebird-import') {
			return handleImport(request);
		}

		if (
			request.method === 'GET' &&
			url.pathname.replace(/\/+$/, '') === '/tools/ebird-analytics'
		) {
			const token = url.searchParams.get('s');
			if (token && token.length <= MAX_SHARE_TOKEN) {
				return withSharePreview(request, env, url, token, 's');
			}
			const compare = url.searchParams.get('c');
			if (compare && compare.length <= MAX_SHARE_TOKEN) {
				return withSharePreview(request, env, url, compare, 'c');
			}
		}

		// Everything else is the static site.
		return env.ASSETS.fetch(request);
	}
};

async function handleImport(request: Request): Promise<Response> {
	// Same-origin only: the page that calls this is served from this Worker, and
	// a same-origin POST needs no CORS headers. Sending `*` would let any site
	// relay eBird objects through this endpoint on the owner's quota.
	if (request.method !== 'POST') {
		return json({ error: 'POST only' }, 405);
	}

	// A valid body is one ~150-character URL. Refuse anything far past that
	// before parsing: JSON.parse of a multi-MB body alone would blow the 10 ms
	// CPU budget this whole function exists to stay inside.
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
		return json({ error: 'Request body too large.' }, 413);
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Expected a JSON body with a url field.' }, 400);
	}

	const target =
		payload && typeof payload === 'object' && 'url' in payload ? payload.url : undefined;

	if (typeof target !== 'string' || !EXPORT_LINK.test(target)) {
		return json(
			{
				error:
					'That is not an eBird export link. It should look like https://is-ebird-datadownload-projects-prod.s3.amazonaws.com/download_my_data/ebird_<id>.zip'
			},
			400
		);
	}

	// Workers rejects `redirect: 'error'`, so inspect a manual 3xx instead. The
	// bucket answers direct object GETs with 200 and sends none of its own.
	const upstream = await fetch(target, { redirect: 'manual' });
	if (upstream.status >= 300 && upstream.status < 400) {
		await upstream.body?.cancel();
		return json({ error: 'That link redirects somewhere unexpected; request a fresh export.' }, 400);
	}
	if (!upstream.ok) {
		// S3 denies everything else here, including objects past the ~8 day
		// lifecycle expiry, so a non-200 means "ask eBird for a fresh export".
		return json({ error: 'That link has expired or is not valid. Request a fresh export from eBird.' }, 410);
	}

	const upstreamLength = Number(upstream.headers.get('content-length'));
	if (Number.isFinite(upstreamLength) && upstreamLength > MAX_BYTES) {
		await upstream.body?.cancel();
		return json({ error: 'That export is too large to import in the browser.' }, 413);
	}

	// Hand the body through untouched. Buffering it here is what would blow the
	// CPU and memory budget on a large export.
	const headers: Record<string, string> = {
		'content-type': 'application/zip',
		'cache-control': 'no-store',
		'x-content-type-options': 'nosniff'
	};
	const length = upstream.headers.get('content-length');
	// Only claim a length upstream actually sent: an empty Content-Length is
	// malformed, and the stream's length is the only one we can vouch for.
	if (length) headers['content-length'] = length;

	return new Response(upstream.body, { status: 200, headers });
}

/* ---------- shared-list link previews ---------- */

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function inflateToken(token: string): Promise<Uint8Array | null> {
	try {
		if (!token.startsWith('1')) return null;
		const body = token.slice(1);
		if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
		const binary = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

		const stream = new Response(await new Response(bytes).arrayBuffer()).body;
		if (!stream) return null;
		const inflated = await new Response(
			stream.pipeThrough(new DecompressionStream('deflate-raw'))
		).arrayBuffer();
		// A share body is a few hundred bytes; refuse anything wild.
		if (inflated.byteLength > 65_536) return null;
		return new Uint8Array(inflated);
	} catch {
		return null;
	}
}

function readVarint(bytes: Uint8Array, at: { i: number }): number | null {
	let value = 0;
	let scale = 1;
	for (let step = 0; step < 5; step += 1) {
		if (at.i >= bytes.length) return null;
		const byte = bytes[at.i++];
		value += (byte & 127) * scale;
		if (byte < 128) return value;
		scale *= 128;
	}
	return null;
}

/** Just enough of the format to name a link: the list name and species count. */
function summarise(body: Uint8Array, kind: 's' | 'c'): { name?: string; count: number } | null {
	const at = { i: 0 };
	const flags = body[at.i++];
	const decoder = new TextDecoder('utf-8');

	const readName = (): string | undefined => {
		const length = readVarint(body, at);
		if (length === null || length > 160 || at.i + length > body.length) return undefined;
		const name = decoder.decode(body.subarray(at.i, at.i + length)).trim();
		at.i += length;
		return name || undefined;
	};

	if (kind === 's') {
		const name = flags & 1 ? readName() : undefined;
		const count = readVarint(body, at);
		return count === null ? null : { name, count };
	}

	// Comparison: flag, list count, then each list's name byte and count.
	if (!(flags & 4)) return null;
	const lists = readVarint(body, at);
	if (lists === null || lists === 0) return null;
	let total = 0;
	let name: string | undefined;
	for (let n = 0; n < lists; n += 1) {
		if (at.i >= body.length) return null;
		const listFlags = body[at.i++];
		if (listFlags & 1) {
			const listName = readName();
			if (n === 0) name = listName;
		}
		const count = readVarint(body, at);
		if (count === null) return null;
		total += count;
		for (let b = 0; b < count; b += 1) {
			if (readVarint(body, at) === null) return null;
		}
	}
	return { name, count: total };
}

async function withSharePreview(
	request: Request,
	env: Env,
	url: URL,
	token: string,
	kind: 's' | 'c'
): Promise<Response> {
	const asset = await env.ASSETS.fetch(new Request(url.toString(), request));

	// Only rewrite a successful HTML response; anything else passes through.
	if (!asset.ok) return asset;
	const type = asset.headers.get('content-type') ?? '';
	if (!type.includes('text/html')) return asset;

	const body = await inflateToken(token);
	const summary = body ? summarise(body, kind) : null;
	if (!summary) return asset;

	const who = summary.name ? `${summary.name}'s` : 'A';
	const speciesWord = summary.count === 1 ? 'species' : 'species';
	const title =
		kind === 'c'
			? `Compare bird lists — ${summary.count} ${speciesWord}`
			: `${who} bird list · ${summary.count} ${speciesWord}`;
	const description =
		kind === 'c'
			? `Two eBird life lists set side by side: ${summary.count} species across both.`
			: `${summary.count} species, read from ${summary.name ? summary.name + "'s" : 'an'} eBird export. ` +
				'Stickers sized by body mass, with families, hotspots and effort.';

	const rewritten = newRewriter()
		.on('title', {
			element(element) {
				element.setInnerContent(title);
			}
		})
		.on('meta[property="og:title"]', {
			element(element) {
				element.setAttribute('content', title);
			}
		})
		.on('meta[name="twitter:title"]', {
			element(element) {
				element.setAttribute('content', title);
			}
		})
		.on('meta[property="og:description"]', {
			element(element) {
				element.setAttribute('content', description);
			}
		})
		.on('meta[name="description"]', {
			element(element) {
				element.setAttribute('content', escapeHtml(description));
			}
		})
		.on('meta[name="twitter:description"]', {
			element(element) {
				element.setAttribute('content', description);
			}
		})
		.on('link[rel="canonical"]', {
			element(element) {
				element.setAttribute('href', url.toString());
			}
		})
		.transform(asset);

	const headers = new Headers(rewritten.headers);
	headers.set('cache-control', 'public, max-age=300');
	return new Response(rewritten.body, { status: rewritten.status, headers });
}
