import { AERO_DECAYS, AERO_ITEM_TYPES } from '../../shared/aero/aero-knowledge-item'
import { AERO_LINK_KINDS } from '../../shared/aero/aero-knowledge-edits'

export type AeroKnowledgeToolDefinition = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

// Aero targets a registered workspace by id; here the server is rooted at one repo, so it is inert.
export const WORKSPACE_PROPERTY = {
  type: 'string',
  description:
    'accepted for compatibility with AeroFortress and ignored: this server serves the single repo it was started in'
}

/** The seven network tools of AeroFortress's `knowledge` MCP server that need nothing but the repo's files. */
export const AERO_KNOWLEDGE_TOOLS: AeroKnowledgeToolDefinition[] = [
  {
    name: 'store',
    description:
      'Stores durable knowledge in the AeroFortress network (or updates, when `id` is passed). Use it when you learn something confirmed and worth remembering in future sessions: project facts, decisions and their rationale, user rules/preferences, useful prompts and scripts. Query before creating to avoid duplicates — if an equivalent item exists, update it by passing its id. Mounts (a slug that addresses a plugin, child or sibling repo) are not supported yet: the item is written into this repo.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'short semantic storage cell: design, arch, scripts, geral, decisions...'
        },
        type: {
          type: 'string',
          enum: [...AERO_ITEM_TYPES],
          description:
            'general-purpose knowledge type. Corrected repository mistakes are scars owned by Not You Again; record those with nya_remember instead of store.'
        },
        title: { type: 'string' },
        body: { type: 'string', description: 'markdown content, objective and complete' },
        tags: { type: 'array', items: { type: 'string' } },
        provenance: {
          type: 'string',
          enum: ['observado', 'dito', 'inferido', 'importado'],
          description:
            'observado = seen in code/execution; dito = stated by the user; inferido = your deduction; importado = came from outside'
        },
        evidence: {
          type: 'string',
          description:
            'reference: file path, URL, excerpt — morally required when provenance=observado'
        },
        decay: {
          type: 'string',
          enum: [...AERO_DECAYS],
          description:
            'volatile=~30d (project state), seasonal=~180d, stable=~2y (preferences, architecture)'
        },
        id: { type: 'string', description: 'to update an existing item' },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['slug', 'type', 'title', 'body', 'provenance']
    }
  },
  {
    name: 'query',
    description:
      'Ranked search over the AeroFortress network (BM25 + provenance + freshness). Use it BEFORE assuming context about the repo/workspace and before store (to avoid duplicates). Returns metadata + snippet; use read for the full body. Plugin federation is not supported yet.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'search terms; omit to list the most relevant' },
        slug: { type: 'string' },
        tag: { type: 'string' },
        limit: { type: 'integer', default: 8 },
        workspace: WORKSPACE_PROPERTY
      }
    }
  },
  {
    name: 'explore',
    description:
      'Knowledge-graph explorer over the network — ONE call returns the relevant items WITH their connected neighborhood (typed relations, 2 hops), full bodies at the center and one-line skeletons at the edge, within a budget. Prefer it over chains of query+read when you need UNDERSTANDING ("what do we know about X?", "why was X decided?", context before designing/changing something). Without `q` it returns the network HEALTH map (orphans, stale, duplicate candidates, hubs) — the curation view. Aggregate workspaces (child repos, plugin home networks) are not supported yet.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'search terms / topic; omit for the health map' },
        budget_tokens: {
          type: 'integer',
          description: 'output budget; omit to let it scale with the corpus'
        },
        workspace: WORKSPACE_PROPERTY
      }
    }
  },
  {
    name: 'read',
    description:
      'Reads a full AeroFortress network item by id (returned by query/store), including its graph neighborhood (links_out/links_in with titles). The id must be the complete uuid.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'pack',
    description:
      'Context crafting request: assembles a ranked workspace pack (optionally filtered by slugs) within a token budget. Use it when starting specialized work (e.g. slugs=["design"]) or when delegating to a sub-agent. Mounted slugs (plugin home networks) are not supported yet.',
    inputSchema: {
      type: 'object',
      properties: {
        slugs: { type: 'array', items: { type: 'string' } },
        budget_tokens: { type: 'integer', default: 2000 },
        workspace: WORKSPACE_PROPERTY
      }
    }
  },
  {
    name: 'link',
    description:
      'Creates a typed relationship between two network items (knowledge graph). The edge is stored on the `from` item.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        kind: { type: 'string', enum: [...AERO_LINK_KINDS] }
      },
      required: ['from', 'to', 'kind']
    }
  },
  {
    name: 'validate',
    description:
      'Revalidates an item (marks it verified now — resets decay). Use it when you confirm that stale (VENCIDO) knowledge is still true.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  }
]
