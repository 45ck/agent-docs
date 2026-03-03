import path from 'node:path';
import { promises as fs } from 'node:fs';
import { encode } from '@toon-format/toon';
import type { ParsedArtifact, AgentDocsConfig, GeneratedManifest, GeneratedManifestEntry } from '../types.js';
import { ensureDirectory, formatNow, normalizeRelPath, slugify, writeText } from './utils.js';

function toMarkdownSectionBody(lines: string): string {
  if (!lines.trim()) {
    return '_No content_';
  }
  return lines;
}

function artifactHeader(artifact: ParsedArtifact, config: AgentDocsConfig): string[] {
  const status = artifact.status || 'draft';
  const rows = [
    `id: ${artifact.id}`,
    `kind: ${artifact.kind}`,
    `title: ${artifact.title}`,
    `status: ${status}`,
    `scope: ${artifact.scope}`,
  ];

  if (artifact.owner) rows.push(`owner: ${artifact.owner}`);
  if (artifact.date) rows.push(`date: ${artifact.date}`);
  if (artifact.canonicalKey) rows.push(`canonicalKey: ${artifact.canonicalKey}`);
  if (artifact.tags.length > 0) rows.push(`tags: ${artifact.tags.join(', ')}`);
  if (artifact.implements.length > 0) {
    for (let index = 0; index < artifact.implements.length; index += 1) {
      const ref = artifact.implements[index];
      const symbolSuffix = ref.symbols && ref.symbols.length > 0 ? `#${ref.symbols.join(',')}` : '';
      rows.push(`implements[${index}]: ${ref.path}${symbolSuffix}`);
    }
  }
  if (artifact.dependsOn.length > 0) rows.push(`dependsOn: ${artifact.dependsOn.join(', ')}`);
  if (artifact.references.length > 0) rows.push(`references: ${artifact.references.join(', ')}`);
  if (artifact.supersedes.length > 0) rows.push(`supersedes: ${artifact.supersedes.join(', ')}`);
  if (artifact.supersededBy.length > 0) rows.push(`supersededBy: ${artifact.supersededBy.join(', ')}`);
  if (artifact.conflictsWith.length > 0) rows.push(`conflictsWith: ${artifact.conflictsWith.join(', ')}`);

  return [
    '---',
    ...rows,
    '---',
    '',
    `${config.generated.markdownHeaderPrefix}${artifact.id} ${artifact.title}`,
    '',
  ];
}

function upsertManifest(
  entries: Map<string, GeneratedManifestEntry>,
  entry: GeneratedManifestEntry,
): void {
  const existing = entries.get(entry.source);
  if (!existing) {
    entries.set(entry.source, entry);
    return;
  }

  // prefer markdown output when both formats are requested
  if (entry.generatedPath.endsWith('.md')) {
    existing.generatedPath = entry.generatedPath;
  }
  existing.generatedAt = entry.generatedAt;
  existing.sourceHash = entry.sourceHash;
}

function sectionsToMarkdown(artifact: ParsedArtifact): string[] {
  const lines: string[] = [];
  for (const section of artifact.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(...toMarkdownSectionBody(section.body).split(/\r?\n/));
    lines.push('');
  }
  return lines;
}

function stringifyManifest(manifest: GeneratedManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function generateArtifacts(
  root: string,
  config: AgentDocsConfig,
  artifacts: ParsedArtifact[],
  format: 'markdown' | 'toon' | 'both',
): Promise<GeneratedManifest> {
  const outputRoot = path.join(root, config.generated.markdownRoot);
  await ensureDirectory(outputRoot);

  const manifestEntries = new Map<string, GeneratedManifestEntry>();
  const markdownArtifacts: ParsedArtifact[] = [];

  for (const artifact of artifacts) {
    const kindDir = path.join(outputRoot, artifact.kind.toLowerCase());
    const fileBase = `${slugify(artifact.id)}`;
    const generatedAt = formatNow();

    if (format === 'markdown' || format === 'both') {
      const markdownPath = path.join(kindDir, `${fileBase}.md`);
      const lines: string[] = [
        ...artifactHeader(artifact, config),
        '',
        `Generated from ${artifact.path}`,
        '',
        `- status: ${artifact.status}`,
        `- path: ${artifact.path}`,
        '',
        ...sectionsToMarkdown(artifact),
      ];

      if (artifact.title) {
        lines.push('## Raw Snapshot');
        lines.push('```json');
        lines.push(JSON.stringify(artifact.raw, null, 2));
        lines.push('```');
      }

      await writeText(markdownPath, `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`);
      upsertManifest(manifestEntries, {
        source: artifact.path,
        id: artifact.id,
        kind: artifact.kind,
        sourceHash: artifact.sourceHash || '',
        generatedPath: normalizeRelPath(path.relative(root, markdownPath)),
        generatedAt,
      });
      markdownArtifacts.push(artifact);
    }

    if (format === 'toon' || format === 'both') {
      const toonPath = path.join(kindDir, `${fileBase}.toon`);
      const content = encode(
        {
          meta: {
            id: artifact.id,
            kind: artifact.kind,
            title: artifact.title,
            status: artifact.status,
            path: artifact.path,
            generatedAt,
          },
          content: artifact.raw,
        },
        { keyFolding: 'safe' },
      );
      await writeText(toonPath, `${content}\n`);
      upsertManifest(manifestEntries, {
        source: artifact.path,
        id: artifact.id,
        kind: artifact.kind,
        sourceHash: artifact.sourceHash || '',
        generatedPath: normalizeRelPath(path.relative(root, toonPath)),
        generatedAt,
      });
    }
  }

  if (format === 'markdown' || format === 'both') {
    const indexPath = path.join(outputRoot, 'index.md');
    const indexLines: string[] = [
      `${config.generated.markdownHeaderPrefix}${config.generated.indexTitle}`,
      '',
      `Generated from source docs at ${config.sourceRoots.join(', ')}`,
      '',
      '## Documents',
      '',
    ];
    for (const artifact of artifacts) {
      const relPath = path.join(config.generated.markdownRoot, artifact.kind.toLowerCase(), `${slugify(artifact.id)}.md`);
      indexLines.push(`- [${artifact.id} — ${artifact.title}](${relPath.replace(/\\/g, '/')})`);
    }
    await writeText(indexPath, `${indexLines.join('\n')}\n`);

    const indexToonPath = path.join(outputRoot, 'index.toon');
    const indexToon = encode(
      {
        generatedAt: formatNow(),
        type: 'agent-doc-index',
        items: markdownArtifacts.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          title: artifact.title,
          path: normalizeRelPath(
            path.join(config.generated.markdownRoot, artifact.kind.toLowerCase(), `${slugify(artifact.id)}.md`),
          ),
        })),
      },
      { keyFolding: 'safe' },
    );
    await writeText(indexToonPath, `${indexToon}\n`);
  } else if (format === 'toon') {
    const indexToonPath = path.join(outputRoot, 'index.toon');
    const indexToon = encode(
      {
        generatedAt: formatNow(),
        type: 'agent-doc-index',
        items: artifacts.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          title: artifact.title,
          path: normalizeRelPath(
            path.join(config.generated.markdownRoot, artifact.kind.toLowerCase(), `${slugify(artifact.id)}.toon`),
          ),
        })),
      },
      { keyFolding: 'safe' },
    );
    await writeText(indexToonPath, `${indexToon}\n`);
  }

  const manifest: GeneratedManifest = {
    version: '1.0',
    generatedAt: formatNow(),
    format,
    entries: Array.from(manifestEntries.values()),
  };
  const manifestPath = path.join(root, config.generated.manifestPath);
  await writeText(manifestPath, stringifyManifest(manifest));

  return manifest;
}

export async function readManifest(root: string, config: AgentDocsConfig): Promise<GeneratedManifest | null> {
  const manifestPath = path.join(root, config.generated.manifestPath);
  const raw = await fs.readFile(manifestPath, 'utf8').catch(() => null);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as GeneratedManifest;
  } catch {
    return null;
  }
}
