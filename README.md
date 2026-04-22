# Personal Museum

Personal Museum is a two-part web app:

- `museum_fullstack/` contains the first museum experience: login, collection,
  artwork upload, and AI artwork recognition.
- The repo-root React/Vite app contains the 3D multiplayer museum experience.

The static museum pages route into the 3D app with `/`.

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
http://localhost:5173/museum_fullstack/homepage-2.html
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

The static pages use Supabase browser config in `museum_fullstack/config.js`.

## Backend Setup

See `museum_fullstack/SETUP.md` for Supabase schema, storage policies,
OpenRouter artwork recognition, and Edge Function deployment.

Artwork recognition uses an OpenRouter key stored as a Supabase Edge Function
secret:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-your-key-here
supabase functions deploy recognize-artwork
```
