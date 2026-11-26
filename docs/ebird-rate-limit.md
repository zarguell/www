# eBird import: rate limit and Worker routing

Operational notes for the two things that live outside this repo's build: the
zone-level rate limit, and the routing that decides which requests reach the
Worker at all.

## Why there is a rate limit

`/api/ebird-import` costs a Worker invocation and an S3 subrequest per call. The
Workers Free plan allows 100,000 requests/day; past that, Cloudflare returns
error 1027 for the account, which would take `/api/ebird-import` down until
00:00 UTC. The endpoint needs no authentication — it accepts any URL matching
one bucket's shape — so without a limit a single client can spend the whole
daily allowance.

## The applied rule

| Setting | Value |
|---|---|
| Phase | `http_ratelimit` |
| Zone | `arguelles.me` |
| Expression | `http.request.uri.path eq "/api/ebird-import"` |
| Characteristics | `cf.colo.id`, `ip.src` |
| Rate | 3 requests per 10 s |
| Mitigation | 10 s |
| Action | `block` (429) |

Ceiling per IP: 3 per 10 s with a 10 s block afterwards works out to roughly
8,600 requests/day, one twelfth of the free quota.

### Why 3 and not 20

The first attempt allowed 20 per 10 s. That is 57,600 requests/day per IP with
mitigation applied, and 172,800 without — either way one client can exhaust the
daily quota alone, so the rule would not protect what it was added for.

A real import is one request. A person retrying an expired link makes two or
three. Three per 10 s is already generous for the actual workload.

## Read the rule

```bash
cf rulesets entrypoint get http_ratelimit --zone arguelles.me
```

## Reapply it

The ruleset ID is stable, but update the entrypoint by phase rather than by ID:

```bash
cf rulesets entrypoint update http_ratelimit --zone arguelles.me --body '{
  "rules": [
    {
      "action": "block",
      "description": "eBird import relay: 3 requests per 10s per IP (max ~8.6k/day)",
      "enabled": true,
      "expression": "http.request.uri.path eq \"/api/ebird-import\"",
      "ratelimit": {
        "characteristics": ["cf.colo.id", "ip.src"],
        "period": 10,
        "requests_per_period": 3,
        "mitigation_timeout": 10
      }
    }
  ]
}'
```

Validate first with `--validate-only`, which runs the same checks and returns
`result: null` instead of persisting.

## Verify it

```bash
U="https://is-ebird-datadownload-projects-prod.s3.amazonaws.com/download_my_data/ebird_<id>.zip"
for i in 1 2 3 4 5; do
  printf "%s " "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    https://www.arguelles.me/api/ebird-import \
    -H 'content-type: application/json' -d "{\"url\":\"$U\"}")"
done
# expect: 200 200 200 429 429
```

Then wait ten seconds and confirm a request succeeds again.

## Free-plan constraints that shaped this

Worth knowing before editing the rule, because several obvious configurations
are rejected outright:

1. **One rate-limiting rule per zone.** The zone already had Cloudflare's
   default "Limit Bots" rule (verified bots, 100 per 10 s). Adding a second rule
   fails with `exceeded the maximum number of rules in the phase
   http_ratelimit: 2 out of 1`. Applying this rule replaced that default.
2. **One rate per ruleset.** You cannot give bots one allowance and the API
   another. Folding both into one expression at 20/10 s was rejected on
   judgement, not by the API: it would have throttled Googlebot to 20 requests
   per 10 s across the whole site, risking SEO for no benefit. The rule is
   therefore scoped to `/api/ebird-import` only, and there is no bot rule now.
   The old default was 100/10 s, effectively unenforced; README traffic never
   depended on it.
3. **Expression fields are path-only.** Free plan allows `Path` and
   `Verified Bot` in the expression — no host, method, query, headers, or body.
4. **`period` must be 10 s and `mitigation_timeout` 10 s.** No other values.
5. **`cf.colo.id` is mandatory** in `characteristics`; omitting it gives
   error `20155`.
6. **Custom 429 responses are paid-plan only.** A `response` block is rejected
   as `unknown field "response"`, so a blocked request gets Cloudflare's
   `error code: 1015` plain-text body. The client must key off the status code.

## Worker routing

`src/wrangler.toml` sets:

```toml
assets = { directory = "./dist", binding = "ASSETS", not_found_handling = "404-page",
           run_worker_first = ["/api/*", "/tools/ebird-analytics/*"] }
```

Two prefixes, both deliberately narrow:

- `/api/*` — the import relay.
- `/tools/ebird-analytics/*` — the share-preview head rewrite. Without this the
  request would be answered as a static asset and the Worker's `HTMLRewriter`
  pass would never run, so chat clients would preview the generic page title.

Everything else stays on the static-asset path, where requests are free and
unmetered. That scoping is why a burst against the API cannot make the site
itself start returning 429s.

Request body limit: the Worker rejects any request body over 1 KB with `413`
before parsing, because a valid body is one URL. Without it, `request.json()`
on a multi-MB body would spend the whole 10 ms CPU budget.

## If the limit needs changing

Two directions, with different tradeoffs:

- **Looser** (more requests per 10 s): only after a real client is being
  throttled. Watch for 429s from a single source in analytics first.
- **Tighter**: 2 per 10 s still allows a retry pair, and drops the ceiling to
  about 5,800/day. Going to 1 would break the "expired link, try again" case,
  which is the one retry that actually happens.

The rule is zone state, not repo state, so it is not covered by CI. If it needs
to be reproducible, move the JSON above into a Terraform `cloudflare_ruleset`
resource or a deploy step; the CLI form is the only thing in use today.
