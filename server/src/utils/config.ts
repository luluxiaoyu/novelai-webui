import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from various possible paths
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AccessKeyConfig {
  key: string;
  allowPaid: boolean;
}

export const getAccessKeyConfigs = (): AccessKeyConfig[] => {
  const keysEnv = (process.env.ACCESS_KEYS || '').trim();
  const configs: AccessKeyConfig[] = [];

  if (keysEnv) {
    // 格式: key1:all,key2:free,key3:all
    const entries = keysEnv.split(',').map(s => s.trim()).filter(Boolean);
    for (const entry of entries) {
      if (entry.includes(':')) {
        const [key, perm] = entry.split(':').map(s => s.trim());
        if (key) {
          configs.push({
            key,
            allowPaid: perm.toLowerCase() !== 'free' && perm.toLowerCase() !== 'free_only'
          });
        }
      } else {
        configs.push({
          key: entry,
          allowPaid: true
        });
      }
    }
  }

  // 兼容旧版单个 ACCESS_PASSWORD
  const legacyPassword = (
    process.env.ACCESS_PASSWORD ||
    process.env.SITE_PASSWORD ||
    process.env.SITE_KEY ||
    ''
  ).trim();

  if (legacyPassword && !configs.some(c => c.key === legacyPassword)) {
    configs.push({
      key: legacyPassword,
      allowPaid: true
    });
  }

  return configs;
};

export const findAccessKeyConfig = (clientKey: string): AccessKeyConfig | null => {
  if (!clientKey || !clientKey.trim()) return null;
  const target = clientKey.trim();
  const configs = getAccessKeyConfigs();
  return configs.find(c => c.key === target) || null;
};

export const isSiteAuthEnabled = (): boolean => {
  const enabled = process.env.ENABLE_SITE_AUTH;
  const configs = getAccessKeyConfigs();
  
  if (enabled === 'false' || enabled === '0') return false;
  if (enabled === 'true' || enabled === '1') return true;
  
  return configs.length > 0;
};

export const getSitePassword = (): string => {
  const configs = getAccessKeyConfigs();
  return configs.length > 0 ? configs[0].key : '';
};

export const getPort = (): number => {
  return process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
};

export const isEncryptionEnabled = (): boolean => {
  return process.env.ENABLE_ENCRYPTION === 'true' || process.env.ENABLE_ENCRYPTION === '1';
};

export const getEncryptionKey = (clientAccessKey?: string): string => {
  if (clientAccessKey && clientAccessKey.trim()) {
    return `nahida1027${clientAccessKey.trim()}`;
  }
  return 'nahida1027';
};

export const getBuiltinToken = (): string => {
  return (
    process.env.NOVELAI_TOKEN ||
    process.env.BUILTIN_NOVELAI_KEY ||
    process.env.BUILTIN_API_KEY ||
    process.env.NAI_TOKEN ||
    ''
  ).trim();
};

export const hasBuiltinToken = (): boolean => {
  return Boolean(getBuiltinToken());
};

export const isLoggingEnabled = (): boolean => {
  const val = process.env.ENABLE_LOGS ?? process.env.ENABLE_LOGGING;
  if (val === 'false' || val === '0') return false;
  return true; // 默认开启
};

export const getBuiltinConcurrency = (): number => {
  const val = process.env.BUILTIN_CONCURRENCY || process.env.QUEUE_CONCURRENCY;
  if (val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1; // 默认内置 Key 并发数: 1 (防止免费额度 429 冲突)
};

export const getQueueTimeoutSeconds = (): number => {
  const val = process.env.QUEUE_TIMEOUT_SECONDS || process.env.QUEUE_TIMEOUT;
  if (val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 120; // 默认排队超时: 120 秒
};
