import { defineStore } from 'pinia';
import { ref, reactive, toRaw } from 'vue';
import { encryptedAxios, encryptedFetchStream } from '../utils/api';
import JSZip from 'jszip';
import { useAuthStore } from './auth';
import { useWebDAVStore } from './webdav';

export interface CharacterPrompt {
  id: string;
  prompt: string;
  uc?: string;
  center: { x: number; y: number };
  enabled?: boolean;
}

export interface GenerationParams {
  prompt: string;
  negative_prompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  sampler: string;
  scale: number;
  seed: number;
  sm: boolean;
  sm_dyn: boolean;
  dynamic_thresholding: boolean;
  enable_stream: boolean;
  // Advanced Sampling & Noise Controls
  noise_schedule: string;
  cfg_rescale: number;
  uncond_scale: number;
  skip_cfg_above_sigma: number | null;
  prefer_brownian: boolean;
  // Character Prompts (V4, V4.5, V5)
  characters?: CharacterPrompt[];
  use_coords?: boolean;
  // Inpaint / Img2img
  image?: string; // Base64
  mask?: string;  // Base64
  strength?: number;
  noise?: number;
  auto_quality_presets?: boolean;
  transparent_bg?: boolean;
}

export const OFFICIAL_V5_POS_PRESET = ', no text, best quality, very aesthetic, absurdres, very aesthetic, masterpiece, no text';
export const OFFICIAL_V5_NEG_PRESET = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, bad feet, username, {bad}, fewer, extra, watermark, unfinished,displeasing, chromatic aberration, signature, extra digits, artistic error, scan, [abstract],logo,{big belly},';

export interface GeneratedImage {
  id: string;
  url: string;
  params: GenerationParams;
  timestamp: number;
  isNew?: boolean;
}




const DB_NAME = 'novelai_db';
const DB_VERSION = 2;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
      if (!db.objectStoreNames.contains('images')) {
        const imgStore = db.createObjectStore('images', { keyPath: 'id' });
        imgStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const toCloneableImage = (rawImg: any): GeneratedImage => {
  // 深度剥离 Vue 响应式 Proxy 包装与内部符号，生成 100% 纯净可克隆普通对象
  let plain: any;
  try {
    plain = JSON.parse(JSON.stringify(toRaw(rawImg) || {}));
  } catch {
    plain = { ...rawImg };
  }
  return {
    id: String(plain.id || `${plain.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
    url: String(plain.url || ''),
    params: plain.params || {},
    timestamp: typeof plain.timestamp === 'number' ? plain.timestamp : Date.now(),
    isNew: Boolean(plain.isNew)
  };
};

const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains('store')) { resolve(null); return; }
      const tx = db.transaction('store', 'readonly');
      const getReq = tx.objectStore('store').get(key);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    });
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      const putReq = tx.objectStore('store').put(value, key);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  },
  removeItem: async (key: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains('store')) { resolve(); return; }
      const tx = db.transaction('store', 'readwrite');
      const delReq = tx.objectStore('store').delete(key);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
  },
  getAllImages: async (): Promise<GeneratedImage[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains('images')) { resolve([]); return; }
      const tx = db.transaction('images', 'readonly');
      const store = tx.objectStore('images');
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev');
      const results: GeneratedImage[] = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },
  putImage: async (image: GeneratedImage): Promise<void> => {
    const cloneable = toCloneableImage(image);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const req = tx.objectStore('images').put(cloneable);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  putImages: async (images: GeneratedImage[]): Promise<void> => {
    if (!images.length) return;
    const db = await openDB();
    const batchSize = 10;
    for (let i = 0; i < images.length; i += batchSize) {
      const chunk = images.slice(i, i + batchSize).map(toCloneableImage);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        for (const img of chunk) {
          store.put(img);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    }
  },
  deleteImage: async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const req = tx.objectStore('images').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  deleteImages: async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  clearImages: async (): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const req = tx.objectStore('images').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  countImages: async (): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains('images')) { resolve(0); return; }
      const tx = db.transaction('images', 'readonly');
      const req = tx.objectStore('images').count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  }
};

// 多标签页跨页面同步通道
let tabSyncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    tabSyncChannel = new BroadcastChannel('novelai_tab_sync');
  } catch (e) {
    console.warn('BroadcastChannel not supported', e);
  }
}

export const useGenerationStore = defineStore('generation', () => {
  const authStore = useAuthStore();
  
  // 升级迁移状态
  const showMigrationModal = ref(false);
  const migrationOldImages = ref<GeneratedImage[]>([]);
  const isMigrating = ref(false);
  const migrationProgress = ref({ current: 0, total: 0 });
  const migrationError = ref('');
  const migrationCompleted = ref(false);
  const isLoadingHistory = ref(true);

  // 全量备份保存当前历史到 IndexedDB (用于批量导入或恢复时)
  const saveHistoryToIDB = async () => {
    try {
      await idbStorage.putImages(history.value);
    } catch (e) {
      console.error('Failed to save history to IDB:', e);
    }
  };

  // 异步从 IDB 加载历史
  const loadHistoryFromIDB = async () => {
    isLoadingHistory.value = true;
    try {
      const isMigrated = await idbStorage.getItem('history_migrated_v2');
      if (!isMigrated) {
        // 检查是否有 v1 时代的单键 history 数据
        const oldData = await idbStorage.getItem('history');
        if (oldData) {
          try {
            const diskList: GeneratedImage[] = JSON.parse(oldData);
            if (Array.isArray(diskList) && diskList.length > 0) {
              // 探测到旧版数据，记录下来并弹出升级提示弹窗，不进行静默升级
              migrationOldImages.value = diskList;
              migrationProgress.value = { current: 0, total: diskList.length };
              showMigrationModal.value = true;

              // 同时临时载入内存展示，保证弹窗出现时用户也能立刻查看
              history.value = diskList;
              if (history.value.length > 0 && !currentImage.value) {
                currentImage.value = history.value[0];
              }
              return;
            }
          } catch (e) {
            console.error('Failed to parse old history:', e);
          }
        }
        // 若完全无旧数据，直接标为已完成 v2 初始状态
        await idbStorage.setItem('history_migrated_v2', 'true');
      }

      // 从 v2 images 独立表按时间倒序全量载入（默认无限保存）
      const list = await idbStorage.getAllImages();
      if (Array.isArray(list)) {
        history.value = list;
        if (history.value.length > 0 && !currentImage.value) {
          currentImage.value = history.value[0];
        }
      }
    } catch (e) {
      console.error('IDB load error', e);
    } finally {
      isLoadingHistory.value = false;
    }
  };

  // 用户点击确认升级：安全将旧版数据迁移到 images 独立 store，带进度和防误刷保护
  const executeMigration = async () => {
    if (isMigrating.value || migrationOldImages.value.length === 0) return;
    isMigrating.value = true;
    migrationError.value = '';
    migrationProgress.value.current = 0;

    const total = migrationOldImages.value.length;
    migrationProgress.value.total = total;

    const preventUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '正在安全升级图库存储架构，刷新或关闭可能导致数据丢失，确定要离开吗？';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', preventUnload);

    try {
      const batchSize = 10;
      for (let i = 0; i < total; i += batchSize) {
        const chunk = migrationOldImages.value.slice(i, i + batchSize);
        await idbStorage.putImages(chunk);
        migrationProgress.value.current = Math.min(total, i + chunk.length);
        await new Promise(r => setTimeout(r, 16));
      }

      // 验证写入数量
      const count = await idbStorage.countImages();
      console.log(`[Storage Migration] Verified ${count} images in v2 images store`);

      // 写入迁移完成标记
      await idbStorage.setItem('history_migrated_v2', 'true');
      // 清空旧版巨大的单个 history key 释放存储空间
      await idbStorage.removeItem('history');

      // 从独立表重新加载以保持最新
      const freshList = await idbStorage.getAllImages();
      history.value = freshList;

      migrationCompleted.value = true;
      migrationOldImages.value = [];
    } catch (err: any) {
      console.error('[Storage Migration Error]', err);
      migrationError.value = err?.message || '升级写入发生异常，原有数据未损坏';
    } finally {
      isMigrating.value = false;
      window.removeEventListener('beforeunload', preventUnload);
    }
  };

  loadHistoryFromIDB();

  // 监听多标签页同步消息
  if (tabSyncChannel) {
    tabSyncChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'ADD_IMAGE' && msg.image) {
        const incoming: GeneratedImage = msg.image;
        if (!history.value.some(h => h.id === incoming.id)) {
          history.value.unshift(incoming);
          // 无限保存，不执行 pop()
        }
      } else if (msg.type === 'DELETE_IMAGE' && msg.id) {
        history.value = history.value.filter(h => h.id !== msg.id);
        if (currentImage.value?.id === msg.id) {
          currentImage.value = history.value.length > 0 ? history.value[0] : null;
        }
      } else if (msg.type === 'CLEAR_HISTORY') {
        history.value = [];
        currentImage.value = null;
      } else if (msg.type === 'KEEP_IMAGES' && Array.isArray(msg.ids)) {
        const idSet = new Set(msg.ids);
        history.value = history.value.filter(item => idSet.has(item.id));
        if (currentImage.value && !idSet.has(currentImage.value.id)) {
          currentImage.value = history.value.length > 0 ? history.value[0] : null;
        }
      }
    };
  }

  // 页面切回前台时，自动从 IDB 重新校验增量
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadHistoryFromIDB();
      }
    });
  }

  import('vue').then(({ watch }) => {
    watch(history, () => {
      saveHistoryToIDB();
    }, { deep: true });
  });

  const params = reactive<GenerationParams>({
    prompt: '',
    negative_prompt: '',
    model: 'nai-diffusion-5-full',
    width: 832,
    height: 1216,
    steps: 28,
    sampler: 'k_euler_ancestral',
    scale: 7.0,
    seed: -1,
    sm: false,
    sm_dyn: false,
    dynamic_thresholding: false,
    enable_stream: false,
    noise_schedule: 'karras',
    cfg_rescale: 0,
    uncond_scale: 0,
    skip_cfg_above_sigma: null,
    prefer_brownian: true,
    strength: 0.7,
    noise: 0.0,
    characters: [],
    use_coords: false,
    auto_quality_presets: true,
    transparent_bg: false,
  });

  const history = ref<GeneratedImage[]>([]);
  const promptHistory = ref<Array<{ 
    id: string; 
    prompt: string; 
    negative_prompt: string; 
    characters?: Array<{ id: string; prompt: string; uc: string; center: { x: number; y: number }; enabled: boolean }>;
    use_coords?: boolean;
    timestamp: number; 
    note?: string; 
    isFavorite?: boolean; 
    group?: string 
  }>>([]);
  const savedPromptGroups = ref<string[]>([]);
  const customCharacters = ref<Array<{ id: string; name: string; category: string; prompt: string; uc?: string; isBuiltin?: boolean; isFavorite?: boolean }>>([]);
  const customStyles = ref<Array<{ id: string; name: string; category: string; prompt: string; uc?: string; isFavorite?: boolean }>>([]);
  const enableTagSuggestions = ref(false);
  const enableStreamThrottle = ref(false);
  const isGenerating = ref(false);
  const queueInfo = ref<{ waiting: number; active: number; isBusy: boolean } | null>(null);
  let queuePollTimer: any = null;

  const startQueuePolling = () => {
    stopQueuePolling();
    const poll = async () => {
      if (!isGenerating.value) {
        stopQueuePolling();
        return;
      }
      try {
        const headers: Record<string, string> = {};
        if (authStore.siteAccessKey) headers['x-access-key'] = authStore.siteAccessKey;
        if (authStore.token) headers['Authorization'] = authStore.token === '__BUILTIN__' ? '__BUILTIN__' : `Bearer ${authStore.token}`;
        const res = await encryptedAxios({
          method: 'GET',
          url: '/api/queue-status',
          headers
        });
        if (res.data && res.data.success) {
          queueInfo.value = {
            waiting: res.data.waiting,
            active: res.data.active,
            isBusy: res.data.isBusy
          };
        }
      } catch (e) {
        // ignore
      }
    };
    poll();
    queuePollTimer = setInterval(poll, 1000);
  };

  const stopQueuePolling = () => {
    if (queuePollTimer) {
      clearInterval(queuePollTimer);
      queuePollTimer = null;
    }
    queueInfo.value = null;
  };

  const streamPreviewUrl = ref<string | null>(null);
  const error = ref('');
  const currentImage = ref<GeneratedImage | null>(null);

  const batchCount = ref<number>(1);
  const batchTotal = ref<number>(0);
  const batchCurrent = ref<number>(0);

  const generateSingleImage = async () => {
    if (!authStore.token) return;
    
    isGenerating.value = true;
    error.value = '';
    
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${authStore.token}`,
        'Accept': 'application/zip'
      };
      if (authStore.siteAccessKey) {
        headers['x-access-key'] = authStore.siteAccessKey;
      }


      const seedToUse = params.seed === -1 ? Math.floor(Math.random() * 4294967295) : params.seed;
      const isV4OrV5 = params.model.includes('-4') || params.model.includes('-5');
      const isV5 = params.model.includes('-5');
      let action: 'generate' | 'img2img' | 'infill' = 'generate';
      if (params.mask && params.image) {
        action = 'infill';
      } else if (params.image) {
        action = 'img2img';
      }

      let modelToUse = params.model;
      if (action === 'infill') {
        if (!modelToUse.endsWith('-inpainting')) {
          modelToUse = `${modelToUse}-inpainting`;
        }
      }

      let parameters: any = {
        width: params.width,
        height: params.height,
        steps: params.steps,
        sampler: params.sampler,
        scale: params.scale,
        seed: seedToUse,
        n_samples: 1,
        dynamic_thresholding: params.dynamic_thresholding,
        noise_schedule: params.noise_schedule || 'karras',
        cfg_rescale: params.cfg_rescale ?? 0,
        uncond_scale: params.uncond_scale ?? 0,
        prefer_brownian: params.prefer_brownian ?? true,
      };

      if (params.image) {
        parameters.image = params.image;
        parameters.strength = params.strength ?? 0.7;
        parameters.noise = params.noise ?? 0.0;
        parameters.extra_noise_seed = seedToUse;
        if (params.mask) {
          parameters.mask = params.mask;
        }
      }

      // 自动追加官方画质预设（正向追加 best quality 等，负向追加官方 Heavy UC，不污染前端输入框）
      let finalPrompt = (params.prompt || '').trim();
      let finalNegPrompt = (params.negative_prompt || '').trim();

      if (params.transparent_bg && !finalPrompt.includes('transparent background')) {
        if (finalPrompt && !finalPrompt.endsWith(',')) {
          finalPrompt += ', ';
        }
        finalPrompt += 'transparent background';
      }

      if (params.auto_quality_presets !== false) {
        if (finalPrompt && !finalPrompt.includes('very aesthetic') && !finalPrompt.includes('absurdres')) {
          finalPrompt = `${finalPrompt}${OFFICIAL_V5_POS_PRESET}`;
        } else if (!finalPrompt) {
          finalPrompt = OFFICIAL_V5_POS_PRESET.replace(/^,\s*/, '');
        }

        const presetTags = OFFICIAL_V5_NEG_PRESET.split(',').map(t => t.trim()).filter(Boolean);
        const userTags = finalNegPrompt.split(',').map(t => t.trim()).filter(Boolean);
        const presetSet = new Set(presetTags);
        
        // 过滤掉用户自己写的、但预设里已经包含的词（去重），保留真正的自定义负向词
        const customUserTags = userTags.filter(t => !presetSet.has(t));
        
        finalNegPrompt = [...presetTags, ...customUserTags].join(', ');
      }

      if (isV4OrV5) {
        parameters.use_coords = false;
        parameters.noise_schedule = params.noise_schedule || "karras";
        
        // V5 官方默认 skip_cfg_above_sigma 为 null（避免破坏高频细节）；V4 默认为 19.34
        if (params.skip_cfg_above_sigma !== undefined && params.skip_cfg_above_sigma !== null && params.skip_cfg_above_sigma > 0) {
          parameters.skip_cfg_above_sigma = params.skip_cfg_above_sigma;
        } else if (params.skip_cfg_above_sigma === 0 || params.skip_cfg_above_sigma === null) {
          parameters.skip_cfg_above_sigma = null;
        } else {
          parameters.skip_cfg_above_sigma = isV5 ? null : 19.343056794463642;
        }
        
        parameters.cfg_sched_eligibility = "enable_for_post_summer_samplers";
        parameters.prefer_brownian = params.prefer_brownian ?? true;
        parameters.deliberate_euler_ancestral_bug = false;
        parameters.uncond_per_vibe = true;
        parameters.wonky_vibe_correlation = true;
        parameters.legacy_v3_extend = false;
        parameters.controlnet_strength = 1;
        parameters.cfg_rescale = params.cfg_rescale ?? 0;
        parameters.uncond_scale = params.uncond_scale ?? 0;

        // 同步底层 uc、negative_prompt 与 v4_negative_prompt
        parameters.uc = finalNegPrompt;
        parameters.negative_prompt = finalNegPrompt;
        parameters.tag_hint_uc_preset = finalNegPrompt.length > 50 ? 2 : (finalNegPrompt ? 1 : 0);
        parameters.tag_hint_qt = 1;
        parameters.version = 1;

        // 提取有效且已启用的角色提示词
        const activeChars = (params.characters || []).filter(c => c.enabled !== false && c.prompt && c.prompt.trim());
        const charCaptions = activeChars.map(c => ({
          char_caption: c.prompt.trim(),
          centers: [
            {
              x: Math.max(0, Math.min(1, typeof c.center?.x === 'number' ? c.center.x : 0.5)),
              y: Math.max(0, Math.min(1, typeof c.center?.y === 'number' ? c.center.y : 0.5))
            }
          ]
        }));

        const charUcCaptions = activeChars.map(c => ({
          char_caption: (c.uc || '').trim(),
          centers: [
            {
              x: Math.max(0, Math.min(1, typeof c.center?.x === 'number' ? c.center.x : 0.5)),
              y: Math.max(0, Math.min(1, typeof c.center?.y === 'number' ? c.center.y : 0.5))
            }
          ]
        }));

        const useCoords = params.use_coords === true;

        parameters.v4_prompt = {
          caption: {
            base_caption: finalPrompt,
            char_captions: charCaptions
          },
          use_coords: useCoords,
          use_order: true,
          legacy_uc: false
        };
        parameters.v4_negative_prompt = {
          caption: {
            base_caption: finalNegPrompt,
            char_captions: charUcCaptions
          },
          use_coords: useCoords,
          use_order: false,
          legacy_uc: false
        };
        
        if (action === 'infill') {
          parameters.params_version = 4;
          parameters.ucPresetId = "heavy";
          parameters.qualityPresetId = "standard";
          parameters.autoSmea = false;
          parameters.legacy = false;
          parameters.add_original_image = true;
          parameters.cfg_rescale = 0;
        } else {
          parameters.params_version = 3;
          parameters.qualityToggle = true;
        }
      } else {
        parameters.negative_prompt = finalNegPrompt;
        parameters.uc = finalNegPrompt;
        parameters.sm = params.sm;
        parameters.sm_dyn = params.sm_dyn;
        if (action === 'infill') {
          parameters.add_original_image = true;
        }
      }

      const payload = {
        input: finalPrompt,
        model: modelToUse,
        action,
        parameters
      };

      // 流式生图支持
      if (params.enable_stream) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);
        let activeBlobUrl: string | null = null;

        try {
          const fetchHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.token}`
          };
          if (authStore.siteAccessKey) {
            fetchHeaders['x-access-key'] = authStore.siteAccessKey;
          }

          const response = await encryptedFetchStream('/api/generate-image-stream', {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || '流式生成失败');
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let streamResultSaved = false;
          let lastRenderTime = 0;
          const THROTTLE_INTERVAL_MS = 125; // 开启节流时限制最大约 8fps

          const updateStreamPreviewBlob = (b64Data: string) => {
            try {
              const binStr = atob(b64Data);
              const len = binStr.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binStr.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: 'image/png' });
              const newUrl = URL.createObjectURL(blob);
              if (activeBlobUrl) {
                URL.revokeObjectURL(activeBlobUrl);
              }
              activeBlobUrl = newUrl;
              streamPreviewUrl.value = newUrl;
            } catch (e) {
              streamPreviewUrl.value = `data:image/png;base64,${b64Data}`;
            }
          };

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              
              let newlineIdx = buffer.indexOf('\n');
              while (newlineIdx !== -1) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);
                newlineIdx = buffer.indexOf('\n');

                if (!line.startsWith('data:')) continue;
                const dataStr = line.slice(5).trim();
                if (!dataStr) continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  const eventType = parsed.event_type || parsed.event;
                  
                  // 智能提取 base64
                  let b64 = parsed.document || parsed.b64 || parsed.image || parsed.ptr;
                  if (!b64) {
                    for (const key in parsed) {
                      if (typeof parsed[key] === 'string' && parsed[key].length > 500) {
                        b64 = parsed[key];
                        break;
                      }
                    }
                  }

                  if (b64) {
                    if (b64.startsWith('UEsDB')) {
                      const zip = new JSZip();
                      const loadedZip = await zip.loadAsync(b64, { base64: true });
                      const files = Object.keys(loadedZip.files);
                      if (files.length > 0) {
                        const file = loadedZip.files[files[0]];
                        b64 = await file.async('base64');
                      }
                    }

                    // 如果明确是 final，或者包含 success 等最终标识
                    const isFinal = eventType === 'final' || eventType === 'done' || parsed.success === true;
                    
                    if (isFinal) {
                      const finalUrl = `data:image/png;base64,${b64}`;
                      const generated: GeneratedImage = {
                        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        url: finalUrl,
                        params: JSON.parse(JSON.stringify({...params, seed: seedToUse})),
                        timestamp: Date.now(),
                        isNew: batchTotal.value > 1
                      };
                      pushGeneratedImage(generated);
                      if (activeBlobUrl) {
                        URL.revokeObjectURL(activeBlobUrl);
                        activeBlobUrl = null;
                      }
                      streamPreviewUrl.value = null;
                      streamResultSaved = true;
                    } else {
                      // 如果开启了节流开关，跳过过于密集的中间帧渲染以保护低配设备显存
                      if (enableStreamThrottle.value) {
                        const now = performance.now();
                        if (now - lastRenderTime < THROTTLE_INTERVAL_MS) {
                          continue;
                        }
                        lastRenderTime = now;
                      }
                      updateStreamPreviewBlob(b64);
                    }
                  }
                } catch (e) {
                  console.warn('Failed to parse stream chunk');
                }
              }
            }
          }
          
          // 如果流结束了但我们没有捕获到 final 事件，把最后一张预览图作为最终结果保存
          if (!streamResultSaved && streamPreviewUrl.value) {
            const generated: GeneratedImage = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              url: streamPreviewUrl.value,
              params: JSON.parse(JSON.stringify({...params, seed: seedToUse})),
              timestamp: Date.now(),
              isNew: batchTotal.value > 1
            };
            pushGeneratedImage(generated);
          }
        } finally {
          clearTimeout(timeoutId);
          if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = null;
          }
          streamPreviewUrl.value = null;
        }
      } else {
        // 常规生图 (Zip 解压转 Base64 确保持久化刷新不丢失)
        const res = await encryptedAxios({
          method: 'POST',
          url: '/api/generate-image',
          data: payload,
          headers,
          responseType: 'arraybuffer'
        });
        
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(res.data);
        
        const files = Object.keys(loadedZip.files);
        if (files.length > 0) {
          const file = loadedZip.files[files[0]];
          const base64Data = await file.async('base64');
          const dataUrl = `data:image/png;base64,${base64Data}`;
          
          const generated: GeneratedImage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url: dataUrl,
            params: JSON.parse(JSON.stringify({...params, seed: seedToUse})),
            timestamp: Date.now(),
            isNew: batchTotal.value > 1
          };
          
          pushGeneratedImage(generated);
        } else {
          throw new Error('未在返回的压缩包中找到图像文件');
        }
      }

      // 记录提示词与角色历史
      if (params.prompt.trim()) {
        const charStr = JSON.stringify(params.characters || []);
        const existingIdx = promptHistory.value.findIndex(p => 
          p.prompt === params.prompt && 
          p.negative_prompt === params.negative_prompt &&
          JSON.stringify(p.characters || []) === charStr
        );
        let preservedNote = undefined;
        let preservedFav = false;
        let preservedGroup = undefined;
        let preservedId = Date.now().toString();
        
        if (existingIdx !== -1) {
          preservedId = promptHistory.value[existingIdx].id || preservedId;
          preservedNote = promptHistory.value[existingIdx].note;
          preservedFav = promptHistory.value[existingIdx].isFavorite || false;
          preservedGroup = promptHistory.value[existingIdx].group;
          promptHistory.value.splice(existingIdx, 1);
        }

        promptHistory.value.unshift({
          id: preservedId,
          prompt: params.prompt,
          negative_prompt: params.negative_prompt,
          characters: params.characters && params.characters.length > 0 ? JSON.parse(JSON.stringify(params.characters)) : undefined,
          use_coords: params.use_coords,
          timestamp: Date.now(),
          note: preservedNote,
          isFavorite: preservedFav,
          group: preservedGroup
        });
        if (promptHistory.value.length > 500) promptHistory.value.pop();
      }
      
      // 先解除生成状态，让 UI 立即展示新图并去掉 Loading 遮罩
      isGenerating.value = false;
      
      // Refresh anlas balance 不阻塞后续
      authStore.fetchUserData();
      
    } catch (e: any) {
      let rawMsg = '';
      if (e.response && e.response.data) {
        try {
          let data = e.response.data;
          if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            const text = new TextDecoder().decode(new Uint8Array(data));
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
          if (typeof data === 'object' && data !== null) {
            rawMsg = data.message || data.error || JSON.stringify(data);
          } else {
            rawMsg = String(data);
          }
        } catch {
          rawMsg = '生成失败，网络异常或服务不可用';
        }
      } else {
        rawMsg = e.message || '生成失败';
      }

      // 提取内部可能嵌套的 JSON 错误字符串 (如 "{\"statusCode\":400,\"message\":\"...\"}")
      if (typeof rawMsg === 'string' && rawMsg.startsWith('{') && rawMsg.includes('"message"')) {
        try {
          const inner = JSON.parse(rawMsg);
          if (inner.message) rawMsg = inner.message;
        } catch {}
      }

      // 过滤截断乱码或过长字符串
      if (rawMsg.includes('PK\u0003\u0004')) {
        rawMsg = rawMsg.split('PK\u0003\u0004')[0].trim();
      }
      if (rawMsg.length > 200) {
        rawMsg = rawMsg.substring(0, 200) + '...';
      }
      error.value = rawMsg || '生成失败';
      console.error('Generation Error:', error.value);
    } finally {
      isGenerating.value = false;
      // 失败也尝试刷新一下余额以防万一
      authStore.fetchUserData();
    }
  };

  const generate = async () => {
    if (!authStore.token) return;
    
    // 如果已经有任务在生成中，或者 batchCount 不正确，直接退
    if (isGenerating.value || batchCount.value < 1) return;

    batchTotal.value = batchCount.value;
    batchCurrent.value = 1;
    startQueuePolling();

    try {
      for (let i = 0; i < batchTotal.value; i++) {
        batchCurrent.value = i + 1;
        
        await generateSingleImage();
        
        // 如果生成过程中发生错误，终止循环
        if (error.value) break;

        // 不是最后一张图的话，等待随机时间
        if (i < batchTotal.value - 1) {
          const delay = Math.random() * 500 + 500; // 0.5 - 1s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } finally {
      batchTotal.value = 0;
      batchCurrent.value = 0;
      stopQueuePolling();
    }
  };

  const useParams = (historyItem: GeneratedImage) => {
    Object.assign(params, historyItem.params);
    params.seed = -1; // 默认还原为随机种子，防止误点导致生成完全一样的图
  };

  const usePrompt = (p: { 
    prompt: string; 
    negative_prompt: string; 
    characters?: Array<{ id: string; prompt: string; uc: string; center: { x: number; y: number }; enabled: boolean }>;
    use_coords?: boolean;
  }) => {
    params.prompt = p.prompt;
    if (p.negative_prompt) params.negative_prompt = p.negative_prompt;
    if (p.characters && p.characters.length > 0) {
      params.characters = JSON.parse(JSON.stringify(p.characters));
    } else {
      params.characters = [];
    }
    if (typeof p.use_coords === 'boolean') {
      params.use_coords = p.use_coords;
    }
  };

  const sendToInpaint = (imgUrl: string) => {
    // 提取 base64
    const base64 = imgUrl.includes('base64,') ? imgUrl.split('base64,')[1] : imgUrl;
    params.image = base64;
    params.mask = undefined;
  };

  const deletePromptHistory = (id: string) => {
    promptHistory.value = promptHistory.value.filter(p => p.id !== id);
    const webdavStore = useWebDAVStore();
    webdavStore.recordDeletion('promptHistory', id);
    webdavStore.autoSyncMetadata(useGenerationStore());
  };

  const toggleFavoritePrompt = (id: string) => {
    const item = promptHistory.value.find(p => p.id === id);
    if (item) {
      item.isFavorite = !item.isFavorite;
      useWebDAVStore().autoSyncMetadata(useGenerationStore());
    }
  };

  const updatePromptNote = (id: string, note: string) => {
    const item = promptHistory.value.find(p => p.id === id);
    if (item) {
      item.note = note;
      useWebDAVStore().autoSyncMetadata(useGenerationStore());
    }
  };

  const updatePromptGroup = (id: string, group: string) => {
    const trimmed = group.trim();
    const item = promptHistory.value.find(p => p.id === id);
    if (item) {
      item.group = trimmed || undefined;
      if (trimmed && !savedPromptGroups.value.includes(trimmed)) {
        savedPromptGroups.value.push(trimmed);
      }
      useWebDAVStore().autoSyncMetadata(useGenerationStore());
    }
  };

  const pushGeneratedImage = (generated: GeneratedImage) => {
    // 检查是否已在列表中
    if (!history.value.some(h => h.id === generated.id)) {
      history.value.unshift(generated);
      // 无限保存，不设 100 限制
    }
    currentImage.value = generated;
    idbStorage.putImage(generated);
    useWebDAVStore().autoSyncSingle(useGenerationStore(), generated);
    if (tabSyncChannel) {
      try {
        tabSyncChannel.postMessage({ type: 'ADD_IMAGE', image: generated });
      } catch (e) {
        console.warn('Broadcast tab sync failed:', e);
      }
    }
  };

  const deleteHistory = (id: string) => {
    const item = history.value.find(i => i.id === id);
    history.value = history.value.filter(i => i.id !== id);
    if (currentImage.value?.id === id) {
      currentImage.value = history.value.length > 0 ? history.value[0] : null;
    }
    idbStorage.deleteImage(id);
    if (tabSyncChannel) {
      try {
        tabSyncChannel.postMessage({ type: 'DELETE_IMAGE', id });
      } catch (e) {}
    }
    if (item) {
      useWebDAVStore().autoSyncDeleteImage(item.id, item.timestamp, useGenerationStore());
    }
  };

  const deleteBatchHistory = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const deletedItems = history.value.filter(i => idSet.has(i.id));
    history.value = history.value.filter(i => !idSet.has(i.id));
    if (currentImage.value && idSet.has(currentImage.value.id)) {
      currentImage.value = history.value.length > 0 ? history.value[0] : null;
    }
    idbStorage.deleteImages(ids);
    if (tabSyncChannel) {
      try {
        for (const id of ids) {
          tabSyncChannel.postMessage({ type: 'DELETE_IMAGE', id });
        }
      } catch (e) {}
    }
    if (deletedItems.length > 0) {
      useWebDAVStore().autoSyncDeleteImages(
        deletedItems.map(i => ({ id: i.id, timestamp: i.timestamp })),
        useGenerationStore()
      );
    }
  };

  const addCharacter = () => {
    if (!params.characters) params.characters = [];
    const count = params.characters.length;
    let defaultX = 0.5;
    if (count === 0) defaultX = 0.35;
    else if (count === 1) defaultX = 0.65;
    else if (count === 2) defaultX = 0.5;

    params.characters.push({
      id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: '',
      uc: '',
      center: { x: defaultX, y: 0.5 },
      enabled: true
    });
  };

  const removeCharacter = (id: string) => {
    if (!params.characters) return;
    params.characters = params.characters.filter(c => c.id !== id);
  };

  const clearCharacters = () => {
    params.characters = [];
  };

  const resetAdvancedParams = () => {
    params.steps = 28;
    params.sampler = 'k_euler_ancestral';
    params.scale = 7.0;
    params.seed = -1;
    params.noise_schedule = 'karras';
    params.cfg_rescale = 0;
    params.uncond_scale = 0;
    params.skip_cfg_above_sigma = null;
    params.prefer_brownian = true;
    params.dynamic_thresholding = false;
    params.sm = false;
    params.sm_dyn = false;
    params.strength = 0.7;
    params.noise = 0.0;
    params.characters = [];
    params.use_coords = false;
    params.auto_quality_presets = true;
    params.transparent_bg = false;
  };

  const clearHistory = () => {
    const deletedItems = [...history.value];
    history.value = [];
    currentImage.value = null;
    idbStorage.clearImages();
    if (tabSyncChannel) {
      try {
        tabSyncChannel.postMessage({ type: 'CLEAR_HISTORY' });
      } catch (e) {}
    }
    if (deletedItems.length > 0) {
      useWebDAVStore().autoSyncDeleteImages(
        deletedItems.map(i => ({ id: i.id, timestamp: i.timestamp })),
        useGenerationStore()
      );
    }
  };

  const clearFilteredHistory = (idsToKeep: string[]) => {
    const idSet = new Set(idsToKeep);
    const deletedItems = history.value.filter(item => !idSet.has(item.id));
    history.value = history.value.filter(item => idSet.has(item.id));
    if (currentImage.value && !idSet.has(currentImage.value.id)) {
      currentImage.value = history.value.length > 0 ? history.value[0] : null;
    }
    if (deletedItems.length > 0) {
      idbStorage.deleteImages(deletedItems.map(i => i.id));
    }
    if (tabSyncChannel) {
      try {
        tabSyncChannel.postMessage({ type: 'KEEP_IMAGES', ids: idsToKeep });
      } catch (e) {}
    }
    if (deletedItems.length > 0) {
      useWebDAVStore().autoSyncDeleteImages(
        deletedItems.map(i => ({ id: i.id, timestamp: i.timestamp })),
        useGenerationStore()
      );
    }
  };

  return { 
    params, 
    history, 
    promptHistory, 
    savedPromptGroups,
    customCharacters,
    customStyles,
    enableTagSuggestions,
    enableStreamThrottle,
    isGenerating,
    queueInfo,
    batchCount,
    batchTotal,
    batchCurrent,
    streamPreviewUrl,
    error, 
    currentImage, 
    generate, 
    useParams, 
    usePrompt, 
    sendToInpaint,
    deletePromptHistory, 
    toggleFavoritePrompt,
    updatePromptNote,
    updatePromptGroup,
    deleteHistory,
    deleteBatchHistory,
    clearHistory,
    clearFilteredHistory,
    resetAdvancedParams,
    addCharacter,
    removeCharacter,
    clearCharacters,
    saveHistoryToIDB,
    isLoadingHistory,
    // 升级迁移相关
    showMigrationModal,
    isMigrating,
    migrationProgress,
    migrationError,
    migrationCompleted,
    executeMigration
  };
}, {
  persist: {
    pick: ['params', 'promptHistory', 'savedPromptGroups', 'customCharacters', 'customStyles', 'enableTagSuggestions', 'enableStreamThrottle'],
    storage: localStorage
  }
});
