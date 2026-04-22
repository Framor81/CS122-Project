# Personal Museum — Supabase Setup

The app is fully React-based:

- Museum web experience (login, collection, upload, detail): `/museum/*`
- Multiplayer 3D museum: `/` and `/session/:code`

## 1) Environment

Create repo-root `.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://djydtidnjokygfrlvglw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-public-key
OPENROUTER_API_KEY=sk-or-your-key-here
```

Never expose service role keys in frontend code.

## 2) Run DB Schema

In Supabase SQL editor, run:

- `supabase/schema.sql`

It creates tables, storage bucket/policies, and realtime setup needed by both museum flows.

## 3) Deploy Edge Function

```bash
supabase login
supabase link --project-ref djydtidnjokygfrlvglw
supabase secrets set OPENROUTER_API_KEY=sk-or-your-key-here
supabase functions deploy recognize-artwork
```

Function source:

- `supabase/functions/recognize-artwork/index.ts`

## 4) Local Dev

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/museum/welcome` for web museum
- `http://localhost:5173/` for 3D museum
