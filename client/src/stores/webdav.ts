import { defineStore } from 'pinia';
import { ref } from 'vue';
import { encryptedAxios } from '../utils/api';
import { useAuthStore } from './auth';

export interface WebDAVMetadata {
  updatedAt?: number;
  promptHistory: any[];
  savedPromptGroups: string[];
  customCharacters: any[];
  customStyles: any[];
  history: any[];
  deletedCharacterIds?: string[];
  deletedStyleIds?: string[];
  deletedPromptHistoryIds?: string[];
}

export const useWebDAVStore = defineStore('webdav', () => {
  const config = ref({
    url: '',
    username: '',
    password: '',
    basePath: '/NovelAI_Saves'
  });
  
  const currentProfile = ref<string>('Default');
  const profiles = ref<string[]>(['Default']);
  const autoSync = ref<boolean>(false);
  const isSyncing = ref<boolean>(false);
  const syncProgress = ref<number>(0);
  const syncText = ref<string>('');

  // 记录本地已删除项墓碑（防止从云端增量拉取时被复活）
  const deletedCharacterIds = ref<string[]>([]);
  const deletedStyleIds = ref<string[]>([]);
  const deletedPromptHistoryIds = ref<string[]>([]);
  
  const authStore = useAuthStore();
  
  const getHeaders = () => {
    const headers: Record<string, string> = {};
    if (authStore.siteAccessKey) {
      headers['x-access-key'] = authStore.siteAccessKey;
    }
    return headers;
  };

  const executeAction = async (action: string, path: string, data?: any) => {
    try {
      const res = await encryptedAxios({
        method: 'POST',
        url: '/api/webdav/action',
        headers: getHeaders(),
        data: {
          config: config.value,
          action,
          path,
          data
        }
      });
      if (res.data.success) {
        return res.data.result || res.data.data;
      }
      throw new Error(res.data.error || 'Unknown error');
    } catch (e: any) {
      console.error(`WebDAV Action [${action}] Failed:`, e);
      throw e;
    }
  };

  const testConnection = async () => {
    isSyncing.value = true;
    syncText.value = '正在测试连接...';
    try {
      await executeAction('exists', config.value.basePath);
      return 'success';
    } catch (e: any) {
      const serverError = e.response?.data?.error || e.response?.data?.message || e.message;
      return serverError || '连接失败，请检查配置或后端服务状态';
    } finally {
      isSyncing.value = false;
    }
  };

  // 递归创建目录 (类似 mkdir -p)
  const ensureDirectory = async (dirPath: string) => {
    const parts = dirPath.split('/').filter(Boolean);
    let currentPath = '';
    for (const part of parts) {
      currentPath += '/' + part;
      try {
        const exists = await executeAction('exists', currentPath);
        if (!exists) {
          await executeAction('createDirectory', currentPath);
        }
      } catch (e) {
        // 忽略并发或部分权限导致的检测失败，继续尝试
      }
    }
  };

  const loadProfiles = async () => {
    isSyncing.value = true;
    syncText.value = '正在获取存档列表...';
    try {
      await ensureDirectory(config.value.basePath);
      
      const contents = await executeAction('getDirectoryContents', config.value.basePath);
      const dirs = contents.filter((item: any) => item.type === 'directory').map((item: any) => item.basename);
      
      if (dirs.length === 0) {
        await ensureDirectory(`${config.value.basePath}/Default/images`);
        profiles.value = ['Default'];
        currentProfile.value = 'Default';
      } else {
        profiles.value = dirs;
        if (!profiles.value.includes(currentProfile.value)) {
          currentProfile.value = profiles.value[0];
        }
      }
    } catch (e) {
      console.error('Failed to load profiles:', e);
    } finally {
      isSyncing.value = false;
    }
  };

  const createProfile = async (name: string) => {
    isSyncing.value = true;
    syncText.value = '正在创建存档...';
    try {
      await ensureDirectory(`${config.value.basePath}/${name}/images`);
      profiles.value.push(name);
      currentProfile.value = name;
    } catch (e) {
      console.error('Failed to create profile:', e);
    } finally {
      isSyncing.value = false;
    }
  };

  const deleteProfile = async (name: string) => {
    isSyncing.value = true;
    syncText.value = `正在删除存档 ${name}...`;
    try {
      await executeAction('deleteFile', `${config.value.basePath}/${name}`);
      profiles.value = profiles.value.filter(p => p !== name);
      if (profiles.value.length > 0) {
        currentProfile.value = profiles.value[0];
      } else {
        await createProfile('Default');
      }
      return true;
    } catch (e) {
      console.error('Delete profile failed:', e);
      return false;
    } finally {
      isSyncing.value = false;
    }
  };

  // 内部辅助方法
  const _getProfilePath = () => `${config.value.basePath}/${currentProfile.value}`;

  // 记录删除墓碑
  const recordDeletion = (type: 'character' | 'style' | 'promptHistory', id: string) => {
    if (!id) return;
    if (type === 'character' && !deletedCharacterIds.value.includes(id)) {
      deletedCharacterIds.value.push(id);
    } else if (type === 'style' && !deletedStyleIds.value.includes(id)) {
      deletedStyleIds.value.push(id);
    } else if (type === 'promptHistory' && !deletedPromptHistoryIds.value.includes(id)) {
      deletedPromptHistoryIds.value.push(id);
    }
  };

  // 从远端获取 metadata.json
  const fetchRemoteMetadata = async (profilePath: string): Promise<WebDAVMetadata | null> => {
    try {
      const metaB64 = await executeAction('getFileContents', `${profilePath}/metadata.json`);
      if (!metaB64) return null;
      const jsonStr = decodeURIComponent(escape(atob(metaB64)));
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  };

  /**
   * 增量双向合并预设列表（角色库、画风库等）
   * - 双方各自新增的数据全量保留（增量并集）
   * - 同 ID 项：按 updatedAt 较新者为准，若无时间戳则本地修改优先
   * - 过滤已删除墓碑
   */
  const mergeObjectPresets = <T extends { id: string; name?: string; updatedAt?: number }>(
    localList: T[] = [],
    remoteList: T[] = [],
    deletedIds: Set<string> = new Set()
  ): T[] => {
    const map = new Map<string, T>();

    // 1. 放入未被删除的远端项
    for (const item of (remoteList || [])) {
      if (!item || !item.id || deletedIds.has(item.id)) continue;
      map.set(item.id, { ...item });
    }

    // 2. 增量合入本地项（本地独有的增量保留，同 ID 项按时间戳比较）
    for (const item of (localList || [])) {
      if (!item || !item.id || deletedIds.has(item.id)) continue;
      if (map.has(item.id)) {
        const remoteItem = map.get(item.id)!;
        if (item.updatedAt && remoteItem.updatedAt) {
          map.set(item.id, item.updatedAt >= remoteItem.updatedAt ? { ...item } : { ...remoteItem });
        } else {
          map.set(item.id, { ...remoteItem, ...item });
        }
      } else {
        map.set(item.id, { ...item });
      }
    }

    return Array.from(map.values());
  };

  /**
   * 增量双向合并历史提示词
   */
  const mergePromptHistory = (
    localList: any[] = [],
    remoteList: any[] = [],
    deletedIds: Set<string> = new Set()
  ): any[] => {
    const map = new Map<string, any>();

    const getKey = (item: any) => {
      if (item.id) return item.id;
      return `${item.timestamp}_${item.prompt}_${item.negative_prompt || ''}`;
    };

    for (const item of (remoteList || [])) {
      if (!item) continue;
      const key = getKey(item);
      if (item.id && deletedIds.has(item.id)) continue;
      map.set(key, { ...item });
    }

    for (const item of (localList || [])) {
      if (!item) continue;
      const key = getKey(item);
      if (item.id && deletedIds.has(item.id)) continue;
      if (map.has(key)) {
        map.set(key, { ...map.get(key), ...item });
      } else {
        map.set(key, { ...item });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 500);
  };

  /**
   * 增量合并字符串数组（提示词分类组）
   */
  const mergeStringArrays = (localArr: string[] = [], remoteArr: string[] = []): string[] => {
    return Array.from(new Set([...(remoteArr || []), ...(localArr || [])])).filter(Boolean);
  };
  
  // 核心增量同步方法：云端 -> 本地
  const syncDown = async (genStore: any) => {
    isSyncing.value = true;
    syncProgress.value = 0;
    syncText.value = '正在读取云端数据并增量合并...';
    try {
      const profilePath = _getProfilePath();
      const remoteMetadata = await fetchRemoteMetadata(profilePath);
      
      if (remoteMetadata) {
        // 汇总两端的删除墓碑
        const allDeletedChars = new Set([...deletedCharacterIds.value, ...(remoteMetadata.deletedCharacterIds || [])]);
        const allDeletedStyles = new Set([...deletedStyleIds.value, ...(remoteMetadata.deletedStyleIds || [])]);
        const allDeletedPrompts = new Set([...deletedPromptHistoryIds.value, ...(remoteMetadata.deletedPromptHistoryIds || [])]);

        deletedCharacterIds.value = Array.from(allDeletedChars);
        deletedStyleIds.value = Array.from(allDeletedStyles);
        deletedPromptHistoryIds.value = Array.from(allDeletedPrompts);

        // 增量双向合并角色库、画风库、历史词、词组（绝不丢弃本地新增）
        genStore.customCharacters = mergeObjectPresets(genStore.customCharacters || [], remoteMetadata.customCharacters || [], allDeletedChars);
        genStore.customStyles = mergeObjectPresets(genStore.customStyles || [], remoteMetadata.customStyles || [], allDeletedStyles);
        genStore.promptHistory = mergePromptHistory(genStore.promptHistory || [], remoteMetadata.promptHistory || [], allDeletedPrompts);
        genStore.savedPromptGroups = mergeStringArrays(genStore.savedPromptGroups || [], remoteMetadata.savedPromptGroups || []);

        // 图片历史增量合并：下载本地缺失的云端图片，保留所有本地已有图片
        const remoteHistory = remoteMetadata.history || [];
        const localIds = new Set((genStore.history || []).map((h: any) => h.id));
        const missingImages = remoteHistory.filter((r: any) => !localIds.has(r.id));
        const total = missingImages.length;
        
        if (total > 0) {
          let count = 0;
          const BATCH_SIZE = 3; // 3张并发下载
          for (let i = 0; i < missingImages.length; i += BATCH_SIZE) {
            const batch = missingImages.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (rImg: any) => {
              try {
                const b64 = await executeAction('getFileContents', rImg.remotePath);
                rImg.url = `data:image/png;base64,${b64}`;
                delete rImg.remotePath;
                genStore.history.push(rImg);
              } catch (imgErr) {
                console.warn(`Failed to pull image ${rImg.id}:`, imgErr);
              } finally {
                count++;
                syncText.value = `正在并发下载图片 ${count} / ${total} ...`;
                syncProgress.value = Math.round((count / total) * 90);
              }
            }));
          }
        }
        
        genStore.history.sort((a: any, b: any) => b.timestamp - a.timestamp);

        // 将增量合并后的最新全量数据反哺更新至云端 metadata.json
        syncText.value = '正在更新双端索引...';
        await autoSyncMetadata(genStore);

        syncProgress.value = 100;
        syncText.value = total > 0 ? `增量同步完成，已合并并下载 ${total} 张图片` : '增量同步完成，配置与数据已双向对齐';
      } else {
        // 云端为空，将本地全量推送至云端初始化
        syncText.value = '云端无存档，正在将本地数据初始化至云端...';
        await syncUp(genStore);
      }
      return true;
    } catch (e) {
      console.error('Sync down failed:', e);
      syncText.value = '同步失败';
      return false;
    } finally {
      setTimeout(() => { isSyncing.value = false; }, 1200);
    }
  };

  // 核心增量同步方法：本地 -> 云端
  const syncUp = async (genStore: any) => {
    isSyncing.value = true;
    syncProgress.value = 0;
    syncText.value = '正在双向合并并推送云端...';
    try {
      const profilePath = _getProfilePath();
      const remoteMetadata = await fetchRemoteMetadata(profilePath);

      // 先与云端已有数据增量合并（防止覆盖云端其他设备新增的角色/画风）
      if (remoteMetadata) {
        const allDeletedChars = new Set([...deletedCharacterIds.value, ...(remoteMetadata.deletedCharacterIds || [])]);
        const allDeletedStyles = new Set([...deletedStyleIds.value, ...(remoteMetadata.deletedStyleIds || [])]);
        const allDeletedPrompts = new Set([...deletedPromptHistoryIds.value, ...(remoteMetadata.deletedPromptHistoryIds || [])]);

        deletedCharacterIds.value = Array.from(allDeletedChars);
        deletedStyleIds.value = Array.from(allDeletedStyles);
        deletedPromptHistoryIds.value = Array.from(allDeletedPrompts);

        genStore.customCharacters = mergeObjectPresets(genStore.customCharacters || [], remoteMetadata.customCharacters || [], allDeletedChars);
        genStore.customStyles = mergeObjectPresets(genStore.customStyles || [], remoteMetadata.customStyles || [], allDeletedStyles);
        genStore.promptHistory = mergePromptHistory(genStore.promptHistory || [], remoteMetadata.promptHistory || [], allDeletedPrompts);
        genStore.savedPromptGroups = mergeStringArrays(genStore.savedPromptGroups || [], remoteMetadata.savedPromptGroups || []);
      }

      const historyForMeta: any[] = [];
      const remoteHistoryIds = new Set((remoteMetadata?.history || []).map((h: any) => h.id));
      
      const imagesToUpload = (genStore.history || []).filter((img: any) => !remoteHistoryIds.has(img.id));
      let uploadedCount = 0;
      
      for (const img of (genStore.history || [])) {
        const dateFolder = new Date(img.timestamp).toISOString().split('T')[0];
        const dirPath = `${profilePath}/images/${dateFolder}`;
        const filePath = `${dirPath}/${img.id}.png`;
        
        historyForMeta.push({
          id: img.id,
          params: img.params,
          timestamp: img.timestamp,
          remotePath: filePath
        });
      }

      if (imagesToUpload.length > 0) {
        const BATCH_SIZE = 3; // 3张并发上传
        for (let i = 0; i < imagesToUpload.length; i += BATCH_SIZE) {
          const batch = imagesToUpload.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (img: any) => {
            const dateFolder = new Date(img.timestamp).toISOString().split('T')[0];
            const dirPath = `${profilePath}/images/${dateFolder}`;
            const filePath = `${dirPath}/${img.id}.png`;
            
            try {
              await ensureDirectory(dirPath);
              const b64Data = img.url.replace(/^data:image\/png;base64,/, '');
              await executeAction('putFileContents', filePath, b64Data);
            } catch (e) {
              console.warn(`Failed to push image ${img.id}:`, e);
            } finally {
              uploadedCount++;
              syncText.value = `正在并发推送新图片 ${uploadedCount} / ${imagesToUpload.length} ...`;
              syncProgress.value = Math.round((uploadedCount / imagesToUpload.length) * 90);
            }
          }));
        }
      }
      
      syncText.value = '正在更新云端索引数据...';
      const metaObj: WebDAVMetadata = {
        updatedAt: Date.now(),
        promptHistory: genStore.promptHistory || [],
        savedPromptGroups: genStore.savedPromptGroups || [],
        customCharacters: genStore.customCharacters || [],
        customStyles: genStore.customStyles || [],
        history: historyForMeta,
        deletedCharacterIds: deletedCharacterIds.value,
        deletedStyleIds: deletedStyleIds.value,
        deletedPromptHistoryIds: deletedPromptHistoryIds.value
      };
      
      const metaStr = JSON.stringify(metaObj, null, 2);
      const metaB64 = btoa(unescape(encodeURIComponent(metaStr)));
      await executeAction('putFileContents', `${profilePath}/metadata.json`, metaB64);
      
      syncProgress.value = 100;
      syncText.value = '增量推送完成，双端已对齐';
      return true;
    } catch (e) {
      console.error('Sync up failed:', e);
      syncText.value = '同步失败';
      return false;
    } finally {
      setTimeout(() => { isSyncing.value = false; }, 1200);
    }
  };

  const autoSyncSingle = async (genStore: any, img: any) => {
    if (!autoSync.value) return;
    // 如果用户在上传开始前就已经删除了该图，直接中止
    if (!genStore.history.some((h: any) => h.id === img.id)) return;
    try {
      const profilePath = _getProfilePath();
      const dateFolder = new Date(img.timestamp).toISOString().split('T')[0];
      const dirPath = `${profilePath}/images/${dateFolder}`;
      const filePath = `${dirPath}/${img.id}.png`;
      
      await ensureDirectory(dirPath);
      const b64Data = img.url.replace(/^data:image\/png;base64,/, '');
      await executeAction('putFileContents', filePath, b64Data);
      
      // 如果用户在上传过程中删除了该图，立即删除云端刚上传的遗留文件并中止
      if (!genStore.history.some((h: any) => h.id === img.id)) {
        try { await executeAction('deleteFile', filePath); } catch (e) {}
        return;
      }

      await autoSyncMetadata(genStore);
    } catch (e) {
      console.warn('Auto-sync single image failed:', e);
    }
  };

  const autoSyncDeleteImage = async (imgId: string, timestamp: number, genStore: any) => {
    if (!autoSync.value) return;
    try {
      const profilePath = _getProfilePath();
      const dateFolder = new Date(timestamp).toISOString().split('T')[0];
      const filePath = `${profilePath}/images/${dateFolder}/${imgId}.png`;
      
      try { await executeAction('deleteFile', filePath); } catch (e) {}
      await autoSyncMetadata(genStore);
    } catch (e) {
      console.warn('Auto-sync delete image failed:', e);
    }
  };

  /**
   * 自动后台同步索引（增量合并后再写入，避免多设备相互覆盖）
   */
  const autoSyncMetadata = async (genStore: any) => {
    if (!autoSync.value && !isSyncing.value) return;
    try {
      const profilePath = _getProfilePath();
      const remoteMetadata = await fetchRemoteMetadata(profilePath);

      const allDeletedChars = new Set([...deletedCharacterIds.value, ...(remoteMetadata?.deletedCharacterIds || [])]);
      const allDeletedStyles = new Set([...deletedStyleIds.value, ...(remoteMetadata?.deletedStyleIds || [])]);
      const allDeletedPrompts = new Set([...deletedPromptHistoryIds.value, ...(remoteMetadata?.deletedPromptHistoryIds || [])]);

      deletedCharacterIds.value = Array.from(allDeletedChars);
      deletedStyleIds.value = Array.from(allDeletedStyles);
      deletedPromptHistoryIds.value = Array.from(allDeletedPrompts);

      // 合并两端
      const mergedCharacters = mergeObjectPresets(genStore.customCharacters || [], remoteMetadata?.customCharacters || [], allDeletedChars);
      const mergedStyles = mergeObjectPresets(genStore.customStyles || [], remoteMetadata?.customStyles || [], allDeletedStyles);
      const mergedPrompts = mergePromptHistory(genStore.promptHistory || [], remoteMetadata?.promptHistory || [], allDeletedPrompts);
      const mergedGroups = mergeStringArrays(genStore.savedPromptGroups || [], remoteMetadata?.savedPromptGroups || []);

      // 同步回本地 Store
      genStore.customCharacters = mergedCharacters;
      genStore.customStyles = mergedStyles;
      genStore.promptHistory = mergedPrompts;
      genStore.savedPromptGroups = mergedGroups;

      const historyForMeta = (genStore.history || []).map((h: any) => ({
        id: h.id,
        params: h.params,
        timestamp: h.timestamp,
        remotePath: `${profilePath}/images/${new Date(h.timestamp).toISOString().split('T')[0]}/${h.id}.png`
      }));

      const metaObj: WebDAVMetadata = {
        updatedAt: Date.now(),
        promptHistory: mergedPrompts,
        savedPromptGroups: mergedGroups,
        customCharacters: mergedCharacters,
        customStyles: mergedStyles,
        history: historyForMeta,
        deletedCharacterIds: deletedCharacterIds.value,
        deletedStyleIds: deletedStyleIds.value,
        deletedPromptHistoryIds: deletedPromptHistoryIds.value
      };

      const metaB64 = btoa(unescape(encodeURIComponent(JSON.stringify(metaObj, null, 2))));
      await executeAction('putFileContents', `${profilePath}/metadata.json`, metaB64);
    } catch (e) {
      console.warn('Auto-sync metadata failed:', e);
    }
  };

  return {
    config,
    currentProfile,
    profiles,
    autoSync,
    isSyncing,
    syncProgress,
    syncText,
    deletedCharacterIds,
    deletedStyleIds,
    deletedPromptHistoryIds,
    testConnection,
    loadProfiles,
    createProfile,
    deleteProfile,
    executeAction,
    recordDeletion,
    syncDown,
    syncUp,
    autoSyncSingle,
    autoSyncDeleteImage,
    autoSyncMetadata,
    _getProfilePath
  };
}, {
  persist: {
    pick: ['config', 'currentProfile', 'autoSync', 'deletedCharacterIds', 'deletedStyleIds', 'deletedPromptHistoryIds']
  }
});
