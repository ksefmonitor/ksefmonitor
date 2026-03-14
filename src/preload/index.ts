import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, InvoiceQueryFilters, InvoiceMetadata, LogEntry } from '../shared/types'

const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('get-config'),

  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke('save-config', config),

  queryInvoices: (filters: InvoiceQueryFilters) =>
    ipcRenderer.invoke('query-invoices', filters),

  downloadInvoice: (ksefNumber: string): Promise<string> =>
    ipcRenderer.invoke('download-invoice', ksefNumber),

  saveInvoiceXml: (ksefNumber: string, xmlContent: string): Promise<string | null> =>
    ipcRenderer.invoke('save-invoice-xml', ksefNumber, xmlContent),

  startAutoCheck: (): Promise<void> => ipcRenderer.invoke('start-auto-check'),

  stopAutoCheck: (): Promise<void> => ipcRenderer.invoke('stop-auto-check'),

  getAutoCheckStatus: (): Promise<boolean> =>
    ipcRenderer.invoke('get-auto-check-status'),

  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),

  installUpdate: (): void => {
    ipcRenderer.invoke('install-update')
  },

  getAppLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke('get-app-logs'),

  queryLocalInvoices: (params: any): Promise<{ invoices: InvoiceMetadata[]; total: number }> =>
    ipcRenderer.invoke('query-local-invoices', params),

  getLocalStats: (): Promise<{ count: number; totalNet: number; totalGross: number; totalVat: number; oldestDate: string; newestDate: string }> =>
    ipcRenderer.invoke('get-local-stats'),

  syncInvoices: (dateFrom: string): Promise<{ totalSynced: number }> =>
    ipcRenderer.invoke('sync-invoices', dateFrom),

  onSyncProgress: (callback: (progress: { synced: number; subjectType: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { synced: number; subjectType: string }) => {
      callback(progress)
    }
    ipcRenderer.on('sync-progress', handler)
    return () => ipcRenderer.removeListener('sync-progress', handler)
  },

  onNewInvoices: (callback: (invoices: InvoiceMetadata[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, invoices: InvoiceMetadata[]) => {
      callback(invoices)
    }
    ipcRenderer.on('new-invoices', handler)
    return () => ipcRenderer.removeListener('new-invoices', handler)
  },

  onNewLog: (callback: (entry: LogEntry) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: LogEntry) => {
      callback(entry)
    }
    ipcRenderer.on('new-log', handler)
    return () => ipcRenderer.removeListener('new-log', handler)
  },

  onUpdateAvailable: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => {
      callback(info)
    }
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  updateInvoiceStatus: (ksefNumber: string, status: string): Promise<void> =>
    ipcRenderer.invoke('update-invoice-status', ksefNumber, status),

  exportInvoicesXlsx: (invoices: InvoiceMetadata[]): Promise<string | null> =>
    ipcRenderer.invoke('export-invoices-xlsx', invoices),

  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => {
      callback(info)
    }
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
