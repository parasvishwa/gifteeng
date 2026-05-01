# DPDP Act compliance — what's implemented & what's still on you

India's **Digital Personal Data Protection Act (2023)** mandates a set of customer
rights and operator obligations. This file tracks what's wired up in the codebase
vs. what still needs human action (legal review, policy text, regulator filings).

## ✅ Implemented in code

### Customer rights

| Right | Where | API endpoint |
|---|---|---|
| Know what we hold (Section 11) | Privacy page → "Download my data" | `POST /api/me/privacy/export` |
| Withdraw consent (Section 6) | Privacy page → consent toggles | `POST /api/me/privacy/consents` |
| Erasure (Section 12) | Privacy page → "Delete my account" | `POST /api/me/privacy/delete-account` |
| Cancel pending erasure | Privacy page (during 30-day grace) | `DELETE /api/me/privacy/delete-account` |
| Granular consent (Section 6.4) | Cookie banner on first visit + privacy page | 4 categories: essential / analytics / marketing / ai_personalization |

### Audit trail

- Every consent change creates a NEW `ConsentRecord` row — we never
  mutate or delete prior records.
- Every state transition logs to `audit_log` with timestamp, actor,
  IP address, user agent.
- Erasure event records what was anonymized, by whom, when, in
  `audit_log` with action `customer.anonymized`.

### Erasure semantics — anonymization, not hard-delete

We **anonymize** rather than hard-delete because Indian tax law (CGST
+ Income Tax Act) requires order records to be kept for **6-7 years**.
The trade-off:

- **Anonymized:** Customer.{fullName, email, phone, avatarUrl, googleId},
  SavedAddress.*, CustomerPhoto.fileUrl, Order.{shippingAddress,
  billingAddress, notes}, Wishlist (deleted), DeviceToken (deleted),
  GiftReminder (deleted), Review.reviewerName ("Anonymous Gifteengster")
- **Kept:** Order rows + items (with redacted addresses), CoinTransaction
  history (financial reconciliation), audit logs, ConsentRecord rows
  themselves (regulator audit trail)

After anonymization the customer row remains — `dpdpAnonymizedAt` is
stamped — but it can never be linked back to a person.

### Cron processing

- Daily sweep (cluster-leader-only) processes all customers whose
  `dataDeletionScheduledFor < now` and `dpdpAnonymizedAt IS NULL`.
- Idempotent: anonymized rows don't re-qualify.
- 30-day default grace; configurable per-request via the
  `graceDays` body field (max 90).

### Cookie consent banner

- Shows on first visit until any choice is made.
- Three buttons: **Reject all** / **Customize** / **Accept all**.
- Decision stored in `localStorage["gifteeng.cookieConsent"]`.
- When the user is logged in, the choice is **also** mirrored to
  the server via `/api/me/privacy/consents` so the audit trail
  doesn't depend on the browser.
- `MarketingScripts` (GTM / GA4 / Meta Pixel) reads the same
  storage key on first paint — a "reject all" choice prevents
  any third-party tag from loading.

## ⚠️ Still needs human action

### Policy text (Privacy / Terms / Refund / Shipping)

The pages exist at `/b2c/privacy`, `/b2c/terms`, `/b2c/shipping`,
`/b2c/refund-policy`, but the prose needs to be reviewed by a
practising lawyer in India for DPDP-compliance specifics:

- Named **Data Protection Officer** (or grievance officer) with
  email + postal address (DPDP Section 10).
- List of every **third-party processor** we share data with
  (Razorpay, MSG91, Anthropic, OpenAI, Google for Sign-in, FCM).
- **Cross-border transfers**: OpenAI / Anthropic process some
  customer text in the US. Disclose this.
- **Data retention schedules** per category (we keep orders 7 yrs,
  consents indefinitely for audit, marketing engagements 2 yrs, etc.).
- **Children's data** clause (we don't intentionally collect from
  under-18s; gift platforms get used by minors anyway).

### Grievance officer

DPDP requires a named officer reachable via a clearly-displayed
contact channel. Currently we route to `privacy@gifteeng.com`
(referenced from the privacy page footer). Ensure this inbox is
actually monitored AND a designated person at Gifteeng owns it.

### Data breach notification

DPDP Section 8(6) requires breach notification to both:

- The Data Protection Board of India ("Board")
- Affected data principals

We have no incident-response runbook for this. Recommended:

1. Sentry alerts for unusual error spikes (already wired, awaiting
   DSN — see `docs/SENTRY-SETUP.md`).
2. Manual runbook: `docs/INCIDENT-RESPONSE.md` (TODO).
3. Pre-drafted breach notification email template.

### Annual privacy audit

For "Significant Data Fiduciaries" (large operators) the Act
requires annual independent audits. Once you cross ~50,000 active
users you may fall in scope — engage a CERT-In empanelled auditor.

### Children's consent

If you actively market to minors, DPDP requires verifiable parental
consent. Today we don't gate by age. If you ever want to allow
under-18 gifting, design the parental-consent flow first.

## How to test the flow

```bash
# Customer side
curl -X POST https://new-api.gifteeng.com/api/me/privacy/consents \
  -H "Authorization: Bearer $B2C_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"marketing","granted":false}'

# Get the snapshot
curl https://new-api.gifteeng.com/api/me/privacy/consents \
  -H "Authorization: Bearer $B2C_TOKEN"

# Export everything we hold
curl -X POST https://new-api.gifteeng.com/api/me/privacy/export \
  -H "Authorization: Bearer $B2C_TOKEN" \
  -H "Content-Type: application/json" -d '{}'

# Schedule deletion (30-day grace)
curl -X POST https://new-api.gifteeng.com/api/me/privacy/delete-account \
  -H "Authorization: Bearer $B2C_TOKEN" \
  -H "Content-Type: application/json" -d '{}'

# Cancel before grace ends
curl -X DELETE https://new-api.gifteeng.com/api/me/privacy/delete-account \
  -H "Authorization: Bearer $B2C_TOKEN"

# Admin: view pending deletions (super_admin only)
curl https://new-api.gifteeng.com/api/admin/privacy/pending-deletions \
  -H "Authorization: Bearer $B2B_TOKEN"

# Admin: force-process a deletion immediately (override grace period)
curl -X POST https://new-api.gifteeng.com/api/admin/privacy/anonymize/<customerId> \
  -H "Authorization: Bearer $B2B_TOKEN"
```
