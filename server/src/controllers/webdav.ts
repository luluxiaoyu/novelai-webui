import { Request, Response } from 'express';
import { createClient } from 'webdav';

export const webdavAction = async (req: Request, res: Response) => {
  try {
    const { config, action, path, data, options } = req.body;
    
    if (!config || !config.url || !config.username || !config.password) {
      return res.status(400).json({ error: 'Missing WebDAV credentials' });
    }

    const client = createClient(config.url, {
      username: config.username,
      password: config.password
    });

    let result;
    
    switch(action) {
      case 'stat':
        result = await client.stat(path);
        break;
      case 'getDirectoryContents':
        result = await client.getDirectoryContents(path);
        break;
      case 'createDirectory':
        result = await client.createDirectory(path);
        break;
      case 'exists':
        result = await client.exists(path);
        break;
      case 'getFileContents':
        // Download as ArrayBuffer and encode as base64 to transport over JSON easily
        try {
          const buffer = await client.getFileContents(path, { format: 'binary' });
          const b64 = Buffer.from(buffer as ArrayBuffer).toString('base64');
          return res.json({ success: true, data: b64 });
        } catch (getErr: any) {
          const errStr = String(getErr?.message || getErr?.status || getErr || '');
          if (getErr?.status === 404 || getErr?.response?.status === 404 || errStr.includes('404') || errStr.toLowerCase().includes('not found')) {
            return res.json({ success: true, data: null });
          }
          throw getErr;
        }
      case 'putFileContents':
        if (!data) return res.status(400).json({ error: 'Missing file data' });
        const putBuffer = Buffer.from(data, 'base64');
        result = await client.putFileContents(path, putBuffer, { overwrite: true });
        break;
      case 'deleteFile':
        try {
          result = await client.deleteFile(path);
        } catch (delErr: any) {
          // If file does not exist (404 or not found), treat as success
          const errStr = String(delErr?.message || delErr?.status || delErr || '');
          if (delErr?.status === 404 || delErr?.response?.status === 404 || errStr.includes('404') || errStr.toLowerCase().includes('not found')) {
            result = true;
          } else {
            throw delErr;
          }
        }
        break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('WebDAV error:', error.message || error);
    res.status(500).json({ success: false, error: error.message || 'WebDAV operation failed' });
  }
};
