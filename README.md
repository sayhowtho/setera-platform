# Setera

Setera is an AI phone receptionist and CRM for trades businesses (roofers, plumbers, HVAC, electricians and similar). A voice agent answers the business's calls. Each call becomes a classified lead in the business's own portal, and a separate set of internal portals runs the sales team that sells the product.

This repository is a sanitized, view-only snapshot of the production codebase. Client data, personal details, keys and live identifiers have been removed or replaced with placeholders. See [LICENSE](LICENSE).

## Why this exists

I started building Setera on May 7 because I wanted to learn, and I didn't want someone else to build it for me. I wanted to be able to fix problems myself, and if I ever hired someone or worked for another company, to understand whether the work was done right and say "let's try it this way instead." I'd been using AI for a while, and I wondered what would happen if a normal person really pushed it, so I started questioning how traditional learning is done and whether I could learn faster and produce more my own way.

I didn't know how far I'd actually get. Along the way I've wanted to learn from other people's projects too. Building on your own is one thing, but being on a team and learning from other people is completely different. Learning all of this has made me want to be part of a bigger team than anything I could build alone.

## Stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, CSS Modules, Framer Motion |
| Data | Supabase: Postgres, Auth, Row Level Security, RPC functions, Storage |
| Hosting | Vercel (deploys on push), Vercel Analytics |
| Voice | ElevenLabs Conversational AI (agent, post-call webhook, phone-number API, web widget) |
| AI | Anthropic Claude for call classification |
| Scheduling | Google Calendar API + Meet links (OAuth2) |
| Payments | Stripe Payment Links (hosted checkout only) |
| Tests | `node:test` with a small custom TypeScript loader; GitHub Actions CI |

## Architecture

### Call pipeline

```
Caller ──► business phone number ──► ElevenLabs voice agent
                                          │  call ends
                                          ▼
                       POST /api/emily-webhook  (post_call_transcription)
                                          │
                     agent_id ──► business_agents ──► business_id
                                          │
            HMAC signature check (per-workspace secret; log or enforce mode) ── bad ──► 401
                                          │
            claim conversation_id in webhook_events ── already seen ──► 200 (duplicate)
                                          │
              ┌───────────────────────────┴───────────────────────────┐
              │ business found                                        │ no business
              ▼                                                       ▼ (Setera's own site agent)
   client Paused / business locked? ── yes ──► skip (200)       INSERT leads
              │ no
              ▼
   map data-collection fields ──► INSERT calls (pipeline_stage = 'new')
              │
              ▼
   lib/classify-call.ts ──► Claude ──► opportunity | out_of_scope | customer | trade_partner | other
              │                         (+ confidence; a failure leaves the call unclassified)
              ▼
   UPDATE calls.classification
              │
              ▼
   Client portal (/client): call log, transcript, pipeline board,
   low-confidence review, manual reclassification remembered per caller number
```

Each delivery is checked against the sending workspace's HMAC secret (stored in Supabase Vault) before anything is written (`lib/emily-signature.ts`). One database setting switches between logging the result and rejecting bad signatures, so enforcement can be rolled out without a deploy. Retried deliveries of the same call are then ignored through an idempotency ledger (`lib/webhook-idempotency.ts`, `migrations/041`). If that ledger is unavailable, the call is processed anyway rather than dropped.

The call row is saved before classification runs, so an AI failure can't lose a call. Classification sends the business's industry and stated services along with the call summary (and the opening of the transcript when the summary is thin). The model's JSON is validated against the allowed labels and a 0–1 confidence before anything is written.

### Portals

| Route | Users | Purpose |
|---|---|---|
| `/admin` ("High Table") | owner, admin | prospects, allocation, team and compensation, clients, payments, lockout, demo calendar |
| `/rep` | rep, vp_sales | own pipeline, demos, sign-ups, earnings |
| `/setter` | setter | assigned prospects, call logging, demo booking |
| `/client` | client (a business) | calls, transcripts, pipeline, settings |
| `app/(marketing)` | public | marketing site, trade pages, demo form, voice widget |
| `/api/bodhi/*` | an internal AI assistant (API key) | scoped prospect import and update |

### Data and security model

- **Roles** live in `profiles.role`. API routes verify the caller's Bearer token and read the role from the database (`lib/server-auth.ts`), never from the request.
- **API routes** use the Supabase service-role client, so each route's own authorization check is the control. A unit test (`lib/api-route-guards.test.ts`) fails if any route skips the check without being listed as deliberately public.
- **Account protection:** a database trigger stops non-admin users from changing their own role or account fields (`migrations/037`). The user-management routes only act on sales-team accounts, never on admin, owner or client accounts or the caller's own (`lib/user-admin.ts`).
- **Browser reads and writes** use the anon key, protected by Row Level Security. Each portal keeps its own auth session (`lib/supabase.ts`) so accounts in different tabs can't overwrite each other.
- **Multi-row business operations** (allocation, recording a sale, role changes, duplicate-checked prospect creation) are Postgres functions that lock rows and run in one transaction (`migrations/`).
- **Public forms** are rate-limited per hashed IP and use a honeypot.
- **Client lockout** unassigns the voice agent from the client's phone number through the ElevenLabs API, with a compensating rollback if any step fails (`lib/client-lockout.ts`). Restrictive RLS policies then cut off the client's data access (`migrations/014`).

### Repository layout

```
app/          routes: portals, marketing site, API route handlers (app/api)
components/   shared and portal-specific React components
lib/          domain logic, integrations and helpers, with *.test.ts unit tests
migrations/   hand-applied SQL migrations (000 is a read-only schema snapshot)
scripts/      seed scripts, staging integration tests, the test loader
public/       static assets
```

## Running locally

Requirements: Node 24 and a Supabase project of your own.

```bash
npm ci
cp .env.example .env.local      # fill in your own Supabase URL and keys
npm run dev                     # http://localhost:3000
```

The schema can't be fully rebuilt from `migrations/` alone. `000_baseline_existing_schema.sql` is a snapshot of tables created before the migrations folder existed, and some of those tables' original RLS policies, and the `get_my_role()` helper, live only in the production database. Treat the migrations as documentation of the schema's evolution rather than a one-command setup.

The integrations (AI classification, ElevenLabs, Google Calendar) are optional. Without an Anthropic key, calls are saved without a classification. Without the ElevenLabs or Google variables, client lock/unlock and demo booking return an error, and the rest of the app still runs.

## Tests

```bash
npx tsc --noEmit                 # type check
TZ=America/Regina npm test       # unit tests (node:test)
npm run lint                     # ESLint; reports only in CI for now
```

- **Unit tests** (`lib/*.test.ts`) cover compensation and commission rules, revenue and payments, plan tiers, calendar slot logic, local-time date handling, follow-ups, call outcomes, duplicate-detection normalization, province inference and search, plus webhook signature verification and its log/enforce rollout, webhook deduplication, user-management authorization, and a check that every API route authenticates its caller.
- **CI** (`.github/workflows/ci.yml`) runs the type check, unit tests and lint on every push and pull request.
- **Integration scripts** (`scripts/test-*.mjs`) exercise RLS policies and API routes end to end. They run against a staging Supabase project through a local `next dev`. Each has a production guard: the newer scripts refuse to run when their Supabase URL matches the one in `.env.local`, and the older ones refuse when it contains a production project ref, which is a placeholder (`your-production-project-ref`) in this copy until you set it.

## Not included

- Client data, call recordings and transcripts, and any production identifiers or credentials.
- The voice agent's own prompt and configuration, which live in ElevenLabs, not in code.
- A reproducible database bootstrap (see above), seed data for a fresh project, and Supabase CLI configuration.
- Unmerged work branches. This snapshot is a single point in the main branch, with no git history.
- Stripe webhooks or automated billing: payments are collected through hosted Payment Links and recorded in a ledger by an admin.
