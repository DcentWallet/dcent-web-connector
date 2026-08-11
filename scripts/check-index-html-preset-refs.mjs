#!/usr/bin/env node
/**
 * check-index-html-preset-refs.mjs
 *
 * Validates that preset-id-looking <code> references inside docs/index.html
 * still resolve to a real preset in playground/presets.*.json (source of
 * truth). Catches the case where a preset was renamed/removed but the
 * hand-written dev guide still cites the old id (docs-payload-fidelity rule).
 *
 * Candidate extraction: any <code>{token}</code> where token has >= 3
 * kebab-case segments. Two filters remove generic (non-preset) code samples:
 *   1. token's first segment must match a real preset id prefix (the family
 *      group actually used by presets) — filters unrelated terms.
 *   2. token must not end in a bare numeric segment (e.g. "coreum-mainnet-1",
 *      a Cosmos-SDK chain-id literal quoted in prose) — no preset id in this
 *      codebase ends in a numeric segment.
 * A trailing "-*" means "some preset id starts with this prefix" (wildcard
 * reference to a preset family, e.g. stellar-soroban-invoke-*).
 *
 * Escape hatch: add the token to KNOWN_NON_PRESET below if a legitimate
 * non-preset code span passes both filters (should be rare — empirically 0
 * false positives at authoring time).
 *
 * Exit 0 = every candidate resolves to a real preset id (or valid prefix).
 * Exit 1 = dangling reference(s) found.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const KNOWN_NON_PRESET = new Set([])

// preset id universe (source of truth)
const PRESET_FILES = ['evm', 'non-evm', 'rest', 'bitcoin-tx', 'account']
const ids = new Set()
for (const f of PRESET_FILES) {
  let arr
  try {
    arr = JSON.parse(readFileSync(resolve(ROOT, `playground/presets.${f}.json`), 'utf8'))
  } catch {
    continue
  }
  if (!Array.isArray(arr)) continue
  for (const p of arr) if (p && p.id) ids.add(p.id)
}
const prefixes = new Set([...ids].map((id) => id.split('-')[0]))

// candidate extraction from docs/index.html
const html = readFileSync(resolve(ROOT, 'docs/index.html'), 'utf8')
const re = /<code>([a-z][a-z0-9]*(?:-[a-z0-9]+){2,})(-\*)?<\/code>/g
const candidates = new Set()
let m
while ((m = re.exec(html))) candidates.add(m[1] + (m[2] || ''))

const dangling = []
for (const raw of candidates) {
  if (KNOWN_NON_PRESET.has(raw)) continue

  const wildcard = raw.endsWith('-*')
  const token = wildcard ? raw.slice(0, -2) : raw
  const firstSeg = token.split('-')[0]

  if (!prefixes.has(firstSeg)) continue // not preset-id-shaped — generic code sample, ignore
  if (/-\d+$/.test(token)) continue // chain-id-style literal (e.g. coreum-mainnet-1), not a preset id

  const exists = wildcard ? [...ids].some((id) => id === token || id.startsWith(`${token}-`)) : ids.has(token)

  if (!exists) dangling.push(raw)
}

if (dangling.length > 0) {
  console.error('docs/index.html preset reference drift:')
  dangling.forEach((d) =>
    console.error(`  dangling: <code>${d}</code> — no matching preset id in playground/presets.*.json`)
  )
  console.error(
    '\nFix: update the reference to the current preset id, or if this is a legitimate non-preset ' +
      'code span, add it to KNOWN_NON_PRESET in scripts/check-index-html-preset-refs.mjs'
  )
  process.exit(1)
}

console.log(`index.html preset refs OK: ${candidates.size} candidate(s) checked, 0 dangling`)
