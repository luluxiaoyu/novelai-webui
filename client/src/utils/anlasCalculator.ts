export function calculateBaseAnlasCost(
  width: number,
  height: number,
  steps: number,
  sm: boolean,
  sm_dyn: boolean,
  model?: string,
  strength?: number
): number {
  const r = width * height;
  const safeR = Math.max(r, 65536);

  let smea_factor = 1.0;
  if (sm) {
    smea_factor = sm_dyn ? 1.4 : 1.2;
  }

  let cost = Math.ceil(2951823174884865e-21 * safeR + 5.753298233447344e-7 * safeR * steps) * smea_factor;

  // NovelAI Diffusion V5 系列模型按 1.5 倍倍率计费
  const isV5 = model ? (model.includes('diffusion-5') || model.includes('v5') || model.startsWith('nai-diffusion-5')) : false;
  if (isV5) {
    cost *= 1.5;
  }

  if (strength !== undefined && strength !== null && strength < 1) {
    cost *= strength;
  }

  return Math.max(Math.ceil(cost), 2);
}
