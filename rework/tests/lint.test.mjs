// Owns: proof that the lint catches each rule, including Stage 0's deliberately illegal import.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lintSource } from '../tools/lint.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Lints a throwaway src tree holding only `files`, and returns the rule names that fired. */
function rulesFiredBy(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-lint-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `// Owns: a test fixture.\n${body}\n`);
    }
    return lintSource(root).map((violation) => violation.rule);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const SIM_INDEX = { 'sim/index.ts': 'export const a = 1;' };

const ILLEGAL = [
  ['render importing sim', 'A4-import', { ...SIM_INDEX, 'render/frame/index.ts': `import '../../sim/index.ts';` }],
  [
    'sim importing render',
    'A4-import',
    {
      'render/frame/index.ts': 'export const a = 1;',
      'sim/index.ts': `import '../render/frame/index.ts';`,
    },
  ],
  [
    'a type-only import still counts',
    'A4-import',
    {
      ...SIM_INDEX,
      'render/frame/index.ts': `import type { a } from '../../sim/index.ts';\nexport type B = typeof a;`,
    },
  ],
  [
    're-exporting across a wall',
    'A4-import',
    {
      ...SIM_INDEX,
      'render/frame/index.ts': `export * from '../../sim/index.ts';`,
    },
  ],
  [
    'reaching inside another module',
    'A4-internals',
    {
      'sim/rules.ts': 'export const a = 1;',
      'scene/index.ts': `import '../sim/rules.ts';`,
    },
  ],
  [
    'only app picks an implementation',
    'A4-internals',
    {
      'gpu/webgl2/index.ts': 'export const a = 1;',
      'render/frame/index.ts': `import '../../gpu/webgl2/index.ts';`,
    },
  ],
  ['a module missing from the table', 'A4-unknown-module', { 'physics/index.ts': 'export const a = 1;' }],
  ['importing a file that is not there', 'A4-missing-file', { 'sim/index.ts': `import './nope.ts';` }],
  ['importing a package', 'A4-package', { 'sim/index.ts': `import 'three';` }],
  ['GL calls outside gpu', 'A5-gl', { 'render/frame/index.ts': 'declare const gl: { clear(): void };\ngl.clear();' }],
  ['GL types outside gpu', 'A5-gl', { 'ui/index.ts': 'export type A = WebGL2RenderingContext;' }],
  [
    'asking for a context outside gpu',
    'A5-gl',
    {
      'platform/browser/index.ts': `document.createElement('canvas').getContext('webgl2');`,
    },
  ],
  ['the DOM outside platform and gpu', 'A8-browser', { 'ui/index.ts': 'document.title;' }],
  ['the clock in the sim', 'A8-browser', { 'sim/index.ts': 'export const a = Date.now();' }],
  ['Math.random anywhere', 'A1-random', { 'platform/browser/index.ts': 'export const a = Math.random();' }],
  [
    'type branching with ===',
    'C2-type-branch',
    {
      'sim/index.ts': `export const a = (v: { type: string }) => v.type === 'tank';`,
    },
  ],
  [
    'type branching with switch',
    'C2-type-branch',
    {
      'sim/index.ts': `export const a = (v: { kind: string }) => {\n  switch (v.kind) {\n    case 'tank':\n  }\n};`,
    },
  ],
  ['any', 'Q5-any', { 'sim/index.ts': 'export const a = (v: any) => v;' }],
  ['values in contracts', 'contracts-types-only', { 'contracts/index.ts': 'export const a = 1;' }],
  ['a long line', 'Q1-line-length', { 'sim/index.ts': `// ${'x'.repeat(120)}` }],
];

for (const [name, rule, files] of ILLEGAL) {
  test(`the lint rejects ${name}`, () => {
    assert.ok(rulesFiredBy(files).includes(rule), `expected ${rule}`);
  });
}

test('the lint rejects a file with no owner comment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-lint-'));
  try {
    fs.mkdirSync(path.join(root, 'sim'));
    fs.writeFileSync(path.join(root, 'sim', 'index.ts'), 'export const a = 1;\n');
    assert.ok(lintSource(root).some((violation) => violation.rule === 'Q3-owner-comment'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('type branching is fine inside content, and legal imports pass', () => {
  const fired = rulesFiredBy({
    'content/index.ts': `export const a = (v: { type: string }) => v.type === 'tank';`,
    'sim/index.ts': `import '../content/index.ts';`,
    'app/main.ts': `import '../audio/silent/index.ts';`,
    'audio/silent/index.ts': 'export const a = 1;',
    'gpu/webgl2/index.ts': `export const a = (c: HTMLCanvasElement) => c.getContext('webgl2');`,
  });
  assert.deepEqual(fired, []);
});

test('the real source passes', () => {
  assert.deepEqual(lintSource(SRC), []);
});
