/**
 * TerminologyProvider — validates {{term}} references in spec docs.
 *
 * Finds specs with kind matching 'DOMAINTREE' and extracts their defined terms.
 * For all other specs, scans for {{term}} patterns and flags unknown terms.
 */
import { createHash } from 'node:crypto';
import type { Provider, ScanContext, ScanResult, Claim, Evidence } from '../types.js';
import { EvidenceStrength, makeSubjectId } from '../types.js';
import { loadSpecs } from '../spec-parser.js';

const TERM_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;
const DOMAINTREE_KINDS = new Set(['DOMAINTREE', 'domain-tree', 'domaintree']);

export class TerminologyProvider implements Provider {
  readonly name = 'terminology';
  readonly description = 'Validates {{term}} references against DOMAINTREE spec definitions';

  supports(): string[] {
    return ['term'];
  }

  strengthFor(): EvidenceStrength {
    return EvidenceStrength.E0;
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

    // Extract defined terms from DOMAINTREE specs
    const definedTerms = new Set<string>();
    const domainTreeSpecs = specs.filter(s => DOMAINTREE_KINDS.has(s.kind));

    if (domainTreeSpecs.length === 0) {
      // No DOMAINTREE specs — can't validate terminology, skip
      return { subjects: [], claims: [], evidence: [] };
    }

    for (const spec of domainTreeSpecs) {
      const raw = spec as unknown as Record<string, unknown>;
      const terms = raw.terms ?? raw.metadata?.['terms' as keyof typeof raw.metadata];
      if (Array.isArray(terms)) {
        for (const t of terms) {
          if (typeof t === 'string') definedTerms.add(t.toLowerCase());
        }
      }
      if (spec.title) definedTerms.add(spec.title.toLowerCase());
    }

    // Scan non-DOMAINTREE specs for {{term}} references
    for (const spec of specs) {
      if (DOMAINTREE_KINDS.has(spec.kind)) continue;

      const textToScan = [
        spec.title ?? '',
        spec.description ?? '',
      ].join(' ');

      const matches = [...textToScan.matchAll(TERM_REGEX)];

      for (const match of matches) {
        const term = match[1].trim();
        const termKey = term.toLowerCase();

        if (definedTerms.has(termKey)) continue;

        const dst = makeSubjectId('term', 'terminology', term);
        const id = createHash('sha256')
          .update(`${spec.id}\0REFERENCES\0term:terminology:${term}\0terminology`)
          .digest('hex')
          .slice(0, 32);

        claims.push({
          id,
          src: spec.id,
          relation: 'REFERENCES',
          dst: dst as string,
          provider: 'terminology',
          strength: EvidenceStrength.E0,
          provenance: { file: spec.sourcePath, detail: `{{${term}}} not defined in any DOMAINTREE spec` },
          timestamp: now,
        });

        evidence.push({
          id: `${id}:undefined`,
          claimId: id,
          kind: 'undefined_term',
          detail: `Term "{{${term}}}" used in "${spec.id}" but not defined in any DOMAINTREE spec`,
          capturedAt: now,
        });
      }
    }

    return { subjects: [], claims, evidence };
  }
}
