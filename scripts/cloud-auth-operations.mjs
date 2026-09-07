/** Explicit account operations for the offline owner CLI and isolated tests only. */
export async function createOwnerAccount(auth, ownerId, email, password) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('邮箱格式不正确。');
  validatePassword(password);
  const context = await auth.$context;
  const hash = await context.password.hash(password);
  await context.adapter.transaction(async transaction => {
    const existing = await transaction.findMany({ model: 'user', limit: 1 });
    if (existing.length) throw new Error('认证库已有账号，不能重复初始化；如需恢复请使用 reset-password。');
    const now = new Date();
    await transaction.create({ model: 'user', forceAllowId: true, data: { id: ownerId, email: email.toLowerCase().trim(), name: 'Vitamin', emailVerified: true, createdAt: now, updatedAt: now } });
    await transaction.create({ model: 'account', data: { userId: ownerId, accountId: ownerId, providerId: 'credential', password: hash, createdAt: now, updatedAt: now } });
  });
}

export async function resetOwnerPassword(auth, ownerId, password) {
  validatePassword(password);
  const context = await auth.$context;
  const hash = await context.password.hash(password);
  await context.adapter.transaction(async transaction => {
    const owner = await transaction.findOne({ model: 'user', where: [{ field: 'id', value: ownerId }] });
    const account = await transaction.findOne({ model: 'account', where: [{ field: 'userId', value: ownerId }, { field: 'providerId', value: 'credential' }] });
    if (!owner || !account) throw new Error('未找到已配置的所有者密码账号，未修改任何账号。');
    await transaction.updateMany({ model: 'account', where: [{ field: 'userId', value: ownerId }, { field: 'providerId', value: 'credential' }], update: { password: hash, updatedAt: new Date() } });
    await transaction.deleteMany({ model: 'session', where: [{ field: 'userId', value: ownerId }] });
    await transaction.deleteMany({ model: 'verification', where: [{ field: 'identifier', value: ownerId }] });
  });
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('密码须为 12–128 个字符。');
}
