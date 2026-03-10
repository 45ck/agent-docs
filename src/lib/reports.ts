import type { ParsedArtifact } from '../types.js';

// --- Graph helpers ---

function buildReverseGraph(artifacts: ParsedArtifact[]): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const a of artifacts) {
    if (!reverse.has(a.id)) {
      reverse.set(a.id, new Set());
    }
    for (const dep of a.dependsOn) {
      if (!reverse.has(dep)) {
        reverse.set(dep, new Set());
      }
      reverse.get(dep)!.add(a.id);
    }
    for (const ref of a.references) {
      if (!reverse.has(ref)) {
        reverse.set(ref, new Set());
      }
      reverse.get(ref)!.add(a.id);
    }
  }
  return reverse;
}

function transitiveClosure(graph: Map<string, Set<string>>, startId: string): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = graph.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }
  visited.delete(startId);
  return visited;
}

// --- Report generators ---

function isLinkedTest(test: ParsedArtifact, reqId: string): boolean {
  const meta = (test.raw.metadata ?? {}) as Record<string, unknown>;
  const verifies = Array.isArray(meta.verifies) ? meta.verifies : [];
  return (
    verifies.includes(reqId) ||
    test.dependsOn.includes(reqId) ||
    test.references.includes(reqId)
  );
}

export function generateTraceabilityMatrix(artifacts: ParsedArtifact[]): string {
  const requirements = artifacts.filter((a) => a.kind === 'SRD' || a.kind === 'PRD');
  const designs = artifacts.filter((a) => a.kind === 'ADR' || a.kind === 'COMPONENT');
  const tests = artifacts.filter((a) => a.kind === 'TESTCASE');

  const lines: string[] = [
    '# Traceability Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Requirement → Design → Code → Test',
    '',
    '| Requirement | Design | Code | Test | Status |',
    '|-------------|--------|------|------|--------|',
  ];

  let coveredCount = 0;

  for (const req of requirements) {
    const linkedDesigns = designs.filter(
      (d) => d.dependsOn.includes(req.id) || d.references.includes(req.id),
    );
    const linkedTests = tests.filter((t) => isLinkedTest(t, req.id));
    const hasCode = req.implements.length > 0 ||
      linkedDesigns.some((d) => d.implements.length > 0);

    const designCol = linkedDesigns.length > 0
      ? linkedDesigns.map((d) => d.id).join(', ')
      : '-';
    const codeCol = hasCode ? 'yes' : '-';
    const testCol = linkedTests.length > 0
      ? linkedTests.map((t) => t.id).join(', ')
      : '-';

    const gaps: string[] = [];
    if (linkedDesigns.length === 0) gaps.push('no design');
    if (!hasCode) gaps.push('no code');
    if (linkedTests.length === 0) gaps.push('no test');
    const statusCol = gaps.length === 0 ? 'covered' : gaps.join(', ');

    if (gaps.length === 0) coveredCount++;

    lines.push(`| ${req.id} | ${designCol} | ${codeCol} | ${testCol} | ${statusCol} |`);
  }

  if (requirements.length === 0) {
    lines.push('| _(no requirements found)_ | - | - | - | - |');
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total requirements: ${requirements.length}`);
  lines.push(`- Fully covered: ${coveredCount}`);
  lines.push(`- Coverage: ${requirements.length > 0 ? Math.round((coveredCount / requirements.length) * 100) : 0}%`);
  lines.push('');

  return lines.join('\n');
}

export function generateDefectMatrix(artifacts: ParsedArtifact[]): string {
  const defects = artifacts.filter((a) => a.kind === 'DEFECT');

  const lines: string[] = [
    '# Defect Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  // Summary by severity
  const bySeverity = new Map<string, ParsedArtifact[]>();
  for (const d of defects) {
    const meta = (d.raw.metadata ?? {}) as Record<string, unknown>;
    const severity = typeof meta.severity === 'string' ? meta.severity : 'unknown';
    if (!bySeverity.has(severity)) bySeverity.set(severity, []);
    bySeverity.get(severity)!.push(d);
  }

  lines.push('## Summary by Severity');
  lines.push('');
  lines.push('| Severity | Total | Open | Resolved | Closed |');
  lines.push('|----------|-------|------|----------|--------|');

  const severityOrder = ['critical', 'high', 'medium', 'low', 'unknown'];
  for (const severity of severityOrder) {
    const group = bySeverity.get(severity) ?? [];
    if (group.length === 0) continue;
    const open = group.filter((d) => ['open', 'triaged', 'in-progress', 'draft'].includes(d.status)).length;
    const resolved = group.filter((d) => d.status === 'resolved' || d.status === 'verified').length;
    const closed = group.filter((d) => d.status === 'closed' || d.status === 'rejected').length;
    lines.push(`| ${severity} | ${group.length} | ${open} | ${resolved} | ${closed} |`);
  }

  // Summary by status
  const byStatus = new Map<string, number>();
  for (const d of defects) {
    byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
  }

  lines.push('');
  lines.push('## Summary by Status');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');

  for (const [status, count] of Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${status} | ${count} |`);
  }

  // Open defects detail
  const openDefects = defects.filter((d) =>
    ['open', 'triaged', 'in-progress', 'draft'].includes(d.status),
  );

  if (openDefects.length > 0) {
    lines.push('');
    lines.push('## Open Defects');
    lines.push('');
    lines.push('| ID | Title | Severity | Priority | Status |');
    lines.push('|----|-------|----------|----------|--------|');

    for (const d of openDefects) {
      const meta = (d.raw.metadata ?? {}) as Record<string, unknown>;
      const severity = typeof meta.severity === 'string' ? meta.severity : '-';
      const priority = typeof meta.priority === 'string' ? meta.priority : '-';
      lines.push(`| ${d.id} | ${d.title} | ${severity} | ${priority} | ${d.status} |`);
    }
  }

  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Total defects: ${defects.length}`);
  lines.push(`- Open: ${openDefects.length}`);
  lines.push(`- Resolved/Verified: ${defects.filter((d) => d.status === 'resolved' || d.status === 'verified').length}`);
  lines.push(`- Closed/Rejected: ${defects.filter((d) => d.status === 'closed' || d.status === 'rejected').length}`);
  lines.push('');

  return lines.join('\n');
}

export function generateCoverageMatrix(artifacts: ParsedArtifact[]): string {
  const requirements = artifacts.filter((a) => a.kind === 'SRD' || a.kind === 'PRD');
  const designs = artifacts.filter((a) => a.kind === 'ADR' || a.kind === 'COMPONENT');
  const tests = artifacts.filter((a) => a.kind === 'TESTCASE');

  const lines: string[] = [
    '# Coverage Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Per-Requirement Coverage',
    '',
    '| Requirement | Has Design? | Has Code? | Has Test? |',
    '|-------------|-------------|-----------|-----------|',
  ];

  let withDesign = 0;
  let withCode = 0;
  let withTest = 0;

  for (const req of requirements) {
    const hasDesign = designs.some(
      (d) => d.dependsOn.includes(req.id) || d.references.includes(req.id),
    );
    const hasCode = req.implements.length > 0 ||
      designs.some((d) =>
        (d.dependsOn.includes(req.id) || d.references.includes(req.id)) && d.implements.length > 0,
      );
    const hasTest = tests.some((t) => isLinkedTest(t, req.id));

    if (hasDesign) withDesign++;
    if (hasCode) withCode++;
    if (hasTest) withTest++;

    lines.push(
      `| ${req.id} | ${hasDesign ? 'yes' : '-'} | ${hasCode ? 'yes' : '-'} | ${hasTest ? 'yes' : '-'} |`,
    );
  }

  if (requirements.length === 0) {
    lines.push('| _(no requirements found)_ | - | - | - |');
  }

  const total = requirements.length || 1;
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total requirements: ${requirements.length}`);
  lines.push(`- With design link: ${withDesign} (${Math.round((withDesign / total) * 100)}%)`);
  lines.push(`- With code link: ${withCode} (${Math.round((withCode / total) * 100)}%)`);
  lines.push(`- With test link: ${withTest} (${Math.round((withTest / total) * 100)}%)`);
  lines.push('');

  return lines.join('\n');
}

export function generateImpactMatrix(artifacts: ParsedArtifact[]): string {
  const reverseGraph = buildReverseGraph(artifacts);

  const lines: string[] = [
    '# Impact Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Reverse Dependency Analysis',
    '',
    '| Artifact | Kind | Direct Dependents | Transitive Dependents |',
    '|----------|------|-------------------|----------------------|',
  ];

  // Compute and cache transitive closures
  const transitiveCache = new Map<string, Set<string>>();
  const impactData: { artifact: ParsedArtifact; direct: number; transitive: number }[] = [];

  for (const artifact of artifacts) {
    const directDeps = reverseGraph.get(artifact.id) ?? new Set();
    const transitiveDeps = transitiveClosure(reverseGraph, artifact.id);
    transitiveCache.set(artifact.id, transitiveDeps);
    impactData.push({
      artifact,
      direct: directDeps.size,
      transitive: transitiveDeps.size,
    });
  }

  // Sort by total impact descending
  impactData.sort((a, b) => b.transitive - a.transitive || b.direct - a.direct);

  for (const entry of impactData) {
    lines.push(
      `| ${entry.artifact.id} | ${entry.artifact.kind} | ${entry.direct} | ${entry.transitive} |`,
    );
  }

  if (artifacts.length === 0) {
    lines.push('| _(no artifacts found)_ | - | - | - |');
  }

  // High-impact artifacts (transitive > 2)
  const highImpact = impactData.filter((e) => e.transitive > 2);
  if (highImpact.length > 0) {
    lines.push('');
    lines.push('## High-Impact Artifacts (>2 transitive dependents)');
    lines.push('');
    for (const entry of highImpact) {
      const deps = transitiveCache.get(entry.artifact.id) ?? new Set();
      lines.push(`- **${entry.artifact.id}** (${entry.artifact.kind}): ${Array.from(deps).join(', ')}`);
    }
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total artifacts: ${artifacts.length}`);
  lines.push(`- High-impact (>2 dependents): ${highImpact.length}`);
  lines.push(`- Isolated (0 dependents): ${impactData.filter((e) => e.transitive === 0).length}`);
  lines.push('');

  return lines.join('\n');
}
