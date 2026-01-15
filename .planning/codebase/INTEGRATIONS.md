# External Integrations

**Analysis Date:** 2025-01-15

## APIs & External Services

**Payment Processing:**
- None (static site with no payment functionality)

**Email/SMS:**
- None (no transactional emails or SMS)

**External APIs:**
- Google Fonts - VT323 font loading
  - Integration method: CSS link tag in BaseLayout.astro
  - Auth: None (public resource)
  - Location: `src/src/layouts/BaseLayout.astro`

## Data Storage

**Databases:**
- None (static site with no database)

**File Storage:**
- None (all assets in `src/public/` directory, served statically)

**Caching:**
- None (no caching layer, static assets only)

## Authentication & Identity

**Auth Provider:**
- None (no authentication or user accounts)

**OAuth Integrations:**
- None (no OAuth integrations)

## Monitoring & Observability

**Error Tracking:**
- None (no error tracking service)

**Analytics:**
- None (no analytics or tracking)

**Logs:**
- None (stdout only during build process)

## CI/CD & Deployment

**Hosting:**
- Cloudflare Pages - Static site hosting (configured via wrangler.toml)
  - Deployment: Build output from `src/dist/` directory
  - Environment vars: None required
  - Config: `src/wrangler.toml`

**CI Pipeline:**
- None detected (no GitHub Actions or CI workflows configured)

## Environment Configuration

**Development:**
- Required env vars: None
- Secrets location: N/A (no secrets)
- Mock/stub services: N/A (no external services)

**Staging:**
- Environment-specific differences: Not applicable (single environment)

**Production:**
- Secrets management: Not applicable
- Failover/redundancy: Not applicable (static site)

## Webhooks & Callbacks

**Incoming:**
- None (no webhook endpoints)

**Outgoing:**
- None (no outgoing webhooks)

---

*Integration audit: 2025-01-15*
*Update when adding/removing external services*
