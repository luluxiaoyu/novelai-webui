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

  const checkSiteAuthStatus = async () => {
    try {
      siteAuthLoading.value = true;
      siteAuthError.value = '';
      const res = await encryptedAxios({
        method: 'GET',
        url: '/api/auth/status',
        headers: siteAccessKey.value ? { 'x-access-key': siteAccessKey.value } : {}
      });
      siteAuthRequired.value = !!res.data.requiresAuth;
      if (!siteAuthRequired.value) {
        siteUnlocked.value = true;
      } else {
        siteUnlocked.value = !!res.data.isVerified;
      }
      return siteUnlocked.value;
    } catch (e: any) {
      console.warn('Check site auth status error:', e);
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
      const res = await encryptedAxios({
        method: 'POST',
        url: '/api/auth/verify-access',
        data: { accessKey: inputKey.trim() }
      });
      if (res.data.success) {
        siteAccessKey.value = inputKey.trim();
        siteUnlocked.value = true;
        siteAuthError.value = '';
        return true;
      }
      siteAuthError.value = res.data.message || '访问密钥错误';
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
          if (typeof data.tier === 'number') {
            subscriptionTier.value = data.tier;
          }
          active.value = !!data.active;

          if (data.trainingStepsLeft) {
            const fixed = data.trainingStepsLeft.fixedTrainingStepsLeft || 0;
            const purchased = data.trainingStepsLeft.purchasedTrainingSteps || 0;
            trainingSteps.value = fixed + purchased;
            anlas.value = fixed + purchased;
          }

          // V5 额度 (Stamina / usage percent)
          if (data.usage && typeof data.usage.percent === 'number') {
            v5UsagePercent.value = data.usage.percent;
          }
        }
      } catch (err: any) {
        if (err.response?.status === 401 || err.status === 401) {
          error.value = 'API Token 无效或已过期，请检查后重试。';
          return false;
        }
        console.warn('读取 /user/subscription 异常:', err.message);
      }
      
      try {
        const dataRes = await encryptedAxios({
          method: 'GET',
          url: '/api/user/data',
          headers
        });
        const d = dataRes.data;
        if (d) {
          subSuccess = true;
          if (d.subscription) {
            if (typeof d.subscription.anlas === 'number') {
              anlas.value = d.subscription.anlas;
            }
            if (d.subscription.trainingStepsLeft) {
              const fixed = d.subscription.trainingStepsLeft.fixedTrainingStepsLeft || 0;
              const purchased = d.subscription.trainingStepsLeft.purchasedTrainingSteps || 0;
              trainingSteps.value = fixed + purchased;
              if (!anlas.value) anlas.value = fixed + purchased;
            }
            if (d.subscription.usage && typeof d.subscription.usage.percent === 'number') {
              v5UsagePercent.value = d.subscription.usage.percent;
            }
          }
        }
      } catch (err: any) {
        if (err.response?.status === 401 || err.status === 401) {
          error.value = 'API Token 无效或已过期，请检查后重试。';
          return false;
        }
        console.warn('读取 /user/data 异常:', err.message);
      }

      // 如果是登录时测试 Token，但接口均未成功响应，则拒绝放行
      if (tokenToTest && !subSuccess) {
        error.value = error.value || '无法验证该 API Token，请确认其是否有效。';
        return false;
      }

      return true;
    } catch (e: any) {
      console.error('Fetch user data failed:', e);
      if (e.response?.status === 401 || e.status === 401) {
        error.value = 'API Token 无效或已过期，请检查后重试。';
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
  
  const logout = () => {
    token.value = '';
    anlas.value = 0;
    subscriptionTier.value = 0;
    active.value = false;
    v5UsagePercent.value = 0;
    trainingSteps.value = 0;
    error.value = '';
  };

  return { 
    token, anlas, subscriptionTier, active, v5UsagePercent, trainingSteps, loading, error, 
    siteAuthRequired, siteUnlocked, siteAccessKey, siteAuthLoading, siteAuthError, siteAuthChecked,
    checkSiteAuthStatus, verifySiteAccess, login, logout, fetchUserData 
  };
}, {
  persist: {
    pick: ['token', 'siteAccessKey']
  }
});
