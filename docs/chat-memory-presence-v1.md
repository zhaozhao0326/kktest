# Chat Memory Presence V1

## Goal

本次改造的目标不是把聊天系统做成剧情状态机，而是让聊天里的记忆更像“活人会自然想起来的事”。

V1 聚焦三件事：

1. 核心记忆从“只看 enabled + priority”升级为“按相关性选择注入”。
2. AI 自动提取的记忆从“一次提取后长期堆积”升级为“带置信度生命周期”。
3. 核心记忆增加轻量实体字段，优先围绕人/宠物/地点等被反复提到的对象触发。

本次不做：

1. 通用变量系统。
2. 完整实体图谱。
3. 独立反思层。

这些更适合后续 Phase 2/3。

## Current Problems

现状已经有以下能力：

1. 核心记忆。
2. 短期/长期总结。
3. 中间上下文摘要。
4. 历史检索和向量检索。
5. 记忆管家。

真正的问题集中在核心记忆层：

1. `buildMemoryPrompt()` 对 `enabled=true` 的核心记忆仍偏静态，主要靠优先级和 token 裁剪。
2. 自动提取虽然产出 `confidence`，但除了 `high -> auto enable` 外，生命周期没有继续利用。
3. 记忆只按分类管理，没有轻量实体字段，导致“围绕同一个人/宠物/地点的记忆”难以定向召回。
4. UI 仍把启用中的记忆表述成“会注入提示词”，但改造后它更准确的含义应是“参与按相关性选择”。

## Design Principles

### 1. 小而准优先于大而全

活人感的核心不是记得更多，而是记得更对。

每轮真正应该进入提示词的核心记忆，通常只需要：

1. 关系与稳定基线 1 到 3 条。
2. 当前话题强相关 1 到 4 条。

### 2. 用户显式确认高于 AI 推断

人工添加、关键词触发、用户手动启用 AI 候选，置信度都视为更高。

### 3. 过期作用于“候选记忆”，不作用于“已确认档案”

低置信 AI 候选如果长期未被再次提取或被用户确认，应自动淡出并删除。
已经被用户确认或高置信的记忆不走自动删除。

### 4. 实体字段先轻量化

先做 `entity` / `entityType`，不引入图结构，不做独立实体仓库。

## Data Model

本次扩展的是 `contact.memory.core[]` 中的单条核心记忆。

### New Fields

```js
{
  id: 'mem_xxx',
  content: '{{user}}的大学同学小明在北京工作',
  time: 1710000000000,
  source: 'manual|keyword|extracted|promoted|manager',
  enabled: true,
  priority: 'high|normal|low',
  category: 'preference|relationship|emotion|fact|routine|people|other|null',

  confidence: 'high|medium|low',
  entity: '小明',
  entityType: 'person|pet|place|organization|topic|other|null',

  extractionCount: 2,
  expiresAt: 1710600000000,
  lastConfirmedAt: 1710000000000,

  recallCount: 3,
  lastRecalledAt: 1710200000000
}
```

### Field Semantics

1. `confidence`
   用于决定是否自动启用、是否过期、注入评分权重。

2. `entity`
   该条记忆围绕的核心对象。只保存一个主实体，保持简单。

3. `entityType`
   当前仅用于注入加权和后续扩展，不直接暴露复杂逻辑。

4. `extractionCount`
   同类信息被 AI 再次提取到的次数。用于置信度升级。

5. `expiresAt`
   仅对低置信、未确认的候选记忆生效。

6. `lastConfirmedAt`
   用户手动添加、关键词触发、手动启用 AI 候选、手动编辑 AI 候选，都会刷新。

7. `recallCount` / `lastRecalledAt`
   记录该记忆被真正选入提示词的次数和最近时间，用于后续 temporal recall 权重。

## Confidence Lifecycle

### Default Confidence by Source

1. `manual` -> `high`
2. `keyword` -> `high`
3. `promoted` -> `high`
4. `manager` -> `high`
5. `extracted` -> 来自提取结果，缺省按 `medium`

### Auto Extraction Rules

#### High

1. 自动启用。
2. 不设置过期时间。
3. `lastConfirmedAt = now`

#### Medium

1. 默认写入“启用中/待整理”的规则仍由 `enabled` 决定。
2. 不自动过期。
3. 如果同一信息再次被提取，`extractionCount >= 2` 时提升为 `high`。
4. 提升到 `high` 时，如果仍属于 AI 候选且未被用户手动关闭，则自动启用。

#### Low

1. 默认不自动启用。
2. 写入 `expiresAt = now + 7 days`。
3. 如果重复提取达到 `extractionCount >= 2`，提升为 `medium` 并取消过期时间。
4. 超过 `expiresAt` 且仍未被确认时，自动清理。

### Manual Confirmation Rules

以下操作视为用户确认：

1. 手动新增记忆。
2. 关键词触发写入。
3. 用户把 `extracted` 候选手动启用。
4. 用户编辑 `extracted` 候选。

确认后：

1. `source` 变为 `promoted`。
2. `confidence = high`
3. `expiresAt = null`
4. `lastConfirmedAt = now`

## Entity Lite

### Extraction Contract

自动提取 prompt 在原有字段上新增可选输出：

```json
[
  {
    "content": "{{user}}的大学同学小明在北京工作",
    "priority": "normal",
    "category": "people",
    "confidence": "high",
    "entity": "小明",
    "entityType": "person"
  }
]
```

### Constraints

1. `entity` 只保存单个主实体。
2. 没有明确主实体时允许为空。
3. `entityType` 只接受：
   `person|pet|place|organization|topic|other`

### Usage

当前阶段只用于注入评分：

1. 最近消息命中同名实体时大幅加分。
2. `people` 类记忆在对应实体出现时更容易进入提示词。

## Smart Injection

### Selection Strategy

注入不再是“所有 enabled 记忆按优先级排序后直接裁剪”，而是：

1. 先选稳定基线。
2. 再选当前话题相关。
3. 最后再拼摘要索引和最近总结。

### Stable Memory Set

以下记忆视为稳定基线候选：

1. `priority === high`
2. `category === relationship`

稳定基线最多取 3 条。

### Relevance Scoring

对其余启用中的记忆计算综合分数：

```txt
score =
  priorityWeight
  + categoryBonus
  + confidenceBonus
  + sourceBonus
  + entityMatchBonus
  + lexicalOverlapBonus
  + recencyBonus
  + recallBonus
  - stalePenalty
```

#### Priority Weight

1. `high = 120`
2. `normal = 70`
3. `low = 35`

#### Category Bonus

1. `relationship = +18`
2. `people = +10`
3. 其他 `+0`

#### Confidence Bonus

1. `high = +18`
2. `medium = +8`
3. `low = -8`

#### Source Bonus

1. `manual = +10`
2. `keyword = +8`
3. `promoted = +8`
4. `manager = +6`
5. `extracted = +0`

#### Entity Match Bonus

最近消息命中 `memory.entity` 时：

1. 最近一条用户消息命中：`+42`
2. 最近对话窗口命中：`+24`

#### Lexical Overlap Bonus

基于最近用户消息和最近若干条消息，和 `memory.content` 做轻量词项重合计算：

1. 最近用户消息重合：最高 `+36`
2. 最近窗口重合：最高 `+18`

#### Recency Bonus

取 `lastConfirmedAt || time`：

1. 7 天内：`+12`
2. 30 天内：`+7`
3. 90 天内：`+3`
4. 超过 180 天且低置信：附加 `-10`

#### Recall Bonus

取 `lastRecalledAt`：

1. 7 天内：`+8`
2. 30 天内：`+4`

#### Stale Penalty

1. 已过期候选：直接过滤。
2. 低置信且长期未确认：`-12`

### Prompt Composition

最终注入结构：

1. `[关系与稳定设定]`
2. `[当前相关记忆]`
3. `[记忆摘要索引]`
4. `[之前聊过的]`

规则：

1. 稳定基线最多 3 条。
2. 相关记忆最多 4 条。
3. 所有部分最后统一受 `maxInjectTokens` 限制。
4. 被选中的核心记忆会刷新：
   `recallCount += 1`
   `lastRecalledAt = now`

## Migration Strategy

不做单独版本迁移，沿用现有惰性初始化。

在 `initContactMemory()` 中补齐缺失字段：

1. 缺失 `confidence` 时按 `source` 回填默认值。
2. 缺失 `entity` / `entityType` 时置空。
3. 缺失 `extractionCount` 时：
   `extracted = 1`
   其他 = `0`
4. 缺失 `expiresAt` 时不追溯补旧过期时间，避免旧数据被批量误删。
5. 缺失 `lastConfirmedAt` 时：
   高置信记忆回填为 `time`
   其他为空。
6. 缺失 `recallCount` / `lastRecalledAt` 时回填为 `0 / null`

## UI Changes

### Memory Panel

原“注入中”改为“启用中”。

新文案：

1. 启用中：会参与按相关性选择，不代表每轮都注入。
2. 已停用：不会参与记忆注入。

### Memory Entry

核心记忆条目增加置信度标签：

1. 高置信
2. 中置信
3. 低置信

### Memory Settings

相关文案同步：

1. 记忆系统说明改为“按相关性注入”。
2. AI 自动记忆说明补充“低置信候选会自动过期”。
3. 注入上限说明补充“系统会先按相关性选择”。

## Files

### Main Logic

1. `src/composables/memory/shared.js`
2. `src/composables/memory/coreMemory.js`
3. `src/composables/memory/extraction.js`
4. `src/composables/memory/injection.js`
5. `src/composables/useMemory.js`

### UI

1. `src/features/memory/MemoryPanel.vue`
2. `src/features/memory/MemorySettings.vue`
3. `src/features/memory/MemoryEntry.vue`

### Tests

1. `src/composables/memory/injection.test.js`
2. `src/composables/memory/extraction.test.js`

## Acceptance Criteria

### Functional

1. 高优先级和关系类记忆可以稳定保留。
2. 当前话题相关的记忆优先进入提示词。
3. 无关但已启用的记忆不再频繁占用 token。
4. 低置信 AI 候选会过期。
5. 中低置信信息在重复提取后会升级。
6. 命中实体时，对应人物/宠物/地点记忆更容易注入。

### UX

1. 面板文案与实际行为一致。
2. AI 候选的可信度在面板中可见。

### Safety

1. 不自动删除手动记忆。
2. 不对旧数据追溯性设置过期时间。
3. 过期只影响低置信未确认候选。

## Future Work

1. 把 `relationship state` 从核心记忆中拆出成独立轻量层。
2. 引入 `relatedIds` 做弱关联。
3. 在高置信记忆基础上生成保守的 reflection 条目。
4. 视需要再引入聊天层变量系统。
