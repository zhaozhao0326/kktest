<template>
  <div class="vn-theme-page absolute inset-0 z-20 bg-[#f8fafc] flex flex-col">
    <!-- Header -->
    <header
      class="vn-theme-header bg-white/80 backdrop-blur-xl px-5 flex items-center gap-3 border-b border-gray-100"
      :style="{ paddingTop: 'var(--app-pt-lg, 48px)', paddingBottom: '12px' }"
    >
      <button @click="router.back()" class="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 bg-gray-50 active:scale-90 transition-transform">
        <i class="ph-bold ph-caret-left"></i>
      </button>
      <h1 class="text-xl font-black text-gray-900">画笔配置</h1>
    </header>

    <main class="flex-1 overflow-y-auto p-5 space-y-6 pb-24 no-scrollbar">
      <!-- Provider selector -->
      <div class="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl">
        <button
          v-for="p in providers" :key="p.id"
          @click="vnStore.imageGenConfig.provider = p.id"
          class="py-2.5 text-[12px] font-bold rounded-xl transition-all"
          :class="vnStore.imageGenConfig.provider === p.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'"
        >
          {{ p.name }}
        </button>
      </div>

      <!-- Strategy toggle -->
      <div class="bg-white border border-gray-100 rounded-[24px] p-5 flex items-center justify-between">
        <div>
          <div class="text-gray-800 text-[14px] font-bold">生成策略</div>
          <div class="text-gray-400 text-[10px] mt-0.5 uppercase tracking-tight">表情差分生成方式</div>
        </div>
        <div class="flex bg-gray-100 rounded-xl p-1">
          <button
            @click="vnStore.imageGenConfig.spriteStrategy = 'full'"
            class="px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all"
            :class="vnStore.imageGenConfig.spriteStrategy === 'full' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400'"
          >
            直接生成
          </button>
          <button
            @click="vnStore.imageGenConfig.spriteStrategy = 'img2img'"
            class="px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all"
            :class="vnStore.imageGenConfig.spriteStrategy === 'img2img' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400'"
          >
            重绘
          </button>
        </div>
      </div>

      <div class="bg-white border border-gray-100 rounded-[24px] p-5 flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <div class="text-gray-800 text-[14px] font-bold">请求超时</div>
          <div class="text-gray-400 text-[10px] mt-0.5 uppercase tracking-tight">单次请求最长等待时间</div>
        </div>
        <div class="w-28 shrink-0">
          <input
            v-model.number="imageRequestTimeoutSeconds"
            type="number"
            min="10"
            max="600"
            step="10"
            class="vn-cfg-input text-center"
            @blur="normalizeImageRequestTimeoutInput"
          />
          <div class="text-center text-[10px] text-gray-400 mt-1">秒</div>
        </div>
      </div>

      <!-- Provider config -->
      <transition name="fade" mode="out-in">
        <div :key="vnStore.imageGenConfig.provider" class="space-y-4">

          <!-- GPT Image / OpenAI Images compatible -->
          <template v-if="vnStore.imageGenConfig.provider === 'openai_images'">
            <div class="vn-cfg-card space-y-4">
              <div class="vn-cfg-group">
                <label>API Key</label>
                <input v-model="vnStore.imageGenConfig.openaiImages.apiKey" type="password" placeholder="sk-..." class="vn-cfg-input" />
              </div>

              <div class="vn-cfg-group">
                <label>自定义 URL / Base URL</label>
                <input
                  v-model="vnStore.imageGenConfig.openaiImages.endpoint"
                  placeholder="https://openrouter.ai/api/v1 或 https://your-api/v1"
                  class="vn-cfg-input"
                />
              </div>

              <div class="vn-cfg-group">
                <label>模型 ID</label>
                <input v-model="vnStore.imageGenConfig.openaiImages.model" placeholder="gpt-image2 或服务商模型 ID" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>提示词风格</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.openaiImages.promptStyle" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="item in imagePromptStyleOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
            </div>

            <div class="vn-cfg-card grid grid-cols-2 gap-4">
              <div class="vn-cfg-group">
                <label>尺寸</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.openaiImages.size" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="item in openaiImageSizes" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <div class="vn-cfg-group">
                <label>质量</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.openaiImages.quality" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="item in openaiImageQualities" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <template v-if="vnStore.imageGenConfig.openaiImages.size === 'custom'">
                <div class="vn-cfg-group">
                  <label>宽度</label>
                  <input v-model.number="vnStore.imageGenConfig.openaiImages.customWidth" type="number" step="64" min="64" max="8192" class="vn-cfg-input" />
                </div>
                <div class="vn-cfg-group">
                  <label>高度</label>
                  <input v-model.number="vnStore.imageGenConfig.openaiImages.customHeight" type="number" step="64" min="64" max="8192" class="vn-cfg-input" />
                </div>
              </template>
              <div class="vn-cfg-group">
                <label>输出格式</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.openaiImages.outputFormat" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="item in openaiOutputFormats" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <div class="vn-cfg-group">
                <label>背景</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.openaiImages.background" class="vn-cfg-input appearance-none pr-10">
                    <option value="auto">自动</option>
                    <option value="opaque">不透明</option>
                    <option value="transparent">透明</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
            </div>

            <div class="vn-cfg-card space-y-1">
              <div class="flex items-center justify-between py-3">
                <div class="min-w-0 pr-4">
                  <div class="text-[13px] font-bold text-gray-700">允许任意宽高</div>
                </div>
                <button class="vn-toggle" :class="{ active: vnStore.imageGenConfig.openaiImages.allowCustomSize }" @click="vnStore.imageGenConfig.openaiImages.allowCustomSize = !vnStore.imageGenConfig.openaiImages.allowCustomSize">
                  <div class="vn-toggle-dot"></div>
                </button>
              </div>
            </div>

            <details class="vn-cfg-card">
              <summary class="vn-cfg-summary">
                <span>高级连接设置</span>
                <i class="ph ph-caret-down"></i>
              </summary>
              <div class="pt-4 space-y-4">
                <div class="vn-cfg-group">
                  <label>接口格式</label>
                  <div class="relative">
                    <select v-model="vnStore.imageGenConfig.openaiImages.apiMode" class="vn-cfg-input appearance-none pr-10">
                      <option v-for="item in openaiApiModes" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                    <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                  </div>
                  <p class="vn-cfg-help">NewAPI 转发 OpenRouter 时建议选 Chat Completions；只有服务商明确支持 /v1/images/generations 时选 Images API。</p>
                </div>
                <div class="vn-cfg-group">
                  <label>鉴权方式</label>
                  <div class="relative">
                    <select v-model="vnStore.imageGenConfig.openaiImages.apiKeyMode" class="vn-cfg-input appearance-none pr-10">
                      <option v-for="item in openaiApiKeyModes" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                    <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                  </div>
                </div>
                <div class="vn-cfg-group">
                  <label>附加参数</label>
                  <textarea
                    v-model="vnStore.imageGenConfig.openaiImages.extraBody"
                    rows="4"
                    placeholder='{"modalities":["image","text"]}'
                    class="vn-cfg-input resize-none font-mono text-[12px]"
                  ></textarea>
                </div>
              </div>
            </details>
          </template>

          <!-- NovelAI -->
          <template v-else-if="vnStore.imageGenConfig.provider === 'novelai'">
            <div class="vn-cfg-card">
              <div class="vn-cfg-group">
                <label>API KEY</label>
                <input v-model="vnStore.imageGenConfig.novelai.apiKey" type="password" placeholder="pst-..." class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>模型</label>
                <input v-model="vnStore.imageGenConfig.novelai.model" placeholder="nai-diffusion-4-5-full" class="vn-cfg-input" />
              </div>
            </div>

            <div class="vn-cfg-card grid grid-cols-2 gap-4">
              <div class="vn-cfg-group">
                <label>采样步数</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.steps" type="number" min="1" max="60" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>引导比例</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.scale" type="number" step="0.5" min="0" max="50" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>宽度</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.width" type="number" step="64" min="64" max="4096" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>高度</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.height" type="number" step="64" min="64" max="4096" class="vn-cfg-input" />
              </div>
            </div>

            <div class="vn-cfg-card space-y-4">
              <div class="vn-cfg-group">
                <label>采样器</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.novelai.sampler" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="s in samplers" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <div class="vn-cfg-group">
                <label>反向预设</label>
                <div class="relative">
                  <select v-model.number="vnStore.imageGenConfig.novelai.ucPreset" class="vn-cfg-input appearance-none pr-10">
                    <option :value="4">Heavy (重度)</option>
                    <option :value="5">Light (轻度)</option>
                    <option :value="6">Human Focus (人像)</option>
                    <option :value="3">None (无)</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <div class="vn-cfg-group">
                <label>负面提示词</label>
                <textarea v-model="vnStore.imageGenConfig.novelai.negative_prompt" rows="3" class="vn-cfg-input resize-none"></textarea>
              </div>
            </div>

            <div class="vn-cfg-card space-y-1">
              <div class="flex items-center justify-between py-3">
                <span class="text-[13px] font-medium text-gray-700">SMEA</span>
                <button class="vn-toggle" :class="{ active: vnStore.imageGenConfig.novelai.sm }" @click="vnStore.imageGenConfig.novelai.sm = !vnStore.imageGenConfig.novelai.sm">
                  <div class="vn-toggle-dot"></div>
                </button>
              </div>
              <div class="flex items-center justify-between py-3 border-t border-gray-100">
                <span class="text-[13px] font-medium text-gray-700">Dynamic SMEA</span>
                <button class="vn-toggle" :class="{ active: vnStore.imageGenConfig.novelai.sm_dyn }" @click="vnStore.imageGenConfig.novelai.sm_dyn = !vnStore.imageGenConfig.novelai.sm_dyn">
                  <div class="vn-toggle-dot"></div>
                </button>
              </div>
              <div class="flex items-center justify-between py-3 border-t border-gray-100">
                <span class="text-[13px] font-medium text-gray-700">自动添加质量词</span>
                <button class="vn-toggle" :class="{ active: vnStore.imageGenConfig.novelai.qualityToggle }" @click="vnStore.imageGenConfig.novelai.qualityToggle = !vnStore.imageGenConfig.novelai.qualityToggle">
                  <div class="vn-toggle-dot"></div>
                </button>
              </div>
            </div>

            <div class="vn-cfg-card grid grid-cols-2 gap-4">
              <div class="vn-cfg-group">
                <label>CFG Rescale</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.cfg_rescale" type="number" step="0.1" min="0" max="1" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>Uncond Scale</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.uncond_scale" type="number" step="0.5" min="0" max="10" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>重绘强度</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.strength" type="number" step="0.05" min="0" max="1" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>重绘噪声</label>
                <input v-model.number="vnStore.imageGenConfig.novelai.noise" type="number" step="0.05" min="0" max="1" class="vn-cfg-input" />
              </div>
            </div>
          </template>

          <!-- NanoBanana (Gemini) -->
          <template v-else-if="vnStore.imageGenConfig.provider === 'nanobanana'">
            <div class="vn-cfg-card space-y-4">
              <div class="vn-cfg-group">
                <label>连接方式</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.nanobanana.apiMode" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="item in nanobananaApiModes" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
            </div>

            <div class="vn-cfg-card space-y-4">
              <div class="vn-cfg-group">
                <label>API Key</label>
                <input v-model="vnStore.imageGenConfig.nanobanana.apiKey" type="password" placeholder="留空则不发送鉴权" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>接口地址</label>
                <input
                  v-model="vnStore.imageGenConfig.nanobanana.endpoint"
                  :placeholder="vnStore.imageGenConfig.nanobanana.apiMode === 'gemini'
                    ? 'https://generativelanguage.googleapis.com/v1beta'
                    : 'https://your-api/v1'"
                  class="vn-cfg-input"
                />
              </div>
              <div class="vn-cfg-group">
                <label>模型</label>
                <input v-model="vnStore.imageGenConfig.nanobanana.model" placeholder="gemini-2.5-flash-image" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>提示词风格</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.nanobanana.promptStyle" class="vn-cfg-input appearance-none pr-10">
                    <option v-for="item in imagePromptStyleOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
            </div>

            <div class="vn-cfg-card grid grid-cols-2 gap-4">
              <div class="vn-cfg-group">
                <label>比例</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.nanobanana.aspectRatio" class="vn-cfg-input appearance-none pr-10">
                    <option value="">自动（按宽高推断）</option>
                    <option v-for="ratio in nanobananaAspectRatios" :key="ratio" :value="ratio">{{ ratio }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <div class="vn-cfg-group">
                <label>图片尺寸</label>
                <div class="relative">
                  <select v-model="vnStore.imageGenConfig.nanobanana.imageSize" class="vn-cfg-input appearance-none pr-10">
                    <option value="">自动</option>
                    <option v-for="size in nanobananaImageSizes" :key="size" :value="size">{{ size }}</option>
                  </select>
                  <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>
              <div class="vn-cfg-group">
                <label>尺寸</label>
                <input v-model="vnStore.imageGenConfig.nanobanana.openaiSize" placeholder="1024x1024" class="vn-cfg-input" />
              </div>
              <div class="vn-cfg-group">
                <label>温度</label>
                <input v-model.number="vnStore.imageGenConfig.nanobanana.temperature" type="number" step="0.1" min="0" max="2" class="vn-cfg-input" />
              </div>
            </div>

            <div v-if="vnStore.imageGenConfig.nanobanana.apiMode === 'openai_chat'" class="vn-cfg-card space-y-3">
              <div class="vn-cfg-group">
                <label>附加参数</label>
                <textarea
                  v-model="vnStore.imageGenConfig.nanobanana.extraBody"
                  rows="4"
                  placeholder='{"google":{"response_modalities":["IMAGE"],"response_format":{"image":{"aspect_ratio":"1:1"}}}}'
                  class="vn-cfg-input resize-none font-mono text-[12px]"
                ></textarea>
              </div>
            </div>

            <details class="vn-cfg-card">
              <summary class="vn-cfg-summary">
                <span>高级连接设置</span>
                <i class="ph ph-caret-down"></i>
              </summary>
              <div class="pt-4">
                <div class="vn-cfg-group">
                  <label>鉴权方式</label>
                  <div class="relative">
                    <select v-model="vnStore.imageGenConfig.nanobanana.apiKeyMode" class="vn-cfg-input appearance-none pr-10">
                      <option v-for="item in nanobananaApiKeyModes" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                    <i class="ph ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                  </div>
                </div>
              </div>
            </details>
          </template>

          <!-- Custom -->
          <div v-else-if="vnStore.imageGenConfig.provider === 'custom'" class="vn-cfg-card space-y-4">
            <div class="vn-cfg-group">
              <label>Endpoint</label>
              <input v-model="vnStore.imageGenConfig.custom.endpoint" placeholder="https://api.example.com/..." class="vn-cfg-input" />
            </div>
            <div class="vn-cfg-group">
              <label>API Key</label>
              <input v-model="vnStore.imageGenConfig.custom.apiKey" type="password" class="vn-cfg-input" />
            </div>
            <div class="vn-cfg-group">
              <label>请求模板 (JSON)</label>
              <textarea v-model="vnStore.imageGenConfig.custom.requestTemplate" rows="5" placeholder='{"prompt": "{{prompt}}"}' class="vn-cfg-input resize-none font-mono text-[12px]"></textarea>
              <p class="vn-cfg-help" v-pre>变量：{{prompt}}、{{negative_prompt}}</p>
            </div>
            <div class="vn-cfg-group">
              <label>响应路径</label>
              <input v-model="vnStore.imageGenConfig.custom.responsePath" placeholder="data[0].url" class="vn-cfg-input" />
            </div>
          </div>
        </div>
      </transition>

      <!-- Test button -->
      <button
        class="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-[14px] active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-xl"
        :disabled="isTesting"
        @click="testGeneration"
      >
        <i v-if="isTesting" class="ph ph-circle-notch animate-spin"></i>
        <i v-else class="ph ph-lightning-fill"></i>
        {{ isTesting ? '生成中...' : '测试接口' }}
      </button>

      <!-- Test result -->
      <div v-if="testResult" class="bg-white border border-gray-100 rounded-[24px] overflow-hidden shadow-sm">
        <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wide">测试结果</span>
          <button @click="testResult = null" class="text-gray-300"><i class="ph ph-x"></i></button>
        </div>
        <div class="aspect-square bg-gray-50 relative">
          <img :src="testResult" class="w-full h-full object-contain" />
        </div>
      </div>

      <div v-if="testError" class="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-red-500 text-[13px]">
        {{ testError }}
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVNStore } from '../../../stores/vn'
import { useImageGen } from '../../../composables/useImageGen'
import { useStorage } from '../../../composables/useStorage'
import { isNaturalImageGenProvider, normalizeImageGenProvider } from '../../../composables/imageGen/providers'

const router = useRouter()
const vnStore = useVNStore()
const { generateImage } = useImageGen()
const { scheduleSave } = useStorage()

const isTesting = ref(false)
const testResult = ref(null)
const testError = ref('')

const providers = [
  { id: 'openai_images', name: 'GPT Image' },
  { id: 'nanobanana', name: 'Gemini' },
  { id: 'novelai', name: 'NovelAI' },
  { id: 'custom', name: '自定义接口' }
]

const samplers = [
  'k_euler', 'k_euler_ancestral', 'k_dpmpp_2m',
  'k_dpmpp_sde', 'k_dpmpp_2s_ancestral', 'ddim'
]

const nanobananaApiModes = [
  { value: 'gemini', label: 'Gemini 原生' },
  { value: 'openai_chat', label: 'OpenAI Chat' },
  { value: 'openai_images', label: 'OpenAI Images' }
]

const nanobananaApiKeyModes = [
  { value: 'query', label: 'Query ?key=' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'x-goog-api-key', label: 'x-goog-api-key' },
  { value: 'x-api-key', label: 'x-api-key' },
  { value: 'none', label: '无鉴权' }
]

const openaiImageSizes = [
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '方图 1:1' },
  { value: '1024x1536', label: '竖图 2:3' },
  { value: '1536x1024', label: '横图 3:2' },
  { value: 'custom', label: '自定义尺寸' }
]

const openaiImageQualities = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
]

const openaiOutputFormats = [
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' }
]

const openaiApiKeyModes = [
  { value: 'bearer', label: 'Bearer' },
  { value: 'x-api-key', label: 'x-api-key' },
  { value: 'query', label: 'Query ?key=' },
  { value: 'none', label: '无鉴权' }
]

const openaiApiModes = [
  { value: 'auto', label: '自动识别' },
  { value: 'images', label: 'Images API (/images)' },
  { value: 'chat', label: 'Chat Completions' }
]

const imagePromptStyleOptions = [
  { value: 'auto', label: '自动（按模型）' },
  { value: 'gpt_image', label: 'GPT Image 自然语言' },
  { value: 'gemini_image', label: 'Gemini 自然语言' },
  { value: 'danbooru', label: 'Tag / Danbooru' },
  { value: 'natural', label: '通用自然语言' }
]

const nanobananaAspectRatios = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
  '1:4', '4:1', '1:8', '8:1'
]

const nanobananaImageSizes = ['512px', '1K', '2K', '4K']

const DEFAULT_IMAGE_REQUEST_TIMEOUT_MS = 90_000
const MIN_IMAGE_REQUEST_TIMEOUT_MS = 10_000
const MAX_IMAGE_REQUEST_TIMEOUT_MS = 600_000

function normalizeImageRequestTimeoutMs(value, fallback = DEFAULT_IMAGE_REQUEST_TIMEOUT_MS) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.max(MIN_IMAGE_REQUEST_TIMEOUT_MS, Math.min(MAX_IMAGE_REQUEST_TIMEOUT_MS, Math.round(n)))
}

const imageRequestTimeoutSeconds = computed({
  get() {
    const n = Number(vnStore.imageGenConfig?.imageRequestTimeoutMs)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_IMAGE_REQUEST_TIMEOUT_MS / 1000
    return Math.round(n / 1000)
  },
  set(value) {
    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    vnStore.imageGenConfig.imageRequestTimeoutMs = Math.round(seconds * 1000)
  }
})

function normalizeImageRequestTimeoutInput() {
  vnStore.imageGenConfig.imageRequestTimeoutMs = normalizeImageRequestTimeoutMs(
    vnStore.imageGenConfig?.imageRequestTimeoutMs
  )
}

function ensureNanobananaDefaults(cfg) {
  if (!cfg.nanobanana || typeof cfg.nanobanana !== 'object') cfg.nanobanana = {}
  const defaults = {
    apiKey: '',
    model: 'gemini-2.5-flash-image',
    apiMode: 'gemini',
    endpoint: '',
    apiKeyMode: 'query',
    aspectRatio: '',
    imageSize: '',
    openaiSize: '',
    temperature: 1.0,
    promptStyle: 'auto',
    extraBody: ''
  }
  Object.entries(defaults).forEach(([k, v]) => {
    if (cfg.nanobanana[k] === undefined) cfg.nanobanana[k] = v
  })
  if (cfg.nanobanana.model === 'gemini-2.5-flash-image-preview') {
    cfg.nanobanana.model = defaults.model
  }
}

function ensureOpenAIImagesDefaults(cfg) {
  if (!cfg.openaiImages || typeof cfg.openaiImages !== 'object') cfg.openaiImages = {}
  const defaults = {
    apiKey: '',
    endpoint: '',
    model: 'gpt-image2',
    apiMode: 'auto',
    apiKeyMode: 'bearer',
    size: 'auto',
    imageSize: '',
    customWidth: 1024,
    customHeight: 1024,
    allowCustomSize: false,
    quality: 'auto',
    outputFormat: 'png',
    background: 'auto',
    moderation: '',
    responseFormat: '',
    promptStyle: 'auto',
    extraBody: ''
  }
  Object.entries(defaults).forEach(([k, v]) => {
    if (cfg.openaiImages[k] === undefined) cfg.openaiImages[k] = v
  })
}

onMounted(() => {
  const cfg = vnStore.imageGenConfig

  const normalizedProvider = normalizeImageGenProvider(cfg.provider)
  if (normalizedProvider && normalizedProvider !== cfg.provider) cfg.provider = normalizedProvider
  cfg.imageRequestTimeoutMs = normalizeImageRequestTimeoutMs(cfg.imageRequestTimeoutMs)

  if (!cfg.novelai) cfg.novelai = {}
  const naiDefaults = {
    apiKey: '', model: 'nai-diffusion-4-5-full',
    steps: 28, sampler: 'k_euler', scale: 5,
    width: 1024, height: 1024, negative_prompt: '',
    sm: false, sm_dyn: false, qualityToggle: true,
    ucPreset: 4, cfg_rescale: 0, uncond_scale: 1,
    strength: 0.6, noise: 0.2
  }
  Object.entries(naiDefaults).forEach(([k, v]) => {
    if (cfg.novelai[k] === undefined) cfg.novelai[k] = v
  })

  ensureNanobananaDefaults(cfg)
  ensureOpenAIImagesDefaults(cfg)
  if (!cfg.custom) cfg.custom = { endpoint: '', apiKey: '', requestTemplate: '', responsePath: '' }
  if (!cfg.spriteStrategy) cfg.spriteStrategy = 'img2img'
})

watch(
  () => vnStore.imageGenConfig?.nanobanana?.apiMode,
  (mode) => {
    const nano = vnStore.imageGenConfig?.nanobanana
    if (!nano) return

    if (mode === 'openai_chat' || mode === 'openai_images') {
      if (!nano.endpoint) nano.endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai'
      if (!nano.apiKeyMode || nano.apiKeyMode === 'query') nano.apiKeyMode = 'bearer'
      return
    }

    if (mode === 'gemini' && (!nano.apiKeyMode || nano.apiKeyMode === 'bearer')) {
      nano.apiKeyMode = 'query'
    }
  },
  { immediate: true }
)

watch(() => vnStore.imageGenConfig, () => {
  scheduleSave()
}, { deep: true })

async function testGeneration() {
  if (isTesting.value) return
  isTesting.value = true
  testError.value = ''
  testResult.value = null

  try {
    const naturalPrompt = 'Anime character portrait, upper body, white background, soft lighting, clean illustration style, test image'
    const tagPrompt = '1girl, upper body, white background, anime style, test'
    const prompt = isNaturalImageGenProvider(vnStore.imageGenConfig.provider)
      ? naturalPrompt
      : tagPrompt
    const url = await generateImage(prompt, {
      width: 512,
      height: 512,
      seed: Math.floor(Math.random() * 4294967295)
    })
    testResult.value = url
  } catch (e) {
    testError.value = e.message || '测试失败'
  } finally {
    isTesting.value = false
  }
}
</script>

<style scoped>
.vn-cfg-card {
  background: white;
  border: 1px solid #eef2f6;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.vn-cfg-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vn-cfg-group label {
  font-size: 10px;
  font-weight: 800;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding-left: 4px;
}

.vn-cfg-help {
  color: #9ca3af;
  font-size: 11px;
  line-height: 1.55;
  padding-left: 4px;
}

.vn-cfg-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
  color: #374151;
  font-size: 13px;
  font-weight: 800;
}

.vn-cfg-summary::-webkit-details-marker {
  display: none;
}

details[open] .vn-cfg-summary > i {
  transform: rotate(180deg);
}

.vn-cfg-summary > i {
  color: #9ca3af;
  transition: transform 0.2s ease;
}

.vn-cfg-input {
  width: 100%;
  background: #f9fafb;
  border: 1px solid #eef2f6;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 14px;
  color: #111827;
  outline: none;
  transition: border-color 0.2s;
}

.vn-cfg-input:focus {
  border-color: rgba(99, 102, 241, 0.4);
}

.vn-cfg-input::placeholder {
  color: #d1d5db;
}

.vn-toggle {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: #e5e7eb;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
}

.vn-toggle.active {
  background: #6366f1;
}

.vn-toggle-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 0.3s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.vn-toggle.active .vn-toggle-dot {
  transform: translateX(20px);
}

select { -webkit-appearance: none; appearance: none; }
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from { opacity: 0; transform: translateY(8px); }
.fade-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
