<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useGenerationStore, isImageUpscaled, type GeneratedImage } from '../stores/generation';
import { useAuthStore } from '../stores/auth';
import { 
  X, Sparkles, UploadCloud, AlertCircle, Check, Loader2, 
  ArrowRight, Image as ImageIcon, Zap, AlertTriangle, RefreshCw
} from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
  targetImage?: GeneratedImage | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'success', image: GeneratedImage): void;
}>();

const genStore = useGenerationStore();
const authStore = useAuthStore();

// 官方最大输入像素限制：1,048,576 像素 (等效 1024x1024)
const MAX_PIXELS = 1048576;

// 模式：'current' (已有图片) 或 'upload' (本地上传)
const activeTab = ref<'current' | 'upload'>('current');

// 当前待处理的图像数据
const activeDataUrl = ref<string>('');
const rawWidth = ref<number>(0);
const rawHeight = ref<number>(0);
const originalPrompt = ref<string>('');
const originalParams = ref<any>(null);

// 计算目标分辨率 (官方固定规格：长宽各放大 2 倍，总像素放大 4 倍)
const targetWidth = computed(() => Math.round(rawWidth.value * 2));
const targetHeight = computed(() => Math.round(rawHeight.value * 2));
const targetPixels = computed(() => targetWidth.value * targetHeight.value);

// 上传交互与拖拽状态
const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const errorMessage = ref<string>('');
const successToast = ref<string>('');

// 计算原图像素数与超限判断
const totalPixels = computed(() => rawWidth.value * rawHeight.value);
const isOverLimit = computed(() => totalPixels.value > MAX_PIXELS);

// 加载指定 DataURL 并读取其实际宽高
const loadDataUrlWithDimensions = (dataUrl: string, prompt = '', params: any = null) => {
  errorMessage.value = '';
  activeDataUrl.value = dataUrl;
  originalPrompt.value = prompt;
  originalParams.value = params;

  const img = new Image();
  img.onload = () => {
    rawWidth.value = img.naturalWidth || img.width;
    rawHeight.value = img.naturalHeight || img.height;
  };
  img.onerror = () => {
    errorMessage.value = '解析图片尺寸失败，请确认图片文件完整有效';
  };
  img.src = dataUrl;
};

// 初始化当前图像
const syncWithInitialImage = () => {
  errorMessage.value = '';
  successToast.value = '';

  const imgToUse = props.targetImage || genStore.currentImage;
  if (imgToUse && imgToUse.url) {
    activeTab.value = 'current';
    loadDataUrlWithDimensions(imgToUse.url, imgToUse.params?.prompt || '', imgToUse.params);
  } else {
    activeTab.value = 'upload';
    activeDataUrl.value = '';
    rawWidth.value = 0;
    rawHeight.value = 0;
    originalPrompt.value = '';
    originalParams.value = null;
  }
};

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    syncWithInitialImage();
  }
});

// 处理本地文件上传
const handleFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    errorMessage.value = '请选择有效的图片文件 (PNG, JPG, WEBP)';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    if (dataUrl) {
      // 保证统一转换为标准 PNG 格式，避免非 PNG 图片直接上传时 NovelAI 后端报错
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (dataUrl.startsWith('data:image/png;base64,')) {
          loadDataUrlWithDimensions(dataUrl, file.name, null);
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            loadDataUrlWithDimensions(canvas.toDataURL('image/png'), file.name, null);
          } else {
            loadDataUrlWithDimensions(dataUrl, file.name, null);
          }
        }
        activeTab.value = 'upload';
      };
      img.onerror = () => {
        errorMessage.value = '解析图片尺寸失败';
      };
      img.src = dataUrl;
    }
  };
  reader.onerror = () => {
    errorMessage.value = '读取本地图片失败';
  };
  reader.readAsDataURL(file);
};

const onFileInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    handleFile(target.files[0]);
  }
  target.value = '';
};

const onDrop = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    activeTab.value = 'upload';
    handleFile(e.dataTransfer.files[0]);
  }
};

// 辅助功能：一键将超限大图等比等面积缩放至 ≤ 1,048,576
const isResizing = ref(false);
const autoFitToLimit = () => {
  if (!activeDataUrl.value || !isOverLimit.value) return;
  isResizing.value = true;
  errorMessage.value = '';

  try {
    const img = new Image();
    img.onload = () => {
      const currentPixels = img.naturalWidth * img.naturalHeight;
      // 留一点安全裕量 (乘以 0.99)
      const ratio = Math.sqrt((MAX_PIXELS * 0.99) / currentPixels);
      const newW = Math.round(img.naturalWidth * ratio);
      const newH = Math.round(img.naturalHeight * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化 Canvas 上下文');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, newW, newH);

      const fittedDataUrl = canvas.toDataURL('image/png');
      loadDataUrlWithDimensions(fittedDataUrl, originalPrompt.value, originalParams.value);
      isResizing.value = false;
    };
    img.onerror = () => {
      isResizing.value = false;
      errorMessage.value = '缩放图片失败';
    };
    img.src = activeDataUrl.value;
  } catch (err: any) {
    isResizing.value = false;
    errorMessage.value = err.message || '自动缩放失败';
  }
};

// 执行超分辨率放大
const handleStartUpscale = async () => {
  if (!activeDataUrl.value) {
    errorMessage.value = '请先选择或导入图片';
    return;
  }
  if (isOverLimit.value) {
    errorMessage.value = '原图尺寸超过输入限制（最大 1,048,576 像素），请先缩放后重试';
    return;
  }

  errorMessage.value = '';
  try {
    const result = await genStore.upscaleImage({
      image: activeDataUrl.value,
      width: rawWidth.value,
      height: rawHeight.value,
      scale: 2,
      originalPrompt: originalPrompt.value,
      originalParams: originalParams.value
    });

    emit('success', result);
    emit('update:modelValue', false);
  } catch (err: any) {
    errorMessage.value = err.message || '超分辨率处理失败';
  }
};
</script>

<template>
  <div 
    v-if="modelValue" 
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none"
    @click.self="emit('update:modelValue', false)"
    @dragover.stop.prevent="isDragging = true"
    @dragleave.stop.prevent="isDragging = false"
    @drop.stop.prevent="onDrop"
  >
    <!-- 全局文件上传 input，始终挂载在 DOM，解决更换图片按钮因条件渲染导致 ref 丢失问题 -->
    <input 
      ref="fileInputRef" 
      type="file" 
      accept="image/png,image/jpeg,image/webp" 
      class="hidden" 
      @change="onFileInputChange" 
    />

    <div 
      class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all text-gray-800 dark:text-gray-100"
    >
      <!-- 弹窗顶栏 -->
      <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50/60 dark:bg-gray-950/40">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center shrink-0">
            <Sparkles class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold tracking-tight text-gray-900 dark:text-gray-100">图像超分辨率</h3>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">提升画面分辨率并重构高频细节</p>
          </div>
        </div>
        <button 
          @click="emit('update:modelValue', false)"
          class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 弹窗主体内容滚动区 -->
      <div class="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-4">
        
        <!-- 来源模式切换 Tab -->
        <div class="flex items-center p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl text-xs font-medium">
          <button 
            @click="activeTab = 'current'; syncWithInitialImage()"
            class="flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5"
            :class="activeTab === 'current' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm font-semibold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'"
          >
            <ImageIcon class="w-3.5 h-3.5" />
            <span>当前画布</span>
          </button>
          <button 
            @click="activeTab = 'upload'"
            class="flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5"
            :class="activeTab === 'upload' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm font-semibold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'"
          >
            <UploadCloud class="w-3.5 h-3.5" />
            <span>本地导入</span>
          </button>
        </div>

        <!-- 本地上传拖拽区 (上传 Tab 激活或未选择图片时展示) -->
        <div 
          v-if="activeTab === 'upload' && !activeDataUrl"
          @dragover.stop.prevent="isDragging = true"
          @dragleave.stop.prevent="isDragging = false"
          @drop.stop.prevent="onDrop"
          @click="fileInputRef?.click()"
          class="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition text-center"
          :class="isDragging ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-950/30'"
        >
          <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <UploadCloud class="w-5 h-5" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">选择或拖拽图片至此处</p>
            <p class="text-[11px] text-gray-400 mt-0.5">支持 PNG、JPG、WEBP 格式</p>
          </div>
        </div>

        <!-- 当前选中图片预览与分辨率卡片 -->
        <div v-if="activeDataUrl" class="space-y-3">
          <div class="flex items-center gap-3.5 p-3 bg-gray-50/80 dark:bg-gray-950/40 rounded-xl border border-gray-200/80 dark:border-gray-800">
            <!-- 缩略图 -->
            <div class="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-200/50 dark:bg-gray-800/50 shrink-0 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
              <img :src="activeDataUrl" class="w-full h-full object-contain" />
            </div>

            <!-- 分辨率与像素信息卡片 -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div class="flex items-center justify-between gap-1 mb-1.5">
                <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">分辨率变更</span>
                <button 
                  v-if="activeTab === 'upload'" 
                  @click="fileInputRef?.click()" 
                  class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                >
                  <RefreshCw class="w-3 h-3" />
                  <span>更换图片</span>
                </button>
              </div>

              <!-- 对比徽章 -->
              <div class="flex items-center gap-2 text-xs">
                <div class="bg-gray-200/70 dark:bg-gray-800 px-2.5 py-1 rounded-md font-mono text-gray-700 dark:text-gray-300">
                  {{ rawWidth }} × {{ rawHeight }}
                </div>
                <ArrowRight class="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div class="bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md font-mono font-semibold flex items-center gap-1 border border-blue-200/60 dark:border-blue-900/50">
                  <span>{{ targetWidth }} × {{ targetHeight }}</span>
                  <span class="text-[10px] opacity-75">(4× 面积)</span>
                </div>
              </div>

              <!-- 规格限制指示器 -->
              <div class="mt-2 flex items-center gap-1.5 text-[11px]">
                <template v-if="!isOverLimit">
                  <span class="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                    <Check class="w-3.5 h-3.5 text-emerald-500" />
                    <span>输入像素: {{ totalPixels.toLocaleString() }} / 1,048,576</span>
                  </span>
                </template>
                <template v-else>
                  <span class="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
                    <span>超出输入上限 ({{ totalPixels.toLocaleString() }} > 1,048,576 像素)</span>
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- 若已是超分图，给出直接提示 -->
          <div 
            v-if="activeTab === 'current' && isImageUpscaled(props.targetImage)" 
            class="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"
          >
            <AlertCircle class="w-4 h-4 text-amber-500 shrink-0" />
            <span>当前图片已是超分辨率放大产物，官方接口不支持对已超分图片再次放大。</span>
          </div>

          <!-- 超限警示与一键适配按钮条 -->
          <div 
            v-else-if="isOverLimit" 
            class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-red-700 dark:text-red-300 animate-fade-in"
          >
            <div class="flex items-start gap-2">
              <AlertCircle class="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>原图尺寸超过接口输入限制（最大 1,048,576 像素）。</span>
            </div>
            <button 
              @click="autoFitToLimit"
              :disabled="isResizing"
              class="w-full sm:w-auto px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition text-xs shrink-0 flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
            >
              <Loader2 v-if="isResizing" class="w-3 h-3 animate-spin" />
              <span>等比缩放至上限</span>
            </button>
          </div>
        </div>

        <!-- 规格说明卡片 -->
        <div class="border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/30 rounded-xl p-3.5 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">
              放大倍率
            </span>
            <span class="text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              宽高 200% · 像素 4×
            </span>
          </div>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            基于深度学习超分辨率算法重建高频细节，长宽各扩展为 2 倍，提升边缘清晰度。
          </p>
          <div class="flex items-center justify-between text-[11px] font-mono text-gray-600 dark:text-gray-400 pt-2 border-t border-gray-200/60 dark:border-gray-800/60">
            <span>输出规格</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">
              {{ rawWidth ? Math.round(rawWidth * 2) : 0 }} × {{ rawHeight ? Math.round(rawHeight * 2) : 0 }}
              <span class="font-normal text-gray-400">({{ targetPixels.toLocaleString() }} px)</span>
            </span>
          </div>
        </div>

        <!-- 点数消耗卡片 -->
        <div class="p-3 bg-gray-50/60 dark:bg-gray-950/30 border border-gray-200 dark:border-gray-800 rounded-xl flex items-center justify-between text-xs">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center shrink-0">
              <Zap class="w-3.5 h-3.5" />
            </div>
            <div>
              <div class="font-semibold text-gray-800 dark:text-gray-200">消耗 1 点数</div>
              <p class="text-[10px] text-gray-400">单次超分固定扣除（所有订阅层级均计费）</p>
            </div>
          </div>
          <div class="text-right shrink-0 font-mono">
            <span class="text-gray-400 text-[10px] block">当前余额</span>
            <span class="font-semibold text-gray-800 dark:text-gray-200">{{ authStore.anlas.toLocaleString() }} 点</span>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>

      </div>

      <!-- 弹窗底栏操作按钮 -->
      <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/40 flex items-center justify-between shrink-0">
        <button 
          @click="emit('update:modelValue', false)"
          :disabled="genStore.isUpscaling"
          class="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition disabled:opacity-50"
        >
          取消
        </button>

        <button 
          @click="handleStartUpscale"
          :disabled="!activeDataUrl || isOverLimit || genStore.isUpscaling || (activeTab === 'current' && isImageUpscaled(props.targetImage))"
          class="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs sm:text-sm font-medium rounded-xl shadow-sm shadow-blue-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center gap-2"
        >
          <Loader2 v-if="genStore.isUpscaling" class="w-4 h-4 animate-spin" />
          <Sparkles v-else class="w-4 h-4" />
          <span>{{ genStore.isUpscaling ? '正在处理...' : ((activeTab === 'current' && isImageUpscaled(props.targetImage)) ? '该图已完成超分' : '开始超分 (消耗 1 点)') }}</span>
        </button>
      </div>

    </div>
  </div>
</template>
