import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  alpha,
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  Button,
  LinearProgress
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import CloudSyncRoundedIcon from '@mui/icons-material/CloudSyncRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import type { AppConfig, InvoiceMetadata, LocalStats } from '../../shared/types'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  gradient: string
}

function StatCard({ title, value, icon, gradient }: StatCardProps) {
  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
        }
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5, fontWeight: 500 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              background: gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [autoCheckRunning, setAutoCheckRunning] = useState(false)
  const [recentInvoices, setRecentInvoices] = useState<InvoiceMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [hasToken, setHasToken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({ totalNet: 0, totalGross: 0, totalVat: 0, count: 0 })
  const [localStats, setLocalStats] = useState<LocalStats | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)

  useEffect(() => {
    loadDashboard()
    const unsub = window.api.onSyncProgress((progress) => {
      setSyncProgress(progress.synced)
    })
    return () => unsub()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setError(null)
    try {
      const config: AppConfig = await window.api.getConfig()
      const status = await window.api.getAutoCheckStatus()
      setAutoCheckRunning(status)

      const activeCompany = config.companies?.[config.activeCompanyIndex]
      if (!activeCompany?.token) {
        setHasToken(false)
        setLoading(false)
        return
      }
      setHasToken(true)

      // Always load local DB stats first
      try {
        const ls = await window.api.getLocalStats()
        setLocalStats(ls)
        // Show local data on cards immediately
        if (ls.count > 0) {
          setStats({ count: ls.count, totalNet: ls.totalNet, totalGross: ls.totalGross, totalVat: ls.totalVat })
          const localData = await window.api.queryLocalInvoices({ sortOrder: 'Desc', pageSize: 10, pageOffset: 0 })
          setRecentInvoices(localData.invoices)
        }
      } catch { /* DB not ready yet */ }

      // Then try to fetch fresh data from API
      try {
        const now = new Date()
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())

        const dateRange = {
          dateType: 'PermanentStorage' as const,
          from: threeMonthsAgo.toISOString(),
          to: now.toISOString()
        }

        const [sellerRes, buyerRes] = await Promise.all([
          window.api.queryInvoices({
            subjectType: 'Subject1',
            dateRange,
            sortOrder: 'Desc',
            pageSize: 50,
            pageOffset: 0
          }),
          window.api.queryInvoices({
            subjectType: 'Subject2',
            dateRange,
            sortOrder: 'Desc',
            pageSize: 50,
            pageOffset: 0
          })
        ])

        const allInvoices = [...(sellerRes.invoices || []), ...(buyerRes.invoices || [])]
        const uniqueMap = new Map<string, InvoiceMetadata>()
        for (const inv of allInvoices) {
          if (!uniqueMap.has(inv.ksefNumber)) {
            uniqueMap.set(inv.ksefNumber, inv)
          }
        }
        const invoices = Array.from(uniqueMap.values())
          .sort((a, b) => new Date(b.permanentStorageDate || b.issueDate).getTime() - new Date(a.permanentStorageDate || a.issueDate).getTime())

        setRecentInvoices(invoices.slice(0, 10))
        setStats({
          count: invoices.length,
          totalNet: invoices.reduce((s, i) => s + (i.netAmount || 0), 0),
          totalGross: invoices.reduce((s, i) => s + (i.grossAmount || 0), 0),
          totalVat: invoices.reduce((s, i) => s + (i.vatAmount || 0), 0)
        })

        // Refresh local stats after API data was saved
        const ls = await window.api.getLocalStats()
        setLocalStats(ls)
      } catch (apiErr: any) {
        console.error('API error (using local data):', apiErr)
        setError('Brak połączenia z API KSeF — wyświetlam dane lokalne')
      }
    } catch (err: any) {
      console.error('Dashboard load error:', err)
      setError(err?.message || 'Błąd ładowania dashboardu')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncProgress(0)
    setError(null)
    try {
      // Sync from 1 Feb 2026 as requested
      const result = await window.api.syncInvoices('2026-02-01T00:00:00.000Z')
      const ls = await window.api.getLocalStats()
      setLocalStats(ls)
      await loadDashboard()
    } catch (err: any) {
      setError(err?.message || 'Błąd synchronizacji')
    } finally {
      setSyncing(false)
    }
  }

  async function toggleAutoCheck() {
    if (autoCheckRunning) {
      await window.api.stopAutoCheck()
    } else {
      await window.api.startAutoCheck()
    }
    setAutoCheckRunning(!autoCheckRunning)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Dashboard
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Przegląd ostatnich faktur z KSeF
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            icon={
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: autoCheckRunning ? '#4ECB71' : '#FF6B6B',
                  animation: autoCheckRunning ? 'pulse 2s infinite' : 'none',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.5 },
                    '100%': { opacity: 1 }
                  }
                }}
              />
            }
            label={autoCheckRunning ? 'Monitoring aktywny' : 'Monitoring wyłączony'}
            variant="outlined"
            sx={{ borderRadius: 2, px: 1 }}
          />
          <Tooltip title={autoCheckRunning ? 'Zatrzymaj' : 'Uruchom'}>
            <IconButton onClick={toggleAutoCheck} color="primary" size="small" disabled={!hasToken}>
              {autoCheckRunning ? <StopRoundedIcon /> : <PlayArrowRoundedIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Odśwież">
            <IconButton onClick={loadDashboard} color="primary" size="small">
              <SyncRoundedIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* No token warning */}
      {!loading && !hasToken && (
        <Alert
          severity="warning"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<SettingsRoundedIcon />}
              onClick={() => navigate('/settings')}
            >
              Konfiguruj
            </Button>
          }
        >
          Nie skonfigurowano tokenu API. Przejdź do ustawień aby podać token autoryzacyjny i adres API KSeF.
        </Alert>
      )}

      {/* Sync section */}
      {!loading && hasToken && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <StorageRoundedIcon sx={{ color: 'primary.main' }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Lokalna baza: {localStats?.count || 0} faktur
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {localStats?.oldestDate
                      ? `Od ${new Date(localStats.oldestDate).toLocaleDateString('pl-PL')} do ${new Date(localStats.newestDate).toLocaleDateString('pl-PL')}`
                      : 'Brak danych — zsynchronizuj aby pobrać faktury'}
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="contained"
                startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <CloudSyncRoundedIcon />}
                onClick={handleSync}
                disabled={syncing}
                size="small"
              >
                {syncing ? `Synchronizacja... (${syncProgress})` : 'Synchronizuj od 01.02.2026'}
              </Button>
            </Box>
            {syncing && (
              <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />
            )}
          </CardContent>
        </Card>
      )}

      {/* API error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Faktury (ostatnie 3 miesiące)"
                value={stats.count}
                icon={<ReceiptLongRoundedIcon sx={{ color: '#fff' }} />}
                gradient="linear-gradient(135deg, #6C63FF 0%, #918AFF 100%)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Wartość netto"
                value={formatCurrency(stats.totalNet)}
                icon={<TrendingUpRoundedIcon sx={{ color: '#fff' }} />}
                gradient="linear-gradient(135deg, #00D4AA 0%, #33DDBB 100%)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Wartość brutto"
                value={formatCurrency(stats.totalGross)}
                icon={<AccountBalanceRoundedIcon sx={{ color: '#fff' }} />}
                gradient="linear-gradient(135deg, #FFB347 0%, #FFCC80 100%)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="VAT"
                value={formatCurrency(stats.totalVat)}
                icon={<AccountBalanceRoundedIcon sx={{ color: '#fff' }} />}
                gradient="linear-gradient(135deg, #FF6B6B 0%, #FF9999 100%)"
              />
            </Grid>
          </Grid>

          {/* Recent invoices */}
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Ostatnie faktury
              </Typography>
              {recentInvoices.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                  {hasToken
                    ? 'Brak faktur w ostatnich 3 miesiącach.'
                    : 'Skonfiguruj połączenie z API aby zobaczyć faktury.'}
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {recentInvoices.map((inv) => (
                    <Box
                      key={inv.ksefNumber}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 2,
                        borderRadius: 2,
                        transition: 'background 0.15s',
                        '&:hover': {
                          background: (t) => alpha(t.palette.primary.main, 0.06)
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            background: (t) => alpha(t.palette.primary.main, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <ReceiptLongRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {inv.invoiceNumber || inv.ksefNumber}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {inv.seller?.name || 'Nieznany sprzedawca'}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatCurrency(inv.grossAmount || 0)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('pl-PL') : '-'}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  )
}
