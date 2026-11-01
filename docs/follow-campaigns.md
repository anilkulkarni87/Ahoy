# Optional follow invitations and follow-required campaigns

Existing campaigns still send immediately. No new secrets, AI provider or email service is required.

## Choose the campaign behavior

In **Write your message → When should we send the resource?** choose:

- **Send immediately:** sends the resource after a matching comment. Optionally enable **Include an optional follow invitation** to append your connected profile link. It does not hold the resource or verify a follow.
- **After following:** sends a follow request and profile link first. Ahoy adds an instruction such as `Reply CHECK A1B2C3D4`. The resource message and link remain withheld until the recipient replies and Meta explicitly returns `is_user_follow_business: true`.

The two preview tabs show the request and resource separately. The request code in the preview is illustrative; each real request gets its own code. Use the code when several requests are pending for the same person. A plain `CHECK` works only when there is exactly one pending request.

The initial private reply uses text and a clickable profile URL. It does not assume native button templates work in a comment-based private reply. It cannot automatically follow on behalf of the recipient.

## Reply and recheck behavior

A comment alone does not establish profile-access consent. The person must first send the CHECK text reply in Instagram. Ahoy uses the messaging recipient ID returned by Meta, retains the requested resource as a snapshot and checks follow status using the account's persisted login type.

- **True:** send the stored resource once, then mark Activity **Sent**.
- **False:** keep Activity **Awaiting follow**, withhold the resource and try sending **Visit profile** / **Check follow** buttons. The person can also reply with the same CHECK code again.
- **Missing field, unsupported access or API failure:** show **Verification unavailable** and withhold the resource. Do not interpret this as “not following” or as success.

Repeated checks have a 30-second cooldown. A recheck button only works within a messaging window already established by the inbound text. Ahoy conservatively uses 23 hours; after that the person must send a new CHECK text reply. No background polling or automatic release based on follower-count changes occurs.

Unknown resource-send outcomes are not automatically retried. Inspect Instagram before creating a new request. Paused/deleted campaigns, disconnected accounts, opt-outs and disabled live sends prevent release.

## Enable recheck buttons (optional)

The CHECK text path uses the existing `messages` webhook subscription. Native recheck buttons additionally need `messaging_postbacks`:

1. Enable `messaging_postbacks` on the Instagram object in Meta’s webhook settings, alongside `comments` and `messages`.
2. In Ahoy → Instagram accounts, select **Enable follow recheck buttons** for the connected account. This updates its subscriptions without requiring a new OAuth connection.
3. Test the buttons in a real conversation. If a template cannot be sent, Activity explains that CHECK text replies remain available.

Ordinary account connection keeps its existing subscriptions. This feature does not change working OAuth settings, app IDs or configuration IDs.

## Test before using broadly

1. Deploy and resync the existing Ahoy app in Inngest. There are still four functions; follow checks use the existing per-account delivery queue.
2. Create one **After following** campaign on a test post. Use a recipient account that does not already follow the connected account.
3. Comment the keyword. Confirm only the request arrives: no resource text, URL or tracking link.
4. Reply with its CHECK code before following. Confirm the resource stays withheld. Check Activity and any recheck buttons.
5. Follow, then reply with the code again after 30 seconds. Confirm Meta verification succeeds and the resource arrives once.
6. Repeat the CHECK reply and replay a duplicate event: neither should resend the resource.
7. Test STOP before release, a paused campaign and an unavailable follow-status lookup. All must withhold the resource.

The demo simulator lets you test both “not following” and “following” outcomes without contacting Meta. These outcomes are explicitly simulated, not evidence of Meta compatibility.

## Verification limits and sources

The implementation is covered by mocked Meta API tests and local UI/API checks. Verified follow lookup and recheck buttons still require the controlled test above with your particular Unified Login configuration. They are not claimed to work on every token or account. Unsupported verification fails closed rather than becoming a self-confirmation gate.

Meta documents the follow-status field and messaging consent in the [Instagram User Profile API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile), and URL/postback templates in [Button templates](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template). Those examples use Instagram Login; Unified Login's specific capability must be established with the actual connection. Also follow [private-reply restrictions](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies).

## Performance changes in this release

Database initialization now shares one promise for table creation and migrations. Schema checks run once per successful process initialization instead of on every database helper call; a failed initialization can retry. Independent dashboard reads run concurrently. Delivery also fetches its campaign by ID instead of loading every campaign. No production latency percentage is claimed without production measurements.
