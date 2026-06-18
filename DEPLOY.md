# Deploy auf Vercel (mit GitHub)

## 1. Supabase vorbereiten

Führe alle Migrationen in Supabase → **SQL Editor** aus (in Reihenfolge):

1. `supabase/migrations/0001_init.sql`
2. `0002_number_pool.sql` … `0009_archived_call_stats.sql`

Unter **Authentication → URL Configuration**:

- **Site URL:** `https://DEIN-PROJEKT.vercel.app`
- **Redirect URLs:**
  - `https://DEIN-PROJEKT.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (für lokale Entwicklung)

## 2. GitHub-Repository

Im Projektordner (Terminal):

```bash
cd "/Users/georgschali/Desktop/Telemarketing AI"
git init
git add .
git commit -m "Initial commit — Cura admin dashboard"
```

Auf [github.com/new](https://github.com/new) ein **leeres** Repo erstellen (ohne README).

Dann:

```bash
git branch -M main
git remote add origin https://github.com/DEIN-USER/DEIN-REPO.git
git push -u origin main
```

## 3. Vercel verbinden

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
2. GitHub autorisieren und dein Repo wählen
3. Framework: **Next.js** (wird automatisch erkannt)
4. **Environment Variables** eintragen (siehe unten)
5. **Deploy**

Nach dem ersten Deploy: `NEXT_PUBLIC_APP_URL` auf die echte Vercel-URL setzen und **Redeploy** auslösen.

## 4. Pflicht-Umgebungsvariablen (Vercel)

| Variable | Beschreibung |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role (geheim) |
| `NEXT_PUBLIC_APP_URL` | `https://dein-projekt.vercel.app` |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_WEBHOOK_SECRET` | Webhook-HMAC-Secret |
| `ADMIN_SESSION_SECRET` | Zufälliger String, min. 32 Zeichen |
| `ADMIN_USER` / `ADMIN_CODE` | Admin-Login (Produktion: starke Werte!) |

## 5. Empfohlene Variablen

| Variable | Beschreibung |
|---|---|
| `CURA_NUMBER_POOL` | Telefonnummern (E.164), kommagetrennt |
| `AGENT_TOOL_SECRET` | Bearer-Token für Termin-Tool |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Kalender OAuth |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook OAuth |
| `ENRICHMENT_API_KEY` | Optional: LLM-Anreicherung |

Vollständige Liste: `.env.example`

## 6. Externe Dienste nach Deploy anpassen

**ElevenLabs** → Agents → Webhook URL:

```
https://DEIN-PROJEKT.vercel.app/api/webhooks/elevenlabs
```

**Google Cloud** → OAuth Redirect URI:

```
https://DEIN-PROJEKT.vercel.app/api/integrations/google/callback
```

**Azure** → Redirect URI:

```
https://DEIN-PROJEKT.vercel.app/api/integrations/microsoft/callback
```

## 7. Custom Domain (optional)

Vercel → Project → **Settings → Domains** → Domain hinzufügen.

Danach `NEXT_PUBLIC_APP_URL` und alle OAuth/Webhook-URLs auf die Custom Domain aktualisieren.

## Troubleshooting

- **Build schlägt fehl:** Lokal `npm run build` ausführen und Fehler beheben.
- **Login funktioniert nicht:** Supabase Redirect URLs prüfen.
- **Webhooks kommen nicht an:** ElevenLabs-Webhook-URL und `ELEVENLABS_WEBHOOK_SECRET` prüfen.
