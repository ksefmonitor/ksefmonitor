import { app, BrowserWindow, ipcMain, Notification, shell, dialog, Tray, Menu, nativeImage } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { KsefApiClient } from './ksef-api'
import { InvoiceScheduler } from './scheduler'
import { getConfig, saveConfig } from './store'
import type { AppConfig, InvoiceQueryFilters, LogEntry } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let apiClient: KsefApiClient
let scheduler: InvoiceScheduler
const isDev = !app.isPackaged

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

  scheduler.setMainWindow(mainWindow)
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
    if (!activeCompany?.token) {
      return { invoices: [], hasMore: false, isTruncated: false, permanentStorageHwmDate: '' }
    }
    return apiClient.queryInvoices(filters)
  })

  ipcMain.handle('download-invoice', async (_event, ksefNumber: string) => {
    return apiClient.downloadInvoice(ksefNumber)
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
    new Notification({
      title: 'KSeF Monitor - Aktualizacja',
      body: `Dostępna nowa wersja ${info.version}. Pobieranie...`
    }).show()
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version })
    }
    new Notification({
      title: 'KSeF Monitor - Aktualizacja',
      body: `Wersja ${info.version} pobrana. Zostanie zainstalowana po restarcie.`
    }).show()
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

app.whenReady().then(() => {
  const config = getConfig()
  apiClient = new KsefApiClient(config, appLog)
  scheduler = new InvoiceScheduler(apiClient)

  setupIpcHandlers()
  setupAutoUpdater()
  createTray()
  createWindow()

  // Start auto-check if enabled and active company has a token
  const activeCompany = config.companies[config.activeCompanyIndex]
  if (config.autoCheckEnabled && activeCompany?.token) {
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
})

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in tray
  // App will only quit via tray menu "Zamknij"
})
