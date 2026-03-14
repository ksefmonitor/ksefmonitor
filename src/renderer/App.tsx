import React, { useState, useEffect, useCallback } from 'react'
import { ThemeProvider, CssBaseline, Box, Snackbar, Alert, Button } from '@mui/material'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { darkTheme, lightTheme } from './theme'
import { Sidebar } from './components/Sidebar'
import { InvoicesPage } from './pages/InvoicesPage'
import { SummaryPage } from './pages/SummaryPage'
import { SettingsPage } from './pages/SettingsPage'
import { DashboardPage } from './pages/DashboardPage'
import type { AppConfig, InvoiceMetadata } from '../shared/types'

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [newInvoicesCount, setNewInvoicesCount] = useState(0)
  const [notification, setNotification] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloaded: boolean } | null>(null)

  useEffect(() => {
    window.api.getConfig().then((config: AppConfig) => {
      setTheme(config.theme || 'dark')
    })
  }, [])

  useEffect(() => {
    const unsubNew = window.api.onNewInvoices((invoices: InvoiceMetadata[]) => {
      setNewInvoicesCount((prev) => prev + invoices.length)
      setNotification(`Znaleziono ${invoices.length} nowych faktur!`)
    })

    const unsubAvailable = window.api.onUpdateAvailable((info) => {
      setUpdateInfo({ version: info.version, downloaded: false })
    })

    const unsubDownloaded = window.api.onUpdateDownloaded((info) => {
      setUpdateInfo({ version: info.version, downloaded: true })
    })

    return () => {
      unsubNew()
      unsubAvailable()
      unsubDownloaded()
    }
  }, [])

  const handleThemeChange = useCallback((newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
  }, [])

  return (
    <ThemeProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
      <CssBaseline />
      <HashRouter>
        <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <Sidebar newInvoicesCount={newInvoicesCount} />
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              overflow: 'auto',
              p: 3,
              pt: 6,
              background: (t) =>
                t.palette.mode === 'dark'
                  ? 'linear-gradient(180deg, #0F0F1A 0%, #161625 100%)'
                  : 'linear-gradient(180deg, #F5F5FA 0%, #EEEEF5 100%)',
              minHeight: '100vh'
            }}
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route
                path="/invoices"
                element={
                  <InvoicesPage
                    onViewed={() => setNewInvoicesCount(0)}
                  />
                }
              />
              <Route path="/summary" element={<SummaryPage />} />
              <Route
                path="/settings"
                element={<SettingsPage onThemeChange={handleThemeChange} />}
              />
            </Routes>
          </Box>
        </Box>
      </HashRouter>

      {/* Notification snackbar */}
      <Snackbar
        open={!!notification}
        autoHideDuration={5000}
        onClose={() => setNotification(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setNotification(null)}
          severity="info"
          variant="filled"
          sx={{ borderRadius: 2 }}
        >
          {notification}
        </Alert>
      </Snackbar>

      {/* Update snackbar */}
      <Snackbar
        open={!!updateInfo}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          variant="filled"
          sx={{ borderRadius: 2 }}
          action={
            updateInfo?.downloaded ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => window.api.installUpdate()}
              >
                Zainstaluj teraz
              </Button>
            ) : undefined
          }
        >
          {updateInfo?.downloaded
            ? `Wersja ${updateInfo.version} gotowa do instalacji`
            : `Pobieranie wersji ${updateInfo?.version}...`}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  )
}
