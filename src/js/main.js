/* Global entry. Section-level CSS/JS is auto-imported from src/sections/** so adding
   a section never requires touching this file. */
import '../styles/fonts.css'
import '../styles/tokens.css'
import '../styles/reset.css'
import '../styles/base.css'
import '../styles/reveal.css'
import { initReveal } from './reveal.js'
import { initSmoothScroll } from './smooth-scroll.js'

/* Every src/sections/<name>/<name>.css and .js is bundled automatically. */
import.meta.glob('../sections/**/*.css', { eager: true })
import.meta.glob('../sections/**/*.js', { eager: true })

document.documentElement.classList.replace('no-js', 'js')
/* every stylesheet above is applied by now: lift the first-paint guard (see vite.config.js) */
document.documentElement.classList.add('styles-ready')

/* Expose a tiny section registry so each section can self-initialise. */
window.Romai = window.Romai || {}
window.Romai.initReveal = initReveal

initSmoothScroll()
initReveal()
document.addEventListener('DOMContentLoaded', () => initReveal())
