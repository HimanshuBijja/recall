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
- **MCQ** — single correct answer + distractors.
- **Multi** — multiple correct answers + distractors.
- **tf-sort** — sort a set of statements into True/False bins; scored all-or-nothing.
- **Flash** — self-graded swipe/flip card (question/answer).
- **Cloze** — fill in the blank (`==answer==`).
- **Match** — match left and right concept pairs.

## Revision Engines
- **Spaced Repetition Drills**: Timed/shuffled test sessions backed by FSRS scheduling (`ts-fsrs`).
- **Notes Revision Engine (`/notes`)**: Linear visual reading of lecture screenshots & notes sorted chronologically by timestamp, with Slide Deck & Continuous modes, Quick Index, PDF print engine, and Master Search Command Palette (`Ctrl+K`).

## Core objects
Cards, Tags (a DAG with multiple parents), Groups (saved tag bundles), Subjects, Sessions, Bin (soft-deleted items), NoteBook (curated study volumes).

## Storage model (current)
- **MongoDB Atlas** is the source of truth; the app connects to `MONGODB_URI`
  on both localhost and Vercel. Writable in production.
- A **local mongod** is kept as a one-way live mirror of Atlas (backup / offline
  copy). The app never treats local as authoritative.

## Key references
- `CLAUDE.md` / `AGENTS.md` — canonical app conventions (kept in sync with code).
- `docs/superpowers/plans/` — the migration plan and upgrade roadmap.
