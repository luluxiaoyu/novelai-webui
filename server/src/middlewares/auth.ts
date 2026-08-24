import { Request, Response, NextFunction } from 'express';
import { isSiteAuthEnabled, getSitePassword } from '../utils/config';

export const siteAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!isSiteAuthEnabled()) {
    return next();
  }

  const clientKey = (
    (req.headers['x-access-key'] as string) ||
    (req.query.accessKey as string) ||
    ''
  ).trim();

  const correctPassword = getSitePassword();

  if (!clientKey || clientKey !== correctPassword) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing site access key',
      requiresAuth: true
    });
  }

  next();
};
