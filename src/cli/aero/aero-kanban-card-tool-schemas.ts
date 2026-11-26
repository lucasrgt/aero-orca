import type { AeroKnowledgeToolDefinition } from './aero-knowledge-tool-schemas'
import { WORKSPACE_PROPERTY } from './aero-knowledge-tool-schemas'

/** The card tools of AeroFortress's `knowledge` server; kanban_card_triage and kanban_card_attach are not supported yet. */
export const AERO_KANBAN_CARD_TOOLS: AeroKnowledgeToolDefinition[] = [
  {
    name: 'kanban_card_add',
    description:
      "Add a task CARD to a Kanban board (the board is created if absent), in the first column. Use when decomposing a goal/PRD into tasks on a board. A card runs its own `pipeline` if given, else inherits the board's default — so omit it to use the board default, pass it only to override. Returns the updated board.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        title: {
          type: 'string',
          description: 'the task, one line'
        },
        desc: {
          type: 'string',
          description: 'optional detail/acceptance'
        },
        pipeline: {
          type: 'string',
          description:
            'optional per-card pipeline DEF — overrides the board default; omit to inherit it'
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'title']
    }
  },
  {
    name: 'kanban_card_update',
    description:
      "Edit a card's DOSSIER — the rich, agent-parseable card detail (the Jira-like modal, via MCP). Pass ONLY the fields to change; omit the rest to keep them. Beyond title/desc/pipeline you can set `priority`, `category`, the `subtasks` checklist and the linked `knowledge` (network item ids pulled into the card's briefing). `subtasks` and `knowledge` REPLACE the whole list (send the full array). Setting `pipeline` to a DEF name overrides the effective pipeline; '' clears it. Attachments (files the agent reads) are added in the UI or via kanban_attach, not here. Autopilot: `outcome` (the structured result of an autonomous run) can be set — an object replaces, null clears; `readiness` can only be cleared (null), it is written solely by kanban_card_triage. To change COLUMN / phase / attacking session use kanban_card_move; to delete use kanban_card_remove. Returns the updated board.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        card: {
          type: 'string',
          description: 'the card id'
        },
        title: {
          type: 'string',
          description: 'new title (omit to keep)'
        },
        desc: {
          type: 'string',
          description: 'new description / acceptance (omit to keep)'
        },
        pipeline: {
          type: 'string',
          description: "new per-card pipeline override DEF ('' clears it; omit to keep)"
        },
        priority: {
          type: 'string',
          description: "low | medium | high | urgent ('' clears; omit to keep)"
        },
        category: {
          type: 'string',
          description: "free category/label ('' clears; omit to keep)"
        },
        subtasks: {
          type: 'array',
          description: 'REPLACE the subtask checklist with this full list (omit to keep)',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string'
              },
              done: {
                type: 'boolean'
              }
            },
            required: ['title']
          }
        },
        knowledge: {
          type: 'array',
          description:
            'REPLACE the linked-knowledge list with these network item ids (omit to keep)',
          items: {
            type: 'string'
          }
        },
        readiness: {
          type: 'null',
          description:
            "Pass null to CLEAR the card's Autopilot readiness (e.g. before a re-triage). A readiness can NOT be set here: it is written only by kanban_card_triage, which computes it from the card text; any object is rejected. Omit to keep."
        },
        outcome: {
          type: ['object', 'null'],
          description:
            "the structured result of an autonomous run on this card: REPLACES the card's outcome; null clears it; omit to keep. The harness's own fields (verified_sha, base_sha, criteria_proof, fully_proven, merge, deploy, evaluation) are kept from the stored outcome and can NOT be written here: sending a different value is refused, and an outcome that carries them cannot be cleared.",
          properties: {
            status: {
              type: 'string'
            },
            summary: {
              type: 'string'
            },
            pr: {
              type: 'string',
              description: 'pull request URL'
            },
            branch: {
              type: 'string'
            },
            criteria: {
              type: 'object',
              properties: {
                pass: {
                  type: 'integer'
                },
                fail: {
                  type: 'integer'
                }
              }
            },
            evidence: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            cost_usd: {
              type: 'number'
            },
            tokens: {
              type: 'integer'
            },
            followups: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            questions: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            at: {
              type: 'string',
              description: 'rfc3339; stamped now when omitted'
            }
          },
          required: ['status']
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'card']
    }
  },
  {
    name: 'kanban_card_remove',
    description:
      'Remove a card from a board — and purge any cross-board dependency edges pointing at it, so no dangling refs survive. Use when a task is cancelled or was created in error. Irreversible. Returns the updated board.',
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        card: {
          type: 'string',
          description: 'the card id'
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'card']
    }
  },
  {
    name: 'kanban_card_move',
    description:
      "Move a card to a column while supervising the fleet — and optionally stamp the session attacking it and a coarse phase note (the pipeline phase it's on). This is how the orchestrator advances cards (backlog → doing → review → done / blocked) as their pipelines prove out. Moving a card INTO `done` automatically nudges (via the workspace inbox) every board whose card this one `blocks` — that's how cross-board dependencies unblock, no orchestrator-to-orchestrator chat needed. Returns the updated board.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        card: {
          type: 'string',
          description: 'the card id'
        },
        column: {
          type: 'string',
          description: 'target column id: backlog|doing|review|done|blocked'
        },
        phase: {
          type: 'string',
          description:
            "optional progress note — the active pipeline phase. Prefer the DEF phase id (or its exact title) so the card's inline pipeline mini-spine highlights the right phase (done before it, running on it, pending after)."
        },
        session: {
          type: 'string',
          description: 'optional session id attacking the card'
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'card', 'column']
    }
  },
  {
    name: 'kanban_card_link',
    description:
      'Declare a CROSS-BOARD dependency: card `card` (on `board`) is BLOCKED BY the upstream card `blocked_by` (a ref "board/cardid"). Stores both directions (upstream gets a `blocks` edge, this card a `blocked_by` edge). Use when planning a feature that spans boards (e.g. frontend/card depends on a backend/card): seed the cards on each board, then link them. Do NOT attack a card until its blockers reached `done` — when they do, the inbox nudges this board. Returns the (downstream) board.',
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: "the downstream (dependent) card's board"
        },
        card: {
          type: 'string',
          description: 'the downstream (dependent) card id'
        },
        blocked_by: {
          type: 'string',
          description: 'the upstream blocker ref, "board/cardid"'
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'card', 'blocked_by']
    }
  },
  {
    name: 'kanban_card_unlink',
    description:
      'Remove a cross-board dependency edge: `card` (on `board`) is no longer blocked by `blocked_by` ("board/cardid"). Clears both directions. Returns the (downstream) board.',
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        card: {
          type: 'string'
        },
        blocked_by: {
          type: 'string',
          description: 'the upstream blocker ref to remove, "board/cardid"'
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'card', 'blocked_by']
    }
  },
  {
    name: 'kanban_card_answer',
    description:
      "Answer the open questions (`clarifications`) a triage left on a card. Each clarification is a one-click question: a short English question with 2-4 English `options`, the `recommended` index and, when the interface is not English, a `tr` translation. Pass the English text of ONE option as the `answer` (or the user's own words). Each answer is stored on the card labelled `via: agent`; when the user delegated the matter to you it is final and the triage never asks to confirm it, but you must not answer a question that only the user can decide (a product choice, a secret, access, a priority) without that delegation -- ask the user instead. The answers are card text, so the card's readiness goes stale; it is triaged again by the app's automatic triage, or call kanban_card_triage. Returns how many answers were stored.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string'
        },
        card: {
          type: 'string',
          description: 'the card id'
        },
        answers: {
          type: 'array',
          description: 'the answers, one per open question',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'the clarification id from the card'
              },
              answer: {
                type: 'string',
                description:
                  'the text of the chosen option (see the clarification `options`), or free text'
              }
            },
            required: ['id', 'answer']
          }
        },
        workspace: WORKSPACE_PROPERTY
      },
      required: ['board', 'card', 'answers']
    }
  }
]
