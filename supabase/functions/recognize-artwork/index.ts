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

import {
  ARTWORK_THEME_OPTIONS,
  normalizeArtworkThemes,
  THEMES_PROMPT_SECTION,
} from "./artworkThemes.js";

/** Reinforces exact spelling — same strings as ARTWORK_THEME_OPTIONS / THEMES_PROMPT_SECTION. */
const THEME_ENUM_INLINE = ARTWORK_THEME_OPTIONS.join(", ");

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_MODEL =
  Deno.env.get("OPENROUTER_MODEL") || "nvidia/nemotron-nano-12b-v2-vl:free";
const OPENROUTER_TIMEOUT_MS = Number(Deno.env.get("OPENROUTER_TIMEOUT_MS") || "20000");

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
taken inside a museum. Identify the artwork if you can.

${THEMES_PROMPT_SECTION}

Closed vocabulary for the JSON "themes" array — use ONLY these exact strings (copy spelling and punctuation character-for-character):
${THEME_ENUM_INLINE}

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

For the "description" field: write 2–4 sentences of art-historical context — the
artist's background and intent, what makes this work significant, its cultural or
historical moment, and any underlying message or symbolism. Do NOT describe the
visual contents of the image (colors, shapes, what is literally depicted). Write
as if the viewer is already looking at the painting and wants to understand it
more deeply. If the artwork cannot be identified, write what little historical or
stylistic context can be inferred from the style, period, and subject matter.

If you cannot identify the artwork, still return the JSON but set title/artist/etc.
to null.
Never return prose outside the JSON.`;

interface RecognizePayload {
  artwork_id: string;
}

function logError(label: string, err: unknown, context?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    label,
    ...(context || {}),
  };
  if (err instanceof Error) {
    payload.error_name = err.name;
    payload.error_message = err.message;
    payload.error_stack = err.stack;
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause !== undefined) payload.error_cause = cause;
  } else {
    payload.error_value = err;
  }
  console.error("[recognize-artwork]", payload);
}

Deno.serve(async (req) => {
  try {
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

  let payloadRoot: unknown;
  try {
    payloadRoot = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!isJsonObject(payloadRoot)) {
    return json({ error: "json body must be an object" }, 400);
  }
  const artworkId = payloadRoot.artwork_id;
  if (!artworkId || typeof artworkId !== "string") {
    return json({ error: "artwork_id required" }, 400);
  }
  const payload: RecognizePayload = { artwork_id: artworkId };
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.trim().length < 10) {
    return json({ error: "server misconfigured", detail: "OPENROUTER_API_KEY missing/invalid" }, 500);
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
    logError("image download failed", dlErr, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      user_id: userId,
    });
    await adminClient
      .from("artworks")
      .update({ status: "error", error_message: "image download failed" })
      .eq("id", artwork.id);
    return json({ error: "image download failed", detail: dlErr?.message }, 500);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const base64 = base64FromBytes(bytes);
  const mediaType = resolveMediaType(blob.type, artwork.image_path);

  if (mediaType === "image/heic" || mediaType === "image/heif") {
    const fallback = buildFallbackUpdate(
      "HEIC/HEIF image uploaded. Automatic visual recognition is limited for this format in the current model provider.",
      "unsupported provider image format",
    );
    const { error: fallbackErr } = await adminClient
      .from("artworks")
      .update(fallback)
      .eq("id", artwork.id);
    if (fallbackErr) {
      return json({ error: "db update failed", detail: fallbackErr.message }, 500);
    }
    return json({
      ok: true,
      artwork_id: artwork.id,
      warning: "HEIC/HEIF currently stores fallback metadata; convert to JPG/PNG/WebP for full recognition.",
      ...fallback,
    });
  }

  let aiRes: Response;
  const abortController = new AbortController();
  const openrouterTimeout = setTimeout(() => abortController.abort("openrouter-timeout"), OPENROUTER_TIMEOUT_MS);
  try {
    aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: abortController.signal,
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
  } catch (e) {
    const isTimeout =
      e instanceof Error &&
      (e.name === "AbortError" ||
        String(e.message).toLowerCase().includes("abort") ||
        String(e.message).toLowerCase().includes("timed out"));
    logError("openrouter fetch failed", e, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
      model: OPENROUTER_MODEL,
      timeout_ms: OPENROUTER_TIMEOUT_MS,
      timeout_triggered: isTimeout,
    });
    const { error: markErr } = await adminClient
      .from("artworks")
      .update({
        status: "error",
        error_message: isTimeout
          ? `openrouter timeout after ${OPENROUTER_TIMEOUT_MS}ms`
          : `openrouter fetch failed: ${String(e).slice(0, 240)}`,
      })
      .eq("id", artwork.id);
    if (markErr) {
      return json({ error: "db update failed", detail: markErr.message }, 500);
    }
    return json(
      {
        error: isTimeout ? "openrouter timeout" : "openrouter fetch failed",
        detail: String(e),
        diagnostics: {
          model: OPENROUTER_MODEL,
          timeout_ms: OPENROUTER_TIMEOUT_MS,
          timeout_triggered: isTimeout,
          likely_cause: isTimeout
            ? "Provider is slow/unreachable from edge runtime."
            : "Network error before provider responded.",
        },
      },
      502,
    );
  } finally {
    clearTimeout(openrouterTimeout);
  }

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    logError("openrouter non-2xx", txt, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
      model: OPENROUTER_MODEL,
      provider_status: aiRes.status,
      provider_response_preview: txt.slice(0, 1500),
    });
    const { error: markErr } = await adminClient
      .from("artworks")
      .update({
        status: "error",
        error_message: `openrouter ${aiRes.status}`,
        raw_ai: jsonSafeObject({
          provider_status: aiRes.status,
          provider_body_preview: txt.slice(0, 1800),
          provider_headers: captureProviderHeaders(aiRes),
        }),
      })
      .eq("id", artwork.id);
    if (markErr) {
      return json({ error: "db update failed", detail: markErr.message }, 500);
    }
    return json({
      error: "openrouter failed",
      detail: txt.slice(0, 2000),
      diagnostics: {
        model: OPENROUTER_MODEL,
        provider_status: aiRes.status,
        provider_headers: captureProviderHeaders(aiRes),
        auth_likely_invalid: aiRes.status === 401 || aiRes.status === 403,
        rate_limited: aiRes.status === 429,
      },
    }, 502);
  }

  let aiJson: unknown;
  try {
    aiJson = await aiRes.json();
  } catch (e) {
    logError("openrouter response parse failed", e, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
      model: OPENROUTER_MODEL,
    });
    await adminClient
      .from("artworks")
      .update({
        status: "error",
        error_message: "openrouter response was not JSON",
      })
      .eq("id", artwork.id);
    return json({ error: "openrouter response parse failed", detail: String(e) }, 502);
  }

  const text = extractModelText(aiJson).trim();
  if (!text) {
    logError("empty model output", null, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
      model: OPENROUTER_MODEL,
      raw_ai_json_preview: safeStringify(aiJson).slice(0, 1500),
    });
    await adminClient
      .from("artworks")
      .update({
        status: "error",
        error_message: "model returned empty content",
        raw_ai: jsonSafeObject({ raw_json: aiJson }),
      })
      .eq("id", artwork.id);
    return json({ error: "bad AI response", detail: "empty model output" }, 502);
  }

  let parsedRoot: unknown;
  try {
    parsedRoot = JSON.parse(extractJsonCandidate(stripFences(text)));
  } catch (e) {
    logError("model JSON parse failed", e, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
      raw_text_preview: text.slice(0, 1500),
    });
    const fallback = buildFallbackUpdate(text, `model did not return JSON: ${String(e)}`);
    const { error: fallbackErr } = await adminClient
      .from("artworks")
      .update(fallback)
      .eq("id", artwork.id);
    if (fallbackErr) {
      return json({ error: "db update failed", detail: fallbackErr.message }, 500);
    }
    return json({
      ok: true,
      artwork_id: artwork.id,
      warning: "Model output was not strict JSON; stored fallback analysis.",
      ...fallback,
    });
  }

  if (!isJsonObject(parsedRoot)) {
    logError("model root not object", null, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
      parsed_root_type: Array.isArray(parsedRoot) ? "array" : typeof parsedRoot,
      raw_text_preview: text.slice(0, 1500),
    });
    const fallback = buildFallbackUpdate(text, "model returned a non-object JSON root");
    const { error: fallbackErr } = await adminClient
      .from("artworks")
      .update(fallback)
      .eq("id", artwork.id);
    if (fallbackErr) {
      return json({ error: "db update failed", detail: fallbackErr.message }, 500);
    }
    return json({
      ok: true,
      artwork_id: artwork.id,
      warning: "Model root was not a JSON object; stored fallback analysis.",
      ...fallback,
    });
  }

  const parsed = parsedRoot;

  try {
    const themes = normalizeArtworkThemes(parsed.themes);
    const rawAiStored = jsonSafeObject({
      ...parsed,
      themes,
      themes_from_model: parsed.themes,
    });

    const update = {
      status: "ready" as const,
      title: stringOrNull(parsed.title),
      artist: stringOrNull(parsed.artist),
      period: stringOrNull(parsed.period),
      date_text: stringOrNull(parsed.date_text),
      medium: stringOrNull(parsed.medium),
      dimensions: stringOrNull(parsed.dimensions),
      location_guess: stringOrNull(parsed.location_guess),
      description: stringOrNull(parsed.description) ?? "",
      themes,
      raw_ai: rawAiStored,
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
  } catch (err) {
    logError("recognize-artwork handler error", err, {
      artwork_id: artwork.id,
      image_path: artwork.image_path,
      media_type: mediaType,
    });
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await adminClient
        .from("artworks")
        .update({
          status: "error",
          error_message: `recognition failed: ${msg.slice(0, 500)}`,
        })
        .eq("id", artwork.id);
    } catch {
      // ignore
    }
    return json({ error: "internal error", detail: msg }, 500);
  }
  } catch (fatal) {
    logError("recognize-artwork fatal error", fatal);
    const detail = fatal instanceof Error ? fatal.message : String(fatal);
    return json({ error: "fatal edge function error", detail }, 500);
  }
});

function isJsonObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Ensures value is JSON-serializable for the jsonb column (no BigInt / circular refs). */
function jsonSafeObject(v: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  } catch {
    return { _note: "raw_ai could not be serialized" };
  }
}

function stringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v;
  return null;
}

function guessMediaType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "image/jpeg";
}

function resolveMediaType(blobType: string, path: string): string {
  if (typeof blobType === "string" && blobType.startsWith("image/")) return blobType;
  return guessMediaType(path);
}

function stripFences(t: string): string {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : t;
}

/** Some models return prose before/after JSON; keep the first object-looking block. */
function extractJsonCandidate(t: string): string {
  const trimmed = t.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function extractModelText(ai: unknown): string {
  if (!isJsonObject(ai)) return "";
  const choices = ai.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (!isJsonObject(first)) return "";
  const message = first.message;
  if (!isJsonObject(message)) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (isJsonObject(part) && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (isJsonObject(content) && typeof content.text === "string") return content.text;
  return "";
}

function buildFallbackUpdate(rawText: string, reason: string) {
  const description =
    stringOrNull(rawText)?.slice(0, 4000) ||
    "Unable to parse structured output. This appears to be an artwork image.";
  return {
    status: "ready" as const,
    title: null,
    artist: null,
    period: null,
    date_text: null,
    medium: null,
    dimensions: null,
    location_guess: null,
    description,
    themes: normalizeArtworkThemes(rawText),
    raw_ai: jsonSafeObject({
      raw_text: rawText,
      fallback_reason: reason,
    }),
    error_message: null,
  };
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}

function captureProviderHeaders(res: Response): Record<string, string> {
  const keys = [
    "x-request-id",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
    "retry-after",
    "cf-ray",
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = res.headers.get(k);
    if (v) out[k] = v;
  }
  return out;
}
