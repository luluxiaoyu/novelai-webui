<script setup lang="ts">
import { computed } from 'vue';
import { useGenerationStore } from '../stores/generation';
import { Database, AlertTriangle, CheckCircle2, ArrowRight, Loader2, XCircle } from 'lucide-vue-next';

const genStore = useGenerationStore();

const progressPercent = computed(() => {
  if (genStore.migrationProgress.total === 0) return 0;
  return Math.min(100, Math.round((genStore.migrationProgress.current / genStore.migrationProgress.total) * 100));
});

const handleStartMigration = async () => {
  await genStore.executeMigration();
};

const handleClose = () => {
  if (genStore.isMigrating) return;
  genStore.showMigrationModal = false;
};
</script>

<template>
  <div 
    v-if="genStore.showMigrationModal"
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none"
  >
    <div 
      @click.stop
      class="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl p-6 sm:p-7 flex flex-col text-gray-800 dark:text-gray-100 animate-scale-up"
    >
      <!-- 头部图标 -->
      <div class="flex items-center justify-center mb-5">
        <div 
          class="w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-inner"
          :class="{
            'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400': !genStore.migrationCompleted && !genStore.migrationError,
            'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400': genStore.migrationCompleted,
            'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400': !!genStore.migrationError
          }"
        >
          <Loader2 v-if="genStore.isMigrating" class="w-8 h-8 animate-spin" />
          <CheckCircle2 v-else-if="genStore.migrationCompleted" class="w-8 h-8 text-green-600 dark:text-green-400" />
          <XCircle v-else-if="genStore.migrationError" class="w-8 h-8 text-red-600 dark:text-red-400" />
          <Database v-else class="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
      </div>

      <!-- 标题 -->
      <h3 class="text-lg sm:text-xl font-bold text-center mb-2">
        <span v-if="genStore.migrationCompleted">存储架构升级完成</span>
        <span v-else-if="genStore.isMigrating">正在升级图库存储...</span>
        <span v-else-if="genStore.migrationError">存储升级异常</span>
        <span v-else>图库存储架构升级提醒</span>
      </h3>

      <!-- 描述内容 -->
      <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center leading-relaxed mb-6 space-y-2">
        <!-- 未开始阶段 -->
        <template v-if="!genStore.isMigrating && !genStore.migrationCompleted && !genStore.migrationError">
          <p>
            检测到您有 <span class="font-bold text-blue-600 dark:text-blue-400 font-mono">{{ genStore.migrationProgress.total }}</span> 张历史图片保存在旧版单文件结构中。
          </p>
          <div class="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-left text-amber-800 dark:text-amber-300 flex items-start gap-2.5 text-xs">
            <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div class="space-y-1">
              <p class="font-semibold">升级优势：</p>
              <p>为了支持<span class="font-bold text-amber-900 dark:text-amber-200">无限图片保存</span>并彻底解决图片过多时的卡顿与浏览器崩溃风险，系统将自动升级为分项独立存储架构。</p>
              <p class="text-[11px] opacity-85">迁移仅需数秒，升级过程中请勿刷新或关闭网页。</p>
            </div>
          </div>
        </template>

        <!-- 迁移中阶段 -->
        <template v-else-if="genStore.isMigrating">
          <p class="text-gray-700 dark:text-gray-300">
            正在安全迁移图片数据至新版独立数据库，请勿刷新或关闭网页...
          </p>
          <!-- 进度条 -->
          <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden shadow-inner my-3">
            <div 
              class="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-200"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
          <div class="flex items-center justify-between text-xs font-mono text-gray-500">
            <span>{{ genStore.migrationProgress.current }} / {{ genStore.migrationProgress.total }} 张</span>
            <span class="font-bold text-blue-600 dark:text-blue-400">{{ progressPercent }}%</span>
          </div>
        </template>

        <!-- 完成阶段 -->
        <template v-else-if="genStore.migrationCompleted">
          <p class="text-gray-700 dark:text-gray-300">
            已成功将 <span class="font-bold text-green-600 font-mono">{{ genStore.migrationProgress.total }}</span> 张历史图片完整无损迁移至新版独立存储！
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            现在您的图库已解除 100 张上限，支持无限保存并启用了全新的大屏分页浏览，尽享流畅生成体验。
          </p>
        </template>

        <!-- 错误阶段 -->
        <template v-else-if="genStore.migrationError">
          <p class="text-red-600 dark:text-red-400 font-medium">
            {{ genStore.migrationError }}
          </p>
          <p class="text-xs text-gray-500">原有数据已完好保留，您可以重试升级或稍后再试。</p>
        </template>
      </div>

      <!-- 操作按钮群 -->
      <div class="flex items-center gap-3">
        <!-- 未开始时 -->
        <template v-if="!genStore.isMigrating && !genStore.migrationCompleted && !genStore.migrationError">
          <button 
            @click="handleClose"
            class="flex-1 py-2.5 px-4 text-xs sm:text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
          >
            暂不升级
          </button>
          <button 
            @click="handleStartMigration"
            class="flex-[2] py-2.5 px-4 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95"
          >
            <span>开始安全升级</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </template>

        <!-- 迁移中时 -->
        <template v-else-if="genStore.isMigrating">
          <button 
            disabled
            class="w-full py-2.5 px-4 text-xs sm:text-sm font-medium rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-400 dark:text-blue-500 cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Loader2 class="w-4 h-4 animate-spin" />
            <span>数据写入中，请稍候...</span>
          </button>
        </template>

        <!-- 完成后 -->
        <template v-else-if="genStore.migrationCompleted">
          <button 
            @click="handleClose"
            class="w-full py-2.5 px-4 text-xs sm:text-sm font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white transition shadow-md shadow-green-500/20 active:scale-95 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 class="w-4 h-4" />
            <span>完成并开始使用</span>
          </button>
        </template>

        <!-- 出错时 -->
        <template v-else-if="genStore.migrationError">
          <button 
            @click="handleClose"
            class="flex-1 py-2.5 px-4 text-xs sm:text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 transition"
          >
            关闭
          </button>
          <button 
            @click="handleStartMigration"
            class="flex-[2] py-2.5 px-4 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            重试升级
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
