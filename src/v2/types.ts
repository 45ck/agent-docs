/**
 * Re-export shim — all types now live in src/types.ts.
 *
 * This file exists so that existing imports of '../../v2/types.js' or './types.js'
 * within the v2 engine continue to work without modification during the migration
 * to the flattened directory structure.
 */
export * from '../types.js';
