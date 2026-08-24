import { Request } from 'express';
import { getBuiltinToken, hasBuiltinToken } from './config';

export const resolveNovelAIToken = (req: Request): string | null => {
  let authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    authHeader = authHeader.substring(7).trim();
  } else {
    authHeader = authHeader.trim();
  }

  if (authHeader === '__BUILTIN__' || (!authHeader && hasBuiltinToken())) {
    if (hasBuiltinToken()) {
      return `Bearer ${getBuiltinToken()}`;
    }
    return null;
  }

  if (!authHeader) {
    return null;
  }

  return `Bearer ${authHeader}`;
};

export const validateFreeTierParameters = (req: Request): { allowed: boolean; reason?: string } => {
  const siteAuth = (req as any).siteAuth;
  // 如果没有限制或者明确允许付费参数，直接放行
  if (!siteAuth || siteAuth.allowPaid !== false) {
    return { allowed: true };
  }

  const body = req.body || {};
  const params = body.parameters || {};

  const width = Number(params.width || body.width || 0);
  const height = Number(params.height || body.height || 0);
  const steps = Number(params.steps || body.steps || 0);

  if (width && height && width * height > 1048576) {
    return {
      allowed: false,
      reason: `该访问密钥仅限使用免费额度，当前分辨率 (${width}x${height} = ${width * height} 像素) 超出了免费上限 (1048576 像素)`
    };
  }

  if (steps && steps > 28) {
    return {
      allowed: false,
      reason: `该访问密钥仅限使用免费额度，当前采样步数 (${steps} 步) 超出了免费上限 (28 步)`
    };
  }

  return { allowed: true };
};
