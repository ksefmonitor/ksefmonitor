import { BrowserWindow } from 'electron'
import { KsefApiClient } from './ksef-api'
import { getConfig, getLastCheckDate, setLastCheckDate } from './store'
import type { InvoiceMetadata } from '../shared/types'

export class InvoiceScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private apiClient: KsefApiClient
  private mainWindow: BrowserWindow | null = null

  constructor(apiClient: KsefApiClient) {
    this.apiClient = apiClient
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  start(): void {
    if (this.intervalId) {
      this.stop()
    }

    const config = getConfig()
    const activeCompany = config.companies?.[config.activeCompanyIndex]
    if (!config.autoCheckEnabled || !activeCompany?.token) {
      return
    }

    const intervalMs = config.checkIntervalMinutes * 60 * 1000

    // Run immediately on start
    this.checkForNewInvoices()

    this.intervalId = setInterval(() => {
      this.checkForNewInvoices()
    }, intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null
  }

  restart(): void {
    this.stop()
    const config = getConfig()
    this.apiClient.updateConfig(config)
    this.start()
  }

  private async checkForNewInvoices(): Promise<void> {
    try {
      const lastCheck = getLastCheckDate()
      const response = await this.apiClient.checkNewInvoices(lastCheck)

      if (response.invoices && response.invoices.length > 0) {
        this.notifyNewInvoices(response.invoices)
      }

      setLastCheckDate(new Date().toISOString())
    } catch (error) {
      console.error('Error checking for new invoices:', error)
    }
  }

  private notifyNewInvoices(invoices: InvoiceMetadata[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('new-invoices', invoices)
    }
  }
}
