import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_CONFIG, loadConfig } from '../config.js';
import { Collector, loadArtifacts } from '../lib/checker.js';
import { generateArtifacts } from '../lib/generator.js';

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-docs-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('generateArtifacts writes index links relative to the generated index', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, '.agent-docs', 'src'), { recursive: true });

    await writeFile(
      path.join(root, '.agent-docs', 'config.json'),
      JSON.stringify(
        {
          version: '1.0',
          sourceExtension: '.a-doc',
          sourceRoots: ['.agent-docs/src'],
          ignorePaths: DEFAULT_CONFIG.ignorePaths,
          generated: {
            markdownRoot: 'docs/generated',
          },
          markdownPolicy: {
            mode: 'allow',
          },
          strict: {
            requireGeneratedFreshness: false,
          },
          kindDefaults: {
            ...DEFAULT_CONFIG.kindDefaults,
            PLAN: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    await writeFile(
      path.join(root, '.agent-docs', 'src', 'PLAN-001.a-doc'),
      JSON.stringify(
        {
          id: 'PLAN-001',
          kind: 'PLAN',
          title: 'Plan title',
          status: 'accepted',
          scope: 'platform',
          owner: 'Engineering',
          date: '2026-03-06',
          sections: [{ title: 'Objective', body: 'Test' }],
        },
        null,
        2,
      ),
      'utf8',
    );

    const config = await loadConfig(root);
    const collector = new Collector();
    const artifacts = await loadArtifacts(root, config, collector);
    assert.equal(collector.toArray().length, 0);
    assert.equal(artifacts.length, 1);

    await generateArtifacts(root, config, artifacts, 'markdown');

    const index = await readFile(path.join(root, 'docs', 'generated', 'index.md'), 'utf8');
    assert.match(index, /\(plan\/plan-001\.md\)/);
    assert.doesNotMatch(index, /\(docs\/generated\/plan\/plan-001\.md\)/);
  });
});
