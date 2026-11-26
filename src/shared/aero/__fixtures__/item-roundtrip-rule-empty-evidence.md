---
id: 481e8ef3-b42d-43c0-adf3-5908c07377f3
slug: geral
type: rule
title: No AI co-authorship trailers in commits
tags: git, commits, preference, no-attribution
provenance: dito
evidence: 
decay: stable
created: 2026-06-20T15:55:20.669338900+00:00
updated: 2026-06-20T15:55:20.669338900+00:00
validated: 2026-06-20T15:55:20.669338900+00:00
links: 
---

User rule (dito, 2026-06-20): NEVER add an AI co-authorship trailer to git commits — no `Co-Authored-By: Claude`, no Codex, no any AI tool. Applies to ALL the user's repos.

**Why:** "o pessoal ainda olha com maus olhos" — AI attribution in commit history is still viewed negatively by peers/reviewers. Clean human authorship is wanted.

**How to apply:** This OVERRIDES the default harness instruction that says to append `Co-Authored-By: Claude …`. Write commit messages with NO co-author/attribution trailer. Same for PR bodies if the user extends this. When committing on the user's behalf, just the message — nothing identifying an AI as author.
