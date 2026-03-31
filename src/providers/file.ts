/**
 * File Provider — validates file existence for claims.
 *
 * Upgrades annotation-level E0 claims to E1 (structural) when the
 * referenced file actually exists on disk.
 */
import { statSync } from 'node:fs';
import path from 'node:path';
import type { Provider, ScanContext, ScanResult, Claim, Evidence } from '../types.js';
import { EvidenceStrength, parseSubjectId } from '../types.js';
import { uuid } from '../id.js';

export class FileProvider implements Provider {
  readonly name = 'file';
  readonly description = 'Validates file existence and upgrades evidence to E1';

  supports(): string[] {
    return ['file', 'symbol', 'test'];
  }

  strengthFor(): EvidenceStrength {
    return EvidenceStrength.E1;
  }

  async scan(): Promise<ScanResult> {
    return { subjects: [], claims: [], evidence: [] };
  }

  async validate(claim: Claim, ctx: ScanContext): Promise<Evidence[]> {
    const filePath = extractFilePath(claim.dst);
    if (!filePath) return [];

    const absPath = path.join(ctx.root, filePath);
    const now = new Date().toISOString();

    try {
      const stat = statSync(absPath, { throwIfNoEntry: false });
      if (stat && stat.isFile()) {
        return [{
          id: uuid(),
          claimId: claim.id,
          kind: 'file_exists',
          detail: `File exists: ${filePath} (${stat.size} bytes)`,
          raw: { path: filePath, size: stat.size, mtime: stat.mtime.toISOString() },
          capturedAt: now,
        }];
      }
    } catch {
      // File doesn't exist or can't be accessed
    }

    return [];
  }
}

function extractFilePath(subjectIdOrRaw: string): string | null {
  try {
    const parsed = parseSubjectId(subjectIdOrRaw);
    const identity = parsed.identity;
    const hashIdx = identity.indexOf('#');
    return hashIdx >= 0 ? identity.slice(0, hashIdx) : identity;
  } catch {
    const hashIdx = subjectIdOrRaw.indexOf('#');
    const candidate = hashIdx >= 0 ? subjectIdOrRaw.slice(0, hashIdx) : subjectIdOrRaw;
    if (candidate.includes('/') || candidate.includes('.')) {
      return candidate;
    }
    return null;
  }
}
