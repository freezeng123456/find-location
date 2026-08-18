# 迹点 · Place Trace

一个由 Agent 协助维护、但由用户决定最终收藏结果的个人地点记忆。

粘贴公开链接或一段文字后，Agent 只生成地点候选。候选携带原文引用、
地图匹配和融合置信度；只有用户点击“加入”后，地点才进入永久地图。

## 核心原则

- **Skill 优先**：默认不调用模型 API，由仓库内的 Codex
  `place-curator` Skill 处理收件箱。
- **API 可替换**：可配置 NVIDIA NIM 或 OpenAI，由服务端自动处理查询。
- **显式确认**：Agent 无权把候选直接变成收藏。
- **历史可追溯**：查询、候选、来源、合并、喜欢、归类和软删除都有独立记录。
- **用户隔离**：所有地点、来源、类别和个人规则都按账号隔离。
- **确定性边界**：语义判断交给 Agent；身份、坐标范围、Schema
  和状态变更由代码校验。

## 本地运行

需要 Node.js 22+。

```bash
npm install
npm run dev
```

打开 <http://localhost:5173>，注册一个本地账号。首次进入可点击
“载入杭州示例”，直接体验候选、加入、喜欢、归类和地图联动。

生产构建：

```bash
npm run build
npm start
```

默认服务端端口为 `8787`，SQLite 数据保存在 `data/places.db`。

## 直接可用的 Demo

下面两种方式都不需要购买地图 API 或模型 API。

### 方式一：先体验完整界面

```bash
npm install
npm run dev
```

1. 打开 <http://localhost:5173>；
2. 注册一个本地账号；
3. 点击地图中央的“载入杭州示例”；
4. 在右侧查看候选地点、原文和置信度；
5. 点击“加入我的地图”；
6. 点击地图上的绿色地点标记，可以喜欢、软删除或归入自定义类别。
7. 进入“类别”并点击任一类别，可以在弹窗中搜索、多选所有已保存地点，
   一次完成批量归类。

示例只会创建查询候选，不会替你收藏地点。必须点击“加入我的地图”，正式地点
才会写入个人地图。

如果不想注册，也可以先创建仅供本机使用的演示账号：

```bash
npm run seed
npm run dev
```

`npm run seed` 会在终端打印演示账号和密码。

### 方式二：用 Codex 处理自己的内容

保持 `npm run dev` 运行，在网页输入框粘贴下面这段示例：

```text
周六想去上海西岸走走。先到龙美术馆（西岸馆）看展，再沿江走到
上海油罐艺术中心；如果晚上还有时间，就去武康大楼附近散步。
```

点击“开始发现”后，该查询会显示为“等待 Codex Skill”。在这个仓库的 Codex
对话中输入：

```text
$place-curator 处理地点收件箱
```

Codex 会读取正文、核验 POI、地址和坐标，再把候选写回查询历史。网页每
4 秒自动刷新，处理完成后会出现候选卡片。最后由你逐个点击“加入我的地图”。

如果 Codex 没有自动选择 Skill，可以先确认收件箱：

```bash
npm run places -- pending
```

整个流程中，Codex 只维护候选；它不能绕过确认按钮创建正式地点。

## 使用 Codex Skill（默认）

网站提交的新内容会进入查询收件箱。让 Codex 执行：

```text
$place-curator 处理地点收件箱
```

Skill 位于：

```text
.agents/skills/place-curator/SKILL.md
```

它会依次：

1. 读取最早的待处理查询及生效规则；
2. 理解正文，而不是简单匹配地名；
3. 核验中国大陆 POI 的名称、地址和坐标；
4. 生成严格结构化候选；
5. 通过 CLI 校验并写入查询历史；
6. 把最终“加入”动作留给网页用户。

也可以手动查看流程：

```bash
npm run places -- pending
npm run places -- show <query-id>
npm run places -- submit <query-id> <candidates.json>
```

## 可选 API 模式

复制环境变量模板：

```bash
cp .env.example .env
```

设置 `OPENAI_API_KEY` 后，网站提交查询时会自动调用 Responses API。
也可以使用 NVIDIA Developer Program 的免费 NIM 原型接口：

```env
NVIDIA_API_KEY=通过安全环境变量配置
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
NVIDIA_ALLOWED_ACCOUNTS=free
NVIDIA_TRIAL_RPM=8
TRIAL_ACCOUNT_LOGIN=free
TRIAL_ACCOUNT_PASSWORD=至少8位的试用密码
```

服务启动时会初始化试用账号。只有 `NVIDIA_ALLOWED_ACCOUNTS` 中的账号可以触发
NVIDIA 请求；浏览器永远无法读取 API Key。免费试用账号默认还受到每分钟
8 次的应用侧限制。NVIDIA Developer Program 托管接口仅用于原型、研究、
开发和测试，不应作为正式生产服务。

Skill、NVIDIA 和 OpenAI 共用同一份候选 Schema 和持久化边界，任何模式都不能
跳过用户确认。

公共多用户部署若要自动处理每个人的查询，必须配置一个 Agent
运行时（API 或受控任务队列）。仓库级 Skill 本身不会在普通 Web
服务器中凭空运行；它适合 Codex/ChatGPT Work 维护场景。

## 数据模型

```text
User
 ├─ Query ─ Candidate
 │             └─ (用户确认) ─ PlaceSource
 ├─ Place ─ Category
 ├─ PlaceEvent
 └─ Rule (system / user / task / correction)
```

`Candidate` 保存提及置信度、匹配置信度和原文证据。`Place`
不保存置信度，只保存用户已经确认的地点事实。

## 常用命令

```bash
npm run dev       # Web 与 API 开发服务
npm run typecheck # TypeScript 检查
npm test          # API 与隔离规则测试
npm run build     # 生产前检查与前端构建
npm run seed      # 创建本地演示账号和示例
```

`npm run seed` 的演示账号仅用于本机，不能用于公开部署。

## 地图

默认使用 OpenStreetMap，不需要 Key。浏览器通过本站的
`/api/map-tiles` 同源读取瓦片，服务端转发缓存相关响应头，因此即使客户端网络
无法直接连接 OpenStreetMap，底图仍可正常显示。使用公开服务时应继续遵守
[OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
并保留地图署名。

产品范围限定为中国大陆；正式部署也可以在保持 `Place` 经纬度接口不变的情况下
替换地图提供方。
