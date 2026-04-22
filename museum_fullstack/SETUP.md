# Personal Museum — Setup

This project has two connected parts:

- `museum_fullstack/` is the first museum experience: login, collection,
  artwork upload, and AI artwork recognition.
- The React/Vite app at the repo root is the 3D multiplayer museum. Static
  `3D MUSEUM` links route there with `/`.

Use one Supabase project for both parts. Do not create a second Supabase
project unless you intentionally want a separate dev/prod backend.

## 1. Supabase Project

Use the existing Supabase project:

```text
https://djydtidnjokygfrlvglw.supabase.co
```

The static pages read browser-safe values from `museum_fullstack/config.js`.
The React app reads them from the repo-root `.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://djydtidnjokygfrlvglw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-public-key
```

The anon/publishable key is safe to expose in browser code. Never expose the
Supabase service role key or any AI provider key in frontend files.

## 2. Run The Database Schema

In Supabase, open **SQL Editor -> New query**. Copy the contents of
`museum_fullstack/supabase/schema.sql` and run it.

This creates:

- `artworks`
- private `artworks` storage bucket
- storage policies for user-owned uploads
- `museum_sessions`
- `user_museums`
- realtime publication entries for `artworks` and `museum_sessions`

## 3. OpenRouter Key For Artwork Recognition

The app uses OpenRouter for AI artwork recognition. The default model is:

```text
nvidia/nemotron-nano-12b-v2-vl:free
```

To get an OpenRouter key:

1. Go to `https://openrouter.ai/keys`.
2. Sign in with your OpenRouter account.
3. Click **Create Key**.
4. Give it a name like `personal-museum-dev`.
5. Optional but recommended: set a small credit limit.
6. Copy the key. It starts with `sk-or-`.

Store it as a Supabase Edge Function secret:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-your-key-here
```

Optional: override the model without changing code:

```bash
supabase secrets set OPENROUTER_MODEL=nvidia/nemotron-nano-12b-v2-vl:free
```

Free OpenRouter models are rate-limited. This is fine for a low-volume class
demo, but exact artwork identification may be imperfect. When the model cannot
identify the exact artwork, the function should still return a useful visual
description and low confidence.

## 4. Deploy The Edge Function

Install the Supabase CLI if needed:

- Mac: `brew install supabase/tap/supabase`
- Other platforms: see Supabase CLI docs

From the repo or `museum_fullstack/` folder:

```bash
supabase login
supabase link --project-ref djydtidnjokygfrlvglw
supabase secrets set OPENROUTER_API_KEY=sk-or-your-key-here
supabase functions deploy recognize-artwork
```

Supabase automatically provides `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.

## 5. Local Development

From the repo root:

```bash
npm install
npm run dev
```

Flow:

- `homepage-2.html` -> login
- `login-page.html` -> sign in or create account
- `homepage-1.html` -> collection hub
- `+ Add Artwork` -> uploads an image and calls `recognize-artwork`
- `3D Museum` -> routes to `/`, the React multiplayer museum app

For local multiplayer backend testing, run:

```bash
npm run dev:all
```

## Troubleshooting

**Bucket not found**
Run `museum_fullstack/supabase/schema.sql`. It creates the private `artworks`
bucket and storage policies.

**Could not find table `public.artworks`**
Run `museum_fullstack/supabase/schema.sql`. The collection/upload pages require
the `artworks` table.

**Upload works but recognition fails**
Check Supabase Edge Function logs:

```bash
supabase functions logs recognize-artwork --tail
```

Common causes:

- missing `OPENROUTER_API_KEY`
- OpenRouter free-tier rate limit
- uploaded image too large
- model returned non-JSON output

**3D session creation fails**
Make sure the same schema was run. The React app expects `museum_sessions` and
`user_museums`.

## What Maps To What

| Feature | Location |
| --- | --- |
| Public museum home | `museum_fullstack/homepage-2.html` |
| Authenticated museum home | `museum_fullstack/homepage-1.html` |
| Static-page auth helpers | `museum_fullstack/supabase-client.js` |
| Static-page Supabase config | `museum_fullstack/config.js` |
| Photo upload | `museum_fullstack/add-images.html` |
| AI recognition | `museum_fullstack/supabase/functions/recognize-artwork/index.ts` |
| Collection grid | `museum_fullstack/collection-all.html` |
| Artwork detail | `museum_fullstack/artwork-detail.html?id=<uuid>` |
| 3D multiplayer app | repo root React/Vite app |
