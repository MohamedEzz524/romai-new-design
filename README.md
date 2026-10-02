# Romai — new design prototype

Design-first build of the Romai e-commerce store, one section at a time.
Sections are written in **Shopify-style Liquid** from day one so the finished
design converts to a Shopify theme (or feeds a custom theme) with minimal rework.

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (homepage canvas)
                   # http://localhost:5173/styleguide.html  (tokens, type, buttons, mock data)
npm run build      # static build to dist/
```

## Folder map

```
index.html                  homepage canvas: one {% section 'x' %} per section, in order
styleguide.html             design tokens reference page
src/
  styles/
    tokens.css              colours, type scale, spacing, radius, motion, z-index, colour schemes
    base.css                layout primitives, typography classes, buttons, badges, media, utilities
    fonts.css               self-hosted SeroThunder + Burberry House (Inter comes from Google Fonts)
    reset.css
  js/
    main.js                 entry: imports global CSS + auto-imports every section's CSS/JS
    reveal.js               scroll-reveal helper (data-reveal)
  sections/<name>/
    <name>.liquid           markup (Shopify section syntax, may include {% schema %})
    <name>.css              section styles (auto-bundled)
    <name>.js               section behaviour (auto-bundled, self-initialising)
    <name>.json             optional: { "settings": {...}, "blocks": [...] } -> section.settings
  snippets/<name>.liquid    shared partials, used with {% render 'name' %}
  data/
    settings.json           global `settings` (shop name, menus, currency)
    products.json           mock `products`
    collections.json        mock `collections`
public/
  fonts/, assets/           static files -> /fonts/*, /assets/*
../branding/                NOT copied; served at /branding/* in dev (225 MB of brand images/video)
```

## Adding a section

1. Create `src/sections/hero/hero.liquid`, `hero.css`, optionally `hero.js` and `hero.json`.
2. Add `{% section 'hero' %}` to `index.html` (or any page) where it should appear.
3. Done. CSS/JS are picked up automatically; Liquid/JSON edits trigger a full reload.

Conventions:

- Root element of a section: `<section class="hero scheme-dark" data-section="hero">`.
- Section CSS is scoped under its root class (`.hero ...`). Only tokens from `tokens.css`
  and primitives from `base.css` are shared.
- Section JS guards on its own element: `document.querySelectorAll('[data-section="hero"]')`.
- Images come from `/branding/...` (existing library) or `/assets/...` (new files in `public/assets`).
- Use `section.settings.x` for anything a merchant would edit later; put defaults in `hero.json`.

## Sections built

| Section | Files | Notes |
|---------|-------|-------|
| `hero`  | `src/sections/hero/` | WebGL (three.js), behaviour matched to the Casa Lunara "WebGL cube" reference. Depth-map parallax room; a static centre image (`image_style`: `cutout` = transparent product PNG, `pentagon` = masked photo with amber rim); a transparent glass dodecahedron (12 pentagon faces) is the only moving element. Image changes are wipes: after `interval_ms`, the first face rotating in from the rim becomes the carrier (tinted), its leading edge is locked for the sweep, and the next image is drawn out from behind that edge through a liquid band (`wipe_band` = band width as a fraction of image height, `wipe_stretch` = pull strength; the edge ripples so it never reads as a straight clip). If the face is lost the edge coasts on; if no face arrives a plain edge sweeps. No fades. `refraction` (default 0) can add per-face displacement of what is behind the glass. On WebGL failure the poster and copy still show. `show_content: false` hides the copy block. Product cutouts came from the Shopify store (`public/assets/hero/product-*.webp`); background assets via `node scripts/optimize-hero.mjs`. Dev-only QA params: `?hero-force=1` (ignore reduced motion, log to console), `?hero-warm=120` (simulate N frames before the first paint), `?hero-interval=100`, `?hero-seek=3`, `?hero-freeze=3.4`, `?hero-mouse=0.8,0`. |
| `fitting` | `src/sections/fitting/` | Rebuild of ai-model.jp "customize" body: pinned (sticky, 2 x innerHeight) stack of 5 fitting layers wiped bottom-up with a riding param line + counter, then the fit2Sub image (clip + zoom), then a 3x3 card grid whose rows switch on at 75% viewport and three white "walk" frames that step down. Sizes use their viewport rem (`--u` = 100vw/1440, 100vw/360 under 600px). No GSAP (all tweens are linear). Placeholder images in `public/assets/fitting/`. Dev QA: `?fitting-progress=0..1`. |

## Liquid surface available now

Tags: `section`, `render`, `schema` (ignored), plus all standard Liquid tags.
Filters: `money`, `money_with_currency`, `asset_url`, `image_url`, `img_url`, `file_url`, `t`,
`handleize`, `pluralize`, plus all standard Liquid filters.
Globals: `settings`, `products`, `collections`, `section` (inside a section), `template`, `request`.

## Porting to Shopify later

| Here                                   | Shopify theme                                   |
|----------------------------------------|-------------------------------------------------|
| `src/sections/x/x.liquid`              | `sections/x.liquid`                             |
| `src/sections/x/x.css` / `x.js`        | `assets/section-x.css` / `assets/section-x.js`  |
| `src/sections/x/x.json`                | `{% schema %}` defaults + `templates/*.json`    |
| `src/snippets/*.liquid`                | `snippets/*.liquid`                             |
| `src/styles/tokens.css`                | `config/settings_schema.json` + `base.css`      |
| `src/data/*.json`                      | real `products`, `collections`, `settings`      |
| `/branding/...` image paths            | uploaded files + `image_url` filter             |
