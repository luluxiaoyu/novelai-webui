import { defineStore } from 'pinia';
import { ref } from 'vue';
import { encryptedAxios } from '../utils/api';
import { useAuthStore } from './auth';

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
  
  // 核心同步方法
  const syncDown = async (genStore: any) => {
    isSyncing.value = true;
    syncProgress.value = 0;
    syncText.value = '正在读取云端索引...';
    try {
      const profilePath = _getProfilePath();
      let remoteMetadata: any = null;
      try {
        const metaB64 = await executeAction('getFileContents', `${profilePath}/metadata.json`);
        const jsonStr = decodeURIComponent(escape(atob(metaB64)));
        remoteMetadata = JSON.parse(jsonStr);
      } catch (e) {
        console.warn('No remote metadata found, starting fresh.');
      }
      
      if (remoteMetadata) {
        genStore.promptHistory = remoteMetadata.promptHistory || [];
        if (remoteMetadata.savedPromptGroups) {
          genStore.savedPromptGroups = remoteMetadata.savedPromptGroups;
        }
        if (remoteMetadata.customCharacters) {
          genStore.customCharacters = remoteMetadata.customCharacters;
        }
        const remoteHistory = remoteMetadata.history || [];
        const localIds = new Set(genStore.history.map((h: any) => h.id));
        
        const missingImages = remoteHistory.filter((r: any) => !localIds.has(r.id));
        const total = missingImages.length;
        
        if (total === 0) {
          syncProgress.value = 100;
          syncText.value = '无需同步，已是最新状态';
        } else {
          let count = 0;
          for (const rImg of missingImages) {
            count++;
            syncText.value = `正在下载图片 ${count} / ${total} ...`;
            syncProgress.value = Math.round((count / total) * 100);
            try {
              const b64 = await executeAction('getFileContents', rImg.remotePath);
              rImg.url = `data:image/png;base64,${b64}`;
              delete rImg.remotePath;
              genStore.history.push(rImg);
            } catch (imgErr) {
              console.warn(`Failed to pull image ${rImg.id}:`, imgErr);
            }
          }
        }
        
        genStore.history.sort((a: any, b: any) => b.timestamp - a.timestamp);
      } else {
        syncText.value = '云端无存档数据';
      }
      return true;
    } catch (e) {
      console.error('Sync down failed:', e);
      syncText.value = '同步失败';
      return false;
    } finally {
      setTimeout(() => { isSyncing.value = false; }, 1000);
    }
  };

  const syncUp = async (genStore: any) => {
    isSyncing.value = true;
    syncProgress.value = 0;
    syncText.value = '正在准备推送...';
    try {
      const profilePath = _getProfilePath();
      const historyForMeta = [];
      const total = genStore.history.length;
      
      let count = 0;
      for (const img of genStore.history) {
        count++;
        syncText.value = `正在校验与推送 ${count} / ${total} ...`;
        syncProgress.value = Math.round((count / total) * 95); // 预留5%给索引
        
        const dateFolder = new Date(img.timestamp).toISOString().split('T')[0];
        const dirPath = `${profilePath}/images/${dateFolder}`;
        const filePath = `${dirPath}/${img.id}.png`;
        
        historyForMeta.push({
          id: img.id,
          params: img.params,
          timestamp: img.timestamp,
          remotePath: filePath
        });
        
        try {
          const exists = await executeAction('exists', filePath);
          if (!exists) {
            await ensureDirectory(dirPath);
            const b64Data = img.url.replace(/^data:image\/png;base64,/, '');
            await executeAction('putFileContents', filePath, b64Data);
          }
        } catch (e) {
          console.warn(`Failed to push image ${img.id}:`, e);
        }
      }
      
      syncText.value = '正在更新索引数据...';
      const metaObj = {
        promptHistory: genStore.promptHistory,
        savedPromptGroups: genStore.savedPromptGroups,
        customCharacters: genStore.customCharacters,
        history: historyForMeta
      };
      
      const metaStr = JSON.stringify(metaObj, null, 2);
      const metaB64 = btoa(unescape(encodeURIComponent(metaStr)));
      await executeAction('putFileContents', `${profilePath}/metadata.json`, metaB64);
      
      syncProgress.value = 100;
      syncText.value = '同步完成';
      return true;
    } catch (e) {
      console.error('Sync up failed:', e);
      syncText.value = '同步失败';
      return false;
    } finally {
      setTimeout(() => { isSyncing.value = false; }, 1000);
    }
  };

  const autoSyncSingle = async (genStore: any, img: any) => {
    if (!autoSync.value) return;
    try {
      const profilePath = _getProfilePath();
      const dateFolder = new Date(img.timestamp).toISOString().split('T')[0];
      const dirPath = `${profilePath}/images/${dateFolder}`;
      const filePath = `${dirPath}/${img.id}.png`;
      
      await ensureDirectory(dirPath);
      const b64Data = img.url.replace(/^data:image\/png;base64,/, '');
      await executeAction('putFileContents', filePath, b64Data);
      
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

  const autoSyncMetadata = async (genStore: any) => {
    if (!autoSync.value) return;
    try {
      const profilePath = _getProfilePath();
      const historyForMeta = genStore.history.map((h: any) => ({
        id: h.id,
        params: h.params,
        timestamp: h.timestamp,
        remotePath: `${profilePath}/images/${new Date(h.timestamp).toISOString().split('T')[0]}/${h.id}.png`
      }));
      const metaB64 = btoa(unescape(encodeURIComponent(JSON.stringify({
        promptHistory: genStore.promptHistory,
        savedPromptGroups: genStore.savedPromptGroups,
        customCharacters: genStore.customCharacters,
        history: historyForMeta
      }))));
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
    testConnection,
    loadProfiles,
    createProfile,
    deleteProfile,
    executeAction,
    syncDown,
    syncUp,
    autoSyncSingle,
    autoSyncDeleteImage,
    autoSyncMetadata,
    _getProfilePath
  };
}, {
  persist: {
    pick: ['config', 'currentProfile', 'autoSync']
  }
});
