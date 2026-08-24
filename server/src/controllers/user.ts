import { Request, Response } from 'express';
import axios from 'axios';
import { resolveNovelAIToken } from '../utils/token';

const fetchWithFallback = async (path: string, token: string) => {
  const hosts = ['https://image.novelai.net', 'https://api.novelai.net'];
  let lastError: any = null;
  for (const host of hosts) {
    try {
      const r = await axios.get(`${host}${path}`, {
        headers: {
          'Authorization': token,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });
      return r;
    } catch (err: any) {
      lastError = err;
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw err;
      }
    }
  }
  throw lastError;
};

export const getUserSubscription = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization header or invalid token' });

  try {
    const r = await fetchWithFallback('/user/subscription', token);
    return res.status(r.status).json(r.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: err.message });
  }
};

export const getUserData = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization header or invalid token' });

  try {
    const r = await fetchWithFallback('/user/data', token);
    return res.status(r.status).json(r.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: err.message });
  }
};

export const getUserInformation = async (req: Request, res: Response) => {
  const token = resolveNovelAIToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization header or invalid token' });

  try {
    const r = await fetchWithFallback('/user/information', token);
    return res.status(r.status).json(r.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: err.message });
  }
};
