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
        const buffer = await client.getFileContents(path, { format: 'binary' });
        const b64 = Buffer.from(buffer as ArrayBuffer).toString('base64');
        return res.json({ success: true, data: b64 });
      case 'putFileContents':
        if (!data) return res.status(400).json({ error: 'Missing file data' });
        const putBuffer = Buffer.from(data, 'base64');
        result = await client.putFileContents(path, putBuffer, { overwrite: true });
        break;
      case 'deleteFile':
        result = await client.deleteFile(path);
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
