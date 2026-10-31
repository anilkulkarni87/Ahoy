# Security

Do not publish access tokens, encryption keys, database credentials or customer comment data in issues. Until a private reporting contact is configured, report sensitive findings directly to the operator of the installation through their existing private business contact. The project owner must publish a dedicated security contact before accepting external production deployments.

The real workspace requires email owner sign-in. Demo sessions cannot access owner accounts. Instagram tokens are encrypted with AES-256-GCM. Webhooks and data-deletion callbacks verify signatures. Requests that mutate state validate browser origins. Sign-in links expire after 15 minutes, are stored hashed and can be used once. Session tokens are random and stored hashed.

Keep a backup of the database and encryption key, use HTTPS, configure Inngest signing keys, rotate provider credentials when exposed, and validate the production integration before enabling live sending.

Known pre-launch limits are listed in README.md. No account-ban or exactly-once network delivery guarantee is made.
