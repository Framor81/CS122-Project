# Personal Museum — Backend Setup

This connects your static HTML prototype to a real backend: Supabase handles
auth + storage + database, and a Supabase Edge Function calls the Claude API
for artwork recognition. API keys stay server-side.

Time: about 20-30 minutes the first time.

---

## 1. Create a Supabase project

1. Go to https://supabase.com and sign up (free tier is fine).
2. Click **New project**. Pick any name (e.g. `personal-museum`), a strong DB
   password, and the region nearest you.
3. Wait until the project is ready. On the left sidebar open **Settings ->
   API**. You will need two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public key** (a long `eyJ...` string)

---

## 2. Run the schema

1. In the Supabase dashboard open **SQL Editor -> New query**.
2. Copy the entire contents of `supabase/schema.sql` from this folder and paste
   it in. Click **Run**.
3. This creates the `artworks` table, row-level security policies, and the
   private `artworks` storage bucket.

---

## 3. Fill in `config.js`

Open `config.js` and paste the two values from step 1:

```js
window.MUSEUM_CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...your-anon-key...",
};
```

The anon key is designed to be public — it only gives access to what your RLS
policies allow, which is "this user's own rows."

---

## 4. Turn off email confirmation (optional, for dev)

In **Authentication -> Providers -> Email**, toggle off **Confirm email** while
you are testing, so "Create Account" logs you in instantly. You can turn it
back on before shipping to real users.

---

## 5. Get an Anthropic API key

1. Go to https://console.anthropic.com, sign in, open **API Keys**.
2. Create a new key. Copy it (starts with `sk-ant-...`).
3. Add at least a few dollars of credit on the billing page.

---

## 6. Deploy the Edge Function

You need the Supabase CLI. Install it:

- Mac: `brew install supabase/tap/supabase`
- Other: https://supabase.com/docs/guides/cli/getting-started

Then, from this `museum_frontend/` folder:

```bash
# 1. Log in once
supabase login

# 2. Link this folder to your project (replace with your project ref from the URL)
supabase link --project-ref YOUR-PROJECT-REF

# 3. Store the Claude key as a secret (server-side only)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here

# 4. Deploy
supabase functions deploy recognize-artwork
```

Supabase automatically injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
into every function, so you don't need to set those.

---

## 7. Try it

You can open the HTML files directly with `file://`, but auth + storage work
more predictably over http. The easiest way:

```bash
# From the museum_frontend/ folder:
python3 -m http.server 5173
```

Then open http://localhost:5173/homepage-2.html.

Flow:
- `homepage-2.html` -> **Login** -> `login-page.html`
- Click **Create Account** with any email + a 6+ char password -> you land on
  `homepage-1.html`.
- Click **+ Add Artwork**, upload a photo of a painting. The page uploads to
  storage, inserts a row, calls `recognize-artwork`, and redirects to the
  detail page where Claude's title/artist/description/themes are rendered.
- `collection-all.html` shows every artwork you've added, filterable by theme.

---

## Troubleshooting

**"config.js is not filled in"** in the browser console — you skipped step 3.

**Login button just spins** — check the browser console. Usually the URL or
anon key is wrong, or the Supabase project isn't fully provisioned yet.

**Upload works but "anthropic failed" appears** — run
`supabase functions logs recognize-artwork --tail` and look for the error.
Usually: missing `ANTHROPIC_API_KEY` secret, no billing credit, or the image
is too large (try a smaller photo).

**Nothing appears on the collection page** — check the Supabase dashboard ->
Table Editor -> `artworks`. If rows are there but not visible, RLS may not
have been applied; re-run `schema.sql`.

**"row violates row-level security"** on insert — your browser session's user
id doesn't match `user_id`. Sign out and back in.

---

## What maps to what

| Feature              | Where it lives                                                 |
| -------------------- | -------------------------------------------------------------- |
| Auth                 | `login-page.html` + `supabase-client.js` (`signIn` / `signUp`) |
| Session guard        | `museum.requireAuth()` at the top of each protected page       |
| Photo upload         | `add-images.html` -> `museum.uploadArtworkFile()`              |
| AI recognition       | `supabase/functions/recognize-artwork/index.ts`                |
| Artwork detail view  | `artwork-detail.html?id=<uuid>`                                |
| Collection grid      | `collection-all.html` (queries your own rows via RLS)          |
| User caption         | `artwork-detail.html` (textarea -> `update artworks`)          |

The old hardcoded `artwork-detail-1.html` and `artwork-detail-2.html` files
are untouched — they're still useful as static design references, but the
live flow uses `artwork-detail.html`.
