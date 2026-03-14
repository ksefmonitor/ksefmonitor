import type { InvoiceMetadata } from '../shared/types'

function escapeCsv(value: string): string {
  const s = String(value || '')
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function buildCsv(invoices: InvoiceMetadata[]): Buffer {
  const headers = [
    'Nr faktury', 'Nr KSeF', 'Data wystawienia', 'Sprzedawca', 'NIP sprzedawcy',
    'Nabywca', 'NIP nabywcy', 'Netto', 'VAT', 'Brutto', 'Waluta', 'Status'
  ]

  const lines: string[] = [headers.join(';')]

  for (const inv of invoices) {
    lines.push([
      escapeCsv(inv.invoiceNumber || ''),
      escapeCsv(inv.ksefNumber || ''),
      escapeCsv(inv.issueDate || ''),
      escapeCsv(inv.seller?.name || ''),
      escapeCsv(inv.seller?.nip || ''),
      escapeCsv(inv.buyer?.name || ''),
      escapeCsv(inv.buyer?.identifier?.value || ''),
      (inv.netAmount || 0).toFixed(2),
      (inv.vatAmount || 0).toFixed(2),
      (inv.grossAmount || 0).toFixed(2),
      escapeCsv(inv.currency || 'PLN'),
      escapeCsv(inv.status || 'nowy')
    ].join(';'))
  }

  // BOM + content for Excel to detect UTF-8
  const bom = Buffer.from([0xEF, 0xBB, 0xBF])
  return Buffer.concat([bom, Buffer.from(lines.join('\r\n'), 'utf-8')])
}
