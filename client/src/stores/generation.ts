import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import axios from 'axios';
import JSZip from 'jszip';
import { useAuthStore } from './auth';

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
  // Inpaint / Img2img
  image?: string; // Base64
  mask?: string;  // Base64
  strength?: number;
  noise?: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  params: GenerationParams;
  timestamp: number;
  isNew?: boolean;
}




const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('novelai_db', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('store'); };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('store')) { resolve(null); return; }
        const tx = db.transaction('store', 'readonly');
        const getReq = tx.objectStore('store').get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
      };
      request.onerror = () => reject(request.error);
    });
  },
  setItem: async (key: string, value: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('novelai_db', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('store'); };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('store', 'readwrite');
        const putReq = tx.objectStore('store').put(value, key);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      request.onerror = () => reject(request.error);
    });
  },
};

export const useGenerationStore = defineStore('generation', () => {
  const authStore = useAuthStore();
  
  // 异步加载历史
  idbStorage.getItem('history').then((data) => {
    if (data) {
      try {
        const parsed = JSON.parse(data);
        history.value = parsed;
        if (history.value.length > 0 && !currentImage.value) {
          currentImage.value = history.value[0];
        }
      } catch (e) {
        console.error('IDB load error', e);
      }
    }
  });

  import('vue').then(({ watch }) => {
    watch(history, (newVal) => {
      idbStorage.setItem('history', JSON.stringify(newVal));
    }, { deep: true });
  });

  const params = reactive<GenerationParams>({
    prompt: '',
    negative_prompt: '',
    model: 'nai-diffusion-5-full',
    width: 832,
    height: 1216,
    steps: 28,
    sampler: 'k_euler',
    scale: 5,
    seed: -1,
    sm: false,
    sm_dyn: false,
    dynamic_thresholding: false,
    enable_stream: false,
    strength: 0.7,
    noise: 0.0,
  });

  const history = ref<GeneratedImage[]>([]);
  const promptHistory = ref<Array<{ id: string; prompt: string; negative_prompt: string; timestamp: number; note?: string; isFavorite?: boolean; group?: string }>>([]);
  const isGenerating = ref(false);
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

      const api = axios.create({
        baseURL: '/api',
        headers,
        responseType: 'arraybuffer'
      });
      
      const seedToUse = params.seed === -1 ? Math.floor(Math.random() * 4294967295) : params.seed;
      const isV4OrV5 = params.model.includes('-4') || params.model.includes('-5');
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

      if (isV4OrV5) {
        parameters.use_coords = false;
        parameters.v4_prompt = {
          caption: {
            base_caption: params.prompt,
            char_captions: []
          },
          use_coords: false,
          use_order: true
        };
        parameters.v4_negative_prompt = {
          caption: {
            base_caption: params.negative_prompt || '',
            char_captions: []
          }
        };
        
        if (action === 'infill') {
          parameters.params_version = 4;
          parameters.ucPresetId = "heavy";
          parameters.qualityPresetId = "standard";
          parameters.autoSmea = false;
          parameters.controlnet_strength = 1;
          parameters.legacy = false;
          parameters.add_original_image = true;
          parameters.cfg_rescale = 0;
          parameters.noise_schedule = "native";
        } else {
          parameters.params_version = 3;
          parameters.qualityToggle = true;
          parameters.deliberate_euler_ancestral_bug = false;
          parameters.prefer_brownian = true;
        }
      } else {
        parameters.negative_prompt = params.negative_prompt;
        parameters.sm = params.sm;
        parameters.sm_dyn = params.sm_dyn;
        if (action === 'infill') {
          parameters.add_original_image = true;
        }
      }

      const payload = {
        input: params.prompt,
        model: modelToUse,
        action,
        parameters
      };

      // 流式生图支持
      if (params.enable_stream) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        try {
          const fetchHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.token}`
          };
          if (authStore.siteAccessKey) {
            fetchHeaders['x-access-key'] = authStore.siteAccessKey;
          }

          const response = await fetch('/api/generate-image-stream', {
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

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data:')) {
                  const dataStr = line.replace('data:', '').trim();
                  if (dataStr) {
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
                            id: Date.now().toString(),
                            url: finalUrl,
                            params: JSON.parse(JSON.stringify({...params, seed: seedToUse})),
                            timestamp: Date.now(),
isNew: true
                          };
                          currentImage.value = generated;
                          history.value.unshift(generated);
                          streamPreviewUrl.value = null;
                          streamResultSaved = true;
                        } else {
                          // 当作中间帧展示
                          streamPreviewUrl.value = `data:image/png;base64,${b64}`;
                        }
                      }
                    } catch (e) {
                      console.warn('Failed to parse stream chunk');
                    }
                  }
                }
              }
            }
          }
          
          // 如果流结束了但我们没有捕获到 final 事件，把最后一张预览图作为最终结果保存
          if (!streamResultSaved && streamPreviewUrl.value) {
            const generated: GeneratedImage = {
              id: Date.now().toString(),
              url: streamPreviewUrl.value,
              params: JSON.parse(JSON.stringify({...params, seed: seedToUse})),
              timestamp: Date.now(),
isNew: true
            };
            currentImage.value = generated;
            history.value.unshift(generated);
          }
        } finally {
          clearTimeout(timeoutId);
          streamPreviewUrl.value = null;
        }
      } else {
        // 常规生图 (Zip 解压转 Base64 确保持久化刷新不丢失)
        const res = await api.post('/generate-image', payload);
        
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(res.data);
        
        const files = Object.keys(loadedZip.files);
        if (files.length > 0) {
          const file = loadedZip.files[files[0]];
          const base64Data = await file.async('base64');
          const dataUrl = `data:image/png;base64,${base64Data}`;
          
          const generated: GeneratedImage = {
            id: Date.now().toString(),
            url: dataUrl,
            params: JSON.parse(JSON.stringify({...params, seed: seedToUse})),
            timestamp: Date.now(),
isNew: true
          };
          
          currentImage.value = generated;
          history.value.unshift(generated);
          // 保留最多 100 张历史图
          if (history.value.length > 100) history.value.pop();
        } else {
          throw new Error('未在返回的压缩包中找到图像文件');
        }
      }

      // 记录提示词历史
      if (params.prompt.trim()) {
        const existingIdx = promptHistory.value.findIndex(p => p.prompt === params.prompt);
        let preservedNote = undefined;
        let preservedFav = false;
        
        if (existingIdx !== -1) {
          preservedNote = promptHistory.value[existingIdx].note;
          preservedFav = promptHistory.value[existingIdx].isFavorite || false;
          promptHistory.value.splice(existingIdx, 1);
        }

        promptHistory.value.unshift({
          id: Date.now().toString(),
          prompt: params.prompt,
          negative_prompt: params.negative_prompt,
          timestamp: Date.now(),
          note: preservedNote,
          isFavorite: preservedFav
        });
        if (promptHistory.value.length > 200) promptHistory.value.pop();
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

    batchTotal.value = 0;
    batchCurrent.value = 0;
  };

  const useParams = (historyItem: GeneratedImage) => {
    Object.assign(params, historyItem.params);
    params.seed = -1; // 默认还原为随机种子，防止误点导致生成完全一样的图
  };

  const usePrompt = (p: { prompt: string; negative_prompt: string }) => {
    params.prompt = p.prompt;
    if (p.negative_prompt) params.negative_prompt = p.negative_prompt;
  };

  const sendToInpaint = (imgUrl: string) => {
    // 提取 base64
    const base64 = imgUrl.includes('base64,') ? imgUrl.split('base64,')[1] : imgUrl;
    params.image = base64;
    params.mask = undefined;
  };

  const deletePromptHistory = (id: string) => {
    promptHistory.value = promptHistory.value.filter(p => p.id !== id);
  };

  const toggleFavoritePrompt = (id: string) => {
    const item = promptHistory.value.find(p => p.id === id);
    if (item) {
      item.isFavorite = !item.isFavorite;
    }
  };

  const updatePromptNote = (id: string, note: string) => {
    const item = promptHistory.value.find(p => p.id === id);
    if (item) {
      item.note = note;
    }
  };

  const updatePromptGroup = (id: string, group: string) => {
    const item = promptHistory.value.find(p => p.id === id);
    if (item) {
      item.group = group.trim() || undefined;
    }
  };

  const deleteHistory = (id: string) => {
    history.value = history.value.filter(i => i.id !== id);
    if (currentImage.value?.id === id) {
      currentImage.value = history.value.length > 0 ? history.value[0] : null;
    }
  };

  const clearHistory = () => {
    history.value = [];
    currentImage.value = null;
  };

  const clearFilteredHistory = (idsToKeep: string[]) => {
    history.value = history.value.filter(item => idsToKeep.includes(item.id));
    if (currentImage.value && !idsToKeep.includes(currentImage.value.id)) {
      currentImage.value = history.value.length > 0 ? history.value[0] : null;
    }
  };

  return { 
    params, 
    history, 
    promptHistory, 
    isGenerating,
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
    clearHistory,
    clearFilteredHistory
  };
}, {
  persist: [
    {
      pick: ['params', 'promptHistory'],
      storage: localStorage
    },
    {
      pick: ['history'],
      storage: idbStorage as any
    }
  ]
});
