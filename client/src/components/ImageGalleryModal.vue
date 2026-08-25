<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGenerationStore, type GeneratedImage } from '../stores/generation';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  X, Search, Calendar, Download, Trash2, SlidersHorizontal, 
  Paintbrush, Copy, Check, Archive, CheckSquare, Square, 
  ChevronLeft, ChevronRight, Grid, 
  Layers, Clock, ArrowUpDown
} from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'send-inpaint', item: GeneratedImage): void;
}>();

const genStore = useGenerationStore();

// 筛选与搜索状态
const searchQuery = ref('');
const timeFilter = ref<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
const customStartDate = ref('');
const customEndDate = ref('');
const sortOrder = ref<'desc' | 'asc'>('desc'); // desc: 最新在前, asc: 最旧在前
const viewMode = ref<'grid' | 'compact'>('grid'); // grid: 经典网格, compact: 紧凑网格

// 选中的单张详情图
const selectedImage = ref<GeneratedImage | null>(null);
const isDetailOpen = ref(false);

// 批量选择状态
const isBatchMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

// 打包下载进度
const isZipping = ref(false);
const zipProgress = ref(0);
const zipStatusText = ref('');

// 复制状态提示
const copiedKey = ref<string | null>(null);
const copyTimeout = ref<any>(null);

const triggerCopyFeedback = (key: string) => {
  copiedKey.value = key;
  if (copyTimeout.value) clearTimeout(copyTimeout.value);
  copyTimeout.value = setTimeout(() => {
    copiedKey.value = null;
  }, 1800);
};

// 复制文本
const copyText = (text: string, key: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
  triggerCopyFeedback(key);
};

// 计算时间过滤与搜索过滤后的历史列表
const filteredImages = computed(() => {
  let list = [...genStore.history];

  // 1. 时间过滤
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfThisWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
  const startOfThisMonth = startOfToday - 30 * 24 * 60 * 60 * 1000;

  if (timeFilter.value === 'today') {
    list = list.filter(item => item.timestamp >= startOfToday);
  } else if (timeFilter.value === 'yesterday') {
    list = list.filter(item => item.timestamp >= startOfYesterday && item.timestamp < startOfToday);
  } else if (timeFilter.value === 'week') {
    list = list.filter(item => item.timestamp >= startOfThisWeek);
  } else if (timeFilter.value === 'month') {
    list = list.filter(item => item.timestamp >= startOfThisMonth);
  } else if (timeFilter.value === 'custom') {
    if (customStartDate.value) {
      const startMs = new Date(`${customStartDate.value}T00:00:00`).getTime();
      list = list.filter(item => item.timestamp >= startMs);
    }
    if (customEndDate.value) {
      const endMs = new Date(`${customEndDate.value}T23:59:59.999`).getTime();
      list = list.filter(item => item.timestamp <= endMs);
    }
  }

  // 2. 搜索过滤 (Prompt, Negative Prompt, Seed, Model)
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(item => {
      const promptMatch = item.params.prompt?.toLowerCase().includes(q);
      const negMatch = item.params.negative_prompt?.toLowerCase().includes(q);
      const seedMatch = String(item.params.seed || '').includes(q);
      const modelMatch = item.params.model?.toLowerCase().includes(q);
      const charMatch = item.params.characters?.some(c => c.prompt?.toLowerCase().includes(q));
      return promptMatch || negMatch || seedMatch || modelMatch || charMatch;
    });
  }

  // 3. 排序
  list.sort((a, b) => {
    return sortOrder.value === 'desc' 
      ? b.timestamp - a.timestamp 
      : a.timestamp - b.timestamp;
  });

  return list;
});

// 按日期分组聚合
const groupedImages = computed(() => {
  const groups: { dateStr: string; images: GeneratedImage[] }[] = [];
  const map = new Map<string, GeneratedImage[]>();

  for (const img of filteredImages.value) {
    const d = new Date(img.timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(dateStr)) {
      map.set(dateStr, []);
    }
    map.get(dateStr)!.push(img);
  }

  for (const [dateStr, imgs] of map.entries()) {
    groups.push({ dateStr, images: imgs });
  }

  return groups;
});

// 单击图片打开大图详情
const openDetail = (img: GeneratedImage) => {
  if (isBatchMode.value) {
    toggleSelect(item => item.id === img.id ? img.id : '');
    return;
  }
  img.isNew = false;
  selectedImage.value = img;
  isDetailOpen.value = true;
};

// 键盘导航 (上一张/下一张)
const navigateImage = (direction: 'prev' | 'next') => {
  if (!selectedImage.value) return;
  const list = filteredImages.value;
  const currentIndex = list.findIndex(item => item.id === selectedImage.value?.id);
  if (currentIndex === -1) return;

  if (direction === 'prev' && currentIndex > 0) {
    selectedImage.value = list[currentIndex - 1];
  } else if (direction === 'next' && currentIndex < list.length - 1) {
    selectedImage.value = list[currentIndex + 1];
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.modelValue) return;
  if (isDetailOpen.value) {
    if (e.key === 'ArrowLeft') navigateImage('prev');
    if (e.key === 'ArrowRight') navigateImage('next');
    if (e.key === 'Escape') isDetailOpen.value = false;
  }
};

onMounted(() => window.addEventListener('keydown', handleKeyDown));
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));

// 选择管理
const toggleSelect = (idOrFn: string | ((i: any) => string)) => {
  const id = typeof idOrFn === 'function' ? idOrFn(selectedImage.value) : idOrFn;
  if (!id) return;
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const selectAll = () => {
  selectedIds.value = new Set(filteredImages.value.map(i => i.id));
};

const clearSelection = () => {
  selectedIds.value.clear();
};

// 单张下载
const downloadSingleImage = (img: GeneratedImage) => {
  const link = document.createElement('a');
  link.href = img.url;
  link.download = `novelai-${img.params.seed || Date.now()}-${img.id.slice(0, 6)}.png`;
  link.click();
};

// 批量打包 ZIP 下载
const downloadBatchZip = async () => {
  const targets = filteredImages.value.filter(img => 
    selectedIds.value.size > 0 ? selectedIds.value.has(img.id) : true
  );

  if (targets.length === 0) {
    alert('当前没有可打包下载的图片！');
    return;
  }

  isZipping.value = true;
  zipProgress.value = 0;
  zipStatusText.value = '正在初始化压缩包...';

  try {
    const zip = new JSZip();
    const folder = zip.folder('novelai-gallery-images');

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      zipStatusText.value = `正在处理第 ${i + 1}/${targets.length} 张图片...`;
      zipProgress.value = Math.round(((i + 1) / targets.length) * 80);

      const base64Data = item.url.replace(/^data:image\/png;base64,/, '');
      const filename = `${new Date(item.timestamp).toISOString().replace(/[:.]/g, '-')}_seed${item.params.seed || 'none'}_${item.id.slice(0, 6)}.png`;
      folder?.file(filename, base64Data, { base64: true });
    }

    zipStatusText.value = '正在打包生成 ZIP 文件...';
    zipProgress.value = 90;

    const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      zipProgress.value = 90 + Math.round(metadata.percent * 0.1);
    });

    const dateTag = new Date().toISOString().split('T')[0];
    saveAs(content, `novelai-images-export-${dateTag}.zip`);

    zipStatusText.value = '打包完成！';
    setTimeout(() => {
      isZipping.value = false;
      zipProgress.value = 0;
    }, 1500);
  } catch (err: any) {
    console.error('Batch zip failed:', err);
    alert('打包下载失败: ' + err.message);
    isZipping.value = false;
  }
};

// 单张删除
const deleteSingle = (img: GeneratedImage) => {
  if (confirm('确定要删除这张图片吗？此操作无法撤销。')) {
    genStore.deleteHistory(img.id);
    if (selectedImage.value?.id === img.id) {
      isDetailOpen.value = false;
      selectedImage.value = null;
    }
  }
};

// 批量删除
const deleteBatch = () => {
  if (selectedIds.value.size === 0) return;
  if (confirm(`确定要删除选中的 ${selectedIds.value.size} 张图片吗？此操作将同步从本地与云端删除。`)) {
    const idsToDelete = Array.from(selectedIds.value);
    for (const id of idsToDelete) {
      genStore.deleteHistory(id);
    }
    selectedIds.value.clear();
    isBatchMode.value = false;
  }
};

// 复用参数
const reuseParams = (img: GeneratedImage) => {
  genStore.useParams(img);
  emit('update:modelValue', false);
};

// 涂鸦重绘
const sendInpaint = (img: GeneratedImage) => {
  genStore.currentImage = img;
  genStore.sendToInpaint(img.url);
  emit('send-inpaint', img);
  emit('update:modelValue', false);
};

// 格式化时间
const formatTime = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

const formatDateFull = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${formatTime(timestamp)}`;
};
</script>

<template>
  <!-- 外层固定遮罩 (点击遮罩不会关闭弹窗，只有点击 [X] 关闭按钮才可关闭) -->
  <div 
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md animate-fade-in select-none"
  >
    <!-- 主弹窗卡片容器 (拦截冒泡以防点内部触发) -->
    <div 
      @click.stop
      class="w-full h-full max-w-7xl bg-white dark:bg-gray-900 rounded-2xl md:rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden text-gray-800 dark:text-gray-100"
    >
      <!-- 弹窗顶部操作栏 -->
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 shrink-0">
        <!-- 标题与总数统计 -->
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <Layers class="w-5 h-5" />
          </div>
          <div>
            <h2 class="text-base sm:text-lg font-bold flex items-center gap-2">
              <span>全屏历史图库</span>
              <span class="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                {{ filteredImages.length }} / {{ genStore.history.length }} 张
              </span>
            </h2>
            <p class="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:block">
              按时间与关键词精准检索、大图参数透视、批量重绘与一键 ZIP 打包
            </p>
          </div>
        </div>

        <!-- 顶部功能按钮群 -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- 批量选择模式切换 -->
          <button 
            @click="isBatchMode = !isBatchMode; if (!isBatchMode) selectedIds.clear();"
            class="text-xs px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 border"
            :class="isBatchMode ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'"
          >
            <CheckSquare v-if="isBatchMode" class="w-3.5 h-3.5 text-purple-600" />
            <Square v-else class="w-3.5 h-3.5 text-gray-400" />
            <span>{{ isBatchMode ? `批量操作 (${selectedIds.size})` : '批量选择' }}</span>
          </button>

          <!-- 批量打包下载 -->
          <button 
            @click="downloadBatchZip"
            :disabled="isZipping || filteredImages.length === 0"
            class="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition flex items-center gap-1.5 shadow-sm active:scale-95 shadow-blue-500/20"
            :title="selectedIds.size > 0 ? `打包下载选中的 ${selectedIds.size} 张图片` : '打包下载当前筛选的所有图片'"
          >
            <Archive class="w-3.5 h-3.5" :class="{ 'animate-spin': isZipping }" />
            <span>{{ selectedIds.size > 0 ? `打包选中 (${selectedIds.size})` : '一键打包下载' }}</span>
          </button>

          <!-- 批量删除按钮 (仅在选中时展示) -->
          <button 
            v-if="isBatchMode && selectedIds.size > 0"
            @click="deleteBatch"
            class="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition flex items-center gap-1.5 shadow-sm active:scale-95 animate-fade-in"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>删除选中 ({{ selectedIds.size }})</span>
          </button>

          <!-- 关闭弹窗按钮 -->
          <button 
            @click="emit('update:modelValue', false)"
            class="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition ml-1"
            title="关闭图库"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </header>

      <!-- 搜索与多维时间筛选工具栏 -->
      <div class="px-4 py-2.5 sm:px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <!-- 时间预设 Tab 切换 -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs font-semibold text-gray-500 flex items-center gap-1 mr-1">
            <Clock class="w-3.5 h-3.5" />
            时间:
          </span>
          <button 
            v-for="tab in [
              { id: 'all', label: '全部' },
              { id: 'today', label: '今天' },
              { id: 'yesterday', label: '昨天' },
              { id: 'week', label: '最近7天' },
              { id: 'month', label: '近30天' },
              { id: 'custom', label: '自定义日期' }
            ]"
            :key="tab.id"
            @click="timeFilter = tab.id as any"
            class="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
            :class="timeFilter === tab.id 
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- 自定义日期范围选择器 -->
        <div v-if="timeFilter === 'custom'" class="flex items-center gap-1.5 text-xs animate-fade-in">
          <input 
            type="date" 
            v-model="customStartDate" 
            class="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 outline-none text-xs" 
          />
          <span class="text-gray-400">至</span>
          <input 
            type="date" 
            v-model="customEndDate" 
            class="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 outline-none text-xs" 
          />
        </div>

        <!-- 搜索与视图控制 -->
        <div class="flex items-center gap-2.5 flex-1 max-w-md justify-end">
          <!-- 关键词搜索框 -->
          <div class="relative w-full max-w-xs">
            <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="搜索 Prompt / 负向词 / 种子..." 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
            <button 
              v-if="searchQuery" 
              @click="searchQuery = ''" 
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X class="w-3 h-3" />
            </button>
          </div>

          <!-- 排序切换 -->
          <button 
            @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
            class="p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-xs flex items-center gap-1 transition"
            :title="sortOrder === 'desc' ? '当前：最新在前 (点击切换升序)' : '当前：最旧在前 (点击切换降序)'"
          >
            <ArrowUpDown class="w-3.5 h-3.5" />
            <span class="text-[11px] hidden sm:inline">{{ sortOrder === 'desc' ? '最新' : '最旧' }}</span>
          </button>

          <!-- 视图网格切换 -->
          <button 
            @click="viewMode = viewMode === 'grid' ? 'compact' : 'grid'"
            class="p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-xs transition"
            :title="viewMode === 'grid' ? '切换为紧凑视图' : '切换为大图网格'"
          >
            <Grid class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 批量选择悬浮操作副栏 -->
      <div 
        v-if="isBatchMode" 
        class="px-6 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-100 dark:border-purple-900/50 flex items-center justify-between text-xs animate-fade-in"
      >
        <div class="flex items-center gap-3">
          <span class="font-bold text-purple-700 dark:text-purple-300">已选择 {{ selectedIds.size }} 项</span>
          <button @click="selectAll" class="text-blue-600 dark:text-blue-400 hover:underline font-medium">全选当前筛选 ({{ filteredImages.length }})</button>
          <button @click="clearSelection" class="text-gray-500 hover:underline">取消选择</button>
        </div>
        <span class="text-[11px] text-purple-600/80 dark:text-purple-400/80">提示：点击卡片可快速多选，支持一键批量打包或删除</span>
      </div>

      <!-- 打包进度条 -->
      <div v-if="isZipping" class="px-6 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 text-xs animate-fade-in">
        <div class="flex justify-between items-center mb-1 text-blue-700 dark:text-blue-300 font-medium">
          <span>{{ zipStatusText }}</span>
          <span class="font-mono font-bold">{{ zipProgress }}%</span>
        </div>
        <div class="w-full h-1.5 bg-blue-200 dark:bg-blue-900/60 rounded-full overflow-hidden">
          <div class="h-full bg-blue-600 rounded-full transition-all duration-200" :style="{ width: `${zipProgress}%` }"></div>
        </div>
      </div>

      <!-- 主图库展示流 -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-gray-100/60 dark:bg-gray-950/60">
        <!-- 空状态 -->
        <div v-if="filteredImages.length === 0" class="h-full flex flex-col items-center justify-center py-20 text-center text-gray-400">
          <div class="w-16 h-16 rounded-full bg-gray-200/60 dark:bg-gray-800/60 flex items-center justify-center mb-3">
            <Layers class="w-8 h-8 opacity-40" />
          </div>
          <p class="text-sm font-semibold mb-1">未找到符合条件的历史图片</p>
          <p class="text-xs text-gray-500">可尝试切换时间范围或清除搜索关键词</p>
        </div>

        <!-- 按日期分组卡片列表 -->
        <div v-else class="flex flex-col gap-6">
          <section v-for="group in groupedImages" :key="group.dateStr" class="flex flex-col gap-3">
            <!-- 日期组标题头 -->
            <div class="flex items-center gap-2.5 pb-1 border-b border-gray-200 dark:border-gray-800">
              <Calendar class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 class="text-xs sm:text-sm font-bold font-mono text-gray-700 dark:text-gray-200">{{ group.dateStr }}</h3>
              <span class="text-[11px] text-gray-400 font-mono">({{ group.images.length }} 张)</span>
            </div>

            <!-- 图片网格 -->
            <div 
              class="grid gap-3 sm:gap-4"
              :class="viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'"
            >
              <div 
                v-for="item in group.images" 
                :key="item.id"
                @click="openDetail(item)"
                class="group relative rounded-2xl overflow-hidden border-2 transition-all bg-white dark:bg-gray-900 cursor-pointer flex flex-col hover:shadow-md"
                :class="[
                  selectedIds.has(item.id) 
                    ? 'border-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.3)] ring-2 ring-purple-400' 
                    : (genStore.currentImage?.id === item.id ? 'border-blue-500 shadow-md' : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700')
                ]"
              >
                <!-- 缩略图容器 (点击直达大图透视) -->
                <div class="relative w-full aspect-[2/3] bg-gray-100 dark:bg-gray-950 flex items-center justify-center overflow-hidden">
                  <img 
                    :src="item.url" 
                    loading="lazy"
                    class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-102" 
                  />

                  <!-- 多选复选框 -->
                  <div 
                    v-if="isBatchMode" 
                    @click.stop="toggleSelect(item.id)"
                    class="absolute top-2 left-2 z-20 p-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white shadow"
                  >
                    <CheckSquare v-if="selectedIds.has(item.id)" class="w-4 h-4 text-purple-400" />
                    <Square v-else class="w-4 h-4 text-gray-300" />
                  </div>

                  <!-- 尺寸与时间徽章 -->
                  <div class="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between items-center text-[9px] font-mono text-white pointer-events-none z-10">
                    <span class="bg-black/65 px-1.5 py-0.5 rounded backdrop-blur-sm shadow-sm">{{ item.params.width }}x{{ item.params.height }}</span>
                    <span class="bg-black/65 px-1.5 py-0.5 rounded backdrop-blur-sm shadow-sm">{{ formatTime(item.timestamp) }}</span>
                  </div>
                </div>

                <!-- 底部常驻信息与操作栏 (移动端直观可点，绝不依赖 Hover) -->
                <div v-if="viewMode === 'grid'" class="p-2.5 bg-white dark:bg-gray-900 flex flex-col gap-1.5 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div class="truncate font-mono text-gray-600 dark:text-gray-300 text-[11px]" :title="item.params.prompt">
                    {{ item.params.prompt || '无提示词' }}
                  </div>
                  <div class="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                    <span>Seed: {{ item.params.seed || '随机' }}</span>
                    <span class="text-blue-600 dark:text-blue-400 font-semibold">{{ item.params.steps || 28 }}步</span>
                  </div>

                  <!-- 显式按钮条：重绘/复用/下载/删除 -->
                  <div class="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-800/80">
                    <div class="flex items-center gap-1">
                      <button 
                        @click.stop="sendInpaint(item)"
                        class="px-2 py-1 rounded-lg text-[11px] text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 bg-gray-100 hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-950/40 transition flex items-center gap-1 active:scale-95"
                        title="发送到涂鸦重绘"
                      >
                        <Paintbrush class="w-3 h-3 text-blue-500" />
                        <span>重绘</span>
                      </button>
                      <button 
                        @click.stop="reuseParams(item)"
                        class="px-2 py-1 rounded-lg text-[11px] text-gray-700 hover:text-purple-600 dark:text-gray-300 dark:hover:text-purple-400 bg-gray-100 hover:bg-purple-50 dark:bg-gray-800 dark:hover:bg-purple-950/40 transition flex items-center gap-1 active:scale-95"
                        title="复用此图生成参数"
                      >
                        <SlidersHorizontal class="w-3 h-3 text-purple-500" />
                        <span>复用</span>
                      </button>
                    </div>

                    <div class="flex items-center gap-1">
                      <button 
                        @click.stop="downloadSingleImage(item)"
                        class="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition active:scale-95"
                        title="下载单张原图"
                      >
                        <Download class="w-3.5 h-3.5" />
                      </button>
                      <button 
                        @click.stop="deleteSingle(item)"
                        class="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition active:scale-95"
                        title="删除此图"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- 大图与全部参数透视弹窗 (Lightbox Detail Inspector) -->
    <div 
      v-if="isDetailOpen && selectedImage"
      @click.stop
      class="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-lg animate-fade-in"
    >
      <div 
        @click.stop
        class="w-full h-full max-w-6xl bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col md:flex-row overflow-hidden"
      >
        <!-- 左侧大图预览区域 (带清晰顶部导航栏，绝不遮挡画面) -->
        <div class="relative flex-1 bg-gray-950 flex flex-col overflow-hidden">
          <!-- 预览顶部导航栏 -->
          <div class="flex items-center justify-between px-4 py-2.5 bg-black/40 border-b border-white/10 text-white shrink-0">
            <!-- 上一张 / 下一张导航按键 -->
            <div class="flex items-center gap-2">
              <button 
                @click="navigateImage('prev')"
                class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1 text-xs active:scale-95"
                title="上一张 (左箭头 ←)"
              >
                <ChevronLeft class="w-4 h-4" />
                <span>上一张</span>
              </button>
              <button 
                @click="navigateImage('next')"
                class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1 text-xs active:scale-95"
                title="下一张 (右箭头 →)"
              >
                <span>下一张</span>
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>

            <!-- 右侧操作 -->
            <div class="flex items-center gap-2">
              <button 
                @click="downloadSingleImage(selectedImage)"
                class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-1.5 text-xs active:scale-95 shadow-sm"
                title="下载此原图"
              >
                <Download class="w-3.5 h-3.5" />
                <span>下载原图</span>
              </button>
            </div>
          </div>

          <!-- 大图正中展示容器 -->
          <div class="flex-1 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
            <img 
              :src="selectedImage.url" 
              class="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-all" 
            />
          </div>
        </div>

        <!-- 右侧全部生成参数透视与操作栏 (可滚动) -->
        <div class="w-full md:w-96 p-5 sm:p-6 bg-white dark:bg-gray-900 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-800 flex flex-col justify-between overflow-y-auto custom-scrollbar shrink-0">
          <div class="flex flex-col gap-4">
            <!-- 头部操作按钮组 (X 位于弹窗最右上角) -->
            <div class="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div class="flex flex-col">
                <span class="text-sm font-bold">图像生成详情</span>
                <span class="text-[11px] text-gray-400 font-mono">{{ formatDateFull(selectedImage.timestamp) }}</span>
              </div>
              <div class="flex items-center gap-1">
                <button 
                  @click="deleteSingle(selectedImage)"
                  class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition"
                  title="删除这张图片"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
                <button 
                  @click="isDetailOpen = false"
                  class="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition ml-1"
                  title="关闭详情 (Esc)"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
            </div>

            <!-- 正向提示词 -->
            <div class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <label class="text-xs font-bold text-gray-600 dark:text-gray-400">正向提示词 (Prompt)</label>
                <button 
                  @click="copyText(selectedImage.params.prompt, 'prompt')"
                  class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Check v-if="copiedKey === 'prompt'" class="w-3 h-3 text-green-500" />
                  <Copy v-else class="w-3 h-3" />
                  <span>{{ copiedKey === 'prompt' ? '已复制' : '复制' }}</span>
                </button>
              </div>
              <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-xs font-mono text-gray-800 dark:text-gray-200 max-h-28 overflow-y-auto custom-scrollbar select-text">
                {{ selectedImage.params.prompt || '(无正向提示词)' }}
              </div>
            </div>

            <!-- 反向提示词 -->
            <div class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <label class="text-xs font-bold text-gray-600 dark:text-gray-400">反向提示词 (Negative)</label>
                <button 
                  @click="copyText(selectedImage.params.negative_prompt, 'neg')"
                  class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Check v-if="copiedKey === 'neg'" class="w-3 h-3 text-green-500" />
                  <Copy v-else class="w-3 h-3" />
                  <span>{{ copiedKey === 'neg' ? '已复制' : '复制' }}</span>
                </button>
              </div>
              <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-xs font-mono text-gray-500 dark:text-gray-400 max-h-24 overflow-y-auto custom-scrollbar select-text">
                {{ selectedImage.params.negative_prompt || '(默认/空)' }}
              </div>
            </div>

            <!-- 核心生成参数网格 -->
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex flex-col">
                <span class="text-[10px] text-gray-400">随机种子 (Seed)</span>
                <span class="font-mono font-semibold truncate">{{ selectedImage.params.seed }}</span>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex flex-col">
                <span class="text-[10px] text-gray-400">分辨率 (Resolution)</span>
                <span class="font-mono font-semibold">{{ selectedImage.params.width }} x {{ selectedImage.params.height }}</span>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex flex-col">
                <span class="text-[10px] text-gray-400">采样步数 (Steps)</span>
                <span class="font-mono font-semibold">{{ selectedImage.params.steps }} 步</span>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex flex-col">
                <span class="text-[10px] text-gray-400">CFG Scale</span>
                <span class="font-mono font-semibold">{{ selectedImage.params.scale }}</span>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex flex-col">
                <span class="text-[10px] text-gray-400">采样器 (Sampler)</span>
                <span class="font-mono font-semibold truncate">{{ selectedImage.params.sampler }}</span>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex flex-col">
                <span class="text-[10px] text-gray-400">模型 (Model)</span>
                <span class="font-mono font-semibold truncate">{{ selectedImage.params.model }}</span>
              </div>
            </div>
          </div>

          <!-- 底部重绘与复用按钮栏 -->
          <div class="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
            <button 
              @click="sendInpaint(selectedImage)"
              class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.99] text-xs"
            >
              <Paintbrush class="w-4 h-4" />
              <span>发送到涂鸦重绘 (Inpaint)</span>
            </button>
            <button 
              @click="reuseParams(selectedImage)"
              class="w-full py-2.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl font-medium transition flex items-center justify-center gap-2 active:scale-[0.99] text-xs"
            >
              <SlidersHorizontal class="w-4 h-4" />
              <span>复用此图全部参数</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
