import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { InvoiceMetadata } from '../shared/types'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

function getDbPath(): string {
  if (!dbPath) {
    dbPath = path.join(app.getPath('userData'), 'invoices.db')
  }
  return dbPath
}

function saveToFile(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(getDbPath(), buffer)
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs()
  const filePath = getDbPath()

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      ksefNumber TEXT PRIMARY KEY,
      invoiceNumber TEXT,
      issueDate TEXT,
      invoicingDate TEXT,
      acquisitionDate TEXT,
      permanentStorageDate TEXT,
      sellerNip TEXT,
      sellerName TEXT,
      buyerIdentifierType TEXT,
      buyerIdentifierValue TEXT,
      buyerName TEXT,
      netAmount REAL,
      grossAmount REAL,
      vatAmount REAL,
      currency TEXT,
      invoicingMode TEXT,
      invoiceType TEXT,
      formCodeSystem TEXT,
      formCodeSchema TEXT,
      formCodeValue TEXT,
      isSelfInvoicing INTEGER,
      hasAttachment INTEGER,
      invoiceHash TEXT,
      subjectType TEXT,
      syncedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_xml (
      ksefNumber TEXT PRIMARY KEY,
      xml TEXT NOT NULL,
      downloadedAt TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // Create indexes (IF NOT EXISTS)
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issueDate)')
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_seller ON invoices(sellerNip)')
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_permanent ON invoices(permanentStorageDate)')

  saveToFile()
}

function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function upsertInvoices(invoices: InvoiceMetadata[], subjectType: string): number {
  const database = getDb()
  const now = new Date().toISOString()
  let count = 0

  database.run('BEGIN TRANSACTION')
  try {
    for (const inv of invoices) {
      database.run(
        `INSERT OR REPLACE INTO invoices (
          ksefNumber, invoiceNumber, issueDate, invoicingDate, acquisitionDate,
          permanentStorageDate, sellerNip, sellerName, buyerIdentifierType,
          buyerIdentifierValue, buyerName, netAmount, grossAmount, vatAmount,
          currency, invoicingMode, invoiceType, formCodeSystem, formCodeSchema,
          formCodeValue, isSelfInvoicing, hasAttachment, invoiceHash,
          subjectType, syncedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inv.ksefNumber,
          inv.invoiceNumber || '',
          inv.issueDate || '',
          inv.invoicingDate || '',
          inv.acquisitionDate || '',
          inv.permanentStorageDate || '',
          inv.seller?.nip || '',
          inv.seller?.name || '',
          inv.buyer?.identifier?.type || '',
          inv.buyer?.identifier?.value || '',
          inv.buyer?.name || '',
          inv.netAmount || 0,
          inv.grossAmount || 0,
          inv.vatAmount || 0,
          inv.currency || 'PLN',
          inv.invoicingMode || '',
          inv.invoiceType || '',
          inv.formCode?.systemCode || '',
          inv.formCode?.schemaVersion || '',
          inv.formCode?.value || '',
          inv.isSelfInvoicing ? 1 : 0,
          inv.hasAttachment ? 1 : 0,
          inv.invoiceHash || '',
          subjectType,
          now
        ]
      )
      count++
    }
    database.run('COMMIT')
  } catch (err) {
    database.run('ROLLBACK')
    throw err
  }

  saveToFile()
  return count
}

export function saveInvoiceXmlToDb(ksefNumber: string, xml: string): void {
  const database = getDb()
  database.run(
    'INSERT OR REPLACE INTO invoice_xml (ksefNumber, xml, downloadedAt) VALUES (?, ?, ?)',
    [ksefNumber, xml, new Date().toISOString()]
  )
  saveToFile()
}

export function getInvoiceXmlFromDb(ksefNumber: string): string | null {
  const database = getDb()
  const stmt = database.prepare('SELECT xml FROM invoice_xml WHERE ksefNumber = ?')
  stmt.bind([ksefNumber])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return (row.xml as string) || null
  }
  stmt.free()
  return null
}

function rowToInvoiceMetadata(row: Record<string, any>): InvoiceMetadata {
  return {
    ksefNumber: row.ksefNumber as string,
    invoiceNumber: row.invoiceNumber as string,
    issueDate: row.issueDate as string,
    invoicingDate: row.invoicingDate as string,
    acquisitionDate: row.acquisitionDate as string,
    permanentStorageDate: row.permanentStorageDate as string,
    seller: { nip: row.sellerNip as string, name: row.sellerName as string },
    buyer: {
      identifier: { type: row.buyerIdentifierType as string, value: row.buyerIdentifierValue as string },
      name: row.buyerName as string
    },
    netAmount: row.netAmount as number,
    grossAmount: row.grossAmount as number,
    vatAmount: row.vatAmount as number,
    currency: row.currency as string,
    invoicingMode: row.invoicingMode as string,
    invoiceType: row.invoiceType as string,
    formCode: {
      systemCode: row.formCodeSystem as string,
      schemaVersion: row.formCodeSchema as string,
      value: row.formCodeValue as string
    },
    isSelfInvoicing: !!(row.isSelfInvoicing as number),
    hasAttachment: !!(row.hasAttachment as number),
    invoiceHash: row.invoiceHash as string
  }
}

function queryRows(sql: string, params: any[]): Record<string, any>[] {
  const database = getDb()
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const results: Record<string, any>[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

function queryOne(sql: string, params: any[] = []): Record<string, any> | null {
  const database = getDb()
  const stmt = database.prepare(sql)
  stmt.bind(params)
  let result: Record<string, any> | null = null
  if (stmt.step()) {
    result = stmt.getAsObject()
  }
  stmt.free()
  return result
}

export interface LocalQueryParams {
  subjectType?: string
  dateFrom?: string
  dateTo?: string
  dateType?: string
  searchText?: string
  sortOrder?: 'Asc' | 'Desc'
  pageSize?: number
  pageOffset?: number
}

export function queryLocalInvoices(params: LocalQueryParams): { invoices: InvoiceMetadata[]; total: number } {
  const conditions: string[] = []
  const values: any[] = []

  if (params.subjectType) {
    conditions.push('subjectType = ?')
    values.push(params.subjectType)
  }

  const dateCol = params.dateType === 'Issue' ? 'issueDate'
    : params.dateType === 'Invoicing' ? 'invoicingDate'
    : 'permanentStorageDate'

  if (params.dateFrom) {
    conditions.push(`${dateCol} >= ?`)
    values.push(params.dateFrom)
  }
  if (params.dateTo) {
    conditions.push(`${dateCol} <= ?`)
    values.push(params.dateTo)
  }

  if (params.searchText) {
    conditions.push('(invoiceNumber LIKE ? OR ksefNumber LIKE ? OR sellerName LIKE ? OR buyerName LIKE ?)')
    const like = `%${params.searchText}%`
    values.push(like, like, like, like)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const order = params.sortOrder === 'Asc' ? 'ASC' : 'DESC'
  const limit = params.pageSize || 25
  const offset = params.pageOffset || 0

  const countRow = queryOne(`SELECT COUNT(*) as cnt FROM invoices ${where}`, values)
  const rows = queryRows(
    `SELECT * FROM invoices ${where} ORDER BY permanentStorageDate ${order} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  )

  return {
    invoices: rows.map(rowToInvoiceMetadata),
    total: (countRow?.cnt as number) || 0
  }
}

export function getLocalInvoiceCount(): number {
  const row = queryOne('SELECT COUNT(*) as cnt FROM invoices')
  return (row?.cnt as number) || 0
}

export function getLocalStats(): { count: number; totalNet: number; totalGross: number; totalVat: number; oldestDate: string; newestDate: string } {
  const row = queryOne(`
    SELECT COUNT(*) as count,
           COALESCE(SUM(netAmount), 0) as totalNet,
           COALESCE(SUM(grossAmount), 0) as totalGross,
           COALESCE(SUM(vatAmount), 0) as totalVat,
           MIN(permanentStorageDate) as oldestDate,
           MAX(permanentStorageDate) as newestDate
    FROM invoices
  `)
  return {
    count: (row?.count as number) || 0,
    totalNet: (row?.totalNet as number) || 0,
    totalGross: (row?.totalGross as number) || 0,
    totalVat: (row?.totalVat as number) || 0,
    oldestDate: (row?.oldestDate as string) || '',
    newestDate: (row?.newestDate as string) || ''
  }
}

export function getSyncState(key: string): string | null {
  const row = queryOne('SELECT value FROM sync_state WHERE key = ?', [key])
  return (row?.value as string) || null
}

export function setSyncState(key: string, value: string): void {
  const database = getDb()
  database.run('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value])
  saveToFile()
}

export function closeDatabase(): void {
  if (db) {
    saveToFile()
    db.close()
    db = null
  }
}
