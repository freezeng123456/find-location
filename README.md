# 迹点 · Place Trace

一个由 Agent 协助维护、但由用户决定最终收藏结果的个人地点记忆。

粘贴公开链接或一段文字后，Agent 只生成地点候选。候选携带原文引用、
地图匹配和融合置信度；只有用户点击“加入”后，地点才进入永久地图。

## 核心原则

- **Skill 优先**：默认不调用模型 API，由仓库内的 Codex
  `place-curator` Skill 处理收件箱。
- **API 可替换**：配置 OpenAI API Key 后，相同查询可以由服务端自动处理。
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
Skill 与 API 共用同一份候选 Schema 和持久化边界，二者都不能跳过用户确认。

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

默认使用 OpenStreetMap 作为无需 Key 的开发回退。产品范围限定为中国大陆；
正式部署可在保持 `Place` 经纬度接口不变的情况下替换为高德地图，并配置合规的
地图 Key、坐标系转换和服务条款。
