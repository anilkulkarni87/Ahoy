# Optional follow invitations and follow-required campaigns

Existing campaigns still send immediately. No new secrets, AI provider or email service is required.

## Choose the campaign behavior

In **Write your message → When should we send the resource?** choose:

- **Send immediately:** sends the resource after a matching comment. Optionally enable **Include an optional follow invitation** to append your connected profile link. It does not hold the resource or verify a follow.
- **After following:** sends a follow request and profile link first. Ahoy adds a **Check follow** quick-reply button and your profile link. No request code needs to be typed. The resource message and link remain withheld until the recipient replies and Meta explicitly returns `is_user_follow_business: true`.

The two preview tabs show the request and resource separately. The button carries the request ID in a hidden payload, so it selects the right resource even if several requests are pending. A plain `CHECK` text reply remains a fallback when exactly one request is pending. Old messages with CHECK codes continue working.

The initial private reply uses text, a clickable profile URL and a Check follow quick reply. A quick reply posts its title as the recipient’s actual message; it is different from a URL click or a postback-only button. It cannot automatically follow on behalf of the recipient. Meta does not display quick replies on desktop, so CHECK text remains a fallback. If Meta explicitly rejects the initial quick-reply request with a validation error, Ahoy attempts one plain-text request containing a CHECK code. It never attempts this fallback after a timeout, unknown send outcome or server error.

## Reply and recheck behavior

A comment alone does not establish profile-access consent. The person must tap the quick reply or send a CHECK text reply in Instagram. Ahoy uses the messaging recipient ID returned by Meta, retains the requested resource as a snapshot and checks follow status using the account's persisted login type.

- **True:** send the stored resource once, then mark Activity **Sent**.
- **False:** keep Activity **Awaiting follow**, withhold the resource and try sending **Visit profile** / **Check follow** buttons. The person can also reply CHECK when only one request is pending; old coded replies remain supported.
- **Missing field, unsupported access or API failure:** show **Verification unavailable** and withhold the resource. Do not interpret this as “not following” or as success.

Repeated checks have a 30-second cooldown. If a new click arrives during the cooldown, the delivery workflow waits durably and rechecks automatically; the recipient normally does not need to click again. Several competing checks can postpone this further; Activity explains when another tap is needed. A postback recheck button only works within a messaging window already established by an inbound quick reply or text message. Ahoy conservatively uses 23 hours; after that the person must send a new CHECK text reply. No background polling or automatic release based on follower-count changes occurs.

Unknown resource-send outcomes are not automatically retried. Inspect Instagram before creating a new request. Paused/deleted campaigns, disconnected accounts, opt-outs and disabled live sends prevent release.

## Enable recheck buttons (optional)

The CHECK text path uses the existing `messages` webhook subscription. Native recheck buttons additionally need `messaging_postbacks`:

1. Enable `messaging_postbacks` on the Instagram object in Meta’s webhook settings, alongside `comments` and `messages`.
2. In Ahoy → Instagram accounts, open the account’s **Follow buttons** section and select **Enable follow buttons**. This is account-wide; every follow-required campaign on that account uses the same subscription. This updates its subscriptions without requiring a new OAuth connection.
3. Wait at least 30 seconds after the previous check, then test the buttons in a real conversation. If a template cannot be sent, Activity explains that CHECK text replies remain available.

If a button renders but tapping it produces no response, check both subscriptions above first. Rendering a button does not enable its click webhook. In Vercel Runtime Logs for `/api/inngest`, `Ahoy follow button received` confirms a follow-button event reached the ingestion worker; `eligibleChecks: 1` means it matched a pending request within an existing messaging window. `Ahoy follow check queued` confirms publication to the delivery queue. `Ahoy follow check result` reports the worker outcome; `deferred: true` means it is waiting for the cooldown, while `status` identifies the resulting activity state. A received/queued log alone does not prove that the delivery function ran. No such log after a tap points to delivery/subscription or ingestion issues, not proof that the follow was checked. A value of zero means no eligible pending request was found; a completed request or expired messaging window can cause this.

Ordinary account connection keeps its existing subscriptions. This feature does not change working OAuth settings, app IDs or configuration IDs.

## Test before using broadly

1. Deploy and resync the existing Ahoy app in Inngest. There are still four functions; follow checks use the existing per-account delivery queue.
2. Create one **After following** campaign on a test post. Use a recipient account that does not already follow the connected account.
3. Comment the keyword. Confirm the request includes Check follow and the profile link, with no resource text, URL or tracking link.
4. Tap Check follow before following (use mobile Instagram). Confirm the resource stays withheld. Check Activity and any recheck buttons.
5. Follow, then tap the recheck button again. Early clicks wait out the cooldown automatically. Confirm Meta verification succeeds and the resource arrives once.
6. Repeat the CHECK reply and replay a duplicate event: neither should resend the resource.
7. Test STOP before release, a paused campaign and an unavailable follow-status lookup. All must withhold the resource.

The demo simulator lets you test both “not following” and “following” outcomes without contacting Meta. These outcomes are explicitly simulated, not evidence of Meta compatibility.

## Verification limits and sources

The implementation is covered by mocked Meta API tests and local UI/API checks. The owner has observed both a successful verified resource release and a false follow check with buttons on one Unified Login connection. Button-click delivery still needs the two subscriptions and a controlled live test. Other installations must repeat the acceptance test above. The new initial quick-reply private reply still needs a controlled live test with the actual connection. It is not claimed to work on every token or account. Unsupported verification fails closed rather than becoming a self-confirmation gate.

Meta documents the follow-status field and messaging consent in the [Instagram User Profile API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile), and URL/postback templates in [Button templates](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template). Those examples use Instagram Login; Unified Login's specific capability must be established with the actual connection. See [Meta quick replies](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/quick-replies) for the inbound-message behavior and desktop limitation. Also follow [private-reply restrictions](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies).

## Performance changes in this release

Database initialization now shares one promise for table creation and migrations. Schema checks run once per successful process initialization instead of on every database helper call; a failed initialization can retry. Independent dashboard reads run concurrently. Delivery also fetches its campaign by ID instead of loading every campaign. No production latency percentage is claimed without production measurements.
