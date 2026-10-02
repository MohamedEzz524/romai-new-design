/* =====================================================================
   Store collage behaviour (ported from suuupply.com)
   1. Card hover: pick a random word whose inner vowel has no vowel
      neighbours and stretch it: o -> oo (50ms) -> ooo (100ms). Reset on leave.
   2. Phones: an item gets .overlapping when the next item covers its bottom
      by more than 50px (it then shrinks and dims, see CSS).
   ===================================================================== */
const VOWELS = 'aeiouAEIOU'

function bindStretch(card) {
  const el = card.querySelector('[data-stretch-text]')
  if (!el) return
  const original = el.textContent
  const timers = []
  card.addEventListener('mouseenter', () => {
    const words = original.split(' ')
    const candidates = []
    words.forEach((word, index) => {
      for (let i = 1; i < word.length - 1; i++) {
        if (VOWELS.includes(word[i]) && !VOWELS.includes(word[i - 1]) && !VOWELS.includes(word[i + 1])) {
          candidates.push({ word, index, pos: i })
          break
        }
      }
    })
    if (!candidates.length) return
    const { word, index, pos } = candidates[Math.floor(Math.random() * candidates.length)]
    const v = word[pos]
    const span = document.createElement('span')
    span.className = 'vowel-wrapper'
    span.textContent = v
    el.textContent = ''
    words.forEach((w, i) => {
      if (i) el.append(' ')
      if (i === index) el.append(word.slice(0, pos), span, word.slice(pos + 1))
      else el.append(w)
    })
    timers.push(setTimeout(() => { span.textContent = v + v }, 50))
    timers.push(setTimeout(() => { span.textContent = v + v + v; span.classList.add('stretched-vowel') }, 100))
  })
  card.addEventListener('mouseleave', () => {
    timers.splice(0).forEach(clearTimeout)
    el.textContent = original
  })
}

function bindOverlap(grid) {
  const items = [...grid.querySelectorAll('[data-collage-item]')]
  if (items.length < 2) return
  const mq = window.matchMedia('(max-width: 749px)')
  let ticking = false
  const check = () => {
    ticking = false
    items.forEach((item, i) => {
      const next = items[i + 1]
      const on = mq.matches && !!next && item.getBoundingClientRect().bottom - next.getBoundingClientRect().top > 50
      item.classList.toggle('overlapping', on)
    })
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(check) } }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  setTimeout(check, 100)
}

document.querySelectorAll('[data-section="store-collage"]').forEach((root) => {
  if (root.__collage) return
  root.__collage = true
  root.querySelectorAll('[data-stretch]').forEach(bindStretch)
  const grid = root.querySelector('[data-collage]')
  if (grid) bindOverlap(grid)
})
