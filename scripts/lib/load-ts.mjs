import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

/** Load real TS modules in memory for checks without creating build artifacts. */
export function createTsLoader(root = process.cwd()) {
  const modules = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} };
    modules.set(filename, loaded);
    const localRequire = createRequire(filename);
    const require = (specifier) => {
      if (specifier === 'server-only') return {};
      if (specifier.startsWith('@/')) return load(`src/${specifier.slice(2)}.ts`);
      if (specifier.startsWith('.')) {
        return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
      }
      return localRequire(specifier);
    };
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function('module', 'exports', 'require', output)(loaded, loaded.exports, require);
    return loaded.exports;
  }
  return load;
}
