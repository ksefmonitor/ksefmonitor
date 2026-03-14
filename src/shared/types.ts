// KSeF API Types

/** Extract NIP from a KSeF token string. Token format: XXXXXXXX-EC-...|nip-XXXXXXXXXX|... */
export function extractNipFromToken(token: string): string {
  const match = token.match(/\|nip-(\d+)\|/)
  return match ? match[1] : ''
}

export interface CompanyConfig {
  name: string
  token: string
  nip: string // auto-extracted from token
}

export interface AppConfig {
  apiUrl: string
  companies: CompanyConfig[]
  activeCompanyIndex: number
  checkIntervalMinutes: number
  autoCheckEnabled: boolean
  theme: 'light' | 'dark'
  integrations: IntegrationConfig[]
  // Legacy fields kept for backward compat migration
  token?: string
  nip?: string
}

export const DEFAULT_CONFIG: AppConfig = {
  apiUrl: 'https://api.ksef.mf.gov.pl/v2',
  companies: [],
  activeCompanyIndex: 0,
  checkIntervalMinutes: 15,
  autoCheckEnabled: true,
  theme: 'dark',
  integrations: []
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

// Auth
export interface AuthChallengeRequest {
  contextNip: string
}

export interface AuthChallengeResponse {
  challenge: string
  timestamp: string
}

export interface TokenRedeemRequest {
  authorizationCode: string
}

export interface TokenRedeemResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface TokenRefreshRequest {
  refreshToken: string
}

// Invoice metadata
export interface InvoiceMetadata {
  ksefNumber: string
  invoiceNumber: string
  issueDate: string
  invoicingDate: string
  acquisitionDate: string
  permanentStorageDate: string
  seller: {
    nip: string
    name: string
  }
  buyer: {
    identifier: {
      type: string
      value: string
    }
    name: string
  }
  netAmount: number
  grossAmount: number
  vatAmount: number
  currency: string
  invoicingMode: string
  invoiceType: string
  formCode: {
    systemCode: string
    schemaVersion: string
    value: string
  }
  isSelfInvoicing: boolean
  hasAttachment: boolean
  invoiceHash: string
  status?: string
}

// Query filters
export type DateType = 'PermanentStorage' | 'Invoicing' | 'Issue'
export type SortOrder = 'Asc' | 'Desc'
export type SubjectType = 'Subject1' | 'Subject2' | 'Subject3'

export interface InvoiceQueryFilters {
  subjectType: SubjectType
  dateRange: {
    dateType: DateType
    from: string
    to: string
  }
  amount?: {
    type: 'Netto' | 'Brutto'
    from?: number
    to?: number
  }
  currencyCodes?: string[]
  invoiceTypes?: string[]
  pageSize?: number
  pageOffset?: number
  sortOrder?: SortOrder
}

export interface QueryInvoicesMetadataResponse {
  hasMore: boolean
  isTruncated: boolean
  permanentStorageHwmDate: string
  invoices: InvoiceMetadata[]
}

// Summary
export interface InvoiceSummary {
  totalInvoices: number
  totalNet: number
  totalGross: number
  totalVat: number
  byCurrency: Record<string, { net: number; gross: number; vat: number; count: number }>
  bySeller: Record<string, { name: string; net: number; gross: number; vat: number; count: number }>
  byMonth: Record<string, { net: number; gross: number; vat: number; count: number }>
  dateFrom: string
  dateTo: string
}

// Integrations
export interface IntegrationConfig {
  id: string
  name: string
  description: string
  icon: string // MUI icon name
  enabled: boolean
  syncEnabled: boolean
  settings: Record<string, string>
}

export const AVAILABLE_INTEGRATIONS: Omit<IntegrationConfig, 'enabled' | 'syncEnabled' | 'settings'>[] = [
  {
    id: 'infover',
    name: 'Infover',
    description: 'Synchronizacja faktur z systemem Infover ERP. Automatyczne przesyłanie nowych faktur i aktualizacja statusów.',
    icon: 'Storage',
    settings: {}
  },
  {
    id: 'webhook',
    name: 'Webhook',
    description: 'Wysyłaj powiadomienia o nowych fakturach na dowolny endpoint HTTP (Slack, Teams, własny serwer).',
    icon: 'Webhook',
    settings: {}
  }
]

// IPC Channel types
export interface LocalStats {
  count: number
  totalNet: number
  totalGross: number
  totalVat: number
  oldestDate: string
  newestDate: string
}

export interface IpcApi {
  getAppVersion: () => Promise<string>
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  queryInvoices: (filters: InvoiceQueryFilters) => Promise<QueryInvoicesMetadataResponse>
  downloadInvoice: (ksefNumber: string) => Promise<string>
  startAutoCheck: () => Promise<void>
  stopAutoCheck: () => Promise<void>
  getAutoCheckStatus: () => Promise<boolean>
  checkForUpdates: () => Promise<void>
  getAppLogs: () => Promise<LogEntry[]>
  queryLocalInvoices: (params: any) => Promise<{ invoices: InvoiceMetadata[]; total: number }>
  getLocalStats: () => Promise<LocalStats>
  syncInvoices: (dateFrom: string) => Promise<{ totalSynced: number }>
  onNewInvoices: (callback: (invoices: InvoiceMetadata[]) => void) => () => void
  onNewLog: (callback: (entry: LogEntry) => void) => () => void
  onSyncProgress: (callback: (progress: { synced: number; subjectType: string }) => void) => () => void
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void
  installUpdate: () => void
  saveInvoiceXml: (ksefNumber: string, xmlContent: string) => Promise<string | null>
  updateInvoiceStatus: (ksefNumber: string, status: string) => Promise<void>
  exportInvoicesXlsx: (invoices: InvoiceMetadata[]) => Promise<string | null>
  testNotification: () => Promise<void>
  updateInvoiceStatusBulk: (ksefNumbers: string[], status: string) => Promise<void>
  clearAllData: () => Promise<{ deleted: number }>
  hasAppPin: () => Promise<boolean>
  verifyPin: (pin: string) => Promise<boolean>
  setAppPin: (pin: string) => Promise<void>
}

declare global {
  interface Window {
    api: IpcApi
  }
}
