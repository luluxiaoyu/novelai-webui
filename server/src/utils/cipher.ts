export function xorBuffer(data: Buffer, key: string): Buffer {
  const result = Buffer.allocUnsafe(data.length);
  const keyBuffer = Buffer.from(key, 'utf8');
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBuffer[i % keyBuffer.length];
  }
  return result;
}
