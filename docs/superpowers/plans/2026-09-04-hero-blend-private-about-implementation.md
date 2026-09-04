# Hero Blend and Private About Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blend the supplied animated sphere naturally into the homepage Hero and replace all public real-name references with the approved privacy-safe profile copy.

**Architecture:** Keep `src/lib/site.ts` as the shared source for the homepage, footer, and global metadata. Render one optimized static PNG layer beneath the original animated GIF, align both inside a feathered art container, and handle reduced motion in CSS while retaining the existing server-rendered page structure.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, local PNG/GIF assets, CSS masks and media queries, ESLint, Next production build, browser verification, Vercel Git deployment.

**Design spec:** `docs/superpowers/specs/2026-09-04-hero-blend-and-private-about-design.md`

**Execution precondition:** This plan and its design spec must be committed before Task 1 begins, so implementation starts from a clean worktree.

---

## Task 1: Synchronize the branch and record the failing acceptance checks

**Files:**
- Inspect: `src/lib/site.ts`
- Inspect: `src/app/about/page.tsx`
- Inspect: `src/components/footer.tsx`
- Inspect: `src/app/page.tsx`
- Inspect: `src/app/globals.css`

- [ ] **Step 1: Confirm the worktree only contains the approved local design commit**

Run:

```powershell
git status --short --branch
git log --oneline --decorate --max-count=4
```

Expected: no uncommitted changes; local `main` may be ahead of `origin/main` by the committed design and implementation-plan documents.

- [ ] **Step 2: Fetch the latest remote branch and preserve any concurrent user changes**

Run:

```powershell
git fetch origin main
git rev-list --left-right --count main...origin/main
```

Expected: if the right-hand count is non-zero, rebase the local design commit with `git rebase origin/main`; never force-push and never restore files deliberately removed upstream.

- [ ] **Step 3: Record the privacy check in its currently failing state**

Run:

```powershell
$privateName = -join @([char]0x8881, [char]0x4E2D, [char]0x7FA4)
rg -n --fixed-strings $privateName src content
rg -n "site\.realName|realName:" src content
```

Expected before implementation: matches in `src/lib/site.ts` and `src/app/about/page.tsx`. These matches define the regression that Task 2 must eliminate.

- [ ] **Step 4: Record the current single-layer Hero state**

Run:

```powershell
rg -n "home-hero-(picture|base|motion|media)" src/app/page.tsx src/app/globals.css
```

Expected before implementation: `home-hero-picture` exists; separate `home-hero-base`, `home-hero-motion`, and `home-hero-media` layers do not yet exist.

## Task 2: Centralize the anonymous profile copy

**Files:**
- Modify: `src/lib/site.ts`
- Modify: `src/app/about/page.tsx`
- Modify: `src/components/footer.tsx`

- [ ] **Step 1: Remove the real-name field and replace the shared public descriptions**

In `src/lib/site.ts`, delete `realName` and set the two shared strings exactly:

```ts
tagline: "从视觉算法走向 AI 产品，长期关注技术如何进入真实工作。",
description: "维他命的个人品牌站：从视觉算法走向 AI 产品，记录技术如何进入真实工作。",
```

Keep `displayName`, `githubUser`, `githubAlias`, `claim`, and the navigation unchanged.

- [ ] **Step 2: Replace the About metadata and visible introduction**

In `src/app/about/page.tsx`:

- Set metadata description to `关于维他命：从视觉算法走向 AI 产品，长期关注技术如何进入真实工作。` through `site.displayName`, without `site.realName`.
- Set `SectionHeading.description` to `site.tagline`.
- Replace the current four introductory paragraphs with these exact three paragraphs:

```tsx
<p>
  职业起点是算法工程师，做过人脸识别、活体检测和工业视觉缺陷检测。后来，工作逐渐延伸到算法平台、应用平台、OCR 自研替换，以及软件、硬件和项目交付。
</p>
<p>
  这些经历让我越来越确定：AI 产品最难的部分往往不在模型本身。问题是否真实、数据能否稳定获取、错误如何被发现和接管、结果由谁确认、产品怎样验收，以及一次交付能否沉淀为下一次可复用的能力，才真正决定它能不能落地。
</p>
<p>
  因此，我把长期方向定义为「AI 时代的产品经理」：保留对技术和能力边界的判断，同时连接业务、用户、工程与组织，让 AI 不只停留在演示中，而是真正进入工作、被使用、被验证并持续产生价值。
</p>
```

Do not modify the career timeline, principles, contact block, brand name, or GitHub username.

- [ ] **Step 3: Make the footer use the shared short introduction exactly once**

Replace the footer paragraph body with only:

```tsx
{site.tagline}
```

Remove the appended `欢迎一起讨论产品、研究与写作。` sentence.

- [ ] **Step 4: Verify the privacy regression is fixed**

Run:

```powershell
$privateName = -join @([char]0x8881, [char]0x4E2D, [char]0x7FA4)
rg -n --fixed-strings $privateName src content
rg -n "site\.realName|realName:" src content
```

Expected: no matches and exit code 1 from `rg`.

Also run:

```powershell
rg -n "从视觉算法走向 AI 产品，长期关注技术如何进入真实工作。" src/lib/site.ts
rg -n "site\.tagline" src/app/page.tsx src/app/about/page.tsx src/components/footer.tsx
```

Expected: the literal is defined once in `site.ts`; `site.tagline` is consumed by all three required homepage, About, and footer code paths.

- [ ] **Step 5: Lint and commit the copy change**

Run:

```powershell
& 'D:\nodejs\node.exe' '.\node_modules\eslint\bin\eslint.js' .
git diff --check
git add src/lib/site.ts src/app/about/page.tsx src/components/footer.tsx
git commit -m "feat: anonymize public profile copy"
```

Expected: ESLint and whitespace checks pass; commit contains only the three copy/privacy files.

## Task 3: Build the two-layer Hero artwork

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/superpowers/specs/2026-09-04-homepage-reference-match-design.md`

- [ ] **Step 1: Re-read the installed Next.js 16 image guidance**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/12-images.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
```

Use `loading` and `fetchPriority`; do not reintroduce the deprecated `priority` prop.

- [ ] **Step 2: Replace the single Hero picture with aligned static and motion layers**

In `src/app/page.tsx`, keep `home-hero-art` and `home-hero-halo`, then replace the existing `picture.home-hero-picture` with this structure:

```tsx
<div className="home-hero-media">
  <Image
    src="/images/home/hero-orbit.png"
    alt=""
    width={2048}
    height={2048}
    loading="eager"
    fetchPriority="high"
    className="home-hero-layer home-hero-base"
    sizes="(max-width: 899px) calc(100vw + 72px), 620px"
  />
  <picture className="home-hero-motion">
    <source
      media="(prefers-reduced-motion: reduce)"
      srcSet="/images/home/hero-orbit.png"
      type="image/png"
    />
    <Image
      src="/images/home/hero-orbit-loop.gif"
      alt="蓝紫渐变玻璃球体与环绕轨道动画"
      width={960}
      height={960}
      unoptimized
      loading="eager"
      className="home-hero-layer home-hero-image"
      sizes="(max-width: 899px) calc(100vw + 72px), 620px"
    />
  </picture>
</div>
```

The static duplicate is decorative (`alt=""`); the animated layer remains the only descriptive image.

- [ ] **Step 3: Implement the desktop feathering and grounded shadow**

In `src/app/globals.css`:

- Replace `.home-hero-picture` with `.home-hero-media` positioned near `top: -22px`, `right: -22px`, `width: 620px`, `height: 340px`.
- Apply the approved radial mask to `.home-hero-media`:

```css
-webkit-mask-image: radial-gradient(
  ellipse 90% 82% at 52% 48%,
  #000 56%,
  rgb(0 0 0 / 0.82) 73%,
  transparent 100%
);
mask-image: radial-gradient(
  ellipse 90% 82% at 52% 48%,
  #000 56%,
  rgb(0 0 0 / 0.82) 73%,
  transparent 100%
);
```

- Make `.home-hero-base`, `.home-hero-motion`, and `.home-hero-image` share the same absolute inset and crop.
- Set both raster layers to `object-fit: cover`, `object-position: center 43%`, and `transform: scale(1.16)`.
- Keep the base near full opacity with restrained saturation; set the GIF layer to approximately `opacity: 0.64`, `saturate(0.86)`, `contrast(0.96)`, and `brightness(1.02)`.
- Remove the image `drop-shadow`. Rework `.home-hero-halo` into the separate blurred ellipse beneath the sphere so no shadow follows the rectangular image bounds.

- [ ] **Step 4: Simplify motion and preserve mobile centering**

- Change desktop `hero-drift` to an approximately 8-second translate-only animation with a maximum `translateY(-3px)` and no rotation.
- Change `hero-drift-mobile` to retain `translateX(-50%)`, use at most `translateY(-3px)`, and remove rotation.
- At widths below 900px, move the sizing and centering rules from `.home-hero-picture` to `.home-hero-media`.
- At widths below 640px, keep the existing large mobile art dimensions on `.home-hero-media` and confirm the mask fades before the viewport edge.

- [ ] **Step 5: Make reduced motion display only the static base**

Inside the existing `@media (prefers-reduced-motion: reduce)` block:

```css
.home-hero-media {
  animation: none !important;
}

.home-hero-motion {
  display: none;
}
```

Below 900px, preserve centering with `transform: translateX(-50%)` when the animation is disabled. Keep the `<source>` fallback as protection against GIF selection before CSS is applied.

- [ ] **Step 6: Reconcile the earlier homepage design document**

Update `docs/superpowers/specs/2026-09-04-homepage-reference-match-design.md` so it no longer describes the PNG as fallback-only or the Hero as a single image. State that the PNG is the stable base and reduced-motion result, while the GIF is a feathered animated overlay.

- [ ] **Step 7: Run static checks and build the production bundle**

Run:

```powershell
& 'D:\nodejs\node.exe' '.\node_modules\eslint\bin\eslint.js' .
& 'D:\nodejs\node.exe' '.\node_modules\next\dist\bin\next' build
git diff --check
```

Expected: ESLint passes; Next.js generates all current routes; no whitespace errors. The existing warning about `C:\Users\24830\package-lock.json` being outside the repository is non-blocking.

- [ ] **Step 8: Commit the Hero implementation**

Run:

```powershell
git add src/app/page.tsx src/app/globals.css docs/superpowers/specs/2026-09-04-homepage-reference-match-design.md
git commit -m "feat: blend animated hero artwork"
```

Expected: commit contains the Hero markup/styling and the directly related reconciliation of the earlier Hero design document.

## Task 4: Verify the complete local experience

**Files:**
- Verify: `src/app/page.tsx`
- Verify: `src/app/about/page.tsx`
- Verify: `src/components/footer.tsx`
- Verify: `.next/` production output

- [ ] **Step 1: Start the production server on port 3000**

Run:

```powershell
& 'D:\nodejs\node.exe' '.\node_modules\next\dist\bin\next' start -p 3000
```

Expected: the server stays running and reports a local URL. If another non-project process owns `127.0.0.1:3000`, verify the exact PID before stopping anything; never stop unrelated processes.

- [ ] **Step 2: Verify desktop rendering at 1392×928**

Use @vercel:agent-browser-verify or the in-app browser viewport capability to open `/` and confirm:

- `home-hero-base` and `home-hero-image` both have non-zero natural dimensions.
- The GIF `currentSrc` ends in `/images/home/hero-orbit-loop.gif`.
- No image has `complete === true && naturalWidth === 0`.
- `document.documentElement.scrollWidth <= window.innerWidth`.
- The feathered edge has no visible vertical seam, the sphere remains prominent, and the first-screen work/blog layout has not regressed.

- [ ] **Step 3: Prove the GIF itself is changing frames**

Temporarily pause both `.home-hero-media` drift and `.home-hero-halo` breathing in the browser test context, then capture the same cropped Hero image region twice about 900ms apart. Compare the screenshot bytes/pixels.

Expected: the crop still changes after container motion is paused, showing that the GIF—not CSS translation—is moving.

- [ ] **Step 4: Verify mobile rendering at 390×844**

Confirm the Hero stacks vertically, the ball remains large, all visible images load, the menu is usable, and `scrollWidth <= innerWidth`. Capture one screenshot for calibration.

- [ ] **Step 5: Verify the reduced-motion branch**

Use a browser context with `prefers-reduced-motion: reduce` and confirm:

- `.home-hero-motion` is not displayed.
- `.home-hero-media` has no running animation.
- The static PNG remains visible with non-zero dimensions.

- [ ] **Step 6: Verify rendered privacy and SEO output**

Check `/`, `/about`, and the footer visually. Also fetch the production-mode HTML:

```powershell
curl.exe -sS http://localhost:3000/
curl.exe -sS http://localhost:3000/about
```

Also search all current public source/document paths and generated routes:

```powershell
$privateName = -join @([char]0x8881, [char]0x4E2D, [char]0x7FA4)
rg -n --fixed-strings $privateName src content public docs README.md
rg -n --fixed-strings $privateName .next/server/app
$routes = @('/', '/about', '/work', '/blog')
foreach ($route in $routes) {
  $html = curl.exe -sS "http://localhost:3000$route"
  if ($html.Contains($privateName)) { throw "Real name leaked in $route" }
}
```

Expected: the approved short description and three About paragraphs are present; all `rg` searches return no matches; every rendered route is free of the real name in visible text, `<meta name="description">`, Open Graph, and Twitter metadata.

- [ ] **Step 7: Stop only the project production server**

Send Ctrl+C to the exact session. If it remains listening, use `netstat -ano | Select-String ':3000'`, verify the process is the project’s `node.exe`, and stop only that exact PID. Do not stop unrelated listeners.

- [ ] **Step 8: Commit any calibration fixes, if needed**

If visual verification required parameter changes, rerun lint/build and commit only those changes:

```powershell
git add src/app/page.tsx src/app/globals.css src/lib/site.ts src/app/about/page.tsx src/components/footer.tsx docs/superpowers/specs/2026-09-04-homepage-reference-match-design.md
git commit -m "fix: calibrate hero blend"
```

If no calibration changes were needed, do not create an empty commit.

## Task 5: Final review and Vercel production deployment

**Files:**
- Review: all committed changes since `origin/main`
- Verify: `https://www.notvitamin.com/`

- [ ] **Step 1: Review the final branch before publication**

Run:

```powershell
git diff --check origin/main..HEAD
git status --short --branch
git diff --name-status origin/main..HEAD
```

Expected: no uncommitted files, no whitespace errors, and only the approved design, copy, Hero, and local visual-companion ignore changes.

- [ ] **Step 2: Re-fetch before push and safely incorporate concurrent remote work**

Run:

```powershell
git fetch origin main
git rev-list --left-right --count main...origin/main
```

If the remote advanced, rebase onto `origin/main`, preserve intentional upstream deletions/edits, and rerun lint/build before publication.

- [ ] **Step 3: Push the current authorized main branch**

Run:

```powershell
git push origin main
```

Expected: a fast-forward push that triggers the Vercel Git deployment. Never force-push.

- [ ] **Step 4: Wait for the matching Vercel Production deployment**

Open the `ai-website` deployment list and locate the deployment whose commit SHA matches local `HEAD`.

Expected: environment `Production`, branch `main`, status `Ready`.

- [ ] **Step 5: Verify public routes and Hero assets**

Run:

```powershell
curl.exe -L -sS -o NUL -w '%{http_code}\t%{content_type}\t%{size_download}' https://www.notvitamin.com/
curl.exe -L -sS -o NUL -w '%{http_code}\t%{content_type}\t%{size_download}' https://www.notvitamin.com/about
curl.exe -L -sS -o NUL -w '%{http_code}\t%{content_type}\t%{size_download}' https://www.notvitamin.com/images/home/hero-orbit-loop.gif
curl.exe -L -sS -o NUL -w '%{http_code}\t%{content_type}\t%{size_download}' https://www.notvitamin.com/images/home/hero-orbit.png
```

Expected: both pages return `200`; the animation returns `image/gif` with a non-zero body; the static base returns `image/png` with a non-zero body.

- [ ] **Step 6: Run the final live-browser acceptance pass**

At desktop and mobile widths, confirm the feathered blend, animation, approved About copy, absence of real name, zero failed images, zero console errors/warnings, and no horizontal overflow. Report the final URL, Vercel status, commit SHA, and any remaining non-blocking visual difference.
