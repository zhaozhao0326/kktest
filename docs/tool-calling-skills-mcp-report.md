# 原生 Tool Calling、MCP 与 Skills 成本评估汇报

日期：2026-06-01

## 一句话结论

原生 tool calling 不是“异步后台优化”，而是“把可用工具定义交给模型，让模型决定是否调用”。工具定义包含工具名、描述、参数 JSON Schema；当工具很多，尤其接入 MCP 服务器后，工具清单本身会显著增加输入 token、首 token 延迟和请求体大小。

对当前聊天应用而言，用户的真实诉求更接近“后台异步任务提升体验”，不应默认等同于“每轮主聊天都开启模型原生工具调用”。建议把二者拆开：普通聊天走轻量 prompt；记忆、总结、日程捕获等走应用侧异步任务；只有明确需要外部系统能力时，才按意图临时暴露少量工具。

## 背景现象

本次排查中，用户创建空白人设、AI 功能基本全开后，第一轮输入 token 约 30k；关闭“后台工具调用”后降至约 1.5k。这个差异与代码结构吻合：

- `src/composables/api/requestPlan.js` 中，记忆仍通过 `buildMemoryPrompt(activeChat)` 注入系统提示词；开启工具调用不会替代这部分记忆上下文。
- `src/composables/api/tools/toolRegistry.js` 会收集内置工具与 MCP 工具。
- `src/composables/api/chatCompletions.js` 会把 `tools` 放进请求 payload。
- 联系人/群聊的 MCP 选择目前“留空”语义是“全部已启用服务器”，不是“不使用 MCP”。

因此，30k 并非空白人设本身导致，而大概率是 MCP 或大量工具 schema 被带入主聊天请求。

## Tool Calling 为什么会费 token

OpenAI 的 function/tool calling 文档把工具定义描述为通过 `tools` 参数提供给模型，并且每个 function 由 schema 描述名称、用途和参数结构。模型调用工具时，通常是多步流程：先带工具请求模型，模型返回 tool call，应用执行工具，再把工具结果提交给模型生成最终回复。[1]

对 MCP/Connectors，OpenAI 文档更直接说明：使用 MCP tool 时，会为“导入工具定义”和“进行工具调用”所使用的 token 付费；文档也提醒，某些 MCP server 可能暴露几十个工具，暴露太多工具会导致高成本和高延迟，建议用 `allowed_tools` 过滤。[2]

这意味着：

- 工具定义不是免费元数据；它会被模型看见或被平台导入为模型可用能力。
- 工具越多、描述越长、参数 schema 越复杂，输入 token 越高。
- 即便没有实际调用工具，也可能已经为工具定义付出输入 token。
- 若模型实际调用工具，还会多一轮或多轮请求，并把工具调用结果继续加入上下文。
- prompt caching 可能降低部分账单成本，但不等于消除上下文占用、请求体大小和延迟。[3]

## MCP 与 Skills 的定位差异

MCP 是连接协议，重点是把外部系统、数据和动作暴露给 AI 应用。MCP 官方概念里，服务器可以提供 tools、resources、prompts：tools 用于模型可调用动作，resources 用于上下文数据，prompts 用于可复用模板。[4]

Skills 是工作流知识包，重点是告诉 agent “什么时候做、按什么流程做、参考哪些资料、调用哪些脚本”。Anthropic 对二者的描述很清楚：MCP 连接第三方工具，Skills 教模型如何把这些连接用好；MCP 负责 connectivity，Skills 负责 expertise/workflow logic。[5]

OpenAI 的 Codex Skills 也采用类似方向：Skills 是包含 instructions、scripts、resources 的文件夹，让 agent 以可重复方式完成特定任务；OpenAI 的 skills catalog 也明确用于 Codex 的能力打包和分发。[6]

所以“Skills 比 MCP 更流行”需要拆开看：

- 在 coding agent、文档处理、重复工作流、团队规范这类场景，Skills 正在变热，因为它们轻量、可审阅、可按需加载，适合沉淀流程。
- 在连接 Notion、GitHub、数据库、CRM、内部 API 这类外部系统场景，MCP 仍然是更合适的连接层。
- 最佳实践不是二选一，而是组合：MCP 提供能力边界，Skill/本地工作流提供选择、顺序、过滤和格式规范。

## 对当前产品的判断

当前“后台工具调用”这个名字容易误导。用户以为它是“后台异步处理”，实际效果更像“主聊天启用原生 tool calling 并暴露所有可用工具”。这会带来四个问题：

- 成本不可控：普通闲聊也可能携带大量 MCP schema。
- 延迟变高：工具发现、schema 导入、模型选择工具都会增加耗时。
- 行为不稳定：模型可能在不需要时尝试调用工具。
- 统计不透明：token 胶囊目前难以明确告诉用户“工具 schema 占了多少”。

更合适的产品语义应是：

- “后台异步处理”：应用侧在回复后做记忆提取、总结、日程捕获、缓存刷新，不影响主聊天 token。
- “模型工具调用”：让模型在主聊天中直接选择工具，适合需要外部动作或查询的场景，但会增加 token。

## 推荐改进方案

### 方案 A：拆分开关

新增两个独立能力：

1. 后台异步处理
   - 默认可开启。
   - 用于记忆提取、聊天总结、日程捕获、动态总结等。
   - 不在主聊天请求里带 `tools`。

2. 模型原生工具调用
   - 默认关闭或仅“按需”。
   - UI 文案明确提示：会增加输入 token，MCP 工具多时成本明显上升。
   - 可选择“关闭 / 自动按需 / 总是开启”。

### 方案 B：工具按意图暴露

普通聊天时不传 `tools`。只有命中明确意图时，才传少量相关工具：

- “记住 / 别忘了 / 以后记得”：只暴露 `add_memory`，甚至可直接应用侧写入，不必让主聊天 tool call。
- “帮我写日记 / 记进日记”：只暴露 `write_diary`。
- “创建提醒 / 安排日程”：只暴露 `create_event`。
- “查 Notion / 找文档 / 搜工作区”：只暴露指定 Notion/MCP 服务器的检索工具。

如果工具数量较多，应先做应用侧 intent gate 或 tool router，再把候选工具裁剪到 1-5 个。

### 方案 C：修正 MCP 默认语义

联系人 MCP 选择建议改成三态：

- 不使用 MCP
- 跟随全局已启用服务器
- 只使用指定服务器

当前“留空 = 全部已启用服务器”容易让新建角色误吃全局 MCP token，应调整 UI 文案和数据结构，避免普通角色默认继承所有 MCP。

### 方案 D：Token 统计拆分

在 token 胶囊里新增或细化：

- 主提示词
- 人设/用户面具
- 记忆
- 世界书
- 历史消息
- 功能规则
- 工具 schema / MCP
- 图片或多模态估算

即使工具 schema 的精确 token 只能由 API usage 体现，也应至少记录 `toolsCount`、MCP server 数量、工具 schema JSON 估算值，并在最近单次消耗里标注“本次包含工具定义”。

### 方案 E：引入 Skill-like 工作流包

对本应用而言，不一定要完整接入外部 Skills 生态，但可以借鉴其“渐进加载”模式：

- 把大段功能规则从常驻系统 prompt 中拆出来。
- 每个功能维护一个小型 recipe：触发条件、输出格式、解析规则、异常处理。
- 普通聊天只保留短提示。
- 命中特定功能时，再注入对应 recipe。

这会比“所有功能规则每轮常驻”更接近 Skills 的优势：按需加载、可审阅、低 token。

## 分阶段落地计划

### P0：止血

- 修改 UI 文案：把“后台工具调用”改为“模型工具调用（会增加输入 token）”。
- 在设置页提示：MCP 工具越多，输入 token 和延迟越高。
- 新建联系人 MCP 默认改为“不使用 MCP”或至少明确提示“留空表示全部已启用服务器”。

### P1：主聊天默认轻量化

- 新增设置：`toolCallingMode: 'off' | 'intent' | 'always'`。
- 默认使用 `intent` 或 `off`。
- `intent` 模式下，普通聊天不传 `tools`。

### P2：工具候选裁剪

- 增加 `selectToolsForMessage(lastUserContent, activeChat, settings)`。
- 内置工具按关键词/状态裁剪。
- MCP 工具按联系人三态选择和关键词裁剪。
- 单轮工具上限建议默认 5 个。

### P3：异步后台处理

- 将记忆提取、总结、日程捕获等明确归入“回复后任务队列”。
- 这些任务可使用独立小模型/独立配置/低 max_tokens，不污染主聊天请求。
- UI 上展示“后台已记住/已整理”反馈，而不是让主聊天模型原生调用工具。

### P4：观测与预算

- 记录每次请求的 `messagesTokenEstimate`、`toolsTokenEstimate`、`toolsCount`、`mcpServerCount`、`prompt_tokens`、首 token 延迟。
- 增加预算保护：若预计输入 token 超过阈值，自动降级为不带 MCP 或提示用户确认。

## 建议的验收指标

- 空白人设、普通第一句话：输入 token 维持在 1k-3k。
- 开启异步后台处理：普通聊天输入 token 不明显增长。
- 开启模型工具调用但无工具意图：输入 token 不超过普通聊天的 120%。
- 明确工具意图时：只暴露相关工具，`toolsCount <= 5`。
- MCP 全局启用但联系人“不使用 MCP”：普通聊天 `toolsCount = 0`。
- token 胶囊可解释 80% 以上的 prompt token 来源。

## 风险与注意事项

- MCP 仍有价值，但应作为外部连接层，不应默认灌进每轮闲聊。
- Skills/recipe 适合流程知识，不适合直接替代外部 API 连接。
- 工具调用涉及外部动作时，需要权限边界、用户确认和审计日志。
- 自动意图识别不要过度复杂；先用保守关键词和显式 UI 入口，比让模型每轮自行决定更可控。

## 参考资料

[1] OpenAI Function Calling Guide: https://developers.openai.com/api/docs/guides/function-calling

[2] OpenAI MCP and Connectors Guide: https://developers.openai.com/api/docs/guides/tools-connectors-mcp

[3] OpenAI Help Center, Tokens and usage categories: https://help.openai.com/en-us/articles/4936856-how-can-i-estimate-the-cost-of-my-usage

[4] Model Context Protocol, Server Concepts: https://modelcontextprotocol.io/docs/learn/server-concepts

[5] Anthropic, Extending Claude's capabilities with skills and MCP: https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers

[6] OpenAI Skills Catalog for Codex: https://github.com/openai/skills
