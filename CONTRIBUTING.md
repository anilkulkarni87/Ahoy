# Contributing

This is a pre-launch implementation. The code is distributed under the MIT licence. Contributions are submitted under that licence. Do not include credentials, customer data or real access tokens. A DCO/CLA policy can be added before accepting outside contributions.

For local development use Node.js 22+, `npm install`, `npm run dev`, then `npm test` and `npm run build`. Keep API credentials in `.env.local`. Add tests for security-sensitive behavior, tenant isolation, idempotency and retries. Preserve the clear separation between demo data and real Instagram sends.

V1 priorities: real-account integration validation, full reconciliation pagination, stable-id opt-outs, complete data deletion, accessibility and deployment documentation. AI, billing, multi-user teams and hosted cloud belong to later phases.
