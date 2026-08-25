<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useGenerationStore } from '../stores/generation';
import { encryptedAxios } from '../utils/api';
import { Tag, Sparkles } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  rows?: number;
  textareaClass?: string;
  id?: string;
  resizable?: boolean;
  storageKey?: string;
  minHeight?: number;
}>(), {
  placeholder: '',
  rows: 3,
  textareaClass: '',
  id: '',
  resizable: false,
  storageKey: '',
  minHeight: 60
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const authStore = useAuthStore();
const genStore = useGenerationStore();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const suggestions = ref<Array<{ tag: string; count?: number; confidence?: number }>>([]);
const isLoading = ref(false);
const activeIndex = ref<number>(-1);
const showDropdown = ref(false);
const currentQuery = ref('');
const tokenRange = ref<{ start: number; end: number }>({ start: 0, end: 0 });

// 内存缓存以提供毫秒级联想响应
const tagCache = new Map<string, Array<{ tag: string; count?: number; confidence?: number }>>();

let debounceTimer: any = null;

// 格式化使用热度数字 (如 2500000 -> 2.5M, 15000 -> 15k)
const formatCount = (count?: number) => {
  if (count === undefined || count === null) return '';
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(count);
};

// 获取光标当前所在词条片段 (按逗号与换行截断)
const getCurrentWordContext = () => {
  const el = textareaRef.value;
  if (!el) return null;

  const text = el.value;
  const cursor = el.selectionStart;

  // 向前查找最近的逗号或换行
  let start = cursor;
  while (start > 0 && text[start - 1] !== ',' && text[start - 1] !== '\n') {
    start--;
  }

  // 向后查找最近的逗号或换行
  let end = cursor;
  while (end < text.length && text[end] !== ',' && text[end] !== '\n') {
    end++;
  }

  const rawToken = text.substring(start, end);
  const leadingSpaces = rawToken.match(/^\s*/)?.[0]?.length || 0;
  const token = rawToken.trim();

  return {
    query: token,
    tokenStart: start + leadingSpaces,
    tokenEnd: end
  };
};

// 发起联想推荐请求
const fetchSuggestions = async (query: string) => {
  if (!genStore.enableTagSuggestions) {
    suggestions.value = [];
    showDropdown.value = false;
    return;
  }

  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) {
    suggestions.value = [];
    showDropdown.value = false;
    return;
  }

  // 查内存缓存
  const cacheKey = `${genStore.params.model || 'nai-diffusion-5-full'}:${trimmed}`;
  if (tagCache.has(cacheKey)) {
    suggestions.value = tagCache.get(cacheKey)!;
    showDropdown.value = suggestions.value.length > 0;
    activeIndex.value = -1;
    return;
  }

  try {
    isLoading.value = true;
    const headers: Record<string, string> = {};
    if (authStore.siteAccessKey) headers['x-access-key'] = authStore.siteAccessKey;
    if (authStore.token) {
      headers['Authorization'] = authStore.token === '__BUILTIN__' ? '__BUILTIN__' : `Bearer ${authStore.token}`;
    }

    const modelToUse = genStore.params.model || 'nai-diffusion-5-full';
    const res = await encryptedAxios({
      method: 'GET',
      url: `/api/generate-image/suggest-tags?model=${encodeURIComponent(modelToUse)}&prompt=${encodeURIComponent(trimmed)}`,
      headers
    });

    let tagsData = res.data;
    if (tagsData && Array.isArray(tagsData.tags)) {
      tagsData = tagsData.tags;
    } else if (tagsData && Array.isArray(tagsData.data)) {
      tagsData = tagsData.data;
    }

    if (Array.isArray(tagsData)) {
      const list = tagsData.slice(0, 10).map((item: any) => {
        if (typeof item === 'string') return { tag: item };
        return {
          tag: item.tag || item.title || item.name || '',
          count: item.count,
          confidence: item.confidence
        };
      }).filter(item => item.tag && item.tag.trim());

      tagCache.set(cacheKey, list);
      suggestions.value = list;
      showDropdown.value = list.length > 0;
      activeIndex.value = -1;
    } else {
      suggestions.value = [];
      showDropdown.value = false;
    }
  } catch (err) {
    // 忽略联想请求异常
    suggestions.value = [];
  } finally {
    isLoading.value = false;
  }
};

// 触发联想检测
const handleInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);

  if (!genStore.enableTagSuggestions) {
    suggestions.value = [];
    showDropdown.value = false;
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const ctx = getCurrentWordContext();
    if (ctx && ctx.query) {
      currentQuery.value = ctx.query;
      tokenRange.value = { start: ctx.tokenStart, end: ctx.tokenEnd };
      fetchSuggestions(ctx.query);
    } else {
      suggestions.value = [];
      showDropdown.value = false;
    }
  }, 150);
};

// 插入选中的词条
const applyTag = (selectedTag: string) => {
  const el = textareaRef.value;
  if (!el) return;

  const text = el.value;
  const ctx = getCurrentWordContext();
  
  let start = tokenRange.value.start;
  let end = tokenRange.value.end;
  
  // 如果当前还能取到更精确的光标词段，优先使用
  if (ctx && ctx.tokenStart <= el.selectionStart && ctx.tokenEnd >= el.selectionStart) {
    start = ctx.tokenStart;
    end = ctx.tokenEnd;
  }

  const before = text.substring(0, start);
  const after = text.substring(end);

  // 拼接词条，并自动补齐逗号与空格
  const cleanAfter = after.replace(/^[\s,]*/, '');
  const newText = `${before}${selectedTag}, ${cleanAfter}`;

  emit('update:modelValue', newText);
  showDropdown.value = false;
  suggestions.value = [];

  nextTick(() => {
    if (el) {
      el.focus();
      const nextPos = before.length + selectedTag.length + 2;
      el.setSelectionRange(nextPos, nextPos);
    }
  });
};

// 键盘导航 (上下选择、回车/Tab 确认、Esc 关闭)
const handleKeyDown = (e: KeyboardEvent) => {
  if (!showDropdown.value || suggestions.value.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (activeIndex.value < suggestions.value.length - 1) {
      activeIndex.value++;
    } else {
      activeIndex.value = 0;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (activeIndex.value > 0) {
      activeIndex.value--;
    } else {
      activeIndex.value = suggestions.value.length - 1;
    }
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (activeIndex.value >= 0 && activeIndex.value < suggestions.value.length) {
      e.preventDefault();
      applyTag(suggestions.value[activeIndex.value].tag);
    }
  } else if (e.key === 'Escape') {
    showDropdown.value = false;
  }
};

const handleBlur = () => {
  // 延迟关闭以便点击建议项生效
  setTimeout(() => {
    showDropdown.value = false;
  }, 200);
};

const handleFocus = () => {
  if (!genStore.enableTagSuggestions) return;
  const ctx = getCurrentWordContext();
  if (ctx && ctx.query && ctx.query.length >= 2) {
    fetchSuggestions(ctx.query);
  }
};

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (props.resizable && textareaRef.value) {
    const el = textareaRef.value;
    if (props.minHeight) {
      el.style.minHeight = `${props.minHeight}px`;
    }

    if (props.storageKey) {
      const savedHeight = localStorage.getItem(`prompt_height_${props.storageKey}`);
      if (savedHeight) {
        const h = parseInt(savedHeight, 10);
        if (!isNaN(h) && h >= (props.minHeight || 50)) {
          el.style.height = `${h}px`;
        }
      }

      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const currentHeight = (entry.target as HTMLElement).offsetHeight;
            if (currentHeight && currentHeight >= (props.minHeight || 50)) {
              localStorage.setItem(`prompt_height_${props.storageKey}`, String(currentHeight));
            }
          }
        });
        resizeObserver.observe(el);
      }
    }
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<template>
  <div class="relative w-full">
    <textarea 
      :id="id"
      ref="textareaRef"
      :value="modelValue" 
      @input="handleInput"
      @keydown="handleKeyDown"
      @blur="handleBlur"
      @focus="handleFocus"
      :rows="rows" 
      :placeholder="placeholder"
      :class="[
        'w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-[13.5px] sm:text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-500 custom-scrollbar transition-colors',
        resizable ? 'resize-y' : 'resize-none',
        textareaClass
      ]"
    ></textarea>

    <!-- 手机端/桌面端快捷横向滑动候选胶囊条 (位于输入框底部内嵌或吸附展示) -->
    <div 
      v-if="suggestions.length > 0 && showDropdown"
      class="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl overflow-hidden animate-fade-in"
    >
      <!-- 下拉列表模式 -->
      <div class="max-h-56 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5">
        <button 
          v-for="(item, idx) in suggestions" 
          :key="item.tag"
          type="button"
          @mousedown.prevent="applyTag(item.tag)"
          class="w-full text-left px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 group font-mono"
          :class="activeIndex === idx ? 'bg-blue-500 text-white font-semibold' : 'text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-950/50'"
        >
          <div class="flex items-center gap-1.5 truncate">
            <Tag class="w-3.5 h-3.5 shrink-0 opacity-60" />
            <span class="truncate">{{ item.tag }}</span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <span 
              v-if="item.count" 
              class="text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium"
              :class="activeIndex === idx ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
            >
              {{ formatCount(item.count) }}
            </span>
          </div>
        </button>
      </div>

      <!-- 底部操作与键盘提示栏 (PC端提示快捷键) -->
      <div class="px-3 py-1 bg-gray-50 dark:bg-gray-950/80 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 flex items-center justify-between">
        <span class="flex items-center gap-1">
          <Sparkles class="w-3 h-3 text-blue-500" />
          <span>NovelAI 联想推荐</span>
        </span>
        <span class="hidden sm:inline">↑↓ 切换 · Enter / Tab 上屏</span>
      </div>
    </div>
  </div>
</template>
