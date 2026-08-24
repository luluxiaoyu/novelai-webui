import { Request, Response } from 'express';
import { isSiteAuthEnabled, findAccessKeyConfig, hasBuiltinToken } from '../utils/config';

export const getAuthStatus = (req: Request, res: Response) => {
  const requiresAuth = isSiteAuthEnabled();
  const clientKey = (req.headers['x-access-key'] as string || '').trim();
  const keyConfig = findAccessKeyConfig(clientKey);
  const isVerified = !requiresAuth || Boolean(keyConfig);
  const allowPaid = !requiresAuth ? true : (keyConfig?.allowPaid ?? true);
  
  res.json({
    requiresAuth,
    isVerified,
    allowPaid,
    hasBuiltinKey: hasBuiltinToken()
  });
};

export const verifyAccessKey = (req: Request, res: Response) => {
  if (!isSiteAuthEnabled()) {
    return res.json({
      success: true,
      allowPaid: true,
      hasBuiltinKey: hasBuiltinToken(),
      message: '无需密钥验证'
    });
  }

  const { accessKey, password } = req.body || {};
  const input = (accessKey || password || req.headers['x-access-key'] || '').toString().trim();
  const keyConfig = findAccessKeyConfig(input);

  if (input && keyConfig) {
    return res.json({
      success: true,
      allowPaid: keyConfig.allowPaid,
      hasBuiltinKey: hasBuiltinToken()
    });
  }

  return res.status(401).json({ success: false, message: '访问密钥无效或错误' });
};
