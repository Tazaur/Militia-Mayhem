// Owns: the rules a tool can check (docs/RULES.md). A rule nothing checks gets forgotten after a context summary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// docs/ARCHITECTURE.md "Who may import whom". Everything may also import core and contracts, except core itself.
const CAN_IMPORT = {
  core: [],
  contracts: [],
  content: [],
  sim: ['content'],
  ai: ['sim', 'content'],
  net: ['sim', 'content'],
  input: [],
  scene: ['sim', 'content'],
  feedback: ['content'],
  audio: ['content'],
  gpu: [],
  'render/frame': ['render/layers', 'render/projection', 'gpu'],
  'render/projection': [],
  'render/layers': ['render/projection', 'gpu'],
  'render/lighting': ['render/projection', 'gpu'],
  'render/fog': ['render/projection', 'gpu'],
  'render/air': ['render/projection', 'gpu'],
  'render/post': ['render/projection', 'gpu'],
  ui: ['gpu', 'content'],
  platform: [],
  app: '*',
};

const MAX_COLUMNS = 120;
const MAX_LINES = 450; // RULES.md Q3 says "about 400".

const BROWSER_NAMES = new Set(
  `window document navigator location history screen localStorage sessionStorage indexedDB
   requestAnimationFrame cancelAnimationFrame performance fetch setTimeout setInterval Date console process require
   globalThis self AudioContext RTCPeerConnection WebSocket HTMLCanvasElement OffscreenCanvas Image`.split(/\s+/),
);
const BROWSER_HOMES = new Set(['platform', 'gpu']);
const BRANCH_FIELDS = new Set(['type', 'kind', 'id']);

function moduleOf(relative) {
  const parts = relative.split('/');
  return parts[0] === 'render' && parts.length > 2 ? `render/${parts[1]}` : parts[0];
}

function isDeclaredName(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  );
}

function checkImport(specifier, file, relative, report, sourceRoot) {
  if (!specifier.startsWith('.')) {
    report('A4-package', specifier, `import of a package: ${specifier}`);
    return;
  }
  const resolved = path.resolve(path.dirname(file), specifier);
  if (!fs.existsSync(resolved)) {
    report('A4-missing-file', specifier, `import of a missing file: ${specifier}`);
    return;
  }
  const target = path.relative(sourceRoot, resolved).replaceAll('\\', '/');
  const from = moduleOf(relative);
  const to = moduleOf(target);
  if (from === to) return;
  const allowed = CAN_IMPORT[from];
  if (!allowed) return; // Reported once per file as A4-unknown-module.
  const isOpen = to === 'contracts' || (to === 'core' && from !== 'core');
  if (allowed !== '*' && !isOpen && !allowed.includes(to)) {
    report('A4-import', specifier, `${from} may not import ${to}`);
    return;
  }
  // Outside app, only a module's own index is public. Implementations in its subfolders are app's to pick.
  if (allowed !== '*' && target !== `${to}/index.ts`) {
    report('A4-internals', specifier, `${from} may only import ${to}/index.ts, not ${target}`);
  } else if (allowed === '*' && !target.endsWith('/index.ts')) {
    report('A4-internals', specifier, `${from} may only import a module's index.ts, not ${target}`);
  }
}

function lintFile(file, relative, sourceRoot, violations) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const module = moduleOf(relative);
  const report = (rule, at, message) => {
    const position = typeof at === 'number' ? at : text.indexOf(at);
    const line = source.getLineAndCharacterOfPosition(Math.max(0, position)).line + 1;
    violations.push({ rule, file: relative, line, message });
  };

  if (!(module in CAN_IMPORT)) report('A4-unknown-module', 0, `${module} is not in the import table`);
  if (!text.startsWith('//') && !text.startsWith('/*'))
    report('Q3-owner-comment', 0, 'must start by saying what it owns');
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.length > MAX_COLUMNS)
      violations.push({ rule: 'Q1-line-length', file: relative, line: index + 1, message: `${line.length} columns` });
  });
  const lineCount = source.getLineAndCharacterOfPosition(text.length).line + 1;
  if (lineCount > MAX_LINES) report('Q3-file-size', 0, `${lineCount} lines: split it`);

  if (module === 'contracts') {
    for (const statement of source.statements) {
      const typeOnly =
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) ||
        (ts.isExportDeclaration(statement) && statement.isTypeOnly);
      if (!typeOnly) report('contracts-types-only', statement.getStart(), 'contracts holds types only');
    }
  }

  const inGpu = module === 'gpu';
  const inBrowserHome = BROWSER_HOMES.has(module);
  const inContent = module === 'content';
  // A local variable named `screen` is not the browser's: only names the file does not declare can be globals.
  const localNames = new Set();
  const collectLocals = (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      localNames.add(node.name.text);
    }
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) localNames.add(node.name.text);
    ts.forEachChild(node, collectLocals);
  };
  collectLocals(source);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      checkImport(node.moduleSpecifier.text, file, relative, report, sourceRoot);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      report('A4-import', node.getStart(), 'no dynamic imports');
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) report('Q5-any', node.getStart(), 'no any');

    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (!inGpu && (/^WebGL/.test(name) || name === 'getContext'))
        report('A5-gl', node.getStart(), `${name} outside gpu/`);
      if (!inBrowserHome && BROWSER_NAMES.has(name) && !localNames.has(name) && !isDeclaredName(node)) {
        report('A8-browser', node.getStart(), `${name} outside platform/ and gpu/`);
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression;
      if (!inGpu && ts.isIdentifier(owner) && owner.text === 'gl') report('A5-gl', node.getStart(), 'gl. outside gpu/');
      if (ts.isIdentifier(owner) && owner.text === 'Math' && node.name.text === 'random') {
        report('A1-random', node.getStart(), 'use core/rng');
      }
    }
    if (!inGpu && ts.isStringLiteralLike(node) && /^(experimental-)?webgl2?$/i.test(node.text)) {
      report('A5-gl', node.getStart(), 'webgl string outside gpu/');
    }

    if (!inContent) {
      const isBranchField = (expression) =>
        ts.isPropertyAccessExpression(expression) && BRANCH_FIELDS.has(expression.name.text);
      if (ts.isBinaryExpression(node)) {
        const operator = node.operatorToken.kind;
        const compares =
          operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
          operator === ts.SyntaxKind.EqualsEqualsToken ||
          operator === ts.SyntaxKind.ExclamationEqualsToken;
        const branches =
          (isBranchField(node.left) && ts.isStringLiteralLike(node.right)) ||
          (isBranchField(node.right) && ts.isStringLiteralLike(node.left));
        if (compares && branches) report('C2-type-branch', node.getStart(), 'use a data field, not a type name');
      }
      if (ts.isSwitchStatement(node) && isBranchField(node.expression)) {
        report('C2-type-branch', node.getStart(), 'use a data field, not a type name');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

/** Every violation under a src folder. */
export function lintSource(sourceRoot) {
  const violations = [];
  for (const file of sourceFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file).replaceAll('\\', '/');
    lintFile(file, relative, sourceRoot, violations);
  }
  return violations;
}

/** Tools and tests only have the line-length rule: they are not part of the game's walls. */
function lintLineLengths(directory) {
  const violations = [];
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry);
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (line.length > MAX_COLUMNS) {
          violations.push({ rule: 'Q1-line-length', file: entry, line: index + 1, message: `${line.length} columns` });
        }
      });
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const violations = [
    ...lintSource(path.join(root, 'src')),
    ...lintLineLengths(path.join(root, 'tools')),
    ...lintLineLengths(path.join(root, 'tests')),
  ];
  for (const { rule, file, line, message } of violations) console.error(`${file}:${line}  ${rule}  ${message}`);
  if (violations.length) {
    console.error(`${violations.length} violations`);
    process.exit(1);
  }
  console.log('lint: clean');
}
