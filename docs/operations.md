# Ahoy

A little comment. A real connection.

A self-hostable Instagram comment-to-DM app, built from the supplied v2 product specification and landing-page design. Includes an editorial landing page, private demo workspaces, a three-step campaign builder, a live message preview, searchable activity, opt-outs, tracked links, admin-token or optional email owner sign-in and guided diagnostics.

**Status:** an owner-controlled Vercel deployment connected a real Instagram account and delivered a campaign DM after a real comment. Keep live sending disabled on a new installation until its checks below pass. This result does not validate all accounts, permissions or recovery paths. Hosted Cloud, billing, AI matching and lead capture are not enabled.

## Try it in two commands

Install [Node.js 22 or newer](https://nodejs.org/), open a terminal in this folder, then run:

```bash
npm install
npm run dev
```

Open **http://localhost:3000** and choose **Take a little look**. No API keys, Instagram login, Docker or external database needed for the demo. Local data lives in `data/ahoy.db`; it survives restarts. Each browser gets a separate demo workspace, identified by an HttpOnly cookie.

Try this first:

1. Open **New campaign**.
2. Choose a sample post or **Any post**.
3. Add a keyword such as `HELLO`.
4. Give the campaign a name and write a message. `{username}` inserts the commenter’s username. Optionally add a link and public reply.
5. Save. Open **See a comment become a DM** and try your keyword.
6. Check **Activity** for the outcome. Try `STOP`, then your keyword again to check opt-out behavior.

Demo messages never go to Instagram. Demo links use example.com. Data in the demo is illustrative, and metrics are calculated from its records, not invented performance claims.

## Self-hosting for real use

The software can guide you through configuration, but creating and approving your own Meta app still requires Meta’s developer console. There is no honest way to remove that requirement from a self-hosted installation.

### Option A: Vercel, Turso and Inngest

1. Put this project in **your own GitHub repository**. Use your own fork of the repository.
2. In **your own Vercel account**, choose Add New → Project → import the repository. Framework: Next.js. Use Node.js 22. The app includes the build command and framework configuration.
3. Create a database in **your own Turso account**. Copy its `libsql://` URL and database auth token into the Vercel environment settings. Tables are created automatically. **Do not use a local `file:` database on Vercel**; the filesystem is not durable there.
4. Generate a separate **ADMIN_TOKEN** and add it to Vercel. Resend, OWNER_EMAIL and EMAIL_FROM are optional if you prefer email sign-in.
5. Create an **Inngest** app. Add its event/signing keys to Vercel. Deploy, then sync `https://YOUR-DOMAIN/api/inngest` in Inngest. Confirm all four functions are registered: webhook ingestion, delivery, reconciliation and daily maintenance.
6. Configure the Meta app using the next section.
7. Set APP_URL to the public HTTPS address. Redeploy after changing environment variables.
8. Open **Setup & health**, sign in with your admin token (or optional email link) and connect Instagram. Check the token from Accounts and perform a controlled live test.
9. When all live checks pass, set DEMO_MODE=false if you do not want the public demo. SAAS_ENABLED remains false. Live sending is a separate explicit switch.

See [the Vercel demo quickstart](vercel-demo.md) for a no-credentials test deployment.

### Option B: Your own server with Docker

```bash
cp .env.example .env.local
# Edit .env.local with your settings; never commit it.
docker compose up --build -d
```

The named `ahoy-data` volume persists the local SQLite database. Put an HTTPS reverse proxy in front of port 3000 for real Instagram use. Configure the same external Inngest and email services; Docker runs the web app, not the Inngest service. For demo-only use no settings are needed. Docker files are provided but a Docker image build has not been exercised in this environment.

### Environment variables

Copy `.env.example` to `.env.local` locally. On a hosting provider, use its environment variable settings. Never put secrets in public client environment variables.

| Variable | Purpose |
| --- | --- |
| APP_URL | Your public HTTPS address. For local email testing, use http://localhost:3000 on the same computer. Restart the server after editing .env.local. |
| DEMO_MODE | `true` enables isolated demo workspaces; `false` requires owner sign-in. |
| LIVE_SENDS_ENABLED | `false` by default. Set `true` only for a controlled live test after configuration and policy validation. |
| SAAS_ENABLED | Reserved flag; keep `false`. No hosted billing or platform-app registration route exists. |
| DATABASE_URL | Turso `libsql://` URL on serverless hosting. Defaults to a local SQLite file for local/server use. |
| DATABASE_AUTH_TOKEN | Turso token. Not needed for a local file. |
| ADMIN_TOKEN | Recommended owner sign-in: generated 32–256 URL-safe characters. Rotate and redeploy to revoke token sessions. |
| OWNER_EMAIL | The only email allowed to sign in to the real self-hosted workspace. |
| RESEND_API_KEY | Sends sign-in emails through Resend. |
| EMAIL_FROM | Verified Resend sender such as `Ahoy <hello@yourdomain.com>`. |
| ENCRYPTION_KEY | Exactly 64 hex characters; AES-256-GCM key for Instagram access tokens. |
| META_APP_ID | Unified Login: Meta app ID from App settings → Basic. Instagram Login: product application ID. |
| META_LOGIN_MODE | `unified` for new Meta apps; `instagram` for existing Instagram Login apps. |
| META_CONFIG_ID | Numeric Unified Login configuration ID; required in unified mode. |
| META_INSTAGRAM_ACCOUNT_ID | Optional own-account fallback when Unified discovery is empty; Ahoy still verifies profile access and webhook subscription. |
| META_APP_SECRET | App secret used for OAuth exchanges and webhook signatures. |
| META_VERIFY_TOKEN | A random string you choose; enter the identical value in Meta’s webhook settings. |
| META_API_VERSION | A currently supported Graph API version from your app dashboard. Deliberately not hard-coded to an unverified version. |
| INNGEST_EVENT_KEY | Publishes durable delivery/ingestion events. |
| INNGEST_SIGNING_KEY | Verifies Inngest invocation requests in production. |
| ACCOUNT_HOURLY_LIMIT | Conservative per-account workflow throughput policy, default 200/hour. Validate Meta’s current caps before changing it. |

Generate encryption/verification secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep a secure backup of ENCRYPTION_KEY. Changing it makes existing encrypted tokens unreadable. To rotate it in this version, disconnect accounts, change the key and reconnect. A seamless re-encryption migration has not been implemented.

## Why is Resend here?

Resend optionally delivers one-use email links for owner sign-in. The recommended self-hosted setup uses ADMIN_TOKEN and does not need Resend, a sending domain or OWNER_EMAIL. Configure all three email variables only if you want the email option. It does not send Instagram DMs or create Meta tokens.

Admin-token sign-in creates a seven-day HttpOnly session. The token is checked on the server with a constant-time hash comparison; only session hashes and a credential fingerprint are stored. Changing/removing ADMIN_TOKEN revokes token-based owner sessions. Email sessions remain independent. Database-backed throttling limits attempts to ten per fifteen minutes per client address; expired counters are cleaned by daily maintenance. On a custom reverse proxy, configure trustworthy forwarded client-address headers.

## Meta setup

**Start with the [plain-language Instagram setup guide](instagram-setup.md).** It explains Business versus Creator, how to switch a Personal account, which credentials to copy, tester roles, callback addresses and common errors.

| Choose | When it fits | Eligible professional account? |
| --- | --- | --- |
| **Creator** | You are an individual creator, educator, artist or public figure. | Yes, subject to permissions and eligibility. |
| **Business** | The profile represents a shop, service, brand or organisation. | Yes, subject to the same integration requirements. |
| **Personal** | A personal profile. | No; switch to Creator or Business first. |

Both Business and Creator are **professional accounts**. Keep either if you already have it. Choosing Business is not a shortcut to Meta approval, and a Creator account does not need to become Business just for Ahoy.

**How easy is it?** Choosing the account type is straightforward; configuring the Meta app is the fiddly one-time step. Obtaining the Instagram access token is then automatic through Ahoy’s **Connect account** button. You do not manually paste an Instagram access token into this app. Review requirements and timing depend on Meta; app creation is not approval.

Follow the maintained [Instagram onboarding guide](instagram-setup.md), including the separate Unified Login and existing Instagram Login instructions. New apps use Unified Login: Meta app credentials, `META_CONFIG_ID`, `instagram_*` permissions, a Business Integration System User token, and `graph.facebook.com`. Existing Instagram Login uses product credentials, `instagram_business_*` permissions, a refreshed Instagram token, and `graph.instagram.com`. Ahoy persists the login type per connected account so changing the setup does not reroute existing tokens.

Unified tokens are not sent to Instagram’s refresh endpoint. Their lifetime depends on the Meta configuration. Ahoy displays the expiry returned by Meta; an absent expiry is labelled “Not reported by Meta”, rather than promising permanent access. Reconnect expired or revoked Unified connections. Automated Business Integration System User token rotation is not implemented.

Use **Check connection** and complete a real comment-to-DM test. Unit tests and setup checks do not prove Meta approval, webhook delivery or real messaging permissions.

The requested behavior is one private reply to a requested comment. No cold messaging, scraping or password-based Instagram login exists. Delayed sends may expire under Meta’s messaging rules. Campaigns can optionally require a verified follow. The first private reply offers a Check follow quick reply (with CHECK text as a fallback); profile access and subsequent delivery use that inbound messaging window. A profile URL click does not establish consent; the quick reply arrives as an actual message. See [follow campaigns](follow-campaigns.md) for setup and live acceptance limits.

## How it works

- Next.js App Router serves the UI and Node.js API handlers.
- A single data layer uses libSQL directly: local SQLite for the demo, Turso for serverless storage. The original spec suggested Prisma; this implementation uses the official libSQL driver directly to avoid an unnecessary adapter layer. It uses the Node runtime, not an unverified edge database combination.
- Tenant keys scope campaigns, activity, links, opt-outs, and accounts. The live installation has one owner organisation; multi-tenant account signup is not enabled.
- Meta webhooks verify an HMAC over raw bytes, save a unique event hash, and dispatch an Inngest ingestion event. Matching and sends happen outside the webhook. If dispatch fails, reconciliation retries the persisted outbox.
- Idempotency is stricter than the draft’s per-campaign key: one recorded outcome per tenant/comment, with the first matching active campaign chosen. This prevents overlapping campaigns from generating multiple private replies to one comment.
- Inngest serializes send steps per Instagram account and throttles new runs rather than dropping overflow. Meta rate-limit responses are retryable. A conditional database claim prevents overlapping workers from sending the same record.
- Unknown network outcomes become failed records requiring owner review. They are not automatically resent: exactly-once delivery cannot be promised across a remote API without provider idempotency support. A crash after claiming can leave `sending`; inspect Instagram before recovering it.
- Reconciliation recovers undelivered outbox events and queued deliveries, then sweeps recent comments every 15 minutes. **Current sweep is bounded to 25 latest posts and 100 comments per post. Full pagination/checkpointing is a launch gap for high-volume accounts.**
- Daily maintenance refreshes expiring Instagram Login tokens, summarizes whole UTC days older than 30 days, deletes those records in the same transaction, and clears expired sessions/sign-in tokens. Its tests cover rollup idempotency. The schedule requires an active Inngest connection.
- Campaign links are direct by default; click tracking is an explicit per-campaign option. Existing campaign JSON without `trackClicks` uses direct links for newly generated replies. Previously generated messages and tracking links remain unchanged.
- Optional tracking redirects count clicks while ignoring known bots and prefetch headers. This is a heuristic, not perfect human-click attribution.

## Diagnostics and checks

```bash
npm run doctor
npm test
npm run build
```

Doctor checks configuration, opens the database, validates connected account tokens and (when configured) tests the public webhook challenge. It prints no secret values. Missing production configuration produces exit code 1, which is expected for the default demo.

The UI’s green configuration checks do not certify Meta permissions, public webhook reachability or a deployed Inngest sync. Use doctor and a live test for those.

## Data and privacy

- Detailed activity is retained 30 days when the daily job is active; daily aggregates remain.
- Opt-outs use stable Instagram sender ids when available, scoped by connected account, with a username fallback for the demo. Signed incoming comment and message events recognize opt-out commands. The message webhook subscription and live sender-id behavior still need validation with your Meta app.
- Waitlist and setup requests are stored in their own tables. Setup requests do not send notification emails or charge a customer. The installation operator must monitor them; owner-only export is available under Settings.
- Data deletion callbacks verify Meta’s signed request and erase the requesting connected account’s campaigns, activity, links, opt-outs and aggregate statistics in one transaction. Raw webhook payloads remain subject to scheduled retention; a complete personal-data request still needs operator review and live Meta callback validation. Workspace deletion removes the owner’s workspace records.
- Privacy, terms and review pages are draft operator disclosures. Add the operator’s legal identity and contact address and obtain the appropriate review before a public launch.

## Remaining launch work

This repository is useful and runnable now, but is not a claim that every v1 launch requirement is complete:

- Repeat OAuth and private-reply validation for each installation. The first real account connection and campaign DM have been observed; public replies, token expiry/revocation, reconciliation, retries and deletion still require dedicated live acceptance checks.
- Verify Inngest function registration in the correct environment; test scheduled jobs, recovery and provider quotas beyond the observed comment-to-DM flow.
- Add full pagination/checkpointing for reconciliation; validate incoming-message opt-outs and complete raw-webhook subject-data erasure.
- Finish Meta setup screenshots, a review screencast and the public demo video.
- MIT has been chosen for the code. Finalise contribution terms and the product name.
- Set the setup-service price, operator contact and a reviewed setup agreement before taking payment.
- Complete accessibility and independent security review before public production use.

The code uses the MIT licence. Meta approval is not claimed. The supplied product spec and PDF remain unchanged in this folder.

## Dependency review

The final build uses Next.js 16.4.3 and Inngest 4.26.2. `npm audit` still reports 7 transitive advisories (5 moderate, 2 high), primarily Zod and glob-related dependencies pulled in by the current Inngest SDK. Compatible automatic fixes did not remove them; unsafe cross-major overrides were not applied. Review these before public production deployment. The latest code checks passed the build and 78 app tests. Build and test success do not replace a dependency/security review.
