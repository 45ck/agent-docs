/**
 * Tests for Phase 2 providers:
 * CrossRefProvider, FreshnessProvider, MarkdownPolicyProvider, TerminologyProvider
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { CrossRefProvider } from '../../providers/cross-ref.js';
import { MarkdownPolicyProvider } from '../../providers/markdown-policy.js';
import { TerminologyProvider } from '../../providers/terminology.js';

const runId = 'test-run-001';

async function withTempDir(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'specgraph-providers-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeSpec(root: string, filename: string, content: string): Promise<void> {
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', filename), content, 'utf8');
}

function specFrontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

// ── CrossRefProvider ────────────────────────────────────────────

test('CrossRefProvider: emits DEPENDS_ON with E1 when target exists', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'a.md', specFrontmatter({ id: 'SPEC-A', title: 'A', state: 'accepted', depends_on: ['SPEC-B'] }));
    await writeSpec(root, 'b.md', specFrontmatter({ id: 'SPEC-B', title: 'B', state: 'accepted' }));

    const provider = new CrossRefProvider();
    const result = await provider.scan({ root, runId });

    const depClaim = result.claims.find(c => c.relation === 'DEPENDS_ON' && c.src === 'SPEC-A');
    assert.ok(depClaim, 'should emit DEPENDS_ON claim');
    assert.equal(depClaim.strength, 1, 'E1 when target exists');
    assert.match(depClaim.dst, /SPEC-B/);
    assert.equal(result.evidence.filter(e => e.kind === 'broken_ref').length, 0);
  });
});

test('CrossRefProvider: emits E0 and broken_ref evidence when target missing', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'a.md', specFrontmatter({ id: 'SPEC-A', title: 'A', state: 'accepted', depends_on: ['SPEC-MISSING'] }));

    const provider = new CrossRefProvider();
    const result = await provider.scan({ root, runId });

    const depClaim = result.claims.find(c => c.relation === 'DEPENDS_ON');
    assert.ok(depClaim);
    assert.equal(depClaim.strength, 0, 'E0 when target missing');

    const brokenEv = result.evidence.find(e => e.kind === 'broken_ref');
    assert.ok(brokenEv, 'should emit broken_ref evidence');
    assert.match(brokenEv.detail, /SPEC-MISSING/);
  });
});

test('CrossRefProvider: empty docs dir returns empty result', async () => {
  await withTempDir(async (root) => {
    const provider = new CrossRefProvider();
    const result = await provider.scan({ root, runId });
    assert.equal(result.claims.length, 0);
    assert.equal(result.evidence.length, 0);
    assert.equal(result.subjects.length, 0);
  });
});

test('CrossRefProvider: deterministic claim IDs', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'a.md', specFrontmatter({ id: 'SPEC-A', title: 'A', state: 'draft', depends_on: ['SPEC-B'] }));

    const provider = new CrossRefProvider();
    const r1 = await provider.scan({ root, runId: 'run-1' });
    const r2 = await provider.scan({ root, runId: 'run-2' });

    assert.equal(r1.claims.length, r2.claims.length);
    assert.equal(r1.claims[0].id, r2.claims[0].id);
  });
});

// ── MarkdownPolicyProvider ──────────────────────────────────────

test('MarkdownPolicyProvider: allow mode returns no claims', async () => {
  await withTempDir(async (root) => {
    // Write a config with allow mode
    await mkdir(path.join(root, '.specgraph'), { recursive: true });
    await writeFile(
      path.join(root, '.specgraph', 'config.json'),
      JSON.stringify({ version: '1.0', markdownPolicy: { mode: 'allow', allowInGeneratedPaths: [] } }),
      'utf8',
    );
    // Write a loose .md file
    await writeFile(path.join(root, 'RANDOM.md'), '# random', 'utf8');

    const provider = new MarkdownPolicyProvider();
    const result = await provider.scan({ root, runId });
    assert.equal(result.claims.length, 0);
  });
});

test('MarkdownPolicyProvider: deny mode flags .md files outside allowed paths', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, '.specgraph'), { recursive: true });
    await writeFile(
      path.join(root, '.specgraph', 'config.json'),
      JSON.stringify({ version: '1.0', markdownPolicy: { mode: 'deny', allowInGeneratedPaths: ['generated'] } }),
      'utf8',
    );
    await writeFile(path.join(root, 'LOOSE.md'), '# loose', 'utf8');
    await mkdir(path.join(root, 'generated'), { recursive: true });
    await writeFile(path.join(root, 'generated', 'output.md'), '# gen', 'utf8');
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'spec.md'), '# spec', 'utf8');

    const provider = new MarkdownPolicyProvider();
    const result = await provider.scan({ root, runId });

    // Only LOOSE.md should be flagged (docs/ and generated/ are allowed)
    assert.equal(result.claims.length, 1);
    assert.match(result.claims[0].dst, /LOOSE\.md/);
    assert.equal(result.evidence[0].kind, 'markdown_policy_violation');
  });
});

test('MarkdownPolicyProvider: docs/ files are never flagged', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, '.specgraph'), { recursive: true });
    await writeFile(
      path.join(root, '.specgraph', 'config.json'),
      JSON.stringify({ version: '1.0', markdownPolicy: { mode: 'deny', allowInGeneratedPaths: [] } }),
      'utf8',
    );
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'SPEC.md'), '# spec', 'utf8');

    const provider = new MarkdownPolicyProvider();
    const result = await provider.scan({ root, runId });
    assert.equal(result.claims.length, 0);
  });
});

test('MarkdownPolicyProvider: gracefully degrades when no config', async () => {
  await withTempDir(async (root) => {
    await writeFile(path.join(root, 'RANDOM.md'), '# r', 'utf8');
    // No .specgraph/config.json, no .agent-docs/config.json
    // Falls back to default config which has mode: 'deny'
    const provider = new MarkdownPolicyProvider();
    // Should not throw
    const result = await provider.scan({ root, runId });
    assert.ok(result); // May or may not have claims, but must not throw
  });
});

// ── TerminologyProvider ─────────────────────────────────────────

test('TerminologyProvider: no DOMAINTREE specs → no claims', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'a.md', specFrontmatter({ id: 'SPEC-A', title: '{{SomeTerm}}', state: 'draft', kind: 'functional' }));

    const provider = new TerminologyProvider();
    const result = await provider.scan({ root, runId });
    assert.equal(result.claims.length, 0, 'no DOMAINTREE → skip validation');
  });
});

test('TerminologyProvider: defined term → no claim', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'domain.md',
      specFrontmatter({ id: 'DOMAIN-001', title: 'Domain', state: 'accepted', kind: 'DOMAINTREE', terms: ['Widget', 'Gadget'] }),
    );
    await writeSpec(root, 'spec.md', specFrontmatter({ id: 'SPEC-A', title: 'Using {{Widget}}', state: 'draft', kind: 'functional' }));

    const provider = new TerminologyProvider();
    const result = await provider.scan({ root, runId });
    // {{Widget}} is defined — no undefined_term claims for it
    const undefined_ = result.evidence.filter(e => e.kind === 'undefined_term');
    assert.equal(undefined_.length, 0);
  });
});

test('TerminologyProvider: undefined term → emits claim with evidence', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'domain.md',
      specFrontmatter({ id: 'DOMAIN-001', title: 'Domain', state: 'accepted', kind: 'DOMAINTREE', terms: ['Widget'] }),
    );
    await writeSpec(root, 'spec.md', specFrontmatter({ id: 'SPEC-A', title: 'Uses {{Gizmo}}', state: 'draft', kind: 'functional' }));

    const provider = new TerminologyProvider();
    const result = await provider.scan({ root, runId });

    const undefEvidence = result.evidence.filter(e => e.kind === 'undefined_term');
    assert.equal(undefEvidence.length, 1);
    assert.match(undefEvidence[0].detail, /Gizmo/);
    assert.equal(result.claims.length, 1);
    assert.equal(result.claims[0].src, 'SPEC-A');
    assert.equal(result.claims[0].strength, 0);
  });
});

test('TerminologyProvider: empty docs → no claims', async () => {
  await withTempDir(async (root) => {
    const provider = new TerminologyProvider();
    const result = await provider.scan({ root, runId });
    assert.equal(result.claims.length, 0);
  });
});

// ── FreshnessProvider ───────────────────────────────────────────
// FreshnessProvider requires a live store with generated_outputs,
// which requires proper DB setup. We test it indirectly via verify integration
// and just confirm it gracefully handles a missing/empty store.

test('FreshnessProvider: gracefully handles empty store', async () => {
  await withTempDir(async (root) => {
    const { FreshnessProvider } = await import('../../providers/freshness.js');
    const provider = new FreshnessProvider();
    // No store/db — should return empty without throwing
    const result = await provider.scan({ root, runId });
    assert.equal(result.claims.length, 0);
    assert.equal(result.evidence.length, 0);
  });
});
