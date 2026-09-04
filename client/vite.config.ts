import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 打包时自动将 JS 产物中的非 ASCII 字符（中文、全角符号等）转义为 Unicode (\uXXXX)
function unicodeEscapePlugin(): Plugin {
  return {
    name: 'vite-plugin-unicode-escape',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const fileName in bundle) {
        const file = bundle[fileName]
        if (file.type === 'chunk' && typeof file.code === 'string') {
          file.code = file.code.replace(/[\u007f-\uffff]/g, (ch) => {
            return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4)
          })
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  envDir: path.resolve(import.meta.dirname, '..'),
  plugins: [vue(), unicodeEscapePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        timeout: 120000,
      }
    }
  }
})
