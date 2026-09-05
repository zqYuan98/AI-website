/** Read-only regression checks for the content loader and local editor guards. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const modules = new Map();
// Transpile the actual TS modules in memory; do not alter app imports for a test runner.
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const localRequire = createRequire(filename);
  const require = (specifier) => {
    if (specifier === 'server-only') return {};
    if (specifier.startsWith('@/')) return load(`src/${specifier.slice(2)}.ts`);
    if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
    return localRequire(specifier);
  };
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('module', 'exports', 'require', output)(loaded, loaded.exports, require);
  return loaded.exports;
}

const { canonicalToolUrl, validatedToolUrl } = load('src/lib/tool-url.ts');
assert.equal(canonicalToolUrl('https://www.example.com/?utm_source=nav'), canonicalToolUrl('http://example.com'));
assert.equal(canonicalToolUrl('https://chat.openai.com/'), canonicalToolUrl('https://chatgpt.com/'));
assert.equal(canonicalToolUrl('https://vercel.com/dashboard'), canonicalToolUrl('https://vercel.com/'));
assert.equal(canonicalToolUrl('https://example.com./'), canonicalToolUrl('https://example.com/'));
assert.notEqual(canonicalToolUrl('https://example.com/a'), canonicalToolUrl('https://example.com/b'));
assert.notEqual(canonicalToolUrl('https://example.com/?id=1'), canonicalToolUrl('https://example.com/?id=2'));
for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://localhost', 'http://127.0.0.1', 'http://[::1]', 'https://user:pass@example.com', 'https://app.internal', 'http://localhost./', 'http://service.local./', 'http://service.internal../']) {
  assert.throws(() => validatedToolUrl(url));
}
assert.equal(validatedToolUrl(' https://example.com/path '), 'https://example.com/path');

const { validateLocalToolInput, isLocalManagementRequest } = load('src/lib/local-tool-validation.ts');
const input = { name: ' Sample ', url: 'https://example.com', category: 'AI 工作流', subcategory: '对话与搜索' };
assert.equal(validateLocalToolInput(input).name, 'Sample');
assert.throws(() => validateLocalToolInput({ ...input, featured: true }));
assert.throws(() => validateLocalToolInput({ ...input, subcategory: '网站部署' }));
assert.throws(() => validateLocalToolInput({ ...input, name: ' ' }));
assert.throws(() => validateLocalToolInput({ ...input, scenario: 'x'.repeat(201) }));
const request = (headers) => new Request('http://127.0.0.1:3000/api/local-tools', { headers });
const local = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
assert.equal(isLocalManagementRequest(request(local), 'development'), true);
assert.equal(isLocalManagementRequest(request(local), 'production'), false);
assert.equal(isLocalManagementRequest(request({ host: local.host }), 'development'), false);
assert.equal(isLocalManagementRequest(request({ ...local, origin: 'https://evil.example' }), 'development'), false);
assert.equal(isLocalManagementRequest(request({ ...local, 'sec-fetch-site': 'cross-site' }), 'development'), false);
assert.equal(isLocalManagementRequest(request({ ...local, origin: 'http://127.0.0.1:3001' }), 'development'), false);

const { getAllTools, getAllRecommendations, getFeaturedTools, toPublicTool } = load('src/lib/curation.ts');
const tools = getAllTools(); // Validates taxonomy, subcategories, files, fields, URL/slug/order uniqueness.
const publicTools = tools.map(toPublicTool);
assert(publicTools.every(tool => !('collectionSource' in tool) && !('sourceCategories' in tool)));
assert.equal(publicTools.length, tools.length);
assert.deepEqual(publicTools.map(tool => tool.url), tools.map(tool => tool.url));
const imported = tools.filter(tool => tool.collectionSource === '老王导航');
assert.equal(imported.length, JSON.parse(fs.readFileSync('content/tool-collection.json', 'utf8')).tools.length);
assert(imported.every(tool => !tool.featured && !tool.usedByVitamin));
assert.equal(getFeaturedTools().length, 4);
assert.equal(getAllRecommendations().length, 6);
assert(tools.find(tool => tool.slug === 'notebooklm' && tool.subcategory === '检索与研究'));
assert(tools.filter(tool => !tool.collectionSource).every(tool => tool.scenario && tool.audience && tool.avoidWhen));
for (const tool of tools.filter(tool => tool.icon)) {
  const bytes = fs.readFileSync(path.join(root, 'public', tool.icon));
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const ico = bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  assert(png || ico || webp, `Unexpected icon bytes: ${tool.slug}`);
}
console.log(`PASS: URL normalization, input validation, local-only guards, ${tools.length} tools, ${tools.filter(tool => tool.icon).length} local icons, 4 featured, 6 resources.`);
