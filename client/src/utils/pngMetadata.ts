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
  rawComment?: any;
}

export function parsePngMetadata(arrayBuffer: ArrayBuffer): ParsedImageMetadata {
  const result: ParsedImageMetadata = { hasMetadata: false };

  try {
    const data = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);

    // 检查 PNG 魔数
    if (
      uint8[0] !== 0x89 || uint8[1] !== 0x50 || uint8[2] !== 0x4e || uint8[3] !== 0x47 ||
      uint8[4] !== 0x0d || uint8[5] !== 0x0a || uint8[6] !== 0x1a || uint8[7] !== 0x0a
    ) {
      return result;
    }

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

      if (type === 'tEXt') {
        const chunkData = uint8.subarray(offset, offset + length);
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx !== -1) {
          const keyword = latin1Decoder.decode(chunkData.subarray(0, nullIdx));
          const text = decoder.decode(chunkData.subarray(nullIdx + 1));
          rawChunks[keyword] = text;
        }
      } else if (type === 'iTXt') {
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
          
          if (compressionFlag === 0 && ptr <= chunkData.length) {
            const text = decoder.decode(chunkData.subarray(ptr));
            rawChunks[keyword] = text;
          }
        }
      }

      offset += length + 4;
    }

    let parsedComment: any = null;
    if (rawChunks.Comment) {
      try {
        parsedComment = JSON.parse(rawChunks.Comment);
      } catch {}
    }

    if (parsedComment) {
      result.hasMetadata = true;
      result.rawComment = parsedComment;
      result.prompt = parsedComment.prompt || rawChunks.Description || parsedComment.v4_prompt?.caption?.base_caption || '';
      result.negative_prompt = parsedComment.uc || parsedComment.negative_prompt || parsedComment.v4_negative_prompt?.caption?.base_caption || '';
      result.steps = parsedComment.steps;
      result.scale = parsedComment.scale;
      result.seed = parsedComment.seed;
      result.sampler = parsedComment.sampler;
      result.width = parsedComment.width;
      result.height = parsedComment.height;
      result.noise_schedule = parsedComment.noise_schedule;
      result.cfg_rescale = parsedComment.cfg_rescale;
      result.uncond_scale = parsedComment.uncond_scale;
      result.skip_cfg_above_sigma = parsedComment.skip_cfg_above_sigma;

      if (rawChunks.Source) {
        if (rawChunks.Source.includes('V4 Curated') || rawChunks.Source.includes('V4 Full')) {
          result.model = 'nai-diffusion-4-full';
        } else if (rawChunks.Source.includes('V5')) {
          result.model = 'nai-diffusion-5-full';
        } else if (rawChunks.Source.includes('V3')) {
          result.model = 'nai-diffusion-3';
        }
      }
    } else if (rawChunks.Description || rawChunks.prompt) {
      result.hasMetadata = true;
      result.prompt = rawChunks.Description || rawChunks.prompt;
    }
  } catch (e) {
    console.warn('Parse PNG metadata failed:', e);
  }

  return result;
}
