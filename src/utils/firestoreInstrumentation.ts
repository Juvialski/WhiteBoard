/**
 * Development-only Firestore Instrumentation Wrapper
 * Tracks application-level logical reads, writes, and deletes by call-site label.
 *
 * NOTE: This is for application-level operation tracking and debugging.
 * It is completely disabled/tree-shaken in production and never writes telemetry to Firestore.
 */

export interface OperationStats {
  reads: number;
  writes: number;
  deletes: number;
  byLabel: Record<string, { reads: number; writes: number; deletes: number }>;
}

let isEnabled = process.env.NODE_ENV !== 'production';

const stats: OperationStats = {
  reads: 0,
  writes: 0,
  deletes: 0,
  byLabel: {},
};

export function setInstrumentationEnabled(enabled: boolean): void {
  isEnabled = enabled;
}

export function resetInstrumentationStats(): void {
  stats.reads = 0;
  stats.writes = 0;
  stats.deletes = 0;
  stats.byLabel = {};
}

export function getInstrumentationStats(): OperationStats {
  return {
    reads: stats.reads,
    writes: stats.writes,
    deletes: stats.deletes,
    byLabel: JSON.parse(JSON.stringify(stats.byLabel)),
  };
}

export function trackOperation(
  type: 'read' | 'write' | 'delete',
  label: string,
  count: number = 1
): void {
  if (!isEnabled || count <= 0) return;

  if (type === 'read') stats.reads += count;
  else if (type === 'write') stats.writes += count;
  else if (type === 'delete') stats.deletes += count;

  if (!stats.byLabel[label]) {
    stats.byLabel[label] = { reads: 0, writes: 0, deletes: 0 };
  }

  if (type === 'read') stats.byLabel[label].reads += count;
  else if (type === 'write') stats.byLabel[label].writes += count;
  else if (type === 'delete') stats.byLabel[label].deletes += count;
}

export function printInstrumentationSummary(): void {
  if (!isEnabled) return;
  console.log('================ [FIRESTORE INSTRUMENTATION SUMMARY] ================');
  console.log(`Total Logical Reads:   ${stats.reads}`);
  console.log(`Total Logical Writes:  ${stats.writes}`);
  console.log(`Total Logical Deletes: ${stats.deletes}`);
  console.log('Breakdown by Call-Site Label:');
  Object.entries(stats.byLabel).forEach(([label, counts]) => {
    console.log(
      `  - ${label.padEnd(25)} | Reads: ${counts.reads} | Writes: ${counts.writes} | Deletes: ${counts.deletes}`
    );
  });
  console.log('=====================================================================');
}
