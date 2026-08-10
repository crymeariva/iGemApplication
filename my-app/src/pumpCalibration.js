/** File for pump units. */

export const PERI_STEPS_PER_ROTATION = 200;
export const SYRINGE_STEPS_PER_ML = 630; // still verify on hardware

export function periRotationsToSteps(rotations) {
  const n = Number(rotations);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * PERI_STEPS_PER_ROTATION);
}

export function syringeMlToSteps(ml) {
  const n = Number(ml);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * SYRINGE_STEPS_PER_ML);
}
