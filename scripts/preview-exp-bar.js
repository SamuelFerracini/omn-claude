// Run: node plugin/claude/hooks/preview-exp-bar.js
import { pipRow, expPct } from './register.js'

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(';')
const L = { done: 'D', current: 'C', off: 'O' }
const line = (label, pct, pulse = false) => {
  const row = pipRow(pct, pulse)
  const bar = row.map((p) => `\x1b[38;2;${rgb(p.color)}m${p.glyph}\x1b[0m`).join('')
  const legend = row.map((p) => L[p.state]).join(' ')
  console.log(`${label.padEnd(28)} exp ${bar}   ${legend}${pulse ? '  (pulse)' : ''}`)
}
const g = (label, exp) => line(`${label} (${exp})`, expPct(exp))

line('0%', 0)
line('0.5%', 0.5)
line('10%', 10)
line('24.9%', 24.9)
line('25%', 25)
line('25.1%', 25.1)
g('47.6K, stage 2 (27.6%)', 47600)
line('49.9%', 49.9)
line('50%', 50)
line('74.9%', 74.9)
line('75%', 75)
line('86% pulse on', 86, true)
line('86% pulse off', 86, false)
line('99.9%', 99.9)
line('100%', 100)
g('stage 4', 600000)
g('last exp of stage 1', 19999)
g('first exp of stage 2', 20000)
console.log('\nD=done (#9d8cff)  C=current (#847abf, pulse #efeaff)  O=off (#6b6880)')
