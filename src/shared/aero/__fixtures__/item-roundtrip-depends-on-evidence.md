---
id: b07f692d-6c6a-48ff-a53f-c0c0db4821fc
slug: arch
type: fact
title: C15 — Traceability matrix + 2-doctors gate (Clockwork Phase 4): rendered, blocks done
tags: roadmap-2.0, clockwork, pipelines, gates
provenance: observado
evidence: src-tauri/src/pipeline.rs (gate_from, close, close_doc); src/components.tsx (PipelinePanel matrix); commit 87a8f09
decay: stable
created: 2026-07-02T21:07:27.576012300+00:00
updated: 2026-07-02T21:24:14.132196400+00:00
validated: 2026-07-02T21:24:14.132196400+00:00
links: depends_on:dcfb7979-24ae-4fe8-9073-7b08d217a8ea
---

SHIPPED v1.8.19 (commit 87a8f09). Closes Clockwork Phase 4 inside the harness — on top of the C14 checklist engine ([[dcfb7979]]).

**The gate** (spec `aerofortress-ecosystem.md`: done ⟺ LZ green ∧ every criterion pass):
- Run file gains `[doctors]`: `lz = "<cmd>"` — the STATIC doctor (form: af doctor / clippy / eslint); `lz_label` optional display name. `PipelineDef` can declare it too; the pipeline-run skill copies it at materialization.
- `close_doc` (pure core) refuses done while a declared LZ lacks a passing verdict at ledger key `(phase="doctors", sensor="lz")` — uncircumventable, hermetically tested.
- `pipeline_close(done)` RE-RUNS the doctor FRESH via `sensor_run(DOCTORS_PHASE, LZ_SENSOR, cmd)` before closing — a stale green never unlocks done; a red records in the ledger (trilho shows it) and blocks with the output tail. Aborting never consults doctors.

**The computed gate**: `gate_from(doctors, criteria, attests)` (pure) → `{lz: pass|fail|pending|null, lzLabel, criteriaTotal/Pass/Fail, doneUnlocked}`, filled by `pipeline_state` (never stored), carried by `criteria_status`.

**The matrix (UI)**: rendered in `PipelinePanel` (chat trilho + Observatory reuse it verbatim) — one row per criterion: verdict icon (shield family, sensor palette) + id + statement, binding + proof on hover (traceability criterion → binding → verdict), via chip (observed/cmd); the LZ doctor row; the gate chip "done locked/unlocked". CSS `.pl-matrix/.pl-crit/.pl-gate` in redesign.css.

Tests: `close_done_requires_the_static_doctor_when_declared`, `gate_joins_the_two_doctors` — 114 green.
