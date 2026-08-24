import axios from 'axios';

export const naiUserClient = axios.create({
  baseURL: 'https://image.novelai.net',
});

export const naiImageClient = axios.create({
  baseURL: 'https://image.novelai.net',
});

export const forwardRequest = async (client: any, req: any, res: any, path: string) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  try {
    const response = await client({
      method: req.method,
      url: path,
      data: req.body,
      params: req.query,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: req.headers.accept === 'application/zip' ? 'arraybuffer' : 'json'
    });

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    
    return res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error(`Error proxying ${path}:`, error.message);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data instanceof Buffer ? JSON.parse(error.response.data.toString()) : error.response.data);
    }
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
