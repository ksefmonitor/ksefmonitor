import * as zlib from 'zlib'
import type { InvoiceMetadata } from '../shared/types'

function escXml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function colLetter(i: number): string {
  return String.fromCharCode(65 + i)
}

export function buildXlsx(invoices: InvoiceMetadata[]): Buffer {
  const headers = [
    'Nr faktury', 'Nr KSeF', 'Data wystawienia', 'Sprzedawca', 'NIP sprzedawcy',
    'Nabywca', 'NIP nabywcy', 'Netto', 'VAT', 'Brutto', 'Waluta', 'Status'
  ]

  let rows = '<row r="1">'
  headers.forEach((h, i) => {
    rows += `<c r="${colLetter(i)}1" t="inlineStr"><is><t>${escXml(h)}</t></is></c>`
  })
  rows += '</row>'

  invoices.forEach((inv, idx) => {
    const r = idx + 2
    const vals: (string | number)[] = [
      inv.invoiceNumber || '', inv.ksefNumber || '', inv.issueDate || '',
      inv.seller?.name || '', inv.seller?.nip || '',
      inv.buyer?.name || '', inv.buyer?.identifier?.value || '',
      inv.netAmount || 0, inv.vatAmount || 0, inv.grossAmount || 0,
      inv.currency || 'PLN', inv.status || 'nowy'
    ]
    rows += `<row r="${r}">`
    vals.forEach((v, i) => {
      const col = colLetter(i)
      if (i >= 7 && i <= 9) {
        rows += `<c r="${col}${r}"><v>${Number(v).toFixed(2)}</v></c>`
      } else {
        rows += `<c r="${col}${r}" t="inlineStr"><is><t>${escXml(String(v))}</t></is></c>`
      }
    })
    rows += '</row>'
  })

  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,

    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,

    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Faktury" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,

    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,

    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rows}</sheetData>
</worksheet>`
  }

  // Build ZIP manually using Node.js zlib (no external deps)
  return createZip(files)
}

// ─── Minimal ZIP builder ───────────────────────────────────────────────────

function createZip(files: Record<string, string>): Buffer {
  const entries: { name: Buffer; compressed: Buffer; crc32: number; uncompressedSize: number; compressedSize: number; offset: number }[] = []

  let offset = 0
  const parts: Buffer[] = []

  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, 'utf-8')
    const contentBuffer = Buffer.from(content, 'utf-8')
    const compressed = zlib.deflateRawSync(contentBuffer)
    const crc = crc32(contentBuffer)

    const entry = {
      name: nameBuffer,
      compressed,
      crc32: crc,
      uncompressedSize: contentBuffer.length,
      compressedSize: compressed.length,
      offset
    }
    entries.push(entry)

    // Local file header (30 + nameLen + compressedLen)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0) // signature
    localHeader.writeUInt16LE(20, 4)         // version needed
    localHeader.writeUInt16LE(0, 6)          // flags
    localHeader.writeUInt16LE(8, 8)          // compression: deflate
    localHeader.writeUInt16LE(0, 10)         // mod time
    localHeader.writeUInt16LE(0, 12)         // mod date
    localHeader.writeUInt32LE(crc, 14)       // crc32
    localHeader.writeUInt32LE(compressed.length, 18)   // compressed size
    localHeader.writeUInt32LE(contentBuffer.length, 22) // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26)   // name length
    localHeader.writeUInt16LE(0, 28)                   // extra length

    parts.push(localHeader, nameBuffer, compressed)
    offset += 30 + nameBuffer.length + compressed.length
  }

  // Central directory
  const centralStart = offset
  for (const entry of entries) {
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0) // signature
    centralHeader.writeUInt16LE(20, 4)         // version made by
    centralHeader.writeUInt16LE(20, 6)         // version needed
    centralHeader.writeUInt16LE(0, 8)          // flags
    centralHeader.writeUInt16LE(8, 10)         // compression
    centralHeader.writeUInt16LE(0, 12)         // mod time
    centralHeader.writeUInt16LE(0, 14)         // mod date
    centralHeader.writeUInt32LE(entry.crc32, 16)
    centralHeader.writeUInt32LE(entry.compressedSize, 20)
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24)
    centralHeader.writeUInt16LE(entry.name.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra length
    centralHeader.writeUInt16LE(0, 32) // comment length
    centralHeader.writeUInt16LE(0, 34) // disk start
    centralHeader.writeUInt16LE(0, 36) // internal attrs
    centralHeader.writeUInt32LE(0, 38) // external attrs
    centralHeader.writeUInt32LE(entry.offset, 42) // local header offset

    parts.push(centralHeader, entry.name)
    offset += 46 + entry.name.length
  }

  const centralSize = offset - centralStart

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)  // signature
  eocd.writeUInt16LE(0, 4)           // disk number
  eocd.writeUInt16LE(0, 6)           // central dir disk
  eocd.writeUInt16LE(entries.length, 8)   // entries on disk
  eocd.writeUInt16LE(entries.length, 10)  // total entries
  eocd.writeUInt32LE(centralSize, 12)     // central dir size
  eocd.writeUInt32LE(centralStart, 16)    // central dir offset
  eocd.writeUInt16LE(0, 20)              // comment length

  parts.push(eocd)

  return Buffer.concat(parts)
}

// ─── CRC32 ─────────────────────────────────────────────────────────────────

const crc32Table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  }
  crc32Table[i] = c
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
