import { defineConfig } from 'vite'
import { Liquid } from 'liquidjs'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.resolve(ROOT, 'src')
const SECTIONS_DIR = path.join(SRC, 'sections')
const SNIPPETS_DIR = path.join(SRC, 'snippets')
const DATA_DIR = path.join(SRC, 'data')
const BRANDING_DIR = path.resolve(ROOT, '../branding') // served at /branding/* in dev (never copied)

/* ------------------------------------------------------------------ */
/* Data: every src/data/*.json becomes a top-level Liquid variable      */
/* (settings.json -> settings, products.json -> products, ...)         */
/* ------------------------------------------------------------------ */
function loadData() {
  const data = {}
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json')) continue
    data[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))
  }
  return data
}

function formatMoney(value, withCurrency) {
  const n = Number(value)
  if (Number.isNaN(n)) return value
  const settings = loadData().settings ?? {}
  const symbol = settings.currency_symbol ?? '$'
  const code = settings.currency ?? 'USD'
  const formatted = symbol + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return withCurrency ? `${formatted} ${code}` : formatted
}

/* ------------------------------------------------------------------ */
/* Liquid engine with a Shopify-flavoured surface                       */
/* ------------------------------------------------------------------ */
function createEngine() {
  const engine = new Liquid({
    root: [SNIPPETS_DIR],
    extname: '.liquid',
    cache: false,
    jsTruthy: true,
    strictFilters: false,
    strictVariables: false,
  })

  /* --- filters that mirror Shopify so sections port cleanly --- */
  engine.registerFilter('money', (v) => formatMoney(v, false))
  engine.registerFilter('money_with_currency', (v) => formatMoney(v, true))
  engine.registerFilter('money_without_trailing_zeros', (v) => formatMoney(v, false).replace(/\.00$/, ''))
  engine.registerFilter('asset_url', (v) => `/assets/${v}`)
  engine.registerFilter('image_url', (v) => v) // mock: images are plain paths already
  engine.registerFilter('img_url', (v) => v)
  engine.registerFilter('file_url', (v) => `/branding/${v}`)
  engine.registerFilter('t', (v) => v) // translations: passthrough
  engine.registerFilter('handleize', (v) =>
    String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
  engine.registerFilter('within', (url) => url)
  engine.registerFilter('pluralize', (n, s, p) => (Number(n) === 1 ? s : p))

  /* --- {% schema %} ... {% endschema %}: kept for the Shopify port, renders nothing --- */
  engine.registerTag('schema', {
    parse(tagToken, remainTokens) {
      const stream = this.liquid.parser.parseStream(remainTokens)
      stream
        .on('token', (token) => { if (token.name === 'endschema') stream.stop() })
        .on('end', () => { throw new Error(`tag ${tagToken.getText()} not closed`) })
      stream.start()
    },
    render() { return '' },
  })

  /* --- {% section 'name' %}: renders src/sections/<name>/<name>.liquid --- */
  engine.registerTag('section', {
    parse(tagToken) {
      this.name = tagToken.args.trim().replace(/^['"]|['"]$/g, '')
    },
    async render(ctx) {
      const name = this.name
      const file = path.join(SECTIONS_DIR, name, `${name}.liquid`)
      if (!fs.existsSync(file)) {
        return `<!-- section "${name}" not found: expected src/sections/${name}/${name}.liquid -->`
      }
      const settingsFile = path.join(SECTIONS_DIR, name, `${name}.json`)
      const sectionData = fs.existsSync(settingsFile)
        ? JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
        : {}
      const scope = {
        ...ctx.getAll(),
        section: {
          id: name,
          settings: sectionData.settings ?? {},
          blocks: sectionData.blocks ?? [],
        },
      }
      const html = await this.liquid.parseAndRender(fs.readFileSync(file, 'utf8'), scope)
      return `<div id="shopify-section-${name}" class="shopify-section shopify-section--${name}">${html}</div>`
    },
  })

  return engine
}

/* ------------------------------------------------------------------ */
/* Vite plugin                                                          */
/* ------------------------------------------------------------------ */
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.json': 'application/json',
}

function serveBranding(req, res, next) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  const file = path.join(BRANDING_DIR, urlPath)
  if (!file.startsWith(BRANDING_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return next()
  const stat = fs.statSync(file)
  const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  res.setHeader('Content-Type', mime)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  const range = req.headers.range
  if (range && /^bytes=/.test(range)) {
    const [startStr, endStr] = range.replace('bytes=', '').split('-')
    const start = Number(startStr)
    const end = endStr ? Number(endStr) : stat.size - 1
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    res.setHeader('Content-Length', end - start + 1)
    fs.createReadStream(file, { start, end }).pipe(res)
  } else {
    res.setHeader('Content-Length', stat.size)
    fs.createReadStream(file).pipe(res)
  }
}

function romaiLiquid() {
  const engine = createEngine()
  return {
    name: 'romai-liquid',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const page = path.basename(ctx.filename || ctx.path || 'index.html', '.html')
        /* critical CSS for the first paint (dev injects stylesheets via JS, so for a moment
           there are no styles): keep unsized SVGs small and the page dark. :where() has zero
           specificity, so any real stylesheet rule overrides it. */
        const critical = `<style data-critical>
  html { background: #0B0B0B; }
  :where(svg:not([width])) { width: 1em; height: 1em; }
  :where(.site-header__mark) { height: 44px; width: auto; }
  /* hide the page until main.js has applied the stylesheets; reveal anyway after 3s */
  html:not(.styles-ready) body { visibility: hidden; animation: critical-reveal 0s 3s forwards; }
  @keyframes critical-reveal { to { visibility: visible; } }
</style>`
        html = html.replace(/<head>/i, (m) => m + critical)
        return engine.parseAndRender(html, {
          ...loadData(),
          request: { page, path: ctx.path ?? '/' },
          template: page,
        })
      },
    },
    configureServer(server) {
      /* Templates and data are not in Vite's module graph: full reload on change. */
      const onFsEvent = (file) => {
        const rel = path.relative(ROOT, file)
        const inData = rel.startsWith(path.join('src', 'data'))
        const inSections = rel.startsWith(path.join('src', 'sections'))
        if (rel.endsWith('.liquid') || rel.endsWith('.html') || inData || (inSections && rel.endsWith('.json'))) {
          server.ws.send({ type: 'full-reload', path: '*' })
        }
      }
      server.watcher.on('change', onFsEvent)
      server.watcher.on('add', onFsEvent)
      server.watcher.on('unlink', onFsEvent)

      /* ../branding is 225MB: serve it at /branding/* instead of copying it. */
      server.middlewares.use('/branding', serveBranding)
    },
  }
}

/* Every *.html at the project root is a page (multi-page build). */
function htmlInputs() {
  return Object.fromEntries(
    fs.readdirSync(ROOT)
      .filter((f) => f.endsWith('.html'))
      .map((f) => [path.basename(f, '.html'), path.resolve(ROOT, f)])
  )
}

export default defineConfig({
  plugins: [romaiLiquid()],
  server: { port: 5173, open: false },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: htmlInputs(),
      output: { manualChunks: { three: ['three'] } },   /* three.js in its own long-cached chunk */
    },
  },
})
