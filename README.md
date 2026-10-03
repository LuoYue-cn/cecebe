# 测测be

<p align="center"><strong>🚀 立即体验线上网站</strong><br><a href="https://ccb.h666h.com"><strong>https://ccb.h666h.com</strong></a></p>

可自行部署的 AI 测试生成平台。用户用自然语言描述主题，AI 设计结构与题目，服务器执行确定性评分，再由 AI 根据分数生成结构化报告。核心功能免费，商业化仅通过正文之后的页脚广告。

## 已实现能力

- 五步首次安装：环境检查、超级管理员、AI 连接测试、站点品牌、隐私与安全。事务初始化、数据库安装锁，不能再次安装。
- 邮箱注册、登录、退出、Argon2id 密码哈希、修改密码、SMTP 找回密码、游客独立会话。预留 OAuth Account 模型。
- 七种测试类型，五种题型，主题识别与审核、严格结构化生成、一次修复、BullMQ 队列与真实状态轮询。
- OpenAI、OpenAI Compatible、DeepSeek、OpenRouter、Gemini Provider；出题与分析模型分离、多 Provider 管理、连接测试、加密密钥、脱敏响应。
- Test / TestVersion 分离，JSONB 与关系化题目、维度、选项；编辑始终新建版本，历史结果不可变。
- 独立评分与一致性引擎；知识题加权分、正确率、维度分与错题解析；客户端不下发正确答案、选项权重或评分映射。
- 测试发布、私密草稿、取消发布、软删除、复制、历史记录永久删除、创建者匿名统计。
- 报告结构化展示、维度进度条、低一致性提示；原测试二维码、推广卡与结果卡、固定 1080px 宽、随内容增长的手机阅读长图 PNG、发布测试 / 复制分享、独立公开报告 token、撤销分享。
- 管理员统计、搜索 / 分页用户和测试、封禁 / 解封 / 软删除 / 恢复 / 角色管理、推荐、Prompt 版本、审计 / AI 元数据日志。
- 站点品牌、Logo 上传、主色、favicon、匿名权限、保留期限、类型限制、敏感策略、输入及题数限制、Redis 限流。
- 低干扰页脚广告，明确广告标签，按页面配置，隔离 iframe 执行广告代码，基础曝光统计。
- 中文 UI、测试语言选择、Light / Dark / System、移动适配、键盘表单标签、服务异常 / 空状态 / 404 / 403 / 500。

不包含会员、积分、充值、VIP、付费测试、弹窗广告或广告解锁。

## 网站截图演示

以下为实际产品页面的浏览器截图。截图来自验收环境，题目和报告内容使用测试数据，只展示页面与交互，不代表真实 AI 的内容质量。

### 首页 · 桌面端

<p><img src="docs/screenshots/home-desktop.png" alt="测测be桌面端首页截图" width="900"></p>

### 手机端

<details>
<summary>展开查看手机首页与测试介绍页</summary>

<p><img src="docs/screenshots/home-mobile.png" alt="测测be手机端首页截图" width="300"></p>
<p><img src="docs/screenshots/test-mobile.png" alt="测测be手机端测试介绍页截图" width="300"></p>

</details>

## 技术与目录

Next.js 15 App Router / React 19 / TypeScript strict / Prisma 6 / PostgreSQL 16 / Redis 7 / BullMQ / Zod。采用语义 HTML 与统一 CSS 设计体系，避免为组件库增加无必要依赖。安装脚本、锁文件和 Docker 构建固定兼容版本。

```text
src/app/                 页面、API、上传文件与 OpenGraph
src/components/          首页、安装、答题、报告、专用分享卡、用户与管理 UI
src/services/api/        认证、安装、测试、后台服务
src/services/            AI 调用、不可变版本、报告、队列与 worker
src/providers/           统一 AIProvider 与五种适配
src/scoring/             确定性评分、一致性引擎
src/schemas/             数据结构与引用关系验证
src/security/            会话、CSRF、权限、限流、加密、内容策略
src/lib/                 统一 Prisma、Redis、配置、错误处理
src/i18n/                中文文案目录（第一版中文 UI）
prisma/                  数据模型和 SQL Migration
scripts/                 保留期限清理、密钥生成、隔离 E2E 启动器
tests/                   单元测试、测试专用 AI fixture、浏览器验收
public/fonts/            本地中文字体及许可证
public/uploads/          品牌上传，生产通过持久卷保存
docs/screenshots/        浏览器测试截图、真实导出 PNG
```

自动化验收使用测试专用 AI fixture；示例不内置于产品。

## Docker 部署

要求 Docker Engine 与 Compose v2，建议至少 2 CPU / 4GB RAM。没有 AI Key 也能启动，首次安装页面会配置密钥。

Docker 部署文件集中放在 `deploy/docker/`。以下命令从项目根目录执行，`--project-directory .` 会让 Compose 继续从根目录读取 `.env` 和解析数据卷路径。

1. 生成本地配置：

   ```bash
   node scripts/secrets.mjs
   ```

   该脚本拒绝覆盖已有 `.env`；已有配置时直接检查并修改即可。设置 `APP_URL` 为实际站点地址。生成的数据库密码、会话配置和加密密钥仅保存在 `.env`。

2. 检查并启动：

   ```bash
   docker compose --project-directory . -f deploy/docker/docker-compose.yml config --quiet
   docker compose --project-directory . -f deploy/docker/docker-compose.yml up -d --build
   docker compose --project-directory . -f deploy/docker/docker-compose.yml logs -f app worker migrate
   ```

   Compose 依次启动 PostgreSQL / Redis，运行 Prisma Migration，然后启动 app、worker 和每日清理服务。数据库和 Redis 不对外暴露，app 默认只绑定服务器本机 `127.0.0.1:3000`。

3. 默认访问 [http://localhost:3000](http://localhost:3000)。全新数据库自动跳转 `/install`。完成安装后，在 `/login` 用刚创建的管理员登录，访问 `/admin`。

4. 公网 HTTPS 可使用提供的 Caddy：

   ```dotenv
   APP_URL=https://test.example.com
   SITE_DOMAIN=test.example.com
   TRUST_PROXY=true
   ```

   将域名 DNS 指向服务器，然后运行：

   ```bash
   docker compose --project-directory . -f deploy/docker/docker-compose.yml --profile https up -d --build
   ```

   此时 app 端口仍只绑定 localhost，Caddy 负责 TLS 和覆盖客户端 IP。只在可信代理覆盖转发头时启用 `TRUST_PROXY`。

首次安装无需手动写数据库。`migrate` 服务负责结构，`/install` 负责数据初始化。安装已完成时，不要删除锁或重新开放 `/install`；后续配置从管理后台修改。

## 本地开发

使用 Node.js 22 LTS，PostgreSQL 16+、Redis 7+。

```bash
npm ci
cp .env.example .env
# 修改数据库/Redis/站点地址，生成 AUTH_SECRET 与 ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:migrate
npm run dev
```

另开一个终端运行长任务：

```bash
npm run worker
```

本次工作目录另保留了无需系统安装的验证运行环境（仅本机 `.local/`，不会打包进 Docker）。在此目录恢复它可执行：

```bash
bash scripts/local-infra.sh
npm run start
# 另开终端：npm run worker
```

默认访问 `http://localhost:3000`。`APP_URL` 必须与浏览器实际访问地址一致（包括端口）；CSRF 校验会拒绝其他 Origin。如果修改域名，同时更新 APP_URL 和后台站点 URL。

开发环境 CSP 允许 Next.js 的 eval 与热更新 WebSocket；生产构建不允许 eval。

## 环境变量

| 变量                                      | 作用                                         |
| ----------------------------------------- | -------------------------------------------- |
| DATABASE_URL                              | PostgreSQL 连接字符串，开发与迁移必填        |
| POSTGRES_PASSWORD                         | Compose 内部数据库密码                       |
| REDIS_URL                                 | 队列、限流、临时状态                         |
| APP_URL                                   | 可信网站 Origin 和安全 Cookie 判断           |
| AUTH_SECRET                               | 至少 32 字符的安装安全配置                   |
| ENCRYPTION_KEY                            | 64 位十六进制 AES-256-GCM 加密密钥，必须备份 |
| ALLOW_PRIVATE_AI                          | 默认 false；仅可信私有 AI 网关才允许 true    |
| TRUST_PROXY                               | 默认 false；可信反向代理覆盖头时启用。关闭时按会话限流，不把全站访客合并为一个 IP |
| SMTP_HOST / PORT / USER / PASSWORD / FROM | 可选找回密码邮件；未配置时明确告知不可用     |
| SITE_DOMAIN                               | 可选 Caddy 域名                              |
| TEST_DATABASE_URL                         | E2E 专用数据库，名称必须以 `_test` 结尾      |
| TEST_REDIS_URL                            | E2E 专用 Redis 数据库，推荐 `/1` 或独立实例  |

AI API Key **不要求写入环境变量**；仅通过安装 / 后台配置。密钥以 AES-256-GCM 保存，完整密钥不返回浏览器；更换密钥时需要重新输入。

## 首次安装与 AI

环境检测必须全部通过。创建管理员密码至少 10 位。选择 Provider，填写 Base URL、真实 API Key、出题模型与分析模型；连接测试会分别请求这两个模型。

- OpenAI / Compatible：Base URL 例如 `https://api.openai.com/v1`，使用普通 `chat/completions` 请求，不发送 `response_format`。
- DeepSeek / OpenRouter：同样使用普通聊天请求，模型需要能够遵循提示中的数据格式要求。
- Gemini：原生 `generateContent`，Base URL 为 `https://generativelanguage.googleapis.com/v1beta`。

提示词附带完整结构、固定值清单和生成规则，响应文本由后端提取并严格校验。评分映射使用 `[{dimensionId, score}]` 数组，转换为后端 score map；每个维度的范围必须是数字 `0–100`。

自建兼容网关只需支持普通聊天协议，不需要实现强制 JSON / JSON Schema 模式。若格式或字段不合格，后端把上一条回复以及具体错误字段、期望值和实际值放进会话，要求模型完整修正一次。题目数量与评分引用仍由应用额外检查；无法通过校验的数据不会创建测试。

公开测试 `/t/{slug}` 读取已保存版本，答题时没有 AI 请求；只在创建及最终解释阶段调用 AI。基础评分失败不会由 AI 临时代算。分析失败时保留分数，可重试分析。

## 质量检查与 E2E

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx prisma validate
npx prisma migrate status
```

完整浏览器验收要求先构建、安装浏览器，并建立专用空数据库：

```bash
npx playwright install chromium
# 例如 cecebe_test；E2E 将重置这个数据库，请勿指向业务数据库。
TEST_DATABASE_URL='postgresql://cecebe:password@localhost:5432/cecebe_test?schema=public' \
TEST_REDIS_URL='redis://localhost:6379/1' npm run test:e2e
```

测试启动器会启动测试 fixture AI、生产 app 和 worker，完成后关闭这些进程。3000 / 5100 端口需可用。测试不使用真实 AI Key、不调用收费服务。覆盖安装锁、UI 生成 / 作答 / 报告、PNG 导出、移动布局、测试复用、答案保密、CSRF、权限、版本保存、广告渲染和分享撤销。

测试启动器会清空 TEST_REDIS_URL 指定的专用 Redis 数据库，强制要求非零数据库编号（如 /1）。务必使用没有业务数据的专用实例 / 数据库。测试数据库仅用于验收，不用于开发或生产。

## 更新与备份

更新前备份 PostgreSQL、上传目录和 `.env`，特别是 `ENCRYPTION_KEY`。然后：

```bash
docker compose --project-directory . -f deploy/docker/docker-compose.yml build
docker compose --project-directory . -f deploy/docker/docker-compose.yml run --rm migrate
docker compose --project-directory . -f deploy/docker/docker-compose.yml up -d app worker maintenance
```

备份示例（在受保护目录执行，不将备份提交到 Git）：

```bash
umask 077
mkdir -p backups
docker compose --project-directory . -f deploy/docker/docker-compose.yml exec -T postgres pg_dump -U cecebe -d cecebe -Fc > backups/database.dump
docker compose --project-directory . -f deploy/docker/docker-compose.yml exec -T app tar -czf - -C /app/public uploads > backups/uploads.tar.gz
cp .env backups/environment.env
```

数据库备份内含加密 API Key，环境备份含解密密钥，应分开加密保存、限制访问并定期演练恢复。不要在日志、工单、公开仓库或报告中展示备份内容。

恢复需要停止 app / worker，使用 `pg_restore` 恢复数据库，同时恢复 uploads 和原 ENCRYPTION_KEY。没有旧加密密钥则需要重新输入各 Provider 的 Key。

## 安全、隐私与维护

- 服务器持有评分规则、正确答案和 AI Key。客户端渲染 AI 文本，不插入 AI HTML。
- 会话采用高熵随机 token、服务端仅存 SHA-256，HttpOnly / SameSite Cookie；HTTPS 下 Secure。CSRF 同时验证 Origin 和随机会话 token。
- 使用 Argon2id 密码哈希，密码重置 token 单次有效、1 小时过期，改密码后销毁其他会话。
- 普通 ADMIN 管理内容、用户、广告；SUPER_ADMIN 负责密钥、提示词、系统、安全与管理员角色。
- AI URL 默认 HTTPS，阻止私有 IP、URL 凭据及重定向；公网部署建议再用出站网络规则限制内网与 metadata 地址，防御 DNS rebinding。
- 游客 / IP / 用户生成限额、并发任务限制、题数与输入限制、token 上限，Redis 原子限流。Redis 不存唯一核心数据。
- 广告 iframe 使用 sandbox 且没有 allow-same-origin，不能读取宿主 Cookie、DOM 或直接覆盖正文。部分要求顶层访问的广告商脚本可能不兼容；请用其支持 sandbox 的嵌入代码。
- 默认不长期保存原始答案。创建主题与开放题仅临时用于任务，任务结束后清空任务输入；关闭保存时，错题回顾保留解析及正确答案，不保留用户选项。
- 结果 UUID 还必须通过答题者权限校验。公开分享使用独立高熵 token，敏感结果确认、高风险默认禁用，撤销后失效。
- 用户删除记录级联删除原始答案、分数、分析、分享及相应任务。测试 / 用户软删除，避免破坏他人历史结果。
- `maintenance` 每天清理过期历史和会话。开发可手动 `npm run maintenance`；数据库迁移不要替代保留期限清理。
- 不记录完整 AI prompt 或答案日志。审计 IP 可配置，AI 日志仅模型、token、延迟、状态等元数据。
- 全部端到端测试在隔离测试服务下进行。开发依赖的全量 audit 仍报告 Vitest mocker 与 braces 的上游风险（仅测试 / lint 工具，生产镜像会移除开发依赖）；生产依赖 audit 为 0。真实 Provider 的模型质量、网关 Structured Output 兼容性、真实 SMTP 投递、公网 TLS、Docker 镜像启动还需要在对应部署环境验证。

## 可扩展方向

预留 OAuth Account、独立评分与版本引擎可扩展自适应 / 双人测试；后续可加入结果模板缓存、邀请差异分析、模板市场与 Public API。这些不是第一版默认开放功能。

Max Tokens 可设为 `0`（不限制）：网站不发送输出额度参数，由接口和模型使用自己的默认上限。普通会话提示词的实测数据见 [提示词实测记录](docs/ai-prompt-evaluation.md)。
