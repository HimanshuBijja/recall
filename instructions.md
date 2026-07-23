# Project Stack

This project uses:

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI (primitive components used by shadcn/ui)
- Lucide React
- ESLint
- Prettier (if configured)

---

# Project Setup

If the project is not initialized:

1. Create a new Next.js project using **npm**:

   ```bash
   npx create-next-app@latest .
   ```

2. Configure the project with:
   - TypeScript
   - App Router
   - Tailwind CSS
   - Turbopack
   - Import Alias (`@/*`)
3. Use **npm** as the project's package manager.
4. Do not switch package managers or generate lockfiles for pnpm, Yarn, or Bun.
5. Initialize shadcn/ui using the latest stable CLI.
6. Install shadcn/ui components only when they are required.
7. Follow the existing project structure and conventions when adding new files.
8. Do not introduce additional UI libraries without permission (see shadcn/ui Components section).
9. Use the latest stable versions of dependencies unless the project specifies otherwise.
10. Prefer official libraries and documentation by default. If a well-maintained third-party alternative offers significantly better performance, developer experience, or functionality, suggest it along with the trade-offs before adopting it.

---

# shadcn/ui Components

Install components only when they are needed.

Before creating a custom UI component:

1. Check if an equivalent shadcn/ui component exists.
2. If it exists and is not already installed, install it using:

   ```bash
   npx shadcn@latest add <component-name>
   ```

   Example:

   ```bash
   npx shadcn@latest add button
   ```

3. Reuse existing components whenever possible instead of creating duplicates.
4. Extend existing shadcn/ui components instead of rewriting them.
5. Do not manually copy component code from the documentation; always use the shadcn CLI.
6. If the required component is not available in shadcn/ui, check whether it exists in another UI library. Before installing or introducing any additional UI library (e.g., MUI, Ant Design, Chakra UI), ask for permission and provide the available options.
7. Use Radix UI primitives only when shadcn/ui does not provide the required component.
8. Preserve the existing design system, styling conventions, and component APIs.

Common components:

- button
- card
- input
- label
- textarea
- dialog
- dropdown-menu
- popover
- select
- sheet
- separator
- table
- tabs
- toast
- tooltip
- avatar
- badge
- breadcrumb
- calendar
- checkbox
- command
- form
- hover-card
- navigation-menu
- pagination
- progress
- radio-group
- scroll-area
- skeleton
- slider
- switch
- accordion
- alert
- alert-dialog
- aspect-ratio
- collapsible
- context-menu
- drawer
- menubar
- resizable
- sonner

---

# Development Rules

## Components

- Prefer shadcn/ui components over custom implementations.
- Reuse existing components before creating new ones.
- Keep components small and composable.
- Place reusable components in `components/`.
- Keep business logic separate from presentation.
- Prefer composition over prop-heavy components.

---

## Styling

- Use Tailwind CSS.
- Avoid inline styles.
- Use the project's existing design tokens and CSS variables for colors, spacing, and typography.
- Support both light and dark themes.
- Use responsive utility classes.
- Use the `cn()` utility for conditional class names.
- Avoid unnecessary custom CSS when Tailwind utilities are sufficient.

---

## Icons

- Use Lucide React for icons.
- Do not introduce additional icon libraries without permission.
---

## Forms

- Use React Hook Form.
- Use Zod for validation.
- Prefer shadcn Form components.
- Validate data on both the client and server when applicable.

---

## Code Style

- Use TypeScript throughout the project.
- Avoid `any`; prefer explicit types or `unknown` when necessary.
- Prefer async/await over Promise chains.
- Use named exports unless a framework convention requires a default export.
- Keep functions focused on a single responsibility.
- Avoid duplicate logic; extract reusable utilities when appropriate.
- Follow the existing naming conventions in the project.  

---

## Folder Structure

Follow the existing project structure and conventions.

When introducing new code, prefer:

```text
app/
components/
components/ui/
hooks/
lib/
types/
public/
styles/
models/
```

Create new top-level folders only when there is a clear architectural need. 

## Project Architecture

- No file should become excessively large or contain multiple unrelated responsibilities.
- Pages should be thin and primarily responsible for layout and composition.
- Business logic should live outside pages and UI components.
- Extract reusable logic into dedicated modules, hooks, services, or utilities.
- Prefer many small, focused files over a few large files.
- When a file starts handling multiple responsibilities, refactor it into smaller modules.

# Database

- Use MongoDB Atlas as the project's primary database (single-user, cloud-hosted).
- Do not introduce another database without permission.
- Reuse the single cached MongoDB connection (`lib/mongodb.ts`). Do not open multiple connections or create parallel data-access implementations.
- Keep data access separate from UI components and pages — access collections through the shared data layer, never with a driver call inside a component.
- Store the connection string in `MONGODB_URI` (`.env.local`); never hardcode credentials. Keep `.env.example` in sync.
- Organize types/models and database utilities into dedicated files (`types/`, `lib/`).
- Design collections, documents, and indexes according to MongoDB best practices; keep the app-level `id` field distinct from Mongo's `_id`.
- Because the DB is writable in production, runtime writes are allowed (unlike a read-only file snapshot). Load questions via the import flow or a seed script, not by committing data to git.
- Ask for permission before making breaking schema changes or migrations.


# UI Guidelines

- Follow a mobile-first responsive design approach.
- Ensure all pages and components are fully responsive and work well on both mobile and desktop.
- Scale layouts progressively for tablets and larger screens.
- Maintain consistent spacing and visual hierarchy.
- Build accessible components.
- Provide proper loading, empty, and error states.
- Use skeleton loaders for asynchronous content where appropriate.

# Performance

- Prefer Server Components by default; use Client Components only when interactivity or browser APIs are required.
- Lazy-load heavy components when appropriate.
- Optimize images using `next/image` unless there is a specific reason not to.
- Use `next/font` for font optimization.
- Avoid unnecessary re-renders and client-side state.
- Minimize JavaScript sent to the client.
- Avoid unnecessary network requests and duplicate data fetching.

# Accessibility

- Use semantic HTML whenever possible.
- Ensure all interactive elements are keyboard accessible.
- Maintain proper focus management for dialogs, menus, and other interactive components.
- Use ARIA attributes only when native HTML semantics are insufficient.
- Provide accessible names (labels or `aria-label`) for interactive elements where required.
- Do not reduce color contrast below accessible levels.
- Ensure forms have associated labels and meaningful validation messages.

# Verification

Run only the minimum verification required for the changes made.

- Lint only when affected files were modified.
- Typecheck only when TypeScript code was modified.
- Run tests only when relevant.
- Do not run production builds unless explicitly requested.

Report only failures.

If verification succeeds, output only:

```
Verification passed.
```
# Output Rules

Minimize output. Execute tasks silently whenever possible.

Do not output:

- Read operations
- File contents
- Code changes
- Diffs
- Edit operations
- Installation logs
- Command output
- Bash commands
- Tool traces
- Search results
- Test logs
- Lint output
- Typecheck output
- Build output
- Dependency installation progress
- Generated code unless explicitly requested

Only output:

- Current task status
- Blocking issues
- Decisions requiring user input
- Verification failures (if any)
- Final completion summary

If verification succeeds, simply state:

```
Verification passed.
```

Do not explain successful verification.

# Documentation Rules

Before starting any implementation, read:

- docs/ai-memory/00-project-overview.md
- docs/ai-memory/01-architecture.md
- docs/ai-memory/04-current-state.md

Create the `docs/ai-memory` directory and the required files if they do not already exist.

After every feature implementation:

1. Update `docs/ai-memory/02-features-log.md`.
2. Update `docs/ai-memory/04-current-state.md`.
3. Record any significant architectural or technical decisions in `docs/ai-memory/03-decisions.md`.
4. Document:
   - Files added, modified, or removed.
   - New routes or pages.
   - New API endpoints.
   - Database schema/collection changes.
   - Environment variables added or modified.
   - External packages introduced.
   - Breaking changes (if any).
   - Known issues, TODOs, and pending bugs.
5. Update `README.md` if the setup, configuration, or usage instructions have changed.


- Keep documentation synchronized with the implementation.


# Imports

- Use the `@/*` import alias for internal imports.
- Prefer absolute imports over long relative paths.
- Remove unused imports.

# Environment Variables

- Store secrets in `.env.local`.
- Never hardcode secrets, API keys, or credentials.
- Update `.env.example` whenever new environment variables are introduced.

# Error Handling

- Handle expected errors gracefully.
- Avoid empty catch blocks.
- Log only actionable errors.
- Show user-friendly error messages.

# Email

- Use SMTP as the default email transport.
- Configure SMTP credentials through environment variables.
- Never hardcode email credentials.
- Reuse the existing email service or utility instead of creating multiple implementations.
- Ask for permission before introducing a third-party email service (e.g., Resend, SendGrid, Mailgun, AWS SES).

# Git

- the commit message should be on my name 
   <[EMAIL_ADDRESS]>


# bash

- do not ask permissions for simple bash commands

# Guardrails

- always ask for permission before using vertex ai (gemini) which will cost money, i will do the smoke test manually for now