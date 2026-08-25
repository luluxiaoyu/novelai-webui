import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import apiRoutes from './routes/api';
import { getPort, isSiteAuthEnabled } from './utils/config';

const app = express();
const PORT = getPort();

app.use(cors());
app.use(express.raw({ type: ['application/encrypted', 'application/octet-stream'], limit: '50mb' }));
import { encryptionMiddleware } from './middlewares/encryption';
app.use(encryptionMiddleware);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api', apiRoutes);

// 多路径自动探测前端打包产物 (兼容源码执行、编译后 dist 执行、工作区根目录执行等)
const possibleClientDistPaths = [
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist')
];
const clientDistPath = possibleClientDistPaths.find(p => fs.existsSync(p)) || path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('NovelAI Proxy Server is running (Frontend build not found)');
  });
}

// 全局异常捕获，防止服务端进程静默崩溃
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
  console.log(`Site access authentication: ${isSiteAuthEnabled() ? 'ENABLED' : 'DISABLED'}`);
});
