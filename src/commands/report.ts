/**
 * `specgraph report` command — generate analytical matrix reports.
 *
 * Produces one or more reports from the artifact graph and writes them as
 * markdown to `generated/reports/`. Available types: traceability, defect,
 * coverage, impact.
 */
import path from 'node:path';
import { loadConfig } from '../config.js';
import { Collector, loadArtifacts } from '../lib/checker.js';
import {
  generateTraceabilityMatrix,
  generateDefectMatrix,
  generateCoverageMatrix,
  generateImpactMatrix,
} from '../lib/reports.js';
import { ensureDirectory, writeText } from '../lib/utils.js';
import type { ReportKind, ReportPlanOptions } from '../types.js';

const REPORT_GENERATORS: Record<ReportKind, (artifacts: import('../types.js').ParsedArtifact[]) => string> = {
  traceability: generateTraceabilityMatrix,
  defect: generateDefectMatrix,
  coverage: generateCoverageMatrix,
  impact: generateImpactMatrix,
};

export async function runReport(options: ReportPlanOptions): Promise<{ exitCode: number }> {
  const root = path.resolve(options.root);

  let config;
  try {
    config = await loadConfig(root);
  } catch (error) {
    console.error(`Failed to load config: ${(error as Error).message}`);
    return { exitCode: 1 };
  }

  const collector = new Collector();
  const artifacts = await loadArtifacts(root, config, collector);

  const issues = collector.toArray();
  const parseErrors = issues.filter((i) => i.severity === 'error');
  if (parseErrors.length > 0) {
    console.error(`Warning: ${parseErrors.length} artifact error(s) found during loading:`);
    for (const issue of parseErrors) {
      console.error(`  ${issue.code}: ${issue.message}`);
    }
  }

  const outputDir = path.resolve(root, options.output ?? 'generated/reports');
  await ensureDirectory(outputDir);

  const kinds: ReportKind[] = options.all
    ? ['traceability', 'defect', 'coverage', 'impact']
    : options.type
      ? [options.type]
      : ['traceability', 'defect', 'coverage', 'impact'];

  const generated: string[] = [];
  const errors: string[] = [];

  for (const kind of kinds) {
    const generator = REPORT_GENERATORS[kind];
    const markdown = generator(artifacts);
    const filePath = path.join(outputDir, `${kind}-matrix.md`);
    try {
      await writeText(filePath, markdown);
      generated.push(filePath);
      console.log(`Generated: ${filePath}`);
    } catch (error) {
      errors.push(`Failed to write ${kind} report: ${(error as Error).message}`);
      console.error(`Failed: ${filePath} — ${(error as Error).message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nReport generation completed with ${errors.length} error(s). ${generated.length} report(s) succeeded.`);
    return { exitCode: 1 };
  }

  console.log(`\nReport generation complete: ${generated.length} report(s) written to ${outputDir}`);
  return { exitCode: 0 };
}
