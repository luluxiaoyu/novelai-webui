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
    await generationQueue.enqueue(tokenKey, req, async () => {
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
    await generationQueue.enqueue(tokenKey, req, async () => {
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
    logGeneration(req, 'stream', 'failed', { error: error.response?.data || error.message });
    if (error.response) {
      if (typeof error.response.data?.on === 'function') {
        return res.status(error.response.status).json({ error: 'Upstream generation error', status: error.response.status });
      }
      return res.status(error.response.status).json(error.response.data);
    }
    return res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
  }
};

export const suggestTags = async (req: Request, res: Response) => {
  await forwardRequest(naiImageClient, req, res, '/ai/generate-image/suggest-tags');
};
