/** Read-only checks for shareable filters, matching semantics and responsive result limits. */
import assert from 'node:assert/strict';
import { createTsLoader } from './lib/load-ts.mjs';

const load = createTsLoader();
const {
  parseToolExplorerState, serializeToolExplorerState, normalizeToolQuery,
  indexTools, indexRecommendations, filterIndexedTools, filterIndexedRecommendations,
  getVisibleToolCounts,
} = load('src/lib/tool-explorer-state.ts');
const { TOOL_CATEGORIES, TOOL_SUBCATEGORIES } = load('src/lib/tool-taxonomy.ts');
const { getAllTools, getAllRecommendations, toPublicTool } = load('src/lib/curation.ts');
const tools = getAllTools().map(toPublicTool);
const recommendations = getAllRecommendations();
const types = [...new Set(recommendations.map(item => item.type))];
const parse = search => parseToolExplorerState(search, types);
const defaults = {
  view: 'tools', query: '', category: null, subcategory: '', featuredOnly: false,
  recommendationType: '全部',
};
assert.deepEqual(parse(''), defaults);
assert.deepEqual(parse('?view=unknown&category=unknown&subcategory=网站部署&featured=true&type=unknown'), defaults);
assert.deepEqual(parse('?subcategory=网站部署'), defaults);
assert.equal(parse('?category=AI+工作流&subcategory=网站部署').subcategory, '');
assert.equal(parse('?q=&featured=0').query, '');
assert.equal(parse('?q=first&q=second').query, 'first');
assert.equal(parse('?q=%E4%BD%A0%E5%A5%BD+AI').query, '你好 AI');
assert.equal(parse('?q=%').query, '%');

for (const category of TOOL_CATEGORIES) {
  for (const subcategory of ['', ...TOOL_SUBCATEGORIES[category]]) {
    const state = { ...defaults, category, subcategory };
    const href = serializeToolExplorerState(state, 'https://www.notvitamin.com/tools');
    assert.deepEqual(parse(new URL(href, 'https://www.notvitamin.com').search), state);
  }
}

const complete = {
  view: 'recommendations', query: '  AI 与 C++ / A&B  ', category: 'AI 工作流',
  subcategory: '对话与搜索', featuredOnly: true, recommendationType: types[0],
};
const original = 'https://www.notvitamin.com/tools?utm_source=test&keep=1&keep=2&view=invalid&q=old&q=duplicate#curation';
const completeHref = serializeToolExplorerState(complete, original);
const completeUrl = new URL(completeHref, original);
assert.deepEqual(parse(completeUrl.search), complete, 'All active and inactive filter values survive refresh');
assert.equal(completeUrl.hash, '#curation');
assert.equal(completeUrl.searchParams.get('utm_source'), 'test');
assert.deepEqual(completeUrl.searchParams.getAll('keep'), ['1', '2']);
assert.deepEqual(completeUrl.searchParams.getAll('q'), [complete.query]);
assert.equal(serializeToolExplorerState(complete, completeUrl.href), completeHref, 'Serialization is stable');
assert.equal(serializeToolExplorerState(defaults, completeUrl.href), '/tools?utm_source=test&keep=1&keep=2#curation');
assert.equal(serializeToolExplorerState(defaults, 'https://www.notvitamin.com/tools?q=old'), '/tools');

const index = indexTools(tools);
const resourceIndex = indexRecommendations(recommendations);
assert.equal(index.length, 268);
assert.equal(filterIndexedTools(index, defaults).length, 268);
assert.equal(filterIndexedTools(index, { ...defaults, featuredOnly: true }).length, 4);
assert.equal(filterIndexedRecommendations(resourceIndex, defaults).length, 6);
assert.equal(filterIndexedTools(index, { ...defaults, query: '不存在的工具-zzzz' }).length, 0);
assert.equal(filterIndexedTools(index, { ...defaults, query: '  CHATGPT  ' })[0].tool.slug, 'chatgpt');
assert.deepEqual(getVisibleToolCounts(268, 0), { desktop: 36, mobile: 18 });
assert.deepEqual(getVisibleToolCounts(268, 36), { desktop: 36, mobile: 36 });
assert.deepEqual(getVisibleToolCounts(268, 54), { desktop: 54, mobile: 54 });
assert.deepEqual(getVisibleToolCounts(268, 72), { desktop: 72, mobile: 72 });
assert.deepEqual(getVisibleToolCounts(4, 72), { desktop: 4, mobile: 4 });
assert.deepEqual(getVisibleToolCounts(0, 0), { desktop: 0, mobile: 0 });

// Compare against the previous production matcher using real content, not a second index.
function hostname(url) { return new URL(url).hostname.replace(/^www\./, ''); }
function oldMatches(fields, query) {
  const normalized = normalizeToolQuery(query);
  return !normalized || fields.some(value =>
    (Array.isArray(value) ? value.join(' ') : value).toLocaleLowerCase('zh-CN').includes(normalized));
}
function oldToolMatches(tool, query) {
  return oldMatches([
    tool.name, hostname(tool.url), tool.category, tool.subcategory, tool.scenario,
    tool.audience, tool.usage, tool.avoidWhen, tool.alternatives,
  ], query);
}
const queries = new Set(['', ' AI ', '研究', '部署', 'OpenAI', 'a b', '不存在的工具-zzzz']);
for (const tool of tools) {
  queries.add(tool.name);
  queries.add(hostname(tool.url));
  for (const value of [tool.scenario, tool.audience, tool.usage, tool.avoidWhen, tool.alternatives.join(' ')]) {
    if (value) queries.add(value.slice(0, 10));
  }
}
for (const query of queries) {
  assert.deepEqual(
    filterIndexedTools(index, { ...defaults, query }).map(entry => entry.tool.slug),
    tools.filter(tool => oldToolMatches(tool, query)).map(tool => tool.slug),
    `Matching changed for ${JSON.stringify(query)}`,
  );
}
for (const category of TOOL_CATEGORIES) {
  for (const subcategory of ['', ...TOOL_SUBCATEGORIES[category]]) {
    for (const featuredOnly of [false, true]) {
      const state = { ...defaults, category, subcategory, featuredOnly, query: 'a' };
      assert.deepEqual(filterIndexedTools(index, state).map(entry => entry.tool.slug), tools.filter(tool =>
        tool.category === category && (!subcategory || tool.subcategory === subcategory) &&
        (!featuredOnly || tool.featured) && oldToolMatches(tool, state.query),
      ).map(tool => tool.slug));
    }
  }
}
for (const item of recommendations) {
  for (const query of [item.title, item.type, hostname(item.url), item.verdict.slice(0, 10), item.boundary.slice(0, 10), item.learned.slice(0, 10)]) {
    for (const recommendationType of ['全部', ...types]) {
      assert.deepEqual(
        filterIndexedRecommendations(resourceIndex, { ...defaults, query, recommendationType }).map(entry => entry.item.slug),
        recommendations.filter(resource =>
          (recommendationType === '全部' || resource.type === recommendationType) && oldMatches([
            resource.title, resource.type, hostname(resource.url), resource.verdict, resource.boundary, resource.learned,
          ], query),
        ).map(resource => resource.slug),
      );
    }
  }
}

const phraseTool = {
  ...tools[0], name: 'Alpha', scenario: 'Beta', audience: '', usage: '', avoidWhen: '',
  alternatives: ['Gamma', 'Delta'], url: 'https://www.example.com',
};
const phraseIndex = indexTools([phraseTool]);
assert.equal(phraseIndex[0].hostname, 'example.com');
assert.equal(filterIndexedTools(phraseIndex, { ...defaults, query: 'alpha beta' }).length, 0,
  'A phrase spanning independent fields must not become a new match');
assert.equal(filterIndexedTools(phraseIndex, { ...defaults, query: 'gamma delta' }).length, 1,
  'Alternatives retain their original space-joined phrase behavior');

console.log(`PASS: URL defaults/round-trips/clearing, ${queries.size} real search parity queries, taxonomy + resource filters, phrase boundaries, 18/36 limits.`);
