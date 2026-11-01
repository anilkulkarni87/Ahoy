# Ahoy

A little comment. A real connection.

A self-hostable Instagram comment-to-DM app, built from the supplied v2 product specification and landing-page design. Includes an editorial landing page, private demo workspaces, a three-step campaign builder, a live message preview, searchable activity, opt-outs, tracked links, email owner sign-in and guided diagnostics.

**Status:** working local demo and integration implementation. This has not yet been validated against a real Meta account or deployed services. Keep live sending disabled until the checks below pass. Hosted Cloud, follow confirmation, billing, AI matching and lead capture are not enabled.

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
4. Configure **Resend** with a verified sending domain. Add the email settings below and set OWNER_EMAIL to your own address.
5. Create an **Inngest** app. Add its event/signing keys to Vercel. Deploy, then sync `https://YOUR-DOMAIN/api/inngest` in Inngest. Confirm all four functions are registered: webhook ingestion, delivery, reconciliation and daily maintenance.
6. Configure the Meta app using the next section.
7. Set APP_URL to the public HTTPS address. Redeploy after changing environment variables.
8. Open **Setup & health**, sign in from your inbox and connect Instagram. Check the token from Accounts and perform a controlled live test.
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
| OWNER_EMAIL | The only email allowed to sign in to the real self-hosted workspace. |
| RESEND_API_KEY | Sends sign-in emails through Resend. |
| EMAIL_FROM | Verified Resend sender such as `Ahoy <hello@yourdomain.com>`. |
| ENCRYPTION_KEY | Exactly 64 hex characters; AES-256-GCM key for Instagram access tokens. |
| META_APP_ID | Instagram application ID for your Instagram Login configuration. |
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

Resend delivers **the email link you use to sign in to Ahoy**. It does not send Instagram DMs, create Meta tokens or connect the Instagram account. Those use Meta’s API. The demo needs no email provider.

The product spec asks for email magic-link sign-in. This implementation currently uses Resend specifically, so real owner sign-in needs its API key and a verified sending domain. SMTP, password and passkey alternatives are not implemented. Resend is an implementation choice, not an Instagram requirement.

For a nontechnical single-owner product, this is additional setup friction; an alternative owner sign-in method would be a separate product change. Do not remove authentication from a public deployment to skip it.

## Meta setup

**Start with the [plain-language Instagram setup guide](instagram-setup.md).** It explains Business versus Creator, how to switch a Personal account, which credentials to copy, tester roles, callback addresses and common errors.

| Choose | When it fits | Works with Ahoy’s Instagram Login integration? |
| --- | --- | --- |
| **Creator** | You are an individual creator, educator, artist or public figure. | Yes, subject to permissions and eligibility. |
| **Business** | The profile represents a shop, service, brand or organisation. | Yes, subject to the same integration requirements. |
| **Personal** | A personal profile. | No; switch to Creator or Business first. |

Both Business and Creator are **professional accounts**. Keep either if you already have it. Choosing Business is not a shortcut to Meta approval, and a Creator account does not need to become Business just for Ahoy.

**How easy is it?** Choosing the account type is straightforward; configuring the Meta app is the fiddly one-time step. Obtaining the Instagram access token is then automatic through Ahoy’s **Connect account** button. You do not manually paste an Instagram access token into this app. Review requirements and timing depend on Meta; app creation is not approval.

Use [Meta’s official Instagram Login documentation](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/) and [private reply documentation](https://developers.facebook.com/docs/instagram-platform/private-replies/) as the current authority. The Meta-owned Postman collection confirms support for Business and Creator accounts with Instagram Login; developer/help pages were rate-limited or login-gated. Exact current screens and permission behavior must still be confirmed live.

1. Convert the Instagram account to Business or Creator if needed.
2. Create your own Meta developer app and configure the Instagram product with Instagram Login.
3. Register the redirect: `https://YOUR-DOMAIN/api/instagram/callback`.
4. Register the webhook: `https://YOUR-DOMAIN/api/webhook`, using your META_VERIFY_TOKEN.
5. Configure comment webhook subscriptions and review the requested `instagram_business_basic`, `instagram_business_manage_comments`, and `instagram_business_manage_messages` scopes. Reduce or change them if Meta’s current use case rules require it.
6. Add eligible app roles/testers and accept their invitations for development-mode testing. Do not assume any public Instagram account can test an unreviewed app.
7. Sign in as the owner in Ahoy, open Instagram accounts and choose Connect account. OAuth exchanges a code for a long-lived token, encrypts it, and subscribes the account to comment events.
8. Use Check connection to confirm a token still works. This does **not** prove messaging permissions or Meta approval.

The requested behavior is one private reply to a requested comment. No cold messaging, scraping or password-based Instagram login exists. Delayed sends may expire under Meta’s messaging rules. Follow confirmation is intentionally rejected by the API and has no enabling UI; a tap is not assumed to establish a valid messaging window.

## How it works

- Next.js App Router serves the UI and Node.js API handlers.
- A single data layer uses libSQL directly: local SQLite for the demo, Turso for serverless storage. The original spec suggested Prisma; this implementation uses the official libSQL driver directly to avoid an unnecessary adapter layer. It uses the Node runtime, not an unverified edge database combination.
- Tenant keys scope campaigns, activity, links, opt-outs, and accounts. The live installation has one owner organisation; multi-tenant account signup is not enabled.
- Meta webhooks verify an HMAC over raw bytes, save a unique event hash, and dispatch an Inngest ingestion event. Matching and sends happen outside the webhook. If dispatch fails, reconciliation retries the persisted outbox.
- Idempotency is stricter than the draft’s per-campaign key: one recorded outcome per tenant/comment, with the first matching active campaign chosen. This prevents overlapping campaigns from generating multiple private replies to one comment.
- Inngest serializes send steps per Instagram account and throttles new runs rather than dropping overflow. Meta rate-limit responses are retryable. A conditional database claim prevents overlapping workers from sending the same record.
- Unknown network outcomes become failed records requiring owner review. They are not automatically resent: exactly-once delivery cannot be promised across a remote API without provider idempotency support. A crash after claiming can leave `sending`; inspect Instagram before recovering it.
- Reconciliation recovers undelivered outbox events and queued deliveries, then sweeps recent comments every 15 minutes. **Current sweep is bounded to 25 latest posts and 100 comments per post. Full pagination/checkpointing is a launch gap for high-volume accounts.**
- Daily maintenance refreshes expiring tokens, summarizes whole UTC days older than 30 days, deletes those records in the same transaction, and clears expired sessions/sign-in tokens. Its tests cover rollup idempotency. The schedule requires an active Inngest connection.
- Redirects count clicks while ignoring known bots and prefetch headers. This is a heuristic, not perfect human-click attribution.

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

- Validate OAuth, scopes, account roles, real private replies, public replies, token refresh, reconciliation, retries and deletion against your actual Meta app.
- Validate hosted Turso and Inngest configuration, scheduling and quotas.
- Add full pagination/checkpointing for reconciliation; validate incoming-message opt-outs and complete raw-webhook subject-data erasure.
- Finish Meta setup screenshots, a review screencast and the public demo video.
- MIT has been chosen for the code. Finalise contribution terms and the product name.
- Set the setup-service price, operator contact and a reviewed setup agreement before taking payment.
- Complete accessibility and independent security review before public production use.

The code uses the MIT licence. Meta approval is not claimed. The supplied product spec and PDF remain unchanged in this folder.

## Dependency review

The final build uses Next.js 16.4.3 and Inngest 4.26.2. `npm audit` still reports 7 transitive advisories (5 moderate, 2 high), primarily Zod and glob-related dependencies pulled in by the current Inngest SDK. Compatible automatic fixes did not remove them; unsafe cross-major overrides were not applied. Review these before public production deployment. The build and all 25 app tests pass, but neither is a substitute for a dependency/security review.
