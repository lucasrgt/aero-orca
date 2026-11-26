---
id: 155449b0-37b9-4364-aec1-3d96c818ed04
slug: arch
type: fact
title: Updater installer is unsigned and triggers Kaspersky PDM behavioral detection
tags: 
provenance: observado
evidence: 
decay: stable
created: 2026-10-16T19:47:56.007496500+00:00
updated: 2026-10-16T19:47:56.007496500+00:00
validated: 2026-10-16T19:47:56.007496500+00:00
links: 
---

The AeroFortress Harness 2.7.2 self-updater downloads the installer to `%TEMP%\aerofortress-update-<version>\` and runs it silently, then closes the app. The Kaspersky PDM (behavioral) heuristic flagged that flow as dropper-like. The installer is not signed with Authenticode (`Get-AuthenticodeSignature` returns `NotSigned`), which weighs heavily in this heuristic. The SHA-256 matched the GitHub release asset, and the updater checks the minisign signature before running (`updater.rs:323`), so the detection is a false positive. Remedy on the user side: whitelist the installed exe as a trusted application in Kaspersky. Real fix: sign the installer in `release.yml`, for example with Azure Trusted Signing (requires an account and identity validation). Until then, each release may trigger the same detection.
