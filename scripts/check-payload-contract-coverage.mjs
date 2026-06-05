#!/usr/bin/env node
/**
 * check-payload-contract-coverage.mjs
 *
 * Validates that doc/v2-payload-contract.md has a `### {Family}` section
 * for every family in playground/chains.json.
 *
 * F = family set from chains.json
 * D = family set from doc/v2-payload-contract.md (### {Family} headers)
 *
 * Exit 0 = all families covered (F \ D is empty).
 * Exit 1 = missing families (F \ D is non-empty).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// F: family set from chains.json
const chains = JSON.parse(readFileSync(resolve(ROOT, 'playground/chains.json'), 'utf8'))
const F = new Set(chains.map((c) => c.family.toLowerCase()))

// D: family set from doc/v2-payload-contract.md (### {Family} headers)
const doc = readFileSync(resolve(ROOT, 'doc/v2-payload-contract.md'), 'utf8')
const D = new Set(
  [...doc.matchAll(/^### ([A-Za-z][A-Za-z0-9]*)/gm)].map((m) => m[1].toLowerCase())
)

// F \ D = families missing from doc
const missing = [...F].filter((f) => !D.has(f))

if (missing.length > 0) {
  console.error('payload-contract coverage gap:')
  missing.forEach((f) => console.error(`  missing: ### ${f.charAt(0).toUpperCase() + f.slice(1)}`))
  process.exit(1)
}

console.log(`payload-contract coverage OK: ${F.size} families covered`)
