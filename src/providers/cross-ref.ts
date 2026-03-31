/**
 * CrossRefProvider — validates spec dependsOn/conflictsWith cross-references.
 *
 * Emits DEPENDS_ON and CONFLICTS_WITH claims for inter-spec references.
 * Strength E1 when target spec exists, E0 when target is missing (broken ref).
 */
import { createHash } from 'node:crypto';
import type { Provider, ScanContext, ScanResult, Claim, Evidence } from '../types.js';
import { EvidenceStrength, makeSubjectId } from '../types.js';
import { loadSpecs } from '../spec-parser.js';

export class CrossRefProvider implements Provider {
  readonly name = 'cross-ref';
  readonly description = 'Validates dependsOn/conflictsWith references between specs';

  supports(): string[] {
    return ['spec'];
  }

  strengthFor(): EvidenceStrength {
    return EvidenceStrength.E1;
  }

  async scan(ctx: ScanContext): Promise<ScanResult> {
    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    let specs;
    try {
      specs = loadSpecs(ctx.root);
    } catch {
      return { subjects: [], claims: [], evidence: [] };
    }

    const knownIds = new Set(specs.map(s => s.id));

    for (const spec of specs) {
      // dependsOn references
      for (const targetId of (spec.dependsOn ?? [])) {
        const dst = makeSubjectId('spec', 'specgraph', targetId);
        const exists = knownIds.has(targetId);
        const strength = exists ? EvidenceStrength.E1 : EvidenceStrength.E0;
        const id = deterministicId(spec.id, 'DEPENDS_ON', targetId);

        claims.push({
          id,
          src: spec.id,
          relation: 'DEPENDS_ON',
          dst: dst as string,
          provider: 'cross-ref',
          strength,
          provenance: { file: spec.sourcePath, detail: `dependsOn: ${targetId}` },
          timestamp: now,
        });

        if (!exists) {
          evidence.push({
            id: `${id}:missing`,
            claimId: id,
            kind: 'broken_ref',
            detail: `Spec "${spec.id}" depends on "${targetId}" but that spec does not exist`,
            capturedAt: now,
          });
        }
      }

      // conflictsWith references
      for (const targetId of (spec.conflictsWith ?? [])) {
        const dst = makeSubjectId('spec', 'specgraph', targetId);
        const exists = knownIds.has(targetId);
        const strength = exists ? EvidenceStrength.E1 : EvidenceStrength.E0;
        const id = deterministicId(spec.id, 'CONFLICTS_WITH', targetId);

        claims.push({
          id,
          src: spec.id,
          relation: 'CONFLICTS_WITH',
          dst: dst as string,
          provider: 'cross-ref',
          strength,
          provenance: { file: spec.sourcePath, detail: `conflictsWith: ${targetId}` },
          timestamp: now,
        });

        if (!exists) {
          evidence.push({
            id: `${id}:missing`,
            claimId: id,
            kind: 'broken_ref',
            detail: `Spec "${spec.id}" conflicts with "${targetId}" but that spec does not exist`,
            capturedAt: now,
          });
        }
      }
    }

    return { subjects: [], claims, evidence };
  }
}

function deterministicId(src: string, relation: string, dst: string): string {
  return createHash('sha256')
    .update(`${src}\0${relation}\0${dst}\0cross-ref`)
    .digest('hex')
    .slice(0, 32);
}

