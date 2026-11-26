import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { AERO_KNOWLEDGE_TOOLS } from './aero-knowledge-tool-schemas'
import { createAeroKnowledgeTools } from './aero-knowledge-tools'

/** Serves AeroFortress's `knowledge` tools for the repo at `root` over stdio until the agent hangs up. */
export async function serveAeroKnowledge(root: string, version: string): Promise<void> {
  const tools = createAeroKnowledgeTools(root)
  const server = new Server({ name: 'knowledge', version }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: AERO_KNOWLEDGE_TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const text = await tools.call(params.name, params.arguments ?? {})
      return { content: [{ type: 'text', text }], isError: false }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `erro: ${reason}` }], isError: true }
    }
  })
  const closed = new Promise<void>((resolve) => {
    server.onclose = resolve
  })
  await server.connect(new StdioServerTransport())
  await closed
}
