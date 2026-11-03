/**
 * 检测当前运行环境是否为【移动设备上的飞牛 App / 内嵌 WebView】
 * 
 * 严格保护规则：
 * 1. 任何 PC 桌面浏览器（Windows / macOS / Linux x86/ARM）无论如何绝对返回 false，保证 PC 拥有 100% 完整视觉与高斯模糊！
 * 2. 正常手机独立浏览器（Chrome / Safari / Edge 等直连访问）返回 false，保持原汁原味流畅动画！
 * 3. 仅在检测为移动端设备，且运行在安卓 System WebView / 飞牛手机客户端 App 内嵌环境时，返回 true。
 */
export const isMobileFnosApp = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';

  // 1. 严格排除 PC 桌面端 (Windows, Mac, Linux x86/ARM PC)，桌面环境绝不弱化任何效果
  const isDesktop = /Windows NT|Macintosh|Mac OS X(?!.*Mobile)|Linux x86_64|CrOS/i.test(ua) && !/Android/i.test(ua);
  if (isDesktop) return false;

  // 2. 必须是真实的移动设备
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) return false;

  // 3. 处于飞牛 App 或安卓内嵌 WebView 环境
  const hasFnosTag = /fnos|fnnas/i.test(ua);
  const isAndroidWebView = /Android/i.test(ua) && (/;\s*wv\b/i.test(ua) || /Version\/[\d.]+\s+Chrome/i.test(ua));
  let isMobileIframe = false;
  try {
    isMobileIframe = window.self !== window.top;
  } catch (e) {
    isMobileIframe = true;
  }

  return hasFnosTag || isAndroidWebView || isMobileIframe;
};

const STORAGE_KEY = 'novelai_reduce_mobile_effects';

export const getReduceMobileEffectsSetting = (): boolean => {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) return true; // 默认开启
  return stored === 'true';
};

export const setReduceMobileEffectsSetting = (val: boolean) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(val));
  }
  applyMobilePerfMode(val);
};

export const applyMobilePerfMode = (enabled?: boolean) => {
  if (typeof document === 'undefined') return;
  const shouldReduce = enabled !== undefined ? enabled : getReduceMobileEffectsSetting();
  if (shouldReduce && isMobileFnosApp()) {
    document.documentElement.classList.add('is-fnos-mobile-app');
  } else {
    document.documentElement.classList.remove('is-fnos-mobile-app');
  }
};
