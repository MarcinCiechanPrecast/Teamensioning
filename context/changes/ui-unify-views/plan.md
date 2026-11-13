# Apply the Dashboard UI style to every remaining view — Implementation Plan

## Overview

Move every non-dashboard view off the starter "cosmic glass" theme (`bg-white/10 backdrop-blur`, `text-blue-100/*`, `text-purple-300`, `bg-purple-600`) onto the Dashboard contract: Jamaica tokens, a `bg-cosmic` wrapper, shadcn `Card`/`Button`/`Alert`/`Input`/`Label`, and the `outline-hidden` focus pattern. Then widen `npm run check:ui` so every view stays on the tokens.

## Current State Analysis

- 116 literal lines in 18 of 28 view files (guard run with explicit paths at 64eae1a; per-file table in `research.md`).
- The shared form parts `src/components/auth/{FormField,ServerError,SubmitButton,PasswordToggle}.tsx` are used by signin, signup, `leagues/new` and `leagues/[id]/edit`. They leak glass styling into views that are otherwise clean (`edit.astro`, `SignInForm.tsx`, `EditLeagueSettingsForm.tsx`).
- `src/components/ui/` has only `alert`, `button`, `card` and `LibBadge` (non-compliant). There is no `--success` token, so blue "status" boxes have no token equivalent.
- The guard scans only `dashboard.astro`, `components/dashboard/*.astro` and `components/cup/*.astro`, and only `.astro` files (`scripts/check-ui-literals.mjs:24-37`). The lint-staged glob is narrower still (`package.json:74-76`).

## Desired End State

- Every file under `src/pages/**` and `src/components/**` (except `src/components/ui/`) and `src/layouts/**` passes `npm run check:ui`, which scans that whole set by default (`.astro` + `.tsx`).
- Each page renders on `bg-cosmic` with a shadcn `Card` shell and a `text-foreground` heading (no gradient text). Buttons and CTAs use `buttonVariants`/`Button`, errors use `Alert variant="destructive"`, confirmations use `Alert variant="success" role="status"`, and fields use shadcn `Input` + `Label`.
- All existing unit, integration, smoke and E2E checks pass unchanged (no assertion edits).
- Screenshots of every migrated page sit in `context/changes/ui-unify-views/screens/`.
- `AGENTS.md`, `test-plan.md` and `roadmap.md` describe the widened guard and the full-app contract.

### Key Discoveries:

- `Alert` spreads `{...props}` after `role="alert"` (`src/components/ui/alert.tsx:22`), so `<Alert role="status">` overrides the role with no change to the component.
- Reference implementation: `src/components/dashboard/DashboardView.astro:17-56`. Tokenized input class with focus pattern: `src/components/cup/Bracket.astro:22-25`.
- `--destructive` (dark) was tuned for AA on `--card` (`src/styles/global.css:62-64`). `--success` must meet the same bar (≥ 4.5:1 for text on `--card`).
- shadcn config is new-york, cssVariables, lucide (`components.json`). Add components with `npx shadcn@latest add`, never `init` (`context/archive/2026-10-25-dashboard-ui-tokens/plan.md:71`).
- `src/pages/dev/dashboard-states.astro` already passes the guard (0 hits), so it can stay in the widened default scope.

## What We're NOT Doing

- No content rewrite of the landing page. `Welcome.astro` keeps its copy and structure (restyle only, user decision 3).
- No shared `ScoreFixtureRow` extraction. The fixture rows in `t/[token].astro` and `OrganizerFixtureList.astro` are restyled in place, and `Bracket.astro` is not touched (keeps the `ml-2` asserted at `tests/e2e/cup-flow.spec.ts:72`).
- No new kitchen-sink page. The visual gate is browser screenshots (user decision).
- No fix for free-text `?error=` on signin/signup/new (security item from ui-push-readiness research, out of scope).
- No theme toggle or light-mode work. No changes to `src/components/ui/button.tsx`'s stock `outline-none`.
- No edits to test assertions. If a test fails, the markup is wrong, not the test.
- No changes to the dashboard files (`dashboard.astro`, `components/dashboard/*`, `dev/dashboard-states.astro`).

## Implementation Approach

The work runs in four packages with disjoint file sets. **Phase 1 (foundation)** must land first: it owns every file that more than one view needs (tokens, `ui/` components, shared form parts, Banner). **Phases 2, 3 and 4** share no files and run in parallel. **Phase 5** widens the guard only after all views are clean, so CI stays green at every step. **Phase 6** updates the docs.

## Critical Implementation Details

- **Test contracts that a restyle must preserve** (from research, `tests/e2e/**`, `scripts/smoke.mjs`):
  - Exact labels: "Email", "Password", "Confirm password", "League name", "Win", "Draw", "Loss", "Player N", "Cup name", "Share link", "Score of X".
  - Button names: "Create account", "Sign in", "Add player", "Create league", "Create cup", "Save", "Delete permanently".
  - Format choice stays a native `<input type="radio" name="format">`.
  - Element structure: a real `<input aria-label="Share link" data-share-url=…>`; `name="matchId"` in the same tag as its UUID value; `<table>` + `<caption>Standings</caption>` with `<th scope="row">` + `<td>` in fixed order; the "League not found" heading.
  - Native form POSTs with the existing `name` attributes; `astro-island` hydration of React islands.
  - At most one `role="status"` and one `role="alert"` element visible per page state (strict page-wide lookups).
- **shadcn `Input` must keep `id`/`name`/`value`/`onChange` passthrough.** `Label htmlFor` must stay in step with `id`, otherwise every `getByLabel` breaks.
- **`PasswordToggle` aria-label** stays "Show password"/"Hide password". Anything containing just "Password" makes the exact "Password" lookup ambiguous.

## Phase 1: Foundation

### Overview

Add the missing building blocks and migrate every file that more than one view package depends on.

### Changes Required:

#### 1. Success token

**File**: `src/styles/global.css`

**Intent**: Add a `--success` token (Jamaica green) for confirmation messages, in both themes, published to Tailwind as `success`.

**Contract**: `--success` in `:root` and `.dark`, plus `--color-success: var(--success)` in `@theme inline`. Text contrast on `--card` ≥ 4.5:1 in `.dark` (the theme users see). Document the value's provenance in a comment, like `--destructive` at `:62-64`.

#### 2. shadcn input and label

**File**: `src/components/ui/input.tsx`, `src/components/ui/label.tsx` (new, via `npx shadcn@latest add input label`)

**Intent**: Provide the standard field primitives the AGENTS.md rule requires instead of hand-built inputs.

**Contract**: Stock shadcn new-york output. Accept any added dependency (`@radix-ui/react-label` or `radix-ui`) in `package.json`. Do not run `shadcn init`.

#### 3. Alert success variant

**File**: `src/components/ui/alert.tsx`

**Intent**: Add a `success` variant mirroring `destructive` with the `success` token.

**Contract**: `variant: "success"` → `bg-card text-success *:data-[slot=alert-description]:text-success/90 [&>svg]:text-current`. Callers pass `role="status"`.

#### 4. Shared form parts

**File**: `src/components/auth/FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx`

**Intent**: Rebuild on tokens and shadcn primitives so every form inherits the contract.

**Contract**:

- `FormField` keeps its props API (`id`, `name`, `label`, `type`, `value`, `onChange`, `placeholder`, `error`, `hint`, `icon`, `endContent`). It renders `Label` + `Input` with a leading icon (`text-muted-foreground`) and the error text in `text-destructive`. It sets `aria-invalid` and links the error/hint with `aria-describedby` (a11y item from ui-push-readiness research).
- `ServerError` renders `Alert variant="destructive"` with the `CircleAlert` icon. It still returns `null` without a message.
- `SubmitButton` uses `Button` default variant, full width. The spinner uses `border-primary-foreground` tokens.
- `PasswordToggle` uses `text-muted-foreground hover:text-foreground`, a visible focus ring, and unchanged aria-labels.

#### 5. Banner

**File**: `src/components/Banner.astro`

**Intent**: Drop the scoped hex `<style>`, use token classes per variant, and keep the role logic.

**Contract**: Variants `info` → `bg-card text-foreground border-border`, `warning` → `text-secondary border-secondary bg-card`, `error` → `text-destructive border-destructive bg-card`. Keep `role` as `alert` for error and `status` otherwise. No `<style>` hex, no `style=`.

### Success Criteria:

#### Automated Verification:

- Guard passes on the phase files: `node scripts/check-ui-literals.mjs src/components/auth/FormField.tsx src/components/auth/ServerError.tsx src/components/auth/SubmitButton.tsx src/components/auth/PasswordToggle.tsx src/components/Banner.astro`
- `npm run lint`, `npm test` and `npx astro check` pass
- `npm run build` succeeds

#### Manual Verification:

- Signin form in the browser shows token-styled fields, error text and submit button. The success Alert renders legibly in dark mode.

---

## Phase 2: Auth & landing (parallel A)

### Overview

Migrate the landing and auth pages. Files: `src/pages/index.astro`, `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/components/ui/LibBadge.astro`, `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/components/auth/{SignInForm,SignUpForm}.tsx`.

### Changes Required:

#### 1. Auth pages

**File**: `src/pages/auth/{signin,signup,confirm-email}.astro`

**Intent**: Replace the glass shell and gradient heading with `Card` (`max-w-sm`) and a `text-foreground` heading. Footer links use `text-primary hover:underline` plus the focus pattern.

**Contract**: The page wrapper stays `bg-cosmic flex min-h-screen items-center justify-center p-4`. Headings and link texts are unchanged.

#### 2. Auth forms

**File**: `src/components/auth/{SignInForm,SignUpForm}.tsx`

**Intent**: Remove the remaining literals (`SignUpForm.tsx:59` hint → `text-muted-foreground`). Rely on the Phase 1 parts.

**Contract**: Field ids, names and labels are unchanged.

#### 3. Landing

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/components/ui/LibBadge.astro`, `src/pages/index.astro`

**Intent**: Restyle only. The hero heading becomes `text-foreground`, CTAs use `buttonVariants()` / `buttonVariants({ variant: "outline" })`, and the feature cards use `Card`. Blobs use standard sizes and `bg-primary/20`-style token tints. Drop the inline-style star field. Topbar becomes a `Card`-like bar with `text-muted-foreground` email (truncated) and `text-primary` links. LibBadge uses `bg-accent text-accent-foreground border-border`.

**Contract**: No `style=`, no arbitrary lengths, no palette classes. Copy and links are unchanged.

### Success Criteria:

#### Automated Verification:

- Guard passes on every Phase 2 file: `node scripts/check-ui-literals.mjs src/pages/index.astro src/components/Welcome.astro src/components/Topbar.astro src/components/ui/LibBadge.astro src/pages/auth/signin.astro src/pages/auth/signup.astro src/pages/auth/confirm-email.astro src/components/auth/SignInForm.tsx src/components/auth/SignUpForm.tsx`
- `npm run lint`, `npm test` and `npx astro check` pass

#### Manual Verification:

- `/`, `/auth/signin`, `/auth/signup` and `/auth/confirm-email` look consistent with the dashboard (screenshots saved).

---

## Phase 3: League forms (parallel B)

### Overview

Files: `src/pages/leagues/new.astro`, `src/pages/leagues/[id]/edit.astro`, `src/pages/leagues/[id]/delete.astro`, `src/components/leagues/{CreateLeagueForm,EditLeagueSettingsForm,PlayerListField}.tsx`.

### Changes Required:

#### 1. Pages

**File**: `src/pages/leagues/new.astro`, `src/pages/leagues/[id]/delete.astro` (`edit.astro` only if residual)

**Intent**: Use the `Card` shell (`max-w-lg`) and a `text-foreground` heading. The delete button uses `buttonVariants({ variant: "destructive" })`, back links use `text-primary`, and the not-found block uses `Card` + `text-muted-foreground`, matching `edit.astro:81-85`.

**Contract**: "Delete permanently" stays a native submit button. Headings and texts are unchanged.

#### 2. Form components

**File**: `src/components/leagues/{CreateLeagueForm,PlayerListField}.tsx` (`EditLeagueSettingsForm.tsx` only if residual)

**Intent**: The format legend and player legend use `Label`-style `text-sm text-foreground`/`text-muted-foreground`. Radio labels use token text and keep native radios. The remove-player icon button uses `text-muted-foreground` plus the focus ring. The "Add player" button uses `Button variant="outline"` (dashed allowed via `border-dashed`). Error text uses `text-destructive`.

**Contract**: Native `<input type="radio" name="format">`. Aria-labels "Remove player N" and labels "Player N" are unchanged.

### Success Criteria:

#### Automated Verification:

- Guard passes on every Phase 3 file: `node scripts/check-ui-literals.mjs src/pages/leagues/new.astro src/pages/leagues/[id]/edit.astro src/pages/leagues/[id]/delete.astro src/components/leagues/CreateLeagueForm.tsx src/components/leagues/EditLeagueSettingsForm.tsx src/components/leagues/PlayerListField.tsx`
- `npm run lint`, `npm test` and `npx astro check` pass

#### Manual Verification:

- `/leagues/new` (league and cup formats, validation errors), `/leagues/<id>/edit` and `/leagues/<id>/delete` match the dashboard look (screenshots saved).

---

## Phase 4: League & share views (parallel C)

### Overview

Files: `src/pages/leagues/[id].astro`, `src/pages/t/[token].astro`, `src/components/leagues/OrganizerFixtureList.astro`, `src/components/leagues/CopyLinkField.tsx`.

### Changes Required:

#### 1. Organizer and share pages

**File**: `src/pages/leagues/[id].astro`, `src/pages/t/[token].astro`

**Intent**:

- Use the `Card` shell (`max-w-lg`) and a `text-foreground` heading; secondary lines use `text-muted-foreground` (fixes the 4.31:1 `text-blue-100/50`).
- Red boxes become `Alert variant="destructive"` and blue boxes become `Alert variant="success" role="status"`.
- The player `<select>` and the fixture rows use the `Bracket.astro:22-25` input pattern (`border-input bg-background text-foreground` plus focus). Save buttons use `buttonVariants({ variant: "outline", size: "sm" })`. Rows use `border-border bg-card`.
- Action links use `text-primary`; the delete link uses `text-destructive`. The not-found block uses `Card`.

**Contract**:

- Fixture rows are restyled in place (no extraction).
- Keep `name="matchId"` next to its value, the `Score of X` aria-labels, the Standings `<table>`/`<caption>`/`<th scope=row>` structure, and every visible string smoke checks.
- `<option>` drops `text-black` in favour of the token background.
- Exactly one status/alert element is rendered per state, as today.

#### 2. Organizer components

**File**: `src/components/leagues/OrganizerFixtureList.astro`, `src/components/leagues/CopyLinkField.tsx`

**Intent**: Same patterns. `CopyLinkField` uses shadcn `Input` (readOnly) and `Button variant="outline"`.

**Contract**: `CopyLinkField` keeps a real `<input aria-label="Share link" data-share-url=…>`.

### Success Criteria:

#### Automated Verification:

- Guard passes on every Phase 4 file: `node scripts/check-ui-literals.mjs src/pages/leagues/[id].astro src/pages/t/[token].astro src/components/leagues/OrganizerFixtureList.astro src/components/leagues/CopyLinkField.tsx`
- `npm run lint`, `npm test` and `npx astro check` pass

#### Manual Verification:

- The organizer league page, the share page (with and without a picked player, after a score submit and after an error) and a cup page look consistent (screenshots saved).

---

## Phase 5: Guard & verification

### Overview

Make the guard cover every view by default, prove its scope with a unit test, and run the full gate.

### Changes Required:

#### 1. Guard default scope

**File**: `scripts/check-ui-literals.mjs`

**Intent**: The default scan walks `src/pages`, `src/components` (skipping `src/components/ui`) and `src/layouts` recursively for `.astro` and `.tsx`. It still fails when it scans nothing. The header comment is updated.

**Contract**: The CLI is unchanged (explicit file args still override). Exit codes are unchanged.

#### 2. lint-staged glob

**File**: `package.json`

**Intent**: The glob matches the new default scope so commits are guarded.

**Contract**: `"src/{pages,components,layouts}/**/*.{astro,tsx}"` → `node scripts/check-ui-literals.mjs`. The guard must ignore `src/components/ui/**` when given explicit paths too (filter inside the script), or lint-staged would flag shadcn's own arbitrary values.

#### 3. Guard unit test

**File**: `scripts/check-ui-literals.test.ts` (new)

**Intent**: Prove the scope in a temp-dir fixture tree (pattern of `scripts/agent-hooks.test.ts`): a `.tsx` view with `bg-white/10` fails; the same line in `src/components/ui/x.tsx` passes (both default and explicit-path runs); an empty tree exits 1.

**Contract**: Picked up by the `unit` vitest project (`scripts/**/*.test.ts`).

### Success Criteria:

#### Automated Verification:

- `npm run check:ui` passes and reports ≥ 28 scanned files
- `npm run lint` passes
- `npm test` passes (including the new guard test)
- `npx astro check` passes
- `npm run build` succeeds
- `npm run test:integration` passes against local Supabase
- `npm run smoke` passes against the production preview
- `npm run test:e2e` passes

#### Manual Verification:

- Screenshots of every migrated page are saved under `context/changes/ui-unify-views/screens/`, with no visual regressions against the dashboard look.

---

## Phase 6: Documentation

### Overview

Bring the docs in line with the widened contract.

### Changes Required:

#### 1. Agent rules

**File**: `AGENTS.md` ("### UI")

**Intent**: The guard now covers all views (`.astro` + `.tsx`, excluding `ui/`). Mention the `success` token / Alert variant and shadcn `Input`/`Label` for fields. The visual gate is the kitchen sink for the dashboard plus change screenshots. Drop "Other views are not migrated yet".

**Contract**: The bullets **Guard** and **Visual gate** are rewritten. Add a **Forms** / **Messages** bullet.

#### 2. Foundation docs

**File**: `context/foundation/test-plan.md` (`:92` row), `context/foundation/roadmap.md` (`:208` parked item)

**Intent**: The test-plan guard row says "all views". The parked roadmap item is marked as done by `ui-unify-views`.

**Contract**: Edit the existing rows only.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check AGENTS.md context/foundation/test-plan.md context/foundation/roadmap.md` passes
- `grep -n "not migrated yet" AGENTS.md` returns nothing

#### Manual Verification:

- AGENTS.md "### UI" reads correctly for a new agent.

---

## Testing Strategy

### Unit Tests:

- New `scripts/check-ui-literals.test.ts` (scope: default walk, `ui/` exclusion with and without args, empty-scan failure).

### Integration Tests:

- Existing integration suite, unchanged (no DB changes; proves nothing regressed).

### Manual Testing Steps:

1. Sign up / sign in. Check field focus rings, error text and the server error Alert.
2. Create a league and a cup (validation errors on purpose). Open the league page, copy the share link, edit settings, open delete.
3. On the share page, pick a player, submit a score, re-submit to trigger "already entered", and submit invalid scores.
4. Open `/` signed out and signed in (Topbar).

## Performance Considerations

None. Class changes only, plus two small shadcn components.

## Migration Notes

None. No schema or data changes.

## References

- Research: `context/changes/ui-unify-views/research.md`
- Reference view: `src/components/dashboard/DashboardView.astro:17-56`
- Prior change: `context/archive/2026-10-25-dashboard-ui-tokens/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation

#### Automated

- [x] 1.1 Guard passes on the phase files — 6eddafb
- [x] 1.2 `npm run lint`, `npm test` and `npx astro check` pass — 6eddafb
- [x] 1.3 `npm run build` succeeds — 6eddafb

#### Manual

- [ ] 1.4 Signin form and success Alert render with tokens in the browser

### Phase 2: Auth & landing (parallel A)

#### Automated

- [x] 2.1 Guard passes on every Phase 2 file
- [x] 2.2 `npm run lint`, `npm test` and `npx astro check` pass

#### Manual

- [ ] 2.3 Landing and auth pages match the dashboard look (screenshots saved)

### Phase 3: League forms (parallel B)

#### Automated

- [ ] 3.1 Guard passes on every Phase 3 file
- [ ] 3.2 `npm run lint`, `npm test` and `npx astro check` pass

#### Manual

- [ ] 3.3 New/edit/delete league pages match the dashboard look (screenshots saved)

### Phase 4: League & share views (parallel C)

#### Automated

- [ ] 4.1 Guard passes on every Phase 4 file
- [ ] 4.2 `npm run lint`, `npm test` and `npx astro check` pass

#### Manual

- [ ] 4.3 League, share and cup pages match the dashboard look (screenshots saved)

### Phase 5: Guard & verification

#### Automated

- [ ] 5.1 `npm run check:ui` passes and reports ≥ 28 scanned files
- [ ] 5.2 `npm run lint` passes
- [ ] 5.3 `npm test` passes (including the new guard test)
- [ ] 5.4 `npx astro check` passes
- [ ] 5.5 `npm run build` succeeds
- [ ] 5.6 `npm run test:integration` passes against local Supabase
- [ ] 5.7 `npm run smoke` passes against the production preview
- [ ] 5.8 `npm run test:e2e` passes

#### Manual

- [ ] 5.9 Screenshots of every migrated page saved under screens/

### Phase 6: Documentation

#### Automated

- [ ] 6.1 Prettier check passes on the edited docs
- [ ] 6.2 AGENTS.md no longer says other views are not migrated

#### Manual

- [ ] 6.3 AGENTS.md UI section reads correctly for a new agent
