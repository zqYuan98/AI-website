/** Shared local, GitHub and hosting build gate. A failing step stops the build. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const options = process.argv.slice(2);
if (options.length > 1 || (options.length === 1 && !['--build', '--typecheck'].includes(options[0]))) {
  throw new Error('Usage: node scripts/check-quality.mjs [--build | --typecheck]');
}

function run(label, script, args = []) {
  console.log(`\n[quality] ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function cli(packageName, command) {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const { bin } = require(manifestPath);
  return path.resolve(path.dirname(manifestPath), typeof bin === 'string' ? bin : bin[command]);
}

if (options[0] !== '--typecheck') {
  run('content', 'scripts/check-content.mjs');
  run('tools and local maintenance guards', 'scripts/check-tools.mjs');
  run('tool URL state and search', 'scripts/check-tools-state.mjs');
  run('lint', cli('eslint', 'eslint'), ['.', '--max-warnings=0']);
}

// Next 16 generates route types independently; no dev server or prior build is needed.
run('generate route types', cli('next', 'next'), ['typegen']);
run('typecheck', cli('typescript', 'tsc'), ['--noEmit']);

if (options[0] === '--build') run('production build', cli('next', 'next'), ['build']);
