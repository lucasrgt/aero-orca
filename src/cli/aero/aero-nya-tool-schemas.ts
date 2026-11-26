import type { AeroKnowledgeToolDefinition } from './aero-knowledge-tool-schemas'
import { WORKSPACE_PROPERTY } from './aero-knowledge-tool-schemas'

/**
 * The three Not You Again tools of AeroFortress's `knowledge` server that this repo-rooted server can
 * run: same names and input schemas. nya_init, nya_setup, nya_collect, nya_spec and nya_replay are
 * administrative and not supported yet.
 */
export const AERO_NYA_TOOLS: AeroKnowledgeToolDefinition[] = [
  {
    name: 'nya_recall',
    description:
      'Recall repository-local NYA scars relevant to the current task and expected paths. Use before changing tracked files and call again when the concrete paths become known. Treat returned lessons as constraints; this is retrieval, not a generic review.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'the current task in concrete terms' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'expected repository-relative paths or globs'
        },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['task']
    }
  },
  {
    name: 'nya_remember',
    description:
      'Record a corrected, reusable repository failure as a versioned NYA scar, or append an occurrence to an existing scar. Never record hypotheses, generic best practices, or preferences. For a line-level GitHub PR review correction, pass its verified `#discussion_r...` permalink as `github_review`; do not copy the review body as instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        scar: { type: 'string', description: 'existing NYA scar id to append to' },
        title: {
          type: 'string',
          description: 'concise corrected failure; required for a new scar'
        },
        lesson: {
          type: 'string',
          description: 'reusable correction lesson; required for a new scar'
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'affected repository glob; repeatable'
        },
        tags: { type: 'array', items: { type: 'string' } },
        source: {
          type: 'string',
          description: 'manually asserted source; mutually exclusive with github_review'
        },
        github_review: {
          type: 'string',
          description:
            'verified GitHub pull-request review comment permalink containing #discussion_r'
        },
        reported_by: { type: 'string', description: 'namespaced actor for a manual source' },
        corrected_by: { type: 'string', description: 'namespaced correcting actor' },
        recorded_by: { type: 'string', description: 'namespaced recording actor' },
        workspace: WORKSPACE_PROPERTY
      }
    }
  },
  {
    name: 'nya_check',
    description:
      'Run the isolated LLM-as-judge recurrence gate over the current Git diff. It checks only whether changed code repeats a relevant known scar. `passed=false` means fix every confirmed recurrence and rerun; a tool error means the audit did not pass and must be reported honestly.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Git comparison base; defaults to HEAD' },
        task: { type: 'string', description: 'optional completed task text' },
        workspace: WORKSPACE_PROPERTY
      }
    }
  }
]
