import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { collectMarkdownFiles, Collector, loadArtifacts } from '../lib/checker.js';
import type { DoctorPlanOptions } from '../types.js';

export async function runDoctor(options: DoctorPlanOptions): Promise<number> {
  const root = path.resolve(options.root);
  const critical: string[] = [];
  const warnings: string[] = [];

  let config;
  try {
    config = await loadConfig(root);
  } catch (error) {
    critical.push(`Unable to load configuration: ${(error as Error).message}`);
  }

  const docsPath = path.join(root, 'docs');
  if (!existsSync(docsPath)) {
    critical.push('No docs folder found; create one or update sourceRoots in .agent-docs/config.json');
  }

  try {
    if (!config) config = await loadConfig(root);
    const markdownCount = (await collectMarkdownFiles(root, config)).length;
    if (markdownCount === 0) {
      warnings.push('No markdown files detected; generated docs will be produced by "agent-docs generate".');
    }
  } catch (error) {
    warnings.push(`Cannot collect markdown files: ${(error as Error).message}`);
  }

  const packagePath = path.join(root, 'package.json');
  if (!existsSync(packagePath)) {
    warnings.push('No package.json in repo root (optional but recommended for open source package metadata).');
  }

  if (config?.references?.enabled) {
    try {
      const collector = new Collector();
      const artifacts = await loadArtifacts(root, config, collector);
      const kinds = new Set(artifacts.map((a) => a.kind));
      if (!kinds.has('TESTCASE') && !kinds.has('DEFECT')) {
        warnings.push(
          'Reference rules are enabled but no TESTCASE or DEFECT artifacts exist. '
          + 'Create test/defect artifacts to benefit from reference validation.',
        );
      }
    } catch (error) {
      warnings.push(`Could not load artifacts for reference rule check: ${(error as Error).message}`);
    }
  }

  if (critical.length > 0 || warnings.length > 0) {
    console.log('Doctor notes:');
    for (const note of critical) {
      console.log(`- [ERROR] ${note}`);
    }
    for (const note of warnings) {
      console.log(`- [WARN] ${note}`);
    }
  }

  if (critical.length > 0) {
    return 1;
  }

  console.log(`doctor: ${root} looks good for agent-docs workflows`);
  return 0;
}
