import axios, { AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';
import { xorUint8Array } from './cipher';

export const isEncryptionEnabled = (import.meta as any).env.VITE_ENABLE_ENCRYPTION === 'true';

const getEncryptKey = () => {
  const authStore = useAuthStore();
  return authStore.siteAccessKey ? `nahida1027${authStore.siteAccessKey}` : 'nahida1027';
};

export const encryptedAxios = async (config: AxiosRequestConfig) => {
  if (!isEncryptionEnabled) {
    return axios(config);
  }

  const key = getEncryptKey();
  const modifiedConfig = { ...config };
  modifiedConfig.headers = { ...modifiedConfig.headers, 'x-encrypted': '1' };

  if (modifiedConfig.data) {
    let dataToEncrypt = modifiedConfig.data;
    if (typeof dataToEncrypt !== 'string' && !(dataToEncrypt instanceof Uint8Array)) {
      dataToEncrypt = JSON.stringify(dataToEncrypt);
    }
    const bytes = typeof dataToEncrypt === 'string' ? new TextEncoder().encode(dataToEncrypt) : dataToEncrypt;
    modifiedConfig.data = xorUint8Array(bytes, key).buffer;
    modifiedConfig.headers['Content-Type'] = 'application/octet-stream';
  }

  const originalResponseType = modifiedConfig.responseType;
  modifiedConfig.responseType = 'arraybuffer'; 

  let res;
  try {
    res = await axios(modifiedConfig);
  } catch (error: any) {
    if (error.response && error.response.data) {
      try {
        const decrypted = xorUint8Array(new Uint8Array(error.response.data), key);
        const text = new TextDecoder().decode(decrypted);
        try {
          error.response.data = JSON.parse(text);
        } catch {
          error.response.data = text;
        }
      } catch (decErr) {
        // Fallback if decryption fails
      }
    }
    throw error;
  }

  if (res.data) {
    const decrypted = xorUint8Array(new Uint8Array(res.data), key);
    if (originalResponseType !== 'arraybuffer' && originalResponseType !== 'blob') {
      const text = new TextDecoder().decode(decrypted);
      try {
        res.data = JSON.parse(text);
      } catch {
        res.data = text;
      }
    } else {
      res.data = decrypted.buffer;
    }
  }

  return res;
};

export const encryptedFetchStream = async (url: string, options: RequestInit) => {
  if (!isEncryptionEnabled) return fetch(url, options);

  const key = getEncryptKey();
  const modifiedOptions = { ...options };
  modifiedOptions.headers = { ...modifiedOptions.headers, 'x-encrypted': '1' };

  if (modifiedOptions.body) {
    const bytes = new TextEncoder().encode(modifiedOptions.body as string);
    modifiedOptions.body = xorUint8Array(bytes, key).buffer as any;
    (modifiedOptions.headers as Record<string, string>)['Content-Type'] = 'application/octet-stream';
  }

  const response = await fetch(url, modifiedOptions);
  
  if (!response.body) return response;

  const reader = response.body.getReader();
  let responseOffset = 0;

  const decryptedStream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          break;
        }
        if (value) {
          const keyBuf = new TextEncoder().encode(key);
          const decrypted = new Uint8Array(value.length);
          for (let i = 0; i < value.length; i++) {
            decrypted[i] = value[i] ^ keyBuf[(responseOffset + i) % keyBuf.length];
          }
          responseOffset += value.length;
          controller.enqueue(decrypted);
        }
      }
    }
  });

  return new Response(decryptedStream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
};
