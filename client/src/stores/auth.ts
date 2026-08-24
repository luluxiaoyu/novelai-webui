import { defineStore } from 'pinia';
import { ref } from 'vue';
import { encryptedAxios } from '../utils/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>('');
  const anlas = ref<number>(0);
  const subscriptionTier = ref<number>(0);
  const active = ref<boolean>(false);
  const loading = ref<boolean>(false);
  const error = ref<string>('');
  const v5UsagePercent = ref<number>(0);
  const trainingSteps = ref<number>(0);

  // 站点访问密码 / 密钥验证状态
  const siteAuthRequired = ref<boolean>(false);
  const siteUnlocked = ref<boolean>(false);
  const siteAccessKey = ref<string>('');
  const siteAuthLoading = ref<boolean>(false);
  const siteAuthError = ref<string>('');
  const siteAuthChecked = ref<boolean>(false);
  const hasBuiltinKey = ref<boolean>(false);
  const allowPaid = ref<boolean>(true);

  const checkSiteAuthStatus = async () => {
    try {
      siteAuthLoading.value = true;
      siteAuthError.value = '';
      const res = await encryptedAxios({
        method: 'GET',
        url: '/api/auth/status',
        headers: siteAccessKey.value ? { 'x-access-key': siteAccessKey.value } : {}
      });
      if (typeof res.data === 'object' && res.data !== null && 'requiresAuth' in res.data) {
        siteAuthRequired.value = !!res.data.requiresAuth;
        hasBuiltinKey.value = !!res.data.hasBuiltinKey;
        if (res.data.allowPaid !== undefined) {
          allowPaid.value = !!res.data.allowPaid;
        }
        if (!siteAuthRequired.value) {
          siteUnlocked.value = true;
        } else {
          siteUnlocked.value = !!res.data.isVerified;
        }
      } else {
        siteAuthRequired.value = true;
        siteUnlocked.value = false;
      }
      return siteUnlocked.value;
    } catch (e: any) {
      console.warn('Check site auth status error:', e);
      siteAuthRequired.value = true;
      siteUnlocked.value = false;
      return false;
    } finally {
      siteAuthLoading.value = false;
      siteAuthChecked.value = true;
    }
  };

  const verifySiteAccess = async (inputKey: string) => {
    if (!inputKey || !inputKey.trim()) {
      siteAuthError.value = '请输入访问密钥';
      return false;
    }
    try {
      siteAuthLoading.value = true;
      siteAuthError.value = '';
      const trimmed = inputKey.trim();
      const res = await encryptedAxios({
        method: 'POST',
        url: '/api/auth/verify-access',
        data: { accessKey: trimmed },
        headers: { 'x-access-key': trimmed }
      });
      if (res.data && res.data.success) {
        siteAccessKey.value = trimmed;
        siteUnlocked.value = true;
        siteAuthError.value = '';
        hasBuiltinKey.value = !!res.data.hasBuiltinKey;
        if (res.data.allowPaid !== undefined) {
          allowPaid.value = !!res.data.allowPaid;
        }
        return true;
      }
      siteAuthError.value = res.data?.message || '访问密钥错误';
      return false;
    } catch (e: any) {
      siteAuthError.value = e.response?.data?.message || '访问密钥错误或验证失败';
      return false;
    } finally {
      siteAuthLoading.value = false;
    }
  };

  const fetchUserData = async (tokenToTest?: string) => {
    const targetToken = tokenToTest || token.value;
    if (!targetToken) return false;
    
    loading.value = true;
    error.value = '';
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${targetToken}`
      };
      if (siteAccessKey.value) {
        headers['x-access-key'] = siteAccessKey.value;
      }
      
      let subSuccess = false;

      try {
        const subRes = await encryptedAxios({
          method: 'GET',
          url: '/api/user/subscription',
          headers
        });
        const data = subRes.data;
        if (data) {
          subSuccess = true;
          // Opus 用户的 tier 值为 3
          if (typeof data.tier === 'number') {
            subscriptionTier.value = data.tier;
          }
          if (data.active !== undefined) {
            active.value = !!data.active;
          }
          // 准确提取 V5 免费动态额度
          if (data.usage && typeof data.usage.percent === 'number') {
            v5UsagePercent.value = data.usage.percent;
          }
          // 计算 Anlas 点数 (Fixed + Purchased training steps)
          if (data.trainingStepsLeft) {
            const fixed = data.trainingStepsLeft.fixedTrainingStepsLeft ?? data.trainingStepsLeft.fixed ?? 0;
            const purchased = data.trainingStepsLeft.purchasedTrainingSteps ?? data.trainingStepsLeft.purchased ?? 0;
            trainingSteps.value = fixed + purchased;
            anlas.value = fixed + purchased;
          } else if (typeof data.anlas === 'number') {
            anlas.value = data.anlas;
          }
        }
      } catch (err: any) {
        console.warn('Subscription fetch failed, trying fallback to /user/data:', err.message);
      }

      // 无论订阅接口是否成功，都尝试请求 /user/data 接口获取精准 anlas 点数与兜底订阅信息
      try {
        const dataRes = await encryptedAxios({
          method: 'GET',
          url: '/api/user/data',
          headers
        });
        const uData = dataRes.data;
        if (uData) {
          if (uData.subscription) {
            if (!subSuccess && typeof uData.subscription.tier === 'number') {
              subscriptionTier.value = uData.subscription.tier;
            }
            if (!subSuccess && uData.subscription.active !== undefined) {
              active.value = !!uData.subscription.active;
            }
            if (uData.subscription.usage && typeof uData.subscription.usage.percent === 'number') {
              v5UsagePercent.value = uData.subscription.usage.percent;
            }
            if (uData.subscription.trainingStepsLeft) {
              const fixed = uData.subscription.trainingStepsLeft.fixedTrainingStepsLeft ?? uData.subscription.trainingStepsLeft.fixed ?? 0;
              const purchased = uData.subscription.trainingStepsLeft.purchasedTrainingSteps ?? uData.subscription.trainingStepsLeft.purchased ?? 0;
              trainingSteps.value = fixed + purchased;
              anlas.value = fixed + purchased;
            }
          }
          if (uData.trainingStepsLeft) {
            const fixed = uData.trainingStepsLeft.fixedTrainingStepsLeft ?? uData.trainingStepsLeft.fixed ?? 0;
            const purchased = uData.trainingStepsLeft.purchasedTrainingSteps ?? uData.trainingStepsLeft.purchased ?? 0;
            trainingSteps.value = fixed + purchased;
            anlas.value = fixed + purchased;
          } else if (typeof uData.anlas === 'number') {
            anlas.value = uData.anlas;
          }
          return true;
        }
      } catch (err: any) {
        console.warn('User data fetch failed:', err.message);
        if (subSuccess) return true;
      }

      if (subSuccess) return true;
      throw new Error('无法连接到 NovelAI 账户');
    } catch (e: any) {
      console.error('Fetch user data failed:', e);
      if (e.response && e.response.status === 401) {
        token.value = '';
        error.value = 'API Token 无效或已过期';
        return false;
      }
      if (tokenToTest) {
        error.value = e.response?.data?.message || e.message || '连接失败，请检查网络或 Token';
        return false;
      }
      return false;
    } finally {
      loading.value = false;
    }
  };

  const login = async (newToken: string) => {
    const success = await fetchUserData(newToken);
    if (success) {
      token.value = newToken;
      error.value = '';
      return true;
    } else {
      token.value = '';
      return false;
    }
  };

  const loginWithBuiltin = async () => {
    return login('__BUILTIN__');
  };
  
  const logout = () => {
    token.value = '';
    anlas.value = 0;
    subscriptionTier.value = 0;
    active.value = false;
    v5UsagePercent.value = 0;
    trainingSteps.value = 0;
    error.value = '';
  };

  const lockSite = () => {
    logout();
    siteAccessKey.value = '';
    siteUnlocked.value = false;
    siteAuthError.value = '';
  };

  return { 
    token, anlas, subscriptionTier, active, v5UsagePercent, trainingSteps, loading, error, 
    siteAuthRequired, siteUnlocked, siteAccessKey, siteAuthLoading, siteAuthError, siteAuthChecked,
    hasBuiltinKey, allowPaid,
    checkSiteAuthStatus, verifySiteAccess, login, loginWithBuiltin, logout, lockSite, fetchUserData 
  };
}, {
  persist: {
    pick: ['token', 'siteAccessKey', 'allowPaid']
  }
});
