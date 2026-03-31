/**
 * specgraph — Policy Engine.
 *
 * Evaluates claims against evidence-strength-aware rules per spec state.
 * Produces pass/warn/fail/waived/insufficient-evidence results.
 *
 * @spec SPEC-001
 * @implements src/policy.ts#evaluateSpec
 */
import type {
  Spec, Claim, Waiver, PolicyConfig, PolicyRule,
  PolicyResult, PolicyResultStatus, ObligationKind,
  SpecVerificationResult, Relation,
} from './types.js';
import { EvidenceStrength, DEFAULT_POLICY, evidenceStrengthLabel } from './types.js';

/** Mapping from relations to obligation kinds. */
const RELATION_TO_OBLIGATION: Partial<Record<Relation, ObligationKind>> = {
  IMPLEMENTS: 'implementation',
  VERIFIED_BY: 'verification',
  USES_MODEL: 'models',
  EXPOSES_API: 'apis',
  SATISFIES: 'implementation',
};

/**
 * Evaluate a single spec against its claims and active waivers.
 */
export function evaluateSpec(
  spec: Spec,
  claims: Claim[],
  waivers: Waiver[],
  policy: PolicyConfig = DEFAULT_POLICY,
): SpecVerificationResult {
  const stateRule = policy.states[spec.state];
  if (!stateRule) {
    return {
      specId: spec.id,
      state: spec.state,
      overallResult: 'pass',
      obligations: [],
      waivers,
    };
  }

  const effectiveRule = mergeKindOverrides(stateRule, spec.kind, policy);
  const required = resolveRequirements(spec, effectiveRule);
  const results: PolicyResult[] = [];

  for (const [obligation, requiredStrength] of Object.entries(required) as Array<[ObligationKind, EvidenceStrength]>) {
    if (requiredStrength === undefined) continue;
    const result = evaluateObligation(
      spec.id, obligation, requiredStrength,
      claims, waivers, effectiveRule,
    );
    results.push(result);
  }

  if (effectiveRule.warnMissing) {
    for (const obligation of effectiveRule.warnMissing) {
      if (required[obligation] !== undefined) continue;
      const relevantClaims = findClaimsForObligation(claims, obligation);
      if (relevantClaims.length === 0) {
        results.push({
          specId: spec.id,
          obligation,
          requiredStrength: EvidenceStrength.E0,
          bestFoundStrength: null,
          status: 'warn',
          details: `No ${obligation} claims found (advisory)`,
          supportingClaims: [],
        });
      }
    }
  }

  const overallResult = computeOverallResult(results);

  return {
    specId: spec.id,
    state: spec.state,
    overallResult,
    obligations: results,
    waivers,
  };
}

/**
 * Evaluate all specs.
 */
export function evaluateAll(
  specs: Spec[],
  claimsBySpec: Map<string, Claim[]>,
  waiversBySpec: Map<string, Waiver[]>,
  policy: PolicyConfig = DEFAULT_POLICY,
): SpecVerificationResult[] {
  return specs.map(spec => evaluateSpec(
    spec,
    claimsBySpec.get(spec.id) ?? [],
    waiversBySpec.get(spec.id) ?? [],
    policy,
  ));
}

// ─── Internal ───────────────────────────────────────────────────

function mergeKindOverrides(
  stateRule: PolicyRule,
  specKind: string,
  policy: PolicyConfig,
): PolicyRule {
  const kindOverride = policy.kinds?.[specKind];
  if (!kindOverride) return stateRule;

  return {
    require: { ...stateRule.require, ...kindOverride.require },
    warnMissing: kindOverride.warnMissing ?? stateRule.warnMissing,
    allowWaiverFor: kindOverride.allowWaiverFor ?? stateRule.allowWaiverFor,
  };
}

function resolveRequirements(
  spec: Spec,
  rule: PolicyRule,
): Partial<Record<ObligationKind, EvidenceStrength>> {
  const result: Partial<Record<ObligationKind, EvidenceStrength>> = {};

  if (rule.require) {
    for (const [key, val] of Object.entries(rule.require)) {
      if (val !== undefined) {
        result[key as ObligationKind] = val;
      }
    }
  }

  if (spec.requiredEvidence) {
    for (const [key, val] of Object.entries(spec.requiredEvidence)) {
      if (val !== undefined) {
        result[key as ObligationKind] = val;
      }
    }
  }

  return result;
}

function evaluateObligation(
  specId: string,
  obligation: ObligationKind,
  requiredStrength: EvidenceStrength,
  claims: Claim[],
  waivers: Waiver[],
  rule: PolicyRule,
): PolicyResult {
  const relevantClaims = findClaimsForObligation(claims, obligation);

  if (relevantClaims.length === 0) {
    const waiver = findWaiver(waivers, obligation);
    if (waiver && rule.allowWaiverFor?.includes(obligation)) {
      return {
        specId,
        obligation,
        requiredStrength,
        bestFoundStrength: null,
        status: 'waived',
        details: `Missing ${obligation}: waived by ${waiver.owner} — ${waiver.reason}`,
        supportingClaims: [],
        waiverId: waiver.id,
      };
    }

    return {
      specId,
      obligation,
      requiredStrength,
      bestFoundStrength: null,
      status: 'fail',
      details: `No ${obligation} claims found. Required: ${evidenceStrengthLabel(requiredStrength)}`,
      supportingClaims: [],
    };
  }

  const bestStrength = Math.max(...relevantClaims.map(c => c.strength)) as EvidenceStrength;
  const supportingClaims = relevantClaims.map(c => c.id);

  if (bestStrength >= requiredStrength) {
    return {
      specId,
      obligation,
      requiredStrength,
      bestFoundStrength: bestStrength,
      status: 'pass',
      details: `${obligation}: ${evidenceStrengthLabel(bestStrength)} meets required ${evidenceStrengthLabel(requiredStrength)}`,
      supportingClaims,
    };
  }

  const waiver = findWaiver(waivers, obligation);
  if (waiver && rule.allowWaiverFor?.includes(obligation)) {
    return {
      specId,
      obligation,
      requiredStrength,
      bestFoundStrength: bestStrength,
      status: 'waived',
      details: `${obligation}: ${evidenceStrengthLabel(bestStrength)} below required ${evidenceStrengthLabel(requiredStrength)}, waived by ${waiver.owner}`,
      supportingClaims,
      waiverId: waiver.id,
    };
  }

  return {
    specId,
    obligation,
    requiredStrength,
    bestFoundStrength: bestStrength,
    status: 'insufficient-evidence',
    details: `${obligation}: found ${evidenceStrengthLabel(bestStrength)} but required ${evidenceStrengthLabel(requiredStrength)}`,
    supportingClaims,
  };
}

function findClaimsForObligation(claims: Claim[], obligation: ObligationKind): Claim[] {
  const matchingRelations: Relation[] = [];
  for (const [relation, obl] of Object.entries(RELATION_TO_OBLIGATION)) {
    if (obl === obligation) matchingRelations.push(relation as Relation);
  }
  return claims.filter(c => matchingRelations.includes(c.relation));
}

function findWaiver(waivers: Waiver[], obligation: ObligationKind): Waiver | undefined {
  const now = new Date().toISOString();
  return waivers.find(w =>
    w.kind === `missing-${obligation}` &&
    !w.revokedAt &&
    w.expires > now,
  );
}

function computeOverallResult(results: PolicyResult[]): PolicyResultStatus {
  if (results.length === 0) return 'pass';

  const statuses = results.map(r => r.status);
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('insufficient-evidence')) return 'insufficient-evidence';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.every(s => s === 'waived')) return 'waived';
  return 'pass';
}
