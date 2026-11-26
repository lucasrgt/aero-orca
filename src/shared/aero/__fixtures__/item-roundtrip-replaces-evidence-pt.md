---
id: 0085bc84-04b0-4988-9d66-080268569376
slug: arch
type: decision
title: Aba Diagramas REMOVIDA — Mermaid no markdown cobre o caso
tags: diagramas, removido, mermaid, ui, mcp, retirada
provenance: dito
evidence: Removida em v0.12.11 (2026-06-22): frontend (tab + view + src/Diagrams.tsx + src/diagram-layout.ts deletados, api.ts diagram*, integração "adicionar a um diagrama" no drawer do Knowledge, mock dev-harness), backend (src-tauri/src/diagrams.rs deletado, 5 commands Tauri diagram_* no main.rs, 5 tools MCP diagram_* no mcp.rs), CLAUDE.md. tsc + cargo check verdes.
decay: stable
created: 2026-06-23T02:16:12.967602+00:00
updated: 2026-06-23T02:16:19.223311600+00:00
validated: 2026-06-23T02:16:12.967602+00:00
links: replaces:60349aeb-6e19-4a72-9030-5890e5d14947
---

A aba Diagramas (o quadro freeform FigJam/Miro com tools MCP `diagram_*`, knowledge↔card bidirecional, canvas React Flow) foi **REMOVIDA inteira** a pedido da Ana (2026-06-22): "não é tão útil mais. mermaid funciona melhor e cabe direto no md".

Racional: desenho técnico passa a ser **Mermaid embutido no markdown** (renderiza no próprio chat), em vez de uma superfície dedicada + tools MCP + backend próprio. Menos superfície pra manter, e o agente não precisa mais aprender um vocabulário de cards/edges/rows.

Removido ponta a ponta: tab + view + `src/Diagrams.tsx` + `src/diagram-layout.ts`; `api.ts` (listDiagrams/getDiagram/saveDiagram/deleteDiagram/addDiagramCard); a integração "adicionar a um diagrama" no drawer do Knowledge (knowledge→card); `src-tauri/src/diagrams.rs`; os 5 commands Tauri (`diagram_list/get/save/delete/add_card`); as 5 tools MCP (`diagram_set/get/list/add/link`); CLAUDE.md. tsc e cargo check verdes; o dev compilou e subiu sem diagrams.

Aposenta [[aba-diagramas-quadro-freeform-figjam-miro-sobre-o-grafo-de-cards]] (60349aeb). Sobras inertes deixadas de propósito (custo > valor): CSS morto `.diag-*`/`.diagrams`, deps `@dagrejs/dagre`+`@xyflow/react` no package.json, e o mecanismo `nebOpenItem` (abrir item por clique em card vinculado) que agora nunca dispara.
