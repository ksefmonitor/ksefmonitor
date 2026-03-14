import { app, BrowserWindow, ipcMain, Notification, shell, dialog, Tray, Menu, nativeImage } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { KsefApiClient } from './ksef-api'
import { InvoiceScheduler } from './scheduler'
import { getConfig, saveConfig, hasAppPin, verifyAppPin, setAppPin } from './store'
import {
  initDatabase, upsertInvoices, saveInvoiceXmlToDb, getInvoiceXmlFromDb,
  queryLocalInvoices, getLocalStats, getSyncState, setSyncState, closeDatabase,
  updateInvoiceStatus, updateInvoiceStatusBulk, clearAllData
} from './database'
import type { AppConfig, InvoiceQueryFilters, InvoiceMetadata, LogEntry, SubjectType } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let apiClient: KsefApiClient
let scheduler: InvoiceScheduler
const isDev = !app.isPackaged
let dbReady: Promise<void>

// ─── In-memory log storage ────────────────────────────────────────────────────
const MAX_LOGS = 500
const appLogs: LogEntry[] = []

function addLog(level: 'info' | 'warn' | 'error', message: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message
  }
  appLogs.push(entry)
  if (appLogs.length > MAX_LOGS) {
    appLogs.splice(0, appLogs.length - MAX_LOGS)
  }
  // Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-log', entry)
  }
}

// Override ksef-api log object to also store logs
export const appLog = {
  info: (...args: unknown[]) => {
    const msg = args.map(String).join(' ')
    console.log('[KSeF]', ...args)
    addLog('info', msg)
  },
  warn: (...args: unknown[]) => {
    const msg = args.map(String).join(' ')
    console.warn('[KSeF]', ...args)
    addLog('warn', msg)
  },
  error: (...args: unknown[]) => {
    const msg = args.map(String).join(' ')
    console.error('[KSeF]', ...args)
    addLog('error', msg)
  }
}

function showNotification(title: string, body: string): void {
  // Try native Windows toast notification first
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
  }
  // Also show tray balloon as backup
  if (tray) {
    tray.displayBalloon({ title, content: body, iconType: 'info' })
  }
  shell.beep()
}

function getResourcePath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', filename)
  }
  return path.join(__dirname, '../../resources', filename)
}

function createTray(): void {
  const icon = nativeImage.createFromPath(getResourcePath('tray-icon.png'))

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('KSeF Monitor')

  updateTrayMenu()

  tray.on('double-click', () => {
    showMainWindow()
  })
}

function updateTrayMenu(): void {
  if (!tray) return

  const config = getConfig()
  const isMonitoring = scheduler?.isRunning() ?? false

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Otwórz KSeF Monitor',
      type: 'normal',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: isMonitoring ? 'Monitoring aktywny' : 'Monitoring wyłączony',
      type: 'normal',
      enabled: false
    },
    {
      label: isMonitoring ? 'Zatrzymaj monitoring' : 'Uruchom monitoring',
      type: 'normal',
      click: () => {
        if (isMonitoring) {
          scheduler.stop()
        } else {
          scheduler.start()
        }
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: `Interwał: ${config.checkIntervalMinutes} min`,
      type: 'normal',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Sprawdź aktualizacje',
      type: 'normal',
      click: () => {
        if (!isDev) {
          autoUpdater.checkForUpdates().catch(console.error)
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Zamknij',
      type: 'normal',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
}

function getTitleBarColors(theme: string): { color: string; symbolColor: string } {
  if (theme === 'light') {
    return { color: '#FFFFFF', symbolColor: '#1A1A2E' }
  }
  return { color: '#1a1a2e', symbolColor: '#e0e0e0' }
}

function createWindow(): void {
  const appIconPath = getResourcePath('icon.ico')
  const config = getConfig()
  const titleBarColors = getTitleBarColors(config.theme)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: appIconPath,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      ...titleBarColors,
      height: 40
    },
    backgroundColor: config.theme === 'light' ? '#F5F5FA' : '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    // If started with --hidden (autostart), stay in tray
    if (process.argv.includes('--hidden')) {
      return
    }
    mainWindow?.show()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (scheduler) {
    scheduler.setMainWindow(mainWindow)
    if (tray) scheduler.setTray(tray)
  }
}

function setupIpcHandlers(): void {
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-config', () => {
    return getConfig()
  })

  ipcMain.handle('save-config', (_event, config: AppConfig) => {
    saveConfig(config)
    apiClient.updateConfig(config)
    scheduler.restart()
    updateTrayMenu()

    // Update title bar colors when theme changes
    if (mainWindow && !mainWindow.isDestroyed()) {
      const colors = getTitleBarColors(config.theme)
      mainWindow.setTitleBarOverlay({
        ...colors,
        height: 40
      })
    }
  })

  ipcMain.handle('query-invoices', async (_event, filters: InvoiceQueryFilters) => {
    const config = getConfig()
    const activeCompany = config.companies[config.activeCompanyIndex]
    if (!activeCompany?.certPath) {
      return { invoices: [], hasMore: false, isTruncated: false, permanentStorageHwmDate: '' }
    }
    try {
      const response = await apiClient.queryInvoices(filters)
      await dbReady
      if (response.invoices?.length > 0) {
        upsertInvoices(response.invoices, filters.subjectType)
        appLog.info(`Saved ${response.invoices.length} invoices to local DB`)
      }
      return response
    } catch (err: any) {
      appLog.error(`query-invoices: ${err.message}`)
      throw err
    }
  })

  ipcMain.handle('download-invoice', async (_event, ksefNumber: string) => {
    try {
      await dbReady
      const cached = getInvoiceXmlFromDb(ksefNumber)
      if (cached) {
        appLog.info(`Serving XML from local cache: ${ksefNumber}`)
        return cached
      }
      const xml = await apiClient.downloadInvoice(ksefNumber)
      saveInvoiceXmlToDb(ksefNumber, xml)
      return xml
    } catch (err: any) {
      appLog.error(`download-invoice: ${err.message}`)
      throw err
    }
  })

  ipcMain.handle('query-local-invoices', async (_event, params: any) => {
    await dbReady
    return queryLocalInvoices(params)
  })

  ipcMain.handle('get-local-stats', async () => {
    await dbReady
    return getLocalStats()
  })

  ipcMain.handle('sync-invoices', async (_event, dateFrom: string) => {
    await dbReady
    const config = getConfig()
    const activeCompany = config.companies[config.activeCompanyIndex]
    if (!activeCompany?.certPath) {
      throw new Error('Brak skonfigurowanego tokenu')
    }

    appLog.info(`Starting full sync from ${dateFrom}...`)
    let totalSynced = 0
    const dateTo = new Date().toISOString()

    try {
      for (const subjectType of ['Subject1', 'Subject2'] as SubjectType[]) {
        let pageOffset = 0
        const pageSize = 100
        let hasMore = true

        while (hasMore) {
          const response = await apiClient.queryInvoices({
            subjectType,
            dateRange: {
              dateType: 'PermanentStorage',
              from: dateFrom,
              to: dateTo
            },
            sortOrder: 'Desc',
            pageSize,
            pageOffset
          })

          const invoices = response.invoices || []
          if (invoices.length > 0) {
            upsertInvoices(invoices, subjectType)
            totalSynced += invoices.length
            appLog.info(`Synced ${invoices.length} invoices (${subjectType}, page ${pageOffset / pageSize + 1}), total: ${totalSynced}`)

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('sync-progress', { synced: totalSynced, subjectType })
            }
          }

          hasMore = response.hasMore && invoices.length === pageSize
          pageOffset += pageSize
        }
      }

      setSyncState('lastFullSync', new Date().toISOString())
      setSyncState('syncFrom', dateFrom)
      appLog.info(`Full sync complete. Total invoices synced: ${totalSynced}`)
      return { totalSynced }
    } catch (err: any) {
      appLog.error(`sync-invoices: ${err.message}`)
      throw err
    }
  })

  ipcMain.handle('start-auto-check', () => {
    scheduler.start()
    updateTrayMenu()
  })

  ipcMain.handle('stop-auto-check', () => {
    scheduler.stop()
    updateTrayMenu()
  })

  ipcMain.handle('get-auto-check-status', () => {
    return scheduler.isRunning()
  })

  ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
      return { message: 'Aktualizacje dostępne tylko w wersji produkcyjnej' }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return result
    } catch (error) {
      console.error('Update check failed:', error)
      return null
    }
  })

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('save-invoice-xml', async (_event, ksefNumber: string, xmlContent: string) => {
    if (!mainWindow) return
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${ksefNumber}.xml`,
      filters: [{ name: 'XML Files', extensions: ['xml'] }]
    })
    if (!result.canceled && result.filePath) {
      const fs = await import('fs/promises')
      await fs.writeFile(result.filePath, xmlContent, 'utf-8')
      return result.filePath
    }
    return null
  })

  ipcMain.handle('get-app-logs', () => {
    return appLogs
  })

  ipcMain.handle('test-notification', async () => {
    showNotification('KSeF Monitor - Test', 'Powiadomienia działają poprawnie!')
    // Also show dialog as immediate confirmation
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Test powiadomienia',
        message: 'Powiadomienie wysłane!',
        detail: 'Sprawdź zasobnik systemowy (tray) — powinien pojawić się dymek z powiadomieniem.',
        buttons: ['OK']
      })
    }
    appLog.info('Test notification sent')
    return { ok: true }
  })

  ipcMain.handle('update-invoice-status', async (_event, ksefNumber: string, status: string) => {
    await dbReady
    updateInvoiceStatus(ksefNumber, status)
  })

  ipcMain.handle('has-app-pin', () => hasAppPin())
  ipcMain.handle('verify-pin', (_event, pin: string) => verifyAppPin(pin))
  ipcMain.handle('set-app-pin', (_event, pin: string) => setAppPin(pin))

  ipcMain.handle('select-cert-file', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz certyfikat',
      filters: [{ name: 'Certyfikaty', extensions: ['crt', 'cer', 'pem', 'p12', 'pfx'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('select-key-file', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz klucz prywatny',
      filters: [{ name: 'Klucz prywatny', extensions: ['key', 'pem'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('clear-all-data', async () => {
    await dbReady
    const result = clearAllData()
    appLog.info(`Cleared all data: ${result.deleted} invoices deleted`)
    return result
  })

  ipcMain.handle('update-invoice-status-bulk', async (_event, ksefNumbers: string[], status: string) => {
    await dbReady
    updateInvoiceStatusBulk(ksefNumbers, status)
  })

  ipcMain.handle('export-invoices-xlsx', async (_event, invoices: InvoiceMetadata[]) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `faktury_${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return null

    try {
      const { buildCsv } = await import('./xlsx-builder')
      const xlsxBuffer = buildCsv(invoices)
      const fsSync = await import('fs')
      fsSync.writeFileSync(result.filePath!, xlsxBuffer)
      appLog.info(`Exported ${invoices.length} invoices to ${result.filePath}`)
      return result.filePath
    } catch (err: any) {
      appLog.error(`Excel export error: ${err.message}`)
      throw err
    }
  })
}

function setupAutoUpdater(): void {
  if (isDev) {
    console.log('[AutoUpdater] Skipping in dev mode')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: info.version })
    }
    showNotification('KSeF Monitor - Aktualizacja', `Dostępna nowa wersja ${info.version}. Pobieranie...`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version })
    }
    showNotification('KSeF Monitor - Aktualizacja', `Wersja ${info.version} pobrana. Zostanie zainstalowana po restarcie.`)
  })

  autoUpdater.on('error', (error) => {
    console.error('AutoUpdater error:', error)
  })
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

// Custom property to track quitting state
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

// Required for Windows notifications — must match Start Menu shortcut
app.setAppUserModelId(process.execPath)

app.whenReady().then(async () => {
  // Auto-start with Windows
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden']
    })
  }

  const config = getConfig()
  apiClient = new KsefApiClient(config, appLog)
  scheduler = new InvoiceScheduler(apiClient, appLog)

  // Register IPC handlers FIRST so renderer never gets "No handler registered"
  setupIpcHandlers()
  setupAutoUpdater()
  createTray()

  // Init database - dbReady promise lets IPC handlers wait for it
  dbReady = initDatabase().then(() => {
    appLog.info('Local database initialized successfully')
  }).catch((err) => {
    appLog.error('Failed to initialize database:', String(err))
  })
  await dbReady

  createWindow()

  // Start auto-check if enabled and active company has a token
  const activeCompany = config.companies[config.activeCompanyIndex]
  if (config.autoCheckEnabled && activeCompany?.certPath) {
    scheduler.start()
  }

  // Check for updates on startup (only in production)
  if (!isDev) {
    autoUpdater.checkForUpdates().catch(console.error)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  closeDatabase()
})

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in tray
  // App will only quit via tray menu "Zamknij"
})
