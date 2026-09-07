/** Usage: node scripts/cloud-auth.mjs migrate | create-owner | reset-password */
import fs from 'node:fs';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { createTsLoader } from './lib/load-ts.mjs';
import { createOwnerAccount, resetOwnerPassword } from './cloud-auth-operations.mjs';
import { selectAdminDatabaseUrl } from './lib/database-admin-url.mjs';
import { ownerCliErrorMessage } from './lib/owner-cli-errors.mjs';

const command = process.argv[2];
if (process.argv.length !== 3 || !['migrate', 'create-owner', 'reset-password'].includes(command)) {
  console.error('用法：node scripts/cloud-auth.mjs migrate | create-owner | reset-password。密码不得放入命令参数。');
  process.exit(1);
}

function question(label, secret = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('账号操作必须在交互终端中进行，密码输入不会显示。');
  return new Promise((resolve, reject) => {
    const output = secret ? new Writable({ write(_chunk, _encoding, callback) { callback(); } }) : process.stdout;
    const terminal = readline.createInterface({ input: process.stdin, output, terminal: true });
    let settled = false;
    process.stdout.write(label);
    terminal.on('SIGINT', () => { if (!settled) { settled = true; terminal.close(); reject(new Error('操作已取消。')); } });
    terminal.question('', value => { settled = true; terminal.close(); if (secret) process.stdout.write('\n'); resolve(value); });
    terminal.on('close', () => { if (!settled) reject(new Error('输入已结束，未完成操作。')); });
  });
}

let pool;
try {
  if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
  const load = createTsLoader();
  const { getCloudAuthConfig } = load('src/lib/server/config.ts');
  const { createOwnerAuth, AUTH_TABLES } = load('src/lib/server/auth.ts');
  const config = getCloudAuthConfig();
  pool = new Pool({ connectionString: selectAdminDatabaseUrl(), max: 1, connectionTimeoutMillis: 10000 });
  const auth = createOwnerAuth(pool, config);
  if (command === 'migrate') {
    const plan = await getMigrations(auth.options);
    if (plan.schemaProblems.length || plan.unsafeChanges.length) throw new Error('认证表结构需要人工检查，迁移未执行。');
    await plan.runMigrations();
    for (const table of AUTH_TABLES) await pool.query(`REVOKE ALL ON TABLE "${table}" FROM PUBLIC`);
    console.log('Better Auth 认证表结构已就绪，公开角色默认权限已关闭。此操作未创建账号或资源。');
  } else {
    let email;
    if (command === 'create-owner') email = await question('所有者邮箱：');
    const password = await question('新密码（12–128 个字符，输入不显示）：', true);
    if (password.length < 12 || password.length > 128) throw new Error('密码须为 12–128 个字符。');
    const confirmation = await question('再次输入新密码：', true);
    if (password !== confirmation) throw new Error('两次密码不一致，未修改账号。');
    if (command === 'create-owner') await createOwnerAccount(auth, config.ownerId, email, password);
    else await resetOwnerPassword(auth, config.ownerId, password);
    console.log(command === 'create-owner' ? '已建立预先配置 ID 对应的唯一所有者账号；未登录、未发布资源。' : '所有者密码已重置，全部旧会话已撤销。');
  }
} catch (error) {
  console.error(ownerCliErrorMessage(error));
  process.exitCode = 1;
} finally { await pool?.end(); }
