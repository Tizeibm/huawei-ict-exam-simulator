import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Locate Babel from system Node modules or project node_modules
const babelPaths = ['/usr/share/nodejs/@babel/core', '@babel/core']
let babel = null
let presetTsPath = null
for (const bp of babelPaths) {
  try {
    babel = require(bp)
    presetTsPath = require.resolve('@babel/preset-typescript', { paths: ['/usr/share/nodejs', process.cwd()] })
    break
  } catch {
    // try next
  }
}

const filesToCompile = [
  'lib/auth/access.ts',
  'lib/auth/access.test.ts',
  'lib/exam/config.ts',
  'lib/exam/generate.ts',
  'lib/exam/quality.ts',
  'lib/exam/scoring.ts',
  'lib/exam/timer.ts',
  'lib/exam/analytics.ts',
  'lib/exam-service.ts',
  'lib/exam/exam-engine.test.ts',
]

if (!babel || !presetTsPath) {
  // Modern Node (v22.6+) supports native TypeScript stripping directly
  const res = spawnSync(
    process.execPath,
    ['--test', 'lib/auth/access.test.ts', 'lib/exam/exam-engine.test.ts'],
    { stdio: 'inherit' },
  )
  process.exit(res.status ?? 1)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ictprep-tests-'))
try {
  for (const rel of filesToCompile) {
    const srcPath = path.join(process.cwd(), rel)
    const outRel = rel.replace(/\.ts$/, '.mjs')
    const outPath = path.join(tmpDir, outRel)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })

    const code = fs.readFileSync(srcPath, 'utf8')
    const transformed = babel.transformSync(code, {
      filename: srcPath,
      presets: [[presetTsPath, { allExtensions: true }]],
      retainLines: true,
    })

    // Rewrite relative `.ts` imports to `.mjs` for ESM execution
    const rewritten = (transformed.code ?? '').replace(
      /(from\s+['"]\.[^'"]+)\.ts(['"])/g,
      '$1.mjs$2',
    )
    fs.writeFileSync(outPath, rewritten, 'utf8')
  }

  const testFiles = [
    path.join(tmpDir, 'lib/auth/access.test.mjs'),
    path.join(tmpDir, 'lib/exam/exam-engine.test.mjs'),
  ]
  const res = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' })
  process.exitCode = res.status ?? 1
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
