import { Request, Response, NextFunction } from 'express';
import { isEncryptionEnabled, getEncryptionKey, getAccessKeyConfigs } from '../utils/config';

export const encryptionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!isEncryptionEnabled() || req.headers['x-encrypted'] !== '1') {
    return next();
  }

  let clientKey = (req.headers['x-access-key'] as string || '').trim();
  let key = getEncryptionKey(clientKey);
  let keyBuf = Buffer.from(key, 'utf8');

  // Decrypt body if it's a Buffer
  if (Buffer.isBuffer(req.body)) {
    let success = false;
    try {
      const decrypted = Buffer.allocUnsafe(req.body.length);
      for (let i = 0; i < req.body.length; i++) {
        decrypted[i] = req.body[i] ^ keyBuf[i % keyBuf.length];
      }
      req.body = JSON.parse(decrypted.toString('utf8'));
      success = true;
    } catch (e) {
      // 若解密失败且可能因缺失 x-access-key 头导致，尝试用系统已配置的所有 access keys 逐一容错解密
      const configs = getAccessKeyConfigs();
      for (const cfg of configs) {
        try {
          const altKey = getEncryptionKey(cfg.key);
          const altKeyBuf = Buffer.from(altKey, 'utf8');
          const decrypted = Buffer.allocUnsafe(req.body.length);
          for (let i = 0; i < req.body.length; i++) {
            decrypted[i] = req.body[i] ^ altKeyBuf[i % altKeyBuf.length];
          }
          req.body = JSON.parse(decrypted.toString('utf8'));
          clientKey = cfg.key;
          key = altKey;
          keyBuf = altKeyBuf;
          req.headers['x-access-key'] = clientKey;
          success = true;
          break;
        } catch {}
      }
    }

    if (!success) {
      console.error('Decryption failed for x-encrypted request');
      return res.status(400).send('Decryption failed');
    }
  }

  const originalSend = res.send;
  const originalJson = res.json;
  const originalWrite = res.write;
  
  let responseOffset = 0;

  res.json = function (obj) {
    const jsonStr = JSON.stringify(obj);
    const buffer = Buffer.from(jsonStr, 'utf8');
    const encrypted = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      encrypted[i] = buffer[i] ^ keyBuf[i % keyBuf.length];
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('x-encrypted', '1');
    return originalSend.call(this, encrypted);
  };

  res.send = function (body) {
    if (body !== undefined && body !== null) {
      let buffer: Buffer;
      if (Buffer.isBuffer(body)) {
        buffer = body;
      } else if (typeof body === 'string') {
        buffer = Buffer.from(body, 'utf8');
      } else {
        buffer = Buffer.from(JSON.stringify(body), 'utf8');
      }
      const encrypted = Buffer.allocUnsafe(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        encrypted[i] = buffer[i] ^ keyBuf[i % keyBuf.length];
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('x-encrypted', '1');
      return originalSend.call(this, encrypted);
    }
    return originalSend.call(this, body);
  };

  res.write = function (chunk: any, encoding?: any, callback?: any): boolean {
    if (chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding || 'utf8');
      const encrypted = Buffer.allocUnsafe(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        encrypted[i] = buffer[i] ^ keyBuf[(responseOffset + i) % keyBuf.length];
      }
      responseOffset += buffer.length;
      return originalWrite.call(this, encrypted, 'binary', callback);
    }
    return originalWrite.call(this, chunk, encoding, callback);
  };

  next();
};
