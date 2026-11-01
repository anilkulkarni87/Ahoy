# Try your own Ahoy demo on Vercel

**Goal:** open your own copy of Ahoy, make a campaign and simulate a comment.

**You need:** a GitHub account and a Vercel account. You do not need a Facebook Business account, Instagram account, Meta app, domain, database, email provider or workflow account for this temporary demo.

## 1. Make your own copy

Start at [anilkulkarni87/Ahoy](https://github.com/anilkulkarni87/Ahoy). The README’s Deploy with Vercel button can create a copy and deployment for you. If you prefer to fork first, follow these steps.

On the project’s GitHub page, click **Fork → Create fork**. Choose your own account as the owner. Wait for GitHub to open your copy.

**Checkpoint:** the repository heading starts with your GitHub username. A local Git repository needs to be published to GitHub before other people can fork it.

## 2. Import it into Vercel

1. Open [Vercel’s New Project page](https://vercel.com/new).
2. Sign in or create your own account. Connect GitHub if prompted.
3. Find your fork and choose **Import**. If it is missing, use Vercel’s GitHub access settings to grant access to that repository.
4. Keep **Framework Preset: Next.js** and **Root Directory: `./`**.
5. Use **Node.js 22.x** if Vercel asks for the Node version. The package scripts supply the build command.
6. Leave **Environment Variables empty**. Do not upload `.env.local` from someone else’s installation.
7. Click **Deploy** and wait for the build result.

**Checkpoint:** Vercel reports a successful deployment and shows its generated address. Exact dashboard labels can change. A successful build does not validate Meta or real DM delivery.

## 3. Take a little look

Open the deployment address. If Vercel shows its own deployment-protection login, sign in with the Vercel account that owns this project first. Then choose **Take a little look** in Ahoy. Do not use Ahoy’s **Sign in** button yet; owner sign-in needs a separately configured ADMIN_TOKEN or optional Resend email setup.

**Checkpoint:** you see the sample workspace, sample campaigns and a demo banner. The banner explains that temporary demo data may reset.

## 4. Try a comment

1. Choose **New campaign**.
2. Choose **Any post**, then **Keep going**.
3. Add `HELLO`, then **Keep going**.
4. Name the campaign **My first campaign**. Keep or change the message, then save it.
5. In **Overview**, choose **See a comment become a DM**.
6. Enter `HELLO please` and run the simulation.
7. Open **Activity** and find the result. Pause the campaign to stop it matching future comments.

**Checkpoint:** the simulation uses your campaign message and replaces `{username}` with the demo person’s name. **Sent** means simulated in this workspace; it does not mean Instagram delivered anything.

## Keep your test data (optional)

The no-configuration Vercel demo uses a SQLite file in the function’s temporary `/tmp` directory. This is an intentional sandbox. Different function instances can have different data, and Vercel can discard it at any time. Even refreshing is not a persistence guarantee.

For reliable saved campaigns:

1. Create a database in your own [Turso account](https://turso.tech/).
2. In the Turso dashboard, copy the database’s **`libsql://` URL** and create a database authentication token.
3. In Vercel, open your project → **Settings → Environment Variables**.
4. Add `DATABASE_URL` with that URL and `DATABASE_AUTH_TOKEN` with the token. Select the environments in which you want to use them.
5. Redeploy. Now all function instances use the same database. Ahoy creates its tables automatically.
6. Create a campaign, refresh the page and confirm it remains in the same browser.

Keep the token private. You still need no Meta, Resend or Inngest settings for a persistent demo. Removing the browser’s Ahoy session cookie opens a new isolated demo workspace; it does not recover the old one.

## What comes later?

| You want… | Add… |
| --- | --- |
| Saved demo campaigns | Turso database URL and token |
| A private owner dashboard | A generated ADMIN_TOKEN; Resend email links are optional |
| A real Instagram connection | An eligible Creator/Business profile and your Meta app’s Unified Login setup (or existing Instagram Login) |
| Background delivery, retries and maintenance | Inngest, synced with your deployment |
| Real message sending | Complete the controlled live test, then explicitly enable live sends |

Follow the [Instagram setup guide](instagram-setup.md) and [hosting reference](operations.md) only when you reach that stage. Do not set `DEMO_MODE=false` or `LIVE_SENDS_ENABLED=true` without durable storage; the app intentionally rejects that configuration on Vercel.

## If something goes wrong

| Symptom | First thing to check |
| --- | --- |
| Vercel cannot find the fork | Grant Vercel access to the correct GitHub repository. |
| Build fails | Read the first error in Vercel’s build log. Confirm Next.js, root `./`, Node 22 and the tracked lockfile. |
| App asks for Instagram credentials | Return to **Take a little look**. Connecting an account is optional for the demo. |
| Ahoy sign-in says email is not configured | Use **Take a little look**. For owner access, configure ADMIN_TOKEN; Resend email links are optional. |
| Campaign vanished or the sample data returned | This can happen in the temporary demo. Add Turso for saved data. |
| Error says to connect Turso | Remove accidental real-mode settings for the demo, or configure a real `libsql://` database and redeploy. |
| An old deployment ignores a new variable | Redeploy after updating Vercel’s environment settings. |

Use the issue templates to report problems. Include the screen and error, but never tokens, `.env.local`, database contents or customer messages.

Sources: [Vercel’s Git import flow](https://vercel.com/docs/git), [environment variables](https://vercel.com/docs/environment-variables), and [Next.js deployment support](https://nextjs.org/docs/app/getting-started/deploying). An owner-controlled Vercel deployment has subsequently connected Instagram and delivered a real campaign DM. That required the separate real-service setup; the no-credentials demo only simulates delivery.
