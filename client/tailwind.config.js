/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          // Apple (macOS / iOS)
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          // Windows
          '"Segoe UI"',
          '"Segoe UI Variable Display"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          // HarmonyOS / MiSans / ColorOS / Android
          '"HarmonyOS Sans SC"',
          '"HarmonyOS Sans"',
          'MiSans',
          'OPPOSans',
          '"Noto Sans SC"',
          '"Noto Sans CJK SC"',
          '"Source Han Sans CN"',
          'Roboto',
          // Linux
          'Ubuntu',
          'Cantarell',
          '"WenQuanYi Micro Hei"',
          // Universal Fallback
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"'
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Cascadia Code"',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace'
        ]
      }
    },
  },
  plugins: [],
}
