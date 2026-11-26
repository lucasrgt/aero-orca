import type { AeroKnowledgeToolDefinition } from './aero-knowledge-tool-schemas'
import { WORKSPACE_PROPERTY } from './aero-knowledge-tool-schemas'

/** The board-level tools of AeroFortress's `knowledge` server: same names, descriptions and input schemas. */
export const AERO_KANBAN_BOARD_TOOLS: AeroKnowledgeToolDefinition[] = [
  {
    name: 'kanban_board',
    description:
      "Read a Kanban board — its `mode`, its DEFAULT pipeline, its columns (each with an optional stage `pipeline`), and its task cards. Each card carries its full DOSSIER for you to parse when attacking it: title, desc, pipeline, column, attacking session, coarse phase, PLUS priority, category, the subtasks checklist, linked `knowledge` (network item ids — read them for context), and `attachments` (files to READ: each has `kind` image|pdf|doc and an absolute `abs` path you pass straight to the Read tool). A triaged card also carries `readiness` (Autopilot's Definition-of-Ready verdict, score, checks and missing questions; verdict `split` means the triage cut the card into smaller cards listed in `readiness.split_into`, each with `split_from` set, and the parent never runs), `clarifications` (open questions, each with 2-4 clickable `options` and a `recommended` index; answer them with kanban_card_answer), the spec's `assumptions` (the technical decisions the triage made itself) and, after an autonomous run, `outcome`. Fold this dossier into the session you spawn for the card. The fleet cockpit: consult it to decide what to attack next and to see where each card stands. The board's `mode` is the explicit lens: MONOLITH → a card runs `card.pipeline || board.pipeline` (one pipeline per card; columns are lifecycle); CONVEYOR → `card.pipeline || column.pipeline` (each column a stage; on green advance the card to the next column); FLEXIBLE → the full precedence `card.pipeline || column.pipeline || board.pipeline`. Boards live at .aerofortress/kanban/<board>.toml. Use when orchestrating a board (the kanban-orchestrate skill).",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: 'the board name (file stem under .aerofortress/kanban/)'
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board']
    }
  },
  {
    name: 'kanban_board_create',
    description:
      'Create (or reconfigure) a Kanban board in ONE call — the master-operator setup: name it, pick its `mode`, and set its DEFAULT `pipeline` up front, so you stand a board up ready to decompose into cards without ever touching the UI. Idempotent: if the board already exists it just applies the given mode/pipeline (omit a field to leave it as-is). For MONOLITH/FLEXIBLE pass `pipeline` (the board default every card inherits); for CONVEYOR omit `pipeline` and set per-column stages with kanban_column_pipeline. Returns the board.',
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: 'the board name (a file stem under .aerofortress/kanban/)'
        },
        mode: {
          type: 'string',
          enum: ['monolith', 'conveyor', 'flexible'],
          description: 'the pipeline lens; omit to keep existing / default to monolith on create'
        },
        pipeline: {
          type: 'string',
          description:
            "the board DEFAULT pipeline DEF name (monolith/flexible); omit or '' for conveyor / no default"
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board']
    }
  },
  {
    name: 'kanban_board_pipeline',
    description:
      "Set the board's DEFAULT pipeline (the board is created if absent; empty string clears it). Cards with no pipeline of their own and no column pipeline inherit this when attacked — set it once (e.g. 'ship') for the MONOLITH model (one pipeline does it all; columns stay lifecycle). Returns the updated board. For the CONVEYOR model (a pipeline per stage), set kanban_column_pipeline instead.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        pipeline: {
          type: 'string',
          description: "the default pipeline DEF name for the board ('' to clear)"
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'pipeline']
    }
  },
  {
    name: 'kanban_board_mode',
    description:
      "Set the board's pipeline MODE — the explicit lens over the card>column>board precedence. 'monolith' = one pipeline per card (the board default; columns are lifecycle). 'conveyor' = a pipeline per column (cards flow stage→stage). 'flexible' = the full precedence (board default + column stages + card override). Non-destructive: switching modes keeps the hidden config. READ the mode from kanban_board before orchestrating so you advance cards the right way. Returns the updated board.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        mode: {
          type: 'string',
          enum: ['monolith', 'conveyor', 'flexible']
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'mode']
    }
  },
  {
    name: 'kanban_column_pipeline',
    description:
      "Set a COLUMN's stage pipeline — the CONVEYOR model: each column is a stage with its own pipeline (e.g. 'doing' → implement pipeline, 'review' → review pipeline). A card in that column runs this when attacked; on green the orchestrator advances it to the next column, which runs its own. Empty string clears it (back to a plain lifecycle column). A card's EFFECTIVE pipeline = its own `pipeline` if set, else its column's, else the board default — so monolith (board default only), conveyor (per-column), and hybrid all fall out of the same precedence. Returns the updated board.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        column: {
          type: 'string',
          description: 'the column id: backlog|doing|review|done|blocked'
        },
        pipeline: {
          type: 'string',
          description: "the stage pipeline DEF name for this column ('' to clear)"
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'column', 'pipeline']
    }
  }
]
