import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, InvoiceQueryFilters, InvoiceMetadata } from '../shared/types'

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

  onNewInvoices: (callback: (invoices: InvoiceMetadata[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, invoices: InvoiceMetadata[]) => {
      callback(invoices)
    }
    ipcRenderer.on('new-invoices', handler)
    return () => ipcRenderer.removeListener('new-invoices', handler)
  },

  onUpdateAvailable: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => {
      callback(info)
    }
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => {
      callback(info)
    }
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
