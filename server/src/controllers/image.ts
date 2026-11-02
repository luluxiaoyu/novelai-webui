import { Request, Response } from 'express';
import { forwardRequest, naiImageClient } from '../utils/proxy';
import { resolveNovelAIToken, validateFreeTierParameters } from '../utils/token';
import { logGeneration } from '../utils/logger';
import { generationQueue } from '../utils/queue';
import { getBuiltinToken } from '../utils/config';
import axios from 'axios';

export const generateImage = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization header or invalid token' });

  const freeTierCheck = validateFreeTierParameters(req);
  if (!freeTierCheck.allowed) {
    logGeneration(req, 'normal', 'failed', { error: freeTierCheck.reason });
    return res.status(403).json({ error: freeTierCheck.reason });
  }

  const isBuiltin = (req.headers.authorization || '').includes('__BUILTIN__') || (getBuiltinToken() && token === `Bearer ${getBuiltinToken()}`);
  const tokenKey = isBuiltin ? '__BUILTIN__' : token;

  try {
    await generationQueue.enqueue(tokenKey, req, res, async () => {
      const isZip = req.headers.accept === 'application/zip';
      const logBody = { ...req.body };
      if (logBody.parameters) {
        logBody.parameters = { ...logBody.parameters };
        if (logBody.parameters.image) logBody.parameters.image = `[base64 len: ${logBody.parameters.image.length}]`;
        if (logBody.parameters.mask) logBody.parameters.mask = `[base64 len: ${logBody.parameters.mask.length}]`;
      }
      console.log(`[generateImage] Sending to NovelAI:`, JSON.stringify(logBody));
      const response = await naiImageClient.post('/ai/generate-image', req.body, {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': req.headers.accept || 'application/json'
        },
        responseType: isZip ? 'arraybuffer' : 'json',
        timeout: 120000
      });

      logGeneration(req, 'normal', 'success');

      if (isZip) {
        res.setHeader('Content-Type', 'application/zip');
        res.status(201).send(response.data);
      } else {
        res.status(201).json(response.data);
      }
    });
  } catch (error: any) {
    if (res.headersSent) return;
    console.error(`Error generating image:`, error.message);
    let parsedData = error.response?.data;
    if (parsedData instanceof Buffer) {
      const text = parsedData.toString('utf-8');
      try {
        parsedData = JSON.parse(text);
      } catch {
        parsedData = { message: text };
      }
    }
    logGeneration(req, 'normal', 'failed', { error: parsedData || error.message });
    if (error.response) {
      console.error(`NovelAI upstream error [${error.response.status}]:`, JSON.stringify(parsedData));
      return res.status(error.response.status).json(parsedData);
    }
    return res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
  }
};

export const generateImageStream = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization header or invalid token' });

  const freeTierCheck = validateFreeTierParameters(req);
  if (!freeTierCheck.allowed) {
    logGeneration(req, 'stream', 'failed', { error: freeTierCheck.reason });
    return res.status(403).json({ error: freeTierCheck.reason });
  }

  const isBuiltin = (req.headers.authorization || '').includes('__BUILTIN__') || (getBuiltinToken() && token === `Bearer ${getBuiltinToken()}`);
  const tokenKey = isBuiltin ? '__BUILTIN__' : token;

  try {
    await generationQueue.enqueue(tokenKey, req, res, async () => {
      const logBody = { ...req.body };
      if (logBody.parameters) {
        logBody.parameters = { ...logBody.parameters };
        if (logBody.parameters.image) logBody.parameters.image = `[base64 len: ${logBody.parameters.image.length}]`;
        if (logBody.parameters.mask) logBody.parameters.mask = `[base64 len: ${logBody.parameters.mask.length}]`;
      }
      console.log(`[generateImageStream] Sending to NovelAI:`, JSON.stringify(logBody));

      const response = await naiImageClient.post('/ai/generate-image-stream', req.body, {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        responseType: 'stream'
      });

      logGeneration(req, 'stream', 'processing');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await new Promise<void>((resolve, reject) => {
        response.data.pipe(res);
        response.data.on('end', () => resolve());
        response.data.on('close', () => resolve());
        response.data.on('error', (err: any) => reject(err));
        res.on('close', () => resolve());
      });
    });
  } catch (error: any) {
    if (res.headersSent) return;
    console.error('Error in streaming generation:', error.message);
    
    let errorData = error.response?.data;
    if (errorData && typeof errorData.on === 'function') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of errorData) {
          chunks.push(Buffer.from(chunk));
        }
        const text = Buffer.concat(chunks).toString('utf-8');
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { message: text };
        }
      } catch {
        errorData = { message: error.message };
      }
    }

    logGeneration(req, 'stream', 'failed', { error: errorData || error.message });
    if (error.response) {
      return res.status(error.response.status).json(errorData || { error: 'Upstream generation error', status: error.response.status });
    }
    return res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
  }
};

export const getQueueStatus = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  const isBuiltin = (req.headers.authorization || '').includes('__BUILTIN__') || (getBuiltinToken() && token === `Bearer ${getBuiltinToken()}`);
  const tokenKey = isBuiltin ? '__BUILTIN__' : (token || '__ANONYMOUS__');
  const status = generationQueue.getQueueStatus(tokenKey);
  res.json({ success: true, ...status });
};

export const suggestTags = async (req: Request, res: Response) => {
  await forwardRequest(naiImageClient, req, res, '/ai/generate-image/suggest-tags');
};

export const upscaleImage = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization header or invalid token' });

  // 校验付费权限：超分操作固定消耗 1 点数 (1 Anlas)
  const siteAuth = (req as any).siteAuth;
  if (siteAuth && siteAuth.allowPaid === false) {
    const errorMsg = '该访问密钥仅限使用免费额度，AI超分需消耗 1 点数，当前无权使用';
    logGeneration(req, 'upscale', 'failed', { error: errorMsg });
    return res.status(403).json({ error: errorMsg });
  }

  const { image, width, height, scale, model } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: '缺少待超分的图像数据 (image)' });
  }

  const rawBase64 = typeof image === 'string' && image.includes(',') ? image.split(',')[1] : image;
  const imageBuffer = Buffer.from(rawBase64, 'base64');

  let numWidth = Number(width);
  let numHeight = Number(height);
  const numScale = Number(scale) || 4;

  // 尝试从 PNG 二进制头读取真实分辨率 (IHDR chunks)
  if (imageBuffer.length > 24 && imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4e && imageBuffer[3] === 0x47) {
    const pngWidth = imageBuffer.readUInt32BE(16);
    const pngHeight = imageBuffer.readUInt32BE(20);
    if (pngWidth > 0 && pngHeight > 0) {
      numWidth = pngWidth;
      numHeight = pngHeight;
    }
  }

  if (!numWidth || !numHeight) {
    return res.status(400).json({ error: '缺少图像分辨率参数 (width, height)' });
  }

  if (numScale !== 2 && numScale !== 4) {
    return res.status(400).json({ error: '放大倍率仅支持 2 或 4 (scale: 2 | 4)' });
  }

  // 官方硬限制：原图总像素不得超过 1,048,576 像素 (等效 1024x1024)
  if (numWidth * numHeight > 1048576) {
    const errorMsg = `原图尺寸 (${numWidth}x${numHeight} = ${numWidth * numHeight} 像素) 超出了官方超分限制 (最大 1,048,576 像素，约 1024x1024)`;
    logGeneration(req, 'upscale', 'failed', { error: errorMsg });
    return res.status(400).json({ error: errorMsg });
  }

  const isBuiltin = (req.headers.authorization || '').includes('__BUILTIN__') || (getBuiltinToken() && token === `Bearer ${getBuiltinToken()}`);
  const tokenKey = isBuiltin ? '__BUILTIN__' : token;

  try {
    await generationQueue.enqueue(tokenKey, req, res, async () => {
      const targetModel = model || 'nai-diffusion-5-full';
      console.log(`[upscaleImage] Sending upscale request to NovelAI: ${numWidth}x${numHeight}, model=${targetModel}, requestedScale=${numScale}`);
      
      // 构造官方标准的 multipart/form-data 格式 (包含 image part 和 request json part)
      const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
      
      const part1Header = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="image"; filename="blob"\r\n` +
        `Content-Type: image/png\r\n\r\n`
      );
      const part1Footer = Buffer.from('\r\n');

      const requestJson = JSON.stringify({
        image: 'image',
        model: targetModel,
        declared_blur_sigma: 0
      });

      const part2Header = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="request"; filename="blob"\r\n` +
        `Content-Type: application/json\r\n\r\n`
      );
      const part2Content = Buffer.from(requestJson, 'utf-8');
      const part2Footer = Buffer.from(`\r\n--${boundary}--\r\n`);

      const multipartBody = Buffer.concat([
        part1Header,
        imageBuffer,
        part1Footer,
        part2Header,
        part2Content,
        part2Footer
      ]);

      const response = await naiImageClient.post('/ai/upscale', multipartBody, {
        headers: {
          'Authorization': token,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Accept': '*/*'
        },
        responseType: 'arraybuffer',
        timeout: 120000
      });

      logGeneration(req, 'upscale', 'success');

      const contentType = String(response.headers['content-type'] || 'application/zip');
      res.setHeader('Content-Type', contentType);
      res.status(200).send(response.data);
    });
  } catch (error: any) {
    if (res.headersSent) return;
    console.error(`Error upscaling image:`, error.message);
    let parsedData = error.response?.data;
    if (parsedData instanceof Buffer) {
      const text = parsedData.toString('utf-8');
      try {
        parsedData = JSON.parse(text);
      } catch {
        parsedData = { message: text };
      }
    }
    logGeneration(req, 'upscale', 'failed', { error: parsedData || error.message });
    if (error.response) {
      console.error(`NovelAI upstream upscale error [${error.response.status}]:`, JSON.stringify(parsedData));
      return res.status(error.response.status).json(parsedData);
    }
    return res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
  }
};
