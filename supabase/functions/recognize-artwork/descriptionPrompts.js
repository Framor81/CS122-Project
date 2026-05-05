export const DESCRIPTION_PROMPT_OPTIONS = [
  {
    id: 'context',
    label: 'Historical context',
    shortLabel: 'Context',
    description: 'Situates the work in its period, culture, and meaning.',
    instruction:
      'For the "description" field: write 2-4 sentences of art-historical context. Emphasize the artwork\'s cultural or historical moment, why it mattered, and any underlying message or symbolism. Do NOT simply describe the visual contents of the image. Write as if the viewer is already looking at the work and wants to understand it more deeply.',
  },
  {
    id: 'technique',
    label: 'Technique focused',
    shortLabel: 'Technique',
    description: 'Looks closely at materials, process, composition, and craft.',
    instruction:
      'For the "description" field: write 2-4 sentences focused on technique. Emphasize medium, materials, composition, handling, surface, process, and stylistic choices. Connect those formal choices to the work\'s effect or meaning. Avoid a plain inventory of what is visible.',
  },
  {
    id: 'artist',
    label: 'Artist focused',
    shortLabel: 'Artist',
    description: 'Centers the artist, biography, intent, and body of work.',
    instruction:
      'For the "description" field: write 2-4 sentences focused on the artist. Emphasize the artist\'s background, intent, recurring concerns, and where this work fits in their larger practice when identifiable. If the artist cannot be identified, discuss what can be inferred about the maker or school from the image.',
  },
  {
    id: 'viewer',
    label: 'Viewer friendly',
    shortLabel: 'Viewer',
    description: 'Keeps the explanation direct, inviting, and easy to read.',
    instruction:
      'For the "description" field: write 2-4 sentences for a curious museum visitor. Use direct, accessible language that explains why the work is interesting, how to think about it, and what to notice conceptually. Keep it warm and informative without sounding academic.',
  },
]

export const DEFAULT_DESCRIPTION_PROMPT_ID = 'context'

export function normalizeDescriptionPromptId(id) {
  if (typeof id !== 'string') return DEFAULT_DESCRIPTION_PROMPT_ID
  return DESCRIPTION_PROMPT_OPTIONS.some((option) => option.id === id)
    ? id
    : DEFAULT_DESCRIPTION_PROMPT_ID
}

export function getDescriptionPromptOption(id) {
  const normalizedId = normalizeDescriptionPromptId(id)
  return DESCRIPTION_PROMPT_OPTIONS.find((option) => option.id === normalizedId) ||
    DESCRIPTION_PROMPT_OPTIONS[0]
}
