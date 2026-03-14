// KSeF API Types

export interface AppConfig {
  apiUrl: string
  token: string
  nip: string
  checkIntervalMinutes: number
  autoCheckEnabled: boolean
  theme: 'light' | 'dark'
}

export const DEFAULT_CONFIG: AppConfig = {
  apiUrl: 'https://api.ksef.mf.gov.pl/v2',
  token: '',
  nip: '',
  checkIntervalMinutes: 15,
  autoCheckEnabled: true,
  theme: 'dark'
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

// IPC Channel types
export interface IpcApi {
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  queryInvoices: (filters: InvoiceQueryFilters) => Promise<QueryInvoicesMetadataResponse>
  downloadInvoice: (ksefNumber: string) => Promise<string>
  startAutoCheck: () => Promise<void>
  stopAutoCheck: () => Promise<void>
  getAutoCheckStatus: () => Promise<boolean>
  checkForUpdates: () => Promise<void>
  onNewInvoices: (callback: (invoices: InvoiceMetadata[]) => void) => () => void
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void
  installUpdate: () => void
}

declare global {
  interface Window {
    api: IpcApi
  }
}
