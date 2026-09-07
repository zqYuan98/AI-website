/** Public URL/search regressions; uses public fixtures only. */
import assert from 'node:assert/strict';
import { createTsLoader } from './lib/load-ts.mjs';

const load = createTsLoader();
const { getLegacyPublicResources, toPublicResource } = load('src/lib/public-resources.ts');
const { parseResourceExplorerState: parse, serializeResourceExplorerState: serialize,
  indexPublicResources, filterPublicResources, resourceReadingType } = load('src/lib/resource-explorer-state.ts');
const resources = getLegacyPublicResources();
const index = indexPublicResources(resources);
const results = query => filterPublicResources(index, parse(query));

assert.equal(parse('').view, 'featured');
assert.equal(parse('?q=NodeSeek').view, 'browse');
assert.equal(parse('?view=recommendations').view, 'reading');
assert.equal(parse('?category=开发与部署').category, '开发与技术');
assert.equal(parse('?category=unknown&subcategory=unknown').subcategory, '');
assert.equal(parse('?page=-1').page, 1);
assert.equal(parse('?page=999999').page, 1000);
assert.equal(results('?q=NODESEEK').length, 1);
assert.equal(results('?q=nodeseek.com')[0].kind, 'website');
assert.equal(results('?q=Codex&kind=website').length, 0);
assert.equal(results('?q=long-impossible-resource-query').length, 0);
assert(results('?view=reading').every(resource => resource.kind === 'article'));
assert(results('?view=reading&type=指南').every(resource => resourceReadingType(resource) === '指南'));
assert(results('?featured=1').every(resource => resource.featured));
const state = parse('?view=browse&q=部署&category=开发与技术&layout=list&page=2');
const url = serialize(state, 'https://example.com/tools?utm_source=friend#curation');
assert.match(url, /utm_source=friend/);
assert(url.endsWith('#curation'));
assert.deepEqual(parse(new URL(url, 'https://example.com').search), state);

const clean = toPublicResource({ ...resources[0], notes: 'PRIVATE_SENTINEL', sourceFolder: 'PRIVATE_FOLDER', pinned: true });
assert(!JSON.stringify(clean).includes('PRIVATE'));
assert(!('notes' in clean) && !('sourceFolder' in clean) && !('pinned' in clean));
assert.throws(() => toPublicResource({ ...resources[0], icon: 'https://remote.example/icon.png' }));
assert.throws(() => toPublicResource({ ...resources[0], relatedHref: '//evil.example' }));
assert.throws(() => toPublicResource({ ...resources[0], featured: true, recommendation: '' }));
console.log('PASS: public search, legacy links, filter composition, share state and publication field allowlist.');
