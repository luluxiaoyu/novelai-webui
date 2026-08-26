export function calculateBaseAnlasCost(
  width: number,
  height: number,
  steps: number,
  sm: boolean,
  sm_dyn: boolean
): number {
  const r = width * height;
  const safeR = Math.max(r, 65536);

  let smea_factor = 1.0;
  if (sm) {
    smea_factor = sm_dyn ? 1.4 : 1.2;
  }

  const per_sample = Math.ceil(2951823174884865e-21 * safeR + 5.753298233447344e-7 * safeR * steps) * smea_factor;
  
  return Math.max(Math.ceil(per_sample), 2);
}
