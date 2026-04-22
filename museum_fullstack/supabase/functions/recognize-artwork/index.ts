// ---------------------------------------------------------------------------
// recognize-artwork Edge Function
// Deploy:  supabase functions deploy recognize-artwork --no-verify-jwt=false
// Secrets: supabase secrets set OPENROUTER_API_KEY=sk-or-...
//
// Flow:
//   1. Frontend uploads a photo to the 'artworks' storage bucket
//      and inserts an artworks row (status='pending') with image_path.
//   2. Frontend calls this function with { artwork_id }.
//   3. This function:
//        - Verifies the caller owns the row (RLS also enforces this).
//        - Downloads the image from storage as base64.
//        - Sends it to OpenRouter/Gemma with a structured prompt.
//        - Parses JSON and updates the row (status='ready').
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_MODEL =
  Deno.env.get("OPENROUTER_MODEL") || "google/gemma-4-31b-it:free";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const PROMPT = `You are an expert art historian analyzing a photograph of an artwork
taken inside a museum. Identify the artwork if you can, and describe it in a way
that gives the viewer rich context: the artist, period, themes, and a short
narrative description.

Respond with ONLY a JSON object (no prose, no markdown fences) matching this shape:

{
  "title": string | null,
  "artist": string | null,
  "period": string | null,
  "date_text": string | null,
  "medium": string | null,
  "dimensions": string | null,
  "location_guess": string | null,
  "description": string,
  "themes": string[],
  "confidence": "high" | "medium" | "low"
}

If you cannot identify the artwork, still return the JSON but set title/artist/etc.
to null and describe what you see and the themes you observe. Never return prose
outside the JSON.`;

interface RecognizePayload {
  artwork_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "missing bearer token" }, 401);
  }

  let payload: RecognizePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!payload.artwork_id) {
    return json({ error: "artwork_id required" }, 400);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "not authenticated" }, 401);
  }
  const userId = userData.user.id;

  const { data: artwork, error: artErr } = await userClient
    .from("artworks")
    .select("id, user_id, image_path, status")
    .eq("id", payload.artwork_id)
    .single();

  if (artErr || !artwork) {
    return json({ error: "artwork not found" }, 404);
  }
  if (artwork.user_id !== userId) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: blob, error: dlErr } = await adminClient.storage
    .from("artworks")
    .download(artwork.image_path);
  if (dlErr || !blob) {
    await adminClient
      .from("artworks")
      .update({ status: "error", error_message: "image download failed" })
      .eq("id", artwork.id);
    return json({ error: "image download failed", detail: dlErr?.message }, 500);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const base64 = base64FromBytes(bytes);
  const mediaType = blob.type || guessMediaType(artwork.image_path);

  const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "http-referer": "https://cs122-project.vercel.app",
      "x-title": "Personal Museum",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64}`,
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    await adminClient
      .from("artworks")
      .update({ status: "error", error_message: `openrouter ${aiRes.status}` })
      .eq("id", artwork.id);
    return json({ error: "openrouter failed", status: aiRes.status, detail: txt }, 502);
  }

  const aiJson = await aiRes.json();
  const text = String(aiJson?.choices?.[0]?.message?.content ?? "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (e) {
    await adminClient
      .from("artworks")
      .update({
        status: "error",
        error_message: "model did not return JSON",
        raw_ai: { raw_text: text } as Record<string, unknown>,
      })
      .eq("id", artwork.id);
    return json({ error: "bad AI response", detail: String(e), raw: text }, 502);
  }

  const update = {
    status: "ready",
    title: stringOrNull(parsed.title),
    artist: stringOrNull(parsed.artist),
    period: stringOrNull(parsed.period),
    date_text: stringOrNull(parsed.date_text),
    medium: stringOrNull(parsed.medium),
    dimensions: stringOrNull(parsed.dimensions),
    location_guess: stringOrNull(parsed.location_guess),
    description: stringOrNull(parsed.description) ?? "",
    themes: Array.isArray(parsed.themes)
      ? (parsed.themes as unknown[]).filter((t) => typeof t === "string")
      : [],
    raw_ai: parsed,
    error_message: null,
  };

  const { error: upErr } = await adminClient
    .from("artworks")
    .update(update)
    .eq("id", artwork.id);
  if (upErr) {
    return json({ error: "db update failed", detail: upErr.message }, 500);
  }

  return json({ ok: true, artwork_id: artwork.id, ...update });
});

function stringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v;
  return null;
}

function guessMediaType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function stripFences(t: string): string {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : t;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
