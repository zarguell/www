# Worker security review — `/api/ebird-import`

Scope: `src/worker/index.ts`, `src/wrangler.toml`. This is the repo's first
non-static surface, so every category below was tested against the running
Worker rather than reasoned about.

## Findings

### 1. `Access-Control-Allow-Origin: *` is broader than the product needs — LOW

`worker/index.ts:24` sets `'access-control-allow-origin': '*'` on every response,
including the 200 that carries the zip.

Verified: a request with `Origin: https://evil.example` gets
`access-control-allow-origin: *` and a full 200 body.

Exploit: a page on any other origin can POST a link it already holds and read
the zip. It cannot *obtain* a link from the victim — nothing is sent
automatically, no cookies are involved, and the URL must be supplied in the
body — so this is not a data-theft path. The realistic abuse is bandwidth and
free-tier quota, plus using the endpoint as a general eBird-object proxy.

Fix: the only caller is the same origin, so drop CORS entirely. Same-origin
requests need no `Access-Control-*` header. If a future cross-origin caller
appears, allowlist that one origin instead of `*`.

### 2. No rate limiting — MEDIUM (denial of wallet)

`handleImport` has no per-IP or global throttle. Each call is one subrequest to
S3 and one Worker invocation; the free plan allows 100,000 requests/day and then
returns error 1027 for the *whole account*, which would also stop `/api/*` from
serving.

Verified: no rate-limit binding or middleware exists (`wrangler.toml` has only
`assets`).

Exploit: a loop against `/api/ebird-import` with any valid-shaped URL burns the
day's quota in minutes; the site's API then 502s/1027s until midnight UTC.

Fix: add a Cloudflare Rate Limiting rule (dashboard, no code) on
`/api/ebird-import`, e.g. 20 requests/minute/IP. Static assets stay unmetered
because `run_worker_first` is scoped to `/api/*`, so the site itself keeps
serving — that part of the design is already correct.

### 3. `Content-Length` is forwarded only when upstream sends it — INFO

`worker/index.ts:101` writes `'content-length': upstream.headers.get('content-length') ?? ''`.
When the header is absent this emits an empty `content-length`, which the
runtime tolerated in testing (curl reported the real length) but is malformed.

Fix: build the headers object conditionally, and only set `content-length` when
upstream provided a number.

### 4. Response is always served as `application/zip` with `nosniff` — SAFE

`content-type: application/zip` plus `x-content-type-options: nosniff` means a
caller cannot make the relay echo attacker-controlled HTML that a browser would
execute on this origin, even if the S3 object's own content type differed.
Verified: the response always carries both headers.

### 5. SSRF — SAFE, and deliberately narrow

The validated string is the string handed to `fetch` (`:78`), so there is no
validate-then-reinterpret gap. The regex is anchored `^…$` and pins scheme,
host, port (none allowed), path prefix and filename shape.

Tested and rejected (all `400`): `userinfo` (`https://evil.com@host/…`),
explicit port, subdomain prefix, `http://`, trailing `\n`, `\r`, `\t`, `\0`,
`\n@evil.com/`, query string, fragment, `%2e%2e` encoding, `..` traversal,
sibling bucket name, and backslash userinfo (`host\@evil.com`).

Redirects are handled by `redirect: 'manual'` plus an explicit 3xx rejection
(`:79-82`), so an upstream 302 cannot bounce the fetch to another host.

Note: `redirect: 'error'` is rejected by workerd at runtime — the manual check
is the correct form, and it is also the safer one because it inspects the status
instead of trusting the runtime's error mode.

### 6. Regex ReDoS — SAFE

Every quantifier is bounded or followed by a literal: `[0-9a-f-]{36}` then
`\.zip$`. Measured on 200 KB–500 KB adversarial inputs: worst case 3.4 ms, i.e.
linear. No nested quantifiers.

### 7. Link-validity oracle — ACCEPTABLE, not ours

`404→410` distinguishes "wrong UUID" from "expired". Verified this is identical
to querying S3 directly (S3 returns `403` for both; only the bucket's own
lifecycle makes an expired-but-real object differ). Brute-forcing a v4 UUID is
not feasible, and the Worker adds no information beyond what S3 already leaks.
Not worth obfuscating.

### 8. Request body parsing — SAFE

`await request.json()` on a 5 MB body returns a clean `400`; arrays, and a
`url` of the wrong type, both produce the validation error. No stack traces or
internal detail reach the client. `payload` is narrowed with `in`/`typeof`
before use, so no unchecked property access.

### 9. Byte handling — SAFE

The body is passed through as `upstream.body` (a `ReadableStream`) and never
buffered, so a large export cannot exhaust the 128 MB isolate or the 10 ms CPU
budget. Upstream `content-length` over 96 MB is rejected with `413` and the
upstream body cancelled (`:90-93`).

## Residual risk

CORS `*` (finding 1) and the absence of rate limiting (finding 2) are the only
items worth acting on. Neither exposes user data; both are cheap to close.

- CORS: remove it — the caller is same-origin.
- Rate limit: one dashboard rule on `/api/ebird-import`.

The privacy property that matters is unchanged either way: nothing is stored
server-side, there are no sessions or secrets, and the export link is supplied
explicitly by the person who owns it.
