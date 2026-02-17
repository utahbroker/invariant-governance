/**
 * Invariant Governance — Ed25519 Digital Signatures
 *
 * Asymmetric key pair generation, signing, and verification using
 * Node.js crypto module. The Governance Kernel (100) holds the private
 * key and signs Approval Receipts (106) and Fluidity Tokens (104).
 * The Execution Gate (200) holds only the public key and can verify
 * but NEVER sign — enforcing structural separation.
 */

import { generateKeyPairSync, sign, verify, createPublicKey } from 'node:crypto';

/** Key pair for Ed25519 signing */
export interface KeyPair {
  /** Base64-encoded Ed25519 private key (DER format) */
  privateKey: string;
  /** Base64-encoded Ed25519 public key (DER format) */
  publicKey: string;
}

/**
 * Generate an Ed25519 key pair.
 * The private key MUST remain in the Authority Plane (Governance Kernel).
 * Only the public key crosses the Sovereign Boundary (15).
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  return {
    privateKey: Buffer.from(privateKey).toString('base64'),
    publicKey: Buffer.from(publicKey).toString('base64'),
  };
}

/**
 * Sign data with an Ed25519 private key.
 * Used by the Governance Kernel to sign Approval Receipts and Fluidity Tokens.
 *
 * @param data - The string data to sign
 * @param privateKeyBase64 - Base64-encoded Ed25519 private key (DER/PKCS8)
 * @returns Base64-encoded signature
 */
export function signData(data: string, privateKeyBase64: string): string {
  const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');
  const keyObject = {
    key: privateKeyDer,
    format: 'der' as const,
    type: 'pkcs8' as const,
  };

  const signature = sign(null, Buffer.from(data, 'utf8'), keyObject);
  return signature.toString('base64');
}

/**
 * Verify an Ed25519 signature with a public key.
 * Used by the Execution Gate to verify receipts without access to the private key.
 *
 * @param data - The original string data that was signed
 * @param signatureBase64 - Base64-encoded signature to verify
 * @param publicKeyBase64 - Base64-encoded Ed25519 public key (DER/SPKI)
 * @returns true if the signature is valid
 */
export function verifySignature(
  data: string,
  signatureBase64: string,
  publicKeyBase64: string,
): boolean {
  try {
    const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
    const keyObject = createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    });

    const signature = Buffer.from(signatureBase64, 'base64');
    return verify(null, Buffer.from(data, 'utf8'), keyObject, signature);
  } catch {
    return false;
  }
}
