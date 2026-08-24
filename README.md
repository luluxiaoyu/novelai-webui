# NovelAI Proxy & Web Client

**Vibe Coding速成产物，仅做了功能验证，请自行考虑是否使用。**

一个轻量、现代且功能全面的 **NovelAI 图像生成代理服务与 Web 客户端**。

前端基于 Vue 3 + Vite 构建，后端基于 Node.js Express 提供接口代理、鉴权、双向加密及 WebDAV 同步中继服务。

---

## ✨ 核心特性

### 🎨 图像生成
- **全面模型支持**：支持 NovelAI Diffusion V3、V4 及最新的 **V5** 模型系列。
- **多种生成模式**：
  - **文生图 (Text-to-Image)**：支持正向/负向提示词、权重调节与采样参数微调。
  - **图生图 (Image-to-Image)**：快速导入底图进行风格重塑。
  - **局部重绘 (Inpainting)**：内置画板遮罩涂抹编辑器，支持笔刷调节与 8x8 像素对齐。
- **实时流式预览 (SSE)**：支持开启流式生成，实时接收中间采样帧预览。
- **批量并发生成**：支持单次任务批量生成与独立种子随机化。
- **点数与费用预估**：动态计算当前分辨率与步数消耗，实时展示 Opus 会员免费额度及 Anlas 余额。

### 📦 数据管理与 WebDAV 云同步
- **本地持久化**：采用 IndexedDB 与 LocalStorage 本地存储历史生成图片及提示词，断网刷新不丢失。
- **提示词管理**：支持提示词历史记录、分组整理、自定义备注以及常用提示词收藏。
- **WebDAV 云端多存档同步**：
  - **多存档管理**：支持创建、切换、删除多个云端独立存档目录。
  - **增量双向同步**：智能比对本地与云端图片，仅传输差异文件，节约带宽与时间。
  - **无感自动同步**：开启后，生图、删图、修改收藏备注等操作将静默自动推送到 WebDAV。
  - **可视化进度条**：详细展示同步文件数量与当前步骤。
- **本地 ZIP 备份**：支持一键导出包含元数据和图片的全量 ZIP 压缩包，或导入恢复。

### 🔒 安全与防嗅探
- **站点访问鉴权**：支持配置独立的站点访问密码（`ACCESS_PASSWORD`），保护代理接口不被未授权访问。
- **双向防嗅探加密**：支持请求 Body 与响应数据的双向二进制加密混淆，有效防止网络中继抓包与关键词检测。

---

## 📁 目录结构

```text
├── client/              # Vue 3 + Vite + Tailwind CSS 前端项目
│   ├── src/
│   │   ├── components/  # 通用 UI 组件 (如 CustomSelect 等)
│   │   ├── stores/      # Pinia 状态管理 (auth, generation, webdav)
│   │   └── utils/       # 接口封装与加密解密模块
├── server/              # Express 后端代理服务
│   ├── src/
│   │   ├── controllers/ # 控制器 (生图、标签建议、WebDAV 代理等)
│   │   ├── middlewares/ # 鉴权与加解密中间件
│   │   └── routes/      # API 路由
├── .env.example         # 环境变量示例文件
└── package.json         # 项目根配置 (pnpm workspace)
```

---

## 🚀 快速上手与本地开发

### 环境要求
- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0

### 1. 安装依赖
在项目根目录下执行：
```bash
pnpm install
```

### 2. 配置环境变量
复制根目录的 `.env.example` 为 `.env`：
```bash
cp .env.example .env
```

根据需要修改 `.env` 中的参数：
```env
# 服务端监听端口 (默认: 3000)
PORT=3000

# 是否开启站点访问密钥验证 (true / false)
ENABLE_SITE_AUTH=true

# 站点访问密码 (用户访问任何内容与填写 API Token 前必须验证此密码)
ACCESS_PASSWORD=your_secret_password

# 是否开启防嗅探双向加密 (true / false)
ENABLE_ENCRYPTION=false
```

> **提示**：如果前端独立部署并开启了加密功能，前端的 `.env` 中需配置 `VITE_ENABLE_ENCRYPTION=true`。

### 3. 启动开发服务器
```bash
pnpm run dev
```
- 前端开发界面：`http://localhost:5173`
- 后端代理服务：`http://localhost:3000`

---

## 🛠️ 生产环境部署指南 (免 PM2)

本项目后端已**内置前端静态托管支持**：只需打包前端，后端服务即可在单个端口（默认 `3000`）同时提供 Web 界面与 API 代理服务，无需复杂配置。

---

### 方案一：一体化单端口 + nohup 后台运行 (最简单快速)

适合快速部署在服务器上：

1. **打包前端并安装依赖**：
   ```bash
   pnpm install
   pnpm run build
   ```

2. **使用 nohup 后台挂起运行**：
   ```bash
   # 启动服务并在后台持久运行，日志输出到 server.log
   nohup pnpm start > server.log 2>&1 &
   
   # 查看运行日志
   tail -f server.log
   ```

3. **停止服务**：
   ```bash
   # 查找进程并终止
   pkill -f "tsx watch src/app.ts"
   ```

---

### 方案二：Linux Systemd 系统服务托管 (推荐，开机自启/崩溃自愈)

Linux 官方标准服务管理方案，**无需安装任何额外第三方进程管理工具（如 PM2）**，自带开机自启与崩溃重启能力。

1. **构建项目**：
   ```bash
   cd /path/to/novelai-proxy
   pnpm install
   pnpm run build
   ```

2. **创建 Systemd 服务配置文件**：
   ```bash
   sudo nano /etc/systemd/system/novelai-proxy.service
   ```
   写入以下内容（**注意替换实际项目路径和 Node/pnpm 绝对路径**）：
   ```ini
   [Unit]
   Description=NovelAI Proxy & Web Client Service
   After=network.target
   
   [Service]
   Type=simple
   User=root
   WorkingDirectory=/path/to/novelai-proxy
   ExecStart=/usr/local/bin/pnpm start
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   
   [Install]
   WantedBy=multi-user.target
   ```
   *(注：可通过 `which pnpm` 查看 pnpm 的实际安装绝对路径)*

3. **启动并设置开机自启**：
   ```bash
   # 重载系统配置
   sudo systemctl daemon-reload
   
   # 启动服务并设置开机自启
   sudo systemctl enable --now novelai-proxy
   
   # 查看服务运行状态
   sudo systemctl status novelai-proxy
   
   # 查看实时输出日志
   sudo journalctl -u novelai-proxy -f
   ```

---

### 方案三：结合 Nginx 反向代理与 SSL (可选，按需配置)

如果您需要配置域名、绑定 80/443 端口或配置 HTTPS 证书，可配置 Nginx 反代本地的 `3000` 端口：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 针对 SSE 实时流式传输的关键配置 (关闭缓冲)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        chunked_transfer_encoding on;
    }
}
```

---

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 后端服务监听端口 |
| `NOVELAI_TOKEN` | - | 服务端内置 NovelAI API Token（前端免输入一键登录，后端安全注入） |
| `ENABLE_SITE_AUTH` | `true` | 是否启用全站访问密码保护 |
| `ACCESS_KEYS` | - | 多访问密钥与权限配置（格式：`admin:all,guest:free`，`free` 严格限制仅限免费参数生图） |
| `ACCESS_PASSWORD` | - | 站点访问密码（单密钥兼容写法，默认全权限） |
| `ENABLE_ENCRYPTION` | `false` | 是否开启前后端通信双向混淆加密 |
| `VITE_ENABLE_ENCRYPTION` | `false` | 客户端加解密开关（需与服务端保持一致） |
| `ENABLE_LOGS` | `true` | 是否开启生图参数日志记录（按日期和用户密钥自动分类归档） |

---

## 📄 开源许可

本项目遵循 MIT License 协议。

