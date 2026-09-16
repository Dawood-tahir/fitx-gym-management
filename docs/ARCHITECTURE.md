# FITX architecture

This document records the implementation decisions used to turn the product specification into one coherent system. It is intentionally explicit where the source brief allowed more than one interpretation.

## System context

FITX is a single-gym application. One deployment owns one gym profile, one currency/timezone configuration, and one set of users and business records. Domain rows therefore do not carry a tenant ID.

This keeps authorization and financial aggregation simple for the stated use case. Supporting multiple gyms in one deployment would be a separate migration: introduce a `Gym` aggregate, add `GymId` to every tenant-owned row and unique index, include the gym claim in tokens, and apply a mandatory global query filter. Adding tenants only at the UI layer would be unsafe.

~~~mermaid
flowchart LR
    Browser["Next.js web<br/>English / Urdu, LTR / RTL"] -->|HTTPS + JWT| API["ASP.NET Core REST API"]
    API --> Auth["Authentication and RBAC"]
    API --> Domain["Application/domain services"]
    Domain --> EF["EF Core repositories"]
    EF --> SQL["SQL Server"]
    Worker["Reminder background worker"] --> Domain
    Domain --> Providers["Email / SMS / WhatsApp adapters"]
    Providers --> Mock["Mock adapter in Development"]
    Providers --> Live["Configured live providers"]
~~~

Only the API talks to SQL Server. The browser never receives a database credential or provider secret. The web app treats API authorization failures as authoritative even when an action was hidden by its local role-aware UI.

## Deployment units

- `frontend/`: responsive Next.js application, charts, forms, localization, and REST client.
- `backend/FITX.API/`: modular ASP.NET Core API containing transport, application services, domain entities, persistence, authorization, reporting, exports, and background processing.
- SQL Server: durable system of record.
- Provider adapters: replaceable email/SMS/WhatsApp integrations. They are not required for local operation.

The initial backend is a modular monolith rather than distributed services. Membership renewal, payment recording, notifications, and audit data need shared transactions; splitting them prematurely would add failure modes without providing value at the expected gym scale.

## Backend boundaries

The dependency direction is:

1. Controllers authenticate, authorize, parse DTOs, call a service, and select an HTTP response.
2. Application services implement use cases and transaction boundaries.
3. Domain entities and policies implement calculations and state invariants.
4. Repositories/data access compose indexed EF Core queries and projections.
5. Middleware handles correlation IDs, exceptions, localization, security headers, and request logging.
6. Hosted workers claim due reminder jobs through the same application services.

Controllers must not calculate expiry, balances, profit, or permissions. The same rules must serve dashboards, details, exports, and reminder jobs so figures cannot drift between screens.

## Domain model

| Aggregate/data set | Responsibility |
| --- | --- |
| Users, refresh/reset tokens | Staff identity, role, status, locale, sessions, recovery |
| Members | Person/contact details and lifecycle; deletion is soft |
| Membership plans | Name, duration in days, price, description, active/system flags |
| Memberships | A priced membership term with start/expiry dates and payment relationship |
| Membership renewals | Immutable link from prior term to new term, actor, date, and initial payment |
| Payments | Non-voided money received against a membership, plus fee/balance snapshots |
| Payment methods | Configurable active lookup values |
| Expenses/categories | Dated outgoing transactions and configurable categories |
| Reminder settings/logs | Timing/channel/templates and immutable delivery attempts |
| Notifications | In-app owner/staff events and read state |
| Gym setting | The single gym profile, locale, timezone, currency, warning window, thresholds |
| Audit logs | Actor, action, entity, time, IP, and redacted old/new snapshots |

All primary business keys are GUIDs. Human-facing member, payment, expense, and receipt numbers are separate unique, indexed identifiers. Timestamps use UTC `DateTimeOffset`; membership dates use `DateOnly`.

Database indexes should cover normalized email and member code, normalized phone where search requires it, membership expiry/current state, payment date/member/membership, expense date/category, notification user/read state, and reminder due/log idempotency keys. Dashboard and report queries project aggregates in SQL and never load whole tables into memory.

## Date and membership semantics

The configured gym timezone, default `Asia/Karachi`, defines “today,” month boundaries, reminder due dates, and report presets. UTC remains the storage format for instants.

Plans store a positive `DurationDays`. The API calculates:

~~~text
ExpiryDate = StartDate + DurationDays - 1 day
~~~

The expiry date is the displayed “expires on” date and remains valid through that local calendar date. Clients may preview it, but the API recalculates it from the selected active plan and start date.

Membership state is derived for a supplied local `today` and warning window:

~~~text
Expired       when ExpiryDate < today
ExpiringSoon  when today <= ExpiryDate <= today + ExpiringSoonDays
Active        when ExpiryDate > today + ExpiringSoonDays
~~~

The default warning window is seven days and can be changed in Gym Settings. These three chart categories are mutually exclusive. Consequently, the dashboard Active Members KPI excludes Expiring Soon; a “currently valid” total may combine both if a screen needs it. No editable status column is stored.

Only one membership term is current for a member. Historical terms remain queryable. Deactivating a plan prevents new selection but never changes an existing membership or renewal history.

## Renewal semantics

Renewal is one API transaction:

1. Lock/read the member's current term and selected active plan.
2. Set the new start date to the later of the day after the current expiry date and the renewal date. An early renewal therefore preserves all remaining inclusive days without overlap; a late renewal starts on the renewal date.
3. Create a new membership term with the server-calculated expiry and fee snapshot.
4. Mark the prior term historical and create an immutable renewal link.
5. Create the required initial payment record, including a zero-paid Unpaid record when no money is collected.
6. Add a Membership Renewed notification and audit record.
7. Commit all changes together.

A failure rolls back every step. Renewal never updates or replaces a historic payment. Repeating a submitted request with the same idempotency key returns the first successful result rather than creating a second term.

## Payment and accounting semantics

The membership term owns the fee obligation:

~~~text
PayableAmount = max(TotalFee - Discount, 0)
AmountPaid    = sum(AmountPaid for non-voided payment records)
Balance       = max(PayableAmount - AmountPaid, 0)
~~~

The API accepts decimal PKR values with two fractional digits, rejects negative values, rejects a discount above the fee, and rejects an amount received above the current balance. It recalculates totals under a transaction rather than trusting calculated browser fields.

Each payment row records the amount received and snapshots the total fee, discount, payable amount, and balance after the transaction. This supports installment history and reproducible receipts. A zero-amount payment is allowed only when a membership or renewal creates its initial Unpaid state; ordinary “record payment” requests must collect a positive amount.

Status is derived:

~~~text
Paid     when Balance = 0
Partial  when AmountPaid > 0 and Balance > 0
Unpaid   when AmountPaid = 0
~~~

The displayed membership payment status is based on the aggregate non-voided amount, not merely the latest row. Corrections use void-and-replace with an audit record; financial payments are never physically deleted. Receipt numbers remain reserved after voiding.

Revenue is the sum of non-voided cash amounts whose `PaymentDate` is in the selected local-time range. Outstanding amount is the sum of current membership balances. Expenses are recognized by their expense date. Net profit is:

~~~text
Net Profit = Collected Revenue - Expenses
~~~

The Unpaid Fees KPI is a membership count where balance is positive; its tooltip/supporting text shows the total outstanding amount. Reports distinguish billed/payable value from collected revenue.

## Expense semantics

Expenses require a positive amount, date, active category, active payment method, description, and actor. Edits write old/new audit snapshots. Deletion is soft so historic reports and investigations remain explainable; normal views omit deleted rows while privileged audit views may include them.

The high-expense notification threshold belongs to Gym Settings, with a development default of PKR 50,000. Crossing it on create—not on every subsequent read—generates one notification.

## Dashboard and reports

Dashboard and report services share the same date-range and accounting utilities. Presets are resolved in the gym timezone and represented as a half-open interval `[start, end)` when querying instants.

- Monthly revenue: non-voided received amounts grouped by local month.
- Monthly expenses: non-deleted expenses grouped by local month.
- Profit: revenue minus expenses for identical buckets.
- Membership charts: derived state of the current membership term.
- New members: member creation/join date grouped by local month.
- Plan distribution: current memberships grouped by plan.

Pagination and filters run in SQL. CSV/Excel/PDF exports repeat the applied filters and include generation time. Large exports should be capped or moved to a background export job rather than holding an HTTP request indefinitely.

## Authentication and session security

- Passwords are BCrypt hashes; password hashes are never returned, logged, or placed in audit snapshots.
- Access tokens are short-lived and include user ID, role, issuer, audience, token ID, and expiry.
- Refresh tokens are random opaque values; only hashes are stored. Refresh rotates the token and detects reuse. Logout revokes the active token, while password reset, account disable, or role change revokes all sessions.
- Password reset uses a single-use, hashed, expiring token. The response to forgot-password is identical whether the email exists.
- Disabled users cannot log in or refresh.
- Authorization policies execute in the API for every operation.
- Login, refresh, recovery, exports, global search, and manual reminder sends are rate-limited.
- Financial and staff mutations use audit records and database transactions.
- Validation uses allowlists for sortable fields and parameterized EF queries. Output is encoded by the UI.

Secrets come from environment variables or a production secret store. They never use a `NEXT_PUBLIC_` name, source control, application logs, or container image layer.

## RBAC

| Domain | Owner | Admin | Staff |
| --- | --- | --- | --- |
| Own profile/session | Manage | Manage | Manage |
| Operational dashboard | All financial/member data | All operational financial/member data | Member/payment-only summary |
| Members and membership renewal | Manage | Manage | Manage |
| Payments and receipts | Manage | Manage | Manage |
| Expenses | Manage | Manage | Denied |
| Reminders and reports | Manage | Manage | Denied |
| Gym financial configuration | Manage | Denied | Denied |
| Plans, methods, categories | Manage | Denied | Denied |
| Staff accounts/roles/security | Manage | Denied | Denied |
| Audit records | View | Denied unless explicitly delegated | Denied |

“Manage” includes reads needed for the workflow. Staff cannot infer restricted expense/profit data through dashboard or report aggregation endpoints.

## Localization, currency, and personal data

English (`en`) is the default LTR locale. Urdu (`ur`) uses an RTL document direction and mirrored directional layout. Every system-authored label, validation error, notification, report heading, and reminder template uses structured locale resources. Names, IDs, phone numbers, email, and entered monetary values are not translated.

API error codes are stable; clients localize known codes. The server may use `Accept-Language` for generated artifacts and outbound reminders. Unicode is stored end to end, including proper `اردو` text rather than mojibake.

Currency is stored as `decimal(18,2)` plus the gym's ISO `PKR` setting. UI/export formatters produce `Rs.` or `₨` safely. Never use binary floating point for money.

CNIC/national ID is optional, access-controlled, omitted from broad search/results where unnecessary, and redacted in telemetry and audit payloads. Production deployments should use SQL encryption at rest and encrypted backups.

## Reminder execution and mock behavior

A scheduled worker evaluates enabled reminder rules at a fixed local time. Rules cover membership expiring/expired and payment due/overdue offsets. It renders only supported variables:

- `{name}`
- `{membership}`
- `{expiryDate}`
- `{amount}`
- `{balance}`

The uniqueness key combines member, membership/payment obligation, reminder setting, channel, and due date. The worker claims that key before calling a provider, which makes retries and multiple API replicas safe.

Provider modes:

- `Mock`: render and validate the message, create a log with status `Mocked`, and make no network call. The UI explicitly says Mocked.
- Live configured adapter: record Pending, call the provider once per claimed attempt, then record Sent or Failed with a sanitized provider response.
- Missing/disabled provider: record Skipped or a configuration failure. Never show Sent.

Phone/email absence also results in Skipped. Provider callbacks may later update delivery metadata, but “accepted by provider” must not be described as handset delivery unless the provider confirms it.

## Notifications

Notifications are persisted events, not transient toasts. Expiry, unpaid fee, payment received, high expense, and renewal events use deterministic event keys to avoid duplicates. Read and mark-all-read updates are scoped to the authenticated user. A toast may mirror a successful action, but it does not replace the notification record.

## Demo-data separation

Reference lookup seeds are idempotent and environment-neutral. Demo people and financial activity are strictly Development-only and additionally require `Seed__DemoData=true`. The public local owner credential requires Development plus `Seed__DevelopmentAdmin=true`.

Production startup refuses or ignores development seeds even if a switch is accidentally supplied. Production deployment documentation sets both flags false. The development password is hashed at seed time; plaintext exists only in public local setup documentation.

## Reliability and concurrency

- Membership renewal and payment recording use serializable-enough transaction boundaries or row-version checks so two requests cannot overspend the same balance or create two current terms.
- Create-payment and renewal accept an `Idempotency-Key`.
- Unique database constraints protect normalized emails, member/payment numbers, current-term invariants where supported, and reminder claims.
- Central exception handling maps validation, forbidden, conflict, not-found, throttled, and unexpected failures to consistent API envelopes and correlation IDs.
- Health endpoints distinguish liveness from SQL/provider readiness. External reminder providers should not make the core API unready.

## Production topology

The web and API are stateless and can scale horizontally. SQL Server, export/logo object storage, refresh token state, reminder claims, and audit logs are durable. Only one logical reminder attempt may own a due key; use SQL locking or a distributed scheduler.

The local Compose stack exposes all three services for developer convenience. Production should expose only HTTPS ingress, use managed secrets and SQL, disable demo seeds/automatic replica migrations, execute migrations as a release job, and centralize logs/metrics/traces with personal-data redaction.
