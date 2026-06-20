# Linker — Admin Dashboard

Customer-facing admin area for **Linker**, an AI phone agent SaaS for Swiss residential property managers (Immobilienverwaltungen).

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui-style components + lucide-react
- **Supabase** (Auth + Postgres) — real auth & per-user data with Row Level Security

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill in your secrets
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase — Setup (required)

Auth and all data (calls, settings, calendars, profile) live in Supabase. Each
user only sees their own rows (enforced by Row Level Security).

1. **Create a project** at <https://supabase.com> (free tier is fine).
2. **Create the schema**: open *SQL Editor* → *New query*, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and
   run it. This creates the `profiles`, `app_settings`, `calls` and `calendars`
   tables, the RLS policies, and a trigger that provisions a profile on signup.
3. **Copy the keys** from *Project Settings → API* into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon / public key
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role key (**secret**, server-only;
     used by the post-call webhook and the agent tool to attribute calls by
     `agent_id`).
4. **(Quick start) Disable email confirmation**: *Authentication → Providers →
   Email* → turn **off** "Confirm email" so signups can log in immediately.
   Leave it on for production and users will confirm via the emailed link.
5. **Restart** `npm run dev`, open the app, and you'll be redirected to
   **/login**. Use **Jetzt registrieren** to create the first account.

### Migrate existing local data (optional)

If you already have calls in the legacy file store (`.data/linker-store.json`),
log in as the account that should own them and run once:

```bash
curl -X POST http://localhost:3000/api/migrate-legacy \
  -H "Cookie: <copy your browser's cookies for localhost>"
```

…or simply open the app while logged in and POST to `/api/migrate-legacy`. It
imports settings, calls and calendar connections into your Supabase rows.

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add the same environment variables (Supabase, ElevenLabs, Stripe, calendars)
   in *Project → Settings → Environment Variables*.
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL and update the OAuth redirect
   URIs (Google/Microsoft) and the ElevenLabs webhook URL accordingly.

The app no longer writes to the local filesystem, so it runs on Vercel's
serverless runtime without changes.

## ElevenLabs Phone Agent — Setup Checklist

The Telefonagent page is wired to the **real** ElevenLabs Agents Platform via the
official `@elevenlabs/elevenlabs-js` SDK. All keys stay server-side (Next.js route
handlers under `app/api/...`); nothing reaches the browser.

Follow this order — the UI mirrors it top to bottom:

1. **Environment variables** — copy `.env.example` → `.env.local` and set:
   - `ELEVENLABS_API_KEY` (required) — from <https://elevenlabs.io/app/settings/api-keys>
   - `ELEVENLABS_WEBHOOK_SECRET` (required for the call feed) — generated when you add the webhook
   - `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (required only to connect a phone number)
   - `ENRICHMENT_API_KEY` (optional) — any OpenAI-compatible key for the LLM enrichment pass.
     If unset, Linker falls back to ElevenLabs' own call analysis.
   - Restart `npm run dev` after editing env files.
2. **Connect** — on `/telefonagent`, click **Verbinden**. Linker validates the key by
   listing your agents and shows **Verbunden** with workspace info. → `POST /api/elevenlabs/connect`
3. **Voice + Agent** — the *Stimme* dropdown is populated with your real ElevenLabs
   voices (German/multilingual first). Fill in name, voice, language and greeting, then
   **Agent erstellen**. The agent (with a Swiss property-management system prompt) is
   created and its `agent_id` persisted. → `GET /api/elevenlabs/voices`, `POST /api/elevenlabs/agent`
4. **Twilio number** — enter your purchased Twilio number and a label, then **Nummer
   verbinden**. Linker imports it into ElevenLabs and assigns the agent for inbound calls.
   → `POST /api/elevenlabs/phone`
5. **Webhook** — copy the **Post-Call Webhook** URL from the card and register it under
   ElevenLabs → Agents → Settings → Post-call webhooks, using the same
   `ELEVENLABS_WEBHOOK_SECRET`. The URL must be **publicly reachable**:
   - Production: your deployed domain, e.g. `https://app.example.com/api/webhooks/elevenlabs`
   - Local dev: tunnel with ngrok and set `NEXT_PUBLIC_APP_URL` to the tunnel URL:
     ```bash
     ngrok http 3000
     ```
6. **Test call** — call your Twilio number, talk to the agent, then hang up. When
   analysis completes, ElevenLabs POSTs the `post_call_transcription` event; Linker verifies
   the HMAC signature, enriches the transcript, and the call appears automatically in the
   dashboard feed (`/`). → `POST /api/webhooks/elevenlabs`

> Persistence uses a small file-backed store at `.data/linker-store.json` (git-ignored).
> Swap `src/lib/store/index.ts` for Supabase queries to go fully managed — no other code changes needed.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Übersicht (Dashboard)
│   ├── anrufe/             # Call list + detail
│   ├── telefonagent/         # Agent configuration
│   ├── integrationen/        # External integrations
│   └── einstellungen/        # Account settings
├── components/
│   ├── dashboard/          # StatCard, CallCard, SuggestionItem
│   ├── integrations/       # IntegrationCard
│   ├── layout/             # Sidebar, AppShell
│   └── ui/                 # shadcn-style primitives
└── lib/
    ├── types.ts            # Domain types
    ├── mock/               # Seed data (calls, suggestions, etc.)
    ├── integrations/       # ElevenLabs, Twilio, Supabase stubs
    └── agent/              # Agent config abstraction
```

## Design

Brand colors from the Straightforward guidelines:

| Token | Value | Usage |
|-------|-------|-------|
| `linker-navy` | `#234B63` | Sidebar, headings |
| `linker-accent` | `#F36C21` | Primary buttons, active nav |
| `linker-surface` | `#F7F8FA` | Content background |

All UI copy is in **German (Swiss market)**. Code identifiers are in English.

## Integration Points

### ElevenLabs Conversational AI — implemented ✅
- **Routes:** `src/app/api/elevenlabs/*` (connect, voices, agent, phone) + `src/app/api/webhooks/elevenlabs`
- **Helpers:** `src/lib/elevenlabs/` (SDK client, error mapping, system prompt)
- **Enrichment:** `src/lib/enrichment/` (LLM pass with ElevenLabs-analysis fallback)
- See the **Setup Checklist** above to go live.

### Twilio Telephony — implemented ✅ (via ElevenLabs native integration)
- Numbers are imported into ElevenLabs using `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`
  and assigned to the agent from the Telefonagent page.

### Still stubbed

### Supabase Auth & Database
- **File:** `src/lib/integrations/supabase.ts`
- Replace mock data layer with Supabase client
- Auth: login, session, team management

### Calendar Integrations & Appointment Booking — implemented ✅
- **Providers:** Google Calendar & Microsoft Outlook (OAuth 2.0), Apple iCloud (CalDAV).
- **Routes:** `src/app/api/integrations/*` (status, `[provider]/connect`, `[provider]/callback`, `[provider]/disconnect`).
- **Library:** `src/lib/calendar/` (per-provider OAuth/token-refresh + event creation, dispatch in `index.ts`).
- **UI:** `/integrationen` shows the three calendar providers with real connect/disconnect.

**Setup (per provider you want):**
1. Add OAuth credentials to `.env.local` (see `.env.example`): `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`. Apple needs none — the customer enters an Apple ID + app-specific password in the UI.
2. Register the redirect URI `<NEXT_PUBLIC_APP_URL>/api/integrations/<provider>/callback` in the provider console.
3. Connect the calendar on `/integrationen`.

**Appointment booking by the agent:**
1. Enable it on the **Telefonagent** page → *Terminvereinbarung* (choose the connected calendar). This injects booking instructions into the agent prompt and re-syncs the live agent.
2. Set `AGENT_TOOL_SECRET` in `.env.local`.
3. In the ElevenLabs agent, add two **server (webhook) tools** pointing to
   `POST <NEXT_PUBLIC_APP_URL>/api/agent-tools/appointment` with header
   `Authorization: Bearer <AGENT_TOOL_SECRET>`:
   - `check_availability` — body `{ "action": "check_availability" }`
   - `book_appointment` — body `{ "action": "book_appointment", "title": string, "startIso": string (ISO 8601, Europe/Zurich), "durationMinutes": number, "attendeeName": string, "attendeePhone": string }`
   The endpoint creates the event in the connected calendar and returns a German confirmation.

### Agent Configuration Sync
- **File:** `src/lib/agent/config.ts`
- Persist config to DB and sync with ElevenLabs agent settings

## Mock Data

Realistic Swiss seed data in `src/lib/mock/`:

- 6 sample calls with German transcripts and summaries
- 4 AI suggestions (calendar, tasks, escalation)
- Agent config with Swiss German voice options

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
