/**
 * 產生最小可用之 progress_template.xlsx（供開發／repo 預設樣板）。
 * 執行：node scripts/generate-progress-template.mjs
 */
import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '..', 'resources', 'templates', 'progress_template.xlsx')

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
    <sheet name="進度" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>請依專案進度表格式編輯此檔後上傳（可刪除此列說明）</t></is></c>
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
