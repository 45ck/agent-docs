/**
 * SpecGraph v2 — Verify orchestrator.
 *
 * Runs providers, stores results, evaluates policy, and produces
 * verification output. This is the core pipeline that `specgraph verify`
 * and `specgraph explain` consume.
 */
import type {
  Spec, Claim, Provider, RunSummary,
  SpecVerificationResult, PolicyConfig,
} from './types.js';
import { DEFAULT_POLICY } from './types.js';
import type { SpecGraphStore } from './store.js';
import { loadSpecs } from './spec-parser.js';
import { evaluateSpec } from './policy.js';
import { AnnotationProvider } from './providers/annotation.js';
import { FileProvider } from './providers/file.js';

export interface VerifyOptions {
  root: string;
  store: SpecGraphStore;
  specId?: string;
  changedFiles?: string[];
  trigger?: string;
  policy?: PolicyConfig;
}

export interface VerifyResult {
  runId: string;
  results: SpecVerificationResult[];
  summary: RunSummary;
}

/**
 * Run the full verification pipeline.
 */
export async function verify(options: VerifyOptions): Promise<VerifyResult> {
  const { root, store, specId, changedFiles, trigger = 'cli:verify' } = options;
  const policy = options.policy ?? DEFAULT_POLICY;
  const startTime = Date.now();

  // 1. Start a run
  const runId = store.startRun(trigger);

  try {
    // 2. Load specs
    let specs = loadSpecs(root);
    if (specId) {
      specs = specs.filter(s => s.id === specId);
    }

    // 3. Store specs
    store.transaction(() => {
      for (const spec of specs) {
        store.upsertSpec(spec);
        // Store inline waivers
        if (spec.waivers) {
          for (const w of spec.waivers) {
            store.insertWaiver(spec.id, w);
          }
        }
      }
    });

    // 4. Run providers
    const providers: Provider[] = [
      new AnnotationProvider(),
      new FileProvider(),
    ];

    const ctx = { root, runId, changedFiles };

    for (const provider of providers) {
      // Supersede old claims from this provider
      store.supersedeClaimsForProvider(provider.name);

      // Scan
      const scanResult = await provider.scan(ctx);

      store.transaction(() => {
        // Store subjects
        for (const subject of scanResult.subjects) {
          store.upsertSubject(subject);
        }
        // Store claims
        for (const claim of scanResult.claims) {
          store.insertClaim(claim);
        }
        // Store evidence
        for (const ev of scanResult.evidence) {
          store.insertEvidence(ev);
        }
      });

      // Run validation on claims (e.g., file provider checks file existence)
      if (provider.validate) {
        const supportedKinds = provider.supports();
        const allClaims = store.getAllActiveClaims();
        for (const claim of allClaims) {
          // Only validate claims whose dst subject kind is supported by this provider
          const dstKind = claim.dst.split(':')[0];
          if (!supportedKinds.includes(dstKind)) continue;

          try {
            const newEvidence = await provider.validate(claim, ctx);
            if (newEvidence.length > 0) {
              store.transaction(() => {
                for (const ev of newEvidence) {
                  store.insertEvidence(ev);
                }
              });

              // Upgrade claim strength if file provider found evidence
              const maxEvStrength = Math.max(...newEvidence.map(e => {
                if (e.kind === 'file_exists') return 1; // E1
                return 0;
              }));
              if (maxEvStrength > claim.strength) {
                // Re-insert with upgraded strength
                store.insertClaim({ ...claim, strength: maxEvStrength });
              }
            }
          } catch (err) {
            console.error(`Warning: validate failed for claim ${claim.id} with provider ${provider.name}: ${(err as Error).message}`);
          }
        }
      }
    }

    // 5. Evaluate policy
    const results: SpecVerificationResult[] = [];
    let passed = 0, warned = 0, failed = 0, waived = 0, insufficient = 0;

    for (const spec of specs) {
      const claims = store.getActiveClaimsForSpec(spec.id);
      const waivers = store.getActiveWaiversForSpec(spec.id);
      const result = evaluateSpec(spec, claims, waivers, policy);

      // Store policy results
      store.transaction(() => {
        for (const obligation of result.obligations) {
          store.insertPolicyResult(runId, obligation);
        }
      });

      results.push(result);

      switch (result.overallResult) {
        case 'pass': passed++; break;
        case 'warn': warned++; break;
        case 'fail': failed++; break;
        case 'waived': waived++; break;
        case 'insufficient-evidence': insufficient++; break;
      }
    }

    // 6. Finish run
    const summary: RunSummary = {
      specsScanned: specs.length,
      claimsEmitted: store.getAllActiveClaims().length,
      passed,
      warned,
      failed,
      waived,
      insufficientEvidence: insufficient,
      durationMs: Date.now() - startTime,
    };

    const runStatus = failed > 0 || insufficient > 0 ? 'failed' : 'passed';
    store.finishRun(runId, runStatus, summary);

    return { runId, results, summary };
  } catch (err) {
    store.finishRun(runId, 'error', {
      specsScanned: 0, claimsEmitted: 0,
      passed: 0, warned: 0, failed: 0, waived: 0, insufficientEvidence: 0,
      durationMs: Date.now() - startTime,
    });
    throw err;
  }
}
