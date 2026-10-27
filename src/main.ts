import './style.css'
import '@fontsource-variable/manrope'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { createIcons, Activity, ArrowRight, Binary, BookOpen, Check, ChevronDown, CircleCheck, CircleX, Eraser, Eye, EyeOff, Flame, Info, Pencil, Redo2, RotateCcw, Shuffle, Trash2, Undo2, X, Zap } from 'lucide'
import { encode, generateBits, gradeSamples, parseBits, schemes } from './line-codes'
import type { CodeId, Level } from './line-codes'

type Mode = 'draw' | 'solve'
type Feedback = { type: 'idle' | 'error' | 'success' | 'solution'; title: string; detail: string }
interface Round {
  bits: string
  samples: (Level | null)[]
  decoded: string[]
  history: (Level | null)[][]
  redo: (Level | null)[][]
  feedback: Feedback
  wrongBits: number[]
  showSolution: boolean
  revealed: boolean
  solved: boolean
  number: number
}
interface Stats { correct: number; attempts: number; streak: number }

const icons = { Activity, ArrowRight, Binary, BookOpen, Check, ChevronDown, CircleCheck, CircleX, Eraser, Eye, EyeOff, Flame, Info, Pencil, Redo2, RotateCcw, Shuffle, Trash2, Undo2, X, Zap }
const app = document.querySelector<HTMLDivElement>('#app')!
const $ = <ElementType extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<ElementType>(selector)!
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`
const idleFeedback = (): Feedback => ({ type: 'idle', title: 'Awaiting your answer', detail: 'Not checked yet' })
const state = { mode: (location.hash === '#solve' ? 'solve' : 'draw') as Mode, solveView: 'encode' as 'encode' | 'decode', code: 'unipolar-nrz' as CodeId, tool: 'pencil', reference: true }
const stats = loadStats()

function makeRound(length = 8, number = 1, bits = generateBits(length, state.code)): Round {
  return { bits, samples: Array.from({ length: bits.length * 2 }, () => null), decoded: Array.from({ length: bits.length }, () => ''), history: [], redo: [], feedback: idleFeedback(), wrongBits: [], showSolution: false, revealed: false, solved: false, number }
}

const rounds: Record<Mode | 'solver', Round> = { draw: makeRound(), solve: makeRound(), solver: makeRound() }
const solverActive = () => state.mode === 'solve' && state.solveView === 'encode'
const roundKey = (): Mode | 'solver' => solverActive() ? 'solver' : state.mode
const round = () => rounds[roundKey()]
const scheme = () => schemes.find((item) => item.id === state.code)!
const usesHalfBits = () => ['unipolar-rz', 'polar-rz', 'manchester', 'differential-manchester', 'ami-rz', 'differential-rz'].includes(state.code)
let observer: ResizeObserver | undefined
let drawing = false
let previousSample = -1
let hover: { index: number; level: Level } | null = null
let keyboardIndex = 0

function loadStats(): Stats {
  try {
    const saved = JSON.parse(localStorage.getItem('lineform-progress') || 'null') as Stats | null
    if (saved && [saved.correct, saved.attempts, saved.streak].every((value) => Number.isInteger(value) && value >= 0) && saved.correct <= saved.attempts) return saved
  } catch { }
  return { correct: 0, attempts: 0, streak: 0 }
}

function saveStats() {
  try { localStorage.setItem('lineform-progress', JSON.stringify(stats)) } catch { }
}

function preview(code: CodeId, compact = false): string {
  const bits = code === 'hdb3' ? '10000100' : '10110'
  const { levels, markers } = encode(bits, code)
  const width = compact ? 34 : 236
  const height = compact ? 22 : 92
  const left = compact ? 1 : 12
  const step = (width - left * 2) / levels.length
  const y = (level: Level) => height / 2 - level * (compact ? 7 : 20)
  let path = `M ${left} ${y(levels[0])}`
  levels.forEach((level, index) => {
    if (index > 0) path += ` V ${y(level)}`
    path += ` H ${left + (index + 1) * step}`
  })
  return `<svg viewBox="0 0 ${width} ${height}" fill="none" ${compact ? 'aria-hidden="true"' : `role="img" aria-label="${scheme().name} example for ${bits}"`}>
    ${!compact ? `<path d="M 12 46 H 224" stroke="currentColor" opacity=".13"/>${bits.split('').map((bit, index) => `<text x="${left + (index * 2 + 1) * step}" y="12" text-anchor="middle">${bit}</text>`).join('')}` : ''}
    <path d="${path}" stroke="currentColor" stroke-width="${compact ? 1.7 : 2}" stroke-linejoin="round" stroke-linecap="round"/>
    ${!compact ? markers.map((mark, index) => mark ? `<text class="substitution-label" x="${left + (index * 2 + 1) * step}" y="86" text-anchor="middle">${mark}</text>` : '').join('') : ''}
  </svg>`
}

function solutionSteps() {
  const { levels, markers } = encode(round().bits, state.code)
  const voltage = (level: Level) => level === 1 ? '+V' : level === -1 ? '-V' : '0 V'
  return `<details class="solution-steps" open><summary><span>Encoding steps</span><span class="steps-count">${round().bits.length} intervals${icon('chevron-down')}</span></summary><div class="steps-table-scroll"><table><caption class="sr-only">Per-bit voltage levels and substitution marks</caption><thead><tr><th>Bit</th><th>Data</th><th>First half</th><th>Second half</th><th>Mark</th></tr></thead><tbody>${round().bits.split('').map((bit, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${bit}</td><td>${voltage(levels[index * 2])}</td><td>${voltage(levels[index * 2 + 1])}</td><td>${markers[index] ? `<span class="substitution-mark mark-${markers[index].toLowerCase()}">${markers[index]} <span>${markers[index] === 'B' ? 'Balance' : 'Violation'}</span></span>` : '<span class="no-mark">-</span>'}</td></tr>`).join('')}</tbody></table></div></details>`
}

function render() {
  observer?.disconnect()
  drawing = false
  hover = null
  keyboardIndex = 0
  const current = round()
  const activeScheme = scheme()
  const groups = [...new Set(schemes.map((item) => item.group))]
  const lengthOptions = [...new Set([8, 12, 16, 24, current.bits.length])].sort((first, second) => first - second)
  const isDraw = state.mode === 'draw'
  const isSolver = solverActive()
  const levelText = state.code.startsWith('unipolar') ? '0, +V' : ['polar-nrz', 'manchester', 'differential-manchester'].includes(state.code) ? '-V, +V' : '-V, 0, +V'

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#draw" aria-label="Lineform home">${icon('activity')}<span>lineform<span class="brand-dot">.</span></span></a>
      <nav class="mode-tabs" aria-label="Practice mode">
        <button class="mode-tab ${isDraw ? 'active' : ''}" data-mode="draw" aria-current="${isDraw ? 'page' : 'false'}">${icon('pencil')}<span>Draw waveform</span></button>
        <button class="mode-tab ${!isDraw ? 'active' : ''}" data-mode="solve" aria-current="${!isDraw ? 'page' : 'false'}">${icon('binary')}<span>Solve line codes</span></button>
      </nav>
      <div class="topbar-progress"><span title="Current correct-answer streak">${icon('flame')}<strong id="top-streak">${stats.streak}</strong><span>streak</span></span><span class="topbar-divider"></span><span class="session-dot"></span><span>Local session</span></div>
    </header>

    <div class="app-layout">
      <aside class="sidebar" aria-label="Line code selection">
        <div class="sidebar-title"><span>LINE CODES</span><span class="count-badge">10</span></div>
        ${groups.map((group) => `<section class="code-group"><h2>${group}</h2>${schemes.filter((item) => item.group === group).map((item) => `<button class="code-option ${item.id === state.code ? 'selected' : ''}" data-code="${item.id}" aria-pressed="${item.id === state.code}"><span class="code-wave">${preview(item.id, true)}</span><span>${item.name}</span>${item.id === state.code ? '<span class="selected-dot"></span>' : ''}</button>`).join('')}</section>`).join('')}
        <div class="sidebar-bottom">${icon('zap')}<div><strong>From bits to signals.</strong><span>Electrical line coding</span></div></div>
      </aside>

      <main class="main-content">
        <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-mark"></span>DIGITAL COMMUNICATIONS</div><h1>Line coding playground<span>.</span></h1></div><button class="button new-challenge" data-action="new">${icon('shuffle')}<span>New sequence</span></button></div>
        <div class="workspace-heading"><div class="workspace-title">${icon(isDraw ? 'pencil' : 'binary')}<h2>${isDraw ? 'Draw the waveform' : isSolver ? 'Line coding solver' : 'Decode the waveform'}</h2></div><div class="workspace-controls">${!isDraw ? `<div class="solve-views" aria-label="Solver direction"><button data-solve-view="encode" class="${isSolver ? 'active' : ''}" aria-pressed="${isSolver}">${icon('activity')}Encode</button><button data-solve-view="decode" class="${!isSolver ? 'active' : ''}" aria-pressed="${!isSolver}">${icon('binary')}Decode</button></div>` : ''}<span class="challenge-number">${isSolver ? 'PROBLEM' : 'CHALLENGE'} <strong>${String(current.number).padStart(2, '0')}</strong></span></div></div>

        <div class="practice-layout">
          <div class="practice-main">
            <section class="signal-editor" aria-label="${isDraw ? 'Waveform drawing challenge' : isSolver ? 'Automatic line coding solver' : 'Signal decoding challenge'}">
              <div class="editor-heading"><div class="active-code"><h3>${activeScheme.name}</h3><span class="family-tag">${activeScheme.family}</span></div><label class="length-control"><span>Sequence</span><span class="select-wrap"><select id="bit-length" aria-label="Sequence length">${lengthOptions.map((length) => `<option value="${length}" ${length === current.bits.length ? 'selected' : ''}>${length} bits</option>`).join('')}</select>${icon('chevron-down')}</span></label></div>
              <div class="mobile-code-select"><label for="mobile-code">Line code</label><span class="select-wrap"><select id="mobile-code">${schemes.map((item) => `<option value="${item.id}" ${item.id === state.code ? 'selected' : ''}>${item.name}</option>`).join('')}</select>${icon('chevron-down')}</span></div>

              <div class="sequence-heading"><span>${isDraw || isSolver ? 'BINARY SEQUENCE' : 'DECODED SEQUENCE'}</span>${isDraw || isSolver ? `<button class="icon-button edit-sequence" data-action="edit" title="Edit binary sequence" aria-label="Edit binary sequence">${icon('pencil')}</button>` : `<span class="sequence-unit">${current.bits.length} bit intervals</span>`}</div>
              <div class="signal-scroll"><div class="signal-inner" style="--bit-count: ${current.bits.length}">
                <div class="bit-cells">${current.bits.split('').map((bit, index) => `<div class="bit-cell"><span class="bit-index">${String(index + 1).padStart(2, '0')}</span>${isDraw || isSolver ? `<span class="source-bit">${bit}</span>` : `<input class="bit-entry" data-index="${index}" aria-label="Bit ${index + 1}" type="text" inputmode="numeric" autocomplete="off" maxlength="1" pattern="[01]" placeholder="-" value="${current.showSolution ? bit : current.decoded[index]}" ${current.showSolution || current.solved ? 'disabled' : ''}>`}</div>`).join('')}</div>
                <div class="canvas-wrap"><div class="canvas-caption"><span><span class="channel-dot"></span>${isDraw ? 'YOUR SIGNAL' : isSolver ? 'ENCODED SIGNAL' : 'RECEIVED SIGNAL'}</span><span id="canvas-state">${current.showSolution ? 'SOLUTION' : 'CH 01'}</span></div><canvas id="waveform" height="280" ${isDraw ? 'tabindex="0" role="application" aria-describedby="waveform-help" aria-label="Waveform editor"' : `role="img" aria-label="${isSolver ? 'Solved line code waveform' : 'Encoded waveform to decode'}"`}></canvas></div>
              </div></div>
              <span id="waveform-help" class="sr-only">Arrow Left and Right select a ${usesHalfBits() ? 'half-bit' : 'bit'} interval. Press 1 for positive voltage, 0 for zero, or minus for negative voltage. Up and Down change voltage. Backspace erases. Control Z undoes. Drag with a mouse or touch to draw.</span>

              ${isSolver ? `<div class="editor-toolbar solver-toolbar"><span class="solver-status">${icon('circle-check')}Encoded waveform</span><button class="text-button" data-action="edit">${icon('pencil')}Edit sequence</button></div>` : `<div class="editor-toolbar"><div class="drawing-tools">${isDraw ? `<div class="tool-segment" aria-label="Drawing tools"><button class="icon-button ${state.tool === 'pencil' ? 'is-active' : ''}" data-action="pencil" aria-label="Draw" title="Draw" aria-pressed="${state.tool === 'pencil'}">${icon('pencil')}</button><button class="icon-button ${state.tool === 'eraser' ? 'is-active' : ''}" data-action="eraser" aria-label="Erase" title="Erase" aria-pressed="${state.tool === 'eraser'}">${icon('eraser')}</button></div><span class="tool-divider"></span><button class="icon-button" data-action="undo" aria-label="Undo" title="Undo">${icon('undo-2')}</button><button class="icon-button" data-action="redo" aria-label="Redo" title="Redo">${icon('redo-2')}</button>` : `<span class="decode-label">${icon('binary')}Binary data</span>`}<button class="icon-button" data-action="clear" aria-label="Clear answer" title="Clear answer">${icon('trash-2')}</button></div><div class="toolbar-right">${isDraw ? `<span class="snap-label"><span class="snap-dot"></span>${usesHalfBits() ? '1/2' : '1'} Tb snap</span>` : ''}<button class="text-button solution-button" data-action="solution" aria-pressed="${current.showSolution}" title="Reveal solution (unscored)">${icon(current.showSolution ? 'eye-off' : 'eye')}<span>${current.showSolution ? 'Hide solution' : 'Solution'}</span></button></div></div>`}
              <div class="completion-row"><span id="completion-label"></span><div class="completion-track"><span id="completion-fill"></span></div><span class="voltage-label">V = 1 volt</span></div>
              <div class="answer-bar"><div id="feedback" class="feedback" role="status" aria-live="polite"></div>${!isSolver ? `<button class="button button-primary check-button" data-action="check"><span>Check answer</span>${icon('arrow-right')}</button>` : `<span class="solver-unscored">WORKED SOLUTION</span>`}</div>
            </section>

            <section class="signal-properties" aria-label="Signal properties"><div><span class="property-label">VOLTAGE LEVELS</span><strong>${levelText}</strong></div><div><span class="property-label">TIME RESOLUTION</span><strong>${usesHalfBits() ? 'Half bit' : 'Full bit'}<span> / ${usesHalfBits() ? 'Tb / 2' : 'Tb'}</span></strong></div><div><span class="property-label">CODE FAMILY</span><strong>${activeScheme.family}</strong></div></section>
            ${isSolver ? solutionSteps() : ''}
            <div class="convention-note">${icon('info')}<p>${activeScheme.convention}</p></div>
          </div>

          <aside class="reference-rail">
            <section class="reference-section"><div class="rail-heading"><h3>${icon('book-open')}Code reference</h3><button class="icon-button" data-action="reference" aria-label="${state.reference ? 'Hide' : 'Show'} code reference" title="${state.reference ? 'Hide' : 'Show'} code reference" aria-pressed="${state.reference}">${icon(state.reference ? 'eye' : 'eye-off')}</button></div>
              ${state.reference ? `<div class="reference-mapping"><div><span class="mapping-bit">1</span><p>${activeScheme.one}</p></div><div><span class="mapping-bit zero-bit">0</span><p>${activeScheme.zero}</p></div></div><div class="reference-preview">${preview(state.code)}<span>${activeScheme.shortName.toUpperCase()} / EXAMPLE</span></div><div class="reference-fact"><span class="small-label">${state.code === 'hdb3' ? 'SUBSTITUTION RULE' : 'THE PRINCIPLE'}</span><p>${activeScheme.fact}</p></div>` : `<div class="reference-hidden">${icon('eye-off')}<span>Reference hidden</span></div>`}
            </section>
            <section class="session-section"><div class="rail-heading"><h3>${icon('activity')}Your progress</h3><button class="icon-button" data-action="reset-progress" aria-label="Reset saved progress" title="Reset saved progress">${icon('rotate-ccw')}</button></div><div class="session-stat"><span>Correct answers</span><strong id="stat-correct">${stats.correct}</strong></div><div class="session-stat"><span>Total checks</span><strong id="stat-attempts">${stats.attempts}</strong></div><div class="session-stat"><span>Accuracy</span><strong id="stat-accuracy">${stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : '--'}<span>%</span></strong></div><div class="streak-strip">${icon('flame')}<span>Current streak</span><strong id="stat-streak">${stats.streak}</strong></div></section>
          </aside>
        </div>
        <footer class="page-footer"><span>LINEFORM <span class="footer-slash">/</span> THE SIGNAL LAB</span><span>Tb = bit interval</span></footer>
      </main>
    </div>

    <dialog id="sequence-dialog" class="sequence-dialog"><form id="sequence-form"><div class="dialog-heading"><h2>Binary sequence</h2><button class="icon-button" type="button" data-action="close-dialog" aria-label="Close dialog" title="Close">${icon('x')}</button></div><label for="custom-bits">4-24 bits</label><input id="custom-bits" name="bits" type="text" inputmode="numeric" autocomplete="off" maxlength="48" value="${current.bits}" required><p id="sequence-error" role="alert"></p><button class="button button-primary" type="submit">Apply sequence${icon('check')}</button></form></dialog>
  `
  createIcons({ icons })
  setupCanvas()
  updateProgress()
  renderFeedback()
}

function geometry() {
  const canvas = $<HTMLCanvasElement>('#waveform')
  const rect = canvas.getBoundingClientRect()
  const left = 56
  const right = rect.width - 24
  const middle = rect.height / 2
  const amplitude = (rect.height - 96) / 2
  return { canvas, rect, left, right, middle, amplitude, step: (right - left) / (round().bits.length * 2) }
}

function drawCanvas() {
  const { canvas, rect, left, right, middle, amplitude, step } = geometry()
  if (!rect.width) return
  const scale = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * scale)
  canvas.height = Math.round(rect.height * scale)
  const context = canvas.getContext('2d')!
  context.setTransform(scale, 0, 0, scale, 0, 0)
  const current = round()
  const y = (level: number) => middle - level * amplitude
  context.fillStyle = '#19231e'
  context.fillRect(0, 0, rect.width, rect.height)

  current.wrongBits.forEach((index) => {
    context.fillStyle = 'rgba(230, 130, 120, .11)'
    context.fillRect(left + index * 2 * step, y(1) - 16, step * 2, amplitude * 2 + 32)
  })

  for (let index = 0; index <= current.bits.length * 2; index++) {
    const major = index % 2 === 0
    if (!major && !usesHalfBits()) continue
    context.beginPath()
    context.strokeStyle = major ? '#354139' : '#2a352e'
    context.setLineDash(major ? [3, 5] : [2, 6])
    context.lineWidth = 1
    context.moveTo(left + index * step, 33)
    context.lineTo(left + index * step, rect.height - 32)
    context.stroke()
  }

  context.font = '11px "IBM Plex Mono", monospace'
  context.textAlign = 'right'
  for (const level of [1, 0, -1]) {
    context.beginPath()
    context.strokeStyle = level === 0 ? '#526052' : '#354139'
    context.setLineDash(level === 0 ? [] : [3, 5])
    context.moveTo(left, y(level))
    context.lineTo(right, y(level))
    context.stroke()
    context.fillStyle = level === 0 ? '#bbc7ba' : '#8b9b8e'
    context.fillText(level === 1 ? '+V' : level === -1 ? '-V' : '0', left - 17, y(level) + 4)
  }
  context.setLineDash([])
  context.fillStyle = '#839386'
  context.textAlign = 'center'
  for (let index = 0; index < current.bits.length; index++) {
    if (current.bits.length > 16 && index % 2 !== 0) continue
    if (left + index * 2 * step > right - 52) continue
    context.fillText(String(index), left + index * 2 * step, rect.height - 12)
  }
  context.textAlign = 'right'
  context.fillText('t / Tb', right, rect.height - 12)

  const trace = (samples: (Level | null)[], color: string, dashed = false) => {
    context.beginPath()
    context.lineWidth = dashed ? 2 : 2.7
    context.strokeStyle = color
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.setLineDash(dashed ? [7, 5] : [])
    if (!dashed) { context.shadowColor = color; context.shadowBlur = 7 }
    let connected = false
    samples.forEach((level, index) => {
      if (level === null) { connected = false; return }
      const position = left + index * step
      if (connected) context.lineTo(position, y(level))
      else context.moveTo(position, y(level))
      context.lineTo(position + step, y(level))
      connected = true
    })
    context.stroke()
    context.shadowBlur = 0
    context.setLineDash([])
  }

  const expected = encode(current.bits, state.code)
  if (state.mode === 'solve') trace(expected.levels, '#b7ea91')
  else {
    if (current.showSolution) trace(expected.levels, '#e9ca87', true)
    trace(current.samples, '#b7ea91')
  }

  if (current.showSolution || solverActive()) {
    context.fillStyle = '#e9ca87'
    context.textAlign = 'center'
    expected.markers.forEach((marker, index) => {
      if (marker) context.fillText(marker, left + (index * 2 + 1) * step, y(1) - 10)
    })
  }

  if (hover && state.mode === 'draw' && !current.showSolution && !current.solved) {
    const stride = usesHalfBits() ? 1 : 2
    const position = left + hover.index * step
    context.fillStyle = 'rgba(183, 234, 145, .055)'
    context.fillRect(position, 33, step * stride, rect.height - 65)
    context.beginPath()
    context.strokeStyle = state.tool === 'eraser' ? '#e5a89a' : '#c8f2ab'
    context.lineWidth = 4
    context.moveTo(position + 2, y(hover.level))
    context.lineTo(position + step * stride - 2, y(hover.level))
    context.stroke()
    context.beginPath()
    context.arc(position + step * stride / 2, y(hover.level), 4, 0, Math.PI * 2)
    context.fillStyle = '#19231e'
    context.fill()
    context.stroke()
  }
}

function setupCanvas() {
  const canvas = $<HTMLCanvasElement>('#waveform')
  observer = new ResizeObserver(drawCanvas)
  observer.observe(canvas)
  if (state.mode !== 'draw') return

  const position = (event: PointerEvent) => {
    const { rect, left, right, middle, amplitude, step } = geometry()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (x < left || x >= right || y < 28 || y > rect.height - 28) return null
    const stride = usesHalfBits() ? 1 : 2
    return { index: Math.floor((x - left) / (step * stride)) * stride, level: Math.max(-1, Math.min(1, Math.round((middle - y) / amplitude))) as Level }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || round().showSolution || round().solved) return
    const selected = position(event)
    if (!selected) return
    event.preventDefault()
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(event.pointerId)
    remember()
    drawing = true
    previousSample = selected.index
    hover = selected
    paint(selected.index, selected.level)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (round().showSolution || round().solved) return
    const selected = position(event)
    hover = selected
    if (drawing && selected) {
      const stride = usesHalfBits() ? 1 : 2
      const direction = selected.index >= previousSample ? stride : -stride
      if (selected.index !== previousSample) {
        for (let index = previousSample + direction; direction > 0 ? index <= selected.index : index >= selected.index; index += direction) paint(index, selected.level, false)
      } else paint(selected.index, selected.level, false)
      previousSample = selected.index
      updateProgress()
    }
    drawCanvas()
  })
  const stop = () => { drawing = false; previousSample = -1 }
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointercancel', stop)
  canvas.addEventListener('lostpointercapture', stop)
  canvas.addEventListener('pointerleave', () => { if (!drawing) { hover = null; drawCanvas() } })
  canvas.addEventListener('blur', () => { hover = null; drawCanvas() })
  canvas.addEventListener('focus', () => { hover = { index: keyboardIndex, level: round().samples[keyboardIndex] ?? 0 }; drawCanvas() })
  canvas.addEventListener('keydown', (event) => {
    if (round().showSolution || round().solved) return
    const stride = usesHalfBits() ? 1 : 2
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      changeHistory(event.shiftKey)
      return
    }
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      keyboardIndex = Math.max(0, Math.min(round().samples.length - stride, keyboardIndex + (event.key === 'ArrowRight' ? stride : -stride)))
    } else if (['1', '0', '-', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault()
      const existing = round().samples[keyboardIndex] ?? 0
      const next = event.key === '1' ? 1 : event.key === '0' ? 0 : event.key === '-' ? -1 : event.key === 'ArrowUp' ? Math.min(1, existing + 1) : event.key === 'ArrowDown' ? Math.max(-1, existing - 1) : null
      remember()
      paint(keyboardIndex, next as Level | null)
    } else return
    hover = { index: keyboardIndex, level: round().samples[keyboardIndex] ?? 0 }
    drawCanvas()
  })
}

function remember() {
  round().history.push([...round().samples])
  if (round().history.length > 80) round().history.shift()
  round().redo = []
}

function resetFeedback() {
  if (round().feedback.type !== 'idle') {
    round().feedback = idleFeedback()
    round().wrongBits = []
    renderFeedback()
  }
}

function paint(index: number, level: Level | null, refresh = true) {
  resetFeedback()
  const value = state.tool === 'eraser' ? null : level
  round().samples[index] = value
  if (!usesHalfBits()) round().samples[index + 1] = value
  if (refresh) { updateProgress(); drawCanvas() }
}

function completedBits() {
  if (solverActive()) return round().bits.length
  if (state.mode === 'solve') return round().decoded.filter((value) => /^[01]$/.test(value)).length
  return round().bits.split('').filter((_, index) => round().samples[index * 2] !== null && round().samples[index * 2 + 1] !== null).length
}

function updateProgress() {
  const current = round()
  const count = completedBits()
  $('#completion-label').textContent = `${String(count).padStart(2, '0')} / ${String(current.bits.length).padStart(2, '0')} bits ${state.mode === 'draw' ? 'drawn' : solverActive() ? 'encoded' : 'decoded'}`
  $('#completion-fill').style.width = `${count / current.bits.length * 100}%`
  const locked = current.showSolution || current.solved
  for (const action of ['pencil', 'eraser', 'undo', 'redo', 'clear', 'check']) {
    const button = app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
    if (!button) continue
    button.disabled = locked || (action === 'undo' && !current.history.length) || (action === 'redo' && !current.redo.length) || (action === 'clear' && count === 0 && current.samples.every((value) => value === null))
  }
  $('#canvas-state').textContent = solverActive() ? 'ENCODED' : current.showSolution ? 'SOLUTION' : current.solved ? 'MATCHED' : 'CH 01'
}

function renderFeedback() {
  const feedback: Feedback = solverActive() ? { type: 'success', title: 'Signal encoded', detail: `${scheme().name} / ${round().bits.length * 2} half-bit samples` } : round().feedback
  const feedbackIcon = feedback.type === 'success' ? 'circle-check' : feedback.type === 'error' ? 'circle-x' : feedback.type === 'solution' ? 'eye' : 'info'
  $('#feedback').className = `feedback feedback-${feedback.type}`
  $('#feedback').innerHTML = `${icon(feedbackIcon)}<div><strong>${feedback.title}</strong><span>${feedback.detail}</span></div>${round().solved ? `<button class="icon-button next-button" data-action="new" aria-label="Next challenge" title="Next challenge">${icon('arrow-right')}</button>` : ''}`
  createIcons({ icons })
}

function updateStats() {
  $('#stat-correct').textContent = String(stats.correct)
  $('#stat-attempts').textContent = String(stats.attempts)
  $('#stat-accuracy').innerHTML = `${stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : '--'}<span>%</span>`
  $('#stat-streak').textContent = String(stats.streak)
  $('#top-streak').textContent = String(stats.streak)
  saveStats()
}

function checkAnswer() {
  const current = round()
  if (solverActive() || current.solved || current.showSolution) return
  const count = completedBits()
  if (count < current.bits.length) {
    current.feedback = { type: 'error', title: `${current.bits.length - count} ${current.bits.length - count === 1 ? 'bit' : 'bits'} still empty`, detail: 'Incomplete answers are not scored.' }
    renderFeedback()
    return
  }
  const result = state.mode === 'draw' ? gradeSamples(current.samples, encode(current.bits, state.code).levels) : { wrongBits: current.bits.split('').flatMap((bit, index) => bit !== current.decoded[index] ? [index] : []) }
  const correct = result.wrongBits.length === 0
  current.wrongBits = result.wrongBits
  if (!current.revealed) {
    stats.attempts++
    if (correct) { stats.correct++; stats.streak++ }
    else stats.streak = 0
    updateStats()
  }
  if (correct) {
    current.solved = true
    current.feedback = { type: 'success', title: state.mode === 'draw' ? 'Perfect signal. Nicely done.' : 'Every bit accounted for.', detail: `${current.bits.length} of ${current.bits.length} bits correct${current.revealed ? ' / unscored' : ''}` }
  } else {
    current.feedback = { type: 'error', title: `${current.bits.length - result.wrongBits.length} of ${current.bits.length} bits correct`, detail: `Revisit ${result.wrongBits.length === 1 ? 'bit' : 'bits'} ${result.wrongBits.map((index) => index + 1).join(', ')}${current.revealed ? ' / unscored' : ''}` }
  }
  app.querySelectorAll<HTMLInputElement>('.bit-entry').forEach((input) => {
    input.classList.toggle('bit-wrong', current.wrongBits.includes(Number(input.dataset.index)))
    input.disabled = current.solved
  })
  updateProgress()
  renderFeedback()
  drawCanvas()
}

function newChallenge(length = round().bits.length, bits?: string) {
  const current = round()
  let nextBits = bits ?? generateBits(length, state.code)
  if (!bits) {
    for (let attempt = 0; attempt < 8 && nextBits === current.bits; attempt++) nextBits = generateBits(length, state.code)
  }
  rounds[roundKey()] = makeRound(length, current.number + 1, nextBits)
  render()
}

function selectCode(code: CodeId) {
  if (state.code === code || !schemes.some((item) => item.id === code)) return
  state.code = code
  for (const mode of ['draw', 'solve', 'solver'] as const) rounds[mode] = makeRound(rounds[mode].bits.length, rounds[mode].number)
  render()
}

function changeHistory(redo = false) {
  if (round().showSolution || round().solved) return
  const source = redo ? round().redo : round().history
  const target = redo ? round().history : round().redo
  const previous = source.pop()
  if (!previous) return
  target.push([...round().samples])
  round().samples = previous
  resetFeedback()
  updateProgress()
  drawCanvas()
}

function switchMode(mode: Mode) {
  if (state.mode === mode) return
  state.mode = mode
  history.replaceState(null, '', `#${mode}`)
  render()
}

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  if (target.closest('.brand')) { event.preventDefault(); switchMode('draw'); return }
  const modeButton = target.closest<HTMLButtonElement>('[data-mode]')
  if (modeButton) { switchMode(modeButton.dataset.mode as Mode); return }
  const solveButton = target.closest<HTMLButtonElement>('[data-solve-view]')
  if (solveButton) { state.solveView = solveButton.dataset.solveView as 'encode' | 'decode'; render(); return }
  const codeButton = target.closest<HTMLButtonElement>('[data-code]')
  if (codeButton) { selectCode(codeButton.dataset.code as CodeId); return }
  const button = target.closest<HTMLButtonElement>('[data-action]')
  if (!button || button.disabled) return
  switch (button.dataset.action) {
    case 'new': newChallenge(); break
    case 'check': checkAnswer(); break
    case 'pencil':
    case 'eraser':
      state.tool = button.dataset.action
      for (const tool of ['pencil', 'eraser']) {
        const element = $(`[data-action="${tool}"]`)
        element.classList.toggle('is-active', state.tool === tool)
        element.setAttribute('aria-pressed', String(state.tool === tool))
      }
      break
    case 'undo': changeHistory(); break
    case 'redo': changeHistory(true); break
    case 'clear':
      if (state.mode === 'draw') { remember(); round().samples.fill(null) }
      else { round().decoded.fill(''); app.querySelectorAll<HTMLInputElement>('.bit-entry').forEach((input) => { input.value = ''; input.classList.remove('bit-wrong') }) }
      resetFeedback(); updateProgress(); drawCanvas()
      break
    case 'solution':
      round().showSolution = !round().showSolution
      round().revealed = true
      round().feedback = { type: 'solution', title: round().showSolution ? 'Solution revealed' : 'Solution hidden', detail: 'This challenge is now unscored.' }
      render()
      break
    case 'reference': state.reference = !state.reference; render(); break
    case 'edit': {
      $<HTMLDialogElement>('#sequence-dialog').showModal()
      $<HTMLInputElement>('#custom-bits').select()
      break
    }
    case 'close-dialog': $<HTMLDialogElement>('#sequence-dialog').close(); break
    case 'reset-progress':
      Object.assign(stats, { correct: 0, attempts: 0, streak: 0 })
      updateStats()
      break
  }
})

app.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement
  if (target.id === 'bit-length') newChallenge(Number(target.value))
  if (target.id === 'mobile-code') selectCode(target.value as CodeId)
})

app.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement
  if (!input.matches('.bit-entry') || round().showSolution || round().solved) return
  const index = Number(input.dataset.index)
  input.value = input.value.replace(/[^01]/g, '').slice(-1)
  round().decoded[index] = input.value
  resetFeedback()
  app.querySelectorAll('.bit-wrong').forEach((item) => item.classList.remove('bit-wrong'))
  if (input.value) app.querySelector<HTMLInputElement>(`.bit-entry[data-index="${index + 1}"]`)?.focus()
  updateProgress()
  drawCanvas()
})

app.addEventListener('keydown', (event) => {
  const input = event.target as HTMLInputElement
  if (!input.matches('.bit-entry')) return
  const index = Number(input.dataset.index)
  if (event.key === 'Enter') { event.preventDefault(); checkAnswer() }
  if (event.key === 'ArrowLeft' || (event.key === 'Backspace' && !input.value)) app.querySelector<HTMLInputElement>(`.bit-entry[data-index="${index - 1}"]`)?.focus()
  if (event.key === 'ArrowRight') app.querySelector<HTMLInputElement>(`.bit-entry[data-index="${index + 1}"]`)?.focus()
})

app.addEventListener('paste', (event) => {
  const input = event.target as HTMLInputElement
  if (!input.matches('.bit-entry') || round().showSolution || round().solved) return
  event.preventDefault()
  const bits = event.clipboardData?.getData('text').replace(/\s/g, '') ?? ''
  const start = Number(input.dataset.index)
  if (!/^[01]+$/.test(bits) || bits.length > round().bits.length - start) {
    round().feedback = { type: 'error', title: 'Invalid binary sequence', detail: `Use up to ${round().bits.length - start} binary digits.` }
    renderFeedback()
    return
  }
  bits.split('').forEach((bit, offset) => {
    round().decoded[start + offset] = bit
    $<HTMLInputElement>(`.bit-entry[data-index="${start + offset}"]`).value = bit
  })
  resetFeedback()
  app.querySelectorAll('.bit-wrong').forEach((item) => item.classList.remove('bit-wrong'))
  app.querySelector<HTMLInputElement>(`.bit-entry[data-index="${Math.min(start + bits.length, round().bits.length - 1)}"]`)?.focus()
  updateProgress()
  drawCanvas()
})

app.addEventListener('submit', (event) => {
  if ((event.target as HTMLFormElement).id !== 'sequence-form') return
  event.preventDefault()
  try {
    const bits = parseBits($<HTMLInputElement>('#custom-bits').value)
    if (bits.length < 4 || bits.length > 24) throw new Error('Use 4 to 24 binary digits.')
    $<HTMLDialogElement>('#sequence-dialog').close()
    newChallenge(bits.length, bits)
  } catch (error) { $('#sequence-error').textContent = (error as Error).message }
})

render()
