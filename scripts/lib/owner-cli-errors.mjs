/** Only fixed, user-actionable messages may leave the account setup CLI. */
const SAFE_MESSAGES = new Set([
  '密码须为 12–128 个字符。',
  '邮箱格式不正确。',
  '两次密码不一致，未修改账号。',
  '认证库已有账号，不能重复初始化；如需恢复请使用 reset-password。',
  '未找到已配置的所有者密码账号，未修改任何账号。',
  '账号操作必须在交互终端中进行，密码输入不会显示。',
  '操作已取消。',
  '输入已结束，未完成操作。',
  '认证表结构需要人工检查，迁移未执行。',
]);

export function ownerCliErrorMessage(error) {
  if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return `操作未完成：${error.message}`;
  return '操作未完成。请核对本机云配置及数据库连接和权限；没有输出凭据或数据库错误。';
}
