// Keep imported base images within the size of NovelAI's large presets.
const GRID = 64;
const MAX_EDGE = 1536;
const MAX_PIXELS = 1472 * 1472;
const MAX_PNG_BYTES = 1024 * 1024;

export function getBaseImageSize(width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  const align = (value: number) => Math.max(GRID, Math.round(value * scale / GRID) * GRID);
  let targetWidth = align(width);
  let targetHeight = align(height);
  while (targetWidth * targetHeight > MAX_PIXELS) {
    if (targetWidth / width >= targetHeight / height) targetWidth -= GRID;
    else targetHeight -= GRID;
  }
  return { width: targetWidth, height: targetHeight };
}

export async function prepareBaseImage(source: Blob | string) {
  const objectUrl = typeof source === 'string' ? undefined : URL.createObjectURL(source);
  const image = new Image();
  try {
    if (typeof source === 'string' && /^https?:/.test(source)) image.crossOrigin = 'anonymous';
    image.src = typeof source === 'string' ? source : objectUrl!;
    await image.decode().catch(() => { throw new Error('无法读取图片，请选择有效的图片文件'); });
    const { naturalWidth: originalWidth, naturalHeight: originalHeight } = image;
    if (!originalWidth || !originalHeight) throw new Error('图片尺寸无效');

    const { width, height } = getBaseImageSize(originalWidth, originalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法处理图片');

    // Fit without stretching. Pad only the area added by size alignment.
    const fit = Math.min(width / originalWidth, height / originalHeight);
    const scaledWidth = originalWidth * fit;
    const scaledHeight = originalHeight * fit;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight);

    const encode = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败')), type, quality);
    });
    const png = await encode('image/png');
    const compacted = png.size > MAX_PNG_BYTES;
    const blob = compacted ? await encode('image/jpeg', 0.92) : png;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('无法读取处理后的图片'));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, width, height, originalWidth, originalHeight, compacted };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export type BaseImage = Awaited<ReturnType<typeof prepareBaseImage>>;
