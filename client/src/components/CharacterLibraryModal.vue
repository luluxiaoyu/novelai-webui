<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGenerationStore } from '../stores/generation';
import { useWebDAVStore } from '../stores/webdav';
import { X, Search, Plus, Trash2, Copy, Check, UserPlus, Users, Star, ArrowUpToLine, ArrowDownToLine } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const genStore = useGenerationStore();
const webdavStore = useWebDAVStore();

export interface CharacterPreset {
  id: string;
  name: string;
  category: string;
  prompt: string;
  uc?: string;
  isBuiltin?: boolean;
  isFavorite?: boolean;
  updatedAt?: number;
}

const BUILTIN_PRESETS: CharacterPreset[] = [
  // 原神
  {
    id: 'genshin-nahida',
    name: '纳西妲 (Nahida)',
    category: '原神',
    prompt: 'nahida(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-klee',
    name: '可莉 (Klee)',
    category: '原神',
    prompt: 'klee(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sigewinne',
    name: '希格雯 (Sigewinne)',
    category: '原神',
    prompt: 'sigewinne(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sigewinne-luckin',
    name: '希格雯·瑞幸联名 (Sigewinne Luckin Coffee)',
    category: '原神',
    prompt: 'sigewinne(luckin coffee)(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kachina',
    name: '卡齐娜 (Kachina)',
    category: '原神',
    prompt: 'kachina(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-diona',
    name: '迪奥娜 (Diona)',
    category: '原神',
    prompt: 'diona(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-qiqi',
    name: '七七 (Qiqi)',
    category: '原神',
    prompt: 'qiqi(genshin impact)',
    isBuiltin: true
  },
  // 崩铁
  {
    id: 'hsr-bailu',
    name: '白露 (Bailu)',
    category: '崩铁',
    prompt: 'bailu(honkai:starrail)',
    isBuiltin: true
  },
  {
    id: 'hsr-huohuo',
    name: '霍霍 (huohuo)',
    category: '崩铁',
    prompt: 'huohuo(honkai:starrail)',
    isBuiltin: true
  }
];

const activeCategory = ref<string>('all');
const searchQuery = ref<string>('');
const copiedId = ref<string | null>(null);
const appliedAction = ref<{ id: string; action: 'prepend' | 'append' | 'char' } | null>(null);

// 新增/编辑弹窗状态
const showEditModal = ref(false);
const editingPreset = ref<Partial<CharacterPreset>>({
  name: '',
  category: '自定义',
  prompt: '',
  uc: ''
});

// 所有角色列表（内置 + 自定义）
const allPresets = computed(() => {
  return [...BUILTIN_PRESETS, ...(genStore.customCharacters || [])];
});

// 分类列表
const categories = computed(() => {
  const cats = new Set<string>();
  cats.add('原神');
  cats.add('崩铁');
  cats.add('自定义');
  (genStore.customCharacters || []).forEach(p => {
    if (p.category) cats.add(p.category);
  });
  return Array.from(cats);
});

// 过滤后的列表
const filteredPresets = computed(() => {
  return allPresets.value.filter(p => {
    // 搜索过滤
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchPrompt = p.prompt.toLowerCase().includes(q);
      const matchCategory = p.category.toLowerCase().includes(q);
      if (!matchName && !matchPrompt && !matchCategory) return false;
    }

    // 分类过滤
    if (activeCategory.value === 'all') return true;
    if (activeCategory.value === 'favorites') return p.isFavorite;
    return p.category === activeCategory.value;
  });
});

// 收藏切换
const toggleFavorite = (preset: CharacterPreset) => {
  if (!genStore.customCharacters) genStore.customCharacters = [];
  if (preset.isBuiltin) {
    const found = genStore.customCharacters.find(p => p.id === preset.id);
    if (found) {
      found.isFavorite = !found.isFavorite;
    } else {
      genStore.customCharacters.push({
        ...preset,
        isFavorite: true
      });
    }
  } else {
    preset.isFavorite = !preset.isFavorite;
  }
  webdavStore.autoSyncMetadata(genStore);
};

// 复制提示词
const handleCopy = async (preset: CharacterPreset) => {
  try {
    await navigator.clipboard.writeText(preset.prompt);
    copiedId.value = preset.id;
    setTimeout(() => {
      if (copiedId.value === preset.id) copiedId.value = null;
    }, 2000);
  } catch (err) {
    console.error('Copy failed', err);
  }
};

// 追加到最前面
const handlePrependPrompt = (preset: CharacterPreset) => {
  const current = genStore.params.prompt.trim();
  if (!current) {
    genStore.params.prompt = preset.prompt;
  } else if (!current.includes(preset.prompt)) {
    genStore.params.prompt = `${preset.prompt}, ${current}`;
  }
  appliedAction.value = { id: preset.id, action: 'prepend' };
  setTimeout(() => {
    if (appliedAction.value?.id === preset.id) appliedAction.value = null;
  }, 1500);
};

// 追加到最后面
const handleAppendPrompt = (preset: CharacterPreset) => {
  const current = genStore.params.prompt.trim();
  if (!current) {
    genStore.params.prompt = preset.prompt;
  } else if (!current.includes(preset.prompt)) {
    genStore.params.prompt = `${current}, ${preset.prompt}`;
  }
  appliedAction.value = { id: preset.id, action: 'append' };
  setTimeout(() => {
    if (appliedAction.value?.id === preset.id) appliedAction.value = null;
  }, 1500);
};

// 添加为独立角色卡片 (Character Prompts)
const handleAddToCharacterPrompts = (preset: CharacterPreset) => {
  if (!genStore.params.characters) genStore.params.characters = [];
  
  const count = genStore.params.characters.length;
  let defaultX = 0.5;
  if (count === 0) defaultX = 0.35;
  else if (count === 1) defaultX = 0.65;

  genStore.params.characters.push({
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: preset.prompt,
    uc: preset.uc || '',
    center: { x: defaultX, y: 0.5 },
    enabled: true
  });

  appliedAction.value = { id: preset.id, action: 'char' };
  setTimeout(() => {
    if (appliedAction.value?.id === preset.id) appliedAction.value = null;
  }, 1500);
};

// 保存新建/编辑角色
const handleSaveCustomPreset = () => {
  if (!editingPreset.value.name?.trim() || !editingPreset.value.prompt?.trim()) {
    alert('请填写角色名称和提示词！');
    return;
  }

  if (!genStore.customCharacters) genStore.customCharacters = [];

  const category = editingPreset.value.category?.trim() || '自定义';
  const newPreset: CharacterPreset = {
    id: editingPreset.value.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: editingPreset.value.name.trim(),
    category,
    prompt: editingPreset.value.prompt.trim(),
    uc: editingPreset.value.uc?.trim() || undefined,
    isBuiltin: false,
    isFavorite: editingPreset.value.isFavorite || false,
    updatedAt: Date.now()
  };

  const existingIdx = genStore.customCharacters.findIndex(p => p.id === newPreset.id);
  if (existingIdx !== -1) {
    genStore.customCharacters[existingIdx] = newPreset;
  } else {
    genStore.customCharacters.unshift(newPreset);
  }

  webdavStore.autoSyncMetadata(genStore);
  showEditModal.value = false;
  editingPreset.value = { name: '', category: '自定义', prompt: '', uc: '' };
};

// 删除自定义角色
const handleDeleteCustomPreset = (id: string) => {
  if (!genStore.customCharacters) return;
  genStore.customCharacters = genStore.customCharacters.filter(p => p.id !== id);
  webdavStore.recordDeletion('character', id);
  webdavStore.autoSyncMetadata(genStore);
};

const openAddModal = () => {
  editingPreset.value = {
    name: '',
    category: activeCategory.value !== 'all' && activeCategory.value !== 'favorites' ? activeCategory.value : '自定义',
    prompt: '',
    uc: ''
  };
  showEditModal.value = true;
};
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
    <div class="bg-white dark:bg-gray-900 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] h-[85vh] overflow-hidden border border-gray-200 dark:border-gray-800">
      
      <!-- 模态框头部 -->
      <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
            <Users class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              角色预设库
              <span class="text-xs font-normal text-gray-500">({{ filteredPresets.length }})</span>
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">快速插入角色标签，或一键添加为 V4/V5 专属独立角色卡</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button 
            @click="openAddModal"
            class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition shadow-sm shadow-blue-500/20 flex items-center gap-1.5 active:scale-95"
          >
            <Plus class="w-4 h-4" />
            <span class="hidden sm:inline">新建预设</span>
          </button>
          <button 
            @click="emit('update:modelValue', false)"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 搜索与分类导航栏 -->
      <div class="px-5 py-3 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-950/40 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between shrink-0">
        <!-- 搜索输入框 -->
        <div class="relative flex-1 max-w-md">
          <Search class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="搜索角色名或提示词标签 (如 nahida, klee, bailu...)"
            class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-8 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''" 
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 横向分类标签栏 -->
        <div class="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
          <button 
            @click="activeCategory = 'all'" 
            class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition"
            :class="activeCategory === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'"
          >
            全部
          </button>
          <button 
            @click="activeCategory = 'favorites'" 
            class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1"
            :class="activeCategory === 'favorites' ? 'bg-amber-500 text-white shadow-xs' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'"
          >
            <Star class="w-3 h-3 text-amber-300 fill-amber-300" />
            收藏
          </button>
          <button 
            v-for="cat in categories" 
            :key="cat" 
            @click="activeCategory = cat" 
            class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition"
            :class="activeCategory === cat ? 'bg-blue-600 text-white shadow-xs' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- 角色卡片网格列表 -->
      <div class="p-5 flex-1 overflow-y-auto custom-scrollbar">
        <div v-if="filteredPresets.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div 
            v-for="preset in filteredPresets" 
            :key="preset.id"
            class="bg-gray-50/70 dark:bg-gray-950/60 border border-gray-200/80 dark:border-gray-800/90 hover:border-blue-300 dark:hover:border-blue-700/60 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md transition-all group"
          >
            <!-- 头部：角色名称 + 分类 Badge -->
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-bold text-gray-900 dark:text-white truncate" :title="preset.name">
                    {{ preset.name }}
                  </span>
                  <button 
                    @click="toggleFavorite(preset)" 
                    class="text-gray-300 hover:text-amber-400 transition shrink-0"
                    :class="{ 'text-amber-400': preset.isFavorite }"
                    title="收藏此角色"
                  >
                    <Star class="w-3.5 h-3.5" :class="{ 'fill-amber-400': preset.isFavorite }" />
                  </button>
                </div>
                <span class="inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100/70 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {{ preset.category }}
                </span>
              </div>

              <!-- 自定义角色删除操作 -->
              <button 
                v-if="!preset.isBuiltin"
                @click="handleDeleteCustomPreset(preset.id)"
                class="text-gray-400 hover:text-red-500 p-1 rounded-md opacity-0 group-hover:opacity-100 transition"
                title="删除此预设"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- 提示词展示区 -->
            <div class="bg-white dark:bg-gray-900/80 border border-gray-200/60 dark:border-gray-800 rounded-xl p-2.5 text-xs font-mono text-gray-700 dark:text-gray-300 break-words select-all">
              {{ preset.prompt }}
            </div>

            <!-- 底部操作按钮栏 -->
            <div class="flex flex-col gap-1.5 pt-1">
              <div class="grid grid-cols-2 gap-1.5">
                <!-- 追加到最前 -->
                <button 
                  @click="handlePrependPrompt(preset)" 
                  class="bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-medium py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 shadow-2xs"
                  title="将角色 Tag 插入到正向提示词最前面"
                >
                  <Check v-if="appliedAction?.id === preset.id && appliedAction.action === 'prepend'" class="w-3.5 h-3.5 text-green-500" />
                  <ArrowUpToLine v-else class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>{{ appliedAction?.id === preset.id && appliedAction.action === 'prepend' ? '已前置' : '追加最前' }}</span>
                </button>

                <!-- 追加到最后 -->
                <button 
                  @click="handleAppendPrompt(preset)" 
                  class="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-medium py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 shadow-2xs"
                  title="将角色 Tag 追加到正向提示词最后面"
                >
                  <Check v-if="appliedAction?.id === preset.id && appliedAction.action === 'append'" class="w-3.5 h-3.5 text-green-500" />
                  <ArrowDownToLine v-else class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{{ appliedAction?.id === preset.id && appliedAction.action === 'append' ? '已后置' : '追加最后' }}</span>
                </button>
              </div>

              <div class="flex items-center gap-1.5">
                <!-- 添加为独立角色 (Character Prompts) -->
                <button 
                  @click="handleAddToCharacterPrompts(preset)" 
                  class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 shadow-sm shadow-blue-500/20 active:scale-95"
                  title="添加为 V4/V5 多角色专属卡片"
                >
                  <Check v-if="appliedAction?.id === preset.id && appliedAction.action === 'char'" class="w-3.5 h-3.5 text-green-300" />
                  <UserPlus v-else class="w-3.5 h-3.5" />
                  <span>{{ appliedAction?.id === preset.id && appliedAction.action === 'char' ? '已添加角色' : '+ 独立角色' }}</span>
                </button>

                <!-- 复制按钮 -->
                <button 
                  @click="handleCopy(preset)" 
                  class="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition shrink-0 active:scale-95"
                  title="复制提示词"
                >
                  <Check v-if="copiedId === preset.id" class="w-4 h-4 text-green-500" />
                  <Copy v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 py-16">
          <Users class="w-12 h-12 stroke-1 mb-2 opacity-60" />
          <p class="text-sm font-medium">没有找到符合条件的角色预设</p>
          <button 
            @click="openAddModal" 
            class="mt-4 text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
          >
            <Plus class="w-3.5 h-3.5" />
            新建自定义角色预设
          </button>
        </div>
      </div>
    </div>

    <!-- 新建/编辑自定义角色预设子弹窗 -->
    <div v-if="showEditModal" class="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-5 border border-gray-200 dark:border-gray-800 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-bold text-gray-900 dark:text-white">新建自定义角色预设</h4>
          <button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">角色名称</label>
            <input 
              v-model="editingPreset.name" 
              type="text" 
              placeholder="如：刻晴 (Keqing)" 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">所属分类</label>
            <input 
              v-model="editingPreset.category" 
              type="text" 
              placeholder="如：原神、崩铁、明日方舟、自定义..." 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">正向提示词 (Prompt)</label>
            <textarea 
              v-model="editingPreset.prompt" 
              rows="3" 
              placeholder="如：keqing (genshin impact), purple hair, twintails..." 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            ></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">独立负面提示词 (可选 UC)</label>
            <input 
              v-model="editingPreset.uc" 
              type="text" 
              placeholder="如：lowres, bad hands (可选)" 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button 
            @click="showEditModal = false" 
            class="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            取消
          </button>
          <button 
            @click="handleSaveCustomPreset" 
            class="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
          >
            保存预设
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
