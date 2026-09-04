<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { 
  X, Zap, Clock, Sparkles, RefreshCw, 
  HelpCircle, BatteryCharging 
} from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const authStore = useAuthStore();

const close = () => {
  emit('update:modelValue', false);
};

// 格式化到期时间
const formattedExpiresAt = computed(() => {
  if (!authStore.expiresAt) return '长期有效';
  const d = new Date(authStore.expiresAt * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

// 动态状态条配色
const progressColorClass = computed(() => {
  const p = authStore.v5UsagePercent;
  if (p >= 80) return 'from-emerald-500 to-teal-500';
  if (p >= 30) return 'from-purple-500 to-indigo-500';
  return 'from-amber-500 to-red-500';
});
</script>

<template>
  <div 
    v-if="modelValue" 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    @click.self="close"
  >
    <div 
      class="w-full max-w-xl bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden transform transition-all select-none"
    >
      <!-- 弹窗顶栏 -->
      <header class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-purple-50/50 via-white to-indigo-50/50 dark:from-purple-950/20 dark:via-gray-900 dark:to-indigo-950/20">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 flex items-center justify-center shadow-sm">
            <Zap class="w-5 h-5 fill-current" />
          </div>
          <div>
            <h3 class="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight flex items-center gap-1.5">
              V5 模型免费额度与恢复详情
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">NovelAI 官方 V5 动态免费额度系统 (Stamina)</p>
          </div>
        </div>

        <button 
          @click="close"
          class="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          title="关闭"
        >
          <X class="w-5 h-5" />
        </button>
      </header>

      <!-- 弹窗主内容 -->
      <div class="p-5 sm:p-6 overflow-y-auto max-h-[80vh] flex flex-col gap-4 text-gray-700 dark:text-gray-300 custom-scrollbar text-xs sm:text-sm">
        
        <!-- 当前额度与生图估算主卡片 -->
        <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-purple-500/5 border border-purple-200/80 dark:border-purple-800/60 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">当前额度容量</span>
              <span 
                v-if="authStore.v5UsagePercent >= 100" 
                class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              >
                已回满
              </span>
              <span 
                v-else 
                class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
              >
                自动充能中
              </span>
            </div>

            <div class="text-right">
              <span class="text-2xl sm:text-3xl font-black font-mono tracking-tight text-gray-900 dark:text-white">
                {{ authStore.v5UsagePercent }}%
              </span>
            </div>
          </div>

          <!-- 进度条 -->
          <div class="w-full h-2.5 bg-purple-200/60 dark:bg-gray-800 rounded-full overflow-hidden p-0.5">
            <div 
              class="h-full rounded-full bg-gradient-to-r transition-all duration-500"
              :class="progressColorClass"
              :style="{ width: `${Math.min(100, Math.max(0, authStore.v5UsagePercent))}%` }"
            ></div>
          </div>

          <!-- 预估剩余出图数量 -->
          <div class="pt-2 border-t border-purple-200/60 dark:border-purple-800/40 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <Sparkles class="w-4 h-4 text-purple-500 shrink-0" />
              <span>当前额度约可出图：</span>
            </div>
            <div class="text-right">
              <span class="text-lg sm:text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                ~{{ authStore.estimatedRemainingImages.toLocaleString() }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">张标准图</span>
            </div>
          </div>
        </div>

        <!-- 恢复时间双卡片 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- 卡片 1: 下一次恢复 (+1%) -->
          <div class="p-3.5 sm:p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 flex flex-col justify-between gap-2 overflow-hidden">
            <div class="flex items-center justify-between text-gray-500 dark:text-gray-400">
              <span class="text-xs font-medium flex items-center gap-1">
                <Clock class="w-3.5 h-3.5 text-purple-500" />
                下一次恢复 (+1%)
              </span>
            </div>

            <div>
              <div v-if="authStore.v5UsagePercent >= 100" class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 py-1">
                已达 100% 满额
              </div>
              <div v-else class="flex flex-col">
                <div class="text-sm sm:text-base font-bold font-mono whitespace-nowrap text-gray-900 dark:text-gray-100">
                  {{ authStore.formatFullDuration(authStore.secondsToNextPercent) }}
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 whitespace-nowrap">
                  预计 {{ authStore.formatTargetTime(authStore.secondsToNextPercent) }} (+1%)
                </div>
              </div>
            </div>
          </div>

          <!-- 卡片 2: 完全回满 (至 100%) -->
          <div class="p-3.5 sm:p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 flex flex-col justify-between gap-2 overflow-hidden">
            <div class="flex items-center justify-between text-gray-500 dark:text-gray-400">
              <span class="text-xs font-medium flex items-center gap-1">
                <BatteryCharging class="w-3.5 h-3.5 text-indigo-500" />
                完全回满 (至 100%)
              </span>
            </div>

            <div>
              <div v-if="authStore.v5UsagePercent >= 100" class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 py-1">
                无需恢复
              </div>
              <div v-else class="flex flex-col">
                <div class="text-sm sm:text-base font-bold font-mono whitespace-nowrap text-indigo-600 dark:text-indigo-400">
                  {{ authStore.formatFullDuration(authStore.secondsToFullUsage) }}
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 whitespace-nowrap">
                  预计 {{ authStore.formatTargetTime(authStore.secondsToFullUsage) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 规则与计算机制说明 -->
        <div class="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-800 flex flex-col gap-2.5">
          <div class="flex items-center gap-1.5 font-semibold text-xs text-gray-900 dark:text-gray-200">
            <HelpCircle class="w-4 h-4 text-purple-500" />
            <span>额度规则与恢复机制说明</span>
          </div>

          <div class="grid grid-cols-1 gap-2 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            <div class="flex items-start gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></span>
              <div>
                <strong class="text-gray-800 dark:text-gray-100">恢复速度：</strong>
                一天恢复约 <span class="font-semibold text-purple-600 dark:text-purple-400">11%</span> 左右（平均每 ~2.18 小时自然恢复 1%）。
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></span>
              <div>
                <strong class="text-gray-800 dark:text-gray-100">出图价值：</strong>
                每 <span class="font-semibold text-purple-600 dark:text-purple-400">11% 额度 ≈ 190 张图</span>（即每 1% 额度约可生成 ~17.3 张标准图）。
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></span>
              <div>
                <strong class="text-gray-800 dark:text-gray-100">满额容量：</strong>
                100% 满额储备约可连续生成 <span class="font-semibold text-purple-600 dark:text-purple-400">~1,727 张</span> 标准规格图片。
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></span>
              <div>
                <strong class="text-gray-800 dark:text-gray-100">免费规格范围：</strong>
                标准尺寸（分辨率 ≤ 1024×1024，如 832×1216、1024×1024 等）且步数 ≤ 28 步时，系统将优先扣除 V5 免费额度（消耗 0 Anlas）。
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></span>
              <div>
                <strong class="text-gray-800 dark:text-gray-100">额度用尽时：</strong>
                若 V5 免费额度降至 0%，可自动切换消耗账户中的 Anlas 点数继续出图，或静待其线性充能恢复。
              </div>
            </div>
          </div>
        </div>

        <!-- 账户关联信息小条 -->
        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1 py-0.5">
          <div class="flex items-center gap-3">
            <span>会员: <strong class="text-gray-700 dark:text-gray-200">Opus (Tier {{ authStore.subscriptionTier }})</strong></span>
            <span>点数: <strong class="text-blue-600 dark:text-blue-400 font-mono">{{ authStore.anlas.toLocaleString() }} Anlas</strong></span>
          </div>
          <span>到期: {{ formattedExpiresAt }}</span>
        </div>

      </div>

      <!-- 弹窗底栏操作 -->
      <footer class="px-6 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
        <button
          @click="authStore.fetchUserData()"
          :disabled="authStore.loading"
          class="px-3.5 py-2 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': authStore.loading }" />
          <span>刷新最新数据</span>
        </button>

        <button
          @click="close"
          class="px-5 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition active:scale-95"
        >
          我知道了
        </button>
      </footer>
    </div>
  </div>
</template>
