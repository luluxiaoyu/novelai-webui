export function xorUint8Array(data: Uint8Array, key: string): Uint8Array {
  const result = new Uint8Array(data.length);
  const keyBuffer = new TextEncoder().encode(key);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBuffer[i % keyBuffer.length];
  }
  return result;
}
