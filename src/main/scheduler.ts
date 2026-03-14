import { BrowserWindow, Notification, Tray, shell } from 'electron'
import { KsefApiClient } from './ksef-api'
import { getConfig, getLastCheckDate, setLastCheckDate } from './store'
import { upsertInvoices } from './database'
import type { InvoiceMetadata } from '../shared/types'

interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export class InvoiceScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private apiClient: KsefApiClient
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private log: Logger

  constructor(apiClient: KsefApiClient, log?: Logger) {
    this.apiClient = apiClient
    this.log = log || { info: console.log, warn: console.warn, error: console.error }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  setTray(tray: Tray): void {
    this.tray = tray
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
    this.log.info(`Scheduler started. Checking every ${config.checkIntervalMinutes} min`)

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
      this.log.info('Scheduler stopped')
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
    this.log.info('Scheduler: checking for new invoices...')
    try {
      const lastCheck = getLastCheckDate()
      const response = await this.apiClient.checkNewInvoices(lastCheck)

      const invoices = response.invoices || []
      this.log.info(`Scheduler: found ${invoices.length} invoices since ${lastCheck}`)

      if (invoices.length > 0) {
        // Save to local DB
        try {
          upsertInvoices(invoices, 'Subject2')
          this.log.info(`Scheduler: saved ${invoices.length} invoices to local DB`)
        } catch (dbErr: any) {
          this.log.error(`Scheduler: DB save error: ${dbErr.message}`)
        }

        this.notifyNewInvoices(invoices)
      }

      setLastCheckDate(new Date().toISOString())
    } catch (error: any) {
      this.log.error(`Scheduler: error checking invoices: ${error.message}`)
    }
  }

  private notifyNewInvoices(invoices: InvoiceMetadata[]): void {
    // Send to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('new-invoices', invoices)
    }

    const title = 'KSeF Monitor - Nowe faktury'
    const body = `Znaleziono ${invoices.length} nowych faktur`

    // Native Windows toast notification
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show()
    }
    // Tray balloon as backup
    if (this.tray) {
      this.tray.displayBalloon({ title, content: body, iconType: 'info' })
    }
    shell.beep()
  }
}
