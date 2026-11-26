import { join } from 'node:path'
import {
  addAeroKanbanCard,
  answerAeroKanbanClarifications,
  moveAeroKanbanCard,
  removeAeroKanbanCard,
  updateAeroKanbanCard
} from '../../shared/aero/aero-kanban-card-ops'
import {
  setAeroKanbanBoardMode,
  setAeroKanbanBoardPipeline,
  setAeroKanbanColumnPipeline
} from '../../shared/aero/aero-kanban-board-ops'
import {
  newAeroKanbanDocument,
  type AeroKanbanDocument
} from '../../shared/aero/aero-kanban-document'
import {
  aeroKanbanTimestamp,
  makeAeroKanbanRef,
  slugifyAeroKanban
} from '../../shared/aero/aero-kanban-identifiers'
import {
  aeroKanbanLinkStems,
  describeAeroKanbanUnblocks,
  linkAeroKanbanCards,
  purgeAeroKanbanRefs,
  unlinkAeroKanbanCards
} from '../../shared/aero/aero-kanban-link-ops'
import { AeroKanbanError } from '../../shared/aero/aero-kanban-tables'
import { viewAeroKanbanBoard } from '../../shared/aero/aero-kanban-view'
import {
  answersFromArguments,
  cardEditFromArguments,
  optionalString,
  requiredBoardName,
  requiredString,
  type AeroKanbanToolArgs
} from './aero-kanban-tool-arguments'
import { resolveAeroKanbanRoot } from './aero-kanban-root'
import { createAeroKanbanStore, type AeroKanbanStore } from './aero-kanban-store'
import type { AeroKnowledgeLockOptions } from './aero-knowledge-lock'

export type AeroKanbanTools = {
  handles: (name: string) => boolean
  call: (name: string, args: AeroKanbanToolArgs) => Promise<string>
}

type Context = { store: AeroKanbanStore; dataDirectory: string; now: () => string }
type Handler = (context: Context, args: AeroKanbanToolArgs) => Promise<string>

const CARD_NOT_FOUND = 'board or card not found'

/** The board as Aero prints it, plus the file it lives in (the primary checkout's, from a worktree). */
function render(
  context: Context,
  document: AeroKanbanDocument,
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    ...viewAeroKanbanBoard(document.tree, context.dataDirectory),
    board_path: context.store.boardPath(document.stem),
    ...extra
  })
}

/** One locked change to one board; `create` makes a missing board, otherwise it is `missing`. */
async function changeBoard<T>(
  context: Context,
  stem: string,
  missing: string | null,
  change: (document: AeroKanbanDocument) => T
): Promise<{ document: AeroKanbanDocument; value: T }> {
  const { result } = await context.store.transact({ required: [stem] }, (boards) => {
    let document = boards.get(stem)
    if (document === undefined) {
      if (missing !== null) {
        throw new AeroKanbanError(missing)
      }
      document = newAeroKanbanDocument(stem)
      boards.set(stem, document)
    }
    const value = change(document)
    return { changed: [stem], result: { document, value } }
  })
  return result
}

const boardHandlers: Record<string, Handler> = {
  kanban_board: async (context, args) => {
    const name = requiredBoardName(args)
    const document = await context.store.read(slugifyAeroKanban(name))
    if (document === undefined) {
      const board_path = context.store.boardPath(slugifyAeroKanban(name))
      return JSON.stringify({ board: name, exists: false, cards: [], board_path })
    }
    return render(context, document)
  },
  kanban_board_create: async (context, args) => {
    const stem = slugifyAeroKanban(requiredBoardName(args))
    const mode = optionalString(args, 'mode')
    const pipeline = optionalString(args, 'pipeline')
    const { document } = await changeBoard(context, stem, null, (board) => {
      if (mode !== undefined) {
        setAeroKanbanBoardMode(board, mode)
      }
      if (pipeline !== undefined) {
        setAeroKanbanBoardPipeline(board, pipeline)
      }
    })
    return render(context, document)
  },
  kanban_board_pipeline: async (context, args) => {
    const stem = slugifyAeroKanban(requiredBoardName(args))
    const { document } = await changeBoard(context, stem, null, (board) =>
      setAeroKanbanBoardPipeline(board, optionalString(args, 'pipeline') ?? '')
    )
    return render(context, document)
  },
  kanban_board_mode: async (context, args) => {
    const stem = slugifyAeroKanban(requiredBoardName(args))
    const mode = requiredString(args, 'mode')
    const { document } = await changeBoard(context, stem, null, (board) =>
      setAeroKanbanBoardMode(board, mode)
    )
    return render(context, document)
  },
  kanban_column_pipeline: async (context, args) => {
    const stem = slugifyAeroKanban(requiredBoardName(args))
    const column = requiredString(args, 'column')
    const { document } = await changeBoard(context, stem, null, (board) =>
      setAeroKanbanColumnPipeline(board, column, optionalString(args, 'pipeline') ?? '')
    )
    return render(context, document)
  }
}

const cardHandlers: Record<string, Handler> = {
  kanban_card_add: async (context, args) => {
    const stem = slugifyAeroKanban(requiredBoardName(args))
    const input = {
      title: requiredString(args, 'title'),
      desc: optionalString(args, 'desc') ?? '',
      pipeline: optionalString(args, 'pipeline') ?? ''
    }
    const { document } = await changeBoard(context, stem, null, (board) =>
      addAeroKanbanCard(board, input, context.now())
    )
    return render(context, document)
  },
  kanban_card_update: async (context, args) => {
    const name = requiredBoardName(args)
    const card = requiredString(args, 'card')
    const edit = cardEditFromArguments(args)
    const { document } = await changeBoard(
      context,
      slugifyAeroKanban(name),
      CARD_NOT_FOUND,
      (board) => updateAeroKanbanCard(board, card, edit, context.now())
    )
    return render(context, document)
  },
  kanban_card_move: async (context, args) => {
    const name = requiredBoardName(args)
    const card = requiredString(args, 'card')
    const move = {
      column: requiredString(args, 'column'),
      phase: optionalString(args, 'phase'),
      session: optionalString(args, 'session')
    }
    const { document, value } = await changeBoard(
      context,
      slugifyAeroKanban(name),
      CARD_NOT_FOUND,
      (board) => moveAeroKanbanCard(board, card, move, context.now())
    )
    if (move.column !== 'done' || value.previousColumn === 'done' || value.blocks.length === 0) {
      return render(context, document)
    }
    // Aero nudges each downstream board through its inbox; here the agent that moved the card is told.
    const { boards } = await context.store.readAll()
    const unblocked = describeAeroKanbanUnblocks(
      boards,
      makeAeroKanbanRef(name, card),
      value.title,
      value.blocks
    )
    return render(context, document, { unblocked })
  },
  kanban_card_remove: async (context, args) => {
    const name = requiredBoardName(args)
    const card = requiredString(args, 'card')
    const stem = slugifyAeroKanban(name)
    const { result, skipped } = await context.store.transact(
      { required: [stem], all: true },
      (boards) => {
        const document = boards.get(stem)
        if (document === undefined) {
          throw new AeroKanbanError(CARD_NOT_FOUND)
        }
        removeAeroKanbanCard(document, card)
        const changed = purgeAeroKanbanRefs(boards, makeAeroKanbanRef(name, card))
        return { changed: changed.add(stem), result: document }
      }
    )
    return render(context, result, skipped.length > 0 ? { skipped_boards: skipped } : {})
  },
  kanban_card_link: async (context, args) => {
    const name = requiredBoardName(args)
    const downstream = `${name}/${requiredString(args, 'card')}`
    const upstream = requiredString(args, 'blocked_by')
    const { result } = await context.store.transact(
      { required: aeroKanbanLinkStems(upstream, downstream) },
      (boards) => ({
        changed: linkAeroKanbanCards(boards, upstream, downstream),
        result: boards.get(slugifyAeroKanban(name))
      })
    )
    if (result === undefined) {
      throw new AeroKanbanError('board not found')
    }
    return render(context, result)
  },
  kanban_card_unlink: async (context, args) => {
    const name = requiredBoardName(args)
    const downstream = `${name}/${requiredString(args, 'card')}`
    const upstream = requiredString(args, 'blocked_by')
    const { result } = await context.store.transact(
      { required: aeroKanbanLinkStems(upstream, downstream) },
      (boards) => ({
        changed: unlinkAeroKanbanCards(boards, upstream, downstream),
        result: boards.get(slugifyAeroKanban(name))
      })
    )
    if (result === undefined) {
      throw new AeroKanbanError('board not found')
    }
    return render(context, result)
  },
  kanban_card_answer: async (context, args) => {
    const name = requiredBoardName(args)
    const card = requiredString(args, 'card')
    const answers = answersFromArguments(args)
    const stem = slugifyAeroKanban(name)
    const { value } = await changeBoard(context, stem, `board '${name}' not found`, (board) =>
      answerAeroKanbanClarifications(board, card, answers, 'agent', context.now())
    )
    return JSON.stringify({
      stored: value,
      via: 'agent',
      board_path: context.store.boardPath(stem)
    })
  }
}

const handlers: Record<string, Handler> = { ...boardHandlers, ...cardHandlers }

/**
 * The kanban tools of AeroFortress's `knowledge` server for the repo at `root`: same names and
 * arguments, answering with the JSON Aero prints. They write `.aerofortress/kanban` of the repo's
 * primary checkout (see `resolveAeroKanbanRoot`). `workspace` is accepted and ignored: one repo.
 */
export function createAeroKanbanTools(
  root: string,
  options: { lock?: AeroKnowledgeLockOptions; now?: () => Date } = {}
): AeroKanbanTools {
  let context: Promise<Context> | undefined
  const contextOf = (): Promise<Context> => {
    context ??= resolveAeroKanbanRoot(root).then((primary) => ({
      store: createAeroKanbanStore(primary, options.lock),
      dataDirectory: join(primary, '.aerofortress'),
      now: () => aeroKanbanTimestamp((options.now ?? (() => new Date()))())
    }))
    return context
  }
  return {
    handles: (name) => Object.hasOwn(handlers, name),
    call: async (name, args) => {
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined
      if (!handler) {
        throw new Error(`unknown tool: ${name}`)
      }
      return handler(await contextOf(), args)
    }
  }
}
