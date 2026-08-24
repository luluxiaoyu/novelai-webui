import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>('');
  const anlas = ref<number>(0);
  const subscriptionTier = ref<number>(0);
  const active = ref<boolean>(false);
  const loading = ref<boolean>(false);
  const error = ref<string>('');
  const v5UsagePercent = ref<number>(0);
  const trainingSteps = ref<number>(0);

  const fetchUserData = async (tokenToTest?: string) => {
    const targetToken = tokenToTest || token.value;
    if (!targetToken) return false;
    
    loading.value = true;
    error.value = '';
    try {
      const api = axios.create({
        baseURL: '/api',
        headers: {
          'Authorization': `Bearer ${targetToken}`
        }
      });
      
      // 1. 从 /user/subscription 读取订阅等级、点数与 V5 usage
      try {
        const subRes = await api.get('/user/subscription');
        const data = subRes.data;
        if (data) {
          if (typeof data.tier === 'number') {
            subscriptionTier.value = data.tier;
          }
          active.value = !!data.active;

          // 计算点数 (Fixed + Purchased training steps)
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
        console.warn('读取 /user/subscription 异常:', err.message);
      }
      
      // 2. 从 /user/data 补充 Anlas 与 V5 动态点数 (如果有直接的 anlas 字段)
      try {
        const dataRes = await api.get('/user/data');
        const d = dataRes.data;
        if (d) {
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
        console.warn('读取 /user/data 异常:', err.message);
      }

      // 3. 登录成功
      return true;
    } catch (e: any) {
      console.error('Fetch user data failed:', e);
      return true; // 即使额外数据获取遇到网络问题，依然放行使用 Token
    } finally {
      loading.value = false;
    }
  };

  const login = async (newToken: string) => {
    const success = await fetchUserData(newToken);
    if (success) {
      token.value = newToken;
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

  return { token, anlas, subscriptionTier, active, v5UsagePercent, trainingSteps, loading, error, login, logout, fetchUserData };
}, {
  persist: true
});
