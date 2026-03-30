/**
 * Deterministic ID generation for claims and other entities.
 */
import { createHash, randomUUID } from 'node:crypto';

/** Generate a deterministic claim ID from its components. */
export function claimId(src: string, relation: string, dst: string, provider: string): string {
  return createHash('sha256')
    .update(`${src}\0${relation}\0${dst}\0${provider}`)
    .digest('hex')
    .slice(0, 32);
}

/** Generate a random UUID for entities that don't need deterministic IDs. */
export function uuid(): string {
  return randomUUID();
}
