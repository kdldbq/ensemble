#!/usr/bin/env node
/**
 * 10.17 — Large-sheet benchmark.
 *
 * Generates an N-row × M-col workbook in memory, then times the operations
 * a real session does most often: JSON parse, JSON serialize (= snapshot
 * round-trip), and a 5-field pivot.  Useful as a smoke test for the
 * "腾讯单表 10 万行" anchor.
 *
 * Usage:
 *   node scripts/bench-large-sheet.mjs           # 100 000 × 10
 *   node scripts/bench-large-sheet.mjs 500000 20 # custom
 */

import { computePivot } from '../packages/core/dist/pivot.js'

const ROWS = Number(process.argv[2] ?? 100_000)
const COLS = Number(process.argv[3] ?? 10)
const HEADER = Array.from({ length: COLS }, (_, i) => `col_${i + 1}`)

function makeData(rows, cols) {
  const out = []
  const regions = ['NA', 'EU', 'APAC', 'LATAM']
  const products = ['A', 'B', 'C', 'D', 'E']
  for (let i = 0; i < rows; i++) {
    const row = { region: regions[i % regions.length], product: products[i % products.length] }
    for (let c = 0; c < cols - 2; c++) {
      row[`m${c}`] = Math.round(Math.random() * 1000)
    }
    out.push(row)
  }
  return out
}

function makeUniverJson(rows, cols) {
  const cellData = {}
  for (let r = 0; r < rows; r++) {
    const rec = {}
    for (let c = 0; c < cols; c++) {
      rec[c] = { v: r === 0 ? HEADER[c] : Math.random() * 1000 }
    }
    cellData[r] = rec
  }
  return {
    id: 'bench',
    sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Bench', cellData } },
  }
}

function timed(label, fn) {
  const t0 = process.hrtime.bigint()
  const r = fn()
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`  ${label.padEnd(36)} ${ms.toFixed(1)} ms`)
  return r
}

console.log(`\nensemble large-sheet bench — ${ROWS.toLocaleString()} rows × ${COLS} cols\n`)

const rows = timed('build flat row[]', () => makeData(ROWS, COLS))
const univerJson = timed('build Univer JSON', () => makeUniverJson(ROWS, COLS))
const serialized = timed('JSON.stringify (snapshot)', () => JSON.stringify(univerJson))
console.log(`  snapshot size: ${(serialized.length / 1024 / 1024).toFixed(2)} MB`)
timed('JSON.parse (round-trip)', () => JSON.parse(serialized))

const result = timed('computePivot region×product sum(m0)', () =>
  computePivot(rows, {
    rows: ['region'],
    cols: ['product'],
    values: [{ field: 'm0', agg: 'sum' }],
  }),
)
console.log(
  `  pivot result: ${result.rowKeys.length} row groups × ${result.colKeys.length} col groups\n`,
)
