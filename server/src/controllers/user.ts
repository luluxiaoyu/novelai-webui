import { Request, Response } from 'express';
import axios from 'axios';

export const getUserSubscription = async (req: Request, res: Response) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Missing authorization header' });

  try {
    const r = await axios.get('https://image.novelai.net/user/subscription', {
      headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' }
    });
    return res.status(r.status).json(r.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: err.message });
  }
};

export const getUserData = async (req: Request, res: Response) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Missing authorization header' });

  try {
    const r = await axios.get('https://image.novelai.net/user/data', {
      headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' }
    });
    return res.status(r.status).json(r.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: err.message });
  }
};

export const getUserInformation = async (req: Request, res: Response) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Missing authorization header' });

  try {
    const r = await axios.get('https://image.novelai.net/user/information', {
      headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' }
    });
    return res.status(r.status).json(r.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: err.message });
  }
};
