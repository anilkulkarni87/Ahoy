# Product Specification: Comment-to-DM Automation

*Version 2. Revised for an open-source launch with a paid setup service and a hosted cloud held back as "coming soon." Product name is a placeholder ("Ahoy") until trademark checks are done.*

---

## 1. Summary

Ahoy is an open-source tool that sends an Instagram DM when someone comments a keyword on a post or reel. It uses Meta's official private replies API. It runs entirely on serverless infrastructure, so there is no always-on worker and no Redis to babysit.

It is offered in three ways:

| Offer | Who it is for | Price | Status |
| :-- | :-- | :-- | :-- |
| **Self-Hosted** | Developers and technical creators | Free, forever | Launch |
| **Done-For-You Setup** | Creators and small businesses who want it working without touching Meta's developer console | One-time fee, no subscription | Launch |
| **Hosted Cloud** | Anyone who wants a login button and nothing else | To be announced | Coming soon (waitlist only) |

The hosted cloud is built into the architecture from day one but locked behind a feature flag until Meta approves the platform app. Nothing about the free version depends on it.

## 2. Goals, Non-Goals and Success Measures

### Goals

- A self-hoster reaches a working comment-to-DM flow in under 15 minutes of their own time, after the Meta app is created.
- The Meta app setup, which is the hardest step, is made as painless as possible through documentation, a diagnostic script and a paid setup service.
- The open-source project is valuable on its own and is not a crippled demo of a paid product.
- The architecture can become multi-tenant without a rewrite.

### Non-Goals (v1)

- No browser automation, scraping or password-based login. Official API only.
- No bulk or cold messaging. Every DM is a reply to a comment the user chose to make.
- No drag-and-drop node builder. A linear form-based builder ships first.
- No conversational AI in DMs.
- No billing, team invites or SSO in the open-source build.
- No promise of ban protection. Platform risk is disclosed, not denied.

### Success Measures

| Measure | Target for first 90 days |
| :-- | :-- |
| Time from repo clone to first test DM | Median under 30 minutes including Meta setup |
| GitHub stars | A signal of reach, not a goal in itself |
| Setup service orders | Enough to validate demand and fund Meta verification |
| Waitlist signups | Demand evidence for the hosted cloud and for Meta's review |
| Failed DM rate caused by our bugs | Under 1 percent of attempted sends |

## 3. Audiences

**Developers and agencies.** Judge the project in the first 15 minutes. Want clean code, honest docs and a one-click deploy.

**Creators and small businesses.** Want their link to reach every person who asks for it. Do not want to read about webhooks. They are served by the Done-For-You Setup and, later, the hosted cloud.

The website speaks to the second group warmly and plainly. The repository speaks to the first.

## 4. Product Scope

### 4.1 v1 (open-source launch)

- Connect one or more Instagram professional accounts through Instagram Login.
- Create a campaign through a simple form: choose a post (or all posts), choose keywords, write the DM and an optional public reply.
- Keyword matching with exact, contains and ignore-case options.
- Personalisation tokens such as the commenter's username.
- Tracked links with click counts, with link-preview bots and prefetchers filtered out.
- Activity log showing every comment as queued, matched, sent, skipped, failed or rate-limited, with a reason.
- Opt-out handling and a per-account send limit that respects Meta's documented cap, with overflow delayed rather than dropped.
- A diagnostics page and CLI command that checks environment variables, webhook verification, token validity and permissions.
- Email magic-link sign-in.
- Demo mode that works without a real Instagram account.

### 4.2 The follow gate, redesigned

Instagram private replies are limited to one message per comment. Further messages generally require the person to reply first, which opens a messaging window. The original idea of waiting a few minutes and then checking follow status does not fit that rule.

The v1 design is a **tap-to-confirm flow**:

1. The first DM says what they will get and includes a button such as "I'm following, send it."
2. Their tap opens the messaging window.
3. The follow state is checked, and the link is sent or a friendly reminder is shown.

The current Meta rules must be verified before this ships.

### 4.3 v2

- Optional AI intent matching, bring-your-own-key, as a fallback after keyword matching.
- Lead capture with a dedicated leads table and CSV export.
- Multiple campaign steps.
- Analytics dashboard with daily rollups.

### 4.4 v3 (hosted cloud)

- Multi-workspace teams, billing and managed infrastructure, only after Meta approval.

## 5. Architecture

```
Meta Graph API
      |  webhook event
      v
Edge webhook route  --verify HMAC, return 200 fast-->  Inngest
                                                          |
                         +--------------------------------+
                         v                                v
                 Turso (libSQL)                 Optional AI router
                 tenant-scoped data             (enum output only)
```

### 5.1 Webhook handler

A Next.js route verifies Meta's signature, stores an idempotency key for the event and hands the event to Inngest. It returns a 200 response immediately. It contains no business logic.

### 5.2 Workflow engine

Inngest runs matching, rate limiting, sending and retries as durable steps. Failed sends go to a dead-letter state that is visible in the dashboard and retryable by the user.

### 5.3 Reconciliation

Meta does not always deliver every comment by webhook. A scheduled job sweeps recent comments on active campaigns and catches anything missed. Scheduling limits on free hosting tiers must be checked, and an Inngest scheduled function is the preferred route.

### 5.4 Storage

Turso with the libSQL driver. Prisma is configured with the SQLite provider and the libSQL driver adapter. Compatibility with the edge runtime must be confirmed before launch.

### 5.5 Tenancy

Every table carries a tenant key, and every query goes through one data-access layer that requires it. SQLite has no row-level security, so isolation is enforced in code and covered by tests. In the self-hosted build there is one organisation.

## 6. Data Model

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

model Organization {
  id         String      @id @default(uuid())
  name       String
  createdAt  DateTime    @default(now())
  users      User[]
  workspaces Workspace[]
}

model User {
  id             String       @id @default(uuid())
  email          String       @unique
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdAt      DateTime     @default(now())
}

model Workspace {
  id                 String       @id @default(uuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id])
  instagramAccountId String?      @unique
  encryptedToken     String?      // AES-256-GCM, key from environment
  tokenExpiresAt     DateTime?    // drives scheduled token refresh
  campaigns          Campaign[]
  leads              Lead[]
  optOuts            OptOut[]
}

model Campaign {
  id            String         @id @default(uuid())
  workspaceId   String
  workspace     Workspace      @relation(fields: [workspaceId], references: [id])
  name          String
  triggerType   String         // SPECIFIC_POST | ANY_POST
  mediaId       String?
  matchMode     String         // EXACT | CONTAINS
  keywords      String         // JSON array
  dmTemplate    String
  publicReply   String?
  requireFollow Boolean        @default(false)
  isActive      Boolean        @default(true)
  conversations Conversation[]
  createdAt     DateTime       @default(now())
}

model Conversation {
  id            String   @id @default(uuid())
  workspaceId   String
  campaignId    String
  campaign      Campaign @relation(fields: [campaignId], references: [id])
  instagramUser String
  commentId     String
  status        String   // QUEUED | SENT | SKIPPED | FAILED | RATE_LIMITED
  reason        String?
  createdAt     DateTime @default(now())

  @@unique([commentId, campaignId])
  @@index([workspaceId, createdAt])
}

model Lead {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  campaignId  String
  email       String?
  fields      String?   // JSON
  createdAt   DateTime  @default(now())
  // Leads are never purged by the log cleanup. Export and deletion are user actions.
}

model OptOut {
  id            String    @id @default(uuid())
  workspaceId   String
  workspace     Workspace @relation(fields: [workspaceId], references: [id])
  instagramUser String
  createdAt     DateTime  @default(now())

  @@unique([workspaceId, instagramUser])
}

model DailyStats {
  id          String @id @default(uuid())
  workspaceId String
  campaignId  String
  date        String // YYYY-MM-DD, UTC
  comments    Int    @default(0)
  dms         Int    @default(0)
  clicks      Int    @default(0)

  @@unique([workspaceId, campaignId, date])
}

model WaitlistEntry {
  id        String   @id @default(uuid())
  email     String   @unique
  useCase   String?
  createdAt DateTime @default(now())
}
```

Changes from version 1: the comment key is unique per campaign, leads have their own table, token expiry is tracked, opt-outs exist, and daily stats are keyed by workspace so the rollup job can actually map to them.

## 7. Data Retention

A scheduled job runs daily.

- Raw event logs and conversation records older than 30 days are rolled into daily stats, then deleted. This covers sent and failed records.
- The rollup uses whole UTC days and runs inside a transaction, so re-running it cannot double count.
- Leads are exempt. They are retained until the owner exports or deletes them.
- A data-deletion callback endpoint is provided, as Meta requires.

## 8. AI Layer (optional, v2)

- Off by default. Bring your own key. The model name is configuration, not code.
- Keyword matching always runs first. The model runs only when no keyword matches.
- Comments are untrusted input. The model may only return a campaign id or "none" from a fixed list, never free text or actions.
- No conversational objection handling in DMs in v1 or v2.

## 9. Business Model

### 9.1 Self-Hosted (free)

The full engine, with no feature limits and no tiers. Community support on GitHub.

### 9.2 Done-For-You Setup (one-time)

We configure everything on the **customer's own accounts**:

- Create and configure their Meta developer app and webhooks.
- Deploy to their Vercel, Turso and Inngest accounts.
- Build and test their first campaign live with them.
- Walk them through it, with seven days of support.

Rules for this service:

- Deploy on the customer's accounts, never ours. This avoids hosting costs, hosting-terms problems and holding their tokens.
- Promise "one-time setup, no subscription," not "lifetime." Meta changes its API, so ongoing maintenance is a separate optional add-on.
- Price for real time. Setup takes one to two hours until the process is automated, so the launch price should reflect that and drop as tooling improves.
- A short written agreement covers access, data handling and exclusions such as policy changes and account actions by Meta.
- The exact flow, including role and tester assignment in development mode, is tested end to end before taking payment.

### 9.3 Hosted Cloud (coming soon)

The SaaS path is built but disabled.

- A feature flag (`SAAS_ENABLED=false`) sends hosted sign-up, billing and platform-app login to a coming-soon page.
- The page offers a waitlist. Entries store email and use case.
- No prices are published until Meta approval is real.
- Self-hosters are unaffected by the flag.

### 9.4 Licence

The licence is chosen before the first public commit. MIT allows anyone to host a competing service. AGPL or a source-available licence such as FSL protects a future hosted offering, with a trade-off in corporate adoption. The reasoning is stated in the README. A contributor agreement (CLA or DCO) is set up before outside pull requests are accepted.

## 10. Meta Platform Plan

- Start business verification, the privacy policy, the data-deletion callback and the review screencast early, for the narrowest permission set the v1 feature list needs.
- Tech Provider status and App Review can take weeks to months and can be rejected. The hosted cloud is treated as unproven until approval.
- Development mode with assigned roles is the working assumption for self-hosters and setup customers. It is verified end to end before claims are made.
- A public "Meta review" page documents the use case, permissions and policies.

## 11. Trust, Safety and Security

- Opt-out keywords are honoured, and opted-out users are never messaged again.
- Webhook processing is idempotent. Sends back off when Meta rate limits apply.
- Access tokens are encrypted at rest. Key management and rotation are documented. Long-lived tokens are refreshed on a schedule.
- A SECURITY.md describes how to report issues.
- The README includes a plain section on Meta's messaging policies and account risk. The project does not claim that accounts cannot be restricted.
- Click tracking filters known link-preview bots and prefetchers.

## 12. Website Requirements

The site is the first impression for the creator audience, so it is designed to feel welcoming, calm and clear.

**Tone.** Warm, plain language. It speaks to one person ("you") and avoids jargon on the main page. Technical detail lives in the docs.

**Visual direction.** Editorial and quiet rather than a typical tech template: a warm off-white background, a serif display face paired with a clean sans-serif, generous whitespace, one restrained accent colour, and no glowing gradients, floating icon grids or stock mockups.

**Content.**

1. Hero with a small animated example of a comment turning into a DM.
2. Three-step explanation: connect, write, relax.
3. What is included, written as benefits.
4. Two pricing cards (Self-Hosted and Done-For-You Setup), with a quiet "Hosted Cloud, coming soon" note and waitlist form beneath them.
5. Honest FAQ covering what you need, how setup works, and Meta's rules.
6. Footer with docs, GitHub, privacy, terms and data deletion.

**Content rules.**

- No invented testimonials and no quotes attributed to real people. Use real beta users once they exist.
- No claims such as "no bans" or "lifetime."
- The free option is always presented first and without apology.
- Accessible by default: strong contrast, visible focus states, reduced-motion support.

## 13. Launch Checklist

1. A 60 to 90 second demo showing a comment triggering a DM.
2. One-click deploy and a quickstart under 15 minutes.
3. Demo mode and seed data.
4. Tests for signature verification, retries and idempotency.
5. Meta setup guide with screenshots, plus the diagnostics command.
6. CONTRIBUTING.md, issue templates and a short public roadmap.
7. A "what this is not" section.
8. Legal pages: privacy, terms, data deletion.
9. The setup-service agreement and intake form.
10. The waitlist live and storing entries.

## 14. Phasing

| Phase | Scope |
| :-- | :-- |
| **1. Launch** | Open-source v1, linear builder, keyword matching, tracked links, diagnostics, docs, Done-For-You Setup, waitlist |
| **2. Grow** | Optional AI routing, lead capture and export, analytics dashboard, setup automation |
| **3. Hosted** | Meta approval, billing, teams, managed infrastructure, and flag removal |

## 15. Open Questions

- Final product name and trademark check.
- Licence choice.
- Setup service launch price and how many setups can be handled per week.
- Current Meta rules for the follow-confirmation flow and for development-mode access.
- Whether free-tier cron limits require moving the cleanup and reconciliation entirely into Inngest.
