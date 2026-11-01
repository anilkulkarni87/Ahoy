# Connect Instagram without guessing which account or token to use

This guide covers **your own self-hosted Ahoy installation**. You can use the demo without completing any of these steps.

The setup has two separate parts:

1. **One-time setup:** choose an eligible Instagram account, configure a Meta developer app and add its credentials to Ahoy.
2. **Connect account:** click the button in Ahoy and approve Instagram’s login screen. Ahoy obtains and stores the Instagram access token for you.

You should not have to paste an Instagram access token into an Ahoy form, generate a token every day, or share your Instagram password with the person helping you.

**Working deployment, November 1, 2026:** an owner connected their professional account and received a real campaign DM. The connection needed Unified Login plus the [optional account-ID fallback](#if-meta-returns-an-empty-account-list-after-you-selected-your-account), because Meta returned an empty assigned-account list despite allowing direct profile access. Webhook delivery and Inngest function registration were separate checkpoints. This result does not establish approval for unrelated customer accounts or validate every recovery path.

## 1. Business, Creator or Personal?

“Professional account” is Instagram’s umbrella term for **Business** and **Creator**. It does not mean you need a paid verification badge. A Meta developer app and Meta business verification are separate things again.

| Account type | A practical choice for | Ahoy eligibility |
| --- | --- | --- |
| **Creator** | A person whose audience follows their work: an artist, writer, educator, influencer or independent content creator. | Supported professional account category. |
| **Business** | A shop, service, brand, agency or organisation whose audience follows the business. | Supported account category for the same API. |
| **Personal** | An ordinary personal Instagram profile. | Not supported by this integration. Switch to a professional account first. |

**Choose based on who you are, not to unlock Ahoy.** If you already have a Creator account, do not switch it to Business just for this app. If you already have Business, keep it. Both categories can use this integration subject to Meta permissions and account eligibility; this does not mean all Instagram features are identical between them.

For example: a recipe educator can choose **Creator**; a bakery taking customer orders can choose **Business**. These are practical suggestions, not extra API requirements.

### Check or change your account type

In the Instagram mobile app:

1. Open the profile you want Ahoy to use. Check the username if you have multiple accounts.
2. Tap the **☰ menu** and open the account settings. Look for **Account type and tools** under the professional-account options.
3. If you see **Switch to professional account**, the account is currently personal. Choose that option, choose a suitable category, then choose **Creator** or **Business** using the table above.
4. If you already see **Creator tools and controls** or **Business tools and controls**, inspect the account-type settings there. You may already be ready; do not switch unnecessarily.
5. Read Instagram’s confirmation screens, especially changes to profile visibility and public contact information. Professional profiles are public, so this is a meaningful privacy choice. If you need to keep this profile private, use a separate eligible account instead.

**You are done when:** Instagram identifies the selected profile as Creator or Business. A public profile alone does not prove it is professional.

Menu wording and placement can vary by Instagram version and account. Treat the steps above as navigation guidance and follow the labels shown in your app. Meta’s help pages were login-gated/rate-limited during the documentation check; these exact screens have not been verified on a current mobile account.

## 2. Sign in with your admin token (no email service needed)

Ahoy sign-in protects your owner dashboard. **Connect Instagram** is a separate Meta authorization step. Your ADMIN_TOKEN is not a Meta app secret, Instagram access token, database token or webhook verify token.

1. Generate a separate private admin secret on your computer:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Copy the generated value into **Vercel → Project → Settings → Environment Variables → ADMIN_TOKEN**. For local use, put it in `.env.local`. Paste only the value, without quotes. Keep a safe private copy.
3. Set APP_URL to your public HTTPS site address. For local use, `http://localhost:3000` is allowed. On Vercel, configure Turso for durable owner data and sessions; set `DEMO_MODE=false` if you want only the private owner workspace.
4. Redeploy on Vercel, or restart locally. Open **Sign in**, enter your admin token and select **Sign in**. No OWNER_EMAIL, RESEND_API_KEY or EMAIL_FROM is needed.
5. You should see your private owner dashboard rather than the sample demo workspace. The browser receives a seven-day HttpOnly session cookie. Ahoy stores a hash of the session, not the raw admin token. Sign out to remove that session.

Use a generated secret of 32–256 letters, digits, underscores or hyphens. The command above generates 64 hexadecimal characters. Never put it in a public repository, URL or a `NEXT_PUBLIC_` variable. If lost or exposed, replace ADMIN_TOKEN in your hosting settings and redeploy: previous token sessions stop granting owner access. Attempts are limited to ten per fifteen minutes per client address using the database.

### Optional: keep email sign-in available

Resend remains supported for owners who prefer a single-use email link. It is **optional** and does not send Instagram DMs or create Meta tokens.

1. Create your own Resend account and verify a sending domain.
2. Set OWNER_EMAIL to your inbox, RESEND_API_KEY to a sending key and EMAIL_FROM to your verified sender.
3. Save and redeploy. If both methods are configured, select **Use email sign-in instead** on the sign-in page. Email links expire after fifteen minutes and work once.

For local email testing, use the loopback APP_URL and open the email on the computer running Ahoy. Resend’s test sender `onboarding@resend.dev` can send only to the address associated with your Resend account. Other email providers and passkeys are not implemented.

**You are done when:** the admin token or optional email link opens the private owner workspace. Exploring the demo does not prove owner sign-in works.

## 3. How hard is the Meta part?

**Account choice: straightforward. App configuration: the fiddly part. Token creation: automatic after configuration.**

Expect to move between the Meta developer dashboard and your hosting settings for the first setup. Redirect addresses, tester invitations and permissions must match. Creating an app is not the same as receiving approval to use it with unrelated customers. Review/business-verification requirements depend on the app’s access and use case; there is no guaranteed approval time or promise that self-hosting bypasses review.

Start with your own eligible account and a controlled test. If you intend to connect customer accounts, stop and confirm Meta’s current access/review requirements before promising that service.

## 4. Prepare your deployed Ahoy address

Before configuring Meta, deploy Ahoy with a public HTTPS address. For example, if your address is `https://my-ahoy.example`, the values below are:

| Setting | What to enter |
| --- | --- |
| OAuth redirect URI | `https://my-ahoy.example/api/instagram/callback` |
| Inngest app sync URL (enter in Inngest, not Meta) | `https://my-ahoy.example/api/inngest` |
| Webhook callback URL | `https://my-ahoy.example/api/webhook` |
| Privacy policy URL | `https://my-ahoy.example/?view=privacy` |
| Data-deletion instructions URL | `https://my-ahoy.example/?view=deletion` |
| Data-deletion callback, if configuring one | `https://my-ahoy.example/api/data-deletion` |

Replace the example host with **your own** address. Do not paste `localhost` or the example domain into a live Meta app. Publish your operator identity and privacy contact in the policy pages before public use.

Set APP_URL to that same address without a trailing slash. The redirect path and HTTPS scheme must match exactly between Ahoy and Meta.

## 5. Create and configure your Meta app

First check the heading in your Meta dashboard. **New apps use Unified Login.** Existing apps may still offer Instagram Login. Ahoy supports both; the credentials and permissions differ.

### A. Your dashboard says “API setup with Unified login”

1. Open [Meta for Developers → My Apps](https://developers.facebook.com/apps/) and your app. Under **Manage messaging & content on Instagram → Customize**, open **API setup with Unified login**.
2. Connect the app to a business portfolio if prompted. A **business portfolio** is Meta’s container for assets and access; it is separate from choosing Business versus Creator on Instagram. Both professional account types can connect. A Facebook Page is not required for Unified Login.
3. Select **Create new configuration**, or select an **Instagram Login Compatible** configuration. Use a **Business Integration System User Access Token** configuration. Select **Use this configuration**.
4. Review its permissions. Ahoy needs `instagram_basic`, `instagram_manage_comments` and `instagram_manage_messages`. Remove publishing and advertising permissions if your configuration permits and you do not need them. Check the configuration preview for token expiry.
5. Save your exact HTTPS **Redirect URL**: `https://YOUR_DOMAIN/api/instagram/callback`. Copy the complete numeric **Configuration ID** (`config_id` in the generated Login URL). Check every digit; this is different from the app ID.
6. In **Vercel → Project → Settings → Environment Variables**, set:

   ```text
   META_LOGIN_MODE=unified
   META_CONFIG_ID=YOUR_CONFIGURATION_ID
   META_APP_ID=YOUR_META_APP_ID
   META_APP_SECRET=YOUR_META_APP_SECRET
   APP_URL=https://YOUR_DOMAIN
   META_API_VERSION=YOUR_SUPPORTED_VERSION
   ```

   Get the matching **Meta App ID and App Secret from App settings → Basic**. Paste values without quotation marks or surrounding spaces. APP_URL is the site address, without `/api/...` or a trailing slash. Secrets belong only in private environment settings.
7. Under **Add account**, invite your professional Instagram account as an Instagram Tester. Accept the invitation on Instagram’s website under **Settings → Website permissions → Apps and websites → Tester Invites**.
8. Open **Configure webhooks** in Unified Login setup (or **Webhooks → Instagram object**, depending on the dashboard). Use your `/api/webhook` URL and the same `META_VERIFY_TOKEN` in both places. Enable `comments` and `messages`. Ahoy also subscribes each shared account during connection.
9. Redeploy after saving environment variables. Sign in to Ahoy as owner and select **Connect account**. Meta opens its Unified Login screen. Log in with Instagram or Facebook, choose the business portfolio and Instagram accounts to share, and allow message access. Ahoy exchanges the code, discovers the selected accounts and encrypts the token. Do not paste a token into chat or an Ahoy form.

Standard Access supports eligible testing with the appropriate app roles; permissions and webhook access also have their own requirements. Serving unrelated clients requires Meta’s applicable access level and App Review. Publishing the app is not proof that every permission has Advanced Access. We did not establish that completing App Review fixed this installation: the observed connection blocker was account discovery. Meta’s webhook setup documentation specifically lists Advanced Access for `comments` and `live_comments` notifications. The working installation’s approval level was not independently verified; check the requirements for your fields and use case.

Always start authorization from Ahoy’s **Connect account** button in the same browser. Opening Meta’s generated Login URL manually can return to Ahoy without a matching connection session and show “This connection expired.” Do not reuse callback URLs or authorization codes.

### If Meta returns an empty account list after you selected your account

In the working deployment, the diagnostic checks showed:

| Check | Observed result | What it established |
| --- | --- | --- |
| `/me?fields=id,client_business_id` | HTTP 200, portfolio present | The system token represented a portfolio integration. Its `/me` ID was not the Instagram profile ID. |
| `/me/permissions` | Required Instagram permissions granted | Permission names alone did not prove account discovery worked. |
| `/me/assigned_instagram_accounts?fields=id,username` | HTTP 200, `data: []` | Automatic discovery found no accounts despite the selection screen. |
| `/{INSTAGRAM_ACCOUNT_ID}?fields=id,username` | HTTP 200, expected profile | That token could access the intended profile directly. |

A separately generated system token helped isolate this discrepancy outside Ahoy; it was not installed as Ahoy’s connection token. The underlying reason Meta returned an empty list was not established. For a self-hosted installation using your own account, set the optional private hosting variable:

```text
META_INSTAGRAM_ACCOUNT_ID=YOUR_NUMERIC_INSTAGRAM_ACCOUNT_ID
```

Get this ID from Meta Business Settings → Accounts → Instagram accounts. Confirm it identifies the intended profile, rather than copying an ID from a token identity response. It is not the business portfolio ID, app ID, system-user ID or username. Save and redeploy, then start a fresh **Connect account** attempt.

Ahoy still completes OAuth. If discovery is genuinely empty, it requests this specific account with the newly issued token, verifies the returned ID and profile, and requires a successful `comments,messages` webhook subscription before saving. A token that cannot access or subscribe the account is rejected. An unexpected account-list format remains an error. No manually generated access token is needed or stored through environment settings.

Leave this setting empty when automatic account discovery works. This option addresses account discovery; it does not grant additional Meta permissions or establish App Review approval.

### B. Your existing dashboard says “API setup with Instagram login”

1. Set `META_LOGIN_MODE=instagram` and leave `META_CONFIG_ID` empty.
2. Copy the **Instagram App ID and corresponding Instagram App Secret** from this product’s setup into `META_APP_ID` and `META_APP_SECRET`.
3. Register the exact HTTPS callback from the table above. Configure the product’s webhook callback and verify token, plus `comments` and `messages` subscriptions.
4. Grant `instagram_business_basic`, `instagram_business_manage_comments` and `instagram_business_manage_messages`. Add the required app/account roles and accept tester invitations.
5. Set APP_URL and a supported META_API_VERSION, save, redeploy, then connect through Ahoy. This flow uses `graph.instagram.com` and a long-lived Instagram token. Keep Inngest maintenance active for token refresh.

Generate a private verification string on your own machine:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not paste it into a public issue. Generate a separate value for ENCRYPTION_KEY; the encryption key and webhook verification string have different jobs.

**You are done when:** Meta accepts the webhook verification, your callback URI matches, the correct tester invitations are accepted, and Ahoy’s setup checks show the app settings are configured. Configuration checks still do not prove permission approval or real delivery.

## 6. Which “token” is which?

| Name | Where it comes from | What you do |
| --- | --- | --- |
| META_APP_ID | Unified: App settings → Basic. Existing Instagram Login: product login setup. | Copy to the hosting environment once. It identifies the app. |
| META_INSTAGRAM_ACCOUNT_ID | Optional: your Instagram account ID from Meta Business Settings. | Unified Login fallback only when account discovery returns an empty list; direct access and subscription are still verified. |
| META_CONFIG_ID | Unified Login configuration (numeric ID). | Required for Unified Login; leave empty for Instagram Login. |
| META_LOGIN_MODE | Your dashboard’s setup type. | `unified` for new apps, `instagram` for existing Instagram Login apps. |
| META_APP_SECRET | The corresponding application secret. | Store privately in the hosting environment. Used on the server. |
| META_VERIFY_TOKEN | A random string **you generate**. | Put the same value in Ahoy and Meta’s webhook verification field. |
| Instagram access token | Instagram issues it after the account owner approves login. | **Ahoy handles it. Do not paste one manually.** |
| ENCRYPTION_KEY | A separate random 32-byte key you generate. | Ahoy uses it to encrypt access tokens at rest. Back it up securely. |

The Resend API key and Turso database token are credentials for those providers. They are not Meta credentials.

## 7. Let Ahoy obtain the Instagram token

1. Sign in to your deployed Ahoy instance using your admin token or optional owner email link.
2. Open **Instagram accounts → Connect account**.
3. On Meta’s login screen, select the intended professional account(s) and approve the requested access. With Unified Login, choose the business portfolio first. Your Instagram password stays on Instagram’s own screen.
4. Instagram redirects back to Ahoy. The server exchanges the temporary code for a token and encrypts it. Unified Login discovers every shared Instagram account. Only Instagram Login uses the 60-day exchange/refresh flow. Unified token lifetime depends on your configuration; Ahoy shows any expiry returned by Meta and requires reconnecting when access expires or is revoked.
5. Confirm your real username appears in Ahoy. Choose **Check connection** to validate the token.

**You are done when:** your account appears in the private workspace and Check connection succeeds. This validates account access, not permission to message every possible recipient.

Ahoy’s daily Inngest maintenance job attempts to refresh expiring **Instagram Login** tokens. Unified Login tokens use the lifetime selected in Meta’s configuration; automatic rotation of those tokens is not implemented. If a token has expired, consent was revoked or refresh fails, reconnect from Accounts. The app uses the expiry returned by Meta rather than promising that a token is permanent.

## 8. Register background functions and test a real comment

1. Configure durable Turso storage and both Inngest keys in Vercel Production. Use event and signing keys from the same intended Inngest environment. Redeploy after changing variables.
2. In that Inngest environment, open **Apps → Sync new app** (or open the existing app → **Resync**). Enter `https://YOUR_DOMAIN/api/inngest`. Use your stable deployment domain.
3. Confirm the sync succeeds and these four functions appear:

   | Function ID | Trigger |
   | --- | --- |
   | `ingest-webhook` | `ahoy/webhook.received` |
   | `deliver-comment` | `ahoy/comment.ready` |
   | `reconcile` | Every 15 minutes |
   | `daily-maintenance` | Daily |

4. Confirm Meta accepts the `/api/webhook` callback and has `comments` and `messages` enabled. Connecting an account also subscribes that account; both settings are needed. A Meta **Test** event may contain dummy account data, so it is only a transport check.
5. Create and activate one campaign for one real post, with a clear keyword and a short message. Keep **Track link clicks** off to send your destination URL directly. If enabled, an Ahoy `/api/go/...` redirect is intentional and should open your destination.
6. Keep `LIVE_SENDS_ENABLED=false` during setup. When ready for the controlled test, set it to `true` in Production and redeploy. Keep `SAAS_ENABLED=false`; `DEMO_MODE=false` makes the installation owner-only.
7. From an eligible separate Instagram account, leave a **fresh** matching comment. Do not use the sending account to message itself or replay an old webhook as a new test.
8. Check Vercel for webhook receipt, Inngest for ingestion and delivery runs, Ahoy **Activity** for the outcome, and the recipient’s Instagram inbox or message requests for the actual DM. If a public reply is configured, check it separately.

**You are done when:** a new real comment produces a successful delivery run, a corresponding Activity entry and the expected message and link in Instagram. Then separately test opt-outs, duplicate handling and recovery before relying on the installation broadly. Follow confirmation remains disabled.

Resync after deploying changes to function definitions unless a hosting integration does this successfully for you. Having keys or receiving an Inngest event does not register functions automatically.

## Common snags

| What you see | Check this first |
| --- | --- |
| “Professional account required” | Confirm the selected profile is Creator or Business, not merely public. |
| “Redirect URI mismatch” | Compare the full callback URL, HTTPS scheme, hostname and path character by character. |
| No Activity after a comment | In Vercel Runtime Logs, include Info/Warning/Error and search `Ahoy webhook`. `received` confirms arrival; `rejected` means signature validation failed; `saved` confirms persistence; `handed to Inngest` confirms event publication (not function execution). The function route is `/api/[...path]`. A Meta sample event may use a sample account ID and need not create real campaign activity. |
| Empty Instagram account list after selecting an account | The callback includes a safe `diagnostics` summary: account-list shape, portfolio access and the three required permission statuses. Share only the error and this summary. It contains no access token, account IDs, authorization code or state. An unexpected response is reported separately from a genuinely empty list. |
| Invalid platform app | Check the dashboard setup type. Unified Login needs META_LOGIN_MODE=unified, META_CONFIG_ID and the Meta app credentials. Redeploy; the Connect button should open Facebook’s dialog with config_id. |
| Webhook verification fails | Check APP_URL, the deployed `/api/webhook` address and the exact same META_VERIFY_TOKEN on both sides. |
| A tester cannot connect | Confirm the right app/account role, accepted invitation, selected account and consent. |
| Token works but messages fail | Check messaging/comment permissions, recipient eligibility, comment age and Meta’s error. A valid token alone is insufficient. |
| Inngest receives the event but no function runs | Sync/resync the app in the same environment as the keys. Check that `ingest-webhook` has the exact `ahoy/webhook.received` trigger and all four functions appear. |
| Comments arrive but stay queued | Inspect the ingestion and delivery run results, campaign status, matching keyword and `LIVE_SENDS_ENABLED`. |
| `GET /api/inngest`: “No x-inngest-signature provided” | An unsigned browser/probe request can produce this rejection. Inspect actual signed sync/run results; this GET alone does not prove jobs failed. Keep signature verification enabled. |
| The DM shows an Ahoy `/api/go/...` URL | Click tracking sends a redirect intentionally. Check its destination; turn off **Track link clicks** for direct URLs in newly generated messages. |
| Admin token is rejected | Copy the exact ADMIN_TOKEN value, without quotes or spaces; redeploy after changing it. Wait fifteen minutes if attempts are limited. |
| Owner email never arrives | Check OWNER_EMAIL, Resend’s verified sending domain, EMAIL_FROM, provider logs and spam. Instagram settings will not fix email sign-in. |
| It worked before, then stopped | Check account connection/token expiry, Inngest maintenance and whether access was revoked. |

## Sources and verification limits

- [Meta: Unified Login get started](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started).
- [Meta: migration from Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide).
- [Meta: webhook setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup).
- [Meta: App Review](https://developers.facebook.com/documentation/instagram-platform/app-review).
- [Inngest: apps, syncs and environments](https://www.inngest.com/docs/platform-and-operations/apps-and-syncs).
- [Instagram Help: professional accounts](https://help.instagram.com/138925576505882).
- [Resend: domains and verification](https://resend.com/docs/dashboard/domains/introduction).

Updated November 1, 2026 using the current implementation and the owner’s observed production connection and campaign DM. Meta’s published setup text was checked through a text reader where direct developer pages were inaccessible. Exact mobile menu labels, access for unrelated accounts, automatic recovery, token expiry/revocation and deletion still need validation for each installation. One successful account does not establish general Meta approval.
