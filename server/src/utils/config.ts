import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from various possible paths
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const isSiteAuthEnabled = (): boolean => {
  const enabled = process.env.ENABLE_SITE_AUTH;
  const password = getSitePassword();
  
  if (enabled === 'false' || enabled === '0') return false;
  if (enabled === 'true' || enabled === '1') return true;
  
  // Default: if ACCESS_PASSWORD is provided and non-empty, enable auth automatically
  return Boolean(password);
};

export const getSitePassword = (): string => {
  return (
    process.env.ACCESS_PASSWORD ||
    process.env.SITE_PASSWORD ||
    process.env.SITE_KEY ||
    ''
  ).trim();
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
