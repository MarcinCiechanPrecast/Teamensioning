---
change_id: dashboard-ui-tokens
title: Dashboard UI on design tokens and shared components
status: archived
created: 2026-10-25
updated: 2026-10-27
archived_at: 2026-10-27T14:24:35Z
---

## Notes

- **View:** `/dashboard` (`src/pages/dashboard.astro`). One view plus global tokens.
- **Contract variant:** existing design system with a dead token file. The shadcn `:root`/`.dark` tokens and `@theme inline` in `src/styles/global.css` already exist, and only `ui/button.tsx` reads them. Phase 1 is making the view read them. No `shadcn init`, no second palette.
- **Token source:** `src/styles/global.css`. That includes `bg-cosmic` (`global.css:113`), which hardcodes hex outside the token layer.
- **Component source:** `src/components/ui/`, which has only `button.tsx` and `LibBadge.astro`. Add missing ones with `npx shadcn@latest add <name>`.
- **Pre-audit counts:** 11 lines in `dashboard.astro` hit the hardcoded-value scan. No view uses semantic token classes.
- **Candidate charges (to confirm in research):**
  1. Palette classes and `white/N` surfaces instead of tokens.
  2. `bg-cosmic` raw hex is invisible to dark mode.
  3. Hand-built row link, alert and sign-out button instead of shared components.
  4. Sign-out sits in the card body, there is no Topbar, and `?error=` is rendered as-is.
- **Theme decision (2026-10-25):** use the tweakcn "Jamaica" preset (green `--primary`, yellow `--secondary`, Outfit font, radius 1.25rem). Raw values are deposited in `theme-jamaica.md` in this folder, and the source URL goes in a comment next to the edited block in `global.css`. This replaces the purple accent. Map the values onto the existing variable names, with no second palette.
- **Theme source (assumed, open to change):** dark by default via `class="dark"` on `<html>` in `Layout.astro`, since every view today is dark. Topbar stays out of scope.
- **Out of scope:** the other 8 pages (they inherit the contract later), a rebrand, and new dependencies.
