---
id: 54a66be5-9dcf-468f-966d-fe591fdbdf78
slug: specs
type: doc
title: Team mode — the 3.0 seed (design): git-only transport, author axis, curation via PR
tags: roadmap-2.0, team-mode, 3.0, design
provenance: observado
evidence: .aerofortress/specs/team-mode-3.0-seed.md
decay: stable
created: 2026-07-02T22:34:49.359675500+00:00
updated: 2026-07-02T22:42:15.413401700+00:00
validated: 2026-07-02T22:34:49.359675500+00:00
links: replaces:a7042576-0ad5-49ee-8d23-7a84b596423c
---

F30 design seed (2026-07-02), shipped as `.aerofortress/specs/team-mode-3.0-seed.md`. The 3.0 series builds on it pillar-by-pillar; nothing in 2.x depends on it.

**The three pillars:** (1) Per-author provenance — authorship is a SEPARATE axis from epistemic provenance: `author:` frontmatter stamped from git config at store time (absent = legacy), agents credit their human, scars stay team-wide (the immune system protects everyone). (2) Curation via PR — the G31 lint (`--lint-knowledge`) is the mechanical CI gate; CODEOWNERS on decisions/rules; conflicts are git's and rare by construction (one item = one uuid-named file); `replaces` keeps retirement reviewable. (3) Travels vs personal — `.aerofortress/` shared (items, specs, agents, scars); `constellation/` NEVER (sessions, SOUL, credentials, budgets); heat/index stay per-machine BY DESIGN.

**Non-goals settled now:** no server/accounts/realtime sync (git is the transport — extends the F26 no-auth decision); no per-item ACLs (the repo's access model IS the model); no metric ranking teammates; personal state never travels, even opt-in.

**Mechanical aids ordered by value:** author stamping+facet → pr-knowledge skill → CODEOWNERS template → identity setting → cross-author dup detection (last, only if real teams hit it).
