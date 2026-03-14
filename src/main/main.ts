import { app, BrowserWindow, ipcMain, Notification, shell, dialog, Tray, Menu, nativeImage } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { KsefApiClient } from './ksef-api'
import { InvoiceScheduler } from './scheduler'
import { getConfig, saveConfig } from './store'
import {
  initDatabase, upsertInvoices, saveInvoiceXmlToDb, getInvoiceXmlFromDb,
  queryLocalInvoices, getLocalStats, getSyncState, setSyncState, closeDatabase,
  updateInvoiceStatus, updateInvoiceStatusBulk
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
  // Use tray balloon - works reliably on Windows without AppUserModelId issues
  if (tray) {
    tray.displayBalloon({
      title,
      content: body,
      iconType: 'info'
    })
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
    if (!activeCompany?.token) {
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
    if (!activeCompany?.token) {
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

  ipcMain.handle('test-notification', () => {
    showNotification('KSeF Monitor - Test', 'Powiadomienia działają poprawnie!')
    appLog.info('Test notification sent')
    return { ok: true }
  })

  ipcMain.handle('update-invoice-status', async (_event, ksefNumber: string, status: string) => {
    await dbReady
    updateInvoiceStatus(ksefNumber, status)
  })

  ipcMain.handle('update-invoice-status-bulk', async (_event, ksefNumbers: string[], status: string) => {
    await dbReady
    updateInvoiceStatusBulk(ksefNumbers, status)
  })

  ipcMain.handle('export-invoices-xlsx', async (_event, invoices: InvoiceMetadata[]) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `faktury_${new Date().toISOString().split('T')[0]}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return null

    // Build XLSX manually (simple XML-based xlsx)
    const fs = await import('fs/promises')
    const path = await import('path')

    const escXml = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const formatNum = (n: number) => n.toFixed(2)

    let rows = ''
    // Header row
    rows += '<row r="1">'
    const headers = ['Nr faktury', 'Nr KSeF', 'Data wystawienia', 'Sprzedawca', 'NIP sprzedawcy', 'Nabywca', 'NIP nabywcy', 'Netto', 'VAT', 'Brutto', 'Waluta', 'Status']
    headers.forEach((h, i) => {
      const col = String.fromCharCode(65 + i)
      rows += `<c r="${col}1" t="inlineStr"><is><t>${escXml(h)}</t></is></c>`
    })
    rows += '</row>'

    // Data rows
    invoices.forEach((inv, idx) => {
      const r = idx + 2
      const vals = [
        inv.invoiceNumber, inv.ksefNumber, inv.issueDate,
        inv.seller?.name, inv.seller?.nip,
        inv.buyer?.name, inv.buyer?.identifier?.value,
        formatNum(inv.netAmount || 0), formatNum(inv.vatAmount || 0), formatNum(inv.grossAmount || 0),
        inv.currency || 'PLN', inv.status || 'nowy'
      ]
      rows += `<row r="${r}">`
      vals.forEach((v, i) => {
        const col = String.fromCharCode(65 + i)
        // Numbers for columns H, I, J (indices 7, 8, 9)
        if (i >= 7 && i <= 9) {
          rows += `<c r="${col}${r}"><v>${v}</v></c>`
        } else {
          rows += `<c r="${col}${r}" t="inlineStr"><is><t>${escXml(String(v || ''))}</t></is></c>`
        }
      })
      rows += '</row>'
    })

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rows}</sheetData>
</worksheet>`

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Faktury" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

    // Create xlsx (zip) using yazl (lightweight zip library)
    try {
      const yazl = require('yazl')
      const { createWriteStream } = require('fs')

      const zipfile = new yazl.ZipFile()
      zipfile.addBuffer(Buffer.from(contentTypes, 'utf-8'), '[Content_Types].xml')
      zipfile.addBuffer(Buffer.from(rels, 'utf-8'), '_rels/.rels')
      zipfile.addBuffer(Buffer.from(workbook, 'utf-8'), 'xl/workbook.xml')
      zipfile.addBuffer(Buffer.from(wbRels, 'utf-8'), 'xl/_rels/workbook.xml.rels')
      zipfile.addBuffer(Buffer.from(sheetXml, 'utf-8'), 'xl/worksheets/sheet1.xml')
      zipfile.end()

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(result.filePath!)
        output.on('close', resolve)
        output.on('error', reject)
        zipfile.outputStream.pipe(output)
      })

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

// Required for Windows notifications
app.setAppUserModelId('pl.ksef.monitor')

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
  closeDatabase()
})

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in tray
  // App will only quit via tray menu "Zamknij"
})
