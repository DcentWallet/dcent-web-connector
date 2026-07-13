#!/usr/bin/env node
/**
 * check-payload-contract-shape.mjs
 *
 * Validates the payload *shape* in docs/v2-payload-contract.md against the
 * playground presets (source of truth), beyond the family-coverage check.
 *
 * For every fenced ```js / ```javascript block that carries a
 * `// Source: ... → <preset-id>` reference:
 *   1. Existence — <preset-id> must exist in playground/presets.*.json.
 *   2. Field names — every object key used in the doc example must appear in
 *      that preset's `transaction` object (recursively). This catches wrong
 *      field names (casing, snake_case vs camelCase, invented fields).
 *
 * Escape hatch: add `// shape-ignore: fieldA, fieldB` inside a block to allow
 * doc-only illustrative keys that are intentionally not in the preset.
 *
 * Exit 0 = all shapes consistent. Exit 1 = missing preset or field mismatch.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// --- load presets: id -> preset object ---
const PRESET_FILES = ['evm', 'non-evm', 'rest', 'bitcoin-tx', 'account']
const presets = new Map()
for (const f of PRESET_FILES) {
  let arr
  try {
    arr = JSON.parse(readFileSync(resolve(ROOT, `playground/presets.${f}.json`), 'utf8'))
  } catch {
    continue
  }
  if (!Array.isArray(arr)) continue
  for (const p of arr) if (p && p.id) presets.set(p.id, p)
}

// recursively collect every object key
function collectKeys(obj, set = new Set()) {
  if (Array.isArray(obj)) {
    for (const v of obj) collectKeys(v, set)
    return set
  }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      set.add(k)
      collectKeys(obj[k], set)
    }
  }
  return set
}

// structural / call-envelope keys that wrap the payload — not preset fields
const IGNORE = new Set(['transaction', 'payload', 'keyPath', 'method', 'chainId'])

const doc = readFileSync(resolve(ROOT, 'docs/v2-payload-contract.md'), 'utf8')
const blocks = [...doc.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g)].map((m) => m[1])

const errors = []
let checked = 0

for (const raw of blocks) {
  const refM = raw.match(/→\s*([A-Za-z][\w:-]*)/)
  if (!refM) continue // no preset reference in this block → skip shape check
  const id = refM[1]

  if (!presets.has(id)) {
    errors.push(`referenced preset not found: '${id}'`)
    continue
  }
  const preset = presets.get(id)
  if (!preset.transaction || typeof preset.transaction !== 'object') continue // no tx payload to compare
  const presetKeys = collectKeys(preset.transaction)

  // inline escape hatch
  const ignoreExtra = new Set()
  const igM = raw.match(/shape-ignore:\s*([\w,\s]+)/)
  if (igM) igM[1].split(',').forEach((s) => s.trim() && ignoreExtra.add(s.trim()))

  // strip comments, collect object keys (`word:` after { , or line start)
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const docKeys = [...code.matchAll(/(?:^|[{,[]\s*)([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1])

  checked++
  for (const k of docKeys) {
    if (IGNORE.has(k) || ignoreExtra.has(k)) continue
    if (!presetKeys.has(k)) {
      errors.push(`field '${k}' not in preset '${id}' (possible wrong field name)`)
    }
  }
}

if (errors.length > 0) {
  console.error('payload-contract shape check FAILED (docs/v2-payload-contract.md):')
  ;[...new Set(errors)].forEach((e) => console.error(`  ${e}`))
  console.error('\nFix the field name to match the preset, or add `// shape-ignore: <field>` if intentional.')
  process.exit(1)
}

console.log(`payload-contract shape OK: ${checked} example block(s) matched their presets`)
