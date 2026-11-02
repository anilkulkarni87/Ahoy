# Ahoy value-add roadmap

Proposed work, not implemented features. The aim is to make it easy for a creator to offer the right resource, understand results and recover from problems without technical help. Keep the core app usable without AI or an additional paid service.

## Release gate: prove the current version in production

Deploy the committed build, verify Meta subscription read-back, and run one fresh instant-delivery campaign and one follow-required campaign. Record the comment, initial reply, button interaction, follow result and delivered resource. Do not reset production data as part of deployment.

Recheck the unresolved dependency advisories in SECURITY.md. Investigate supported upstream fixes or narrowly scoped patches with regression tests; do not downgrade Inngest or override its parser across major versions to suppress an audit. Establish baseline state/API latency and a small isolated burst test, including duplicates, cooldowns, rate limits and worker recovery. Avoid real customer sends in load tests.

Acceptance: both live flows verified, dependency risks explicitly resolved or assessed, and a recorded performance baseline. This is a release-hardening step, not a new product feature.

## 1. Connection health and guided recovery

**Value:** answer “Why did this person not receive a DM?” from inside Ahoy.

Show the latest webhook receipt, worker progress, account access check and last delivery result. Distinguish configuration known to Ahoy from external settings it cannot inspect. Give one plain-language next action and a copyable diagnostic summary with credentials and customer messages removed. Check the actual workflow path, rather than treating an unsigned browser visit to Inngest as an error.

Acceptance:
- An expired credential, missing button event, queued worker and rejected send show distinct explanations.
- A successful real test updates a visible “Last successful delivery” timestamp.
- Diagnostics contain no token, authorization code, raw webhook body or customer message.
- Checks are manual or cached; rendering a dashboard does not fan out into repeated Meta calls.

## 2. Campaign conversion funnel

**Value:** show whether asking for a follow helps the creator or causes people to drop off.

Report matched comments → follow request delivered → follow check received → follow verified → resource delivered. Show instant-delivery campaigns separately. Add delivery delay and reasons resources were withheld. Keep click tracking opt-in and state that direct resource URLs do not produce Ahoy click metrics.

Use a campaign and reporting-period cohort. Deduplicate interactions and show denominators; repeated taps must not inflate conversion. “Follow verified” means Meta reported following at verification time. It does not prove a new follower was acquired or that a person remained following later.

Acceptance:
- Every displayed count can be reconciled with activity records and retained aggregates.
- A duplicate webhook or button tap does not inflate the funnel.
- Preparing for launch separates test results from the new reporting period.
- Aggregates and indexed queries keep dashboard cost bounded; no per-card remote API calls.

## 3. Resource library and reusable campaigns

**Value:** launch a new resource campaign in minutes without rewriting everything.

Save named resources with a destination URL, description and optional preview. Create a campaign from a template: instant resource, optional follow invitation, or verified follow first. Duplicate an existing campaign with its trigger and message clearly visible for review.

Version a resource destination when publishing. Existing pending requests retain their promised resource snapshot; updating a resource must not silently change what an already-contacted person receives. Distinguish the saved resource from the campaign's editable message.

Acceptance:
- A creator can create, preview and publish a campaign from a saved resource.
- A duplicate starts paused to prevent accidental sends.
- Changing a resource does not rewrite pending request snapshots or previously sent tracking destinations.
- Broken/unreachable link warnings are advisory and do not block a legitimate URL based on one failed fetch. Any server-side URL checker needs SSRF protection before implementation.

## 4. Optional Groq campaign assistant

**Value:** help write better messages without making live delivery depend on AI.

Begin with an editor action: suggest three short DM variants, suggest keywords, or rewrite the creator's own draft in a chosen tone/language. Show a preview and require the creator to choose a suggestion before saving. Keep resource URLs, follow requirements and delivery rules controlled by application code.

Use a server-only Groq key, explicit opt-in, bounded input/output and per-owner usage budgets. Send only text deliberately submitted to the assistant; do not send commenter identities, conversation histories or credentials by default. A timeout returns the existing draft intact. Structured output helps validate the response shape, but cannot establish that the generated text is accurate or appropriate.

Acceptance:
- Suggestions cannot send messages, publish campaigns or alter follow verification.
- Unsupported/missing configuration leaves manual editing fully functional.
- Owner sees which content is sent to Groq before using the feature.
- Usage and failures are visible without logging submitted text.

Primary references to recheck at implementation:
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/your-data

## 5. Interactive resource chooser

**Value:** turn one campaign into a small, guided resource concierge: for example, “Which guide would you like: recipes, travel or photography?”

After a valid inbound interaction, route a supported quick reply to one approved resource. Offer an understandable text fallback and expiry message. Keep the first version to a small fixed set of choices; do not introduce a visual workflow builder yet.

Acceptance:
- Validate the exact message format and conversation eligibility with the current Unified Login connection before promising it in the UI.
- Hidden payloads are bound to the sender, account and pending request.
- Expired, repeated and cross-account interactions cannot cause duplicate delivery or reveal another person's resource.
- STOP always overrides a selection. A URL click alone must not be treated as messaging consent.

## Suggested sequence

1. Release hardening and connection health.
2. Conversion funnel.
3. Resource library and campaign duplication.
4. Groq editor assistance.
5. Interactive resource chooser, after validating Meta support.

The strongest next product increment is **connection health plus the conversion funnel**: it builds trust and reveals what to improve. The quickest creator-facing convenience is **duplicate campaign, starting paused**. Defer unrestricted AI replies, unsolicited reminders and multi-step automation until eligibility, quality and operational behavior are established.
