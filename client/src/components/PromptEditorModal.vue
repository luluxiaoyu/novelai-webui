<script setup lang="ts">
import { ref, watch } from 'vue';
import { useGenerationStore } from '../stores/generation';
import PromptTextarea from './PromptTextarea.vue';
import { 
  X, Check, Maximize2, Sparkles, Trash2, Copy, 
  Wand2, RotateCcw, Users, User, UserPlus, SlidersHorizontal, 
  ShieldAlert, Palette, History
} from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'open-character-library'): void;
  (e: 'open-style-library'): void;
  (e: 'open-prompt-history'): void;
}>();

const genStore = useGenerationStore();

// 本地草稿状态
const draftPrompt = ref('');
const draftNegativePrompt = ref('');
const draftCharacters = ref<Array<{
  id: string;
  prompt: string;
  uc: string;
  center: { x: number; y: number };
  enabled: boolean;
}>>([]);
const draftUseCoords = ref(false);

const copiedType = ref<string | null>(null);

// 初始化草稿数据
const initDraft = () => {
  draftPrompt.value = genStore.params.prompt || '';
  draftNegativePrompt.value = genStore.params.negative_prompt || '';
  draftCharacters.value = JSON.parse(JSON.stringify(genStore.params.characters || []));
  draftUseCoords.value = !!genStore.params.use_coords;
};

// 监听弹窗打开
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    initDraft();
  }
}, { immediate: true });

// 监听外部修改（如画风库/角色库/历史弹窗在子窗口插入词条时即时同步至草稿）
watch(() => genStore.params.prompt, (newVal) => {
  if (props.modelValue && newVal !== draftPrompt.value) {
    draftPrompt.value = newVal;
  }
});
watch(() => genStore.params.negative_prompt, (newVal) => {
  if (props.modelValue && newVal !== draftNegativePrompt.value) {
    draftNegativePrompt.value = newVal;
  }
});
watch(() => genStore.params.characters, (newVal) => {
  if (props.modelValue) {
    draftCharacters.value = JSON.parse(JSON.stringify(newVal || []));
  }
}, { deep: true });

// 打开画风库
const openStyleLibrary = () => {
  // 同步当前草稿到 store，以确保画风库在当前草稿基础上追加
  genStore.params.prompt = draftPrompt.value;
  genStore.params.negative_prompt = draftNegativePrompt.value;
  genStore.params.characters = JSON.parse(JSON.stringify(draftCharacters.value));
  emit('open-style-library');
};

// 打开角色库
const openCharacterLibrary = () => {
  // 同步当前草稿到 store，以确保角色库在当前草稿基础上追加/添加角色
  genStore.params.prompt = draftPrompt.value;
  genStore.params.negative_prompt = draftNegativePrompt.value;
  genStore.params.characters = JSON.parse(JSON.stringify(draftCharacters.value));
  emit('open-character-library');
};

// 打开历史提示词
const openPromptHistory = () => {
  emit('open-prompt-history');
};

// 关闭弹窗
const closeModal = () => {
  emit('update:modelValue', false);
};

// 确定并回填主界面
const handleConfirm = () => {
  genStore.params.prompt = draftPrompt.value;
  genStore.params.negative_prompt = draftNegativePrompt.value;
  genStore.params.characters = JSON.parse(JSON.stringify(draftCharacters.value));
  genStore.params.use_coords = draftUseCoords.value;
  closeModal();
};

// 填入官方 Heavy UC 预设
const fillOfficialUC = () => {
  const isV3 = genStore.params.model === 'nai-diffusion-3';
  if (isV3) {
    draftNegativePrompt.value = 'nsfw, lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]';
  } else {
    draftNegativePrompt.value = 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, signature, watermark, text, words, bad anatomy, bad hands, bad body, bad proportions, bad feet, missing limbs, missing fingers, extra digits, extra limbs';
  }
};

// 格式化清理多余逗号与空格
const formatCleanPrompt = () => {
  if (draftPrompt.value) {
    draftPrompt.value = draftPrompt.value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .join(', ');
  }
};

// 添加新角色卡片
const addCharacter = () => {
  const count = draftCharacters.value.length;
  let defaultX = 0.5;
  if (count === 0) defaultX = 0.35;
  else if (count === 1) defaultX = 0.65;

  draftCharacters.value.push({
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: '',
    uc: '',
    center: { x: defaultX, y: 0.5 },
    enabled: true
  });
};

// 移除角色卡片
const removeCharacter = (index: number) => {
  draftCharacters.value.splice(index, 1);
};

// 清空所有角色
const clearCharacters = () => {
  draftCharacters.value = [];
};

// 快捷复制
const handleCopy = async (text: string, type: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copiedType.value = type;
    setTimeout(() => {
      if (copiedType.value === type) copiedType.value = null;
    }, 1500);
  } catch (e) {}
};
</script>

<template>
  <div 
    v-if="modelValue" 
    class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
  >
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] h-[90vh] overflow-hidden">
      
      <!-- 弹窗头部 -->
      <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-gray-950/50">
        <div class="flex items-center gap-2.5">
          <div class="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
            <Maximize2 class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              提示词大屏工作台
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">大窗口沉浸式编辑与调优正向提示词、负向提示词及多角色设定，确认后自动回填</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Tag 推荐开关快捷同步 -->
          <button 
            type="button"
            @click="genStore.enableTagSuggestions = !genStore.enableTagSuggestions"
            class="text-xs px-2.5 py-1 rounded-xl font-medium flex items-center gap-1.5 transition select-none border"
            :class="genStore.enableTagSuggestions ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800' : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'"
            :title="genStore.enableTagSuggestions ? 'Tag 词条联想已开启' : 'Tag 词条联想已关闭'"
          >
            <Sparkles class="w-3.5 h-3.5" :class="genStore.enableTagSuggestions ? 'text-amber-500 fill-amber-500' : 'text-gray-400'" />
            <span class="hidden sm:inline">{{ genStore.enableTagSuggestions ? 'Tag联想: 开' : 'Tag联想: 关' }}</span>
          </button>

          <button 
            @click="closeModal" 
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 弹窗可滚动主体区 -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar flex flex-col gap-6">
        
        <!-- 1. 正向提示词区域 -->
        <div class="flex flex-col gap-2 bg-gray-50/50 dark:bg-gray-950/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              <label class="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                正向提示词 (Positive Prompt)
              </label>
              <span class="text-[10px] text-gray-400 font-mono">
                {{ draftPrompt.length }} 字符
              </span>
            </div>

            <div class="flex items-center gap-1.5 flex-wrap">
              <!-- 快捷调用子库与历史 -->
              <button 
                @click="openStyleLibrary" 
                class="text-xs text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/60 bg-white dark:bg-gray-900 border border-pink-200 dark:border-pink-900/60 px-2.5 py-1 rounded-lg transition flex items-center gap-1 font-medium"
                title="打开常用画风预设库"
              >
                <Palette class="w-3.5 h-3.5" />
                <span>画风库</span>
              </button>

              <button 
                @click="openCharacterLibrary" 
                class="text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/60 bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-900/60 px-2.5 py-1 rounded-lg transition flex items-center gap-1 font-medium"
                title="打开常用角色预设库"
              >
                <Users class="w-3.5 h-3.5" />
                <span>角色库</span>
              </button>

              <button 
                @click="openPromptHistory" 
                class="text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900/60 px-2.5 py-1 rounded-lg transition flex items-center gap-1 font-medium"
                title="历史提示词"
              >
                <History class="w-3.5 h-3.5" />
                <span>历史 ({{ genStore.promptHistory.length }})</span>
              </button>

              <div class="w-px h-4 bg-gray-200 dark:bg-gray-800 mx-0.5 hidden sm:block"></div>

              <button 
                @click="formatCleanPrompt"
                class="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-lg transition flex items-center gap-1"
                title="清除多余空格与冗余逗号"
              >
                <Wand2 class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">规范格式</span>
              </button>
              <button 
                @click="handleCopy(draftPrompt, 'prompt')"
                class="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-lg transition flex items-center gap-1"
                title="复制正向词"
              >
                <Check v-if="copiedType === 'prompt'" class="w-3.5 h-3.5 text-green-500" />
                <Copy v-else class="w-3.5 h-3.5" />
                <span>{{ copiedType === 'prompt' ? '已复制' : '复制' }}</span>
              </button>
              <button 
                @click="draftPrompt = ''"
                class="text-xs text-gray-400 hover:text-red-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-lg transition flex items-center gap-1"
                title="清空内容"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            </div>
          </div>

          <PromptTextarea 
            v-model="draftPrompt" 
            :rows="7" 
            placeholder="输入正向提示词，如 1girl, masterpiece, best quality, highly detailed, expressive eyes, vibrant colors, cinematic lighting..."
            textarea-class="bg-white dark:bg-gray-900 text-xs sm:text-sm leading-relaxed"
          />
        </div>

        <!-- 2. 反向提示词区域 -->
        <div class="flex flex-col gap-2 bg-gray-50/50 dark:bg-gray-950/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-red-400"></span>
              <label class="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                反向提示词 (Negative Prompt / UC)
              </label>
              <span class="text-[10px] text-gray-400 font-mono">
                {{ draftNegativePrompt.length }} 字符
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button 
                @click="fillOfficialUC"
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-lg transition flex items-center gap-1 font-medium"
                title="填入官方 Heavy UC 预设"
              >
                <ShieldAlert class="w-3.5 h-3.5" />
                <span>+ 官方画质预设</span>
              </button>
              <button 
                @click="handleCopy(draftNegativePrompt, 'uc')"
                class="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-lg transition flex items-center gap-1"
                title="复制负向词"
              >
                <Check v-if="copiedType === 'uc'" class="w-3.5 h-3.5 text-green-500" />
                <Copy v-else class="w-3.5 h-3.5" />
                <span>{{ copiedType === 'uc' ? '已复制' : '复制' }}</span>
              </button>
              <button 
                @click="draftNegativePrompt = ''"
                class="text-xs text-gray-400 hover:text-red-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-lg transition flex items-center gap-1"
                title="清空负向词"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            </div>
          </div>

          <PromptTextarea 
            v-model="draftNegativePrompt" 
            :rows="3" 
            placeholder="输入反向提示词，如 lowres, bad anatomy, bad hands, text, error, missing fingers, extra digits..."
            textarea-class="bg-white dark:bg-gray-900 text-xs leading-relaxed text-gray-600 dark:text-gray-400"
          />
        </div>

        <!-- 3. 多角色专属提示词区域 (仅 V4 / V4.5 / V5) -->
        <div v-if="genStore.params.model !== 'nai-diffusion-3'" class="flex flex-col gap-3 bg-blue-50/40 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <Users class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <label class="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                多角色专属设定 (Character Prompts)
              </label>
              <span class="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono px-2 py-0.5 rounded-full font-bold">
                {{ draftCharacters.length }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <!-- 自定义坐标开关 -->
              <div class="flex items-center gap-1.5 bg-white dark:bg-gray-900 px-2.5 py-1 rounded-xl border border-gray-200 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400">
                <SlidersHorizontal class="w-3.5 h-3.5" />
                <span>位置定位:</span>
                <button 
                  type="button" 
                  role="switch" 
                  :aria-checked="draftUseCoords" 
                  @click="draftUseCoords = !draftUseCoords" 
                  class="relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none" 
                  :class="draftUseCoords ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'"
                >
                  <span 
                    aria-hidden="true" 
                    class="pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out my-0.5" 
                    :class="draftUseCoords ? 'translate-x-3' : 'translate-x-0.5'" 
                  />
                </button>
              </div>

              <!-- 添加角色按钮 -->
              <button 
                @click="addCharacter"
                class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1 rounded-xl transition shadow-sm shadow-blue-500/20 flex items-center gap-1.5 active:scale-95"
              >
                <UserPlus class="w-3.5 h-3.5" />
                <span>+ 新增角色</span>
              </button>

              <button 
                v-if="draftCharacters.length > 0"
                @click="clearCharacters"
                class="text-xs text-gray-400 hover:text-red-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-xl transition"
                title="清空所有角色"
              >
                清空角色
              </button>
            </div>
          </div>

          <!-- 角色卡片列表 -->
          <div v-if="draftCharacters.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
            <div 
              v-for="(char, idx) in draftCharacters" 
              :key="char.id"
              class="bg-white dark:bg-gray-900 border rounded-xl p-3.5 shadow-xs flex flex-col gap-3 transition-all"
              :class="char.enabled !== false ? 'border-blue-200/80 dark:border-blue-800/80' : 'border-gray-200 dark:border-gray-800 opacity-60'"
            >
              <!-- 头部 -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <button 
                    type="button" 
                    role="switch" 
                    :aria-checked="char.enabled !== false" 
                    @click="char.enabled = char.enabled === false ? true : false" 
                    class="relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none" 
                    :class="char.enabled !== false ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'"
                    :title="char.enabled !== false ? '已启用该角色' : '已禁用该角色'"
                  >
                    <span 
                      aria-hidden="true" 
                      class="pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out my-0.5" 
                      :class="char.enabled !== false ? 'translate-x-3' : 'translate-x-0.5'" 
                    />
                  </button>

                  <span class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                    <User class="w-3.5 h-3.5 text-blue-500" />
                    角色 {{ idx + 1 }}
                  </span>
                </div>

                <button 
                  @click="removeCharacter(idx)"
                  class="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  title="删除该角色"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- 角色正向词 -->
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">专属正向词条</label>
                <PromptTextarea 
                  v-model="char.prompt" 
                  :rows="2" 
                  :resizable="true"
                  storage-key="modal_character_prompt"
                  :min-height="55"
                  :placeholder="`角色 ${idx + 1} 外貌与动作特征 (如 1girl, nahida, green eyes, dress...)`"
                  textarea-class="bg-gray-50 dark:bg-gray-950 p-2 text-xs"
                />
              </div>

              <!-- 角色负向词 (可选) -->
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">专属负向词条 (可选)</label>
                <input 
                  v-model="char.uc" 
                  type="text" 
                  :placeholder="`角色 ${idx + 1} 独立负向词 (如 bad hands, lowres...)`"
                  class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono text-gray-600 dark:text-gray-400"
                />
              </div>

              <!-- 坐标微调 -->
              <div v-if="draftUseCoords" class="pt-2 border-t border-gray-100 dark:border-gray-800/80 grid grid-cols-2 gap-2 text-[11px]">
                <div class="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-950 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-800">
                  <span class="font-mono text-gray-500 shrink-0 font-medium">X:</span>
                  <input 
                    type="range" 
                    v-model.number="char.center.x" 
                    min="0.1" 
                    max="0.9" 
                    step="0.05" 
                    class="w-full accent-blue-600 h-1 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer" 
                  />
                  <span class="font-mono text-[10px] w-6 text-right shrink-0">{{ Number(char.center?.x || 0.5).toFixed(2) }}</span>
                </div>

                <div class="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-950 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-800">
                  <span class="font-mono text-gray-500 shrink-0 font-medium">Y:</span>
                  <input 
                    type="range" 
                    v-model.number="char.center.y" 
                    min="0.1" 
                    max="0.9" 
                    step="0.05" 
                    class="w-full accent-blue-600 h-1 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer" 
                  />
                  <span class="font-mono text-[10px] w-6 text-right shrink-0">{{ Number(char.center?.y || 0.5).toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="py-6 flex flex-col items-center justify-center text-gray-400 text-xs gap-2">
            <Users class="w-8 h-8 opacity-40" />
            <span>暂未添加多角色专属卡片</span>
            <button 
              @click="addCharacter" 
              class="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              + 点击添加第一个角色
            </button>
          </div>
        </div>

      </div>

      <!-- 弹窗底部操作栏 (固定吸附在底部) -->
      <div class="px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/80 flex items-center justify-between shrink-0 gap-3">
        <p class="text-[11px] text-gray-400 hidden sm:block">
          💡 修改完成后，点击「确定并回填」即可同步更新至左侧主控制面板
        </p>

        <div class="flex items-center gap-2.5 ml-auto w-full sm:w-auto justify-end">
          <button 
            @click="closeModal"
            class="flex-1 sm:flex-none px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition"
          >
            取消
          </button>
          <button 
            @click="handleConfirm"
            class="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/20 transition flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Check class="w-4 h-4" />
            <span>确定并回填</span>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
