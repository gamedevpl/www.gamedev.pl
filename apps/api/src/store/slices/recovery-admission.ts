export interface RecoveryAdmission {
  nonce: string;
  until: number;
}

export function permitsRecoveryClaim(admission: RecoveryAdmission | undefined, nonce?: string): boolean {
  if (nonce !== undefined) return admission?.nonce === nonce && admission.until > Date.now();
  return !admission || admission.until <= Date.now();
}
