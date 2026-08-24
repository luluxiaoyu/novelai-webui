<script setup lang="ts">
import { useAuthStore } from './stores/auth';
import { useGenerationStore } from './stores/generation';
import { saveAs } from 'file-saver';
import { computed, ref, onMounted } from 'vue';
import { useDark, useToggle } from '@vueuse/core';
import { Sun, Moon, LogOut, Download, Copy, Loader2, Image as ImageIcon, X, Sparkles, KeyRound, History, Trash2, RefreshCw, SlidersHorizontal, Layers, Paintbrush } from 'lucide-vue-next';

const authStore = useAuthStore();
const genStore = useGenerationStore();

const isDark = useDark();
const toggleDark = useToggle(isDark);

const inputToken = ref('');
const showPromptHistory = ref(false);
const mobileTab = ref<'canvas' | 'controls' | 'history'>('canvas');
const historyFilter = ref('today');

const filteredHistory = computed(() => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfThisWeek = startOfToday - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
  
  return genStore.history.filter(item => {
    if (historyFilter.value === 'today') return item.timestamp >= startOfToday;
    if (historyFilter.value === 'yesterday') return item.timestamp >= startOfYesterday && item.timestamp < startOfToday;
    if (historyFilter.value === 'week') return item.timestamp >= startOfThisWeek;
    return true; // 'all'
  });
});

const isV3 = computed(() => {
  return genStore.params.model.includes('-3') || genStore.params.model.includes('safe-diffusion');
});

// 计算是否消耗点数及消耗提示
const costInfo = computed(() => {
  const isOpus = authStore.subscriptionTier === 3;
  const pixels = genStore.params.width * genStore.params.height;
  const isNormalSize = pixels <= 1048576; // <= 1024x1024 (或 832x1216 等标准分辨率)
  const isNormalSteps = genStore.params.steps <= 28;
  // 严格精确判断是否为 V5 模型 (避免 4-5-full 包含 -5 被误判)
  const isV5 = genStore.params.model.startsWith('nai-diffusion-5');

  if (!isOpus) {
    return {
      isFree: false,
      text: '消耗 anlas 点数',
      reason: '非 Opus 会员生图需扣费'
    };
  }

  // Opus 会员特权判断
  if (isNormalSize && isNormalSteps) {
    if (isV5) {
      if (authStore.v5UsagePercent > 0) {
        return {
          isFree: true,
          text: '免费 (消耗 V5 额度)',
          reason: 'Opus 专属免费生成'
        };
      } else {
        return {
          isFree: false,
          text: '消耗 anlas (V5 额度已尽)',
          reason: 'V5 免费额度已耗尽'
        };
      }
    }
    return {
      isFree: true,
      text: 'Opus 免费',
      reason: '标准尺寸与步数免费'
    };
  }

  const reasons = [];
  if (!isNormalSize) reasons.push('分辨率超出 1048576 像素');
  if (!isNormalSteps) reasons.push('采样步数超过 28 步');

  return {
    isFree: false,
    text: '需消耗 anlas',
    reason: reasons.join('，')
  };
});


// Inpaint 涂鸦画板与图片处理
const showMaskEditor = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
const brushSize = ref(30);

// 大图缩放与拖拽查看
const imgScale = ref(1);
const imgTranslate = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });

const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  // 优化缩放灵敏度（降低4倍，使用平滑对数/比例增量）
  const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
  const newScale = imgScale.value * zoomFactor;
  imgScale.value = Math.max(0.2, Math.min(5, Math.round(newScale * 100) / 100));
};

const resetZoom = () => {
  imgScale.value = 1;
  imgTranslate.value = { x: 0, y: 0 };
};

const startPan = (e: MouseEvent) => {
  if (e.button !== 0) return;
  isPanning.value = true;
  panStart.value = { x: e.clientX - imgTranslate.value.x, y: e.clientY - imgTranslate.value.y };
};

const doPan = (e: MouseEvent) => {
  if (!isPanning.value) return;
  imgTranslate.value = {
    x: e.clientX - panStart.value.x,
    y: e.clientY - panStart.value.y
  };
};

const stopPan = () => {
  isPanning.value = false;
};

const handleImageUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      genStore.params.image = result.split(',')[1];
      showMaskEditor.value = true;
      mobileTab.value = 'canvas';

      // 自动将生成宽高同步为上传底图的分辨率，并强制对齐到 64 的倍数
      const img = new Image();
      img.onload = () => {
        // NovelAI 强制要求分辨率是 64 的整数倍
        const targetWidth = Math.round(img.width / 64) * 64;
        const targetHeight = Math.round(img.height / 64) * 64;
        genStore.params.width = targetWidth;
        genStore.params.height = targetHeight;

        // 如果尺寸不符，重采样原图，防止 VAE 绿屏或后端报错
        // 即使尺寸相符，如果是用户上传的文件，也通过 Canvas 去除透明通道（透明通道也会导致 VAE 绿屏）
        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = targetWidth;
        resizeCanvas.height = targetHeight;
        const rctx = resizeCanvas.getContext('2d');
        if (rctx) {
          // 强制填充白底，去除任何 Alpha 通道
          rctx.fillStyle = 'white';
          rctx.fillRect(0, 0, targetWidth, targetHeight);
          rctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const dataUrl = resizeCanvas.toDataURL('image/png');
          genStore.params.image = dataUrl.split(',')[1];
          // 将刚上传的图设置为 currentImage，以便退出遮罩模式时能在中间展示
          genStore.currentImage = {
            id: 'uploaded-' + Date.now(),
            url: dataUrl,
            params: JSON.parse(JSON.stringify(genStore.params)),
            timestamp: Date.now()
          };
        }
      };
      img.src = result;

      initCanvas();
    };
    reader.readAsDataURL(file);
  }
};

const initCanvas = () => {
  setTimeout(() => {
    if (!canvasRef.value || !genStore.params.image) return;
    const canvas = canvasRef.value;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    img.src = `data:image/png;base64,${genStore.params.image}`;
  }, 100);
};

const startDraw = (e: MouseEvent | TouchEvent) => {
  isDrawing.value = true;
  draw(e);
};

const stopDraw = () => {
  isDrawing.value = false;
  exportMask();
};

const draw = (e: MouseEvent | TouchEvent) => {
  if (!isDrawing.value || !canvasRef.value) return;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x, y, brushSize.value * scaleX / 2, 0, Math.PI * 2);
  ctx.fill();
};

const exportMask = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  
  // 遮罩规范：黑底 (保留) + 白笔 (重绘)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const mCtx = maskCanvas.getContext('2d');
  if (mCtx) {
    // 填充透明黑底 (Alpha = 0) 以严格对齐官方遮罩格式
    mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    const drawCtx = canvas.getContext('2d');
    if (drawCtx) {
      const imgData = drawCtx.getImageData(0, 0, canvas.width, canvas.height);
      const maskData = mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      
      // NovelAI (V5/V3) VAE 潜空间严格依赖 8x8 像素块
      // 任何非 8x8 对齐的遮罩边缘都会导致 VAE 解码器产生 NaN 溢出（出现深绿色块）
      // 因此我们需要对遮罩进行 8x8 块的 max-pooling 扩充对齐
      for (let y = 0; y < canvas.height; y += 8) {
        for (let x = 0; x < canvas.width; x += 8) {
          let isPainted = false;
          // 检测 8x8 块内是否有涂抹像素
          for (let by = 0; by < 8; by++) {
            for (let bx = 0; bx < 8; bx++) {
              const py = y + by;
              const px = x + bx;
              if (py < canvas.height && px < canvas.width) {
                const i = (py * canvas.width + px) * 4;
                if (imgData.data[i + 3] > 0) {
                  isPainted = true;
                  break;
                }
              }
            }
            if (isPainted) break;
          }

          // 将整个 8x8 块统一填充
          for (let by = 0; by < 8; by++) {
            for (let bx = 0; bx < 8; bx++) {
              const py = y + by;
              const px = x + bx;
              if (py < canvas.height && px < canvas.width) {
                const i = (py * canvas.width + px) * 4;
                if (isPainted) {
                  maskData.data[i] = 255;     // R
                  maskData.data[i + 1] = 255; // G
                  maskData.data[i + 2] = 255; // B
                  maskData.data[i + 3] = 255; // A (完全不透明白)
                } else {
                  maskData.data[i] = 0;
                  maskData.data[i + 1] = 0;
                  maskData.data[i + 2] = 0;
                  maskData.data[i + 3] = 0;   // A (完全透明黑)
                }
              }
            }
          }
        }
      }
      
      mCtx.putImageData(maskData, 0, 0);
    }

    const maskDataUrl = maskCanvas.toDataURL('image/png');
    genStore.params.mask = maskDataUrl.split(',')[1];
  }
};

const resetMask = () => {
  if (canvasRef.value) {
    const ctx = canvasRef.value.getContext('2d');
    ctx?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    genStore.params.mask = undefined;
  }
};


const clearInpaint = () => {
  genStore.params.image = undefined;
  genStore.params.mask = undefined;
  showMaskEditor.value = false;
};

// 页面加载或刷新时，自动重置可能挂起的生成状态、清空临时底图与遮罩，并重新获取最新余额
onMounted(() => {
  genStore.isGenerating = false;
  genStore.streamPreviewUrl = null;
  genStore.params.image = undefined;
  genStore.params.mask = undefined;
  showMaskEditor.value = false;
  
  if (genStore.history.length > 0 && !genStore.currentImage) {
    genStore.currentImage = genStore.history[0];
  }

  if (authStore.token) {
    authStore.fetchUserData();
  }
});

const handleLogin = async () => {
  if (inputToken.value.trim()) {
    authStore.error = '';
    await authStore.login(inputToken.value.trim());
  }
};

const downloadImage = () => {
  if (genStore.currentImage) {
    saveAs(genStore.currentImage.url, `nai_${genStore.currentImage.id}.png`);
  }
};
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- 头部区域 (优化移动端与PC端适配) -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2.5 flex flex-wrap justify-between items-center gap-2 shadow-sm z-10 shrink-0 transition-colors">
      <div class="flex items-center gap-2">
        <Sparkles class="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
        <h1 class="text-lg md:text-xl font-bold tracking-tight whitespace-nowrap">
          NovelAI 工作台
        </h1>
      </div>
      
      <div class="flex flex-wrap gap-2 md:gap-3 items-center">
        <template v-if="authStore.token">
          <span class="text-xs bg-gray-100 dark:bg-gray-800 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 font-medium">
            {{ authStore.subscriptionTier === 3 ? 'Opus 会员' : (authStore.subscriptionTier === 2 ? 'Scroll 会员' : (authStore.subscriptionTier === 1 ? 'Tablet 会员' : '免费/未定')) }}
          </span>
          <span class="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-800 font-medium whitespace-nowrap">
            anals: {{ authStore.anlas.toLocaleString() }}
          </span>

          <!-- V5 额度进度条徽章 (适配移动端，默认100%满，超出以100%进度显示) -->
          <div 
            class="flex items-center gap-2 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 px-2.5 py-1 rounded-md text-xs" 
            title="V5 模型免费动态额度 (Stamina / Usage)"
          >
            <div class="flex flex-col gap-0.5">
              <div class="flex justify-between items-center text-[10px] text-purple-700 dark:text-purple-300 font-medium gap-1.5">
                <span>V5 额度</span>
                <span class="font-bold font-mono">{{ authStore.v5UsagePercent }}%</span>
              </div>
              <div class="w-16 sm:w-20 h-1.5 bg-purple-200 dark:bg-purple-900/50 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(100, Math.max(0, authStore.v5UsagePercent))}%` }"
                ></div>
              </div>
            </div>
          </div>

          <button @click="authStore.fetchUserData()" :disabled="authStore.loading" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition" title="刷新额度">
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': authStore.loading }" />
          </button>
          <button @click="authStore.logout(); inputToken = ''" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition" title="退出">
            <LogOut class="w-4 h-4" />
          </button>
        </template>
        <button @click="toggleDark()" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition" title="切换主题">
          <Moon v-if="!isDark" class="w-4 h-4" />
          <Sun v-else class="w-4 h-4" />
        </button>
      </div>
    </header>

    <!-- 登录页 -->
    <main class="flex-1 flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950 transition-colors" v-if="!authStore.token">
      <div class="max-w-md w-full bg-white dark:bg-gray-900 p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl transition-colors">
        <div class="flex justify-center mb-6">
          <div class="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-full">
            <KeyRound class="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <h2 class="text-2xl mb-2 text-center font-bold">连接到 NovelAI</h2>
        <p class="text-center text-gray-500 dark:text-gray-400 text-sm mb-8">
          请输入您的 Persistent API Token 开始创作
        </p>
        
        <div class="space-y-4">
          <div>
            <input 
              v-model="inputToken" 
              placeholder="ey..." 
              type="password"
              @keyup.enter="handleLogin"
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition font-mono text-sm"
            />
          </div>
          
          <button 
            @click="handleLogin" 
            :disabled="authStore.loading || !inputToken"
            class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-900 disabled:cursor-not-allowed text-white rounded-xl p-4 transition-colors font-semibold flex justify-center items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <Loader2 v-if="authStore.loading" class="w-5 h-5 animate-spin" />
            {{ authStore.loading ? '正在验证密钥...' : '立即连接' }}
          </button>
        </div>

        <div v-if="authStore.error" class="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-3">
          <div class="mt-0.5">
            <X class="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div class="text-sm text-red-600 dark:text-red-400 leading-tight">
            <span class="font-semibold block mb-1">验证失败</span>
            {{ authStore.error === 'Unauthorized' ? 'API Key 无效或已过期，请检查后重试。' : authStore.error }}
          </div>
        </div>
      </div>
    </main>

    <!-- 工作台页 (桌面端三栏并排各卡片内部滚动，手机端支持底部选项卡折叠切换) -->
    <main class="p-3 md:p-4 flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden relative" v-else>
      
      <!-- 手机端顶部/底部快速折叠切换栏 (仅在小屏可见) -->
      <div class="lg:hidden flex items-center justify-around bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1 shrink-0 shadow-sm">
        <button 
          @click="mobileTab = 'controls'" 
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition"
          :class="mobileTab === 'controls' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          控制与提示词
        </button>
        <button 
          @click="mobileTab = 'canvas'" 
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition"
          :class="mobileTab === 'canvas' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <ImageIcon class="w-3.5 h-3.5" />
          主画布
        </button>
        <button 
          @click="mobileTab = 'history'" 
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition"
          :class="mobileTab === 'history' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <Layers class="w-3.5 h-3.5" />
          历史画廊 ({{ genStore.history.length }})
        </button>
      </div>

      <!-- 左侧控制面板 (独立卡片内部滚动) -->
      <aside 
        class="w-full lg:w-96 flex-shrink-0 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5 shadow-sm transition-colors h-full"
        :class="{ 'hidden lg:flex': mobileTab !== 'controls' }"
      >
        <!-- 提示词输入区 -->
        <div class="flex flex-col gap-3">
          <div>
            <div class="flex justify-between items-center mb-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">正向提示词 (Prompt)</label>
              <button 
                @click="showPromptHistory = true" 
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                title="历史提示词"
              >
                <History class="w-3.5 h-3.5" />
                历史 ({{ genStore.promptHistory.length }})
              </button>
            </div>
            <textarea 
              v-model="genStore.params.prompt" 
              rows="3" 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono custom-scrollbar transition-colors" 
              placeholder="1girl, masterpiece, best quality, highly detailed, beautiful lighting..."
            ></textarea>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">反向提示词 (Negative Prompt)</label>
            <textarea 
              v-model="genStore.params.negative_prompt" 
              rows="2" 
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-gray-500 dark:text-gray-400 custom-scrollbar transition-colors" 
              placeholder="lowres, bad anatomy, bad hands, text, error, missing fingers..."
            ></textarea>
          </div>

          <!-- 生成按钮与点数消耗/免费状态提示 -->
          <div class="flex flex-col gap-2 mt-1">
            <button 
              @click="genStore.generate(); mobileTab = 'canvas'"
              :disabled="genStore.isGenerating"
              class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium py-3 rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
            >
              <Loader2 v-if="genStore.isGenerating" class="animate-spin w-4 h-4" />
              {{ genStore.isGenerating ? '正在生成中...' : '立即生成图像' }}
            </button>

            <!-- 费用预估警告标签 (超出免费限制显示黄色/橙色警告，免费显示绿色) -->
            <div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors"
                 :class="costInfo.isFree ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/60 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-400'">
              <div class="flex items-center gap-1.5 font-medium">
                <span class="w-2 h-2 rounded-full" :class="costInfo.isFree ? 'bg-green-500 animate-pulse' : 'bg-amber-500 animate-ping'"></span>
                <span>{{ costInfo.text }}</span>
              </div>
              <span class="text-[11px] opacity-80 truncate max-w-[150px]" :title="costInfo.reason">{{ costInfo.reason }}</span>
            </div>

            <div 
              v-if="genStore.error" 
              class="flex items-center justify-between gap-2 p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-red-600 dark:text-red-400 text-xs shadow-sm"
            >
              <span class="flex-1 font-medium line-clamp-3">{{ genStore.error }}</span>
              <button @click="genStore.error = ''" class="text-red-400 hover:text-red-700 dark:hover:text-red-200 p-1">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- 参数设置 -->
        <div class="flex flex-col gap-4 pt-4 border-t border-gray-200 dark:border-gray-800 transition-colors">
          <div>
            <label class="block text-xs font-semibold mb-1.5">模型 (Model)</label>
            <select v-model="genStore.params.model" class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500 text-xs cursor-pointer transition-colors">
              <optgroup label="NAI Diffusion V5">
                <option value="nai-diffusion-5-full">V5 Full (全量版)</option>
                <option value="nai-diffusion-5-curated">V5 Curated (精选版)</option>
              </optgroup>
              <optgroup label="NAI Diffusion V4.5">
                <option value="nai-diffusion-4-5-full">V4.5 Full (全量版)</option>
                <option value="nai-diffusion-4-5-curated">V4.5 Curated (精选版)</option>
              </optgroup>
              <optgroup label="NAI Diffusion V4">
                <option value="nai-diffusion-4-full">V4 Full (全量版)</option>
                <option value="nai-diffusion-4-curated">V4 Curated (精选版)</option>
              </optgroup>
              <optgroup label="NAI Diffusion V3 & 其他">
                <option value="nai-diffusion-3">V3 (Anime)</option>
                <option value="nai-diffusion-furry-3">V3 (Furry)</option>
                <option value="safe-diffusion">Safe Diffusion</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1.5">采样器 (Sampler)</label>
            <select v-model="genStore.params.sampler" class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500 text-xs cursor-pointer transition-colors">
              <option value="k_euler">Euler</option>
              <option value="k_euler_ancestral">Euler Ancestral</option>
              <option value="k_dpmpp_2m">DPM++ 2M</option>
              <option value="k_dpmpp_sde">DPM++ SDE</option>
              <option value="ddim">DDIM</option>
            </select>
          </div>

          <div>
            <div class="flex justify-between items-center mb-1.5">
              <label class="text-xs font-semibold">分辨率 (Size)</label>
              <span v-if="costInfo.isFree" class="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 transition-colors">免费区间</span>
            </div>
            <div class="flex gap-2">
              <input type="number" v-model.number="genStore.params.width" class="w-1/2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-center transition-colors" placeholder="宽" />
              <span class="text-gray-400 dark:text-gray-500 self-center text-xs">×</span>
              <input type="number" v-model.number="genStore.params.height" class="w-1/2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-center transition-colors" placeholder="高" />
            </div>
            <div class="flex gap-2 mt-1.5">
              <button @click="genStore.params.width = 832; genStore.params.height = 1216;" class="flex-1 text-[11px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded py-1 border border-gray-200 dark:border-gray-700 transition-colors">竖屏</button>
              <button @click="genStore.params.width = 1024; genStore.params.height = 1024;" class="flex-1 text-[11px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded py-1 border border-gray-200 dark:border-gray-700 transition-colors">方图</button>
              <button @click="genStore.params.width = 1216; genStore.params.height = 832;" class="flex-1 text-[11px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded py-1 border border-gray-200 dark:border-gray-700 transition-colors">横屏</button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1">CFG Scale: <span class="font-bold">{{ genStore.params.scale }}</span></label>
            <input type="range" v-model.number="genStore.params.scale" min="1" max="20" step="0.1" class="w-full accent-blue-600" />
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1">步数 (Steps): <span class="font-bold">{{ genStore.params.steps }}</span></label>
            <input type="range" v-model.number="genStore.params.steps" min="1" max="50" step="1" class="w-full accent-blue-600" />
          </div>
          
          <div>
            <label class="block text-xs font-semibold mb-1">随机种子 (Seed)</label>
            <div class="flex gap-2">
              <input type="number" v-model.number="genStore.params.seed" class="flex-1 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
              <button @click="genStore.params.seed = -1" class="px-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] transition-colors">重置随机</button>
            </div>
            <div v-if="genStore.currentImage" class="flex justify-between items-center mt-1.5 text-[10px]">
              <span class="text-gray-500">当前图种子: {{ genStore.currentImage.params.seed }}</span>
              <button @click="genStore.params.seed = genStore.currentImage.params.seed" class="text-blue-500 hover:text-blue-600 transition font-medium">使用此种子</button>
            </div>
          </div>

          <div class="flex flex-col gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="genStore.params.enable_stream" class="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
              <span class="text-xs font-medium">流式生成 (实时预览)</span>
            </label>

            <template v-if="isV3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="genStore.params.sm" class="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                <span class="text-xs">SMEA (高分优化)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="genStore.params.sm_dyn" class="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                <span class="text-xs">SMEA DYN</span>
              </label>
            </template>
          </div>
        </div>

        <!-- 局部重绘 (Inpaint / Img2img) 区域 -->
        <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-800 transition-colors">
          <div class="flex justify-between items-center">
            <label class="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">局部重绘 / 图生图</label>
          </div>
          
          <div class="flex flex-col gap-2 text-xs">
            <div>
              <span class="text-gray-500 mb-1 block">上传底图:</span>
              <input type="file" accept="image/*" @change="handleImageUpload" class="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-gray-100 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-200 cursor-pointer w-full" />
            </div>

            <!-- 涂鸦面板将显示在中央大画布上 -->
            <!-- 涂鸦面板将显示在中央大画布上 -->
            <div v-if="genStore.params.image" class="p-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col gap-2 mt-1 shadow-sm transition-colors">
              <div class="flex justify-between items-center px-1">
                <span class="font-medium text-gray-700 dark:text-gray-300">已加载底图</span>
                <span class="text-[10px] text-gray-500">{{ genStore.params.width }} × {{ genStore.params.height }}</span>
              </div>
              
              <!-- 大缩略图与图层叠加 -->
              <div class="relative w-full h-32 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 bg-black/10 flex items-center justify-center">
                <img :src="'data:image/png;base64,' + genStore.params.image" class="absolute inset-0 w-full h-full object-contain" />
                <img v-if="genStore.params.mask" :src="'data:image/png;base64,' + genStore.params.mask" class="absolute inset-0 w-full h-full object-contain mix-blend-screen opacity-50" />
              </div>

              <button @click="showMaskEditor = true; initCanvas(); mobileTab = 'canvas'" class="w-full text-white font-medium bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg shadow-sm shadow-blue-500/20 transition text-center">
                编辑涂鸦遮罩
              </button>
            </div>

            <div v-if="genStore.params.image" class="flex flex-col gap-1 mt-1">
              <div class="flex justify-between items-center">
                <span class="text-xs font-medium">重绘幅度 (Strength): {{ genStore.params.strength }}</span>
                <button @click="clearInpaint" class="text-xs text-red-500 hover:underline">清除底图</button>
              </div>
              <input type="range" v-model.number="genStore.params.strength" min="0.1" max="0.99" step="0.05" class="w-full accent-blue-600" />
            </div>
          </div>
        </div>
      </aside>

      <!-- 中间正中央主画布区 (内部独立缩放、拖拽与固定视口) -->
      <section 
        class="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-inner transition-colors"
        :class="{ 'hidden lg:flex': mobileTab !== 'canvas' }"
      >
        <!-- 顶部缩放与重置控制条 -->
        <div class="absolute top-4 left-4 z-20 flex items-center gap-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm text-xs">
          <span class="font-mono text-gray-600 dark:text-gray-300 font-medium">缩放: {{ Math.round(imgScale * 100) }}%</span>
          <button @click="resetZoom" class="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 transition">自适应</button>
          <span class="text-gray-400 text-[10px] hidden sm:inline">滚轮平滑缩放 / 拖拽移动</span>
        </div>

        <!-- 交互画布容器 -->
        <div 
          class="flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
          @wheel="handleWheel"
          @mousedown="startPan"
          @mousemove="doPan"
          @mouseup="stopPan"
          @mouseleave="stopPan"
        >
          <!-- 局部重绘 涂鸦模式 -->
          <template v-if="genStore.params.image && showMaskEditor">
            <div 
              class="transition-transform duration-75 flex items-center justify-center max-w-full max-h-full relative shadow-2xl rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700"
              :style="{ transform: `translate(${imgTranslate.x}px, ${imgTranslate.y}px) scale(${imgScale})` }"
            >
              <!-- 底图 -->
              <img :src="'data:image/png;base64,' + genStore.params.image" class="max-w-[90vw] max-h-[90vh] object-contain pointer-events-none" />
              <!-- 遮罩涂抹 Canvas -->
              <canvas 
                ref="canvasRef" 
                class="absolute inset-0 w-full h-full cursor-crosshair opacity-75"
                @mousedown.stop="startDraw"
                @mousemove.stop="draw"
                @mouseup.stop="stopDraw"
                @mouseleave.stop="stopDraw"
                @touchstart.stop.passive="startDraw"
                @touchmove.stop.passive="draw"
                @touchend.stop="stopDraw"
              ></canvas>
            </div>
            
            <!-- 涂鸦悬浮工具栏 -->
            <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-800 p-3 rounded-2xl shadow-2xl z-30">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500 whitespace-nowrap font-medium">画笔大小:</span>
                <input type="range" v-model.number="brushSize" min="5" max="150" class="w-32 accent-blue-600" />
                <span class="font-mono text-xs w-6 text-gray-600 dark:text-gray-300">{{ brushSize }}</span>
              </div>
              <div class="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>
              <button @click="resetMask" class="text-xs text-gray-600 hover:text-red-500 font-medium transition">重置</button>
              <button @click="exportMask(); showMaskEditor = false; mobileTab = 'controls'" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-md shadow-blue-500/20 transition">
                保存涂鸦
              </button>
            </div>
          </template>

          <template v-else-if="genStore.streamPreviewUrl">
            <div 
              class="transition-transform duration-75 flex items-center justify-center max-w-full max-h-full"
              :style="{ transform: `translate(${imgTranslate.x}px, ${imgTranslate.y}px) scale(${imgScale})` }"
            >
              <img :src="genStore.streamPreviewUrl" class="max-w-[85vw] max-h-[85vh] object-contain drop-shadow-2xl pointer-events-none" />
            </div>
            <div class="absolute bottom-4 left-4 bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur flex items-center gap-1.5 shadow-lg animate-pulse z-20">
              <Loader2 class="w-3.5 h-3.5 animate-spin" />
              正在流式去噪渲染...
            </div>
          </template>

          <template v-else-if="genStore.currentImage">
            <div 
              class="transition-transform duration-75 flex items-center justify-center max-w-full max-h-full relative"
              :style="{ transform: `translate(${imgTranslate.x}px, ${imgTranslate.y}px) scale(${imgScale})` }"
            >
              <img :src="genStore.currentImage.url" class="max-w-[85vw] max-h-[85vh] object-contain drop-shadow-2xl pointer-events-none rounded-lg" />
              
              <!-- 加载遮罩 (当正在生成且不使用流式时显示) -->
              <div v-if="genStore.isGenerating && !genStore.streamPreviewUrl" class="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-10 text-white">
                <Loader2 class="w-8 h-8 animate-spin mb-3" />
                <span class="text-sm font-medium animate-pulse">正在生成图像...</span>
              </div>
            </div>

            <!-- 待重绘标识 Tag -->
            <div 
              v-if="genStore.params.image && genStore.currentImage.url.split(',')[1] === genStore.params.image"
              class="absolute top-4 right-4 bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm z-20 flex items-center gap-1.5 font-medium animate-fade-in"
            >
              <Paintbrush class="w-3.5 h-3.5" />
              待重绘
            </div>

            <!-- 浮动操作栏 -->
            <div class="absolute bottom-4 right-4 flex gap-2 z-20">
              <button @click="downloadImage" class="bg-white/90 hover:bg-blue-50 dark:bg-gray-900/90 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 p-2.5 rounded-xl shadow-lg transition" title="保存高清原图">
                <Download class="w-5 h-5" />
              </button>
              <button @click="genStore.useParams(genStore.currentImage)" class="bg-white/90 hover:bg-blue-50 dark:bg-gray-900/90 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 p-2.5 rounded-xl shadow-lg transition" title="复用此图参数">
                <Copy class="w-5 h-5" />
              </button>
            </div>
          </template>

          <div v-else class="text-gray-400 dark:text-gray-600 flex flex-col items-center gap-3">
            <ImageIcon class="w-16 h-16 opacity-40" />
            <p class="text-sm font-medium">在左侧输入提示词并生成，图像将在此呈现</p>
          </div>
        </div>
      </section>

      <!-- 右侧历史画廊 (内部独立滚动) -->
      <aside 
        class="w-full lg:w-56 flex-shrink-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 flex flex-col gap-3 overflow-hidden transition-colors h-full"
        :class="{ 'hidden lg:flex': mobileTab !== 'history' }"
      >
        <div class="flex justify-between items-center shrink-0">
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">历史 ({{ filteredHistory.length }})</h3>
            <select v-model="historyFilter" class="text-[11px] bg-transparent border-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 outline-none cursor-pointer appearance-none">
              <option value="today">今天</option>
              <option value="yesterday">昨天</option>
              <option value="week">本周</option>
              <option value="all">全部</option>
            </select>
          </div>
          <button 
            v-if="filteredHistory.length > 0"
            @click="genStore.clearFilteredHistory(genStore.history.filter(i => !filteredHistory.map(f => f.id).includes(i.id)).map(i => i.id))" 
            class="text-[11px] text-red-500 hover:underline flex items-center gap-1"
            title="清空当前显示的记录"
          >
            <Trash2 class="w-3 h-3" />
            清空
          </button>
        </div>

        <div class="flex flex-row lg:flex-col gap-3 overflow-auto custom-scrollbar flex-1">
          <div 
            v-for="item in filteredHistory" 
            :key="item.id"
            @click="genStore.currentImage = item; resetZoom(); mobileTab = 'canvas'"
            class="group relative w-20 h-20 lg:w-full lg:h-32 shrink-0 rounded-lg overflow-hidden cursor-pointer border-2 transition-all"
            :class="genStore.currentImage?.id === item.id ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'"
          >
            <img :src="item.url" class="w-full h-full object-cover" />
            
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
              <button 
                @click.stop="genStore.currentImage = item; genStore.sendToInpaint(item.url); showMaskEditor = true; initCanvas(); mobileTab = 'controls'" 
                class="bg-white/90 hover:bg-blue-600 hover:text-white text-gray-800 p-1.5 rounded-md text-[10px] font-medium shadow transition"
                title="发送到涂鸦重绘"
              >
                重绘
              </button>
              <button 
                @click.stop="genStore.useParams(item); mobileTab = 'controls'" 
                class="bg-white/90 hover:bg-blue-600 hover:text-white text-gray-800 p-1.5 rounded-md text-[10px] font-medium shadow transition"
                title="复用此参数"
              >
                复用
              </button>
              <button 
                @click.stop="genStore.deleteHistory(item.id)" 
                class="bg-white/90 hover:bg-red-600 hover:text-white text-red-600 p-1.5 rounded-md shadow transition"
                title="删除"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-if="genStore.history.length === 0" class="text-xs text-gray-400 dark:text-gray-600 text-center py-8">
            暂无历史记录
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<style>
/* 滚动条美化 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #374151;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #4B5563;
}
</style>
