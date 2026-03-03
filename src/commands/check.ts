import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDirectory } from '../lib/utils.js';
import {
  loadArtifacts,
  collectMarkdownFiles,
  evaluateArtifactGraph,
  evaluateCodeTraceability,
  evaluateMarkdownPolicy,
  evaluateBeadsRegistry,
  evaluateGeneratedFreshness,
  buildReport,
  Collector,
  readContradictionMatrix,
} from '../lib/checker.js';
import { loadConfig } from '../config.js';
import type { CheckPlanOptions, GateReport } from '../types.js';

export interface CheckResult {
  exitCode: number;
  hasErrors: boolean;
  hasWarnings: boolean;
}

export async function runCheck(options: CheckPlanOptions): Promise<CheckResult> {
  const root = path.resolve(options.root);
  const start = Date.now();
  const config = await loadConfig(root);

  const effectiveStrict = options.strict || false;
  const collector = new Collector();
  const markdownFiles = await collectMarkdownFiles(root, config);
  const artifacts = await loadArtifacts(root, config, collector);
  const matrix = await readContradictionMatrix(root);
  await evaluateArtifactGraph(artifacts, config, matrix, collector);
  await evaluateCodeTraceability(root, artifacts, config, collector);
  await evaluateMarkdownPolicy(root, config, markdownFiles, collector);
  await evaluateBeadsRegistry(root, config, collector);

  // Skip freshness checks if user requested non-strict run.
  if (effectiveStrict || config.strict.requireGeneratedFreshness) {
    await evaluateGeneratedFreshness(root, config, artifacts, collector);
  }

  const report = buildReport(start, root, collector, {
    filesChecked: artifacts.length + markdownFiles.length + (config.beads?.enabled ? 1 : 0),
    docsChecked: markdownFiles.length,
    documentsChecked: artifacts.length,
  });

  if (config.reportPath) {
    const reportPath = path.join(root, config.reportPath);
    await ensureDirectory(path.dirname(reportPath));
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (options.strict) {
    for (const issue of report.issues) {
      if (issue.severity === 'warning') {
        issue.severity = 'error';
      }
    }
    if (report.totals.warnings > 0) {
      report.totals.errors += report.totals.warnings;
      report.totals.warnings = 0;
    }
  }

  const hasErrors = report.issues.some((entry) => entry.severity === 'error');
  const hasWarnings = report.issues.some((entry) => entry.severity === 'warning');

  if (hasErrors || hasWarnings) {
    console.error(formatReport(report));
  } else {
    console.log(`✅ Check passed with ${report.totals.filesChecked} files and ${report.totals.docsChecked} docs`);
  }

  return {
    exitCode: hasErrors || hasWarnings ? 1 : 0,
    hasErrors,
    hasWarnings,
  };
}

function formatReport(report: GateReport) {
  const issueLines = report.issues
    .map((issue) => `  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`)
    .join('\n');
  return [
    `agent-docs check failed: ${report.totals.errors} error(s), ${report.totals.warnings} warning(s), ${report.totals.info} info(s)`,
    issueLines,
  ].join('\n');
}
