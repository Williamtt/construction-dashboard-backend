import * as XLSX from 'xlsx'
import { AppError } from '../../shared/errors.js'
import { applyPccesComputedAmounts } from './pcces-amount-rollup.js'
import type { ParsedPccesRow } from './pcces-xml-parser.js'

/**
 * 每個以 `.` 分隔的 segment 必須為已知的工程項次格式，
 * 用於過濾末尾備注性雜訊列（如「本專案編碼正確率…」）。
 */
const VALID_SEGMENT_RE =
  /^([壹貳參肆伍陸柒捌玖]|[甲乙丙丁戊己庚辛壬癸]|[一二三四五六七八九十百千萬]+|\d+|\(\d+\)|（\d+）)$/u

function isValidItemNo(v: string): boolean {
  if (!v.trim()) return false
  return v
    .trim()
    .split('.')
    .every((seg) => VALID_SEGMENT_RE.test(seg))
}

function getParentItemNo(v: string): string | null {
  const idx = v.lastIndexOf('.')
  return idx < 0 ? null : v.slice(0, idx)
}

interface RawItem {
  itemNo: string
  desc: string
  unit: string
  qty: number | null
  price: number | null
  amount: number | null
  remark: string
}

/**
 * 解析 PCCES 預算書／標單 XLS / XLSX buffer。
 *
 * 支援格式：
 * - 標單詳細表（`標單詳細表` sheet）
 * - 預算詳細表（`預算詳細表` sheet）
 * - 任何名稱含「詳細」且不含「單價」的 sheet
 *
 * 欄位對應（標題列 col A~G）：
 *   A=項次  B=說明  C=單位  D=數量  E=單價  F=複價  G=編碼(備註)
 */
export async function parsePccesXlsBuffer(buffer: Buffer): Promise<{
  documentType: string
  rows: ParsedPccesRow[]
}> {
  // 關卡 4：xlsx 套件解析
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' })
  } catch {
    throw new AppError(
      400,
      'XLS_PARSE_ERROR',
      '無法解析 Excel 檔案，請確認檔案未損毀且副檔名正確（.xls 或 .xlsx）'
    )
  }

  // 關卡 1：找唯一的詳細表 sheet
  const targetNames = workbook.SheetNames.filter(
    (n) => n.includes('詳細') && !n.includes('單價')
  )
  if (targetNames.length === 0) {
    throw new AppError(
      400,
      'XLS_NO_DETAIL_SHEET',
      '找不到詳細表，請確認上傳的是 PCCES 預算書或標單格式（需含「詳細」命名的工作表）'
    )
  }
  if (targetNames.length > 1) {
    throw new AppError(
      400,
      'XLS_AMBIGUOUS_SHEET',
      `找到多個詳細表（${targetNames.join('、')}），無法判斷，請確認格式`
    )
  }

  const sheet = workbook.Sheets[targetNames[0]!]!
  // AOA：每列為陣列，數字格為 number，空格為 null（defval: null）
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  // 關卡 2：找標題列（前 15 列中含「項次」的列）
  let headerRowIdx = -1
  for (let r = 0; r < Math.min(15, aoa.length); r++) {
    const cell0 = String(aoa[r]?.[0] ?? '')
      .replace(/[\s\u3000]/g, '')
    if (cell0 === '項次') {
      headerRowIdx = r
      break
    }
  }
  if (headerRowIdx < 0) {
    throw new AppError(
      400,
      'XLS_NO_HEADER',
      '找不到標題列（項次），請確認使用系統提供的範本格式'
    )
  }

  // 驗證關鍵欄位標題
  const headerRow = aoa[headerRowIdx] ?? []
  const colChecks: [number, (v: string) => boolean, string][] = [
    [2, (v) => v.includes('單') && v.includes('位'), 'C欄應為「單位」'],
    [3, (v) => v.includes('數') && v.includes('量'), 'D欄應為「數量」'],
    [4, (v) => v.includes('單') && v.includes('價'), 'E欄應為「單價」'],
    [5, (v) => v.includes('複') && v.includes('價'), 'F欄應為「複價」'],
  ]
  for (const [col, fn, desc] of colChecks) {
    const val = String(headerRow[col] ?? '')
    if (!fn(val)) {
      throw new AppError(
        400,
        'XLS_HEADER_MISMATCH',
        `標題列欄位格式不符（${desc}），請使用系統提供的範本格式`
      )
    }
  }

  // 逐列解析工項
  const rawItems: RawItem[] = []
  let current: RawItem | null = null

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? []
    const itemNoRaw = String(row[0] ?? '').trim()
    const desc = String(row[1] ?? '').trim()
    const unit = String(row[2] ?? '').trim()
    const qty = typeof row[3] === 'number' ? row[3] : null
    const price = typeof row[4] === 'number' ? row[4] : null
    const amount = typeof row[5] === 'number' ? row[5] : null
    const remark = String(row[6] ?? '').trim()

    if (itemNoRaw && isValidItemNo(itemNoRaw)) {
      // 有效工項列（含父節點）
      current = { itemNo: itemNoRaw, desc, unit, qty, price, amount, remark }
      rawItems.push(current)
    } else if (current && qty === null && price === null && amount === null) {
      // 延續列（描述溢位換行）：合併描述與備註
      if (desc) current.desc += desc
      if (remark && remark !== '*' && remark !== '#') current.remark += ' ' + remark
    }
    // 小計列（itemNo 空但 amount 有值）→ 自動略過
    // 雜訊列（isValidItemNo 為 false）→ 自動略過
  }

  // 關卡 3：至少有 2 個有效工項
  if (rawItems.length < 2) {
    throw new AppError(
      400,
      'XLS_NO_ITEMS',
      `解析到的有效工項數量不足（${rawItems.length} 筆），請確認格式正確`
    )
  }

  // 建立 itemNo → itemKey（1-indexed 整數）映射
  const itemNoToKey = new Map<string, number>()
  rawItems.forEach((it, i) => itemNoToKey.set(it.itemNo, i + 1))

  // 兩次掃描：找出所有父節點 itemNo
  const parentsSet = new Set<string>()
  for (const it of rawItems) {
    const p = getParentItemNo(it.itemNo)
    if (p !== null) parentsSet.add(p)
  }

  // 組裝 ParsedPccesRow[]
  const rows: ParsedPccesRow[] = rawItems.map((it, i) => {
    const itemKey = i + 1
    const parentNo = getParentItemNo(it.itemNo)
    const parentItemKey = parentNo !== null ? (itemNoToKey.get(parentNo) ?? null) : null
    const isLeaf = !parentsSet.has(it.itemNo)
    const itemKind = isLeaf ? 'general' : 'mainItem'

    // refCode：備註欄第一個逗號前的部分
    const firstComma = it.remark.indexOf(',')
    const refCodeRaw =
      firstComma >= 0
        ? it.remark.slice(0, firstComma).trim()
        : it.remark.replace(/[#*]/g, '').trim()
    const refCode = refCodeRaw.slice(0, 200)

    // depth：以 itemNo 中 '.' 的數量 +1 決定
    const depth = it.itemNo.split('.').length

    // path：從根到本節點，每段為「末段項次 說明」以 ' > ' 串接
    const pathSegs: string[] = []
    let cur: string | null = it.itemNo
    while (cur !== null) {
      const idx = itemNoToKey.get(cur)
      if (idx !== undefined) {
        const curItem = rawItems[idx - 1]!
        const lastSeg = cur.split('.').pop()!
        pathSegs.unshift(`${lastSeg} ${curItem.desc}`.trim())
      }
      cur = getParentItemNo(cur)
    }
    const path = pathSegs.join(' > ')

    return {
      itemKey,
      parentItemKey,
      itemNo: it.itemNo,
      itemKind,
      refCode,
      description: it.desc,
      unit: it.unit,
      // 父節點無數量與單價，設預設值後由 applyPccesComputedAmounts rollup
      quantity: it.qty !== null ? String(it.qty) : '1',
      unitPrice: it.price !== null ? String(it.price) : '0',
      amountImported: it.amount !== null ? String(it.amount) : null,
      remark: it.remark,
      percent: null,
      path,
      depth,
    }
  })

  // 重新計算階層金額（葉節點 = qty×price；父節點 = 子項加總）
  applyPccesComputedAmounts(rows)

  return { documentType: 'xls_budget', rows }
}
