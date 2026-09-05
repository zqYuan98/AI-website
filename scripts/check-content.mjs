/** Validate published content and exercise actual parsers with in-memory invalid fixtures. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { createTsLoader } from './lib/load-ts.mjs';

const load = createTsLoader();
const { getAllPosts, getAllWork, getPostBySlug, getWorkBySlug, parseBlogContent, parseWorkContent, formatDate } = load('src/lib/content.ts');
const { getAllLabs, parseLabContent } = load('src/lib/labs.ts');
const { getAllRecommendations } = load('src/lib/curation.ts');
const { estimateReadingTime } = load('src/lib/reading-time.ts');
const { requireContentDate, requireContentOrder, requireContentCover, assertUniqueSlugs, parseFrontmatter } = load('src/lib/content-validation.ts');

const posts = getAllPosts();
const works = getAllWork();
const labs = getAllLabs();
const recommendations = getAllRecommendations();
for (const post of posts) {
  assert.equal(post.readingTime, estimateReadingTime(post.body));
  assert.deepEqual(getPostBySlug(post.slug), post);
}
for (const work of works) assert.deepEqual(getWorkBySlug(work.slug), work);
for (const invalid of ['../about', '/etc/passwd', '%2e%2e', 'not-a-real-content-item']) {
  assert.equal(getPostBySlug(invalid), undefined);
  assert.equal(getWorkBySlug(invalid), undefined);
}

assert.equal(requireContentDate('fixture', 'date', '2024-02-29'), '2024-02-29');
for (const invalid of ['2026-02-31', '2025-02-29', '2026-13-01', 'not-a-date', '2026-1-01', '', new Date('2026-09-05')]) {
  assert.throws(() => requireContentDate('fixture', 'date', invalid));
}
assert.equal(formatDate('2026-09-05'), '2026 年 9 月 5 日');
assert.equal(formatDate(''), '');
for (const invalid of [-1, -0.5, 1.2, Infinity, NaN, '1']) {
  assert.throws(() => requireContentOrder('fixture', invalid));
}
assert.equal(requireContentOrder('fixture', 0), 0);
for (const invalid of ['/../package.json', '//example.com/img.png', '/images/../logo-mark.svg', '/missing-cover.png', '/images/home/hero-orbit.png?raw=1', '/images%2fhome.png', 'https://example.com/image.png']) {
  assert.throws(() => requireContentCover('fixture', invalid));
}
assert.throws(() => assertUniqueSlugs('fixture', [{ slug: 'duplicate' }, { slug: 'duplicate' }]));
assert.throws(() => parseFrontmatter('fixture', '---javascript\n({title: "not executable"})\n---\nbody'));

const blogFixture = '---\ntitle: 标题\nsummary: 摘要\ndate: "2026-09-05"\nplaceholder: false\nreadingTime: 99 分钟阅读\n---\n这是一篇短札。';
assert.equal(parseBlogContent('fixture.md', blogFixture).readingTime, '不到 1 分钟阅读');
assert.equal(parseBlogContent('fixture.md', '\uFEFF' + blogFixture).title, '标题');
for (const fixture of [
  blogFixture.replace('title: 标题\n', ''),
  blogFixture.replace('summary: 摘要', 'summary: ""'),
  blogFixture.replace('placeholder: false', 'placeholder: "false"'),
  blogFixture.replace('"2026-09-05"', '"2026-02-31"'),
  blogFixture.replace('"2026-09-05"', '2026-02-31'),
  blogFixture.replace('这是一篇短札。', ''),
]) assert.throws(() => parseBlogContent('fixture.md', fixture));
assert.throws(() => parseBlogContent('invalid_slug.md', blogFixture));

const workFixture = '---\ntitle: 作品\nsummary: 摘要\nrole: 产品\nperiod: 进行中\nplaceholder: false\nfeatured: true\norder: 0\n---\n## 背景 / 问题\n背景\n## 我做了什么\n方案\n## 结果与反思\n反思';
assert.equal(parseWorkContent('fixture.md', workFixture).background, '背景');
for (const fixture of [
  workFixture.replace('role: 产品\n', ''),
  workFixture.replace('order: 0', 'order: -0.5'),
  workFixture.replace('## 我做了什么', '## 不匹配章节'),
]) assert.throws(() => parseWorkContent('fixture.md', fixture));

const labFixture = '---\ntitle: 实验\nsummary: 摘要\nstatus: 可用\nproblem: 问题\nusage: 用法\nlimitation: 边界\nfeatured: false\norder: 0\nupdatedAt: "2026-09-05"\ncover: /images/lab/acceptance-loop.png\ncoverAlt: 示意图\n---\n实验说明';
assert.equal(parseLabContent('fixture.md', labFixture).status, '可用');
for (const fixture of [
  labFixture.replace('"2026-09-05"', '"2026-02-31"'),
  labFixture.replace('"2026-09-05"', '2026-02-31'),
  labFixture.replace('order: 0', 'order: -0.5'),
  labFixture.replace('status: 可用', 'status: 已归档'),
  labFixture.replace('/images/lab/acceptance-loop.png', '/not-found.png'),
  labFixture.replace('实验说明', ''),
]) assert.throws(() => parseLabContent('fixture.md', fixture));

assert.equal(estimateReadingTime(''), '');
assert.equal(estimateReadingTime('中文短文'), '不到 1 分钟阅读');
assert.equal(estimateReadingTime('中'.repeat(600)), '约 2 分钟阅读');
assert.equal(estimateReadingTime('word '.repeat(200)), '约 1 分钟阅读');
assert.equal(estimateReadingTime('[短文](https://example.com/' + 'path'.repeat(300) + ')'), '不到 1 分钟阅读');
assert.equal(estimateReadingTime('![not reading copy](https://example.com/image.png)'), '');
assert.equal(estimateReadingTime('https://example.com，' + '中'.repeat(600)), '约 2 分钟阅读');

const routes = new Set(['/', '/about', '/work', '/blog', '/tools', '/lab',
  ...posts.map((post) => `/blog/${post.slug}`),
  ...works.map((work) => `/work/${work.slug}`),
  ...labs.map((lab) => `/lab/${lab.slug}`),
]);
function checkInternalLink(source, href) {
  const pathname = href.split(/[?#]/, 1)[0];
  if (pathname && !routes.has(pathname)) throw new Error(`[${source}] 站内链接不存在：${href}`);
}
for (const entry of recommendations) if (entry.relatedHref) checkInternalLink(entry.slug, entry.relatedHref);
function checkMarkdownLinks(source, body) {
  // Use the site's actual renderer so reference and angle-bracket destinations
  // are checked too. Inspect component props before HTML escaping, not source regexes.
  renderToStaticMarkup(createElement(ReactMarkdown, {
    components: {
      a({ href, children }) {
        if (href?.startsWith('/') && !href.startsWith('//')) checkInternalLink(source, href);
        return children;
      },
      img({ src }) {
        if (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//')) requireContentCover(source, src);
        return null;
      },
    },
  }, body));
}
for (const entry of [...posts, ...works, ...labs]) checkMarkdownLinks(entry.slug, entry.body);
for (const body of [
  '[入口](/missing)',
  '[入口](</missing>)',
  '[入口][route]\n\n[route]: /missing',
  '![封面][image]\n\n[image]: /missing.png',
  '![封面](</missing.png>)',
  '[![封面](/missing.png)](/tools)',
]) assert.throws(() => checkMarkdownLinks('fixture', body));
checkMarkdownLinks('fixture', '[工具][route]\n\n[route]: /tools#curation');
checkMarkdownLinks('fixture', '![示意图][image]\n\n[image]: /images/lab/acceptance-loop.png');
// Until a second Lab needs a registry, fail early if content advertises no real implementation.
for (const lab of labs) {
  assert(fs.existsSync(path.join('src/app/lab', lab.slug, 'page.tsx')), `Lab 缺少可运行入口：${lab.slug}`);
}
console.log(`PASS: ${posts.length} blog posts, ${works.length} works, ${labs.length} labs, ${recommendations.length} resources; real dates, required content, cover paths, routes, reading time and invalid fixtures.`);
