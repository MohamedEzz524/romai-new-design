/* Converts the raw design PNGs into web-sized WebP files in public/assets/hero.
   Run: node scripts/optimize-hero.mjs */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DEPTH_DIR = path.join(ROOT, 'design', 'Hero With Depth Map')
const BRANDING = path.resolve(ROOT, '..', 'branding')
const OUT = path.join(ROOT, 'public', 'assets', 'hero')
fs.mkdirSync(OUT, { recursive: true })

const depthFiles = fs.readdirSync(DEPTH_DIR).filter((f) => f.endsWith('.png'))
const byPrefix = (p) => path.join(DEPTH_DIR, depthFiles.find((f) => f.startsWith(p)))

const jobs = [
  /* background image + depth map pairs (white = near) */
  { src: byPrefix('7271'), out: 'bg-desktop.webp',       width: 1920, quality: 82 },
  { src: byPrefix('9288'), out: 'bg-desktop-depth.webp', width: 1280, quality: 72, gray: true },
  { src: byPrefix('3319'), out: 'bg-mobile.webp',        width: 1080, quality: 82 },
  { src: byPrefix('9280'), out: 'bg-mobile-depth.webp',  width: 720,  quality: 72, gray: true },
  /* pentagon face images (campaign shots from the brand library).
     crop = fractions of the source: landscape shots are cut to the subject so the
     near-square pentagon face shows the model, not the empty side of the frame. */
  { src: path.join(BRANDING, 'homepage/hero/1.png'),           out: 'face-1.webp', width: 1200, quality: 82, crop: { left: 0.40, width: 0.56 } },
  { src: path.join(BRANDING, 'homepage/hero/2.png'),           out: 'face-2.webp', width: 1200, quality: 82, crop: { left: 0.43, width: 0.52 } },
  { src: path.join(BRANDING, 'homepage/section10/slide1.png'), out: 'face-3.webp', width: 1200, quality: 82 },
  { src: path.join(BRANDING, 'homepage/section10/slide2.png'), out: 'face-4.webp', width: 1200, quality: 82 },
]

for (const job of jobs) {
  if (!fs.existsSync(job.src)) { console.warn('missing', job.src); continue }
  let img = sharp(job.src)
  if (job.crop) {
    const meta = await img.metadata()
    const left = Math.round(meta.width * (job.crop.left ?? 0))
    const top = Math.round(meta.height * (job.crop.top ?? 0))
    const width = Math.round(meta.width * (job.crop.width ?? 1))
    const height = Math.round(meta.height * (job.crop.height ?? 1))
    img = img.extract({ left, top, width: Math.min(width, meta.width - left), height: Math.min(height, meta.height - top) })
  }
  img = img.resize({ width: job.width, withoutEnlargement: true })
  if (job.gray) img = img.grayscale()
  const info = await img.webp({ quality: job.quality }).toFile(path.join(OUT, job.out))
  console.log(`${job.out.padEnd(24)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`)
}
