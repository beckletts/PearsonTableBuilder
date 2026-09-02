/**
 * Downloading a course plan.
 *
 * Kept separate from courseBuilder.ts so the analysis logic stays free of the
 * xlsx dependency, and so the owner's workspace and a visitor on the shared
 * builder produce exactly the same file.
 */
import * as XLSX from 'xlsx';
import {
  exportFileName, planExportRows,
  type CoursePlanConfig, type PlanAnalysis,
} from './courseBuilder';

/**
 * Two sheets: the programme itself, and the guide's advice for it, so the file
 * still makes sense to someone who was not in the room when it was built.
 */
export function downloadPlanWorkbook(title: string, config: CoursePlanConfig, analysis: PlanAnalysis): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(planExportRows(config, analysis)),
    'Programme',
  );

  const summary: Record<string, string | number>[] = [
    { Item: 'Course plan', Detail: title },
    { Item: 'Subject focus', Detail: config.subject ?? 'None' },
    { Item: 'Level', Detail: config.level ?? 'None' },
    { Item: 'First teach year', Detail: config.firstTeachYear },
    { Item: 'Qualifications', Detail: analysis.quals.length },
    { Item: 'Total GLH', Detail: analysis.totalGlh },
  ];
  if (analysis.unknownGlhCount > 0) {
    summary.push({ Item: 'GLH not yet published', Detail: `${analysis.unknownGlhCount} qualification(s)` });
  }
  for (const check of analysis.checks) {
    summary.push({ Item: `Check — ${check.title}`, Detail: check.detail });
  }
  if (analysis.suggestions.length > 0) {
    summary.push({ Item: 'The guide suggests considering', Detail: analysis.suggestions.join('; ') });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Advice');

  XLSX.writeFile(wb, `${exportFileName(title)}.xlsx`);
}
