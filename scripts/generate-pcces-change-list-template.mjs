/**
 * 產生最小可用之 construction_project_change_list.xlsx（PCCES Excel 變更欄位與前端 HEADER_LABELS 一致）。
 * 執行：node scripts/generate-pcces-change-list-template.mjs
 */
import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(
  __dirname,
  '..',
  'resources',
  'templates',
  'construction_project_change_list.xlsx'
)

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="工程變更清單" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>項次</t></is></c>
      <c r="B1" t="inlineStr"><is><t>項目名稱</t></is></c>
      <c r="C1" t="inlineStr"><is><t>單位</t></is></c>
      <c r="D1" t="inlineStr"><is><t>變更後數量</t></is></c>
      <c r="E1" t="inlineStr"><is><t>新增單價</t></is></c>
      <c r="F1" t="inlineStr"><is><t>備註</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>表頭下一列起填資料；「變更後數量」或「新增單價」至少填一欄方會視為變更列（可刪除此說明列）</t></is></c>
    </row>
  </sheetData>
</worksheet>`

await fs.promises.mkdir(path.dirname(outPath), { recursive: true })

const output = fs.createWriteStream(outPath)
const archive = archiver('zip', { zlib: { level: 9 } })
archive.on('error', (err) => {
  throw err
})
archive.pipe(output)
archive.append(contentTypes, { name: '[Content_Types].xml' })
archive.append(rels, { name: '_rels/.rels' })
archive.append(workbook, { name: 'xl/workbook.xml' })
archive.append(workbookRels, { name: 'xl/_rels/workbook.xml.rels' })
archive.append(sheet1, { name: 'xl/worksheets/sheet1.xml' })
await archive.finalize()
await new Promise((resolve, reject) => {
  output.on('close', resolve)
  output.on('error', reject)
})

console.log('Wrote', outPath)
