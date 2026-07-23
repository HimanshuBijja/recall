# 00 — Project Overview

**Recall** is a local-first, single-user flashcard app for spaced revision.

## Purpose
Author flashcards, run timed/shuffled test sessions, and track understanding
over time (accuracy, weak tags, confidence calibration) so revision focuses on
what the learner knows least.

## Users
Single user (the owner). No auth. Used mainly on **mobile** (the deployed
Vercel app) and also on a **laptop** (localhost).

## Card kinds
- **MCQ** — one correct answer + 3 distractors.
- **tf-sort** — sort a set of statements into True/False bins; scored
  all-or-nothing.
- Planned: cloze, match-the-following, flashcards (swipe). See
  `docs/superpowers/plans/2026-07-23-recall-upgrades-roadmap.md`.

## Core objects
Cards, Tags (a DAG with multiple parents), Groups (saved tag bundles),
Sessions (test results), Bin (soft-deleted items, 30-day auto-purge).

## Storage model (current)
- **MongoDB Atlas** is the source of truth; the app connects to `MONGODB_URI`
  on both localhost and Vercel. Writable in production.
- A **local mongod** is kept as a one-way live mirror of Atlas (backup / offline
  copy). The app never treats local as authoritative.

## Key references
- `CLAUDE.md` / `AGENTS.md` — canonical app conventions (kept in sync with code).
- `docs/superpowers/plans/` — the migration plan and upgrade roadmap.
