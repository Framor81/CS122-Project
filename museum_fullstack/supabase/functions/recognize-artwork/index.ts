// ---------------------------------------------------------------------------
// recognize-artwork Edge Function
// Deploy:  supabase functions deploy recognize-artwork --no-verify-jwt=false
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Flow:
//   1. Frontend uploads a photo to the 'artworks' storage bucket
//      and inserts an artworks row (status='pending') with image_path.
//   2. Frontend calls this function with { artwork_id }.
//   3. This function:
//        - Verifies the caller owns the row (RLS also enforces this).
//        - Downloads the image from storage as base64.
//        - Sends it to Claude with a structured prompt.
//        - Parses JSON and updates the row (status='ready').
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
that gives the viewer rich context — the artist, the period, the themes, and a
short narrative description that goes beyond a wikipedia summary.

Respond with ONLY a JSON object (no prose, no markdown fences) matching this shape:

{
  "title": string | null,
  "artist": string | null,
  "period": string | null,          // e.g. "Post-Impressionism"
  "date_text": string | null,       // e.g. "1889" or "c. 1665"
  "medium": string | null,          // e.g. "Oil on canvas"
  "dimensions": string | null,      // e.g. "73.7 x 92.1 cm"
  "location_guess": string | null,  // museum / gallery if confident
  "description": string,            // 3-5 sentences of rich context
  "themes": string[],               // 3-6 short tags in ALL CAPS
  "confidence": "high" | "medium" | "low"
}

If you cannot identify the artwork, still return the JSON but set title/artist/etc.
to null and describe what you see and the themes you observe. Never return prose
outside the JSON.`;

interface RecognizePayload {
  artwork_id: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // Auth: the JWT from the caller is forwarded by supabase.functions.invoke
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

  // Client scoped to THIS user — RLS will block access to other users' rows.
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Admin client with service role — used to update the row and download the file
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Look up the user to verify they exist
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "not authenticated" }, 401);
  }
  const userId = userData.user.id;

  // Fetch the artwork row, owned by this user only
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

  // Download the image from storage as bytes
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

  // Call Claude
  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
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
      .update({ status: "error", error_message: `anthropic ${aiRes.status}` })
      .eq("id", artwork.id);
    return json({ error: "anthropic failed", status: aiRes.status, detail: txt }, 502);
  }

  const aiJson = await aiRes.json();
  const text = (aiJson.content as AnthropicContentBlock[])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("")
    .trim();

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

// --- helpers ---------------------------------------------------------------

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
