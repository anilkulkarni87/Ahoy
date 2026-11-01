# Ahoy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fanilkulkarni87%2FAhoy&project-name=ahoy&repository-name=ahoy)

**Someone comments a keyword. Ahoy replies with the link they asked for.**

An MIT-licensed, self-hostable Instagram comment-to-DM app. Start with the demo, then connect your own Instagram account when you’re ready.

> **No Facebook Business account? You can still test the whole demo.** Create campaigns, preview messages, simulate comments and inspect activity without Meta, Instagram, Resend or Inngest credentials. Real Instagram delivery requires the separate setup below.

## Start here

| I want to… | Follow this |
| --- | --- |
| Try it online without installing anything | [Fork → deploy on Vercel → try the demo](docs/vercel-demo.md) |
| Keep my test data between visits | [Add Turso after the demo works](docs/vercel-demo.md#keep-your-test-data-optional) |
| Run it on my computer | [Local demo](#run-it-on-your-computer) |
| Connect a real Instagram account | [Business vs Creator and Meta setup](docs/instagram-setup.md) |
| Configure real hosting, owner access and workflows | [Self-hosting reference](docs/operations.md) |

## Try it on Vercel

Use the button above to create your own copy and deployment, or follow the fork/import steps below. No secret values are embedded in the link.

1. Click **Fork** at the top of this GitHub repository. Keep the fork in your own account.
2. Open [Vercel](https://vercel.com/new), connect GitHub and **Import** your fork.
3. Keep the detected **Next.js** settings. Use **Node.js 22.x**. Leave **Environment Variables empty** for this demo.
4. Click **Deploy**. When it finishes, open your deployment and choose **Take a little look**.
5. Follow the two-minute exercise below.

That’s it for a temporary demo. You do **not** need to copy `.env.example`, create a Meta app, or set up email to try it.

**Demo storage is temporary on Vercel.** Data can reset between requests, cold starts or deployments; it is not a dependable place to save work. Add Turso if you want persistent tests. This deployment does not send Instagram messages, prove background delivery works, or prove Meta approval.

## Your first two-minute test

1. Open **New campaign → Any post**.
2. Add `HELLO` as a keyword and click **Keep going**.
3. Name it **My first campaign**, write a message and save.
4. From **Overview**, open **See a comment become a DM**.
5. Enter `HELLO please`. You should see a simulated reply with your message.
6. Open **Activity**. Find that comment and its **Sent** demo status.
7. Pause your campaign and try again: a paused campaign should not match.

No real Instagram message is sent. On Vercel’s temporary demo, a reset can remove the new campaign; use Turso for repeatable saved tests.

## Run it on your computer

Install [Node.js 22](https://nodejs.org/), download/clone your fork, open a terminal in its folder, then run:

```bash
npm ci
npm run dev
```

Open **http://localhost:3000**. No environment variables are required. Local demo data is saved in `data/ahoy.db` and survives restarts.

## When you’re ready for real Instagram

**Creator and Business profiles are both professional accounts supported by the integration.** A Personal account must switch first. A Facebook Page, an Instagram Business profile, a Meta developer app and Meta business verification are different things; do not assume you need all of them merely to explore the app.

Read [the step-by-step Instagram guide](docs/instagram-setup.md) before setting up credentials. It explains account types, app setup, callbacks, tester invitations and the access token Ahoy obtains through **Connect account**.

For private owner sign-in, set a generated `ADMIN_TOKEN` in your hosting environment and enter it on the sign-in page. Resend email links remain optional. For durable data and background delivery on Vercel, configure Turso and Inngest. Keep live sends off until your controlled live test is ready. Hosted Cloud is unavailable. Optional follow-required campaigns need a controlled live test; see [follow campaigns](docs/follow-campaigns.md).

## What made the first real connection work?

The working installation used **Unified Login**, the matching Meta app credentials and exact configuration ID. Meta issued a token with the required permissions, but `/me/assigned_instagram_accounts` returned an empty list even after the owner selected an account. A direct request for that Instagram profile succeeded.

The decisive workaround was `META_INSTAGRAM_ACCOUNT_ID`: Ahoy uses this optional ID only when discovery is empty, verifies the profile with the new OAuth token and requires webhook subscription before saving. No manually generated access token is stored in an environment variable. See [the connection diagnosis and fallback](docs/instagram-setup.md#if-meta-returns-an-empty-account-list-after-you-selected-your-account).

Connection and delivery are separate checkpoints. Configure Meta’s `/api/webhook` callback, then sync `/api/inngest` and confirm all four functions are registered. A received webhook or an event in Inngest alone does not prove a delivery function ran. Follow [the live-test checklist](docs/instagram-setup.md#8-register-background-functions-and-test-a-real-comment).

Campaign links are sent directly by default. Enable **Track link clicks** to send an Ahoy redirect and count clicks. Already-sent messages and their tracking links remain unchanged.

## Private owner sign-in without Resend

Generate a separate secret on your computer:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the generated value as `ADMIN_TOKEN` in Vercel’s private Environment Variables (or `.env.local`), set your public HTTPS `APP_URL`, and redeploy. On Vercel, connect Turso for durable owner data. Open **Sign in** and enter the token. Do not use a Meta token or put ADMIN_TOKEN in a `NEXT_PUBLIC_` variable. Changing/removing it and redeploying revokes existing admin-token sessions. Optional email sign-in appears only when its Resend settings are complete. See [owner sign-in setup](docs/instagram-setup.md#2-sign-in-with-your-admin-token-no-email-service-needed).

## Checks and project status

```bash
npm test
npm run build
# After configuring real services:
npm run doctor
```

The app has been tested locally, including serverless-storage configuration, matching, opt-outs, encryption, duplicate protection and retry behavior. An owner-controlled Vercel deployment has connected a real Instagram account and delivered a campaign DM after a real comment. This is one successful deployment, not certification of every account, permission or recovery path. The [reference](docs/operations.md#remaining-launch-work) lists launch gaps, including outstanding dependency advisories. Docker files are provided but have not been exercised here.

## Contributing and licence

[MIT](LICENSE). Fork, modify and self-host it. See [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).

Your `.env.local`, tokens, database, build output and deployment metadata are excluded from Git. Never add them manually. The supplied product specification and PDF are design references; they are not evidence of Meta approval or completed production testing.
