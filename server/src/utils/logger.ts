import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import { isLoggingEnabled } from './config';

export const logGeneration = (
  req: Request,
  type: 'normal' | 'stream',
  status: 'success' | 'failed' | 'processing',
  details?: any
) => {
  if (!isLoggingEnabled()) return;

  try {
    const now = new Date();
    // 本地时区 YYYY-MM-DD
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // 获取密钥标识（取前6位，安全且方便按人归类）
    const rawKey = (
      (req.headers['x-access-key'] as string) ||
      ((req as any).siteAuth?.key as string) ||
      'anonymous'
    ).trim();

    const safeKeyPrefix = (rawKey.slice(0, 6) || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');

    // 日志目录：项目根目录/logs/YYYY-MM-DD
    const logDir = path.resolve(process.cwd(), 'logs', dateStr);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${safeKeyPrefix}.log`);

    // 提取并清洗生图参数（避免写入庞大的 base64 字符串）
    const body = req.body || {};
    const params = body.parameters || {};

    const cleanParams: any = { ...params };
    if (cleanParams.image) {
      cleanParams.image = `[Base64 Image, len: ${cleanParams.image.length}]`;
    }
    if (cleanParams.mask) {
      cleanParams.mask = `[Base64 Mask, len: ${cleanParams.mask.length}]`;
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const model = body.model || cleanParams.model || 'N/A';
    const action = body.action || 'generate';
    const prompt = body.input || cleanParams.prompt || cleanParams.v4_prompt?.caption?.base_caption || '';
    const negPrompt = cleanParams.negative_prompt || cleanParams.uc || cleanParams.v4_negative_prompt?.caption?.base_caption || '';
    let safeError = '';
    if (details?.error) {
      if (typeof details.error === 'string') {
        safeError = details.error;
      } else if (details.error?.message) {
        safeError = details.error.message;
      } else if (typeof details.error === 'object') {
        try {
          safeError = JSON.stringify(details.error);
        } catch {
          safeError = '[Unserializable Error]';
        }
      } else {
        safeError = String(details.error);
      }
    }

    const logText = `[${dateStr} ${timeStr}] [${type.toUpperCase()}] [${status.toUpperCase()}] [IP: ${ip}] [Model: ${model}] [Action: ${action}]\n  Size: ${cleanParams.width}x${cleanParams.height} | Steps: ${cleanParams.steps} | Scale: ${cleanParams.scale} | Sampler: ${cleanParams.sampler} | Schedule: ${cleanParams.noise_schedule || 'karras'} | Seed: ${cleanParams.seed ?? 'random'}\n  Prompt: ${JSON.stringify(prompt)}\n  Negative: ${JSON.stringify(negPrompt)}${safeError ? `\n  Error: ${safeError}` : ''}\n\n`;

    fs.appendFile(logFile, logText, (err) => {
      if (err) console.error('[Logger] Failed to write log:', err.message);
    });
  } catch (err: any) {
    console.error('[Logger] Error creating log entry:', err.message);
  }
};
