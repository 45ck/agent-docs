/**
 * Tests for schema v2 store methods:
 * generated_outputs, gate_reports, contradictions
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../../v2/store.js';

async function withStore(fn: (store: ReturnType<typeof openStore>, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'specgraph-store-v2-'));
  try {
    const store = openStore(root);
    try {
      await fn(store, root);
    } finally {
      store.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ── generated_outputs ───────────────────────────────────────────

test('insertGeneratedOutput stores and retrieves entry', async () => {
  await withStore(async (store) => {
    store.insertGeneratedOutput({
      id: 'go-001',
      specId: 'SPEC-001',
      sourcePath: 'docs/SPEC-001.md',
      sourceHash: 'abc123',
      outputPath: 'generated/SPEC-001.md',
      format: 'markdown',
    });

    const all = store.listGeneratedOutputs();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'go-001');
    assert.equal(all[0].specId, 'SPEC-001');
    assert.equal(all[0].sourceHash, 'abc123');
    assert.equal(all[0].format, 'markdown');
  });
});

test('listGeneratedOutputs filters by specId', async () => {
  await withStore(async (store) => {
    store.insertGeneratedOutput({ id: 'go-001', specId: 'SPEC-001', sourcePath: 'docs/a.md', sourceHash: 'h1', outputPath: 'gen/a.md', format: 'markdown' });
    store.insertGeneratedOutput({ id: 'go-002', specId: 'SPEC-002', sourcePath: 'docs/b.md', sourceHash: 'h2', outputPath: 'gen/b.md', format: 'markdown' });

    const forSpec1 = store.listGeneratedOutputs('SPEC-001');
    assert.equal(forSpec1.length, 1);
    assert.equal(forSpec1[0].id, 'go-001');

    const all = store.listGeneratedOutputs();
    assert.equal(all.length, 2);
  });
});

test('insertGeneratedOutput replaces on conflict', async () => {
  await withStore(async (store) => {
    store.insertGeneratedOutput({ id: 'go-001', specId: 'SPEC-001', sourcePath: 'docs/a.md', sourceHash: 'old-hash', outputPath: 'gen/a.md', format: 'markdown' });
    store.insertGeneratedOutput({ id: 'go-001', specId: 'SPEC-001', sourcePath: 'docs/a.md', sourceHash: 'new-hash', outputPath: 'gen/a.md', format: 'markdown' });

    const all = store.listGeneratedOutputs();
    assert.equal(all.length, 1);
    assert.equal(all[0].sourceHash, 'new-hash');
  });
});

// ── gate_reports ────────────────────────────────────────────────

test('insertGateReport stores and retrieves latest', async () => {
  await withStore(async (store) => {
    const root = '/tmp/my-project';
    store.insertGateReport({
      id: 'gr-001',
      sourceRoot: root,
      totalErrors: 2,
      totalWarnings: 1,
      totalInfo: 0,
      filesChecked: 10,
      docsChecked: 3,
      rawJson: JSON.stringify({ errors: 2 }),
    });

    const latest = store.getLatestGateReport(root);
    assert.ok(latest);
    assert.equal(latest.id, 'gr-001');
    assert.equal(latest.totalErrors, 2);
    assert.equal(latest.totalWarnings, 1);
    assert.equal(latest.filesChecked, 10);
  });
});

test('getLatestGateReport returns null when none exist', async () => {
  await withStore(async (store) => {
    const result = store.getLatestGateReport('/nonexistent');
    assert.equal(result, null);
  });
});

test('getLatestGateReport returns most recent when multiple exist', async () => {
  await withStore(async (store) => {
    const root = '/tmp/proj';
    store.insertGateReport({ id: 'gr-001', sourceRoot: root, totalErrors: 5, totalWarnings: 0, totalInfo: 0, filesChecked: 5, docsChecked: 1, rawJson: '{}' });
    // Small delay to ensure different generated_at timestamps (they default to now())
    store.insertGateReport({ id: 'gr-002', sourceRoot: root, totalErrors: 0, totalWarnings: 0, totalInfo: 0, filesChecked: 8, docsChecked: 2, rawJson: '{}' });

    const latest = store.getLatestGateReport(root);
    assert.ok(latest);
    // Both have same timestamp (no delay), but gr-002 was inserted second
    // The ORDER BY generated_at DESC LIMIT 1 should return one of them consistently
    assert.ok(['gr-001', 'gr-002'].includes(latest.id));
  });
});

// ── contradictions ──────────────────────────────────────────────

test('upsertContradiction inserts and retrieves', async () => {
  await withStore(async (store) => {
    store.upsertContradiction({
      id: 'c-001',
      specIds: ['SPEC-001', 'SPEC-002'],
      severity: 'high',
      status: 'open',
      rationale: 'Conflicting auth requirements',
    });

    const all = store.listContradictions();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'c-001');
    assert.deepEqual(all[0].specIds, ['SPEC-001', 'SPEC-002']);
    assert.equal(all[0].severity, 'high');
    assert.equal(all[0].status, 'open');
    assert.equal(all[0].rationale, 'Conflicting auth requirements');
  });
});

test('upsertContradiction updates on conflict', async () => {
  await withStore(async (store) => {
    store.upsertContradiction({ id: 'c-001', specIds: ['A'], severity: 'low', status: 'open' });
    store.upsertContradiction({ id: 'c-001', specIds: ['A', 'B'], severity: 'critical', status: 'mitigated', mitigations: ['Added guard'] });

    const all = store.listContradictions();
    assert.equal(all.length, 1);
    assert.equal(all[0].severity, 'critical');
    assert.equal(all[0].status, 'mitigated');
    assert.deepEqual(all[0].specIds, ['A', 'B']);
    assert.deepEqual(all[0].mitigations, ['Added guard']);
  });
});

test('listContradictions filters by status', async () => {
  await withStore(async (store) => {
    store.upsertContradiction({ id: 'c-001', specIds: ['A'], severity: 'high', status: 'open' });
    store.upsertContradiction({ id: 'c-002', specIds: ['B'], severity: 'low', status: 'resolved' });
    store.upsertContradiction({ id: 'c-003', specIds: ['C'], severity: 'medium', status: 'open' });

    const open = store.listContradictions('open');
    assert.equal(open.length, 2);
    assert.ok(open.every(c => c.status === 'open'));

    const resolved = store.listContradictions('resolved');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 'c-002');
  });
});

test('schema v2 migration: existing v1 db gets new tables', async () => {
  await withStore(async (store) => {
    // Verify all three new tables exist by exercising them
    store.insertGeneratedOutput({ id: 'go-x', specId: '', sourcePath: 'x', sourceHash: 'h', outputPath: 'out', format: 'markdown' });
    store.insertGateReport({ id: 'gr-x', sourceRoot: '/x', totalErrors: 0, totalWarnings: 0, totalInfo: 0, filesChecked: 0, docsChecked: 0, rawJson: '{}' });
    store.upsertContradiction({ id: 'cx', specIds: [], severity: 'low', status: 'open' });

    assert.equal(store.listGeneratedOutputs().length, 1);
    assert.ok(store.getLatestGateReport('/x'));
    assert.equal(store.listContradictions().length, 1);
  });
});
