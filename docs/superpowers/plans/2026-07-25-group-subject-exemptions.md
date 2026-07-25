# Group and Subject Spaced Repetition Exemptions Plan

Allows users to exempt specific Groups or Subjects from spaced repetition scheduling (FSRS due/new queue). If a card is in multiple groups or subjects and at least one is NOT exempted, it remains included. A card is only exempted if all the groups/subjects it belongs to are exempted. Cards in no groups/subjects are included.

## Global Constraints

- **Logical rule**: A card is exempted if and only if it belongs to one or more groups or subjects AND all of those groups/subjects are marked as exempted. If it is in a mixture of exempted and non-exempted groups/subjects, it is included. If it belongs to no groups/subjects, it is included.
- **Verification**: Run typescript check and vitest test suite.
- **Next.js dynamic routes**: dynamic parameters must be awaited.

## File Structure

- `types/index.ts` — Add `exempted?: boolean` to Group and Subject interfaces (modify)
- `app/api/groups/route.ts` — Accept `exempted` in POST (modify)
- `app/api/groups/[id]/route.ts` — Accept `exempted` in PUT (modify)
- `app/api/subjects/route.ts` — Accept `exempted` in POST (modify)
- `app/api/subjects/[id]/route.ts` — Accept `exempted` in PUT (modify)
- `lib/exemptions.ts` — Logic to calculate card exemptions (create)
- `lib/exemptions.test.ts` — Unit tests for exemptions logic (create)
- `app/page.tsx` — Filter cards before getReviewsSummary (modify)
- `app/test/due/page.tsx` — Filter cards before selectDue (modify)
- `app/analytics/page.tsx` — Filter cards before analytics computations (modify)
- `app/api/reviews/due/route.ts` — Filter cards before selectDue (modify)
- `app/api/reviews/summary/route.ts` — Filter cards before getReviewsSummary (modify)
- `app/groups/GroupsManager.tsx` — Checkbox in GroupEditor, EXEMPT badge (modify)
- `app/groups/[id]/GroupDetailClient.tsx` — Checkbox in edit form, EXEMPT label under title (modify)
- `app/subjects/SubjectsClient.tsx` — EXEMPT badge (modify)
- `app/subjects/new/NewSubjectClient.tsx` — Checkbox in create form (modify)
- `app/subjects/[id]/SubjectDetailClient.tsx` — Checkbox in edit form, EXEMPT label under title (modify)

## Tasks

- [ ] **Task 1: Model Types & Scorer**
  - Update `types/index.ts` to include `exempted?: boolean` in `Group` and `Subject`.
  - Create `lib/exemptions.ts` and `lib/exemptions.test.ts` to implement and test the card exemption resolver.
  - Verify tests pass: `npx vitest run lib/exemptions.test.ts`
- [ ] **Task 2: API routes update**
  - Accept and persist `exempted` in POST/PUT of `/api/groups`, `/api/groups/[id]`, `/api/subjects`, and `/api/subjects/[id]`.
- [ ] **Task 3: Spaced Repetition Filtering Integration**
  - Apply `filterExemptedCards` to all due card listings and summaries:
    - `app/page.tsx`
    - `app/test/due/page.tsx`
    - `app/analytics/page.tsx`
    - `app/api/reviews/due/route.ts`
    - `app/api/reviews/summary/route.ts`
- [ ] **Task 4: User Interface updates**
  - Add exemption settings toggles and indicator badges to Groups and Subjects client views.
- [ ] **Task 5: Final validation**
  - Run typecheck, linter, and full test suite to confirm green build.
