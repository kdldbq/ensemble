#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const HEADER = `/**
 * Copyright 2026 kdldbq and ensemble contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * See LICENSE for details.
 */
`

const files = execSync(
  'git ls-files "packages/*/src/**/*.ts" "packages/*/src/**/*.tsx" "packages/*/src/**/*.vue"',
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean)

let added = 0
for (const file of files) {
  const content = readFileSync(file, 'utf8')
  if (content.startsWith('/**') && content.includes('Apache License')) continue
  writeFileSync(file, HEADER + content)
  added++
}
console.log(`Headers: +${added}, skipped ${files.length - added}`)
