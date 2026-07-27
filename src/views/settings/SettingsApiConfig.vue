<template>
  <div class="space-y-6">
    <section class="space-y-2">
      <span class="ml-4 text-[13px] uppercase text-[var(--text-secondary)]">API 配置</span>
      <div class="overflow-hidden rounded-[10px] bg-[var(--card-bg)]">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <span class="text-[17px] text-[var(--text-primary)]">当前配置</span>
          <select v-model="store.activeConfigId" class="min-w-0 max-w-[180px] bg-transparent text-right text-[17px] text-[var(--primary-color)] outline-none" @change="loadConfigInputs">
            <option v-for="c in store.configs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <button type="button" class="flex w-full items-center justify-center py-3 text-[var(--primary-color)] active:bg-gray-100 dark:active:bg-[#2c2c2e]" @click="addConfig">
          <i class="ph ph-plus mr-1"></i>新增配置
        </button>
      </div>
    </section>

    <section class="space-y-2">
      <div class="flex items-end justify-between px-4">
        <span class="text-[13px] uppercase text-[var(--text-secondary)]">基础信息</span>
        <button type="button" class="text-[13px] text-red-500" @click="deleteConfig">删除</button>
      </div>
      <div class="overflow-hidden rounded-[10px] bg-[var(--card-bg)]">
        <div class="flex items-center border-b border-[var(--border-color)] px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">名称</span>
          <input v-model="configForm.name" type="text" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--text-primary)] outline-none" placeholder="配置名称">
        </div>
        <div class="flex items-center border-b border-[var(--border-color)] px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">Base URL</span>
          <input v-model="configForm.url" type="url" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--text-primary)] outline-none" placeholder="https://api.openai.com/v1">
        </div>
        <div class="flex items-center border-b border-[var(--border-color)] px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">API Key</span>
          <input v-model="configForm.key" type="password" autocomplete="off" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--text-primary)] outline-none" placeholder="sk-...">
        </div>
        <div class="flex items-center border-b border-[var(--border-color)] px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">接口格式</span>
          <select v-model="configForm.apiFormat" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--primary-color)] outline-none">
            <option value="openai-compatible">OpenAI 兼容</option>
            <option value="openai-responses">OpenAI Responses</option>
            <option value="anthropic-messages">Anthropic Messages</option>
            <option value="gemini-generate-content">Gemini GenerateContent</option>
          </select>
        </div>
        <div class="flex items-center gap-3 px-4 py-3" :class="modelList.length > 0 ? 'border-b border-[var(--border-color)]' : ''">
          <div class="flex shrink-0 items-center">
            <span class="text-[17px] text-[var(--text-primary)]">模型</span>
            <button type="button" class="ml-2 text-sm text-[var(--primary-color)]" :disabled="modelLoading" @click="handleFetchModels">
              {{ modelLoading ? '获取中…' : '获取列表' }}
            </button>
          </div>
          <input v-model="configForm.model" type="text" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--primary-color)] outline-none" placeholder="输入或选择模型 ID">
        </div>
        <div v-if="modelList.length > 0" class="flex items-center gap-3 px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">从列表选择</span>
          <select
            :value="modelList.includes(configForm.model) ? configForm.model : ''"
            class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--primary-color)] outline-none"
            @change="configForm.model = $event.target.value"
          >
            <option value="" disabled>共 {{ modelList.length }} 个模型</option>
            <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
      </div>
    </section>

    <section class="space-y-2">
      <span class="ml-4 text-[13px] uppercase text-[var(--text-secondary)]">生成设置</span>
      <div class="overflow-hidden rounded-[10px] bg-[var(--card-bg)]">
        <div class="flex items-center border-b border-[var(--border-color)] px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">温度</span>
          <input v-if="temperatureAvailable" v-model="configForm.temperature" type="number" step="0.1" min="0" max="2" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--text-primary)] outline-none" placeholder="模型默认">
          <span v-else class="min-w-0 flex-1 text-right text-[15px] text-[var(--text-secondary)]">自动使用模型默认值</span>
        </div>
        <div class="flex items-center px-4 py-3" :class="isOpenAIFormat ? 'border-b border-[var(--border-color)]' : ''">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">输出上限</span>
          <input v-model="configForm.maxTokens" type="number" min="1" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--text-primary)] outline-none" placeholder="模型默认">
        </div>
        <div v-if="isOpenAIFormat" class="flex items-center px-4 py-3">
          <span class="w-24 shrink-0 text-[17px] text-[var(--text-primary)]">思考深度</span>
          <select v-model="configForm.reasoningEffort" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--primary-color)] outline-none">
            <option value="">模型默认</option>
            <option value="minimal">最少</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </div>
      </div>
      <p v-if="compatibilityNotice" class="px-4 text-[12px] leading-5 text-[var(--text-secondary)]">
        <i class="ph ph-magic-wand mr-1"></i>{{ compatibilityNotice }}
      </p>
      <p v-else class="px-4 text-[12px] text-[var(--text-secondary)]">留空时使用模型或服务商默认值。</p>
    </section>

    <section v-if="isAnthropicFormat" class="space-y-2">
      <span class="ml-4 text-[13px] uppercase text-[var(--text-secondary)]">Claude 提示词缓存</span>
      <div class="overflow-hidden rounded-[10px] bg-[var(--card-bg)]">
        <label class="flex items-center justify-between px-4 py-3" :class="configForm.cacheEnabled ? 'border-b border-[var(--border-color)]' : ''">
          <span class="text-[17px] text-[var(--text-primary)]">缓存系统提示词</span>
          <input v-model="configForm.cacheEnabled" type="checkbox" class="h-5 w-5 accent-[var(--primary-color)]">
        </label>
        <div v-if="configForm.cacheEnabled" class="flex items-center px-4 py-3">
          <span class="w-28 shrink-0 text-[17px] text-[var(--text-primary)]">缓存时长</span>
          <select v-model="configForm.cacheTtl" class="min-w-0 flex-1 bg-transparent text-right text-[17px] text-[var(--primary-color)] outline-none">
            <option value="5m">5 分钟（连续聊天）</option>
            <option value="1h">1 小时（长时间会话）</option>
          </select>
        </div>
      </div>
      <p class="px-4 text-[12px] leading-5 text-[var(--text-secondary)]">启用后会标记系统提示词；是否实际命中由服务商按模型最低长度判断。1 小时缓存的写入成本通常更高。</p>
    </section>

    <section class="space-y-2">
      <div class="overflow-hidden rounded-[10px] bg-[var(--card-bg)]">
        <button type="button" class="flex w-full items-center justify-between px-4 py-3 text-left outline-none" :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">
          <span class="text-[17px] text-[var(--text-primary)]">高级选项</span>
          <span class="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            <span v-if="advancedConfigured">已自定义</span>
            <i class="ph" :class="advancedOpen ? 'ph-caret-up' : 'ph-caret-down'"></i>
          </span>
        </button>

        <template v-if="advancedOpen">
          <label class="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-3">
            <span class="text-[17px] text-[var(--text-primary)]">自动适配模型参数</span>
            <input v-model="configForm.autoAdaptParameters" type="checkbox" class="h-5 w-5 accent-[var(--primary-color)]">
          </label>
          <p class="border-t border-[var(--border-color)] px-4 py-3 text-[12px] leading-5 text-[var(--text-secondary)]">自动去除 Claude Opus 4.7+、Claude 5 系列 / latest 和常见推理模型不支持的采样参数。遇到特殊中转兼容需求时可关闭。</p>

          <div class="border-t border-[var(--border-color)] px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[17px] text-[var(--text-primary)]">附加参数</span>
              <span class="text-[12px] text-[var(--text-secondary)]">JSON</span>
            </div>
            <textarea v-model="configForm.customBodyJson" rows="3" class="mt-2 w-full resize-none bg-transparent font-mono text-[14px] leading-5 text-[var(--text-primary)] outline-none" :placeholder="customBodyPlaceholder"></textarea>
            <p class="mt-1 text-[12px] text-[var(--text-secondary)]">会与基础请求深度合并，同名字段以这里为准。</p>
          </div>

          <div class="border-t border-[var(--border-color)] px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[17px] text-[var(--text-primary)]">去除参数</span>
              <span class="text-[12px] text-[var(--text-secondary)]">逗号分隔</span>
            </div>
            <textarea v-model="configForm.removeBodyParamsText" rows="2" class="mt-2 w-full resize-none bg-transparent font-mono text-[14px] leading-5 text-[var(--text-primary)] outline-none" :placeholder="removeParamsPlaceholder"></textarea>
            <p class="mt-1 text-[12px] text-[var(--text-secondary)]">支持点号路径，例如 generationConfig.temperature。</p>
          </div>

          <div class="border-t border-[var(--border-color)] px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[17px] text-[var(--text-primary)]">自定义 Headers</span>
              <span class="text-[12px] text-[var(--text-secondary)]">JSON</span>
            </div>
            <textarea v-model="configForm.customHeadersJson" rows="3" class="mt-2 w-full resize-none bg-transparent font-mono text-[14px] leading-5 text-[var(--text-primary)] outline-none" placeholder='{"HTTP-Referer":"https://example.com"}'></textarea>
            <p class="mt-1 text-[12px] text-[var(--text-secondary)]">同名请求头会覆盖系统默认值。</p>
          </div>
        </template>
      </div>
    </section>

    <div class="px-4">
      <button type="button" class="w-full rounded-[10px] bg-[var(--primary-color)] py-3 text-[17px] font-semibold text-white" @click="saveConfig">保存配置</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useConfigsStore } from '../../stores/configs'
import { useStorage } from '../../composables/useStorage'
import { useApi } from '../../composables/useApi'
import { useToast } from '../../composables/useToast'
import { showConfirm } from '../../composables/useConfirm'
import { getModelParameterCompatibility } from '../../composables/api/modelParameterCompatibility'
import { useApiConfigForm } from './composables/useApiConfigForm'

const store = useConfigsStore()
const { scheduleSave } = useStorage()
const { fetchModels } = useApi()
const { showToast } = useToast()
const advancedOpen = ref(false)
const {
  addConfig,
  configForm,
  deleteConfig,
  handleFetchModels,
  loadConfigInputs,
  modelList,
  modelLoading,
  saveConfig
} = useApiConfigForm({ fetchModels, scheduleSave, showConfirm, showToast, store })

const isOpenAIFormat = computed(() =>
  configForm.apiFormat === 'openai-compatible' || configForm.apiFormat === 'openai-responses'
)
const isAnthropicFormat = computed(() => configForm.apiFormat === 'anthropic-messages')
const modelCompatibility = computed(() => getModelParameterCompatibility(configForm.model))
const temperatureAvailable = computed(() =>
  !configForm.autoAdaptParameters || modelCompatibility.value.temperatureSupported
)
const compatibilityNotice = computed(() => {
  if (!modelCompatibility.value.description) return ''
  if (configForm.autoAdaptParameters) return `${modelCompatibility.value.description}，已自动使用模型默认值`
  return `${modelCompatibility.value.description}；当前已关闭自动适配，请留意请求失败风险`
})
const advancedConfigured = computed(() =>
  !configForm.autoAdaptParameters ||
  !!configForm.customHeadersJson.trim() ||
  !!configForm.customBodyJson.trim() ||
  !!configForm.removeBodyParamsText.trim()
)

const customBodyPlaceholder = computed(() => {
  if (configForm.apiFormat === 'anthropic-messages') return '{"stop_sequences":["END"]}'
  if (configForm.apiFormat === 'gemini-generate-content') return '{"generationConfig":{"topP":0.9}}'
  return '{"top_p":0.9}'
})

const removeParamsPlaceholder = computed(() => {
  if (configForm.apiFormat === 'gemini-generate-content') return 'generationConfig.temperature, generationConfig.topP'
  return 'temperature, top_p'
})

defineExpose({ saveConfig })
</script>

