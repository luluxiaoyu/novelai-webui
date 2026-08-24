import { Request, Response } from 'express';
import { isSiteAuthEnabled, getSitePassword } from '../utils/config';

export const getAuthStatus = (req: Request, res: Response) => {
  const requiresAuth = isSiteAuthEnabled();
  const clientKey = (req.headers['x-access-key'] as string || '').trim();
  const isVerified = !requiresAuth || (Boolean(clientKey) && clientKey === getSitePassword());
  
  res.json({
    requiresAuth,
    isVerified
  });
};

export const verifyAccessKey = (req: Request, res: Response) => {
  if (!isSiteAuthEnabled()) {
    return res.json({ success: true, message: '无需密钥验证' });
  }

  const { accessKey, password } = req.body || {};
  const input = (accessKey || password || req.headers['x-access-key'] || '').toString().trim();
  const correctPassword = getSitePassword();

  if (input && input === correctPassword) {
    return res.json({ success: true });
  }

  return res.status(401).json({ success: false, message: '访问密钥无效或错误' });
};
