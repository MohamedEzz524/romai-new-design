/* Builds the fixed-banner images from the brand library into public/assets/banner.
   Run: node scripts/optimize-banner.mjs */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BRANDING = path.resolve(ROOT, '..', 'branding')
const OUT = path.join(ROOT, 'public', 'assets', 'banner')
fs.mkdirSync(OUT, { recursive: true })

const jobs = [
  { src: path.join(BRANDING, 'homepage/hero/2.png'),           out: 'fall-desktop.webp', width: 1920, quality: 82 },
  { src: path.join(BRANDING, 'homepage/section10/slide1.png'), out: 'fall-mobile.webp',  width: 1080, quality: 82 },
]

for (const job of jobs) {
  if (!fs.existsSync(job.src)) { console.warn('missing', job.src); continue }
  const info = await sharp(job.src).resize({ width: job.width, withoutEnlargement: true }).webp({ quality: job.quality }).toFile(path.join(OUT, job.out))
  console.log(`${job.out.padEnd(20)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`)
}
