# 工具调用优化实施计划

## 背景

当前 `allowToolCalling` 是单一布尔开关，开启后每轮聊天都携带全量工具 schema（内置 + 全部 MCP），导致空白人设第一轮输入 token 约 30k。联系人 `mcpServerIds` 留空时 fallback 到全部已启用服务器，进一步加剧问题。

本计划分三个阶段，每阶段独立可交付，逐步将普通聊天的工具 token 开销降至接近零。

---

## 阶段一：MCP 默认语义修正 + 工具数量上限

**目标**：留空 mcpServerIds = 不使用 MCP（而非全部服务器）；工具总数硬上限防止 token 爆炸。

### 任务 1.1：修改 MCP Server ID 解析函数

**文件**：`src/utils/mcpServers.js`

修改三个 resolve 函数，将"留空 = undefined（全部服务器）"改为"留空 = 空数组（不使用 MCP）"：

```js
// 修改前（第 36-39 行）：
export function resolveDirectMcpServerIds(contact) {
  const ids = normalizeMcpServerIds(contact?.mcpServerIds)
  return ids.length > 0 ? ids : undefined
}

// 修改后：
export function resolveDirectMcpServerIds(contact) {
  return normalizeMcpServerIds(contact?.mcpServerIds)
}
```

```js
// 修改前（第 41-47 行）：
export function resolveGroupMultiMcpServerIds(group, member) {
  const memberIds = normalizeMcpServerIds(member?.mcpServerIds)
  if (memberIds.length > 0) return memberIds
  const groupIds = normalizeMcpServerIds(group?.mcpServerIds)
  return groupIds.length > 0 ? groupIds : undefined
}

// 修改后：
export function resolveGroupMultiMcpServerIds(group, member) {
  const memberIds = normalizeMcpServerIds(member?.mcpServerIds)
  if (memberIds.length > 0) return memberIds
  return normalizeMcpServerIds(group?.mcpServerIds)
}
```

```js
// 修改前（第 49-61 行）：
export function resolveGroupSingleMcpServerIds(group) {
  const mergedIds = new Set(normalizeMcpServerIds(group?.mcpServerIds))
  let hasExplicitSelection = mergedIds.size > 0
  ;(Array.isArray(group?.members) ? group.members : []).forEach((member) => {
    const memberIds = normalizeMcpServerIds(member?.mcpServerIds)
    if (memberIds.length === 0) return
    hasExplicitSelection = true
    memberIds.forEach((id) => mergedIds.add(id))
  })
  return hasExplicitSelection ? [...mergedIds] : undefined
}

// 修改后：
export function resolveGroupSingleMcpServerIds(group) {
  const mergedIds = new Set(normalizeMcpServerIds(group?.mcpServerIds))
  ;(Array.isArray(group?.members) ? group.members : []).forEach((member) => {
    normalizeMcpServerIds(member?.mcpServerIds).forEach((id) => mergedIds.add(id))
  })
  return [...mergedIds]
}
```

**关键变化**：三个函数不再返回 `undefined`，而是返回空数组 `[]`。下游 `discoverMcpTools({ serverIds })` 收到空数组时应该返回空结果（需要验证，见任务 1.2）。

### 任务 1.2：确保 MCP 发现逻辑尊重空数组

**文件**：`src/composables/useMcpBridge.js`

找到 `discoverMcpTools` 函数（约第 398-496 行）。检查当 `serverIds` 为空数组 `[]` 时的行为：

- 如果当前逻辑是"serverIds 为空数组则跳过发现"，无需修改。
- 如果当前逻辑是"serverIds 为 undefined 时发现全部，为空数组时也发现全部"，则需要在函数入口加判断：

```js
// 在 discoverMcpTools 函数体开头加：
if (Array.isArray(serverIds) && serverIds.length === 0) {
  return { tools: [], externalExecutors: null }
}
```

同样检查 `useMcpDirectConnect` 相关的发现逻辑，确保空数组 = 不发现。

### 任务 1.3：修改 UI 描述文案

**文件**：`src/utils/mcpServers.js`

`describeMcpServerSelection` 函数（第 21-34 行）的 `fallbackLabel` 当前为 `'全部已启用服务器'`。修改默认值：

```js
// 修改前：
const fallbackLabel = options.emptyLabel || '全部已启用服务器'

// 修改后：
const fallbackLabel = options.emptyLabel || '不使用 MCP'
```

**文件**：`src/views/settings/SettingsAIFeatures.vue`

修改第 156-157 行的文案：

```
// 修改前：
<span class="text-[17px] text-[var(--text-primary)]">后台工具调用</span>
<span class="text-[12px] text-[var(--text-secondary)]">让 AI 在后台自动执行记忆、日程、日记等操作</span>

// 修改后：
<span class="text-[17px] text-[var(--text-primary)]">模型工具调用</span>
<span class="text-[12px] text-[var(--text-secondary)]">让 AI 主动调用工具（会增加输入 token），MCP 工具越多成本越高</span>
```

### 任务 1.4：工具总数上限

**文件**：`src/composables/api/tools/toolRegistry.js`

在 `getAvailableTools` 函数返回前增加截断逻辑：

```js
export function getAvailableTools(settingsStore, contact, extraTools = []) {
  const tools = []

  // ... 现有内置工具收集逻辑不变 ...

  const builtinCount = tools.length

  // ... 现有 MCP 工具追加逻辑不变 ...

  // 工具总数上限：内置工具优先，MCP 工具按顺序截断
  const MAX_TOOLS = 8
  if (tools.length > MAX_TOOLS) {
    const removed = tools.length - MAX_TOOLS
    tools.length = MAX_TOOLS
    console.warn(`[ToolRegistry] Truncated ${removed} tools (total exceeded ${MAX_TOOLS})`)
  }

  return tools
}
```

### 任务 1.5：更新现有测试

检查并更新以下测试文件，确保它们适配 resolve 函数返回值从 `undefined` 变为 `[]` 的变化：

- 搜索 `resolveDirectMcpServerIds`、`resolveGroupMultiMcpServerIds`、`resolveGroupSingleMcpServerIds` 的测试断言
- 将期望 `undefined` 的断言改为期望 `[]`

运行 `npm test` 确认全部通过。

---

## 阶段二：工具调用模式设置 + 意图匹配

**目标**：新增 `toolCallingMode` 三态设置（关闭 / 按需 / 始终），`intent` 模式下普通聊天不传 tools。

### 任务 2.1：新增设置项

**文件**：`src/stores/settingsDefaults.js`

在 `createDefaultToolCallingSettings` 中新增 `toolCallingMode`：

```js
export function createDefaultToolCallingSettings() {
  return {
    allowToolCalling: false,
    toolCallingMode: 'intent',  // 'off' | 'intent' | 'always'
    toolCallingConfig: {
      maxToolRounds: 3,
      showToolLog: false,
      notionEnabled: true,
      mcpBridgeUrl: 'http://localhost:3099',
      mcpBridgeEnabled: false,
      mcpServers: [],
      mcpDirectServers: []
    }
  }
}
```

**文件**：`src/stores/settingsSchema.js`

在 schema 中增加 `toolCallingMode` 字段定义（字符串枚举），确保迁移/校验兼容。

### 任务 2.2：创建意图匹配模块

**新建文件**：`src/composables/api/tools/selectToolsForIntent.js`

```js
/**
 * 根据用户消息内容，从全量工具列表中筛选出当前意图需要的工具子集。
 * intent 模式下，不命中任何意图则返回空数组，主聊天不带 tools。
 */

const INTENT_RULES = [
  {
    keywords: ['记住', '别忘', '以后记得', '帮我记', 'remember'],
    toolNames: ['add_memory']
  },
  {
    keywords: ['日记', '写日记', '记进日记', '补记日记', 'diary'],
    toolNames: ['write_diary']
  },
  {
    keywords: ['提醒', '日程', '安排', '待办', 'remind', 'schedule', 'todo'],
    toolNames: ['create_event']
  },
  {
    keywords: ['心情', '情绪', '精力', 'mood', 'energy'],
    toolNames: ['update_mood']
  }
]

/**
 * @param {string} userMessage - 用户最后一条消息的文本内容
 * @param {Array<{type:string, function:object}>} allTools - getAvailableTools 返回的全量工具
 * @returns {Array<{type:string, function:object}>} 匹配到的工具子集，最多 5 个
 */
export function selectToolsForIntent(userMessage, allTools) {
  if (!userMessage || !Array.isArray(allTools) || allTools.length === 0) return []

  const text = userMessage.toLowerCase()
  const matchedNames = new Set()

  for (const rule of INTENT_RULES) {
    if (rule.keywords.some(k => text.includes(k))) {
      rule.toolNames.forEach(n => matchedNames.add(n))
    }
  }

  // MCP 工具：只有用户明确提到外部服务关键词时才暴露
  // 如果用户消息中出现 "notion"、"搜文档"、"查工作区" 等，暴露 mcp_notion_ 前缀的工具
  const MCP_INTENT_RULES = [
    { keywords: ['notion', '搜文档', '查文档', '工作区'], prefix: 'mcp_notion_' }
  ]

  const mcpPrefixes = []
  for (const rule of MCP_INTENT_RULES) {
    if (rule.keywords.some(k => text.includes(k))) {
      mcpPrefixes.push(rule.prefix)
    }
  }

  const selected = allTools.filter(t => {
    const name = t.function?.name
    if (!name) return false
    if (matchedNames.has(name)) return true
    if (mcpPrefixes.some(p => name.startsWith(p))) return true
    return false
  })

  return selected.slice(0, 5)
}
```

### 任务 2.3：在 Orchestrator 中集成意图匹配

需要修改三个 orchestrator 文件中的 `toolPreparationPromise` 逻辑：

- `src/composables/api/chat/directChatOrchestrator.js`
- `src/composables/api/chat/groupSingleChatOrchestrator.js`
- `src/composables/api/chat/groupMultiChatOrchestrator.js`

每个文件中找到 `const toolPreparationPromise = settingsStore.allowToolCalling` 这段逻辑，替换为：

```js
const effectiveToolMode = settingsStore.allowToolCalling
  ? (settingsStore.toolCallingMode || 'intent')
  : 'off'

const toolPreparationPromise = effectiveToolMode !== 'off'
  ? (async () => {
      try {
        const { getAvailableTools } = await import('../tools/toolRegistry')
        const mcpDiscovery = typeof discoverMcpTools === 'function'
          ? await discoverMcpTools({ serverIds: selectedMcpServerIds })
          : { tools: [], externalExecutors: null }
        const externalExecutors = mcpDiscovery.externalExecutors || null
        let tools = getAvailableTools(settingsStore, activeChat, mcpDiscovery.tools || [])

        // intent 模式：按用户消息意图裁剪工具
        if (effectiveToolMode === 'intent' && tools.length > 0) {
          const { selectToolsForIntent } = await import('../tools/selectToolsForIntent')
          const lastUserMsg = /* 获取最后一条用户消息文本 */ ''
          // lastUserMsg 的获取方式：
          // directChatOrchestrator 中：从 activeChat.messages 取最后一条 role=user 的 content
          // groupSingleChatOrchestrator 中：同上
          // groupMultiChatOrchestrator 中：同上
          // 具体取法：
          const messages = activeChat?.messages || []
          const lastMsg = [...messages].reverse().find(m => m.role === 'user')
          const lastUserContent = typeof lastMsg?.content === 'string'
            ? lastMsg.content
            : Array.isArray(lastMsg?.content)
              ? lastMsg.content.filter(p => p.type === 'text').map(p => p.text).join(' ')
              : ''
          tools = selectToolsForIntent(lastUserContent, tools)
        }

        if (tools.length === 0) {
          return { tools: null, toolContext: null, externalExecutors }
        }

        const { useMomentsStore } = await import('../../../stores/moments')
        const { useMusicStore } = await import('../../../stores/music')
        const { usePlannerStore } = await import('../../../stores/planner')
        const { useLivenessStore } = await import('../../../stores/liveness')

        return {
          tools,
          externalExecutors,
          toolContext: {
            contactsStore,
            settingsStore,
            momentsStore: useMomentsStore(),
            musicStore: useMusicStore(),
            plannerStore: usePlannerStore(),
            livenessStore: useLivenessStore(),
            activeChat,
            makeMsgId
          }
        }
      } catch (err) {
        console.warn('[ToolCalling] Failed to resolve tools, proceeding without:', err?.message)
        return { tools: null, toolContext: null, externalExecutors: null }
      }
    })()
  : Promise.resolve({ tools: null, toolContext: null, externalExecutors: null })
```

**注意**：三个 orchestrator 的修改几乎相同，只有获取 `activeChat` 的上下文略有不同。

### 任务 2.4：Settings UI 增加模式选择

**文件**：`src/views/settings/SettingsAIFeatures.vue`

在 `allowToolCalling` 开关下方、现有子设置项上方，增加工具调用模式选择（仅在 allowToolCalling 为 true 时显示）：

```html
<!-- 在 allowToolCalling 开关和现有子设置之间插入 -->
<div class="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
  <span class="w-28 text-[16px] text-[var(--text-primary)] shrink-0">调用模式</span>
  <select
    :value="store.toolCallingMode || 'intent'"
    class="flex-1 text-[var(--primary-color)] bg-transparent outline-none text-right"
    @change="handleToolCallingModeChange($event.target.value)"
  >
    <option value="intent">按需（推荐，仅识别到意图时传工具）</option>
    <option value="always">始终（每轮都传全部工具，token 较高）</option>
  </select>
</div>
```

在 `<script setup>` 中增加 handler：

```js
function handleToolCallingModeChange(value) {
  store.toolCallingMode = value
}
```

### 任务 2.5：为 selectToolsForIntent 编写单元测试

**新建文件**：`src/composables/api/tools/selectToolsForIntent.test.js`

测试用例覆盖：

1. 空消息 → 返回 `[]`
2. 普通聊天消息（如"你好"、"今天天气好"）→ 返回 `[]`
3. 包含"记住"的消息 → 返回 `[add_memory]`
4. 包含"写日记"的消息 → 返回 `[write_diary]`
5. 包含"提醒"的消息 → 返回 `[create_event]`
6. 包含多个意图关键词的消息 → 返回多个工具但不超过 5 个
7. 工具列表为空 → 返回 `[]`
8. MCP 意图匹配测试（包含 "notion" → 返回 mcp_notion_ 前缀工具）

---

## 阶段三：toolPromptInjection 联动

**目标**：当 intent 模式下工具被裁剪为空时，`toolPromptInjection` 也不注入，彻底清零工具相关 token。

### 任务 3.1：确认 toolPromptInjection 自动联动

**文件**：`src/composables/api/tools/toolPromptInjection.js`

当前 `buildToolCallingPrompt(tools)` 已经在 `tools` 为空数组或 null 时返回空字符串（第 15 行），无需修改。

只需确认上游传入的 `tools` 在 intent 模式裁剪后正确传递：

**文件**：`src/composables/api/requestPlan.js`（约第 66 行）

确认 `buildToolCallingPrompt(tools)` 接收的 `tools` 参数来自 orchestrator 最终决定的工具列表（经过 intent 裁剪后的），而不是 `getAvailableTools` 的全量结果。当前代码结构看起来已经是这样（tools 从 orchestrator → requestPlan → buildToolCallingPrompt 一路传递），但需要跟踪确认数据流。

---

## 验收标准

1. **空白人设、普通聊天、allowToolCalling=true、toolCallingMode=intent**：输入 token ≤ 3k
2. **allowToolCalling=true、toolCallingMode=intent、消息不含意图关键词**：请求 payload 中 `tools` 为 null/undefined，不携带任何工具 schema
3. **消息包含"记住xxx"**：仅携带 `add_memory` 一个工具
4. **联系人 mcpServerIds 留空**：不发现任何 MCP 工具
5. **联系人 mcpServerIds 配了具体服务器**：只发现对应服务器的工具
6. **toolCallingMode=always**：行为与修改前完全一致（兼容）
7. **所有现有测试通过**（`npm test`）
8. **新增 selectToolsForIntent 测试全部通过**
9. **UI 文案正确显示"模型工具调用"和"不使用 MCP"**

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/utils/mcpServers.js` | 修改 3 个 resolve 函数 + describeMcpServerSelection 文案 |
| `src/composables/useMcpBridge.js` | 确保空数组 serverIds 跳过发现 |
| `src/composables/api/tools/toolRegistry.js` | 增加 MAX_TOOLS 截断 |
| `src/composables/api/tools/selectToolsForIntent.js` | 新建 |
| `src/composables/api/tools/selectToolsForIntent.test.js` | 新建 |
| `src/composables/api/chat/directChatOrchestrator.js` | 集成 toolCallingMode + intent 裁剪 |
| `src/composables/api/chat/groupSingleChatOrchestrator.js` | 同上 |
| `src/composables/api/chat/groupMultiChatOrchestrator.js` | 同上 |
| `src/stores/settingsDefaults.js` | 新增 toolCallingMode 默认值 |
| `src/stores/settingsSchema.js` | 新增 toolCallingMode schema |
| `src/views/settings/SettingsAIFeatures.vue` | 修改文案 + 新增模式选择 UI |
| 相关测试文件 | 更新 resolve 函数返回值断言 |

## 执行顺序

严格按阶段顺序执行：先完成阶段一全部任务并通过测试，再进入阶段二。阶段三是验证性质，改动最小。每个阶段完成后运行 `npm test` 确认无回归。
