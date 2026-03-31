/**
 * FreshnessProvider — checks that generated outputs are up-to-date.
 *
 * For each entry in generated_outputs, reads the source file and computes
 * its current SHA-256 hash. If it matches the stored hash, strength=E2
 * (fresh). If stale, strength=E0.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Provider, ScanContext, ScanResult, Claim, Evidence } from '../types.js';
import { EvidenceStrength, makeSubjectId } from '../types.js';
import { openStore } from '../store.js';

export class FreshnessProvider implements Provider {
  readonly name = 'freshness';
  readonly description = 'Checks generated outputs are up-to-date with source specs';

  supports(): string[] {
    return ['file'];
  }

  strengthFor(): EvidenceStrength {
    return EvidenceStrength.E2;
  }

  async scan(ctx: ScanContext): Promise<ScanResult> {
    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    let store;
    try {
      store = openStore(ctx.root);
    } catch {
      return { subjects: [], claims: [], evidence: [] };
    }

    let outputs;
    try {
      outputs = store.listGeneratedOutputs();
    } finally {
      store.close();
    }

    if (outputs.length === 0) {
      return { subjects: [], claims: [], evidence: [] };
    }

    for (const entry of outputs) {
      const absSourcePath = path.isAbsolute(entry.sourcePath)
        ? entry.sourcePath
        : path.join(ctx.root, entry.sourcePath);

      let currentHash: string;
      try {
        const content = readFileSync(absSourcePath, 'utf8');
        currentHash = createHash('sha256').update(content).digest('hex');
      } catch {
        continue;
      }

      const isFresh = currentHash === entry.sourceHash;
      const strength = isFresh ? EvidenceStrength.E2 : EvidenceStrength.E0;
      const dst = makeSubjectId('file', 'freshness', entry.outputPath);
      const claimId = `freshness:${entry.id}`;

      claims.push({
        id: claimId,
        src: entry.specId || 'unknown',
        relation: 'SATISFIES',
        dst: dst as string,
        provider: 'freshness',
        strength,
        provenance: {
          file: entry.sourcePath,
          detail: isFresh
            ? `Generated output is fresh: ${entry.outputPath}`
            : `Generated output is STALE: ${entry.outputPath} (source changed)`,
        },
        timestamp: now,
      });

      evidence.push({
        id: `${claimId}:check`,
        claimId,
        kind: isFresh ? 'output_fresh' : 'output_stale',
        detail: isFresh
          ? `${entry.outputPath} matches source hash ${currentHash.slice(0, 8)}…`
          : `${entry.outputPath} is stale — source hash changed`,
        raw: { storedHash: entry.sourceHash, currentHash, fresh: isFresh },
        capturedAt: now,
      });
    }

    return { subjects: [], claims, evidence };
  }
}
