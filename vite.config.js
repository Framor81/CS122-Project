import { createClient } from '@supabase/supabase-js'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import {
  normalizeArtworkThemes,
  THEMES_PROMPT_SECTION,
} from './supabase/functions/recognize-artwork/artworkThemes.js'
import {
  getDescriptionPromptOption,
  normalizeDescriptionPromptId,
} from './supabase/functions/recognize-artwork/descriptionPrompts.js'

const OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free'

function buildPrompt(descriptionPromptId) {
  const descriptionPrompt = getDescriptionPromptOption(descriptionPromptId)
  return `You are an expert art historian analyzing a photograph of an artwork
taken inside a museum. Identify the artwork if you can, and describe it in a way
that gives the viewer rich context: the artist, period, themes, and a short
narrative description.

${THEMES_PROMPT_SECTION}

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

${descriptionPrompt.instruction}

If you cannot identify the artwork, still return the JSON but set title/artist/etc.
to null and describe what you see and apply themes from the allowed list only.
Never return prose outside the JSON.`
}

function stringOrNull(v) {
  if (typeof v === 'string' && v.trim().length > 0) return v
  return null
}

function stripFences(t) {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return m ? m[1] : t
}

function guessMediaType(path) {
  const ext = path.split('.').pop()?.toLowerCase() || 'jpg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function blobToBase64(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer())
  return buffer.toString('base64')
}

function localRecognitionPlugin(env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL
  const supabaseAnonKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || env.VITE_SUPABASE_ANON_KEY
  const openRouterKey = env.OPENROUTER_API_KEY

  return {
    name: 'local-recognize-artwork',
    configureServer(server) {
      server.middlewares.use('/api/recognize-artwork', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }

        if (!supabaseUrl || !supabaseAnonKey) {
          sendJson(res, 500, { error: 'Supabase env vars are missing.' })
          return
        }

        if (!openRouterKey) {
          sendJson(res, 500, { error: 'OPENROUTER_API_KEY is missing from .env.' })
          return
        }

        const authHeader = req.headers.authorization || ''
        if (!authHeader.startsWith('Bearer ')) {
          sendJson(res, 401, { error: 'missing bearer token' })
          return
        }

        let payload
        try {
          payload = await readJsonBody(req)
        } catch {
          sendJson(res, 400, { error: 'invalid json body' })
          return
        }

        if (!payload.artwork_id) {
          sendJson(res, 400, { error: 'artwork_id required' })
          return
        }
        const descriptionPrompt = normalizeDescriptionPromptId(payload.description_prompt)

        const client = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        })

        const { data: artwork, error: artErr } = await client
          .from('artworks')
          .select('id,user_id,image_path,status')
          .eq('id', payload.artwork_id)
          .single()

        if (artErr || !artwork) {
          sendJson(res, 404, { error: 'artwork not found' })
          return
        }

        const { data: blob, error: dlErr } = await client.storage
          .from('artworks')
          .download(artwork.image_path)
        if (dlErr || !blob) {
          await client
            .from('artworks')
            .update({ status: 'error', error_message: 'image download failed' })
            .eq('id', artwork.id)
          sendJson(res, 500, { error: 'image download failed', detail: dlErr?.message })
          return
        }

        const base64 = await blobToBase64(blob)
        const mediaType = blob.type || guessMediaType(artwork.image_path)
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${openRouterKey}`,
            'http-referer': 'http://localhost:5173',
            'x-title': 'Personal Museum Local Dev',
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            max_tokens: 1024,
            temperature: 0.2,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mediaType};base64,${base64}`,
                    },
                  },
                  { type: 'text', text: buildPrompt(descriptionPrompt) },
                ],
              },
            ],
          }),
        })

        if (!aiRes.ok) {
          const detail = await aiRes.text()
          await client
            .from('artworks')
            .update({ status: 'error', error_message: `openrouter ${aiRes.status}` })
            .eq('id', artwork.id)
          sendJson(res, 502, { error: 'openrouter failed', status: aiRes.status, detail })
          return
        }

        const aiJson = await aiRes.json()
        const text = String(aiJson?.choices?.[0]?.message?.content || '').trim()
        let parsed
        try {
          parsed = JSON.parse(stripFences(text))
        } catch (err) {
          await client
            .from('artworks')
            .update({
              status: 'error',
              error_message: 'model did not return JSON',
              raw_ai: { raw_text: text },
            })
            .eq('id', artwork.id)
          sendJson(res, 502, { error: 'bad AI response', detail: String(err), raw: text })
          return
        }

        const themes = normalizeArtworkThemes(parsed.themes)
        const update = {
          status: 'ready',
          title: stringOrNull(parsed.title),
          artist: stringOrNull(parsed.artist),
          period: stringOrNull(parsed.period),
          date_text: stringOrNull(parsed.date_text),
          medium: stringOrNull(parsed.medium),
          dimensions: stringOrNull(parsed.dimensions),
          location_guess: stringOrNull(parsed.location_guess),
          description: stringOrNull(parsed.description) || '',
          themes,
          raw_ai: { ...parsed, themes, themes_from_model: parsed.themes, description_prompt: descriptionPrompt },
          error_message: null,
        }

        const { error: upErr } = await client
          .from('artworks')
          .update(update)
          .eq('id', artwork.id)
        if (upErr) {
          sendJson(res, 500, { error: 'db update failed', detail: upErr.message })
          return
        }

        sendJson(res, 200, { ok: true, artwork_id: artwork.id, ...update })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), localRecognitionPlugin(env)],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    resolve: {
      alias: {
        tslib: fileURLToPath(new URL('./src/vendor/tslib.js', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
