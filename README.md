# FITX Gym Management

FITX is a bilingual gym-business management platform for members, memberships, renewals, fee collection, expenses, reminders, reporting, staff access, and financial analytics. It combines a premium dark fitness interface with a real REST API and relational database; core actions are persisted and never simulated in the browser.

> Scope intentionally excludes attendance tracking, trainer management, a member portal, and complaints/feedback.

## Product highlights

- Owner dashboard with live KPIs, revenue/expense/profit trends, membership and payment status charts, plan distribution, new-member trends, and recent activity.
- Searchable, sortable, filterable, paginated member, payment, expense, reminder, report, and staff experiences.
- Member onboarding, calculated membership expiry, profile and history, renewal workflow, and configurable membership plans.
- Partial and full payment support, outstanding balances, configurable payment methods, printable receipts, and PDF download.
- Expense entry with configurable categories and immediate financial reporting impact.
- Configurable expiry and payment reminders through email, SMS, and WhatsApp provider abstractions. Local development uses an honest mock provider.
- Revenue, expense, profit, collection, outstanding, expiry, membership, and new-member reports with PDF, CSV, and Excel exports.
- JWT authentication with refresh tokens, password reset, server-side role authorization, and audit trails for sensitive changes.
- English and Urdu UI and reminder templates; Urdu uses a complete RTL layout.
- Responsive desktop, tablet, and mobile layouts with accessible interactions, loading, empty, error, confirmation, and success states.

## Screenshots

Screenshots are intentionally left as a documentation placeholder until stable release builds are captured.

| Dashboard | Members | Mobile |
| --- | --- | --- |
| _Add dashboard screenshot_ | _Add member workflow screenshot_ | _Add mobile screenshot_ |

## Technology

| Layer | Technology |
| --- | --- |
| Web | Next.js 16, React 19, strict TypeScript, Tailwind CSS |
| UI and charts | Lucide, reusable component primitives, Recharts |
| Localization | Structured English/Urdu locale messages and RTL-aware layout |
| API | ASP.NET Core 9 REST API |
| Data | SQL Server 2022, Entity Framework Core 9 |
| Security | BCrypt password hashing, JWT access and refresh tokens, role/policy authorization |
| Containers | Docker Compose, root-owned frontend and backend Dockerfiles |

See [Architecture](docs/ARCHITECTURE.md) for domain and security decisions and [API guide](docs/API.md) for endpoint conventions.

## Repository layout

~~~text
.
|-- frontend/                         Next.js application
|-- backend/FITX.API/                 ASP.NET Core API and EF Core model
|-- docs/
|   |-- ARCHITECTURE.md
|   `-- API.md
|-- .env.example                      Compose/runtime configuration template
|-- appsettings.Development.json.example
|-- docker-compose.yml                Local integrated stack
|-- docker-compose.dev.yml            Optional hot-reload overlay
|-- Dockerfile.frontend
|-- Dockerfile.backend
`-- README.md
~~~

## Prerequisites

Choose either the container workflow or native application workflow.

Container workflow:

- Docker Engine/Desktop with Compose v2.
- At least 4 GB of memory available to Docker; SQL Server is the largest consumer.

Native workflow:

- Node.js 22 and npm.
- .NET 9 SDK.
- SQL Server 2022 Developer/Express, or the SQL Server Compose service.
- EF Core CLI when running migrations manually:

~~~bash
dotnet tool install --global dotnet-ef --version 9.*
~~~

## Quick start with Docker

1. Create local configuration:

   PowerShell:

   ~~~powershell
   Copy-Item .env.example .env
   ~~~

   Bash:

   ~~~bash
   cp .env.example .env
   ~~~

2. Replace at minimum `SQLSERVER_SA_PASSWORD` and `JWT_SECRET` in `.env`. A JWT secret should contain at least 32 cryptographically random bytes. For example:

   ~~~bash
   openssl rand -base64 48
   ~~~

3. Build and start the complete stack:

   ~~~bash
   docker compose up --build
   ~~~

4. Open:

   - Web application: http://localhost:3000
   - API: http://localhost:8080
   - OpenAPI/Swagger in Development: http://localhost:8080/swagger
   - SQL Server: `localhost,1433`

The local Compose profile waits for SQL Server readiness before starting the API. With `APPLY_MIGRATIONS=true`, the Development API is expected to apply pending EF migrations before accepting traffic.

Stop containers with `docker compose down`. This retains the named SQL volume. To intentionally remove local database data, use `docker compose down --volumes`; this is destructive and cannot be undone unless the volume was backed up.

### Hot-reload containers

Use the opt-in development overlay:

~~~bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
~~~

It bind-mounts `frontend/` and `backend/`, runs Next.js development mode, and runs `dotnet watch`. The standard Compose file instead builds production-style application images while retaining Development configuration for local seed data and diagnostics.

## Native development

### Database

Start only SQL Server if no native instance is available:

~~~bash
docker compose up -d sqlserver
~~~

Copy `appsettings.Development.json.example` to `backend/FITX.API/appsettings.Development.json`, then replace its example secrets. The destination is ignored by Git. Environment variables override JSON settings; nested ASP.NET Core keys use double underscores, for example `Jwt__Secret`.

### Backend

~~~bash
dotnet restore backend/FITX.API/FITX.API.csproj
dotnet ef database update --project backend/FITX.API --startup-project backend/FITX.API
dotnet run --project backend/FITX.API
~~~

Set the API URL through `ASPNETCORE_URLS` if it is not exposed at http://localhost:8080. Swagger is enabled only for Development.

### Frontend

~~~bash
cd frontend
npm install
npm run dev
~~~

Set `NEXT_PUBLIC_API_URL=http://localhost:8080/api` before starting Next.js. Values prefixed with `NEXT_PUBLIC_` are exposed to the browser and must never contain secrets.

Useful checks:

~~~bash
npm run typecheck
npm run lint
npm run build
dotnet build backend/FITX.API/FITX.API.csproj --configuration Release
~~~

## Environment configuration

The checked-in `.env.example` is documentation, not a secret store. Copy it to the ignored `.env` for Compose.

| Variable | Purpose | Local default |
| --- | --- | --- |
| `FRONTEND_PORT` / `API_PORT` | Host ports | `3000` / `8080` |
| `SQLSERVER_DATABASE` / `SQLSERVER_PORT` | Database name and host port | `FITX` / `1433` |
| `SQLSERVER_SA_PASSWORD` | Local SQL administrator password | Must be changed |
| `NEXT_PUBLIC_API_URL` | Browser-visible API base URL | `http://localhost:8080/api` |
| `INTERNAL_API_BASE_URL` | API URL for container-side rendering | `http://api:8080/api` |
| `JWT_SECRET` | Access/refresh token signing secret | Must be changed |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Token validation boundaries | `FITX.API` / `FITX.Web` |
| `JWT_ACCESS_TOKEN_MINUTES` | Short-lived access token duration | `15` |
| `JWT_REFRESH_TOKEN_DAYS` | Refresh-token lifetime | `7` |
| `JWT_REMEMBER_ME_REFRESH_TOKEN_DAYS` | Extended local session lifetime | `30` |
| `CORS_ALLOWED_ORIGIN` | Browser origin accepted by the API | `http://localhost:3000` |
| `APPLY_MIGRATIONS` | Development startup migration switch | `true` |
| `SEED_DEMO_DATA` | Development-only sample business data | `true` |
| `SEED_DEVELOPMENT_ADMIN` | Development-only owner account | `true` |
| `REMINDER_PROVIDER_MODE` | `Mock` or configured production providers | `Mock` |
| `GYM_DEFAULT_CURRENCY` | ISO currency code | `PKR` |
| `GYM_DEFAULT_TIMEZONE` | IANA business timezone | `Asia/Karachi` |

Email, SMS, and WhatsApp keys in the example are intentionally empty. Do not enable a live provider until credentials, sender identity, consent requirements, and delivery callbacks are configured.

## Database migrations and seed data

EF migrations are the source of truth for schema changes. Create a migration after changing mapped entities:

~~~bash
dotnet ef migrations add DescriptiveName --project backend/FITX.API --startup-project backend/FITX.API
dotnet ef database update --project backend/FITX.API --startup-project backend/FITX.API
~~~

For production, do not let every API replica race to migrate. Set `APPLY_MIGRATIONS=false` and run `dotnet ef database update` once from a controlled release job with a backup and rollback plan.

Seed policy:

- Reference seeds are idempotent and safe across environments: roles/policies, Monthly, 3 Months, 6 Months and Yearly plans, standard expense categories, and standard payment methods.
- Demo members, example transactions, reminder logs, and the development login are inserted only when the host environment is Development and the corresponding seed switches are true.
- Production must set `SEED_DEMO_DATA=false` and `SEED_DEVELOPMENT_ADMIN=false`.
- Seeds must never store a plaintext production password. The development password is hashed during startup.

Local development login:

- Email: `admin@fitx.local`
- Password: `Fitx@123`

These credentials are public development fixtures. Never deploy them.

## Business rules at a glance

- Membership state is derived from dates in the configured gym timezone. Expired means the expiry date has passed; Expiring Soon means it falls within the configured warning window; Active means it is beyond that window.
- A plan stores an explicit duration. Expiry is calculated by the API and is never trusted from an arbitrary client override.
- Renewal preserves the previous membership and payments, creates a renewal record and new membership term, records the initial payment state, then updates the current-term pointer atomically.
- Payable amount is `max(total fee - discount, 0)`. Paid, Partial, and Unpaid are derived from amount received and remaining balance. An API rejects negative money and overpayment.
- Revenue is cash collected during the selected range, not fees merely billed. Profit is collected revenue minus recorded expenses.
- Financial rows are not silently hard-deleted. Payments are voided and audited; expenses and members use controlled soft deletion where history must remain intact.
- PKR is stored as decimal values and formatted at presentation time as `Rs.` or `₨`; money is never stored as floating point.

Full semantics, including early and late renewal behavior, appear in [Architecture](docs/ARCHITECTURE.md).

## Roles and access

| Capability | Owner | Admin | Staff |
| --- | :---: | :---: | :---: |
| Dashboard | Full | Operational | Operational |
| Members and renewals | Yes | Yes | Yes |
| Record and view payments | Yes | Yes | Yes |
| Expenses | Yes | Yes | No |
| Reminders and reports | Yes | Yes | No |
| Membership/payment/category configuration | Yes | No | No |
| Staff, permissions, and security settings | Yes | No | No |

Frontend visibility is a convenience only. Every protected operation is authorized again by the API.

## Localization and RTL

English is the default LTR locale; Urdu is RTL. Navigation, dashboard labels, tables, forms, buttons, validation, toasts, notifications, reports, and settings are localized. Names, email addresses, phone numbers, IDs, and monetary values remain user data and are not translated. Locale choice is persisted locally and may also be saved to the authenticated user profile.

Use proper Unicode Urdu text such as `اردو`; do not copy mojibake-encoded source text. Dates and PKR values are formatted with locale-aware utilities while retaining unambiguous values in API payloads.

## Reminder providers

Local mode does not contact external services. A send request renders the selected English or Urdu template, validates variables, and records a `Mocked` reminder log. The UI must label it as mocked, never as delivered.

Live providers implement the same email/SMS/WhatsApp interface. Missing credentials produce a configuration failure or `Skipped` log, not a false success. Scheduled sends use a deterministic idempotency key so restarts cannot duplicate a reminder for the same member, rule, channel, and due date.

## Security guidance

- Keep access tokens short-lived and store only hashes of refresh and reset tokens.
- Rotate refresh tokens, revoke their token family on detected reuse, and revoke all sessions when a staff account is disabled or its password is reset.
- Apply rate limiting to login, refresh, forgot/reset-password, search, exports, and reminder-send endpoints.
- Validate DTOs server-side, use parameterized EF queries, restrict sorting to an allowlist, and encode untrusted content when rendered.
- Audit member deletion, payment edits/voids, expense edits/deletion, renewal, password reset, role/status changes, and financial configuration.
- Redact secrets, password hashes, full tokens, and unnecessary CNIC values from logs and audit snapshots.
- Use HTTPS, a strict production CORS allowlist, secure response headers, centralized exception handling, and generic authentication errors.
- Back up SQL Server, test restoration, and establish retention policies for audit logs, receipts, report exports, and reminder logs.

## Production deployment

The checked-in Compose setup is a local/development baseline, not a complete production platform. A production deployment should:

1. Build immutable frontend/API images in CI and scan dependencies and images.
2. Place them behind an HTTPS reverse proxy or managed ingress.
3. Use managed SQL Server or a protected SQL host with encrypted connections, backups, and no public administrator port.
4. inject secrets from a secret manager rather than `.env` or image layers.
5. Disable demo/admin seeds and automatic multi-replica migrations.
6. Run migrations once as a release job.
7. configure exact public API/web origins, trusted proxy headers, and production token keys.
8. configure provider credentials and callbacks only after consent and regional messaging requirements are addressed.
9. use durable object storage for uploaded logos and generated exports if multiple API replicas are used.
10. add centralized logs, metrics, tracing, uptime checks, alerting, rate limiting, and tested disaster recovery.

Scale the stateless web and API services horizontally. Keep scheduled reminders behind a distributed lock or in a single worker so only one job claims each idempotency key.

## Design principles

FITX uses `#080D10` and `#0D1418` backgrounds, `#111A1F` cards, `#32E875` brand green, clear white/gray typography, restrained status accents, rounded surfaces, and high-density but readable financial data. The interface avoids generic admin-template styling, random color, excessive glow/gradients, oversized typography, and animation that competes with tasks.

Desktop uses a persistent sidebar, tablet supports collapse, and mobile uses a navigation drawer with adaptive charts, stacked KPIs, responsive data cards, and reachable primary actions.

## API and support documentation

- [Architecture and domain rules](docs/ARCHITECTURE.md)
- [REST API conventions and endpoint catalogue](docs/API.md)

When reporting a defect, include the route, user role, locale, reproducible steps, expected/actual result, API correlation ID, and sanitized logs. Never include access tokens, passwords, provider credentials, or unredacted personal IDs.
