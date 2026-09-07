# 线上个人资源管理台：配置与恢复

现有站点继续部署在 Vercel。Neon PostgreSQL 保存私有收藏及独立公开版本，Better Auth 在本站处理唯一所有者的邮箱密码登录。没有公共注册功能。Neon 托管 Auth 不参与本实现。

## 当前状态与开通顺序

代码准备与实际开通是两件事。只有数据库、唯一所有者、初始公开版本、正式环境变量均验证完成后，才开启正式云端模式。未配置云端时，网站使用原有公开内容，本机管理仍仅在开发环境开放。

1. 登录现有 [Vercel 正式项目](https://vercel.com/1259216392-8613s-projects/ai-website)。不要新建第二个网站项目。
2. 从项目 Storage / Marketplace 接入 [Neon](https://vercel.com/marketplace/neon/neon)，先使用免费方案。开通时核对套餐和条款；不默认购买付费服务。也可以创建独立 Neon 项目，再手动配置连接。
3. 准备独立测试数据库。真实私有数据只绑定正式项目的 Production，不与同仓库其他项目、Preview 或开发测试共享。
4. 在受控本机完成表结构、受限公开连接、唯一所有者账号和公开基线迁移。先核对预览，再显式初始化。此过程不把全部私人收藏发布。
5. 完成访问与发布验收，再配置正式项目并重新部署。资源发布此后无需再提交代码；代码变更仍走原有部署流程。

## 服务端配置

本机配置可从 `docs/cloud-manager.env.example` 复制到被 Git 忽略的 `.env.local`。不要覆盖已有配置文件。命令行脚本显式读取 `.env.local`；正式站点从 Vercel 环境变量读取。

| 变量 | 用途 |
| --- | --- |
| `RESOURCE_LIBRARY_MODE` | `cloud` 才启用线上数据和管理；正式环境最后再开启 |
| `DATABASE_URL` | 管理和认证服务端连接，使用 Neon 提供的带 TLS 连接 |
| `PUBLIC_DATABASE_URL` | 只读已发布快照的专用数据库角色连接，不可使用管理员连接代替 |
| `BETTER_AUTH_SECRET` | 随机生成至少 32 字符的会话密钥；放入安全配置，不输出到聊天或仓库 |
| `BETTER_AUTH_URL` | 正式固定为 `https://www.notvitamin.com`；本机测试使用对应的 loopback 地址 |
| `LIBRARY_OWNER_ID` | 预先生成并固定的随机用户 ID；账号创建前配置，不从访问者注册时推断 |

所有变量均为服务端变量，不能加 `NEXT_PUBLIC_` 前缀。正式密钥在 Vercel 标为 Sensitive，并只选择 Production。环境变量变化后需要新部署才能生效。[Vercel 配置说明](https://vercel.com/docs/environment-variables)

Neon 控制台创建的普通角色可能继承 `neon_superuser`。公开只读角色必须通过受控 SQL 创建、仅获得公开快照读取权限，并验证它无法查询任何私有或认证表，不能仅改一个角色名字。[Neon 权限说明](https://neon.com/docs/reference/compatibility)

## 唯一所有者账号

配置已就绪后，在受控交互终端运行：

```powershell
node scripts/cloud-auth.mjs migrate
node scripts/cloud-auth.mjs create-owner
```

第二条命令在终端中询问邮箱和密码；密码输入不显示，也不作为命令参数保存。认证库已有账号时拒绝再次初始化。任何访问者都不能通过网站创建账号或取得管理员权限。

## 资源库结构、只读连接和初始公开版本

以下命令均在项目根目录运行，自动读取被忽略的 `.env.local`。先完成认证表迁移，再建立资源库表和专用公开角色：

```powershell
node scripts/cloud-library.mjs migrate
node scripts/cloud-library-roles.mjs
```

`PUBLIC_DATABASE_URL` 必须使用独立的 `vitamin_library_public` 用户，密码在环境文件中设置；数据库名、Neon 分支地址和端口必须与 `DATABASE_URL` 一致，允许 Neon 的直连与 `-pooler` 地址差异。角色脚本创建或更新本应用标记过的专用角色，只授予 `library_public.snapshot` 的 SELECT 权限。它会撤销 `public` schema 对所有普通角色的 CREATE 权限，因此应使用本站专用数据库。已有同名但不属于本应用的角色会拒绝修改。公开连接若拥有其他表、认证数据、schema 创建或自定义提权函数的权限，初始化检查和网站读取都会拒绝使用。

初始化必须先核对**线上当前真正生效的公开版本**。本机 `content/resource-library.json` 可能只是尚未部署的候选，脚本不会自动把它变为云端公开内容。目前已核对的线上基线是旧清单 274 条；确认仍是此版本后执行：

```powershell
node scripts/cloud-library.mjs source-preview --verified-legacy
node scripts/cloud-library.mjs preview-initialize --verified-legacy
node scripts/cloud-library.mjs initialize --verified-legacy --confirm <上一步输出的confirmation>
```

`--verified-legacy` 表示操作者已核对线上仍使用旧基线；相关内容和读取代码存在未提交变更，或本机已有快照候选时，会拒绝此模式。如线上部署已经包含公开快照，应从对应部署版本取得 JSON，使用下列显式来源，不能选用未经核对的本机候选：

```powershell
node scripts/cloud-library.mjs source-preview --published-snapshot C:\Secure\published-resource-library.json
node scripts/cloud-library.mjs preview-initialize --published-snapshot C:\Secure\published-resource-library.json
node scripts/cloud-library.mjs initialize --published-snapshot C:\Secure\published-resource-library.json --confirm <上一步输出的confirmation>
```

空快照是有效基线，会初始化为空公开资源库。确认哈希绑定全部源内容和当前初始化状态，文件变化后必须重新预览。重复初始化不会覆盖已有私有库或公开版本；普通访问不会执行初始化。初始化之外的私人备份恢复也不会发布资源。

## 私人备份迁移与替换恢复

先从本机管理台下载完整 JSON 备份，存放在仓库之外。恢复采用显式替换私人草稿的流程：预览会列出 ID 冲突、网址对应不同 ID 的冲突，以及将从当前私人库移除的 ID。确认前可先导出现有云端备份；输出文件必须位于仓库之外，且不能覆盖已有文件。

```powershell
node scripts/cloud-library.mjs backup --output C:\Secure\cloud-library-before-restore.json
node scripts/cloud-library.mjs preview-restore --backup C:\Secure\local-library-backup.json
node scripts/cloud-library.mjs restore --backup C:\Secure\local-library-backup.json --revision <预览中的libraryRevision> --confirm <预览中的confirmation>
```

恢复保留私人备注、文件夹、置顶、收藏时间、导入时间和未公开批次；当前公开条目的批次撤回标记会清除以保护已发布内容。预览后只要云端草稿或备份改变，恢复就会拒绝执行。恢复只替换私人管理库，公开版本及其发布时间保持不变；需在管理台重新预览并确认发布，才改变访客看到的内容。CLI 最多处理 32 MB 完整备份，不受普通管理请求的 4 MB 限制。

代码回归默认在内存中的 PGlite PostgreSQL 执行，完全不连接真实资源库：

```powershell
node scripts/cloud-library-check.mjs
```

如需验证实际 PostgreSQL 驱动，可给该检查单独配置 `CLOUD_LIBRARY_TEST_DATABASE_URL`，指向没有本站 schema 或同名公开角色的可丢弃隔离测试数据库。检查从不采用 `DATABASE_URL`；它会创建测试数据并保留数据库供检查，由操作者最后显式销毁。通过 PGlite 检查不代表已经验证真实 Neon 连接、账号或正式部署。

## 使用与密码恢复

开启云端模式后，进入 `/tools`，点击「管理资源」。未登录会进入 `/login`，唯一所有者登录后进入 `/tools/manage`。所有私有读取、备份、导入预览和写入均需要服务端身份验证。

普通保存只更新私人管理库；点击预览并确认发布才更新公开版本。改为私有或归档的已发布条目，在确认发布前仍属于「待撤下」。多设备冲突会拒绝覆盖，编辑内容留在当前表单中；先核对最新版本再重新编辑。

首期不依赖邮件服务。忘记密码时，在持有合法数据库配置的受控终端运行：

```powershell
node scripts/cloud-auth.mjs reset-password
```

输入并确认新密码后，全部旧会话撤销。此命令只恢复已经配置的所有者，不创建新管理员。后续需要邮件找回时，再配置并验证正式发信服务。

## 备份与故障处理

- 管理台「下载完整备份」包含私人备注，保存到个人安全位置，不能提交网站仓库。
- 私有备份恢复只更新私人草稿；公开页面仍以最近一次确认发布为准。
- 数据库为空、连接异常或已发布数量为零时，云端不回退到旧文件清单，避免重新公开已撤下内容。
- 发布事务完成但缓存刷新失败时，界面分别报告保存和刷新状态；重试刷新不会重复写入资源。
- 免费额度、数据库恢复保留时间与服务可用性受当前套餐约束。本机下载备份不等于云端自动备份；定期备份频率由实际更新频率决定。

上线验收需要验证：匿名与其他账号不能访问私有内容；正确账号能登录和退出；新增默认私有；私人备注不进入页面数据；普通保存不发布；过期预览拒绝提交；发布和撤下在首页及资源页一致；空公开版本有效；密码恢复后旧会话失效。
