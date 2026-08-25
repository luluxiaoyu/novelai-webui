<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGenerationStore } from '../stores/generation';
import { useWebDAVStore } from '../stores/webdav';
import { X, Search, Plus, Trash2, Copy, Check, Palette, Star, Edit3, ArrowUpToLine, ArrowDownToLine } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const genStore = useGenerationStore();
const webdavStore = useWebDAVStore();

export interface StylePreset {
  id: string;
  name: string;
  category: string;
  prompt: string;
  uc?: string;
  isFavorite?: boolean;
}

const activeCategory = ref<string>('all');
const searchQuery = ref<string>('');
const copiedId = ref<string | null>(null);
const appliedAction = ref<{ id: string; action: 'prepend' | 'append' } | null>(null);

// 新增/编辑弹窗状态
const showEditModal = ref(false);
const editingPreset = ref<Partial<StylePreset>>({
  name: '',
  category: '自定义',
  prompt: '',
  uc: ''
});

// 所有画风列表
const allPresets = computed(() => {
  return genStore.customStyles || [];
});

// 分类列表
const categories = computed(() => {
  const cats = new Set<string>();
  cats.add('全部');
  (genStore.customStyles || []).forEach(p => {
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
    if (activeCategory.value === 'all' || activeCategory.value === '全部') return true;
    if (activeCategory.value === 'favorites') return p.isFavorite;
    return p.category === activeCategory.value;
  });
});

// 收藏切换
const toggleFavorite = (preset: StylePreset) => {
  preset.isFavorite = !preset.isFavorite;
  webdavStore.autoSyncMetadata(genStore);
};

// 复制提示词
const handleCopy = async (preset: StylePreset) => {
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

// 插入到最前面
const handlePrependPrompt = (preset: StylePreset) => {
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
const handleAppendPrompt = (preset: StylePreset) => {
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

// 保存新建/编辑画风
const handleSaveCustomPreset = () => {
  if (!editingPreset.value.name?.trim() || !editingPreset.value.prompt?.trim()) {
    alert('请填写画风名称和提示词！');
    return;
  }

  if (!genStore.customStyles) genStore.customStyles = [];

  const category = editingPreset.value.category?.trim() || '自定义';
  const newPreset: StylePreset = {
    id: editingPreset.value.id || `style-${Date.now()}`,
    name: editingPreset.value.name.trim(),
    category,
    prompt: editingPreset.value.prompt.trim(),
    uc: editingPreset.value.uc?.trim() || undefined,
    isFavorite: editingPreset.value.isFavorite || false
  };

  const existingIdx = genStore.customStyles.findIndex(p => p.id === newPreset.id);
  if (existingIdx !== -1) {
    genStore.customStyles[existingIdx] = newPreset;
  } else {
    genStore.customStyles.unshift(newPreset);
  }

  webdavStore.autoSyncMetadata(genStore);
  showEditModal.value = false;
  editingPreset.value = { name: '', category: '自定义', prompt: '', uc: '' };
};

// 编辑已有画风
const openEditModal = (preset: StylePreset) => {
  editingPreset.value = {
    id: preset.id,
    name: preset.name,
    category: preset.category,
    prompt: preset.prompt,
    uc: preset.uc || '',
    isFavorite: preset.isFavorite
  };
  showEditModal.value = true;
};

// 删除画风
const handleDeleteCustomPreset = (id: string) => {
  if (!genStore.customStyles) return;
  genStore.customStyles = genStore.customStyles.filter(p => p.id !== id);
  webdavStore.autoSyncMetadata(genStore);
};

const openAddModal = () => {
  editingPreset.value = {
    name: '',
    category: '自定义',
    prompt: '',
    uc: ''
  };
  showEditModal.value = true;
};

const closeModal = () => {
  emit('update:modelValue', false);
};
</script>

<template>
  <div 
    v-if="modelValue" 
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    @click.self="closeModal"
  >
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
      <!-- 头部 -->
      <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="p-2 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-100 dark:border-purple-900/50">
            <Palette class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              画风预设库
              <span class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full font-mono font-normal">
                {{ allPresets.length }}
              </span>
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">管理常用画风、艺术风格与媒介质感，一键追加到正向提示词末尾</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button 
            @click="openAddModal"
            class="text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-purple-600/20 active:scale-95"
          >
            <Plus class="w-4 h-4" />
            <span>新建画风</span>
          </button>

          <button 
            @click="closeModal" 
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 搜索与分类导航栏 -->
      <div class="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shrink-0">
        <!-- 搜索框 -->
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="搜索画风名称、风格特征或分类..."
            class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
          />
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 分类切换标签 -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar shrink-0">
          <button 
            @click="activeCategory = 'all'"
            class="text-xs px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap"
            :class="activeCategory === 'all' || activeCategory === '全部' ? 'bg-purple-600 text-white shadow-xs' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'"
          >
            全部
          </button>
          <button 
            @click="activeCategory = 'favorites'"
            class="text-xs px-2.5 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1"
            :class="activeCategory === 'favorites' ? 'bg-amber-500 text-white shadow-xs' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'"
          >
            <Star class="w-3.5 h-3.5 fill-current" />
            <span>收藏</span>
          </button>
          <template v-for="cat in categories" :key="cat">
            <button 
              v-if="cat !== '全部'"
              @click="activeCategory = cat"
              class="text-xs px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap"
              :class="activeCategory === cat ? 'bg-purple-600 text-white shadow-xs' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'"
            >
              {{ cat }}
            </button>
          </template>
        </div>
      </div>

      <!-- 画风卡片网格列表 -->
      <div class="p-4 overflow-y-auto custom-scrollbar flex-1">
        <div v-if="filteredPresets.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div 
            v-for="preset in filteredPresets" 
            :key="preset.id"
            class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800/80 rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md transition-all group relative"
          >
            <!-- 卡片头部信息 -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-bold text-xs text-gray-900 dark:text-gray-100 truncate" :title="preset.name">
                    {{ preset.name }}
                  </span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 shrink-0">
                    {{ preset.category }}
                  </span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <!-- 收藏按钮 -->
                  <button 
                    @click="toggleFavorite(preset)" 
                    class="p-1 rounded-lg transition"
                    :class="preset.isFavorite ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'"
                    :title="preset.isFavorite ? '取消收藏' : '收藏此画风'"
                  >
                    <Star class="w-3.5 h-3.5" :class="{ 'fill-current': preset.isFavorite }" />
                  </button>

                  <!-- 编辑按钮 -->
                  <button 
                    @click="openEditModal(preset)" 
                    class="p-1 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    title="编辑此画风"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                  </button>

                  <!-- 删除按钮 -->
                  <button 
                    @click="handleDeleteCustomPreset(preset.id)" 
                    class="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    title="删除此预设"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- 提示词预览 -->
              <p class="text-[11px] font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/80 p-2 rounded-xl border border-gray-100 dark:border-gray-800 line-clamp-3 select-all">
                {{ preset.prompt }}
              </p>
            </div>

            <!-- 卡片操作底部 -->
            <div class="flex items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-800/80">
              <button 
                @click="handlePrependPrompt(preset)"
                class="flex-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 text-[11px] font-medium py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 shadow-2xs"
                title="插入到正向提示词最前面"
              >
                <Check v-if="appliedAction?.id === preset.id && appliedAction.action === 'prepend'" class="w-3.5 h-3.5 text-green-500" />
                <ArrowUpToLine v-else class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>{{ appliedAction?.id === preset.id && appliedAction.action === 'prepend' ? '已前置' : '追加最前' }}</span>
              </button>

              <button 
                @click="handleAppendPrompt(preset)"
                class="flex-1 bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/80 text-[11px] font-medium py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 shadow-2xs"
                title="追加到正向提示词最后面"
              >
                <Check v-if="appliedAction?.id === preset.id && appliedAction.action === 'append'" class="w-3.5 h-3.5 text-green-500" />
                <ArrowDownToLine v-else class="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
                <span>{{ appliedAction?.id === preset.id && appliedAction.action === 'append' ? '已后置' : '追加最后' }}</span>
              </button>

              <button 
                @click="handleCopy(preset)"
                class="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl transition flex items-center justify-center shrink-0 active:scale-95"
                title="复制画风提示词"
              >
                <Check v-if="copiedId === preset.id" class="w-3.5 h-3.5 text-green-500" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- 空列表提示 -->
        <div v-else class="py-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-3 text-center">
          <div class="p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
            <Palette class="w-8 h-8 opacity-50" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">暂无画风预设</p>
            <p class="text-xs mt-1">点击右上角「新建画风」录入您喜爱的艺术家风格或渲染画风 Tag</p>
          </div>
          <button 
            @click="openAddModal" 
            class="mt-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-purple-600/20"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新建第一个画风预设</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 新建/编辑预设模态框 -->
    <div 
      v-if="showEditModal" 
      class="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      @click.self="showEditModal = false"
    >
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <h4 class="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Palette class="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>{{ editingPreset.id ? '编辑画风预设' : '新建画风预设' }}</span>
          </h4>
          <button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="flex flex-col gap-3 text-xs">
          <div>
            <label class="block font-semibold text-gray-700 dark:text-gray-300 mb-1">画风名称 *</label>
            <input 
              v-model="editingPreset.name" 
              type="text" 
              placeholder="如：新海诚光影 / 复古赛博朋克 / 水彩插画" 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-gray-700 dark:text-gray-300 mb-1">画风分类</label>
            <input 
              v-model="editingPreset.category" 
              type="text" 
              placeholder="如：插画 / 赛博 / 水彩 / 像素 / 厚涂" 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label class="block font-semibold text-gray-700 dark:text-gray-300 mb-1">画风提示词 (Prompt) *</label>
            <textarea 
              v-model="editingPreset.prompt" 
              rows="3" 
              placeholder="如：makoto shinkai style, cinematic lighting, vibrant sky, volumetric rays"
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-purple-500 font-mono resize-none custom-scrollbar"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button 
            @click="showEditModal = false"
            class="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
          >
            取消
          </button>
          <button 
            @click="handleSaveCustomPreset"
            class="px-4 py-2 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md shadow-purple-600/20 transition active:scale-95"
          >
            保存预设
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
