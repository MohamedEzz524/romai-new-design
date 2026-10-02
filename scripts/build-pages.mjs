/* Build for GitHub Pages: node scripts/build-pages.mjs [repo-name]
   1. vite build into dist/
   2. copy only the ../branding files the site references (the folder is 225MB)
   3. prefix root paths ("/assets/...", "/product.html") with /<repo>/ */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const REPO = process.argv[2] || 'romai-new-design'
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const BRANDING = path.resolve(ROOT, '../branding')
const BASE = `/${REPO}/`

execSync('npx vite build', { stdio: 'inherit' })

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])

/* branding files referenced anywhere in the source */
const srcFiles = [...walk(path.join(ROOT, 'src')), ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, f))]
const refs = new Set()
for (const f of srcFiles) {
  if (!/\.(liquid|json|js|css|html)$/.test(f)) continue
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\/branding\/([^"'`)\n]+?\.(?:png|jpe?g|webp|gif|svg|mp4|webm|avif))/gi)) refs.add(m[1])
}
let copied = 0
for (const rel of refs) {
  const from = path.join(BRANDING, rel)
  if (!fs.existsSync(from)) { console.warn('missing branding file:', rel); continue }
  const to = path.join(DIST, 'branding', rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  copied++
}
console.log(`copied ${copied} branding files`)

/* rewrite root paths in built text files */
const prefixes = '(?:assets|branding|fonts|src|[a-z0-9-]+\.html)'
const re = new RegExp(`(^|[\s"'\`(=,:])/(${prefixes})`, 'g')
for (const f of walk(DIST)) {
  if (!/\.(html|js|css|json)$/.test(f)) continue
  let s = fs.readFileSync(f, 'utf8')
  const before = s
  s = s.replace(re, `$1${BASE}$2`)
  s = s.replace(/(href|action)=(["'])\/\2/g, `$1=$2${BASE}$2`)       /* href="/" home links */
  if (s !== before) fs.writeFileSync(f, s)
}
fs.writeFileSync(path.join(DIST, '.nojekyll'), '')
console.log('ready for GitHub Pages at', BASE)
