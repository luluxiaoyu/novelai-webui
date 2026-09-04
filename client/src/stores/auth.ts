import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
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

  const expiresAt = ref<number>(0);
  const timeUntilNextPercent = ref<number>(0);
  const usageFetchedAt = ref<number>(Date.now());
  const now = ref<number>(Date.now());

  // 启动后台定时器，驱动秒级实时倒计时
  if (typeof window !== 'undefined') {
    setInterval(() => {
      now.value = Date.now();
    }, 1000);
  }

  // 恢复常量：官方规则一天约恢复 11%，每 1% 对应 86400 / 11 秒 (~7854.55s ≈ 2.18h)
  // 11% 额度约对应 190 张标准图 (普通尺寸 ≤1024x1024, 步数 ≤28)
  const SECONDS_PER_PERCENT = 86400 / 11;
  const IMAGES_PER_PERCENT = 190 / 11;

  // 距离下 1% 的动态剩余秒数 (实时递减)
  const secondsToNextPercent = computed(() => {
    if (v5UsagePercent.value >= 100) return 0;
    if (!timeUntilNextPercent.value) return 0;
    const elapsed = Math.floor((now.value - usageFetchedAt.value) / 1000);
    return Math.max(0, timeUntilNextPercent.value - elapsed);
  });

  // 距离 100% 满额的总动态剩余秒数
  const secondsToFullUsage = computed(() => {
    if (v5UsagePercent.value >= 100) return 0;
    const remainingPercents = 100 - v5UsagePercent.value;
    const firstStep = secondsToNextPercent.value || SECONDS_PER_PERCENT;
    return Math.round(firstStep + Math.max(0, remainingPercents - 1) * SECONDS_PER_PERCENT);
  });

  // 预估当前剩余额度可出标准图数 (11% ≈ 190 张)
  const estimatedRemainingImages = computed(() => {
    return Math.round(v5UsagePercent.value * IMAGES_PER_PERCENT);
  });

  // 满额总容量可出标准图数 (100% ≈ 1727 张)
  const estimatedFullCapacityImages = computed(() => {
    return Math.round(100 * IMAGES_PER_PERCENT);
  });

  // 简写时长格式化 (Header 紧凑展示，节省空间)
  const formatCompactDuration = (seconds: number): string => {
    if (seconds <= 0) return '0分';
    const totalSeconds = Math.round(seconds);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);

    if (d > 0) {
      return `${d}天${h > 0 ? h + 'h' : ''}`;
    }
    if (h > 0) {
      return `${h}h${m > 0 ? m + 'm' : ''}`;
    }
    if (m > 0) {
      return `${m}m`;
    }
    return `${totalSeconds}s`;
  };

  // 完整时长格式化 (弹窗详情展示，紧凑规整，防止在卡片内换行)
  const formatFullDuration = (seconds: number): string => {
    if (seconds <= 0) return '0秒';
    const totalSeconds = Math.round(seconds);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const parts: string[] = [];
    if (d > 0) parts.push(`${d}天`);
    if (h > 0) parts.push(`${h}小时`);
    if (m > 0) parts.push(`${m}分`);
    if (s > 0 || parts.length === 0) parts.push(`${s}秒`);
    return parts.join(' ');
  };

  // 预计到达时刻格式化 (例如：今天 16:20 / 明天 02:45 / 9月5日 14:10)
  const formatTargetTime = (secondsFromNow: number): string => {
    if (secondsFromNow <= 0) return '当前已满';
    const target = new Date(Date.now() + secondsFromNow * 1000);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(target.getHours())}:${pad(target.getMinutes())}`;

    if (target.toDateString() === today.toDateString()) {
      return `今天 ${timeStr}`;
    }
    if (target.toDateString() === tomorrow.toDateString()) {
      return `明天 ${timeStr}`;
    }
    return `${target.getMonth() + 1}月${target.getDate()}日 ${timeStr}`;
  };

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
      const headers = targetToken === '__BUILTIN__' 
        ? { 'Authorization': '__BUILTIN__' }
        : { 'Authorization': `Bearer ${targetToken}` } as Record<string, string>;
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
          if (data.expiresAt) {
            expiresAt.value = data.expiresAt;
          }
          // 准确提取 V5 免费动态额度
          if (data.usage && typeof data.usage.percent === 'number') {
            v5UsagePercent.value = data.usage.percent;
            timeUntilNextPercent.value = data.usage.timeUntilNextPercent || 0;
            usageFetchedAt.value = Date.now();
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
              if (typeof uData.subscription.usage.timeUntilNextPercent === 'number') {
                timeUntilNextPercent.value = uData.subscription.usage.timeUntilNextPercent;
                usageFetchedAt.value = Date.now();
              }
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
    expiresAt.value = 0;
    timeUntilNextPercent.value = 0;
    usageFetchedAt.value = 0;
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
    token, anlas, subscriptionTier, active, v5UsagePercent, expiresAt, timeUntilNextPercent, usageFetchedAt, trainingSteps, loading, error, 
    now, secondsToNextPercent, secondsToFullUsage, estimatedRemainingImages, estimatedFullCapacityImages,
    formatCompactDuration, formatFullDuration, formatTargetTime,
    siteAuthRequired, siteUnlocked, siteAccessKey, siteAuthLoading, siteAuthError, siteAuthChecked,
    hasBuiltinKey, allowPaid,
    checkSiteAuthStatus, verifySiteAccess, login, loginWithBuiltin, logout, lockSite, fetchUserData 
  };
}, {
  persist: {
    pick: ['token', 'siteAccessKey', 'allowPaid']
  }
});
