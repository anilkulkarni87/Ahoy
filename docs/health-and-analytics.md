# Connection health and campaign results

## Find out whether replies are working

Open **Setup & health → Connection health**. Refreshing this panel reads evidence saved in Ahoy; it does not contact Meta or send a message.

For each account, the panel shows:
- The last manual Instagram access check and any reported token expiry.
- The last signature-verified comment webhook received for that connected account.
- Queued replies, recent worker activity and replies waiting for a follow.
- The last follow-button webhook observed.
- The last message acceptance confirmed by a successful Meta API response.
- Failed replies recorded in the last 24 hours, with a next step.

No recent traffic does **not** imply a broken connection. A successful access check confirms only that profile request, not every messaging permission. A webhook receipt confirms transport to Ahoy, not matching or delivery. A queued reply can be delayed by account throttling. Pending for over ten minutes prompts a workflow/recovery check; it is not proof that Inngest is offline.

**Check Instagram access** makes one manual Meta profile request and records the result. It does not send a DM. An interrupted request is reported as a check that could not complete, rather than proof that credentials have expired.

Meta's app-level webhook configuration and the account-level subscription are separate. Check **Instagram accounts → Follow buttons** for the latter. A received button webhook is additional evidence of traffic, not continuous certification of either setting.

## Run a guided delivery test

1. Use an active campaign and a separate Instagram account. Confirm the intended post and keyword.
2. Expand **Run a guided delivery test**, choose the connected account and click **Start test**.
3. Leave a fresh matching comment from the other Instagram account. If live sending is enabled, the active campaign can send a real reply.
4. Click **Refresh health**. Select your own test comment by its username and time; other people's comments can arrive during the test too.
5. Review its delivery timeline. For a follow-required campaign, interact with the Instagram follow request, then refresh again.
6. Check the recipient's Instagram inbox yourself. “Accepted by Meta” does not prove the message was read or that a resource URL opened.

The test captures a server timestamp and shows subsequent activity from the selected account. It shows the latest 20 records; for a busy account, use **Activity** to find the comment instead. Refresh keeps the guided test open. Changing the tested account or navigating away starts a new guided session. Starting the guided test itself sends no message.

## Share diagnostics safely

**Copy safe diagnostics** and **Download diagnostics** include timestamps, signal statuses and queue/failure counts. They exclude usernames, account IDs, campaign IDs, credentials, comments, message text and raw webhook data. Review the summary before sharing it; timestamps and operational counts can still reveal usage patterns.

## Understand a campaign's funnel

Open **Analytics** and choose a campaign and period: last 7, 30 or 90 days, or since launch (up to 90 days). The beginning of the reporting period is clipped to the workspace's launch boundary.

Follow-required campaigns report:

**Matched people → Follow request accepted → Follow check received → Follow verified → Resource accepted**

Instant campaigns show **Matched people → Resource accepted**. Delivery mode is saved with each matching request, so editing a campaign later does not recategorize earlier requests.

Each stage counts unique comment identities within one campaign, delivery mode and cohort. A keyword match blocked by an existing opt-out remains in the matched denominator and is shown as a blocker; it never queues a message. Repeated taps or repeated matching comments from the same person do not inflate that stage. The report also shows the number of matching replies and accepted resources, which can exceed unique-person counts. Do not add campaign rows to obtain a unique audience total: one person may participate in several campaigns or modes.

A cohort consists of matching activity recorded between the displayed start and end times. Its progress uses the milestones known at refresh time. The percentage is resources accepted divided by matched people, not by total post viewers, all comments or profile visits. The average delay measures time from Ahoy recording a matching comment to resource acceptance per accepted reply; it is not Meta transport time alone.

**Follow verified does not mean a new follower.** Someone who already followed can pass the check. The report cannot prove continued following, a read, a sale or a website visit. Direct resource URLs have no Ahoy click tracking. Comparing campaign modes is observational; this release does not implement a randomized experiment.

## Historical coverage and storage

Milestone tracking begins when this version initializes its database. It does not reconstruct earlier sends or checks from today's status. Older records show an incomplete timeline and are excluded from the new funnel; the legacy overview totals may therefore differ. The demo seeds explicitly simulated examples, never proof of a live connection.

Timelines record the first occurrence of each milestone, plus the current status and explanation. They are not an exhaustive attempt-by-attempt audit log. Duplicate events do not create extra funnel milestones. Unknown network outcomes do not count as accepted resources.

When daily maintenance runs:
- Detailed activity, message content, follow-request snapshots and timelines follow the existing 30-day retention policy.
- Minimal per-request reporting facts remain for 90 days: campaign/account references, a hashed comment identity, delivery mode, timestamps and allowlisted outcome codes. Hashing is pseudonymization, not a guarantee of anonymity.
- The existing overview's aggregate daily totals remain separately. Analytics does not sum those aggregates as unique people.

Preparing for launch preserves stored history but excludes pre-launch cohorts from reports and closes pending test deliveries. Account-data deletion and workspace deletion include the new facts, timelines and connection signals. Disconnecting an account clears its health signals and pauses its campaigns; it retains campaign history as before.

## Performance and verification

The health and analytics endpoints query local database evidence. They do not fan out into remote Meta checks or poll continuously. Reports use a tenant/date index, and ingestion batches milestone writes with activity creation. Webhook observation only records recognized connected accounts after signature verification.

Live acceptance still requires a controlled production comment and button test after deployment. Existing dependency advisories in SECURITY.md remain separate from this feature.
