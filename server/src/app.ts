import express from 'express';
import cors from 'cors';
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

import path from 'path';
import fs from 'fs';

app.use('/api', apiRoutes);

const clientDistPath = path.resolve(import.meta.dirname, '../../client/dist');
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
