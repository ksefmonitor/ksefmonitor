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
  Button
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import type { AppConfig, InvoiceMetadata } from '../../shared/types'

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

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setError(null)
    try {
      const config: AppConfig = await window.api.getConfig()
      const status = await window.api.getAutoCheckStatus()
      setAutoCheckRunning(status)

      if (!config.token) {
        setHasToken(false)
        setLoading(false)
        return
      }
      setHasToken(true)

      const now = new Date()
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

      const response = await window.api.queryInvoices({
        subjectType: 'Subject1',
        dateRange: {
          dateType: 'PermanentStorage',
          from: monthAgo.toISOString(),
          to: now.toISOString()
        },
        sortOrder: 'Desc',
        pageSize: 10,
        pageOffset: 0
      })

      const invoices = response.invoices || []
      setRecentInvoices(invoices)
      setStats({
        count: invoices.length,
        totalNet: invoices.reduce((s, i) => s + (i.netAmount || 0), 0),
        totalGross: invoices.reduce((s, i) => s + (i.grossAmount || 0), 0),
        totalVat: invoices.reduce((s, i) => s + (i.vatAmount || 0), 0)
      })
    } catch (err: any) {
      console.error('Dashboard load error:', err)
      setError(err?.message || 'Błąd połączenia z API KSeF')
    } finally {
      setLoading(false)
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
                title="Faktury (ostatni miesiąc)"
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
                    ? 'Brak faktur w ostatnim miesiącu.'
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
