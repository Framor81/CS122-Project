# Personal Museum

Personal Museum is a two-part web app:

- `/museum/*` routes in the React app provide login, collection, artwork upload,
  and AI artwork recognition.
- The repo-root React/Vite app contains the 3D multiplayer museum experience.

Both experiences share the same Supabase backend.

## Local Development

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Open the first museum page:

```text
http://localhost:5173/
```

To run the Vite app and local Socket.IO multiplayer server together:

```bash
npm run dev:all
```

## Environment

Create a repo-root `.env` for the React app and multiplayer server. `.env` is
gitignored.

```bash
VITE_MULTIPLAYER_URL=https://cs122-server.onrender.com
FRONTEND_ORIGIN=https://cs122-project.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://djydtidnjokygfrlvglw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-public-key
```

The React app reads Supabase config from `.env`.

## Backend Setup

See `docs/SUPABASE_SETUP.md` for schema, storage policies,
OpenRouter artwork recognition, and Edge Function deployment.

Artwork recognition uses an OpenRouter key stored as a Supabase Edge Function
secret:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-your-key-here
supabase functions deploy recognize-artwork
```
