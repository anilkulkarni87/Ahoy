# Connect Instagram without guessing which account or token to use

This guide covers **your own self-hosted Ahoy installation**. You can use the demo without completing any of these steps.

The setup has two separate parts:

1. **One-time setup:** choose an eligible Instagram account, configure a Meta developer app and add its credentials to Ahoy.
2. **Connect account:** click the button in Ahoy and approve Instagram’s login screen. Ahoy obtains and stores the Instagram access token for you.

You should not have to paste an Instagram access token into an Ahoy form, generate a token every day, or share your Instagram password with the person helping you.

## 1. Business, Creator or Personal?

“Professional account” is Instagram’s umbrella term for **Business** and **Creator**. It does not mean you need a paid verification badge. A Meta developer app and Meta business verification are separate things again.

| Account type | A practical choice for | Ahoy eligibility |
| --- | --- | --- |
| **Creator** | A person whose audience follows their work: an artist, writer, educator, influencer or independent content creator. | Supported account category for the Instagram Login API Ahoy uses. |
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

## 2. Why does Ahoy mention Resend?

There are **two different sign-ins**:

| Sign-in | What it does | Who handles it |
| --- | --- | --- |
| Sign in to Ahoy | Opens your private owner dashboard using a link in your email. | Ahoy creates a one-use link; **Resend delivers the email**. |
| Connect Instagram | Authorizes Ahoy to access your professional account with the approved permissions. | **Instagram / Meta**, through its official login screen. |

The product spec asks for email magic-link sign-in, so the current implementation uses Resend. Resend does not send your Instagram DMs and does not create Meta tokens. The demo does not need it.

**For real owner sign-in, Resend is currently required by this code.** Another email provider or SMTP is not a drop-in environment-variable change. Password or passkey sign-in could remove the email-provider setup, but neither is implemented in this version. Keep owner authentication enabled on a public installation.

To configure the current email sign-in:

1. Create your own Resend account and add a domain you control.
2. Follow Resend’s domain-verification instructions in your DNS provider and wait until sending is verified.
3. Create an API key for sending email.
4. Set OWNER_EMAIL to your own inbox, RESEND_API_KEY to that private key, and EMAIL_FROM to a sender on the verified domain.
5. Restart Ahoy locally, or redeploy after changing Vercel environment variables. Choose **Sign in**, enter the address configured in OWNER_EMAIL and open the email link. It expires after 15 minutes and works once.

For local email sign-in, use `APP_URL=http://localhost:3000` (or the matching loopback port). Public deployments must use HTTPS. A localhost link opens on the device running Ahoy: open that email link on the same computer, not on your phone. If testing with `onboarding@resend.dev`, OWNER_EMAIL must be the email associated with your Resend account; otherwise verify a sending domain and use its sender address.

**You are done when:** the link opens the private workspace. The demo workspace is not proof that owner sign-in works.

## 3. How hard is the Meta part?

**Account choice: straightforward. App configuration: the fiddly part. Token creation: automatic after configuration.**

Expect to move between the Meta developer dashboard and your hosting settings for the first setup. Redirect addresses, tester invitations and permissions must match. Creating an app is not the same as receiving approval to use it with unrelated customers. Review/business-verification requirements depend on the app’s access and use case; there is no guaranteed approval time or promise that self-hosting bypasses review.

Start with your own eligible account and a controlled test. If you intend to connect customer accounts, stop and confirm Meta’s current access/review requirements before promising that service.

## 4. Prepare your deployed Ahoy address

Before configuring Meta, deploy Ahoy with a public HTTPS address. For example, if your address is `https://my-ahoy.example`, the values below are:

| What Meta asks for | What to enter |
| --- | --- |
| OAuth redirect URI | `https://my-ahoy.example/api/instagram/callback` |
| Webhook callback URL | `https://my-ahoy.example/api/webhook` |
| Privacy policy URL | `https://my-ahoy.example/?view=privacy` |
| Data-deletion instructions URL | `https://my-ahoy.example/?view=deletion` |
| Data-deletion callback, if configuring one | `https://my-ahoy.example/api/data-deletion` |

Replace the example host with **your own** address. Do not paste `localhost` or the example domain into a live Meta app. Publish your operator identity and privacy contact in the policy pages before public use.

Set APP_URL to that same address without a trailing slash. The redirect path and HTTPS scheme must match exactly between Ahoy and Meta.

## 5. Create and configure your Meta app

1. Open [Meta for Developers → My Apps](https://developers.facebook.com/apps/), sign in and complete developer registration if prompted.
2. Create an app and select the use case/product that supports **Instagram API with Instagram Login**. Meta changes the creation wizard; use its current Instagram Login instructions rather than selecting an unrelated template simply because its name includes “Business”.
3. Open the Instagram product’s **API setup with Instagram login** configuration. This app uses Instagram Login and `graph.instagram.com`. Do not substitute a Facebook Page-token tutorial; Facebook Login is a different integration flow.
4. Register the redirect URI from the table above in the login configuration. Add required app domains and policy/deletion URLs where the dashboard asks for them.
5. Copy the application ID and corresponding secret for this Instagram Login configuration to META_APP_ID and META_APP_SECRET in **your hosting provider’s private environment settings**. Keep the matching pair together. The dashboard may show both a parent Meta app ID and Instagram product credentials; do not assume all IDs/secrets are interchangeable.
6. Generate a random verification string locally using the command below. Save it as META_VERIFY_TOKEN. This is a string **you choose**, not an Instagram access token.
7. Register the webhook callback URL and enter the identical verification string when Meta asks for the **Verify token**. Configure comment and message subscriptions. Ahoy verifies callback challenges and signs up the connected account for these event fields during connection.
8. Review the permissions Ahoy requests: `instagram_business_basic`, `instagram_business_manage_comments` and `instagram_business_manage_messages`. Their names contain “business” even when the Instagram profile is **Creator**. Request only the permissions required for this use case; Ahoy does not request content publishing.
9. If testing in development mode, assign the appropriate Instagram tester/app roles and accept any invitations from the intended test account. Confirm all required account/app roles and granted permissions. Adding someone to a tester list alone is not proof that consent is complete.
10. Set META_API_VERSION to a currently supported version shown by Meta, save your hosting settings and redeploy Ahoy.

Generate a private verification string on your own machine:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not paste it into a public issue. Generate a separate value for ENCRYPTION_KEY; the encryption key and webhook verification string have different jobs.

**You are done when:** Meta accepts the webhook verification, your callback URI matches, the correct tester invitations are accepted, and Ahoy’s setup checks show the app settings are configured. Configuration checks still do not prove permission approval or real delivery.

## 6. Which “token” is which?

| Name | Where it comes from | What you do |
| --- | --- | --- |
| META_APP_ID | The developer app’s Instagram Login configuration. | Copy to the hosting environment once. It identifies the app. |
| META_APP_SECRET | The corresponding application secret. | Store privately in the hosting environment. Used on the server. |
| META_VERIFY_TOKEN | A random string **you generate**. | Put the same value in Ahoy and Meta’s webhook verification field. |
| Instagram access token | Instagram issues it after the account owner approves login. | **Ahoy handles it. Do not paste one manually.** |
| ENCRYPTION_KEY | A separate random 32-byte key you generate. | Ahoy uses it to encrypt access tokens at rest. Back it up securely. |

The Resend API key and Turso database token are credentials for those providers. They are not Meta credentials.

## 7. Let Ahoy obtain the Instagram token

1. Sign in to your deployed Ahoy instance using the owner email link.
2. Open **Instagram accounts → Connect account**.
3. On Instagram’s login screen, select the intended professional account and approve the requested access. Your Instagram password stays on Instagram’s own screen.
4. Instagram redirects back to Ahoy. The server exchanges the temporary code for an access token, requests a longer-lived token, encrypts it and stores its expiry.
5. Confirm your real username appears in Ahoy. Choose **Check connection** to validate the token.

**You are done when:** your account appears in the private workspace and Check connection succeeds. This validates account access, not permission to message every possible recipient.

Ahoy’s daily Inngest maintenance job attempts to refresh expiring tokens. That job must be configured and running. If a token has expired, consent was revoked or refresh fails, reconnect from Accounts. The app uses the expiry returned by Meta rather than promising that a token is permanent.

## 8. Test before turning it loose

Create one campaign for one post, use a clear keyword and a short message, and follow the controlled live-test procedure in the README. Leave a matching comment from an eligible separate test account; do not use the sending account to DM itself.

Check the real Instagram inbox and Ahoy Activity. Validate opt-outs and duplicate-event handling. Keep LIVE_SENDS_ENABLED=false until your app configuration and policy checks are ready; enable it explicitly for the controlled live test.

The current app has not yet completed this real-account validation. Follow confirmation remains disabled, and Meta approval is not claimed.

## Common snags

| What you see | Check this first |
| --- | --- |
| “Professional account required” | Confirm the selected profile is Creator or Business, not merely public. |
| “Redirect URI mismatch” | Compare the full callback URL, HTTPS scheme, hostname and path character by character. |
| Webhook verification fails | Check APP_URL, the deployed `/api/webhook` address and the exact same META_VERIFY_TOKEN on both sides. |
| A tester cannot connect | Confirm the right app/account role, accepted invitation, selected account and consent. |
| Token works but messages fail | Check messaging/comment permissions, recipient eligibility, comment age and Meta’s error. A valid token alone is insufficient. |
| Comments arrive but stay queued | Confirm Inngest keys, signing key and the deployed `/api/inngest` sync. |
| Owner email never arrives | Check OWNER_EMAIL, Resend’s verified sending domain, EMAIL_FROM, provider logs and spam. Instagram settings will not fix email sign-in. |
| It worked before, then stopped | Check account connection/token expiry, Inngest maintenance and whether access was revoked. |

## Sources and verification limits

- [Meta’s Instagram API collection: Instagram Login, professional accounts, permissions and tester requirements](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).
- [Meta’s Instagram Login setup documentation](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/).
- [Instagram Help: professional accounts](https://help.instagram.com/138925576505882).
- [Resend: domains and verification](https://resend.com/docs/dashboard/domains/introduction).

Documentation reviewed October 31, 2026. The Meta-owned Postman collection was accessible; Meta’s developer/help pages were rate-limited or login-gated. Exact current dashboard/mobile screenshots and a real-account walkthrough still need validation. No guessed screenshots, guaranteed setup times or approval guarantees are supplied here.
