/**
 * SpecGraph v2 — CLI command implementations.
 */
import path from 'node:path';
import type { Command } from 'commander';
import { openStore } from './store.js';
import { verify } from './verify.js';
import { evidenceStrengthLabel } from './types.js';
import type { SpecVerificationResult, PolicyResultStatus, RunSummary } from './types.js';

export function registerV2Commands(program: Command): void {
  // ── specgraph verify ────────────────────────────────────────
  program
    .command('verify')
    .description('Run SpecGraph v2 verification: collect claims, evaluate policy')
    .argument('[root]', 'Project root', process.cwd())
    .option('--spec <id>', 'Verify a single spec by ID')
    .option('--changed', 'Only verify specs touched by changed files')
    .option('--strict', 'Treat warnings as errors')
    .option('--json', 'Output results as JSON')
    .action(async (root: string, opts: { spec?: string; changed?: boolean; strict?: boolean; json?: boolean }) => {
      const resolvedRoot = path.resolve(root);
      const store = openStore(resolvedRoot);

      try {
        const result = await verify({
          root: resolvedRoot,
          store,
          specId: opts.spec,
          trigger: opts.changed ? 'cli:verify:changed' : opts.spec ? 'cli:verify:spec' : 'cli:verify',
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printVerifySummary(result.results, result.summary, opts.strict ?? false);
        }

        const hasFailures = result.results.some(r =>
          r.overallResult === 'fail' || r.overallResult === 'insufficient-evidence',
        );
        const hasWarnings = result.results.some(r => r.overallResult === 'warn');

        if (hasFailures || (opts.strict && hasWarnings)) {
          process.exit(1);
        }
      } finally {
        store.close();
      }
    });

  // ── specgraph explain ───────────────────────────────────────
  program
    .command('explain <spec-id>')
    .description('Explain why a spec passed or failed')
    .argument('[root]', 'Project root', process.cwd())
    .option('--run <run-id>', 'Explain a specific run instead of latest')
    .option('--json', 'Output as JSON')
    .action(async (specId: string, root: string, opts: { run?: string; json?: boolean }) => {
      const resolvedRoot = path.resolve(root);
      const store = openStore(resolvedRoot);

      try {
        const runId = opts.run ?? store.getLatestRunId();
        if (!runId) {
          console.error('No verification runs found. Run `specgraph verify` first.');
          process.exit(1);
        }

        const spec = store.getSpec(specId);
        if (!spec) {
          console.error(`Spec "${specId}" not found.`);
          process.exit(1);
        }

        const results = store.getExplainResults(runId, specId);
        const waivers = store.getActiveWaiversForSpec(specId);
        const claims = store.getActiveClaimsForSpec(specId);

        if (opts.json) {
          console.log(JSON.stringify({
            spec: specId,
            state: spec.state,
            result: computeOverall(results.map(r => r.status)),
            obligations: results,
            claims: claims.length,
            waivers: waivers.length,
          }, null, 2));
        } else {
          printExplain(specId, spec.state, spec.title, results, claims, waivers);
        }
      } finally {
        store.close();
      }
    });

  // ── specgraph find ──────────────────────────────────────────
  program
    .command('find <query>')
    .description('Search specs by ID, title, kind, or status')
    .argument('[root]', 'Project root', process.cwd())
    .option('--json', 'Output as JSON')
    .action(async (query: string, root: string, opts: { json?: boolean }) => {
      const resolvedRoot = path.resolve(root);
      const store = openStore(resolvedRoot);

      try {
        const allSpecs = store.getAllSpecs();
        const q = query.toLowerCase();
        const matches = allSpecs.filter(s =>
          s.id.toLowerCase().includes(q) ||
          s.title.toLowerCase().includes(q) ||
          s.kind.toLowerCase().includes(q) ||
          s.state.toLowerCase().includes(q),
        );

        if (opts.json) {
          console.log(JSON.stringify(matches, null, 2));
        } else if (matches.length === 0) {
          console.log(`No specs matching "${query}"`);
        } else {
          for (const s of matches) {
            console.log(`  ${s.id}  [${s.state}]  ${s.title}  (${s.kind})`);
          }
          console.log(`\n${matches.length} spec(s) found.`);
        }
      } finally {
        store.close();
      }
    });

  // ── specgraph waivers ───────────────────────────────────────
  program
    .command('waivers')
    .description('List active waivers')
    .argument('[root]', 'Project root', process.cwd())
    .option('--json', 'Output as JSON')
    .action(async (root: string, opts: { json?: boolean }) => {
      const resolvedRoot = path.resolve(root);
      const store = openStore(resolvedRoot);

      try {
        const waivers = store.getAllActiveWaivers();

        if (opts.json) {
          console.log(JSON.stringify(waivers, null, 2));
        } else if (waivers.length === 0) {
          console.log('No active waivers.');
        } else {
          for (const w of waivers) {
            console.log(`  ${w.specId}  ${w.kind}  owner:${w.owner}  expires:${w.expires}`);
            console.log(`    reason: ${w.reason}`);
            if (w.issueRef) console.log(`    issue: ${w.issueRef}`);
          }
          console.log(`\n${waivers.length} active waiver(s).`);
        }
      } finally {
        store.close();
      }
    });

  // ── specgraph subject ───────────────────────────────────────
  program
    .command('subject <subject-id>')
    .description('Show all claims and specs related to a subject')
    .argument('[root]', 'Project root', process.cwd())
    .option('--json', 'Output as JSON')
    .action(async (subjectId: string, root: string, opts: { json?: boolean }) => {
      const resolvedRoot = path.resolve(root);
      const store = openStore(resolvedRoot);

      try {
        const allClaims = store.getAllActiveClaims();
        const relatedClaims = allClaims.filter(c => c.src === subjectId || c.dst === subjectId);

        if (opts.json) {
          console.log(JSON.stringify(relatedClaims, null, 2));
        } else if (relatedClaims.length === 0) {
          console.log(`No claims reference subject "${subjectId}"`);
        } else {
          for (const c of relatedClaims) {
            const dir = c.src === subjectId ? '->' : '<-';
            const other = c.src === subjectId ? c.dst : c.src;
            console.log(`  ${c.relation} ${dir} ${other}  [${evidenceStrengthLabel(c.strength)}]  via ${c.provider}`);
          }
          console.log(`\n${relatedClaims.length} claim(s).`);
        }
      } finally {
        store.close();
      }
    });
}

// ─── Output Formatting ──────────────────────────────────────────

function printVerifySummary(results: SpecVerificationResult[], summary: RunSummary, strict: boolean): void {
  const icon = (status: PolicyResultStatus) => {
    switch (status) {
      case 'pass': return 'PASS';
      case 'warn': return 'WARN';
      case 'fail': return 'FAIL';
      case 'waived': return 'WAIVED';
      case 'insufficient-evidence': return 'INSUFFICIENT';
    }
  };

  if (results.length === 0) {
    console.log('No specs found in /specs/ directory.');
    return;
  }

  console.log('');
  for (const r of results) {
    const status = icon(r.overallResult);
    console.log(`  ${status}  ${r.specId}  [${r.state}]`);

    const failures = r.obligations.filter(o => o.status !== 'pass');
    for (const f of failures) {
      console.log(`         ${f.status}: ${f.details}`);
    }
  }

  console.log('');
  console.log(`Specs: ${summary.specsScanned}  Claims: ${summary.claimsEmitted}  Duration: ${summary.durationMs}ms`);
  console.log(`Pass: ${summary.passed}  Warn: ${summary.warned}  Fail: ${summary.failed}  Waived: ${summary.waived}  Insufficient: ${summary.insufficientEvidence}`);

  if (summary.failed > 0 || summary.insufficientEvidence > 0) {
    console.log('\nVerification FAILED.');
  } else if (summary.warned > 0) {
    console.log(strict ? '\nVerification FAILED (strict mode, warnings treated as errors).' : '\nVerification passed with warnings.');
  } else {
    console.log('\nVerification PASSED.');
  }
}

function printExplain(
  specId: string, state: string, title: string,
  results: import('./types.js').PolicyResult[],
  claims: import('./types.js').Claim[],
  waivers: import('./types.js').Waiver[],
): void {
  const overall = computeOverall(results.map(r => r.status));

  console.log('');
  console.log(`SPEC: ${specId}`);
  console.log(`Title: ${title}`);
  console.log(`State: ${state}`);
  console.log(`Result: ${overall.toUpperCase()}`);
  console.log('');

  if (results.length === 0) {
    console.log('  No policy obligations for this spec state.');
  }

  for (const r of results) {
    const statusIcon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : r.status.toUpperCase();
    console.log(`  ${statusIcon}  ${r.obligation}`);
    console.log(`    Required: ${evidenceStrengthLabel(r.requiredStrength)}`);
    console.log(`    Found:    ${r.bestFoundStrength !== null ? evidenceStrengthLabel(r.bestFoundStrength) : '(none)'}`);
    console.log(`    ${r.details}`);
    if (r.waiverId) {
      console.log(`    Waiver: ${r.waiverId}`);
    }
    console.log('');
  }

  if (claims.length > 0) {
    console.log(`  Claims (${claims.length}):`);
    for (const c of claims) {
      console.log(`    ${c.relation} -> ${c.dst}  [${evidenceStrengthLabel(c.strength)}]  via ${c.provider}`);
    }
    console.log('');
  }

  if (waivers.length > 0) {
    console.log(`  Waivers (${waivers.length}):`);
    for (const w of waivers) {
      console.log(`    ${w.kind}: ${w.reason}  (${w.owner}, expires ${w.expires})`);
    }
  }
}

function computeOverall(statuses: PolicyResultStatus[]): PolicyResultStatus {
  if (statuses.length === 0) return 'pass';
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('insufficient-evidence')) return 'insufficient-evidence';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.every(s => s === 'waived')) return 'waived';
  return 'pass';
}
