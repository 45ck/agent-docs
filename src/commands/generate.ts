import path from 'node:path';
import {
  loadArtifacts,
  Collector,
  readContradictionMatrix,
  evaluateArtifactGraph,
  evaluateCodeTraceability,
  evaluateMarkdownPolicy,
  collectMarkdownFiles,
} from '../lib/checker.js';
import { loadConfig } from '../config.js';
import { generateArtifacts } from '../lib/generator.js';
import type { GeneratePlanOptions } from '../types.js';

export interface GenerateResult {
  exitCode: number;
  generated: number;
}

export async function runGenerate(options: GeneratePlanOptions): Promise<GenerateResult> {
  const root = path.resolve(options.root);
  const config = await loadConfig(root);
  const collector = new Collector();
  const artifacts = await loadArtifacts(root, config, collector);

  if (collector.toArray().some((issue) => issue.severity === 'error')) {
    console.error('Generation blocked due to parse/type errors in source documents.');
    for (const issue of collector.toArray()) {
      console.error(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`);
    }
    return { exitCode: 1, generated: 0 };
  }

  const matrix = await readContradictionMatrix(root);
  await evaluateArtifactGraph(artifacts, config, matrix, collector);
  await evaluateCodeTraceability(root, artifacts, config, collector);

  if (options.strict && collector.toArray().some((issue) => issue.severity !== 'info')) {
    const blockers = collector.toArray().filter((issue) => issue.severity !== 'info');
    console.error(`Generation blocked by ${blockers.length} validation issue(s).`);
    for (const issue of blockers) {
      console.error(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`);
    }
    return { exitCode: 1, generated: 0 };
  }

  const markdownFiles = await collectMarkdownFiles(root, config);
  await evaluateMarkdownPolicy(root, config, markdownFiles, collector);
  if (options.strict && collector.toArray().some((issue) => issue.severity === 'warning')) {
    const blockers = collector.toArray().filter((issue) => issue.severity === 'warning');
    console.error(`Generation blocked by ${blockers.length} warning(s).`);
    for (const issue of blockers) {
      console.error(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`);
    }
    return { exitCode: 1, generated: 0 };
  }

  const manifest = await generateArtifacts(root, config, artifacts, options.format);
  console.log(
    `Generated ${manifest.entries.length} artifact outputs (${options.format}) to ${config.generated.markdownRoot}`,
  );
  return { exitCode: 0, generated: manifest.entries.length };
}
