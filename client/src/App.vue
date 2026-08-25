<script setup lang="ts">
import { useAuthStore } from './stores/auth';
import { useGenerationStore } from './stores/generation';
import { useWebDAVStore } from './stores/webdav';
import { saveAs } from 'file-saver';
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useDark, useToggle } from '@vueuse/core';
import JSZip from 'jszip';
import CustomSelect from './components/CustomSelect.vue';
import CharacterLibraryModal from './components/CharacterLibraryModal.vue';
import StyleLibraryModal from './components/StyleLibraryModal.vue';
import PromptTextarea from './components/PromptTextarea.vue';
import PromptEditorModal from './components/PromptEditorModal.vue';
import { parsePngMetadata, type ParsedImageMetadata } from './utils/pngMetadata';
import { Sun, Moon, LogOut, Download, Copy, Loader2, Image as ImageIcon, X, KeyRound, History, Trash2, RefreshCw, SlidersHorizontal, Layers, Paintbrush, Palette, Star, Check, Lock, Search, Folder, FolderHeart, FolderOpen, Database, DownloadCloud, UploadCloud, Cloud, Wifi, Sparkles, ChevronDown, ChevronUp, RotateCcw, FileText, Plus, Minus, Users, User, UserPlus, Clock, Maximize2 } from 'lucide-vue-next';

const authStore = useAuthStore();
const genStore = useGenerationStore();
const webdavStore = useWebDAVStore();
const showCharacterLibrary = ref(false);
const showStyleLibrary = ref(false);
const showPromptEditor = ref(false);
const connectionStatus = ref<{ type: 'success' | 'error', text: string } | null>(null);

const handleTestConnection = async () => {
  connectionStatus.value = null;
  const result = await webdavStore.testConnection();
  if (result === 'success') {
    connectionStatus.value = { type: 'success', text: '连接成功！' };
  } else {
    connectionStatus.value = { type: 'error', text: result as string };
  }
};

const handleCreateProfile = async () => {
  const name = prompt('请输入新存档名称（仅限英文、数字、下划线）：');
  if (name && /^[a-zA-Z0-9_]+$/.test(name)) {
    await webdavStore.createProfile(name);
  } else if (name) {
    alert('存档名称不合法！');
  }
};

const handleDeleteProfile = async () => {
  if (webdavStore.currentProfile === 'Default') {
    alert('不能删除 Default 默认存档！');
    return;
  }
  if (confirm(`确定要彻底删除云端存档 "${webdavStore.currentProfile}" 及其所有数据吗？此操作不可逆！`)) {
    await webdavStore.deleteProfile(webdavStore.currentProfile);
  }
};

const isDark = useDark();
const toggleDark = useToggle(isDark);

const inputToken = ref('');
const inputAccessKey = ref('');
const showPromptHistory = ref(false);
const mobileTab = ref<'canvas' | 'controls' | 'history'>('canvas');
const historyFilter = ref('today');
const promptDateFilter = ref('all');
const promptGroupFilter = ref('all');
const promptSearchQuery = ref('');
const paramsCopied = ref(false);
const imageCopied = ref(false);

const showDataModal = ref(false);
const dataModalTab = ref<'local'|'webdav'>('local');
const exportIncludeImages = ref(false);
const importMode = ref<'merge' | 'overwrite'>('merge');
const fileInputRef = ref<HTMLInputElement | null>(null);

const isExporting = ref(false);
const isImporting = ref(false);

const handleExportData = async () => {
  try {
    isExporting.value = true;
    const zip = new JSZip();
    const metadata: any = {
      params: genStore.params,
      promptHistory: genStore.promptHistory,
      savedPromptGroups: genStore.savedPromptGroups,
      customCharacters: genStore.customCharacters,
      customStyles: genStore.customStyles,
      history: []
    };

    if (exportIncludeImages.value && genStore.history.length > 0) {
      const imagesFolder = zip.folder("images");
      if (imagesFolder) {
        for (const item of genStore.history) {
          const dateStr = new Date(item.timestamp).toISOString().split('T')[0];
          const dateFolder = imagesFolder.folder(dateStr);
          if (dateFolder) {
            // url is in format: data:image/png;base64,xxxxxx...
            const base64Data = item.url.replace(/^data:image\/\w+;base64,/, "");
            const filename = `${item.id}.png`;
            dateFolder.file(filename, base64Data, { base64: true });
            
            // Create a metadata copy without the heavy base64 url
            const itemMeta = { ...item, url: undefined, filePath: `images/${dateStr}/${filename}` };
            metadata.history.push(itemMeta);
          }
        }
      }
    }

    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novelai_backup_${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed', err);
    alert('导出失败: ' + err);
  } finally {
    isExporting.value = false;
  }
};

const handleImportData = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  
  try {
    isImporting.value = true;
    const zip = await JSZip.loadAsync(file);
    const metaFile = zip.file('metadata.json');
    if (!metaFile) {
      throw new Error("压缩包内找不到 metadata.json 文件");
    }
    
    const parsed = JSON.parse(await metaFile.async('string'));
    let restoredHistory: any[] = [];
    
    if (parsed.history && parsed.history.length > 0) {
      restoredHistory = await Promise.all(parsed.history.map(async (item: any) => {
        if (item.filePath) {
          const imgFile = zip.file(item.filePath);
          if (imgFile) {
            const base64 = await imgFile.async('base64');
            item.url = `data:image/png;base64,${base64}`;
          }
        }
        return item;
      }));
    }

    if (importMode.value === 'overwrite') {
      if (parsed.params) Object.assign(genStore.params, parsed.params);
      if (parsed.promptHistory) genStore.promptHistory = parsed.promptHistory;
      if (parsed.savedPromptGroups) genStore.savedPromptGroups = parsed.savedPromptGroups;
      if (parsed.customCharacters) genStore.customCharacters = parsed.customCharacters;
      if (parsed.customStyles) genStore.customStyles = parsed.customStyles;
      if (restoredHistory.length > 0) {
        genStore.history = restoredHistory;
        genStore.currentImage = restoredHistory[0];
      }
    } else {
      // Merge
      if (parsed.params) Object.assign(genStore.params, parsed.params);
      if (parsed.promptHistory) {
        const existingIds = new Set(genStore.promptHistory.map(p => p.id));
        const newPrompts = parsed.promptHistory.filter((p: any) => !existingIds.has(p.id));
        genStore.promptHistory = [...newPrompts, ...genStore.promptHistory];
      }
      if (parsed.savedPromptGroups) {
        const existingGroups = new Set(genStore.savedPromptGroups || []);
        (parsed.savedPromptGroups || []).forEach((g: string) => existingGroups.add(g));
        genStore.savedPromptGroups = Array.from(existingGroups);
      }
      if (parsed.customCharacters) {
        const existingCharIds = new Set((genStore.customCharacters || []).map(c => c.id));
        const newChars = (parsed.customCharacters || []).filter((c: any) => !existingCharIds.has(c.id));
        genStore.customCharacters = [...newChars, ...(genStore.customCharacters || [])];
      }
      if (parsed.customStyles) {
        const existingStyleIds = new Set((genStore.customStyles || []).map(s => s.id));
        const newStyles = (parsed.customStyles || []).filter((s: any) => !existingStyleIds.has(s.id));
        genStore.customStyles = [...newStyles, ...(genStore.customStyles || [])];
      }
      if (restoredHistory.length > 0) {
        const existingIds = new Set(genStore.history.map(h => h.id));
        const newHistory = restoredHistory.filter(h => !existingIds.has(h.id));
        genStore.history = [...newHistory, ...genStore.history];
        if (!genStore.currentImage && genStore.history.length > 0) {
          genStore.currentImage = genStore.history[0];
        }
      }
    }
    showDataModal.value = false;
    alert('数据导入成功！');
  } catch (err) {
    console.error('Import failed', err);
    alert('导入失败，请确保您选择的是有效的备份ZIP文件。\n错误信息: ' + (err as Error).message);
  } finally {
    isImporting.value = false;
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
};

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

const customPromptGroups = computed(() => {
  const groups = new Set<string>(genStore.savedPromptGroups || []);
  genStore.promptHistory.forEach(p => {
    if (p.group && p.group.trim()) groups.add(p.group.trim());
  });
  return Array.from(groups).sort();
});

const filteredPromptHistory = computed(() => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfThisWeek = startOfToday - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
  
  const query = promptSearchQuery.value.trim().toLowerCase();

  return genStore.promptHistory.filter(item => {
    // Search
    if (query) {
      const matchPrompt = item.prompt.toLowerCase().includes(query);
      const matchNegative = item.negative_prompt && item.negative_prompt.toLowerCase().includes(query);
      const matchNote = item.note && item.note.toLowerCase().includes(query);
      if (!matchPrompt && !matchNegative && !matchNote) return false;
    }

    // Group / Favorites
    if (promptGroupFilter.value === 'favorites') {
      if (!item.isFavorite) return false;
    } else if (promptGroupFilter.value !== 'all') {
      if (item.group !== promptGroupFilter.value) return false;
    }

    // Date
    if (promptDateFilter.value === 'today') {
      if (item.timestamp < startOfToday) return false;
    } else if (promptDateFilter.value === 'yesterday') {
      if (item.timestamp < startOfYesterday || item.timestamp >= startOfToday) return false;
    } else if (promptDateFilter.value === 'week') {
      if (item.timestamp < startOfThisWeek) return false;
    } else if (promptDateFilter.value === 'older') {
      if (item.timestamp >= startOfThisWeek) return false;
    }

    return true;
  }).sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return b.timestamp - a.timestamp;
  });
});

const copiedPromptId = ref<string | null>(null);
const deletingPromptId = ref<string | null>(null);
let deletePromptTimer: any = null;

const handleCopyPrompt = async (item: any) => {
  try {
    let text = item.prompt;
    if (item.negative_prompt) {
      text += `\n### Negative Prompt:\n${item.negative_prompt}`;
    }
    await navigator.clipboard.writeText(text);
    copiedPromptId.value = item.id;
    setTimeout(() => {
      if (copiedPromptId.value === item.id) copiedPromptId.value = null;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy prompt:', err);
  }
};

const handleDeletePrompt = (id: string) => {
  if (deletingPromptId.value === id) {
    genStore.deletePromptHistory(id);
    deletingPromptId.value = null;
    clearTimeout(deletePromptTimer);
  } else {
    deletingPromptId.value = id;
    clearTimeout(deletePromptTimer);
    deletePromptTimer = setTimeout(() => {
      if (deletingPromptId.value === id) deletingPromptId.value = null;
    }, 3000);
  }
};

const isV3 = computed(() => {
  return genStore.params.model.includes('-3') || genStore.params.model.includes('safe-diffusion');
});

const modelOptions = [
  { value: 'nai-diffusion-5-full', label: 'V5 Full (全量版)' },
  { value: 'nai-diffusion-5-curated', label: 'V5 Curated (精选版)' },
  { value: 'nai-diffusion-4-5-full', label: 'V4.5 Full (全量版)' },
  { value: 'nai-diffusion-4-5-curated', label: 'V4.5 Curated (精选版)' },
  { value: 'nai-diffusion-4-full', label: 'V4 Full (全量版)' },
  { value: 'nai-diffusion-4-curated', label: 'V4 Curated (精选版)' },
  { value: 'nai-diffusion-3', label: 'V3 (Anime)' },
  { value: 'nai-diffusion-furry-3', label: 'V3 (Furry)' },
  { value: 'safe-diffusion', label: 'Safe Diffusion' }
];

const samplerOptions = [
  { value: 'k_euler_ancestral', label: 'Euler Ancestral (推荐)' },
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'ddim', label: 'DDIM' }
];

const noiseScheduleOptions = [
  { value: 'karras', label: 'Karras (推荐平滑)' },
  { value: 'exponential', label: 'Exponential (指数)' },
  { value: 'polyexponential', label: 'Polyexponential (多项式)' },
  { value: 'native', label: 'Native (原生)' }
];

const showAdvanced = ref(false);

const historyFilterOptions = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'week', label: '本周' },
  { value: 'all', label: '全部' }
];

const promptDateFilterOptions = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'week', label: '过去7天' },
  { value: 'older', label: '更早' }
];

const batchOptions = [
  { value: 1, label: '1张' },
  { value: 3, label: '3张' },
  { value: 5, label: '5张' },
  { value: 10, label: '10张' },
  { value: 20, label: '20张' }
];

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
      reason: '非 Opus 会员生图需扣费',
      blockedByPermission: !authStore.allowPaid
    };
  }

  // Opus 会员特权判断
  if (isNormalSize && isNormalSteps) {
    if (isV5) {
      if (authStore.v5UsagePercent > 0) {
        return {
          isFree: true,
          text: '免费 (消耗 V5 额度)',
          reason: 'Opus 专属免费生成',
          blockedByPermission: false
        };
      } else {
        return {
          isFree: false,
          text: '消耗 anlas (V5 额度已尽)',
          reason: 'V5 免费额度已耗尽',
          blockedByPermission: !authStore.allowPaid
        };
      }
    }
    return {
      isFree: true,
      text: 'Opus 免费',
      reason: '标准尺寸与步数免费',
      blockedByPermission: false
    };
  }

  const reasons = [];
  if (!isNormalSize) reasons.push('分辨率超出 1048576 像素');
  if (!isNormalSteps) reasons.push('采样步数超过 28 步');

  return {
    isFree: false,
    text: '需消耗 anlas',
    reason: reasons.join('，'),
    blockedByPermission: !authStore.allowPaid
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
  imgScale.value = Math.max(0.2, Math.min(6, Math.round(newScale * 100) / 100));
};

const resetZoom = () => {
  imgScale.value = 1;
  imgTranslate.value = { x: 0, y: 0 };
};

const zoomIn = () => {
  imgScale.value = Math.min(6, Math.round((imgScale.value * 1.25) * 100) / 100);
};

const zoomOut = () => {
  imgScale.value = Math.max(0.2, Math.round((imgScale.value / 1.25) * 100) / 100);
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

// 移动端多指触控缩放与单指平移
let touchStartDistance = 0;
let touchStartScale = 1;
let isTouchPanning = false;

const handleTouchStart = (e: TouchEvent) => {
  if (showMaskEditor.value && e.touches.length === 1) return;

  if (e.touches.length === 1) {
    isTouchPanning = true;
    const t = e.touches[0];
    panStart.value = {
      x: t.clientX - imgTranslate.value.x,
      y: t.clientY - imgTranslate.value.y
    };
  } else if (e.touches.length === 2) {
    isTouchPanning = false;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    touchStartDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    touchStartScale = imgScale.value;
  }
};

const handleTouchMove = (e: TouchEvent) => {
  if (showMaskEditor.value && e.touches.length === 1) return;

  if (e.touches.length === 1 && isTouchPanning) {
    const t = e.touches[0];
    imgTranslate.value = {
      x: t.clientX - panStart.value.x,
      y: t.clientY - panStart.value.y
    };
  } else if (e.touches.length === 2 && touchStartDistance > 0) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const scaleRatio = currentDistance / touchStartDistance;
    const newScale = Math.max(0.2, Math.min(6, touchStartScale * scaleRatio));
    imgScale.value = Math.round(newScale * 100) / 100;
  }
};

const handleTouchEnd = (e: TouchEvent) => {
  if (e.touches.length === 0) {
    isTouchPanning = false;
    touchStartDistance = 0;
  } else if (e.touches.length === 1) {
    touchStartDistance = 0;
    const t = e.touches[0];
    panStart.value = {
      x: t.clientX - imgTranslate.value.x,
      y: t.clientY - imgTranslate.value.y
    };
    isTouchPanning = true;
  }
};

// 历史图片删除防误触状态 (2步确认)
const deletingHistoryId = ref<string | null>(null);
let deleteHistoryTimer: any = null;

const handleDeleteHistory = (id: string) => {
  if (deletingHistoryId.value === id) {
    genStore.deleteHistory(id);
    deletingHistoryId.value = null;
    clearTimeout(deleteHistoryTimer);
  } else {
    deletingHistoryId.value = id;
    clearTimeout(deleteHistoryTimer);
    deleteHistoryTimer = setTimeout(() => {
      if (deletingHistoryId.value === id) {
        deletingHistoryId.value = null;
      }
    }, 3000);
  }
};

const isDraggingOver = ref(false);
const showDropActionModal = ref(false);
const droppedImageInfo = ref<{
  file: File;
  dataUrl: string;
  processedDataUrl: string;
  processedBase64: string;
  targetWidth: number;
  targetHeight: number;
  metadata: ParsedImageMetadata;
} | null>(null);

let dragTimer: any = null;

const onWindowDragOver = (e: DragEvent) => {
  e.preventDefault();
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    isDraggingOver.value = true;
    clearTimeout(dragTimer);
  }
};

const onWindowDragLeave = (e: DragEvent) => {
  e.preventDefault();
  dragTimer = setTimeout(() => {
    isDraggingOver.value = false;
  }, 100);
};

const onWindowDrop = async (e: DragEvent) => {
  e.preventDefault();
  isDraggingOver.value = false;

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith('image/')) return;

  await handleDroppedFile(file);
};

const handleDroppedFile = async (file: File) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const metadata = parsePngMetadata(arrayBuffer);

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // NovelAI 强制要求分辨率是 64 的整数倍，同时填充白底去除 Alpha 透明通道防止 VAE 绿屏
        const targetWidth = Math.max(64, Math.round(img.width / 64) * 64);
        const targetHeight = Math.max(64, Math.round(img.height / 64) * 64);

        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = targetWidth;
        resizeCanvas.height = targetHeight;
        const rctx = resizeCanvas.getContext('2d');
        let processedDataUrl = rawDataUrl;
        if (rctx) {
          rctx.fillStyle = 'white';
          rctx.fillRect(0, 0, targetWidth, targetHeight);
          rctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          processedDataUrl = resizeCanvas.toDataURL('image/png');
        }

        const processedBase64 = processedDataUrl.split(',')[1];

        droppedImageInfo.value = {
          file,
          dataUrl: rawDataUrl,
          processedDataUrl,
          processedBase64,
          targetWidth,
          targetHeight,
          metadata
        };
        showDropActionModal.value = true;
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('Failed to process dropped image:', err);
  }
};

const applyDropAction = (action: 'inpaint' | 'img2img' | 'metadata') => {
  if (!droppedImageInfo.value) return;

  const { processedDataUrl, processedBase64, targetWidth, targetHeight, metadata } = droppedImageInfo.value;

  if (action === 'inpaint') {
    genStore.params.image = processedBase64;
    genStore.params.mask = undefined;
    genStore.params.width = targetWidth;
    genStore.params.height = targetHeight;
    genStore.currentImage = {
      id: 'uploaded-' + Date.now(),
      url: processedDataUrl,
      params: JSON.parse(JSON.stringify(genStore.params)),
      timestamp: Date.now()
    };
    showMaskEditor.value = true;
    initCanvas();
    mobileTab.value = 'canvas';
  } else if (action === 'img2img') {
    genStore.params.image = processedBase64;
    genStore.params.mask = undefined;
    genStore.params.width = targetWidth;
    genStore.params.height = targetHeight;
    genStore.currentImage = {
      id: 'uploaded-' + Date.now(),
      url: processedDataUrl,
      params: JSON.parse(JSON.stringify(genStore.params)),
      timestamp: Date.now()
    };
    showMaskEditor.value = false;
  } else if (action === 'metadata') {
    if (metadata.prompt) genStore.params.prompt = metadata.prompt;
    if (metadata.negative_prompt) genStore.params.negative_prompt = metadata.negative_prompt;
    if (metadata.width) genStore.params.width = metadata.width;
    if (metadata.height) genStore.params.height = metadata.height;
    if (metadata.steps) genStore.params.steps = metadata.steps;
    if (metadata.scale) genStore.params.scale = metadata.scale;
    if (metadata.seed !== undefined) genStore.params.seed = metadata.seed;
    if (metadata.sampler) genStore.params.sampler = metadata.sampler;
    if (metadata.model) genStore.params.model = metadata.model;
    if (metadata.noise_schedule) genStore.params.noise_schedule = metadata.noise_schedule;
    if (metadata.cfg_rescale !== undefined) genStore.params.cfg_rescale = metadata.cfg_rescale;
    if (metadata.uncond_scale !== undefined) genStore.params.uncond_scale = metadata.uncond_scale;
    if (metadata.skip_cfg_above_sigma !== undefined) genStore.params.skip_cfg_above_sigma = metadata.skip_cfg_above_sigma;
    if (metadata.characters) {
      genStore.params.characters = JSON.parse(JSON.stringify(metadata.characters));
    }
    if (metadata.use_coords !== undefined) {
      genStore.params.use_coords = metadata.use_coords;
    }
  }

  showDropActionModal.value = false;
  droppedImageInfo.value = null;
};

const handleImageUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    handleDroppedFile(file);
    (e.target as HTMLInputElement).value = '';
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

// 页面加载或刷新时，自动探测服务端是否要求密钥验证，并重置可能挂起的生成状态、清空临时底图与遮罩，并重新获取最新余额
onMounted(async () => {
  window.addEventListener('dragover', onWindowDragOver);
  window.addEventListener('dragleave', onWindowDragLeave);
  window.addEventListener('drop', onWindowDrop);

  await authStore.checkSiteAuthStatus();

  genStore.isGenerating = false;
  genStore.streamPreviewUrl = null;
  genStore.params.image = undefined;
  genStore.params.mask = undefined;
  showMaskEditor.value = false;
  
  if (genStore.history.length > 0 && !genStore.currentImage) {
    genStore.currentImage = genStore.history[0];
  }

  if (authStore.siteUnlocked && authStore.token) {
    authStore.fetchUserData();
  }
});

onUnmounted(() => {
  window.removeEventListener('dragover', onWindowDragOver);
  window.removeEventListener('dragleave', onWindowDragLeave);
  window.removeEventListener('drop', onWindowDrop);
});

const handleVerifyAccess = async () => {
  if (inputAccessKey.value.trim()) {
    const success = await authStore.verifySiteAccess(inputAccessKey.value.trim());
    if (success) {
      inputAccessKey.value = '';
      if (authStore.token) {
        authStore.fetchUserData();
      }
    }
  }
};

const handleLogin = async () => {
  if (inputToken.value.trim()) {
    authStore.error = '';
    const success = await authStore.login(inputToken.value.trim());
    if (success) {
      inputToken.value = '';
    }
  }
};

const downloadImage = () => {
  if (genStore.currentImage) {
    saveAs(genStore.currentImage.url, `nai_${genStore.currentImage.id}.png`);
  }
};

const handleUseParams = () => {
  if (genStore.currentImage) {
    genStore.useParams(genStore.currentImage);
    paramsCopied.value = true;
    setTimeout(() => { paramsCopied.value = false; }, 2000);
  }
};

const copyImageToClipboard = async () => {
  if (genStore.currentImage) {
    try {
      const response = await fetch(genStore.currentImage.url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      imageCopied.value = true;
      setTimeout(() => { imageCopied.value = false; }, 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  }
};

const fillOfficialUC = () => {
  const officialUC = "nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page";
  if (!genStore.params.negative_prompt.trim()) {
    genStore.params.negative_prompt = officialUC;
  } else if (!genStore.params.negative_prompt.includes('chromatic aberration')) {
    genStore.params.negative_prompt = `${officialUC}, ${genStore.params.negative_prompt}`;
  }
};

watch(
  () => authStore.siteUnlocked,
  (unlocked) => {
    if (unlocked) {
      document.title = 'NovelAI 工作台';
    } else {
      document.title = 'Portal';
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- 初始探测服务配置时保持纯净空白背景，防止任何内容闪烁 -->
    <div 
      v-if="!authStore.siteAuthChecked" 
      class="flex-1 h-screen bg-gray-100 dark:bg-gray-950 transition-colors"
    ></div>

    <!-- 站点访问密钥验证界面 (若开启了站点安全验证且未解锁，全屏仅展示纯净验证卡片，隐藏顶部栏和一切项目标识) -->
    <main 
      v-else-if="authStore.siteAuthRequired && !authStore.siteUnlocked"
      class="flex-1 h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950 transition-colors select-none"
    >
      <div class="max-w-sm w-full bg-white dark:bg-gray-900 p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl transition-colors flex flex-col items-center">
        <div class="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-5 text-gray-700 dark:text-gray-300">
          <Lock class="w-8 h-8" />
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-wide mb-1.5">访问权限验证</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">请输入访问密钥以解锁并进入系统</p>

        <div class="w-full space-y-4">
          <div>
            <input 
              v-model="inputAccessKey" 
              type="password" 
              placeholder="输入访问密钥..."
              @keyup.enter="handleVerifyAccess"
              class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-center tracking-widest placeholder:tracking-normal placeholder:text-gray-400 font-mono"
              autofocus
            />
          </div>

          <button 
            @click="handleVerifyAccess" 
            :disabled="authStore.siteAuthLoading || !inputAccessKey.trim()"
            class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm"
          >
            <Loader2 v-if="authStore.siteAuthLoading" class="w-4 h-4 animate-spin" />
            {{ authStore.siteAuthLoading ? '正在验证...' : '确认进入' }}
          </button>
        </div>

        <div v-if="authStore.siteAuthError" class="mt-4 w-full p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 text-xs text-center font-medium">
          {{ authStore.siteAuthError }}
        </div>
      </div>
    </main>

    <!-- 正常工作台流程 (通过密钥验证后才渲染顶部栏与后续页面) -->
    <template v-else>
      <!-- 头部区域 (优化移动端与PC端适配) -->
      <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2.5 flex flex-wrap justify-between items-center gap-2 shadow-sm z-10 shrink-0 transition-colors">
      <div class="flex items-center gap-2.5">
        <img src="/favicon.png" alt="Logo" class="w-6 h-6 rounded-md object-contain shrink-0" />
        <h1 class="text-lg md:text-xl font-bold tracking-tight whitespace-nowrap">
          NovelAI 工作台
        </h1>
      </div>
      
      <div class="flex flex-wrap gap-2 md:gap-3 items-center">
        <template v-if="authStore.token">
          <span 
            v-if="!authStore.allowPaid"
            class="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 rounded-md border border-amber-200 dark:border-amber-850 font-medium whitespace-nowrap flex items-center gap-1"
            title="该访问密钥已开启权限限制，仅可使用免费参数生图"
          >
            <Lock class="w-3 h-3 text-amber-500" />
            受限密钥 (仅免费额度)
          </span>
          <span class="text-xs bg-gray-100 dark:bg-gray-800 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 font-medium">
            {{ authStore.token === '__BUILTIN__' ? '内置 API Key' : (authStore.subscriptionTier === 3 ? 'Opus 会员' : (authStore.subscriptionTier === 2 ? 'Scroll 会员' : (authStore.subscriptionTier === 1 ? 'Tablet 会员' : '免费/未定'))) }}
          </span>
          <span class="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-800 font-medium whitespace-nowrap">
            Anlas: {{ authStore.anlas.toLocaleString() }}
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
          <button @click="authStore.logout(); inputToken = ''" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition" title="退出当前 Token 登录">
            <LogOut class="w-4 h-4" />
          </button>
          <button v-if="authStore.siteAuthRequired" @click="authStore.lockSite(); inputToken = ''" class="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 p-1 transition" title="退出并锁定访问密钥">
            <Lock class="w-4 h-4" />
          </button>
        </template>
        <button @click="showDataModal = true" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition" title="数据管理与备份">
          <Database class="w-4 h-4" />
        </button>
        <button @click="toggleDark()" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition" title="切换主题">
          <Moon v-if="!isDark" class="w-4 h-4" />
          <Sun v-else class="w-4 h-4" />
        </button>
        <a 
          href="https://github.com/luluxiaoyu/novelai-webui" 
          target="_blank" 
          rel="noopener noreferrer"
          class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1 transition flex items-center justify-center" 
          title="GitHub 开源仓库 (novelai-webui)"
        >
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>
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
          <!-- 内置 API Key 快速登录 -->
          <div v-if="authStore.hasBuiltinKey" class="mb-2">
            <button 
              @click="authStore.loginWithBuiltin()" 
              :disabled="authStore.loading"
              class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl p-4 transition-all font-semibold flex justify-center items-center gap-2 shadow-lg shadow-purple-600/20 active:scale-[0.99] text-sm"
            >
              <Loader2 v-if="authStore.loading && authStore.token === '__BUILTIN__'" class="w-4 h-4 animate-spin" />
              <Sparkles v-else class="w-4 h-4 text-amber-300" />
              <span>一键使用系统内置 API Key 登录</span>
            </button>
            <div class="flex items-center gap-2 my-4">
              <div class="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
              <span class="text-xs text-gray-400 font-medium">或使用个人 Token</span>
              <div class="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
            </div>
          </div>

          <div>
            <input 
              v-model="inputToken" 
              placeholder="自定义 API Token (ey...)" 
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
            <Loader2 v-if="authStore.loading && authStore.token !== '__BUILTIN__'" class="w-5 h-5 animate-spin" />
            {{ authStore.loading ? '正在验证密钥...' : (authStore.hasBuiltinKey ? '使用个人 Token 连接' : '立即连接') }}
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

        <!-- 退出访问权限 (重新锁定/切换访问密钥) -->
        <div v-if="authStore.siteAuthRequired" class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
          <button 
            @click="authStore.lockSite(); inputToken = ''" 
            class="text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5 font-medium py-1 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
            title="清除当前访问密钥并返回权限验证锁屏"
          >
            <Lock class="w-3.5 h-3.5" />
            <span>退出并切换访问密钥</span>
          </button>
        </div>
      </div>
    </main>

    <!-- 工作台页 (桌面端三栏并排各卡片内部滚动，手机端支持底部选项卡折叠切换) -->
    <main class="p-3 md:p-4 flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden relative" v-else>
      
      <!-- 移动端半透明背景遮罩 -->
      <div 
        v-if="mobileTab !== 'canvas'" 
        @click="mobileTab = 'canvas'"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
      ></div>

      <!-- 移动端底部悬浮导航 (胶囊栏) -->
      <div class="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-full p-1.5 flex items-center gap-1 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] z-50 transition-colors">
        <button 
          @click="mobileTab = mobileTab === 'controls' ? 'canvas' : 'controls'" 
          class="flex flex-col items-center justify-center w-16 h-12 rounded-full transition-all duration-300"
          :class="mobileTab === 'controls' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <SlidersHorizontal class="w-5 h-5 mb-0.5" />
          <span class="text-[10px] font-medium leading-none">控制</span>
        </button>
        <button 
          @click="mobileTab = 'canvas'" 
          class="flex flex-col items-center justify-center w-16 h-12 rounded-full transition-all duration-300"
          :class="mobileTab === 'canvas' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <ImageIcon class="w-5 h-5 mb-0.5" />
          <span class="text-[10px] font-medium leading-none">画布</span>
        </button>
        <button 
          @click="mobileTab = mobileTab === 'history' ? 'canvas' : 'history'" 
          class="flex flex-col items-center justify-center w-16 h-12 rounded-full transition-all duration-300 relative"
          :class="mobileTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <Layers class="w-5 h-5 mb-0.5" />
          <span class="text-[10px] font-medium leading-none">历史</span>
          <div v-if="filteredHistory.some(i => i.isNew)" class="absolute top-0.5 right-1 bg-blue-500 text-white text-[8px] font-bold px-1 py-px rounded border border-white dark:border-gray-900 shadow-sm leading-tight">新</div>
        </button>
      </div>

      <!-- 左侧控制面板 (独立卡片内部滚动，移动端作为左侧抽屉) -->
      <aside 
        class="
          w-[85vw] max-w-sm lg:max-w-none lg:w-96 flex-shrink-0 bg-white dark:bg-gray-900 
          lg:rounded-2xl border-r lg:border lg:border-gray-200 dark:border-gray-800 
          p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5 shadow-2xl lg:shadow-sm 
          transition-transform duration-300 ease-in-out h-full
          fixed inset-y-0 left-0 z-40 lg:static lg:transform-none lg:translate-x-0 pb-24 lg:pb-5
        "
        :class="mobileTab === 'controls' ? 'translate-x-0' : '-translate-x-full'"
      >
        <!-- 提示词输入区 -->
        <div class="flex flex-col gap-3">
          <div>
            <div class="flex justify-between items-center mb-1.5 flex-wrap gap-y-1">
              <div class="flex items-center gap-2">
                <label class="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">正向提示词 (Prompt)</label>
                <!-- Tag 词条联想推荐 Toggle 开关 -->
                <button 
                  type="button"
                  @click="genStore.enableTagSuggestions = !genStore.enableTagSuggestions"
                  class="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition select-none cursor-pointer border"
                  :class="genStore.enableTagSuggestions ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800' : 'bg-gray-100 dark:bg-gray-800/80 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:text-gray-600 dark:hover:text-gray-300'"
                  :title="genStore.enableTagSuggestions ? 'Tag 词条联想推荐已开启 (点击关闭)' : 'Tag 词条联想推荐已关闭 (点击开启)'"
                >
                  <Sparkles class="w-3 h-3" :class="genStore.enableTagSuggestions ? 'text-amber-500 fill-amber-500' : 'text-gray-400 opacity-60'" />
                  <span>{{ genStore.enableTagSuggestions ? 'Tag推荐' : 'Tag推荐' }}</span>
                  <span 
                    class="w-1.5 h-1.5 rounded-full" 
                    :class="genStore.enableTagSuggestions ? 'bg-amber-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'"
                  ></span>
                </button>
              </div>

              <div class="flex items-center gap-2.5">
                <button 
                  @click="showPromptEditor = true" 
                  class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  title="大窗口专注编辑正向/负向/多角色提示词"
                >
                  <Maximize2 class="w-3.5 h-3.5" />
                  展开编辑
                </button>
                <button 
                  @click="showStyleLibrary = true" 
                  class="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1 font-medium"
                  title="打开常用画风预设库"
                >
                  <Palette class="w-3.5 h-3.5" />
                  画风库
                </button>
                <button 
                  @click="showCharacterLibrary = true" 
                  class="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
                  title="打开常用角色预设库"
                >
                  <Users class="w-3.5 h-3.5" />
                  角色库
                </button>
                <button 
                  @click="showPromptHistory = true" 
                  class="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  title="历史提示词"
                >
                  <History class="w-3.5 h-3.5" />
                  历史 ({{ genStore.promptHistory.length }})
                </button>
              </div>
            </div>
            <PromptTextarea 
              v-model="genStore.params.prompt" 
              :rows="3" 
              :resizable="true"
              storage-key="positive_prompt"
              :min-height="80"
              placeholder="1girl, masterpiece, best quality, highly detailed, beautiful lighting..."
            />
          </div>

          <div>
            <div class="flex justify-between items-center mb-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">反向提示词 (Negative Prompt)</label>
              <button 
                @click="fillOfficialUC" 
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                title="一键填入官方 Heavy UC 负向画质与色差抑制预设"
              >
                + 官方画质预设
              </button>
            </div>
            <PromptTextarea 
              v-model="genStore.params.negative_prompt" 
              :rows="2" 
              :resizable="true"
              storage-key="negative_prompt"
              :min-height="55"
              placeholder="lowres, bad anatomy, bad hands, text, error, missing fingers..."
              textarea-class="text-gray-500 dark:text-gray-400"
            />
          </div>

          <!-- V4 / V4.5 / V5 多角色定位与专属提示词 (Character Prompts) -->
          <div v-if="!isV3" class="flex flex-col gap-2 p-3 bg-blue-50/60 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/40">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <Users class="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span class="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">多角色提示词</span>
                <span class="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono px-1.5 py-0.2 rounded-full font-semibold shrink-0">
                  {{ genStore.params.characters?.length || 0 }}
                </span>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <!-- 快捷打开角色库 -->
                <button 
                  @click="showCharacterLibrary = true" 
                  class="text-xs bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-medium px-2 py-1 rounded-lg transition flex items-center gap-1 shrink-0 active:scale-95"
                  title="从角色库选取或导入角色"
                >
                  <Users class="w-3.5 h-3.5 text-purple-500" />
                  <span>角色库</span>
                </button>

                <!-- 空间位置定位 Toggle Switch -->
                <div v-if="(genStore.params.characters?.length || 0) > 0" class="flex items-center gap-1.5">
                  <span class="text-[11px] text-gray-500 dark:text-gray-400 select-none font-medium">位置定位</span>
                  <button 
                    type="button" 
                    role="switch" 
                    :aria-checked="genStore.params.use_coords" 
                    @click="genStore.params.use_coords = !genStore.params.use_coords" 
                    class="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none" 
                    :class="genStore.params.use_coords ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'"
                    title="是否启用 2D 坐标位置定位"
                  >
                    <span 
                      aria-hidden="true" 
                      class="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out my-0.5" 
                      :class="genStore.params.use_coords ? 'translate-x-3.5' : 'translate-x-0.5'" 
                    />
                  </button>
                </div>

                <button 
                  @click="genStore.addCharacter" 
                  class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1 rounded-lg transition shadow-sm shadow-blue-500/20 flex items-center gap-1 shrink-0 active:scale-95"
                  title="添加一个新角色"
                >
                  <UserPlus class="w-3.5 h-3.5" />
                  <span>+ 角色</span>
                </button>
              </div>
            </div>

            <!-- 角色卡片列表 -->
            <div v-if="genStore.params.characters && genStore.params.characters.length > 0" class="flex flex-col gap-2.5 mt-1">
              <div 
                v-for="(char, idx) in genStore.params.characters" 
                :key="char.id" 
                class="bg-white dark:bg-gray-900 border rounded-xl p-3 shadow-xs flex flex-col gap-2.5 transition-all"
                :class="char.enabled !== false ? 'border-blue-200/80 dark:border-blue-800/80' : 'border-gray-200 dark:border-gray-800 opacity-60'"
              >
                <!-- 角色卡片头部 -->
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <!-- 角色启用 Toggle Button -->
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
                      <User class="w-3 h-3 text-blue-500" />
                      角色 {{ idx + 1 }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <!-- 快捷方位预设 (仅在启用位置定位时展示) -->
                    <div v-if="genStore.params.use_coords" class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5 text-[10px]">
                      <button 
                        @click="char.center = { x: 0.3, y: 0.5 }" 
                        class="px-1.5 py-0.5 rounded transition font-medium"
                        :class="char.center?.x <= 0.35 ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
                        title="预设：左侧 (X: 0.3)"
                      >左</button>
                      <button 
                        @click="char.center = { x: 0.5, y: 0.5 }" 
                        class="px-1.5 py-0.5 rounded transition font-medium"
                        :class="char.center?.x > 0.35 && char.center?.x < 0.65 ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
                        title="预设：居中 (X: 0.5)"
                      >中</button>
                      <button 
                        @click="char.center = { x: 0.7, y: 0.5 }" 
                        class="px-1.5 py-0.5 rounded transition font-medium"
                        :class="char.center?.x >= 0.65 ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
                        title="预设：右侧 (X: 0.7)"
                      >右</button>
                    </div>

                    <button 
                      @click="genStore.removeCharacter(char.id)" 
                      class="text-gray-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      title="删除此角色"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <!-- 角色专属 Prompt -->
                <div>
                  <PromptTextarea 
                    v-model="char.prompt" 
                    :rows="2" 
                    :placeholder="`角色 ${idx + 1} 特征 (如 1girl, nahida, dress, blonde hair, green eyes...)`"
                    textarea-class="p-2 border-gray-200 dark:border-gray-800 rounded-lg focus:ring-1"
                  />
                </div>

                <!-- 角色专属 UC (可选单行) -->
                <div>
                  <input 
                    v-model="char.uc" 
                    type="text"
                    class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500 font-mono text-gray-500 dark:text-gray-400" 
                    :placeholder="`角色 ${idx + 1} 独立负向词 (可选，如 bad hands, lowres...)`"
                  />
                </div>

                <!-- 坐标微调滑块 (仅在启用位置定位时展示) -->
                <div v-if="genStore.params.use_coords" class="pt-1.5 border-t border-gray-100 dark:border-gray-800/80 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                  <div class="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-950/60 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-800">
                    <span class="font-mono text-gray-600 dark:text-gray-400 shrink-0 font-medium">X:</span>
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

                  <div class="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-950/60 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-800">
                    <span class="font-mono text-gray-600 dark:text-gray-400 shrink-0 font-medium">Y:</span>
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

            <div v-else class="text-[11px] text-gray-400 dark:text-gray-500 py-1 text-center">
              点击右上角 "+ 角色" 为每个角色独立设定外貌特征
            </div>
          </div>

          <!-- 生成按钮与点数消耗/免费状态提示 -->
          <div class="flex flex-col gap-2 mt-1">
          <div class="flex gap-2">
            <button 
              @click="genStore.generate(); mobileTab = 'canvas'"
              :disabled="genStore.isGenerating || costInfo.blockedByPermission"
              class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium py-3 rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
            >
              <template v-if="genStore.isGenerating">
                <!-- 排队中 -->
                <template v-if="genStore.queueInfo && genStore.queueInfo.waiting > 0">
                  <Clock class="animate-spin w-4 h-4 text-amber-300" />
                  <span>排队中 (前方 {{ genStore.queueInfo.waiting }} 人)...</span>
                </template>
                <!-- 生图中 -->
                <template v-else>
                  <Loader2 class="animate-spin w-4 h-4" />
                  <span>{{ genStore.batchTotal > 1 ? `正在生成 (${genStore.batchCurrent}/${genStore.batchTotal})...` : '正在生成中...' }}</span>
                </template>
              </template>
              <template v-else-if="costInfo.blockedByPermission">
                <Lock class="w-4 h-4 text-amber-500" />
                <span>访问密钥受限 (禁止付费参数)</span>
              </template>
              <template v-else>
                <Sparkles class="w-4 h-4" />
                <span>立即生成图像</span>
              </template>
            </button>
            <div class="w-20 shrink-0 h-full self-stretch flex">
              <CustomSelect v-model="genStore.batchCount" :options="batchOptions" placement="right" size="lg" class="h-full w-full flex items-center" />
            </div>
          </div>

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
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">参数设置</span>
            <button 
              @click="genStore.resetAdvancedParams()" 
              class="text-xs text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 font-medium transition"
              title="重置采样器、步数、CFG、噪声调度等高级参数至默认值（保留提示词与分辨率）"
            >
              <RotateCcw class="w-3 h-3" />
              <span>重置参数</span>
            </button>
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1.5">模型 (Model)</label>
            <CustomSelect v-model="genStore.params.model" :options="modelOptions" />
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1.5">采样器 (Sampler)</label>
            <CustomSelect v-model="genStore.params.sampler" :options="samplerOptions" />
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

          <div class="flex flex-col gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between cursor-pointer group" @click="genStore.params.enable_stream = !genStore.params.enable_stream" title="允许服务器边画边给你传模糊过程图">
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">流式生成 (实时预览)</span>
              <button 
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none"
                :class="genStore.params.enable_stream ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'"
              >
                <span 
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  :class="genStore.params.enable_stream ? 'translate-x-2' : '-translate-x-2'"
                />
              </button>
            </div>

            <!-- 高级采样与降噪控制折叠面板 -->
            <div class="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-colors">
              <button 
                @click="showAdvanced = !showAdvanced" 
                class="w-full flex items-center justify-between p-2.5 bg-gray-50/80 dark:bg-gray-900/60 hover:bg-gray-100 dark:hover:bg-gray-850 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                <div class="flex items-center gap-1.5">
                  <SlidersHorizontal class="w-3.5 h-3.5 text-blue-500" />
                  <span>高级采样与降噪设置</span>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-gray-400">
                  <span>{{ showAdvanced ? '收起' : '展开' }}</span>
                  <ChevronDown v-if="!showAdvanced" class="w-3.5 h-3.5" />
                  <ChevronUp v-else class="w-3.5 h-3.5" />
                </div>
              </button>

              <div v-if="showAdvanced" class="p-3 bg-white dark:bg-gray-950 flex flex-col gap-3.5 border-t border-gray-200 dark:border-gray-800">
                <!-- 噪声调度 -->
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">噪声调度 (Noise Schedule)</label>
                  </div>
                  <CustomSelect v-model="genStore.params.noise_schedule" :options="noiseScheduleOptions" />
                </div>

                <!-- CFG 截断 (Skip CFG Above Sigma) -->
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      CFG 截断阈值: 
                      <span class="font-bold font-mono">{{ genStore.params.skip_cfg_above_sigma ?? '关闭' }}</span>
                    </label>
                    <button 
                      @click="genStore.params.skip_cfg_above_sigma = genStore.params.skip_cfg_above_sigma ? 0 : 19.34" 
                      class="text-[10px] text-blue-500 hover:underline"
                    >
                      {{ genStore.params.skip_cfg_above_sigma ? '关闭截断' : '设为默认(19.34)' }}
                    </button>
                  </div>
                  <input 
                    type="range" 
                    v-model.number="genStore.params.skip_cfg_above_sigma" 
                    min="0" 
                    max="30" 
                    step="0.1" 
                    class="w-full accent-blue-600" 
                  />
                  <span class="text-[10px] text-gray-400 mt-0.5 block">V4/V5 跳过高噪波初期 CFG 以避免发色灼烧与紫边 (0 为关闭)</span>
                </div>

                <!-- CFG Rescale -->
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      CFG 重缩放 (Rescale): 
                      <span class="font-bold font-mono">{{ genStore.params.cfg_rescale || 0 }}</span>
                    </label>
                  </div>
                  <input 
                    type="range" 
                    v-model.number="genStore.params.cfg_rescale" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    class="w-full accent-blue-600" 
                  />
                  <span class="text-[10px] text-gray-400 mt-0.5 block">高 Scale 时抑制过曝与对比度溢出 (默认 0.0)</span>
                </div>

                <!-- Uncond Scale -->
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      负向影响比重 (Uncond Scale): 
                      <span class="font-bold font-mono">{{ genStore.params.uncond_scale || 0 }}</span>
                    </label>
                  </div>
                  <input 
                    type="range" 
                    v-model.number="genStore.params.uncond_scale" 
                    min="0" 
                    max="1.5" 
                    step="0.05" 
                    class="w-full accent-blue-600" 
                  />
                  <span class="text-[10px] text-gray-400 mt-0.5 block">调节底层负向提示词的强度权重 (默认 0.0)</span>
                </div>

                <!-- 动态阈值化 (Decrisper) & 布朗噪声开关 -->
                <div class="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-gray-900">
                  <label class="flex items-center justify-between cursor-pointer py-1">
                    <span class="text-xs text-gray-700 dark:text-gray-300">布朗噪声 (Prefer Brownian)</span>
                    <input type="checkbox" v-model="genStore.params.prefer_brownian" class="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer py-1">
                    <span class="text-xs text-gray-700 dark:text-gray-300">动态阈值去伪影 (Decrisper)</span>
                    <input type="checkbox" v-model="genStore.params.dynamic_thresholding" class="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                  </label>
                </div>

                <!-- 一键重置高级参数 -->
                <div class="pt-1 border-t border-gray-100 dark:border-gray-900">
                  <button 
                    @click="genStore.resetAdvancedParams()" 
                    class="w-full text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-850 hover:bg-gray-200 dark:hover:bg-gray-800 py-2 px-3 rounded-lg border border-gray-200 dark:border-gray-700 transition flex items-center justify-center gap-1.5 font-medium"
                  >
                    <RotateCcw class="w-3.5 h-3.5" />
                    <span>恢复高级参数为官方默认值</span>
                  </button>
                </div>
              </div>
            </div>

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
        class="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-inner transition-colors lg:flex"
      >
        <!-- 顶部缩放与重置控制条 -->
        <div class="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-md text-xs">
          <button @click="zoomOut" class="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300 transition" title="缩小">
            <Minus class="w-3.5 h-3.5" />
          </button>
          <span class="font-mono text-gray-700 dark:text-gray-200 font-semibold px-1 min-w-[3.2rem] text-center">{{ Math.round(imgScale * 100) }}%</span>
          <button @click="zoomIn" class="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300 transition" title="放大">
            <Plus class="w-3.5 h-3.5" />
          </button>
          <div class="w-px h-3.5 bg-gray-200 dark:bg-gray-700 mx-0.5"></div>
          <button @click="resetZoom" class="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 transition text-[11px] font-medium flex items-center gap-1" title="自适应居中">
            <RotateCcw class="w-3 h-3" />
            自适应
          </button>
          <span class="text-gray-400 text-[10px] hidden md:inline ml-1">双指缩放 / 滚轮 / 拖拽</span>
        </div>

        <!-- 交互画布容器 -->
        <div 
          class="flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
          @wheel="handleWheel"
          @mousedown="startPan"
          @mousemove="doPan"
          @mouseup="stopPan"
          @mouseleave="stopPan"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
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
            
            <!-- 涂鸦悬浮工具栏 (移动端避免被底部导航遮挡，设置 bottom-24) -->
            <div class="absolute bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-800 p-2.5 sm:p-3 rounded-2xl shadow-2xl z-30 max-w-[92vw] overflow-x-auto">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500 whitespace-nowrap font-medium">画笔大小:</span>
                <input type="range" v-model.number="brushSize" min="5" max="150" class="w-24 sm:w-32 accent-blue-600" />
                <span class="font-mono text-xs w-6 text-gray-600 dark:text-gray-300">{{ brushSize }}</span>
              </div>
              <div class="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>
              <button @click="resetMask" class="text-xs text-gray-600 hover:text-red-500 font-medium transition whitespace-nowrap">重置</button>
              <button @click="exportMask(); showMaskEditor = false; mobileTab = 'controls'" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 sm:px-4 py-1.5 rounded-lg shadow-md shadow-blue-500/20 transition whitespace-nowrap">
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
            <div class="absolute bottom-24 sm:bottom-4 left-4 bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur flex items-center gap-1.5 shadow-lg animate-pulse z-20">
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
              <div v-if="genStore.isGenerating && !genStore.streamPreviewUrl" class="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-10 text-white p-4 text-center">
                <template v-if="genStore.queueInfo && genStore.queueInfo.waiting > 0">
                  <div class="p-3 bg-amber-500/20 border border-amber-400/40 rounded-2xl flex items-center gap-2.5 mb-2 shadow-lg backdrop-blur-md">
                    <Clock class="w-5 h-5 text-amber-300 animate-spin shrink-0" />
                    <span class="text-sm font-semibold text-amber-200">排队等待中 (前方 {{ genStore.queueInfo.waiting }} 人)</span>
                  </div>
                  <span class="text-xs text-gray-300">当前共享节点正忙，系统将自动按序调度执行</span>
                </template>
                <template v-else>
                  <Loader2 class="w-8 h-8 animate-spin mb-3 text-blue-400" />
                  <span class="text-sm font-medium animate-pulse">
                    {{ genStore.batchTotal > 1 ? `正在生成第 ${genStore.batchCurrent}/${genStore.batchTotal} 张图像...` : '正在生成图像...' }}
                  </span>
                </template>
              </div>
            </div>

            <!-- 待重绘标识 Tag -->
            <div 
              v-if="genStore.params.image && genStore.currentImage.url.split(',')[1] === genStore.params.image"
              class="absolute top-16 right-4 sm:top-auto sm:bottom-4 sm:right-44 bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm z-20 flex items-center gap-1.5 font-medium animate-fade-in"
            >
              <Paintbrush class="w-3.5 h-3.5" />
              待重绘
            </div>

            <!-- 浮动操作栏 (移动端放置在右上角 top-4 right-4，彻底解决与底部导航挤压冲突；PC端保留在右下角) -->
            <div class="absolute top-4 right-4 sm:top-auto sm:bottom-4 sm:right-4 flex items-center gap-1.5 sm:gap-2 z-30">
              <button @click="downloadImage" class="bg-white/95 hover:bg-blue-50 dark:bg-gray-900/95 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 p-2 sm:p-2.5 rounded-xl shadow-lg transition backdrop-blur-md" title="下载原图">
                <Download class="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button @click="copyImageToClipboard" class="bg-white/95 hover:bg-blue-50 dark:bg-gray-900/95 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 p-2 sm:p-2.5 rounded-xl shadow-lg transition backdrop-blur-md" title="复制图像到剪贴板">
                <Check v-if="imageCopied" class="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                <Copy v-else class="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button @click="handleUseParams" class="bg-white/95 hover:bg-blue-50 dark:bg-gray-900/95 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 p-2 sm:p-2.5 rounded-xl shadow-lg transition backdrop-blur-md" title="复用此图全部参数">
                <Check v-if="paramsCopied" class="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                <SlidersHorizontal v-else class="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </template>

          <!-- 空白状态 / 生成中状态 -->
          <div v-else class="text-gray-400 dark:text-gray-600 flex flex-col items-center justify-center gap-3">
            <template v-if="genStore.isGenerating && !genStore.streamPreviewUrl">
              <template v-if="genStore.queueInfo && genStore.queueInfo.waiting > 0">
                <div class="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-center gap-2.5 shadow-md">
                  <Clock class="w-6 h-6 text-amber-500 animate-spin" />
                  <span class="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    排队等待中 (前方 {{ genStore.queueInfo.waiting }} 人)
                  </span>
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">已进入任务队列，轮到时将自动开始生成</span>
              </template>
              <template v-else>
                <Loader2 class="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 animate-pulse">
                  {{ genStore.batchTotal > 1 ? `正在生成第 ${genStore.batchCurrent}/${genStore.batchTotal} 张图像...` : '正在生成图像...' }}
                </span>
              </template>
            </template>
            <template v-else>
              <ImageIcon class="w-16 h-16 opacity-40" />
              <p class="text-sm font-medium">在左侧输入提示词并生成，图像将在此呈现</p>
            </template>
          </div>
        </div>
      </section>

      <!-- 右侧历史画廊 (内部独立滚动，移动端作为右侧抽屉) -->
      <aside 
        class="
          w-[85vw] max-w-xs lg:max-w-none lg:w-60 flex-shrink-0 bg-white dark:bg-gray-900 
          border-l lg:border lg:border-gray-200 dark:border-gray-800 lg:rounded-2xl 
          p-3.5 flex flex-col gap-3 shadow-2xl lg:shadow-none
          transition-transform duration-300 ease-in-out h-full
          fixed inset-y-0 right-0 z-40 lg:static lg:transform-none lg:translate-x-0 pb-24 lg:pb-3.5
        "
        :class="mobileTab === 'history' ? 'translate-x-0' : 'translate-x-full'"
      >
        <div class="flex justify-between items-center shrink-0 pb-1 border-b border-gray-100 dark:border-gray-800">
          <div class="flex items-center gap-1.5">
            <h3 class="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">历史 ({{ filteredHistory.length }})</h3>
            <CustomSelect v-model="historyFilter" :options="historyFilterOptions" variant="ghost" placement="left" />
          </div>
          <div class="flex items-center gap-1">
            <button 
              v-if="filteredHistory.length > 0"
              @click="genStore.clearFilteredHistory(genStore.history.filter(i => !filteredHistory.map(f => f.id).includes(i.id)).map(i => i.id))" 
              class="text-[11px] text-red-500 hover:underline px-1.5 py-1 flex items-center gap-0.5"
              title="清空当前显示的记录"
            >
              <Trash2 class="w-3 h-3" />
              清空
            </button>
            <button 
              @click="mobileTab = 'canvas'"
              class="lg:hidden text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition ml-1"
              title="关闭历史面板"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
          <div 
            v-for="item in filteredHistory" 
            :key="item.id"
            class="group relative w-full shrink-0 rounded-xl overflow-hidden border-2 transition-all bg-gray-50 dark:bg-gray-950 flex flex-col"
            :class="genStore.currentImage?.id === item.id ? 'border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.35)]' : 'border-gray-200/80 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'"
          >
            <!-- 缩略图区域 (点击切换为当前大图并跳转画布) -->
            <div 
              @click="item.isNew = false; genStore.currentImage = item; resetZoom(); mobileTab = 'canvas'"
              class="relative w-full h-44 sm:h-48 cursor-pointer flex items-center justify-center bg-gray-100/50 dark:bg-gray-900/50 overflow-hidden"
              title="点击在画布中查看大图"
            >
              <!-- 未读标签指示器 -->
              <div v-if="item.isNew" class="absolute top-2 right-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm z-20 pointer-events-none tracking-widest border border-blue-400/50" style="text-indent: 0.1em;">新</div>
              
              <!-- 尺寸信息标签 -->
              <div class="absolute bottom-1.5 left-2 bg-black/60 text-white text-[9px] font-mono px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none z-10">
                {{ item.params.width }}x{{ item.params.height }}
              </div>

              <img :src="item.url" class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
            </div>
            
            <!-- 卡片底部独立操作栏 (常驻清晰可见，彻底告别盲点与误触) -->
            <div class="flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 text-xs">
              <div class="flex items-center gap-1">
                <button 
                  @click.stop="genStore.currentImage = item; genStore.sendToInpaint(item.url); showMaskEditor = true; initCanvas(); mobileTab = 'controls'" 
                  class="text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium py-1 px-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition flex items-center gap-1 text-[11px]"
                  title="发送到涂鸦重绘"
                >
                  <Paintbrush class="w-3 h-3 text-blue-500" />
                  <span>重绘</span>
                </button>
                <button 
                  @click.stop="genStore.useParams(item); mobileTab = 'controls'" 
                  class="text-gray-600 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 font-medium py-1 px-1.5 rounded hover:bg-purple-50 dark:hover:bg-purple-950/40 transition flex items-center gap-1 text-[11px]"
                  title="复用此图参数"
                >
                  <SlidersHorizontal class="w-3 h-3 text-purple-500" />
                  <span>复用</span>
                </button>
              </div>

              <button 
                @click.stop="handleDeleteHistory(item.id)" 
                class="py-1 px-1.5 rounded transition flex items-center gap-0.5 text-[11px]"
                :class="deletingHistoryId === item.id ? 'bg-red-600 text-white font-bold animate-pulse' : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'"
                :title="deletingHistoryId === item.id ? '再次点击确认删除' : '删除'"
              >
                <Trash2 v-if="deletingHistoryId !== item.id" class="w-3 h-3" />
                <span>{{ deletingHistoryId === item.id ? '确认删除?' : '' }}</span>
              </button>
            </div>
          </div>

          <div v-if="genStore.history.length === 0" class="text-xs text-gray-400 dark:text-gray-600 text-center py-12">
            暂无历史记录
          </div>
        </div>
      </aside>
    </main>

    <!-- 历史提示词弹窗 -->
    <div v-if="showPromptHistory" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div class="bg-white dark:bg-gray-900 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col md:flex-row max-h-[92vh] md:max-h-[85vh] h-[92vh] md:h-[85vh] overflow-hidden border border-gray-200 dark:border-gray-800">
        
        <!-- PC端左侧过滤器和搜索 (md:flex) -->
        <div class="hidden md:flex w-60 bg-gray-50 dark:bg-gray-950/50 border-r border-gray-200 dark:border-gray-800 flex-col overflow-y-auto custom-scrollbar shrink-0">
          <div class="p-3.5 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-sm font-semibold flex items-center gap-2 mb-3">
              <History class="w-4 h-4 text-blue-500" />
              提示词库
            </h3>
            
            <div class="relative">
              <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                v-model="promptSearchQuery"
                type="text" 
                placeholder="搜索提示词或备注..."
                class="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          <div class="p-2.5 flex flex-col gap-0.5">
            <div class="text-[11px] font-bold text-gray-400 dark:text-gray-500 px-2.5 py-1.5 uppercase tracking-wider">时间筛选</div>
            <button 
              v-for="opt in promptDateFilterOptions" :key="opt.value"
              @click="promptDateFilter = opt.value"
              class="text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between group"
              :class="promptDateFilter === opt.value ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'"
            >
              <span>{{ opt.label }}</span>
              <Check v-if="promptDateFilter === opt.value" class="w-3.5 h-3.5" />
            </button>
          </div>

          <div class="p-2.5 flex flex-col gap-0.5 border-t border-gray-200 dark:border-gray-800 flex-1">
            <div class="text-[11px] font-bold text-gray-400 dark:text-gray-500 px-2.5 py-1.5 uppercase tracking-wider">分组与收藏</div>
            <button 
              @click="promptGroupFilter = 'all'"
              class="text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-2"
              :class="promptGroupFilter === 'all' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'"
            >
              <FolderOpen class="w-3.5 h-3.5 opacity-70" /> 全部
            </button>
            <button 
              @click="promptGroupFilter = 'favorites'"
              class="text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-2"
              :class="promptGroupFilter === 'favorites' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'"
            >
              <FolderHeart class="w-3.5 h-3.5 opacity-70" /> 我的收藏
            </button>
            
            <button 
              v-for="group in customPromptGroups" :key="group"
              @click="promptGroupFilter = group"
              class="text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-2"
              :class="promptGroupFilter === group ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'"
            >
              <Folder class="w-3.5 h-3.5 opacity-70" /> {{ group }}
            </button>
          </div>
        </div>

        <!-- 移动端顶部标题、搜索与快捷横向筛选胶囊栏 (md:hidden) -->
        <div class="md:hidden flex flex-col border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/60 shrink-0">
          <div class="px-3.5 py-2.5 flex items-center justify-between border-b border-gray-200/60 dark:border-gray-800/60">
            <h3 class="text-sm font-bold flex items-center gap-1.5">
              <History class="w-4 h-4 text-blue-500" />
              提示词库 ({{ filteredPromptHistory.length }})
            </h3>
            <button @click="showPromptHistory = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800">
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- 搜索输入框 -->
          <div class="p-2.5 pb-1.5">
            <div class="relative">
              <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                v-model="promptSearchQuery"
                type="text" 
                placeholder="搜索提示词、备注或负面..."
                class="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              <button 
                v-if="promptSearchQuery" 
                @click="promptSearchQuery = ''"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- 快捷横向滑动筛选栏 -->
          <div class="flex items-center gap-1.5 overflow-x-auto px-2.5 pb-2.5 pt-0.5 custom-scrollbar select-none">
            <button 
              @click="promptGroupFilter = 'all'; promptDateFilter = 'all'"
              class="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap font-medium transition flex items-center gap-1 shrink-0"
              :class="promptGroupFilter === 'all' && promptDateFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300'"
            >
              全部
            </button>
            <button 
              @click="promptGroupFilter = 'favorites'"
              class="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap font-medium transition flex items-center gap-1 shrink-0"
              :class="promptGroupFilter === 'favorites' ? 'bg-yellow-500 text-white shadow-sm' : 'bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300'"
            >
              ⭐ 我的收藏
            </button>
            <button 
              @click="promptDateFilter = promptDateFilter === 'today' ? 'all' : 'today'"
              class="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap font-medium transition flex items-center gap-1 shrink-0"
              :class="promptDateFilter === 'today' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300'"
            >
              📅 今天
            </button>
            <button 
              @click="promptDateFilter = promptDateFilter === 'week' ? 'all' : 'week'"
              class="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap font-medium transition flex items-center gap-1 shrink-0"
              :class="promptDateFilter === 'week' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300'"
            >
              📅 近7天
            </button>
            <button 
              v-for="group in customPromptGroups" :key="group"
              @click="promptGroupFilter = promptGroupFilter === group ? 'all' : group"
              class="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap font-medium transition flex items-center gap-1 shrink-0"
              :class="promptGroupFilter === group ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300'"
            >
              📁 {{ group }}
            </button>
          </div>
        </div>

        <!-- 内容列表区 -->
        <div class="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
          <div class="hidden md:flex px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 justify-between items-center">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              共找到 <span class="font-bold text-gray-900 dark:text-white">{{ filteredPromptHistory.length }}</span> 条记录
            </h3>
            <button @click="showPromptHistory = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <X class="w-5 h-5" />
            </button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
            <div v-if="filteredPromptHistory.length === 0" class="text-center py-16 sm:py-20 text-gray-400 dark:text-gray-600 text-sm flex flex-col items-center">
              <Search class="w-10 h-10 opacity-20 mb-3" />
              未找到匹配的提示词
            </div>
            <div v-else class="flex flex-col gap-3">
              <div 
                v-for="item in filteredPromptHistory" 
                :key="item.id" 
                class="p-3 sm:p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition group flex flex-col gap-2 relative"
              >
                <!-- 顶部：收藏与分组与备注 -->
                <div class="flex items-center gap-2 border-b border-gray-200/60 dark:border-gray-700/60 pb-2">
                  <button @click="genStore.toggleFavoritePrompt(item.id)" title="收藏/取消收藏" class="p-1 -m-1 shrink-0">
                    <Star :class="['w-4 h-4 transition-colors', item.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-400 dark:text-gray-600']" />
                  </button>
                  <input
                    type="text"
                    :value="item.group || ''"
                    @change="genStore.updatePromptGroup(item.id, ($event.target as HTMLInputElement).value)"
                    class="w-16 shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-gray-200/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="分组..."
                    title="输入并回车以设置自定义分组"
                  />
                  <input
                    type="text"
                    :value="item.note || new Date(item.timestamp).toLocaleString()"
                    @change="genStore.updatePromptNote(item.id, ($event.target as HTMLInputElement).value)"
                    class="text-xs bg-transparent border-b border-transparent focus:border-blue-500 text-gray-600 dark:text-gray-400 focus:text-gray-800 dark:focus:text-gray-200 outline-none flex-1 transition-colors min-w-0"
                    placeholder="添加备注..."
                  />
                </div>

                <!-- 提示词与负面提示词主体 -->
                <div class="py-0.5">
                  <p class="text-xs sm:text-sm text-gray-800 dark:text-gray-200 mb-1.5 font-medium leading-relaxed break-all select-text">{{ item.prompt }}</p>
                  <p v-if="item.negative_prompt" class="text-[11px] sm:text-xs text-red-500/80 dark:text-red-400/80 leading-relaxed break-all select-text" :title="item.negative_prompt">
                    <span class="font-semibold text-red-600/90 dark:text-red-400/90">Negative:</span> {{ item.negative_prompt }}
                  </p>
                </div>
                
                <!-- 底部操作按钮栏 (移动端常驻展示，PC端hover展现) -->
                <div class="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800/60">
                  <span class="text-[10px] text-gray-400 font-mono">{{ new Date(item.timestamp).toLocaleDateString() }}</span>

                  <div class="flex items-center gap-1.5">
                    <button 
                      @click="handleCopyPrompt(item)" 
                      class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition flex items-center gap-1"
                      :title="copiedPromptId === item.id ? '已复制到剪贴板' : '复制提示词'"
                    >
                      <Check v-if="copiedPromptId === item.id" class="w-3.5 h-3.5 text-green-500" />
                      <Copy v-else class="w-3.5 h-3.5" />
                      <span>{{ copiedPromptId === item.id ? '已复制' : '复制' }}</span>
                    </button>

                    <button 
                      @click="handleDeletePrompt(item.id)" 
                      class="text-xs px-2 py-1 rounded-lg transition flex items-center gap-1"
                      :class="deletingPromptId === item.id ? 'bg-red-600 text-white font-bold animate-pulse' : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'"
                      :title="deletingPromptId === item.id ? '再次点击确认删除' : '删除'"
                    >
                      <Trash2 v-if="deletingPromptId !== item.id" class="w-3.5 h-3.5" />
                      <span>{{ deletingPromptId === item.id ? '确认删除?' : '' }}</span>
                    </button>

                    <button 
                      @click="genStore.usePrompt(item); showPromptHistory = false" 
                      class="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg shadow-sm hover:bg-blue-700 transition font-medium flex items-center gap-1"
                    >
                      应用
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 数据管理弹窗 -->
    <div v-if="showDataModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950/50">
          <h3 class="text-base font-semibold flex items-center gap-2">
            <Database class="w-5 h-5 text-blue-500" />
            数据管理与备份
          </h3>
          <button @click="showDataModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
            <X class="w-5 h-5" />
          </button>
        </div>
        
        <div class="flex border-b border-gray-200 dark:border-gray-800">
          <button @click="dataModalTab = 'local'" :class="dataModalTab === 'local' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'" class="flex-1 py-3 text-sm font-medium border-b-2 transition">本地 ZIP 备份</button>
          <button @click="dataModalTab = 'webdav'" :class="dataModalTab === 'webdav' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'" class="flex-1 py-3 text-sm font-medium border-b-2 transition flex items-center justify-center gap-1"><Cloud class="w-4 h-4" /> WebDAV 同步</button>
        </div>
        
        <div v-if="dataModalTab === 'local'" class="p-5 flex flex-col gap-6">
          <div class="flex flex-col gap-3">
            <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2">导出数据</h4>
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" v-model="exportIncludeImages" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span>包含已生成的历史图片数据</span>
            </label>
            <p v-if="exportIncludeImages" class="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
              注意：包含图片数据可能会导致备份文件非常庞大（几十MB甚至上百MB）。
            </p>
            <button 
              @click="handleExportData"
              :disabled="isExporting"
              class="w-full flex justify-center items-center gap-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white px-4 py-2.5 rounded-xl font-medium transition shadow-sm disabled:opacity-50"
            >
              <Loader2 v-if="isExporting" class="w-4 h-4 animate-spin" />
              <DownloadCloud v-else class="w-4 h-4" />
              {{ isExporting ? '正在打包压缩包...' : '下载备份文件' }}
            </button>
          </div>
          <div class="flex flex-col gap-3">
            <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2">导入恢复</h4>
            <div class="flex gap-4">
              <label class="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="radio" v-model="importMode" value="merge" class="text-blue-600 focus:ring-blue-500" />
                <span>增量导入 (合并)</span>
              </label>
              <label class="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="radio" v-model="importMode" value="overwrite" class="text-red-500 focus:ring-red-500" />
                <span>完全覆盖 (替换)</span>
              </label>
            </div>
            <p v-if="importMode === 'overwrite'" class="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              警告：当前的所有历史记录和参数将被导入的文件完全替换！
            </p>
            <input type="file" accept=".zip" class="hidden" ref="fileInputRef" @change="handleImportData" />
            <button 
              @click="fileInputRef?.click()"
              :disabled="isImporting"
              class="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition shadow-sm disabled:opacity-50"
            >
              <Loader2 v-if="isImporting" class="w-4 h-4 animate-spin" />
              <UploadCloud v-else class="w-4 h-4" />
              {{ isImporting ? '正在解析导入...' : '选择并导入 ZIP 文件' }}
            </button>
          </div>
        </div>

        <div v-else class="p-5 flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-xs font-semibold text-gray-500">服务器配置</label>
            <input v-model="webdavStore.config.url" type="text" placeholder="WebDAV URL (如 https://dav.box.com)" class="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
            <div class="flex gap-2">
              <input v-model="webdavStore.config.username" type="text" placeholder="用户名" class="w-1/2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
              <input v-model="webdavStore.config.password" type="password" placeholder="密码" class="w-1/2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div class="flex gap-2 items-center">
               <input v-model="webdavStore.config.basePath" type="text" placeholder="存储路径 (如 /NovelAI_Saves)" class="flex-1 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
               <button @click="handleTestConnection" :disabled="webdavStore.isSyncing" class="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm px-3 py-2 rounded-lg transition disabled:opacity-50 whitespace-nowrap"><Wifi class="w-4 h-4 inline mr-1" />测试连接</button>
            </div>
            <p v-if="connectionStatus" :class="connectionStatus.type === 'success' ? 'text-green-500' : 'text-red-500'" class="text-xs mt-1 px-1">{{ connectionStatus.text }}</p>
          </div>
          <div class="border-t border-gray-100 dark:border-gray-800 my-1"></div>
          <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <label class="text-xs font-semibold text-gray-500">当前存档 (Profile)</label>
              <button @click="webdavStore.loadProfiles" :disabled="webdavStore.isSyncing" class="text-xs text-blue-500 hover:underline">刷新存档列表</button>
            </div>
            <div class="flex gap-2">
              <div class="flex-1">
                <CustomSelect 
                  v-model="webdavStore.currentProfile" 
                  :options="webdavStore.profiles.map(p => ({ label: p, value: p }))" 
                />
              </div>
              <button @click="handleCreateProfile" title="新建存档" class="px-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition text-gray-700 dark:text-gray-300">+</button>
              <button @click="handleDeleteProfile" title="删除当前存档" class="px-3 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition text-red-600 dark:text-red-400"><Trash2 class="w-4 h-4" /></button>
            </div>
            <div class="flex gap-2 mt-2">
              <template v-if="webdavStore.isSyncing">
                 <div class="flex flex-col gap-2 w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                   <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700 overflow-hidden shadow-inner">
                     <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" :style="{ width: webdavStore.syncProgress + '%' }"></div>
                   </div>
                   <p class="text-xs text-center font-medium text-gray-600 dark:text-gray-400 animate-pulse">{{ webdavStore.syncText }}</p>
                 </div>
              </template>
              <template v-else>
                 <button @click="webdavStore.syncDown(genStore)" :disabled="webdavStore.isSyncing" class="flex-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 py-2 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition flex items-center justify-center gap-1"><DownloadCloud class="w-4 h-4" />云端 -> 本地</button>
                 <button @click="webdavStore.syncUp(genStore)" :disabled="webdavStore.isSyncing" class="flex-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 py-2 rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition flex items-center justify-center gap-1"><UploadCloud class="w-4 h-4" />本地 -> 云端</button>
              </template>
            </div>
          </div>
          <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-950 p-3 rounded-lg border border-gray-200 dark:border-gray-800">
             <div class="flex flex-col">
               <span class="text-sm font-medium">无感自动同步</span>
               <span class="text-xs text-gray-500">每次生图后静默增量推送至云端</span>
             </div>
             <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="webdavStore.autoSync" class="sr-only peer">
              <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 拖入图片操作选择弹窗 (点击外部不关闭，仅可通过右上角 X 或取消关闭) -->
    <div v-if="showDropActionModal && droppedImageInfo" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div class="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
        
        <!-- 头部 -->
        <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/80 dark:bg-gray-950/50">
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400">
              <ImageIcon class="w-4 h-4" />
            </div>
            <h3 class="text-base font-semibold">图片导入选项</h3>
          </div>
          <button @click="showDropActionModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- 图片预览与信息 -->
        <div class="p-5 flex flex-col gap-4">
          <div class="flex gap-4 p-3 bg-gray-50 dark:bg-gray-950/60 rounded-xl border border-gray-200/60 dark:border-gray-800">
            <div class="w-20 h-20 rounded-lg overflow-hidden bg-black/10 shrink-0 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
              <img :src="droppedImageInfo.dataUrl" class="w-full h-full object-contain" />
            </div>
            <div class="flex-1 flex flex-col justify-center gap-1 text-xs">
              <span class="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[280px]" :title="droppedImageInfo.file.name">
                {{ droppedImageInfo.file.name }}
              </span>
              <span class="text-gray-500 dark:text-gray-400">
                分辨率: {{ droppedImageInfo.targetWidth }} × {{ droppedImageInfo.targetHeight }}
              </span>
              <div v-if="droppedImageInfo.metadata.hasMetadata" class="flex items-center gap-1 text-green-600 dark:text-green-400 text-[11px] font-medium mt-0.5">
                <Check class="w-3.5 h-3.5" />
                <span>已识别到 NovelAI 提示词/参数元数据</span>
              </div>
              <div v-else class="text-amber-500 dark:text-amber-400 text-[11px] mt-0.5">
                未检测到元数据 (可直接作为底图重绘/生图)
              </div>
            </div>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400">请选择您希望对该图片进行的操作：</p>

          <!-- 三个选项卡片 -->
          <div class="grid grid-cols-1 gap-2.5">
            <!-- 选项1：局部重绘 -->
            <button 
              @click="applyDropAction('inpaint')" 
              class="w-full p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-500 dark:hover:border-purple-500 bg-white dark:bg-gray-900 hover:bg-purple-50/40 dark:hover:bg-purple-950/20 text-left transition flex items-start gap-3 group"
            >
              <div class="p-2 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-xl group-hover:scale-105 transition shrink-0">
                <Paintbrush class="w-4 h-4" />
              </div>
              <div class="flex-1">
                <div class="font-semibold text-xs text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 flex items-center justify-between">
                  <span>🎨 载入为局部重绘 (Inpainting)</span>
                  <span class="text-[10px] text-purple-600 dark:text-purple-400 font-normal">进入涂抹画板</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">载入为此图片的重绘底图，并直接打开遮罩涂抹编辑器</p>
              </div>
            </button>

            <!-- 选项2：图生图 -->
            <button 
              @click="applyDropAction('img2img')" 
              class="w-full p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-gray-900 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-left transition flex items-start gap-3 group"
            >
              <div class="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-105 transition shrink-0">
                <Layers class="w-4 h-4" />
              </div>
              <div class="flex-1">
                <div class="font-semibold text-xs text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-between">
                  <span>🖼️ 载入为图生图 (Image to Image)</span>
                  <span class="text-[10px] text-blue-600 dark:text-blue-400 font-normal">垫图生成</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">作为垫图底图，可通过强度和噪点控制新图与原图的相似程度</p>
              </div>
            </button>

            <!-- 选项3：识别元数据并填入参数 -->
            <button 
              @click="applyDropAction('metadata')" 
              :disabled="!droppedImageInfo.metadata.hasMetadata"
              class="w-full p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-white dark:bg-gray-900 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 text-left transition flex items-start gap-3 group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-800 disabled:hover:bg-transparent"
            >
              <div class="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:scale-105 transition shrink-0">
                <FileText class="w-4 h-4" />
              </div>
              <div class="flex-1">
                <div class="font-semibold text-xs text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 flex items-center justify-between">
                  <span>📋 提取元数据并填入参数</span>
                  <span v-if="droppedImageInfo.metadata.hasMetadata" class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">一键填入</span>
                  <span v-else class="text-[10px] text-gray-400 font-normal">无元数据</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">读取图中的 Prompt、UC、步数、CFG、尺寸、采样器并填入表单</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 角色预设库弹窗 -->
    <CharacterLibraryModal v-model="showCharacterLibrary" />

    <!-- 画风预设库弹窗 -->
    <StyleLibraryModal v-model="showStyleLibrary" />

    <!-- 提示词大屏工作台弹窗 -->
    <PromptEditorModal v-model="showPromptEditor" />

    <!-- 页面拖拽悬浮提示遮罩 -->
    <div 
      v-if="isDraggingOver" 
      class="fixed inset-0 z-[100] bg-blue-600/20 dark:bg-blue-500/20 backdrop-blur-sm border-4 border-dashed border-blue-500 flex flex-col items-center justify-center gap-3 text-blue-600 dark:text-blue-400 pointer-events-none animate-fade-in"
    >
      <div class="p-5 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex items-center gap-3 border border-blue-200 dark:border-blue-800">
        <UploadCloud class="w-8 h-8 animate-bounce" />
        <span class="text-base font-bold text-gray-900 dark:text-gray-100">松开以导入图片...</span>
      </div>
    </div>
  </template>
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
