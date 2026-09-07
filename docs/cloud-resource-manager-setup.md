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

本次正式开通将受控配置另存于被 Git 忽略的 `.env.cloud-setup.local`，避免本机开发服务自动加载正式数据库。对正式库运行下文管理命令时，在 `node` 后增加 `--env-file=.env.cloud-setup.local`。例如创建账号使用 `node --env-file=.env.cloud-setup.local scripts/cloud-auth.mjs create-owner`，恢复密码使用 `node --env-file=.env.cloud-setup.local scripts/cloud-auth.mjs reset-password`。密码仍由本人在交互终端输入，不写入环境文件。

| 变量 | 用途 |
| --- | --- |
| `RESOURCE_LIBRARY_MODE` | `cloud` 才启用线上数据和管理；正式环境最后再开启 |
| `DATABASE_URL` | 管理和认证服务端连接，使用 Neon 提供的带 TLS 连接 |
| `DATABASE_ADMIN_URL` | 可选，仅供本机 CLI 使用的直连地址；与 `DATABASE_URL` 使用同一私有角色、分支和数据库，不配置到 Vercel |
| `LIBRARY_PUBLIC_DATABASE_URL` | 只读已发布快照的专用数据库角色连接，不可使用管理员连接代替 |
| `BETTER_AUTH_SECRET` | 随机生成至少 32 字符的会话密钥；放入安全配置，不输出到聊天或仓库 |
| `BETTER_AUTH_URL` | 正式固定为 `https://www.notvitamin.com`；本机测试使用对应的 loopback 地址 |
| `LIBRARY_OWNER_ID` | 预先生成并固定的随机用户 ID；账号创建前配置，不从访问者注册时推断 |

所有变量均为服务端变量，不能加 `NEXT_PUBLIC_` 前缀。正式密钥在 Vercel 标为 Sensitive，并只选择 Production。环境变量变化后需要新部署才能生效。[Vercel 配置说明](https://vercel.com/docs/environment-variables)

只读连接使用 `LIBRARY_PUBLIC_DATABASE_URL`；Vercel 会将以 `PUBLIC_` 开头的名字视为公开配置并拒绝 Sensitive 类型，因此不要缩短这个变量名。它虽只读，仍是数据库凭据，只能由服务端使用。

运行时的 `DATABASE_URL`、`LIBRARY_PUBLIC_DATABASE_URL` 可使用 Neon pooled 地址；本机管理命令优先采用非 `-pooler` 的 `DATABASE_ADMIN_URL`，只在未设置时沿用 `DATABASE_URL`。角色配置命令必须使用直连。三个 Neon 连接均保留 `sslmode=verify-full`，不要降为不验证证书的连接；不同用户名不能省略数据库名。CLI 会拒绝管理地址与运行地址指向不同分支、数据库或私有角色，网站运行时不会读取 `DATABASE_ADMIN_URL`。

Neon 控制台创建的普通角色可能继承 `neon_superuser`。公开只读角色必须通过受控 SQL 创建、仅获得公开快照读取权限，并验证它无法查询任何私有或认证表，不能仅改一个角色名字。[Neon 权限说明](https://neon.com/docs/reference/compatibility)

## 唯一所有者账号

配置已就绪后，在受控交互终端运行：

```powershell
node scripts/cloud-auth.mjs migrate
node scripts/cloud-auth.mjs create-owner
```

第二条命令在终端中询问邮箱和密码；密码输入不显示，也不作为命令参数保存。认证库已有账号时拒绝再次初始化。任何访问者都不能通过网站创建账号或取得管理员权限。

密码长度为 12–128 个字符，两次输入必须完全相同。只有出现「已建立预先配置 ID 对应的唯一所有者账号」才算成功；「操作未完成」表示尚未完成。CLI 会明确提示密码长度、确认不一致或邮箱格式问题，其余错误继续隐藏数据库诊断和凭据。

## 资源库结构、只读连接和初始公开版本

以下命令均在项目根目录运行，自动读取被忽略的 `.env.local`。先完成认证表迁移，再建立资源库表和专用公开角色：

```powershell
node scripts/cloud-library.mjs migrate
node scripts/cloud-library-roles.mjs
```

`LIBRARY_PUBLIC_DATABASE_URL` 必须使用独立的 `vitamin_library_public` 用户，密码在环境文件中设置；数据库名、Neon 分支地址和端口必须与私有连接一致，允许 Neon 的直连与 `-pooler` 地址差异。角色脚本创建或更新本应用标记过的专用角色，只授予 `library_public.snapshot` 的 SELECT 权限。它会撤销 `public` schema 对所有普通角色的 CREATE 权限，因此应使用本站专用 Neon 分支或项目。角色名和备注属于整个 PostgreSQL 集群；在同一分支另建数据库不会隔离同名角色。新版标记绑定数据库名及数据库 OID，旧版未绑定标记、其他数据库的同名角色、高权限角色或异常角色成员关系均拒绝修改，需要先独立核对，脚本不会尝试自动降权或接管。

Neon 普通管理角色不是 PostgreSQL 超级用户。脚本将首次 CREATE 与重复 ALTER 分开，重复运行只修改允许的登录、继承和密码选项，不要求管理员拥有超级用户、复制或绕过 RLS 的权限。PostgreSQL 16 及以上给创建者的 ADMIN 权限不包含自动切换到新角色的权限，因此脚本不使用 `SET ROLE`：提交前按目标角色名检查授予权限，提交后使用 `LIBRARY_PUBLIC_DATABASE_URL` 建立真实独立登录，验证身份、公开读取及权限。如果新连接验证失败，命令会明确说明最小权限已提交，并提示检查连接和密码后重试；不会额外提权。公开连接若拥有其他表、认证数据、schema 创建或自定义提权函数的权限，检查和网站读取都会拒绝使用。[PostgreSQL 角色属性](https://www.postgresql.org/docs/current/role-attributes.html)、[ALTER ROLE 权限](https://www.postgresql.org/docs/current/sql-alterrole.html)

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

默认 PGlite 检查先以超级用户建立测试夹具，再通过 `SET SESSION AUTHORIZATION` 在非超级用户、仅有 CREATEROLE 的身份下实际执行角色创建和重复配置，验证旧的 `SET ROLE` / `ALTER ... NOSUPERUSER` 确实被拒绝。PGlite 会校验 PostgreSQL 权限语义，但不模拟远程 TLS 和密码握手。

如需验证实际 PostgreSQL / Neon 驱动，可给该检查单独配置 `CLOUD_LIBRARY_TEST_DATABASE_URL`，使用可丢弃独立测试分支或项目中普通 Neon 管理员的直连，保留 `sslmode=verify-full`。该身份需要 CREATEROLE 和测试对象管理权限，无需超级用户。目标不得已有本站 schema 或同名公开角色；不能仅在正式分支另建数据库。远程检查直接使用该普通管理员运行核心事务、角色创建和重复配置，并建立真实公开角色连接验证权限；超级用户夹具、会话身份切换及注入 SUPERUSER / REPLICATION 等属性的测试只在 PGlite 内运行。检查从不采用 `DATABASE_URL`；它会创建测试数据并保留数据库供检查，由操作者最后显式销毁。通过 PGlite 检查不代表已经验证真实 Neon 连接、账号或正式部署。

认证检查也默认在 PGlite 中运行：

```powershell
node scripts/cloud-auth-check.mjs
```

要在上线前验证真实 pg / TLS / Better Auth 链路，单独设置 `CLOUD_AUTH_TEST_DATABASE_URL`，指向专门可丢弃的空测试数据库，保留 Neon 直连的 `sslmode=verify-full`。该脚本不自动读取 `.env.local`，也绝不会采用 `DATABASE_URL` 或 `DATABASE_ADMIN_URL` 作为测试目标。运行前先查询是否存在任何认证表名；包括空表、其他 schema 下的同名对象，或库检查创建的模拟 `library_auth_user`，均拒绝迁移和写入。认证检查与资源库检查因此必须使用不同的隔离数据库、分支或项目，不能先后对同一目标运行。

远程认证检查会在空目标中建立测试表和夹具账号，验证登录、会话、找回密码及限流，并保留结果供检查；它不会清理、覆盖或重置已有账号或表。重复运行时会因目标不再为空而拒绝，需要换用新的可丢弃目标。失败输出只报告检查阶段，不打印连接字符串或数据库诊断。最终由操作者显式销毁测试环境；正式库不得用作任一检查目标。

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
