import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePrivate } from './private-files.mjs';
import type { MigrationReport } from './migrations.js';

export const defaultReportDirectory = fileURLToPath(new URL('../../../../.openai/reports/migrations/', import.meta.url));
export function saveMigrationReport(report: MigrationReport, directory = defaultReportDirectory): boolean {
  try {
    report.reporting = 'written';
    writePrivate(join(resolve(directory), `${report.run_id}.json`), report);
    return true;
  } catch {
    // Reporting failure cannot undo a committed transaction.
    report.reporting = 'failed';
    return false;
  }
}
export function reportSummary(report: MigrationReport): string {
  return `Migrations ${report.result}: ${report.attempted.filter(item => item.outcome === 'applied_committed').length} applied; stage=${report.stage}; version=${report.failed_version ?? 'unknown'}; database=${report.database_outcome}; report=${report.reporting}; run=${report.run_id}.`;
}
