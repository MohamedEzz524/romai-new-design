/* =====================================================================
   Reveal system
   Mark an element with data-reveal="<type>"; when it scrolls into view it
   gets the class .is-inview and the CSS in styles/reveal.css animates it.

   Types (see reveal.css):  up (default) | down | left | right | fade | scale
                            | blur | mask-up | wipe | wipe-center | zoom-out
   Text splitting:          data-reveal-split="chars" | "words" | "lines"
                            types for split text: chars-up | chars-blur | chars-fade
                            | words-up | lines-up
   Options:
     data-reveal-delay="200"      ms before this element starts
     data-reveal-duration="1200"  ms per element / per piece
     data-reveal-stagger="40"     ms between split pieces or group children
     data-reveal-once="false"     re-hide when it leaves the viewport
     data-reveal-threshold="0.3"  share of the element that must be visible
   Groups: data-reveal-group on a parent makes its [data-reveal] children
   trigger together, staggered in DOM order (data-reveal-stagger on the parent).

   Reveals wait for the preloader ("romai:preloader:done") so nothing animates
   under the black sheet. Reduced motion: everything is shown immediately.
   ===================================================================== */

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- text splitting ---------- */
function splitText(el, mode) {
  if (el.dataset.revealSplitDone) return
  const text = el.textContent.replace(/\s+/g, ' ').trim()
  el.setAttribute('aria-label', text)
  el.dataset.revealSplitDone = '1'
  const frag = document.createDocumentFragment()
  let i = 0
  const words = text.split(' ')
  words.forEach((word, w) => {
    const wordEl = document.createElement('span')
    wordEl.className = 'rv-word'
    wordEl.setAttribute('aria-hidden', 'true')
    if (mode === 'chars') {
      for (const ch of word) {
        const c = document.createElement('span')
        c.className = 'rv-piece rv-char'
        c.style.setProperty('--i', i++)
        c.textContent = ch
        const mask = document.createElement('span')
        mask.className = 'rv-mask'
        mask.appendChild(c)
        wordEl.appendChild(mask)
      }
    } else {
      const c = document.createElement('span')
      c.className = 'rv-piece'
      c.style.setProperty('--i', i++)
      c.textContent = word
      const mask = document.createElement('span')
      mask.className = 'rv-mask'
      mask.appendChild(c)
      wordEl.appendChild(mask)
    }
    frag.appendChild(wordEl)
    if (w < words.length - 1) frag.appendChild(document.createTextNode(' '))
  })
  el.textContent = ''
  el.appendChild(frag)
  if (mode === 'lines') indexLines(el)
  el.style.setProperty('--n', i)
}

/* lines: words keep their own piece, but share the index of the line they sit on */
function indexLines(el) {
  const words = [...el.querySelectorAll('.rv-word')]
  let line = -1, lastTop = null
  words.forEach((w) => {
    const top = Math.round(w.offsetTop)
    if (top !== lastTop) { line++; lastTop = top }
    w.querySelectorAll('.rv-piece').forEach((p) => p.style.setProperty('--i', line))
  })
  el.style.setProperty('--n', line + 1)
}

/* ---------- per-element setup ---------- */
function prepare(el) {
  const d = el.dataset
  if (d.revealSplit) splitText(el, d.revealSplit)
  if (d.revealDelay) el.style.setProperty('--rv-delay', `${Number(d.revealDelay)}ms`)
  if (d.revealDuration) el.style.setProperty('--rv-duration', `${Number(d.revealDuration)}ms`)
  if (d.revealStagger) el.style.setProperty('--rv-stagger', `${Number(d.revealStagger)}ms`)
}

function prepareGroup(group) {
  const stagger = Number(group.dataset.revealStagger || 90)
  const base = Number(group.dataset.revealDelay || 0)
  group.querySelectorAll('[data-reveal]').forEach((el, i) => {
    if (!el.dataset.revealDelay) el.style.setProperty('--rv-delay', `${base + i * stagger}ms`)
    el.dataset.revealInGroup = '1'
  })
}

function show(el) { el.classList.add('is-inview') }
function hide(el) { el.classList.remove('is-inview') }

/* ---------- observer ---------- */
const observers = new Map()   /* threshold -> IntersectionObserver */
function observerFor(threshold) {
  if (observers.has(threshold)) return observers.get(threshold)
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target
      const members = target.hasAttribute('data-reveal-group')
        ? [target, ...target.querySelectorAll('[data-reveal]')]
        : [target]
      if (entry.isIntersecting) {
        members.forEach(show)
        if (target.dataset.revealOnce !== 'false') io.unobserve(target)
      } else if (target.dataset.revealOnce === 'false') {
        members.forEach(hide)
      }
    }
  }, { threshold, rootMargin: '0px 0px -6% 0px' })
  observers.set(threshold, io)
  return io
}

export function initReveal(root = document) {
  const groups = [...root.querySelectorAll('[data-reveal-group]:not([data-reveal-bound])')]
  const singles = [...root.querySelectorAll('[data-reveal]:not([data-reveal-bound])')]
  if (!groups.length && !singles.length) return

  groups.forEach(prepareGroup)
  singles.forEach(prepare)
  const watch = [...groups, ...singles.filter((el) => !el.dataset.revealInGroup)]
  watch.forEach((el) => el.setAttribute('data-reveal-bound', ''))
  singles.forEach((el) => el.setAttribute('data-reveal-bound', ''))

  if (reduceMotion() || !('IntersectionObserver' in window)) {
    singles.forEach(show)
    groups.forEach(show)
    return
  }

  const start = () => watch.forEach((el) => observerFor(Number(el.dataset.revealThreshold || 0.2)).observe(el))
  if (document.documentElement.classList.contains('is-preloading')) {
    document.addEventListener('romai:preloader:done', start, { once: true })
  } else {
    start()
  }
}
