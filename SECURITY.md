# Security and launch notes

Ahoy is an owner-operated application. This review is not a penetration test or a guarantee of security.

## Reporting vulnerabilities

Do not publish access tokens, encryption keys, database credentials or customer comment data in issues. Until a private security contact is configured, report sensitive findings to the installation operator through their existing private business contact. The project owner must publish a dedicated security contact before accepting external production deployments.

## Before exposing the installation

- Set `DEMO_MODE=false` for a private live installation. Set a randomly generated `ADMIN_TOKEN` of at least 32 characters and keep `.env.local` outside Git. Rotating the admin token invalidates its existing sessions.
- Use HTTPS, a durable database, a private database token, and a separate random encryption key. Back up the database **and** retain the encryption key privately; encrypted account tokens cannot be recovered without it.
- Keep Meta and Inngest signature checks enabled. `/api/webhook` receives Meta events; `/api/inngest` receives signed workflow requests. A browser visit to `/api/inngest` is not a health check.
- Keep `LIVE_SENDS_ENABLED=false` until a controlled real-account test succeeds. Test with one campaign and a second Instagram account before enabling more campaigns.
- Rate limiting relies on the hosting platform replacing the forwarded IP header. When self-hosting behind a proxy, configure it to replace client-supplied `X-Forwarded-For`. Do not expose the Node port directly behind an untrusted header.
- The app applies byte limits to JSON/webhook bodies, persistent limits to public forms/demo access, same-origin and Fetch Metadata checks to browser mutations, HttpOnly/SameSite session cookies, parameterized tenant queries, encrypted account tokens, and a restrictive framing/object/base policy. The CSP is defense in depth, not a complete script nonce policy.

## Dependency audit, 2026-11-01

`npm audit --omit=dev` reports **7 findings: 2 high and 5 moderate** in Inngest's dependency tree:

- Inngest 4.26.2 depends on Zod 3.25.76. The advisory GHSA-mrhx-c7xc-m3w5 reports oversized-collection memory exhaustion. Inngest imports `zod/v3`; replacing the package with Zod 4 does not establish that this bundled compatibility implementation is fixed. npm's suggested downgrade to Inngest 0.3.0 is incompatible with this app and was not applied.
- Google metadata instrumentation pulls gaxios → rimraf → glob/minimatch, reported in GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249. Compatible `npm update gaxios gcp-metadata` did not resolve these findings. An incompatible transitive override was not applied.

These are unresolved dependency risks, not confirmed exploits of Ahoy's routes. Request limits reduce one attack surface but do not resolve the advisories. Recheck the audit and supported Inngest releases before public launch; do not use `npm audit fix --force` without migration and integration testing. Existing token/webhook handling and workflow behavior are covered by automated tests, but real Meta delivery and subscription access still require live acceptance tests.

## Preparing for launch after testing

1. Back up the database. Pause test traffic and inspect Inngest for executing jobs. A message already sent or currently being sent cannot be recalled.
2. Open **Settings → Prepare for launch**. Review the counts, refresh if needed, and type `PREPARE` only when ready.
3. This pauses all campaigns, closes queued/rate-limited/pending-follow deliveries, and starts a new reporting period. It refuses to proceed while delivery/follow verification is in progress, and rejects a stale preview.
4. Accounts, tokens, opt-outs and delivery records remain. Activity and analytics show the new period. Previous tracking URLs continue to work; clicks on them do not enter the new reports. This is a reporting reset, **not erasure**.
5. Old worker events cannot send from closed records. Reconciliation and webhook ingestion reject comments dated before launch; comments without valid dates fail closed after launch. New ingestion checks that the launch boundary did not change before saving.
6. Resume only the campaigns intended for launch. Make one fresh comment and verify Activity and Instagram delivery.

This does not delete or cancel external Inngest events/runs. You may cancel pending test runs separately in Inngest; do not replay test events after launch. Waitlist, inquiries and login sessions are not reset. Full workspace deletion remains a separate irreversible action and is not the way to reset analytics.

## Follow-button status

The account setup action subscribes `comments`, `messages`, and `messaging_postbacks`, then reads back **this app's** account subscription. The result and timestamp persist. “Enabled on account” reports the last successful check, not continuous monitoring. Use **Check button status** to refresh. Failure to read Meta becomes “Not verified,” rather than retaining a misleading success badge.

Meta's app-level webhook setting is separate; enable `messaging_postbacks` there too. Ahoy cannot certify that setting through the account subscription read-back. Always test a real button click.

## Performance scope

Database initialization is reused; independent state reads run concurrently. Added indexes support pending deliveries, webhook recovery, campaign status and chronological activity. Campaign delivery counts include rollups rather than just the latest 200 visible records. No production latency/load-test claims are made. Large workspaces will eventually need paginated campaigns, incremental counters and a measured reconciliation budget.
