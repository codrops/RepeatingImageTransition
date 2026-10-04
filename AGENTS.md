# AGENTS.md

Notes for coding agents working on this repo. Read [README.md](README.md) first for what the demo is.

## Setup

- There is no build step, no package.json and nothing to install. Plain HTML, CSS and ES modules.
- Serve the root with any static server (`npx serve .` or `python3 -m http.server`). ES modules don't load from `file://`.
- GSAP (3.15.0) and Lenis (1.3.26) are vendored in `js/` and loaded as classic scripts before the module, so `gsap` and `Lenis` are globals. Don't import them. To upgrade one, replace the file in place from `https://cdn.jsdelivr.net/npm/<pkg>@<version>/dist/…` (Lenis with its `.map`).
- The fonts come from the Adobe Fonts kit linked in `index.html` (`halyard-display` 400 and 500, `owners-xnarrow` 700).
- Effects 05 and 06 draw with raw WebGL in `js/webgl/` (WebGL2, or WebGL1 as a fallback). There's no three.js.
- There are no automated tests. Check a change in a browser: open items on both halves of the screen in every section, close with Close and with Escape, do it again from the keyboard (Tab, Enter), then with reduced motion and at phone width, and look at the console.

## Map

| Path                    | What it is                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `index.html`            | The only page: the frame, six effect sections (a `.heading` and a `.grid` of 16 `.grid__item` figures each), the shared `.panel` and the footer. |
| `js/index.js`           | The effect: `config`, per-item overrides, the movers (flat and WebGL), the panel reveal and close, the reduced-motion crossfade, scroll lock, focus handling and start-up. |
| `js/webgl/Sheets.js`    | The WebGL renderer for `silk` and `ink` movers: the `.sheets` canvas, the sheet mesh, the texture and one compiled program per surface. It only draws; `js/index.js` animates the sheets. |
| `js/webgl/silk.js`, `js/webgl/ink.js` | One surface each: its vertex and fragment shaders.                             |
| `js/webgl/glsl.js`      | GLSL shared by the surfaces: `noise`/`fbm`, `cover()` and `project()`.                                       |
| `js/utils.js`           | `preloadImages` (loads and decodes CSS background images) and `preloadFonts`.                                |
| `js/smoothscroll.js`    | Lenis, driven by GSAP's ticker. Kept on `window.lenis` so the effect can stop it; `null` under reduced motion. |
| `js/gsap.min.js`, `js/lenis.min.js` | The vendored libraries (plus `lenis.min.js.map`).                                              |
| `css/base.css`          | All styles: loader, frame, headings, grid, panel, `.mover`, the `.sheets` canvas and `.scroll-locked`.       |
| `assets/`               | `img1.webp`…`img33.webp`, all 960×1200 (4:5).                                                                |
| `favicon.ico`           | Not linked from the page, which uses tympanus.net's favicon.                                                 |

## How a page works

Clicking (or Enter/Space on) a grid item flies copies of its image, the "movers", along a path from the item to the panel, then reveals the panel image and its caption. Closing fades the panel out and the grid back in.

1. **Start-up.** Images and fonts preload, then `body.loading` is removed and `init()` binds the items, the Close button and Escape.
2. **Open** (`onGridItemClick`):
   - `setScrollLock(true)` adds `.scroll-locked` to `<html>` and stops Lenis, so the page can't move under the transition.
   - The item's `data-*` overrides are merged into `config`.
   - `positionPanelBasedOnClick` puts the panel on the other half of the screen (`panel--right` when the item is left of center) and, with `autoAdjustHorizontalClipPath`, turns a `left-right`/`right-left` clip direction to match.
   - The item's image, `h3` and `p` are copied into the panel, and `setPanelInteractive(true)` makes the panel reachable and the rest of the page `inert`.
   - Every `.grid__item` on the page fades out, staggered by distance from the clicked one (all sections, not only the clicked one).
3. **Movers.** `generateMotionPath` interpolates `steps` rects between the item's image and the panel image (both ends excluded), offset by the sine path and the wobble. Each mover is a `position: fixed` div with the image as its background and a `z-index` of `1000 + index`. It's clipped in, held for `moverPauseBeforeExit`, and clipped out in the same direction. `scheduleCleanup` removes them once the last one ends. The panel image reveals with the same clip direction after `steps * stepInterval`.
   With `moverSurface: 'silk'` or `'ink'` (and WebGL available), `animateSheetTransition` replaces the DOM movers and the clip-path panel reveal. The clicked image, each copy along the same path, and the panel image become sheets on the `.sheets` canvas (`z-index` 1500, above the grid and under the panel), drawn with that surface's shaders.
   - The clicked image's sheet replaces it on the same frame and leaves (silk rolls it away, ink dissolves it).
   - The copies follow the same timing as DOM movers, calmer the closer they are to the panel. They reveal up to `moverRevealAmount`, so ink copies can stay irregular blots.
   - The last sheet comes in over the panel's rect and settles still. Ink soaks it in from the side the copies arrive from. The DOM panel image then fades in over it for 0.3s and the canvas stops.
4. **Open state.** When the caption has faded in (and, for WebGL movers, the canvas has stopped), `onPanelRevealed` sets `isAnimating` to false and `isPanelOpen` to true, and moves focus to Close.
5. **Close** (`resetView`): focus goes back to the item, the panel fades out, the frame and items fade back in (scaling up from 0.8), and the scroll lock is released on complete. `config` is reset to `originalConfig`.

Rules that keep it working:

- Measure after locking scroll. Anything that reads a rect in the open path goes after `setScrollLock(true)`.
- `isAnimating` gates everything. Clicks, Close and Escape are ignored mid-transition.
- `config` is mutated per click and reset on close. A new option needs a default in `config` (with a comment, like the others) and a reader in `extractItemConfigOverrides`, or its `data-*` attribute is ignored.
- Clip paths are `inset()` strings with all four values in `%`, so GSAP can tween between them. `getClipPathsForDirection` holds the four directions.
- **Reduced motion** uses `crossfadeToPanel` instead: no movers, no scaling, and no Lenis (native scroll). Any new effect needs its reduced path to stay a plain fade. WebGL movers never run under reduced motion.
- **WebGL movers fall back** to flat ones when WebGL isn't available (`usesSheets()`), so their sections also work with the plain clip-path copies. `moverBlendMode` has no effect on sheets.
- The panel carries `inert` in the HTML and is only interactive while open. Its `.panel__img` is the `role="img"`, labelled with the item's title.

## Variations

The variations are the six effect sections on `index.html`. Each figure in a section carries the same `data-*` settings.

| #  | Section      | What it does                                                                 | Settings (`data-*` on each figure)                                                                      |
| -- | ------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 01 | Shane Weber  | Straight path, six movers, clipped top to bottom, sine easing, no rotation.  | None: the `config` defaults.                                                                             |
| 02 | Manika Jorge | Eight movers, each tilted up to ±7°, a longer hold, power2 exits.            | `steps` 8, `rotation-range` 7, `step-interval` 0.05, `mover-pause-before-exit` 0.25, eases `sine.in` / `power2` / `power2`. |
| 03 | Angela Wong  | Ten movers on a 300px sine arc, clipped sideways, slow power4 panel reveal.  | `steps` 10, `step-duration` 0.3, `path-motion` sine, `sine-amplitude` 300, `clip-path-direction` left-right, `step-interval` 0.07, `mover-pause-before-exit` 0.3, eases `sine` / `power4` / `power4`, `panel-reveal-duration-factor` 4. |
| 04 | Kaito Nakamo | Four quick movers clipped bottom to top, `hard-light` blend, slow expo reveal. | `steps` 4, `clip-path-direction` bottom-top, `step-duration` 0.25, `step-interval` 0.06, `mover-pause-before-exit` 0.2, eases `sine.in` / `expo` / `expo`, `panel-reveal-duration-factor` 4, `mover-blend-mode` hard-light. |
| 05 | Noor Halvorsen | Silk: the image peels off and six WebGL sheets rise on an arc, rippling and catching the light. They unroll top to bottom behind a soft, wavy edge, and the last one settles flat into the panel. | `mover-surface` silk, `steps` 6, `step-duration` 0.5, `step-interval` 0.08, `mover-pause-before-exit` 0.15, eases `sine.out` / `sine.in` / `power2.inOut`, `panel-reveal-duration-factor` 2.4, `path-motion` sine, `sine-amplitude` -140, `surface-strength` 0.3, `edge-noise` 0.4. |
| 06 | Mila Serrano | Ink: the image dissolves and six WebGL copies bloom as soft, oval ink blots of the picture. They swirl, pool darker at their edges, and thin into wisps as they sink along an arc. The panel image soaks in from the side they arrive from. | `mover-surface` ink, eases `sine.out` / `sine.inOut` / `sine.inOut`, `path-motion` sine, `sine-amplitude` 90, `rotation-range` 3, `surface-strength` 0.8, `edge-noise` 0.5, `mover-reveal-amount` 0.58. Timing is the `config` defaults, the same as 01. |

Notes:

- Section 03's figures also carry `data-auto-adjust-horizontal-clip-path="true"`, which isn't read. The option is on by default in `config`.
- Images: section 01 uses `img1`–`img16`, 02 uses `img17`–`img32`, 03 uses `img33` then `img1`–`img15`, and 04 uses `img16`–`img31`. Section 05 reuses sixteen of the most fabric-led images, and section 06 the rest except `img33`, each in the order of its markup.
- 01–04 are the author's original effects. 05 and 06 were added after the original release.

## Adding a variation

1. Copy the last `.heading` and `.grid` block in `index.html` and paste it after it. Give the heading a new name and an `effect 0N: …` line in `.heading__meta`.
2. Set the effect's `data-*` attributes on every figure in the new grid, all with the same values. Only attributes that `extractItemConfigOverrides` reads do anything. For WebGL sheets, add `data-mover-surface="silk"` or `"ink"` and tune `data-surface-strength`, `data-edge-noise` and `data-mover-reveal-amount`.
3. If the effect needs a new option, add its default to `config`, a reader to `extractItemConfigOverrides`, and use it in the animation code. Give it a reduced-motion path if it adds motion outside the movers.
4. Keep each figure's markup: `class="grid__item" role="button" tabindex="0" aria-labelledby="captionN"`, with ids continuing from `caption96`. Inside it go a `.grid__item-image` with an inline `background-image`, and a `figcaption` with an `h3` (the title) and a `p` (the model line, hidden in the grid and shown in the panel).
5. New images go in `assets/` as 4:5 WebP (the others are 960×1200). `preloadImages` picks up every `.grid__item-image` by itself.
6. There's no variations nav, since every effect lives on `index.html`. If variations ever get their own pages, add a compact numbered "Variations 01 02 …" nav to the frame on every page, with the current page's entry marked `frame__demo--current`.

## Conventions

- **Scrolling.** Lenis runs on GSAP's ticker with lag smoothing off. Stop and start it only through `setScrollLock`, which also handles native scrolling when Lenis is off. `html` has `scrollbar-gutter: stable`, so locking doesn't shift the layout where scrollbars take up space.
- **Stacking.** The frame sits at `z-index` 1000, movers at `1000 + index`, and the panel at 2000.
- **Panel size.** The panel is `100svh` tall and its image width comes from `--panel-img-size`. Keep `svh`, since `vh` puts the caption and Close under mobile browser toolbars.
- **Text case.** `body` has `text-transform: lowercase`. Write titles and captions in normal case in the HTML.
- **Loader.** `body.loading` covers the page until `preloadImages` and `preloadFonts` both resolve. If the fonts change, update the list passed to `preloadFonts` in `js/index.js`.
- **Focus.** Links, grid items and Close show a `2px solid red` outline on `:focus-visible`. Close only turns black on hover and keyboard focus, so it stays red when focus moves to it after a click.

## WebGL conventions (silk, ink)

- **Space.** Sheets are placed in CSS px, like the DOM movers. The rect is `[left, top, width, height]` from `getBoundingClientRect` or `generateMotionPath`, with uv running 0 to 1 and y down. Depth is projected around the middle of the viewport with a 1000px perspective, the same as CSS `perspective: 1000px`.
- **Surfaces.** A surface is a file in `js/webgl/` exporting `vertexShader` and `fragmentShader`, registered in `SURFACES` in `Sheets.js`. Every surface is compiled when the renderer is created. Surfaces can use any of the uniforms in `UNIFORMS` and ignore the rest.
- **Values GSAP animates** on each sheet: `reveal` and `hide` (0 → 1, the edge sweeping or spreading in and out), `opacity` and `strength` (silk: the depth of the folds, as a fraction of the sheet's width; ink: how much the picture swirls). `rect`, `travel`, `wipe`, `origin`, `rotation`, `edgeNoise` and `seed` are fixed when the sheet is added.
- **Silk edges follow the clip-path directions.** `WIPES` in `js/webgl/Sheets.js` must stay in step with `getClipPathsForDirection` in `js/index.js`. `left-right` is the one that sweeps from right to left, as its clip-paths do.
- **Ink spreads from `origin`** (uv), in an oval that follows the sheet's proportions. The ink blur is a mipmap bias on the texture lookup, so it costs no extra passes (and shows only on WebGL2).
- **The rest state must match the DOM exactly.** At `reveal` 1, `hide` 0 and `strength` 0, every surface draws the sheet flat, unshaded, unblurred and sampled like `background-size: cover`. That's what lets the clicked image's sheet replace it on one frame and the landing sheet hand over to the panel image. Keep every distortion multiplied by `strength` (or by how far `reveal`/`hide` are from rest), and keep edges starting and ending fully outside the sheet.
- **One texture per transition.** `load()` decodes the clicked image (already in the cache from the preload) and uploads it with mipmaps on WebGL2, so the small copies don't shimmer. `stop()` frees the texture and hides the canvas. The canvas draws only between `start()` and `stop()`, at a device pixel ratio capped at 2.
- **The renderer is created on first use** and kept. If WebGL or any surface's shaders fail, `getSheets()` returns `null` and the section falls back to flat movers.
- **GLSL ES 1.00.** Don't use reserved words or built-in names (`step`, `length`, `distance`…) as variable names.

## Style

- Two-space indentation, single quotes, semicolons, trailing commas (in function arguments too) and lines up to about 100 characters, as in `js/index.js`, which is formatted Prettier-style. Follow what's in the file.
- Functions are `const` arrow functions, each with a one-line `//` comment above it saying what it does. Config entries get a trailing comment. A few comments are marked with ✨; leave them.
- `js/utils.js` documents its functions with JSDoc. `js/webgl/Sheets.js` is a class with a one-line comment above each method. Each surface file opens with a comment saying what it looks like, and the shaders are commented inside.
- CSS: custom properties on `:root`, BEM-style names (`grid__item`, `panel--right`), and native nesting for states and media queries in some rules.
- No dependencies and no build tooling unless asked.

## Ask before changing

- The `<title>`, meta description and keywords, the `frame__title` heading, the More info and Code links, and the tags.
- The section names, the effect descriptions, the item titles and model names, and the panel's placeholder text.
- The four original effects and their settings, which are the author's own.
- The credits in the README and the Adobe Fonts kit.
