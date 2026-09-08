/** Synthetic, in-memory UI fixtures. No environment files or external requests. */
import { randomUUID } from 'node:crypto';
import { createTsLoader } from './load-ts.mjs';

export const FIXTURE_MODEL_URL = 'https://current-model.fixture.test/v1';
export const FIXTURE_OLD_MODEL_URL = 'https://previous-model.fixture.test/v1';
export const FIXTURE_SCENARIOS = ['ready', 'running', 'paused-error', 'completed'];

export async function createSmartAiFixtureData(pool, ownerId, encryptionKey) {
  const baseLoad = createTsLoader();
  const security = baseLoad('src/lib/server/smart-api-security.ts');
  const { SMART_API_DEFAULT_SETTINGS } = baseLoad('src/lib/smart-api-types.ts');
  let LibraryInputError;
  let testFails = false;
  const overrides = {
    './smart-api-security': {
      ...security,
      normalizeApiSettings(value) {
        if (![FIXTURE_MODEL_URL, FIXTURE_OLD_MODEL_URL].includes(value?.baseUrl)) throw new LibraryInputError('离线验收仅允许固定的 fixture.test 服务地址。');
        const normalized = security.normalizeApiSettings({ ...value, baseUrl: 'https://example.com/v1' });
        return { ...normalized, baseUrl: value.baseUrl };
      },
    },
  };
  const load = createTsLoader(process.cwd(), overrides);
  ({ LibraryInputError } = load('src/lib/library-domain.ts'));
  const { SmartApiCallError } = load('src/lib/server/smart-api-client.ts');
  function suggestion(target, index = 0) {
    return { id: target.id, source: 'model', confidence: index % 4 === 3 ? 'review' : 'clear', kind: 'website', category: '学习与研究', tags: ['离线示例', '资料'], description: `离线示例用途：帮助归纳「${target.title}」相关资料。`, reason: '虚构模型结果，仅用于界面验收。' };
  }
  const { createApiConfigStore } = load('src/lib/server/smart-api-store.ts');
  const settings = createApiConfigStore(pool, () => ownerId, {
    encryptionKey: () => encryptionKey,
    complete: async (config, inputs, beforeSend) => {
      if (![FIXTURE_MODEL_URL, FIXTURE_OLD_MODEL_URL].includes(config.settings.baseUrl)) throw new LibraryInputError('离线验收禁止访问其他服务。');
      await beforeSend?.();
      if (testFails) throw new SmartApiCallError('离线示例：服务暂时拒绝此连接（HTTP 403，JSON）。请核对连接配置。', 'rejected', 502, 403, 'json');
      return { suggestions: inputs.map(suggestion), usage: { inputTokens: 80, outputTokens: 60 } };
    },
  });
  const fixtureSettings = { ...SMART_API_DEFAULT_SETTINGS, name: '离线验收 · 当前服务', baseUrl: FIXTURE_MODEL_URL, model: 'fictional-current-model', batchSize: 5, maxRequests: 20, maxOutputTokens: 2048 };
  const key = security.encryptApiKey('FICTIONAL-KEY-NOT-A-REAL-CREDENTIAL', { ownerId, configId: 'primary', version: '2', baseUrl: FIXTURE_MODEL_URL }, encryptionKey);
  await pool.query("INSERT INTO library_private.smart_api_settings(owner_id,version,settings,encrypted_key,enabled,tested_version,tested_at) VALUES($1,2,$2::jsonb,$3::jsonb,true,2,now())", [ownerId, JSON.stringify(fixtureSettings), JSON.stringify(key)]);
  const { createSmartImportStore } = load('src/lib/server/smart-import-store.ts');
  const imports = createSmartImportStore(pool, () => ownerId);
  const { createSmartAnalysisStore } = load('src/lib/server/smart-analysis-store.ts');
  let completions = 0;
  const analysis = createSmartAnalysisStore(pool, () => ownerId, {
    readConfig: id => settings.read(id),
    checkPublicTargets: async targets => ({ targets: targets.filter(target => target.domain === 'example.com'), excluded: targets.filter(target => target.domain !== 'example.com').map(target => ({ id: target.id, reason: '离线验收只允许 example.com 示例域名。' })) }),
    capture: (input, id) => imports.claimTargets(input, id),
    revalidate: (input, id) => imports.revalidateTargets(input, id),
    apply: (input, id) => imports.applySuggestions(input, id),
    assertConfig: async (client, id, version) => { await settings.assertCurrent(client, id, version); },
    send: async (id, version, targets, beforeSend) => {
      const config = await settings.resolve(id, version);
      if (config.settings.baseUrl !== FIXTURE_MODEL_URL) throw new LibraryInputError('离线验收仅模拟当前服务。');
      await beforeSend();
      completions++;
      return { suggestions: targets.map(suggestion), usage: { inputTokens: targets.length * 80, outputTokens: targets.length * 60 } };
    },
  });

  const batches = {};
  async function insertJob(batchId, targets, scenario, historical = false) {
    const id = randomUUID();
    const succeeded = historical ? 2 : scenario === 'completed' ? targets.length : 5;
    const currentTargets = targets.map((target, index) => ({ ...target, status: index < succeeded ? 'succeeded' : scenario === 'paused-error' && index === succeeded ? 'failed' : 'pending' }));
    const state = {
      confirmation: randomUUID(),
      config: { id: 'primary', version: historical ? '1' : '2', name: historical ? '离线验收 · 已停用旧服务' : fixtureSettings.name, baseUrl: historical ? FIXTURE_OLD_MODEL_URL : FIXTURE_MODEL_URL, model: historical ? 'fictional-previous-model' : fixtureSettings.model },
      settings: { ...fixtureSettings, ...(historical ? { baseUrl: FIXTURE_OLD_MODEL_URL, model: 'fictional-previous-model' } : {}) },
      targets: currentTargets,
      status: historical || scenario === 'paused-error' ? 'paused' : scenario === 'completed' ? 'completed' : 'running',
      requests: historical ? 1 : scenario === 'completed' ? 4 : 2,
      reservedCost: null, possibleCharge: scenario === 'paused-error',
      message: historical ? '旧服务任务已暂停，已返回的建议保留；请使用当前服务重新确认剩余范围。' : scenario === 'paused-error' ? '离线示例：模型服务拒绝了本次请求（HTTP 403，JSON）。已完成部分保留，本次不会自动重试。' : null,
      usage: { inputTokens: succeeded * 80, outputTokens: succeeded * 60 },
    };
    if (scenario === 'paused-error' && !historical) state.lastFailure = { outcome: 'rejected', message: state.message, status: 502, upstreamStatus: 403, responseType: 'json' };
    await pool.query("INSERT INTO library_private.analysis_jobs(id,owner_id,batch_id,request_id,state,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,now()-$6::interval)", [id, ownerId, batchId, `fixture-${id}`, JSON.stringify(state), historical ? '1 day' : '0 seconds']);
    const results = currentTargets.filter(target => target.status === 'succeeded').map((target, index) => ({ id: target.id, groupRevision: target.groupRevision, suggestion: suggestion(target, index) }));
    if (results.length) await imports.applySuggestions({ batchId, analysisJobId: id, results }, ownerId);
    return id;
  }
  for (const scenario of FIXTURE_SCENARIOS) {
    const content = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>待整理</H3><DL>' + Array.from({ length: 24 }, (_, index) => `<DT><A HREF="https://example.com/fixture/${scenario}/${index + 1}">虚构资料 ${index + 1}</A>`).join('\n') + '</DL></DL>';
    const context = await imports.handle({ action: 'create', requestId: `offline-ai-${scenario}`, name: `离线 AI 验收 · ${scenario}`, format: 'html', content }, ownerId);
    let page = await imports.handle({ action: 'get', batchId: context.batch.id, page: 1, filters: { view: 'all' } }, ownerId);
    await imports.handle({ action: 'decide', batchId: context.batch.id, batchRevision: page.batchRevision, groupIds: [page.groups[0].id], fields: { category: '开发与技术', description: '这条简介由我手工填写，AI 不应替换。' } }, ownerId);
    page = await imports.handle({ action: 'get', batchId: context.batch.id, page: 1, filters: { view: 'all' } }, ownerId);
    const capture = await imports.claimTargets({ batchId: context.batch.id, batchRevision: page.batchRevision, groupIds: page.groups.map(group => group.id) }, ownerId);
    const oldJobId = await insertJob(context.batch.id, capture.targets.slice(12), 'ready', true);
    let currentJobId;
    if (scenario !== 'ready') {
      const latest = await imports.handle({ action: 'get', batchId: context.batch.id, page: 1, filters: { view: 'all' } }, ownerId);
      const fresh = await imports.claimTargets({ batchId: context.batch.id, batchRevision: latest.batchRevision, groupIds: latest.groups.map(group => group.id) }, ownerId);
      currentJobId = await insertJob(context.batch.id, fresh.targets.slice(0, 12), scenario);
    }
    batches[scenario] = { batchId: context.batch.id, oldJobId, currentJobId };
  }

  // Exercise real import/library transactions. Only the deliberately missing record
  // below is removed by targeted SQL; no import outcome is fabricated.
  const library = load('src/lib/cloud-library.ts').createCloudLibraryStore(pool, () => ownerId);
  async function allGroups(batchId) {
    const first = await imports.handle({ action: 'get', batchId, page: 1, filters: { view: 'all' } }, ownerId);
    const groups = [...first.groups];
    for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) groups.push(...(await imports.handle({ action: 'get', batchId, page, filters: { view: 'all' } }, ownerId)).groups);
    return { ...first, groups };
  }
  async function createBookmarks(name, entries) {
    const content = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>开发与技术</H3><DL>' + entries.map(entry => `<DT><A HREF="${entry.url}">${entry.name}</A>`).join('\n') + '</DL></DL>';
    return imports.handle({ action: 'create', requestId: randomUUID(), name, format: 'html', content }, ownerId);
  }
  async function commitGroups(batchId, groupIds) {
    const context = await allGroups(batchId);
    const decided = await imports.handle({ action: 'decide', batchId, batchRevision: context.batchRevision, groupIds, decision: 'keep', fields: { category: '开发与技术' } }, ownerId);
    const preview = await imports.handle({ action: 'commit-preview', batchId, batchRevision: decided.batchRevision, groupIds, suggestionMode: 'accept-preserving-manual' }, ownerId);
    if (preview.items.some(item => item.disposition !== 'create')) throw new Error('Offline collection fixture expected only new resources.');
    return imports.handle({ action: 'commit', batchId, batchRevision: preview.batchRevision, libraryRevision: preview.libraryRevision, requestId: randomUUID(), confirmation: preview.confirmation, groupIds, suggestionMode: 'accept-preserving-manual' }, ownerId);
  }
  async function libraryWrite(input) {
    const current = await library.handle({ action: 'list' }, ownerId);
    return library.handle({ ...input, libraryRevision: current.libraryRevision }, ownerId);
  }
  const linkedURL = 'https://example.com/fixture/collection/already-saved';
  const existingBatch = await createBookmarks('离线收藏验收 · 既有收藏来源', [{ name: '原始导入名称 · 关联示例', url: linkedURL }]);
  const existingPage = await allGroups(existingBatch.batch.id);
  const existingCommit = await commitGroups(existingBatch.batch.id, existingPage.groups.map(group => group.id));
  const linkedResourceId = existingCommit.receipt.items[0].resourceId;
  await libraryWrite({ action: 'save', resource: { id: linkedResourceId, name: '我已修改的收藏名称 · 关联示例', description: '这是现有收藏中的手工说明；关联导入不应覆盖它。', category: '学习与研究', tags: ['手工修改', '离线验收'], pinned: true } });

  const entries = Array.from({ length: 60 }, (_, index) => ({ name: `已收藏示例 ${String(index + 1).padStart(2, '0')}`, url: `https://example.com/fixture/collection/${index + 1}` }));
  entries[0].name = '已公开示例 · 网站快照保留';
  entries[1].name = '已移出示例 · 可以恢复';
  entries[2].name = '记录缺失示例 · 不可恢复';
  entries.push({ name: '原始导入名称 · 应显示现有收藏', url: linkedURL });
  const collectionContext = await createBookmarks('离线收藏验收 · 分页与移出恢复', entries);
  const batchId = collectionContext.batch.id;
  const initial = await allGroups(batchId);
  const linkedGroupId = initial.groups.find(group => group.representative.url === linkedURL).id;
  const committed = await commitGroups(batchId, initial.groups.filter(group => group.id !== linkedGroupId).map(group => group.id));
  const linkPreview = await imports.handle({ action: 'resolve-preview', batchId, batchRevision: committed.batchRevision, groupId: linkedGroupId, resourceId: linkedResourceId, mode: 'link' }, ownerId);
  await imports.handle({ action: 'resolve', batchId, batchRevision: linkPreview.batchRevision, libraryRevision: linkPreview.libraryRevision, requestId: randomUUID(), confirmation: linkPreview.confirmation, groupId: linkedGroupId, resourceId: linkedResourceId, mode: 'link' }, ownerId);
  const refs = {};
  for (const [name, index] of [['published', 0], ['archived', 1], ['missing', 2], ['ordinary', 3]]) {
    const group = initial.groups.find(item => item.representative.url === entries[index].url);
    refs[name] = { groupId: group.id, resourceId: committed.receipt.items.find(item => item.groupId === group.id).resourceId };
  }
  await libraryWrite({ action: 'bulk', ids: [refs.archived.resourceId], changes: { status: 'archived' } });
  await libraryWrite({ action: 'save', resource: { id: refs.published.resourceId, status: 'organized', visibility: 'public' } });
  const publication = await library.handle({ action: 'publish-preview' }, ownerId);
  await library.handle({ action: 'publish', libraryRevision: publication.libraryRevision, revision: publication.revision }, ownerId);
  // Simulate a historical association whose current private record no longer exists.
  // The actual import receipt/outcome remains intact for the missing-state UI.
  await pool.query("UPDATE library_private.state SET state=jsonb_set(state,'{resources}',(SELECT COALESCE(jsonb_agg(resource),'[]'::jsonb) FROM jsonb_array_elements(state->'resources') resource WHERE resource->>'id'<>$2)),revision=revision+1,updated_at=now() WHERE owner_id=$1", [ownerId, refs.missing.resourceId]);
  batches.collected = { batchId, ...refs, linked: { groupId: linkedGroupId, resourceId: linkedResourceId } };
  return {
    imports, settings, analysis, library, batches, load, overrides,
    get simulatedCompletions() { return completions; },
    async setTestFailure(value) { testFails = value; await pool.query('UPDATE library_private.smart_api_settings SET last_test_started_at=NULL,test_active_until=NULL,test_claim_id=NULL WHERE owner_id=$1', [ownerId]); },
  };
}
