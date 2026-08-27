import type { CharacterPrompt } from '../stores/generation';

export interface ParsedImageMetadata {
  hasMetadata: boolean;
  prompt?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
  seed?: number;
  sampler?: string;
  model?: string;
  noise_schedule?: string;
  cfg_rescale?: number;
  uncond_scale?: number;
  skip_cfg_above_sigma?: number | null;
  characters?: CharacterPrompt[];
  use_coords?: boolean;
  rawComment?: any;
  software?: string;
}

// 跨平台异步解压 zlib / deflate 字节流
async function inflateBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(bytes as any);
      writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const out = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    } catch {
      try {
        const dsRaw = new DecompressionStream('deflate-raw');
        const writer = dsRaw.writable.getWriter();
        // 如果包含 2 字节 zlib 头部 (如 0x78 0x9c)，跳过头部尝试 raw deflate
        const rawPayload = bytes.length > 2 && bytes[0] === 0x78 ? bytes.subarray(2) : bytes;
        writer.write(rawPayload as any);
        writer.close();
        const chunks: Uint8Array[] = [];
        const reader = dsRaw.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.length;
        }
        return out;
      } catch (e2) {
        console.warn('Decompress deflate failed:', e2);
      }
    }
  }
  return bytes;
}


function fixJsonString(jsonStr: string): string {
  let inString = false;
  let escapeNext = false;
  let result = '';
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        result += char;
      } else if (char === '\\') {
        escapeNext = true;
        result += char;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char.charCodeAt(0) < 32) {
        // skip other control chars
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }
  return result;
}

// 从 SD WebUI / Forge / Fooocus / NovelAI WebUI 常见 parameters 格式字符串中解析参数
function parseParametersText(text: string, result: ParsedImageMetadata) {
  if (!text || typeof text !== 'string') return;

  const trimmed = text.replace(/\0/g, '').trim();
  if (!trimmed) return;

  // 1. 尝试直接作为 JSON 解析 (NovelAI Comment 格式)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(fixJsonString(trimmed));
      parseNovelAIJson(obj, result);
      return;
    } catch (e) { console.warn('NovelAI JSON parse failed:', e); }
  }

  // 2. 尝试解析 ComfyUI Prompt / Workflow JSON
  if (trimmed.includes('"inputs"') && (trimmed.includes('CLIPTextEncode') || trimmed.includes('KSampler') || trimmed.includes('NovelAIDiffusion'))) {
    try {
      const obj = JSON.parse(trimmed);
      parseComfyUIJson(obj, result);
      if (result.hasMetadata) return;
    } catch {}
  }

  // 3. SD WebUI 标准 parameters 文本解析
  // 格式如：
  // prompt here
  // Negative prompt: negative prompt here
  // Steps: 28, Sampler: Euler a, Schedule type: Karras, CFG scale: 5.5, Seed: 12345, Size: 832x1216, Model: ...
  const negMatch = trimmed.match(/(?:Negative prompt|Negative Prompt|negative_prompt):\s*([\s\S]*?)(?=(?:\nSteps:|\n[A-Z][a-zA-Z\s]+:|$))/i);
  let promptPart = trimmed;
  let negPromptPart = '';

  if (negMatch && negMatch.index !== undefined) {
    promptPart = trimmed.substring(0, negMatch.index).trim();
    negPromptPart = negMatch[1].trim();
  }

  // 提取参数行 (Steps: ...)
  const paramLineMatch = trimmed.match(/(?:^|\n)(Steps:\s*\d+[\s\S]*)$/i);
  if (paramLineMatch) {
    if (!negMatch && paramLineMatch.index !== undefined) {
      promptPart = trimmed.substring(0, paramLineMatch.index).trim();
    }
    const paramLine = paramLineMatch[1];
    
    const steps = paramLine.match(/Steps:\s*(\d+)/i);
    if (steps) result.steps = parseInt(steps[1], 10);

    const sampler = paramLine.match(/Sampler:\s*([^,\n]+)/i);
    if (sampler) result.sampler = sampler[1].trim();

    const scale = paramLine.match(/(?:CFG scale|CFG Scale|Guidance Scale|Guidance):\s*([\d.]+)/i);
    if (scale) result.scale = parseFloat(scale[1]);

    const seed = paramLine.match(/Seed:\s*(\d+)/i);
    if (seed) result.seed = parseInt(seed[1], 10);

    const size = paramLine.match(/Size:\s*(\d+)x(\d+)/i);
    if (size) {
      result.width = parseInt(size[1], 10);
      result.height = parseInt(size[2], 10);
    }

    const model = paramLine.match(/Model:\s*([^,\n]+)/i);
    if (model) result.model = model[1].trim();

    const schedule = paramLine.match(/(?:Schedule type|Noise schedule):\s*([^,\n]+)/i);
    if (schedule) result.noise_schedule = schedule[1].trim();

    const cfgRescale = paramLine.match(/(?:CFG Rescale|cfg_rescale):\s*([\d.]+)/i);
    if (cfgRescale) result.cfg_rescale = parseFloat(cfgRescale[1]);

    const uncondScale = paramLine.match(/(?:Uncond Scale|uncond_scale):\s*([\d.]+)/i);
    if (uncondScale) result.uncond_scale = parseFloat(uncondScale[1]);
  }

  if (promptPart) {
    result.prompt = promptPart;
    result.hasMetadata = true;
  }
  if (negPromptPart) {
    result.negative_prompt = negPromptPart;
    result.hasMetadata = true;
  }
}

// 解析 NovelAI 官方 JSON 结构
function parseNovelAIJson(obj: any, result: ParsedImageMetadata) {
  if (!obj || typeof obj !== 'object') return;

  result.hasMetadata = true;
  result.rawComment = obj;

  if (obj.prompt) result.prompt = obj.prompt;
  else if (obj.v4_prompt?.caption?.base_caption) result.prompt = obj.v4_prompt.caption.base_caption;

  if (obj.uc) result.negative_prompt = obj.uc;
  else if (obj.negative_prompt) result.negative_prompt = obj.negative_prompt;
  else if (obj.v4_negative_prompt?.caption?.base_caption) result.negative_prompt = obj.v4_negative_prompt.caption.base_caption;

  if (typeof obj.steps === 'number') result.steps = obj.steps;
  if (typeof obj.scale === 'number') result.scale = obj.scale;
  if (typeof obj.seed === 'number') result.seed = obj.seed;
  if (obj.sampler) result.sampler = obj.sampler;
  if (typeof obj.width === 'number') result.width = obj.width;
  if (typeof obj.height === 'number') result.height = obj.height;
  if (obj.noise_schedule) result.noise_schedule = obj.noise_schedule;
  if (typeof obj.cfg_rescale === 'number') result.cfg_rescale = obj.cfg_rescale;
  if (typeof obj.uncond_scale === 'number') result.uncond_scale = obj.uncond_scale;
  if (obj.skip_cfg_above_sigma !== undefined) result.skip_cfg_above_sigma = obj.skip_cfg_above_sigma;

  // 提取 V4 / V4.5 / V5 多角色定位提示词
  if (Array.isArray(obj.v4_prompt?.caption?.char_captions) && obj.v4_prompt.caption.char_captions.length > 0) {
    result.characters = obj.v4_prompt.caption.char_captions.map((c: any, idx: number) => ({
      id: `char-${idx}-${Date.now()}`,
      prompt: c.char_caption || '',
      uc: obj.v4_negative_prompt?.caption?.char_captions?.[idx]?.char_caption || '',
      center: {
        x: typeof c.centers?.[0]?.x === 'number' ? c.centers[0].x : 0.5,
        y: typeof c.centers?.[0]?.y === 'number' ? c.centers[0].y : 0.5
      },
      enabled: true
    }));
    result.use_coords = obj.v4_prompt.use_coords ?? true;
  }
}

// 解析 ComfyUI 工作流 JSON 结构
function parseComfyUIJson(obj: any, result: ParsedImageMetadata) {
  try {
    const nodes = obj.nodes || (typeof obj === 'object' ? Object.values(obj) : []);
    let posPrompt = '';
    let negPrompt = '';

    for (const node of nodes) {
      if (!node) continue;
      const classType = node.class_type || node.type || '';
      const inputs = node.inputs || {};

      if (classType.includes('CLIPTextEncode') || classType.includes('NovelAIDiffusion') || classType.includes('Prompt')) {
        const text = inputs.text || inputs.prompt || inputs.tags || node.widgets_values?.[0];
        if (typeof text === 'string' && text.trim()) {
          const title = (node._meta?.title || node.title || '').toLowerCase();
          if (title.includes('negative') || title.includes('uc') || title.includes('负面') || title.includes('反向')) {
            if (!negPrompt) negPrompt = text;
          } else {
            if (!posPrompt) posPrompt = text;
          }
        }
      }

      if (classType.includes('KSampler')) {
        if (typeof inputs.steps === 'number') result.steps = inputs.steps;
        if (typeof inputs.cfg === 'number') result.scale = inputs.cfg;
        if (typeof inputs.seed === 'number') result.seed = inputs.seed;
        if (typeof inputs.sampler_name === 'string') result.sampler = inputs.sampler_name;
        if (typeof inputs.scheduler === 'string') result.noise_schedule = inputs.scheduler;
      }
    }

    if (posPrompt) {
      result.prompt = posPrompt;
      result.hasMetadata = true;
    }
    if (negPrompt) {
      result.negative_prompt = negPrompt;
      result.hasMetadata = true;
    }
  } catch (e) {
    console.warn('Parse ComfyUI JSON failed:', e);
  }
}

// 解析 PNG 格式 (包含 tEXt, zTXt, iTXt, eXIf)
async function parsePng(uint8: Uint8Array, data: DataView, result: ParsedImageMetadata) {
  let offset = 8;
  const decoder = new TextDecoder('utf-8');
  const latin1Decoder = new TextDecoder('iso-8859-1');
  const rawChunks: Record<string, string> = {};

  while (offset < uint8.length - 8) {
    const length = data.getUint32(offset);
    offset += 4;
    const type = String.fromCharCode(
      uint8[offset], uint8[offset + 1], uint8[offset + 2], uint8[offset + 3]
    );
    offset += 4;

    if (type === 'IEND') break;

    try {
      if (type === 'tEXt') {
        const chunkData = uint8.subarray(offset, offset + length);
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx !== -1) {
          const keyword = latin1Decoder.decode(chunkData.subarray(0, nullIdx));
          const text = decoder.decode(chunkData.subarray(nullIdx + 1));
          rawChunks[keyword] = text;
        }
      } else if (type === 'zTXt') {
        // zTXt: keyword + \0 + compression_method(0) + deflate_data
        const chunkData = uint8.subarray(offset, offset + length);
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx !== -1 && nullIdx + 2 <= chunkData.length) {
          const keyword = latin1Decoder.decode(chunkData.subarray(0, nullIdx));
          const compressed = chunkData.subarray(nullIdx + 2);
          const decompressed = await inflateBytes(compressed);
          const text = decoder.decode(decompressed);
          rawChunks[keyword] = text;
        }
      } else if (type === 'iTXt') {
        // iTXt: keyword + \0 + flag + method + lang + \0 + trans_keyword + \0 + text
        const chunkData = uint8.subarray(offset, offset + length);
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx !== -1) {
          const keyword = decoder.decode(chunkData.subarray(0, nullIdx));
          const compressionFlag = chunkData[nullIdx + 1];
          let ptr = nullIdx + 3;
          while (ptr < chunkData.length && chunkData[ptr] !== 0) ptr++;
          ptr++;
          while (ptr < chunkData.length && chunkData[ptr] !== 0) ptr++;
          ptr++;

          if (ptr <= chunkData.length) {
            const rawBody = chunkData.subarray(ptr);
            if (compressionFlag === 1) {
              const decompressed = await inflateBytes(rawBody);
              rawChunks[keyword] = decoder.decode(decompressed);
            } else {
              rawChunks[keyword] = decoder.decode(rawBody);
            }
          }
        }
      } else if (type === 'eXIf') {
        // PNG EXIF chunk
        const exifData = uint8.subarray(offset, offset + length);
        parseExifBuffer(exifData, result);
      }
    } catch (chunkErr) {
      console.warn(`Failed to parse PNG chunk ${type}:`, chunkErr);
    }

    offset += length + 4; // length + 4 bytes CRC
  }

  // 优先级 1: Comment (NovelAI 官方主力元数据)
  if (rawChunks.Comment) {
    parseParametersText(rawChunks.Comment, result);
  }

  // 优先级 2: parameters (SD WebUI / Forge / Fooocus)
  if (rawChunks.parameters) {
    parseParametersText(rawChunks.parameters, result);
  }

  // 优先级 3: prompt (ComfyUI / WebUI)
  if (rawChunks.prompt && !result.prompt) {
    parseParametersText(rawChunks.prompt, result);
  }

  // 优先级 4: workflow (ComfyUI Workflow)
  if (rawChunks.workflow && (!result.prompt || !result.hasMetadata)) {
    parseParametersText(rawChunks.workflow, result);
  }

  // 优先级 5: Description
  if (rawChunks.Description && !result.prompt) {
    result.prompt = rawChunks.Description;
    result.hasMetadata = true;
  }

  if (rawChunks.Software) {
    result.software = rawChunks.Software;
  }

  if (rawChunks.Source) {
    if (rawChunks.Source.includes('V4 Curated') || rawChunks.Source.includes('V4 Full')) {
      result.model = 'nai-diffusion-4-full';
    } else if (rawChunks.Source.includes('V5')) {
      result.model = 'nai-diffusion-5-full';
    } else if (rawChunks.Source.includes('V3')) {
      result.model = 'nai-diffusion-3';
    }
  }
}

// 解析 EXIF 缓冲区 (TIFF 格式)
function parseExifBuffer(uint8: Uint8Array, result: ParsedImageMetadata) {
  try {
    let offset = 0;
    // 跳过可能的 Exif\0\0 头部
    if (uint8[0] === 0x45 && uint8[1] === 0x78 && uint8[2] === 0x69 && uint8[3] === 0x66 && uint8[4] === 0 && uint8[5] === 0) {
      offset = 6;
    }

    const tiff = uint8.subarray(offset);
    if (tiff.length < 8) return;

    const isLittle = tiff[0] === 0x49 && tiff[1] === 0x49; // 'II'
    const isBig = tiff[0] === 0x4D && tiff[1] === 0x4D; // 'MM'
    if (!isLittle && !isBig) return;

    const dataView = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const firstIFD = dataView.getUint32(4, isLittle);
    if (firstIFD >= tiff.length) return;

    const decoder = new TextDecoder('utf-8');

    const parseIFD = (ifdOffset: number) => {
      if (ifdOffset + 2 > tiff.length) return;
      const numEntries = dataView.getUint16(ifdOffset, isLittle);
      let ptr = ifdOffset + 2;

      for (let i = 0; i < numEntries; i++) {
        if (ptr + 12 > tiff.length) break;
        const tag = dataView.getUint16(ptr, isLittle);
        const type = dataView.getUint16(ptr + 2, isLittle);
        const count = dataView.getUint32(ptr + 4, isLittle);
        let valOffset = dataView.getUint32(ptr + 8, isLittle);

        // 如果值不超过 4 字节，则直接存在 ptr + 8
        const byteLen = type === 1 || type === 2 || type === 7 ? count : count * 2;
        const actualOffset = byteLen <= 4 ? ptr + 8 : valOffset;

        if (actualOffset + count <= tiff.length) {
          const rawSlice = tiff.subarray(actualOffset, actualOffset + count);

          // 0x9286 = UserComment (SD/NovelAI 常见)
          // 0x010e = ImageDescription
          if (tag === 0x9286 || tag === 0x010e || tag === 0x9c9c) {
            let str = '';
            // 跳过 UNICODE / ASCII 编码头
            if (rawSlice.length > 8 && rawSlice[0] === 0x55 && rawSlice[1] === 0x4e && rawSlice[2] === 0x49) {
              str = decoder.decode(rawSlice.subarray(8));
            } else if (rawSlice.length > 8 && rawSlice[0] === 0x41 && rawSlice[1] === 0x53 && rawSlice[2] === 0x43) {
              str = decoder.decode(rawSlice.subarray(8));
            } else {
              str = decoder.decode(rawSlice);
            }
            str = str.replace(/\0/g, '').trim();
            if (str) {
              parseParametersText(str, result);
            }
          } else if (tag === 0x8769) {
            // Exif IFD Pointer
            parseIFD(valOffset);
          }
        }
        ptr += 12;
      }
    };

    parseIFD(firstIFD);
  } catch (e) {
    console.warn('Parse EXIF failed:', e);
  }
}

// 解析 JPEG 格式 (APP1 EXIF, APP1 XMP, COM)
function parseJpeg(uint8: Uint8Array, result: ParsedImageMetadata) {
  let offset = 2; // 跳过 0xFF 0xD8
  const decoder = new TextDecoder('utf-8');

  while (offset < uint8.length - 4) {
    if (uint8[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = uint8[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break; // SOS / EOI

    const length = (uint8[offset + 2] << 8) | uint8[offset + 3];
    const segmentStart = offset + 4;
    const segmentData = uint8.subarray(segmentStart, segmentStart + length - 2);

    if (marker === 0xe1) {
      // APP1 (Exif or XMP)
      if (segmentData.length > 6 && segmentData[0] === 0x45 && segmentData[1] === 0x78 && segmentData[2] === 0x69 && segmentData[3] === 0x66) {
        parseExifBuffer(segmentData, result);
      } else {
        const text = decoder.decode(segmentData);
        if (text.includes('http://ns.adobe.com/xap/1.0/')) {
          parseXmpText(text, result);
        }
      }
    } else if (marker === 0xfe) {
      // COM (Comment)
      const text = decoder.decode(segmentData).trim();
      if (text) {
        parseParametersText(text, result);
      }
    }

    offset += 2 + length;
  }
}

// 解析 WebP 格式 (RIFF WebP EXIF / XMP)
function parseWebp(uint8: Uint8Array, data: DataView, result: ParsedImageMetadata) {
  if (uint8.length < 12) return;
  let offset = 12;
  const decoder = new TextDecoder('utf-8');

  while (offset < uint8.length - 8) {
    const chunkType = String.fromCharCode(
      uint8[offset], uint8[offset + 1], uint8[offset + 2], uint8[offset + 3]
    );
    const length = data.getUint32(offset + 4, true); // Little endian
    offset += 8;

    const chunkData = uint8.subarray(offset, offset + length);
    if (chunkType === 'EXIF') {
      parseExifBuffer(chunkData, result);
    } else if (chunkType === 'XMP ') {
      const text = decoder.decode(chunkData);
      parseXmpText(text, result);
    }

    offset += length + (length % 2); // 2-byte alignment
  }
}

// 解析 XMP XML 标签
function parseXmpText(xmp: string, result: ParsedImageMetadata) {
  try {
    const descMatch = xmp.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i) ||
                      xmp.match(/dc:description="([^"]+)"/i) ||
                      xmp.match(/<photoshop:Headline>([\s\S]*?)<\/photoshop:Headline>/i) ||
                      xmp.match(/<exif:UserComment>([\s\S]*?)<\/exif:UserComment>/i);
    if (descMatch) {
      const raw = descMatch[1].trim();
      parseParametersText(raw, result);
    }
  } catch (e) {
    console.warn('Parse XMP text failed:', e);
  }
}


class StealthDataReader {
    data: number[]
    index: number
    constructor(data: number[]) { this.data = data; this.index = 0; }
    readBit() { return this.data[this.index++]; }
    readNBits(n: number) {
        let bits: number[] = [];
        for (let i = 0; i < n; i++) bits.push(this.readBit());
        return bits;
    }
    readByte() {
        let byte = 0;
        for (let i = 0; i < 8; i++) byte |= this.readBit() << (7 - i);
        return byte;
    }
    readNBytes(n: number) {
        let bytes: number[] = [];
        for (let i = 0; i < n; i++) bytes.push(this.readByte());
        return bytes;
    }
    readInt32() {
        let bytes = this.readNBytes(4);
        return new DataView(new Uint8Array(bytes).buffer).getInt32(0, false);
    }
}

async function tryExtractStealthPngInfo(arrayBuffer: ArrayBuffer, result: ParsedImageMetadata) {
  if (typeof document === 'undefined') return;
  try {
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    URL.revokeObjectURL(url);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    let lowestData: number[] = [];
    for (let x = 0; x < img.width; x++) {
        for (let y = 0; y < img.height; y++) {
            let index = (y * img.width + x) * 4;
            let a = imageData.data[index + 3];
            lowestData.push(a & 1);
        }
    }

    const reader = new StealthDataReader(lowestData);
    const magicComp = "stealth_pngcomp";
    const readMagic1 = reader.readNBytes(magicComp.length);
    const magicString1 = String.fromCharCode.apply(null, readMagic1);

    if (magicString1 === magicComp) {
        const dataLength = reader.readInt32();
        const gzipData = reader.readNBytes(dataLength / 8);
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([new Uint8Array(gzipData)]).stream().pipeThrough(ds);
        const buffer = await new Response(stream).arrayBuffer();
        const jsonString = new TextDecoder().decode(buffer);
        try { const wrapper = JSON.parse(jsonString); if (wrapper.Comment) { parseParametersText(wrapper.Comment, result); return; } } catch(e){}
        parseParametersText(jsonString, result);
        return;
    }

    const reader2 = new StealthDataReader(lowestData);
    const magicInfo = "stealth_pnginfo";
    const readMagic2 = reader2.readNBytes(magicInfo.length);
    const magicString2 = String.fromCharCode.apply(null, readMagic2);
    if (magicString2 === magicInfo) {
        const dataLength = reader2.readInt32();
        const rawData = reader2.readNBytes(dataLength / 8);
        const jsonString = new TextDecoder().decode(new Uint8Array(rawData));
        try { const wrapper = JSON.parse(jsonString); if (wrapper.Comment) { parseParametersText(wrapper.Comment, result); return; } } catch(e){}
        parseParametersText(jsonString, result);
        return;
    }
  } catch(e) {
    console.warn('Stealth decoding failed:', e);
  }
}

/**
 * 通用多格式图像元数据提取器
 (PNG / JPEG / WebP)
 * 深度兼容 NovelAI (V3/V4/V4.5/V5 多角色坐标)、Stable Diffusion WebUI、ComfyUI、Fooocus、Forge 格式
 */
export async function parsePngMetadata(arrayBuffer: ArrayBuffer): Promise<ParsedImageMetadata> {
  const result: ParsedImageMetadata = { hasMetadata: false };

  try {
    const uint8 = new Uint8Array(arrayBuffer);
    const data = new DataView(arrayBuffer);

    // 1. 判断 PNG (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
    if (
      uint8.length > 8 &&
      uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4e && uint8[3] === 0x47 &&
      uint8[4] === 0x0d && uint8[5] === 0x0a && uint8[6] === 0x1a && uint8[7] === 0x0a
    ) {
      await parsePng(uint8, data, result);
      // 如果标准 PNG 块没有找到元数据，尝试 Stealth PNG Info（像素 Alpha LSB 隐写）
      if (!result.hasMetadata) {
        await tryExtractStealthPngInfo(arrayBuffer, result);
      }
      return result;
    }

    // 2. 判断 JPEG (0xFF 0xD8)
    if (uint8.length > 4 && uint8[0] === 0xff && uint8[1] === 0xd8) {
      parseJpeg(uint8, result);
      return result;
    }

    // 3. 判断 WebP (RIFF .... WEBP)
    if (
      uint8.length > 12 &&
      uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46 &&
      uint8[8] === 0x57 && uint8[9] === 0x45 && uint8[10] === 0x42 && uint8[11] === 0x50
    ) {
      parseWebp(uint8, data, result);
      return result;
    }

    // 4. 兜底扫描：直接全文正则探测 Comment / parameters / Prompt 文本
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const textPreview = decoder.decode(uint8.subarray(0, Math.min(uint8.length, 65536)));
    if (textPreview.includes('prompt') || textPreview.includes('Steps:') || textPreview.includes('NovelAI')) {
      parseParametersText(textPreview, result);
    }

    // 5. 终极兜底：如果常规方法完全没有提取到元数据，且是 PNG，尝试读取 Stealth PNG Info
    if (!result.hasMetadata && uint8[0] === 0x89 && uint8[1] === 0x50) {
      await tryExtractStealthPngInfo(arrayBuffer, result);
    }
  } catch (e) {
    console.warn('Universal Image metadata extraction failed:', e);
  }

  return result;
}
