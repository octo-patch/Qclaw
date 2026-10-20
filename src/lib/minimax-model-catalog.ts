import { toRuntimeModelEquivalenceKey } from './model-runtime-resolution'

interface MiniMaxCatalogItem {
  key?: string
  tags?: string[]
}

// Only filter known public text IDs. Custom IDs, media and the OAuth portal
// retain their upstream contract. Never synthesize a model absent from runtime.
function modelRank(key: string): number | null {
  const normalized = key.trim().toLowerCase()
  let model: string
  if (/^minimax(?:-cn)?\//.test(normalized)) {
    model = normalized.slice(normalized.indexOf('/') + 1)
    if (model === 'minimax-m3.1-flash') return 0
    if (model === 'minimax-m3') return 1
  } else if (normalized.startsWith('openrouter/minimax/')) {
    model = normalized.slice('openrouter/minimax/'.length)
    if (model === 'minimax-m3.1-flash:free') return 0
    if (model === 'minimax-m3') return 1
  } else if (normalized.startsWith('opencode/')) {
    model = normalized.slice('opencode/'.length)
    if (model === 'minimax-m3.1-flash-free') return 0
    if (model === 'minimax-m3') return 1
  } else {
    return null
  }
  return /^(?:minimax-m\d|abab\d)/.test(model) ? 2 : null
}

export function selectCurrentMiniMaxCatalog<T extends MiniMaxCatalogItem>(
  catalog: T[],
  preservedKeys: string[] = []
): T[] {
  const preserved = new Set(preservedKeys.map(toRuntimeModelEquivalenceKey))
  const filtered = catalog.filter((item) => {
    if (modelRank(item.key || '') !== 2) return true
    if (preserved.has(toRuntimeModelEquivalenceKey(item.key || ''))) return true
    return item.tags?.some((tag) => /^(?:configured|default|alias:|fallback(?:#|:)|image(?:-|$))/.test(tag)) === true
  })
  // Reorder only current MiniMax slots, keeping unrelated items in place.
  const current = filtered.filter((item) => {
    const rank = modelRank(item.key || '')
    return rank === 0 || rank === 1
  }).sort((a, b) => modelRank(a.key || '')! - modelRank(b.key || '')!)
  let index = 0
  return filtered.map((item) => {
    const rank = modelRank(item.key || '')
    return rank === 0 || rank === 1 ? current[index++] : item
  })
}
