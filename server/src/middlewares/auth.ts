import { Request, Response, NextFunction } from 'express';
import { isSiteAuthEnabled, findAccessKeyConfig } from '../utils/config';

export const siteAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!isSiteAuthEnabled()) {
    (req as any).siteAuth = { key: 'default', allowPaid: true };
    return next();
  }

  const clientKey = (
    (req.headers['x-access-key'] as string) ||
    (req.query.accessKey as string) ||
    ''
  ).trim();

  const keyConfig = findAccessKeyConfig(clientKey);

  if (!clientKey || !keyConfig) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing site access key',
      requiresAuth: true
    });
  }

  (req as any).siteAuth = keyConfig;
  next();
};
