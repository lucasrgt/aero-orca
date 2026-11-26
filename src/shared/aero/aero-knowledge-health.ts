import { aeroIdPrefix, slugifyAeroTitle } from './aero-item-serializer'
import { countAeroLinks, type AeroKnowledgeIndex } from './aero-knowledge-index'
import {
  AERO_CONSTITUTION_TAG,
  AERO_DIGEST_TAG,
  isAeroItemStale,
  type AeroKnowledgeItem
} from './aero-knowledge-item'

const LISTED_ORPHANS = 10
const LISTED_STALE = 10
const LISTED_DUPLICATE_GROUPS = 6
const LISTED_HUBS = 5
const CELL_SIZE_NEEDING_DIGEST = 4

const CURATION_NOTES = `### Curadoria
- Duplicatas: funda na melhor (store com o id da sobrevivente, corpo consolidado) e
  ligue a perdedora com link(sobrevivente → perdedora, replaces) — substituídas caem no ranking.
- VENCIDOS: confirme contra o repo/realidade → validate(id); mudou → store(id) reescrevendo.
- Órfãs: se pertencem a um tema existente, conecte com link(); órfã + fria + antiga = candidata a fundir.
- Pirâmide: célula ≥4 items pede um digesto (1 item, tag 'digesto', título "Digesto — <célula>",
  citando os id8 das estrelas — os id8 viram arestas no reindex). Célula mudou → reescreva o digesto.
  Frios e antigos compactam PARA DENTRO do digesto; eviction é do ambiente, nunca da verdade.
- Nunca invente: toda operação de curadoria nasce de evidência no repo ou em conversa.`

function byUpdatedDescending(a: AeroKnowledgeItem, b: AeroKnowledgeItem): number {
  return a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0
}

function cellCounts(items: readonly AeroKnowledgeItem[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])
}

function pyramidLines(items: readonly AeroKnowledgeItem[], cells: [string, number][]): string {
  const hasConstitution = items.some((item) => item.tags.includes(AERO_CONSTITUTION_TAG))
  const digested = new Set(
    items.filter((item) => item.tags.includes(AERO_DIGEST_TAG)).map((item) => item.slug)
  )
  const undigested = cells.filter(
    ([slug, count]) => count >= CELL_SIZE_NEEDING_DIGEST && !digested.has(slug)
  )
  const latest = new Map<string, string>()
  for (const item of items) {
    if (!item.tags.includes(AERO_DIGEST_TAG) && item.updated > (latest.get(item.slug) ?? '')) {
      latest.set(item.slug, item.updated)
    }
  }
  const dirty = items
    .filter((item) => item.tags.includes(AERO_DIGEST_TAG))
    .filter((item) => (latest.get(item.slug) ?? '') > item.updated)
    .map((item) => `${item.slug} (${aeroIdPrefix(item.id)})`)
  let out = '### Ambiente (pirâmide)\n'
  out += hasConstitution
    ? '- constituição: presente\n'
    : "- constituição: FALTA — crie 1 item (≤300 tokens, tag 'constituicao') com o que NUNCA pode faltar\n"
  out += undigested.length
    ? `- células ≥4 items SEM digesto: ${undigested.map(([slug, count]) => `${slug} (${count})`).join(', ')}\n`
    : '- digestos: todas as células ≥4 items têm digesto\n'
  if (dirty.length > 0) {
    out += `- digestos DEFASADOS (a célula mudou depois — reescreva com store no id): ${dirty.join(', ')}\n`
  }
  return `${out}\n`
}

function duplicateLines(items: readonly AeroKnowledgeItem[]): string {
  const groups = new Map<string, AeroKnowledgeItem[]>()
  for (const item of items) {
    const key = `${item.slug}::${slugifyAeroTitle(item.title)}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const duplicates = [...groups.values()].filter((group) => group.length > 1)
  if (duplicates.length === 0) {
    return ''
  }
  const lines = duplicates
    .slice(0, LISTED_DUPLICATE_GROUPS)
    .map(
      (group) =>
        `- ${group.map((item) => `${item.title} (${aeroIdPrefix(item.id)})`).join(' ≈ ')}\n`
    )
  return `### Duplicatas candidatas\n${lines.join('')}\n`
}

function hubLines(index: AeroKnowledgeIndex): string {
  const hubs = index.items
    .map((item) => ({ item, degree: countAeroLinks(index, item.id) }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, LISTED_HUBS)
    .filter((hub) => hub.degree > 0)
  if (hubs.length === 0) {
    return ''
  }
  const lines = hubs.map(
    (hub) => `- ${hub.item.title} (${aeroIdPrefix(hub.item.id)}) — ${hub.degree} relações\n`
  )
  return `### Hubs (mais conectadas)\n${lines.join('')}\n`
}

/**
 * network.rs `health`: the curation view (cells, orphans, stale, the knowledge pyramid, duplicate
 * candidates, hubs). The "Frias" section needs Aero's per-item usage heat, which has no file, so
 * it is left out.
 */
export function describeAeroKnowledgeHealth(index: AeroKnowledgeIndex, now: Date): string {
  const items = index.items
  if (items.length === 0) {
    return '(rede vazia — nenhuma estrela ainda)'
  }
  const explicit = index.relations.filter((relation) => relation.origin === 'explicita').length
  const inferred = index.relations.length - explicit
  const cells = cellCounts(items)
  let out = `## Saúde da constelação\n${items.length} items · ${explicit} arestas explícitas · ${inferred} inferidas\n\n`
  out += `### Células\n${cells.map(([slug, count]) => `- ${slug}: ${count}\n`).join('')}\n`

  const orphans = items
    .filter((item) => countAeroLinks(index, item.id) === 0)
    .sort(byUpdatedDescending)
  if (orphans.length > 0) {
    const lines = orphans
      .slice(0, LISTED_ORPHANS)
      .map((item) => `- [${item.slug}] ${item.title} (${aeroIdPrefix(item.id)})\n`)
    out += `### Órfãs (${orphans.length} sem nenhuma relação)\n${lines.join('')}\n`
  }
  const stale = items.filter((item) => isAeroItemStale(item.decay, item.validated, now))
  if (stale.length > 0) {
    const lines = stale
      .slice(0, LISTED_STALE)
      .map((item) => `- [${item.slug} · ${item.decay}] ${item.title} (${aeroIdPrefix(item.id)})\n`)
    out += `### VENCIDOS (${stale.length})\n${lines.join('')}\n`
  }
  out += pyramidLines(items, cells)
  out += duplicateLines(items)
  out += hubLines(index)
  return `${out}${CURATION_NOTES}`.trimEnd()
}
