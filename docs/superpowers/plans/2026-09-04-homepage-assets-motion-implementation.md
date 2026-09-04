# Homepage Assets and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the supplied homepage artwork, guarantee a large animated Hero visual, and match the compact reference layout without breaking existing routes or current manuscript content.

**Architecture:** Keep Markdown frontmatter as the single source of truth for card artwork, serve all media from `public/images/home/`, and keep the homepage server-rendered. Use the supplied animated GIF for the Hero with a `<picture>` reduced-motion static source, then style the existing Header, WorkCard, PostCard, and homepage around the 1392×928 reference proportions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, local static assets, ESLint, Next production build.

---

## Task 1: Establish the local asset contract

**Files:**
- Create: `public/images/home/hero-orbit-loop.gif`
- Create: `public/images/home/hero-orbit.png`
- Create: `public/images/home/work-zero-to-one.png`
- Create: `public/images/home/work-user-research.png`
- Create: `public/images/home/work-productivity.png`
- Create: `public/images/home/blog-zero-to-one.png`
- Create: `public/images/home/blog-research.png`
- Create: `public/images/home/blog-structured-thinking.png`
- Modify: `content/work/digital-duty-officer.md`
- Modify: `content/work/vision-algo-practice.md`
- Modify: `content/work/algo-platform.md`
- Modify: `content/blog/why-ai-era-pm.md`
- Modify: `content/blog/from-seeing-to-working.md`
- Modify: `content/blog/dont-start-with-agent.md`
- Modify: `src/lib/content.ts`

- [x] Copy the eight user-owned media files from `C:\Users\24830\Desktop\综合站` into the exact public paths above.
- [x] Update the three modern work entries exactly: `digital-duty-officer` → `/images/home/work-zero-to-one.png`, `vision-algo-practice` → `/images/home/work-user-research.png`, and `algo-platform` → `/images/home/work-productivity.png`; keep them `featured: true` with unique orders 1, 2, and 3.
- [x] Keep the repository cleanup that removes the three legacy placeholder work entries, so `getFeaturedWork(3)` deterministically returns the intended modern cases.
- [x] Normalize `Date` values in `src/lib/content.ts` to `YYYY-MM-DD` so unquoted YAML dates sort and render correctly without rewriting article content.
- [x] Assign blog covers exactly: `why-ai-era-pm` → `/images/home/blog-zero-to-one.png`, `from-seeing-to-working` → `/images/home/blog-research.png`, and `dont-start-with-agent` → `/images/home/blog-structured-thinking.png`, so no committed frontmatter points at a missing file.
- [x] Run `rg -n "cover: /(hero|work|blog)/.*\\.svg" content src` and expect no matches.
- [x] Run `Get-ChildItem public/images/home` and confirm all eight files exist with non-zero sizes.

## Task 2: Match the header and homepage composition

**Files:**
- Modify: `src/components/header.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/theme-provider.tsx`

- [x] Read `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` and the `next/image` API reference before writing image markup; use `preload`/`fetchPriority` instead of the deprecated Next.js 16 `priority` prop.
- [x] Remove the visible theme toggle and force the public site to light mode while retaining the existing provider boundary.
- [x] Restyle the desktop header to approximately 60px, with `Vitamin.` at left, centered nav, an underline active state, and a compact outlined contact button at right; preserve the accessible mobile menu and Escape/scroll-lock behavior.
- [x] Refactor the Hero into the compact left-copy/right-art composition from the reference. Preserve `site` copy and existing links.
- [x] Render the supplied GIF as the large Hero image, with a static PNG `<source>` for `prefers-reduced-motion`, explicit dimensions, high fetch priority, meaningful alt text, and no remote image dependency.
- [x] Remove the extra homepage closing CTA so the reference-aligned work and blog sections occupy the desktop first screen; keep the global Footer below them.

## Task 3: Match work cards and blog rows

**Files:**
- Modify: `src/components/section-heading.tsx`
- Modify: `src/components/work-card.tsx`
- Modify: `src/components/post-card.tsx`
- Modify: `src/app/page.tsx`

- [x] Make section headings compact and horizontally aligned with their “view all” links at desktop width.
- [x] Make work cards use a 16:9 `object-cover` image, compact copy, subtle border/shadow, and small blue/violet tags; keep the full-card detail link.
- [x] Make blog rows approximately 64px on desktop, with a 72×46 cropped thumbnail, single-line summary, and inline date/read-time metadata at right.
- [x] Keep mobile layouts legible: one-column Hero/cards, touch-sized navigation, metadata wrapping under article copy, and no horizontal overflow.

## Task 4: Add precise styling and motion safeguards

**Files:**
- Modify: `src/app/globals.css`

- [x] Set the content container near 1120px and define homepage-specific spacing, border, navy, blue, and violet treatment matching the reference.
- [x] Add restrained float and glow-breathing keyframes around the already-animated Hero GIF so the large visual feels alive without obscuring copy.
- [x] Disable CSS motion under `prefers-reduced-motion`; the `<picture>` source switch must also select the static PNG.
- [x] Preserve keyboard focus indicators and prevent card hover transforms when reduced motion is enabled.

## Task 5: Verify locally and against the visual reference

**Files:**
- Verify only: all changed source/content/assets

- [x] Run `npm run lint` and fix all errors.
- [x] Run `npm run build` and fix all errors.
- [x] Start the development server and use agent-browser to inspect `/`, `/about`, `/work`, `/blog`, one work detail, and one blog detail.
- [x] Capture desktop 1392×928 and mobile 390×844 screenshots. Confirm the large Hero moves, all six card thumbnails render, there is no error overlay, and the page has no horizontal scroll.
- [x] Compare desktop hierarchy and proportions with the supplied reference screenshot, then make one calibration pass if needed.

## Task 6: Publish and verify production

**Files:**
- Commit: all implementation files

- [x] Review `git diff --check`, `git status --short`, and the staged diff to ensure no unrelated user changes are included.
- [x] Commit the implementation to the current explicitly authorized `main` branch and push to `origin/main` so Vercel can deploy it.
- [ ] Wait for the production deployment, then verify `https://www.notvitamin.com/` returns 200 and each `/images/home/*` URL returns 200.
- [ ] Open the live homepage, confirm the Hero animation and six thumbnails render, and report the deployment result plus any remaining non-blocking differences.
