import path from 'path'

/** 進度計畫 Excel 樣板（與 repo `resources/templates/` 對齊；部署時 cwd 須為專案根） */
export const PROGRESS_PLAN_EXCEL_TEMPLATE_FILE = 'progress_template.xlsx'

export function progressPlanExcelTemplateAbsPath(): string {
  return path.join(process.cwd(), 'resources', 'templates', PROGRESS_PLAN_EXCEL_TEMPLATE_FILE)
}

/** PCCES Excel 變更用清單樣板（與 `PccesExcelChangeView` 表頭一致） */
export const CONSTRUCTION_PROJECT_CHANGE_LIST_EXCEL_TEMPLATE_FILE =
  'construction_project_change_list.xlsx'

export function constructionProjectChangeListExcelTemplateAbsPath(): string {
  return path.join(
    process.cwd(),
    'resources',
    'templates',
    CONSTRUCTION_PROJECT_CHANGE_LIST_EXCEL_TEMPLATE_FILE
  )
}

/** PCCES 預算書 XLS 匯入範本（供使用者下載後填寫並上傳） */
export const PCCES_BUDGET_TEMPLATE_FILE = 'pcces_budget_template.xls'

export function pccesBudgetTemplateAbsPath(): string {
  return path.join(process.cwd(), 'resources', 'templates', PCCES_BUDGET_TEMPLATE_FILE)
}
