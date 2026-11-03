import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
// @ts-ignore
import './index.css'
import App from './App.vue'
import { applyMobilePerfMode } from './utils/mobilePerf'

// 启动时按配置探测并应用移动端性能减负（PC 浏览器绝对排除）
applyMobilePerfMode()

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)
app.use(pinia)
app.mount('#app')
