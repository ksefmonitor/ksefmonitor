import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  MenuItem,
  Grid,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  alpha,
  Checkbox,
  Pagination,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded'
import { InvoiceViewer } from '../components/InvoiceViewer'
import type {
  InvoiceMetadata,
  DateType,
  SortOrder,
  SubjectType
} from '../../shared/types'

interface InvoicesPageProps {
  onViewed: () => void
}

function cleanError(err: any): string {
  const msg = err?.message || String(err)
  const match = msg.match(/Error invoking remote method '[^']+': (?:Error: )?(.+)/)
  return match ? match[1] : msg
}

export function InvoicesPage({ onViewed }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<InvoiceMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewXml, setPreviewXml] = useState<string | null>(null)
  const [previewNumber, setPreviewNumber] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [dateType, setDateType] = useState<DateType>('PermanentStorage')
  const [sortOrder, setSortOrder] = useState<SortOrder>('Desc')
  const [subjectType, setSubjectType] = useState<SubjectType>('Subject2')
  const [searchText, setSearchText] = useState('')

  const PAGE_SIZE = 25

  const [apiError, setApiError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    onViewed()
    fetchInvoices(1)
  }, [onViewed])

  const fetchInvoices = useCallback(async (pageNum: number = 1) => {
    setLoading(true)
    setApiError(null)
    try {
      const result = await window.api.queryLocalInvoices({
        subjectType,
        dateFrom: new Date(dateFrom).toISOString(),
        dateTo: new Date(dateTo + 'T23:59:59').toISOString(),
        dateType,
        searchText: searchText || undefined,
        sortOrder,
        pageSize: PAGE_SIZE,
        pageOffset: (pageNum - 1) * PAGE_SIZE
      })
      setInvoices(result.invoices || [])
      setTotalCount(result.total)
    } catch (error: any) {
      console.error('Error fetching invoices:', error)
      setApiError(cleanError(error))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, dateType, sortOrder, subjectType, searchText])

  useEffect(() => {
    fetchInvoices(page)
  }, [page])

  function handleSearch() {
    setPage(1)
    fetchInvoices(1)
  }

  function toggleSelect(ksefNumber: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(ksefNumber)) {
        next.delete(ksefNumber)
      } else {
        next.add(ksefNumber)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(invoices.map((i) => i.ksefNumber)))
    }
  }

  async function handleStatusChange(ksefNumber: string, newStatus: string) {
    try {
      await window.api.updateInvoiceStatus(ksefNumber, newStatus)
      setInvoices(prev => prev.map(inv =>
        inv.ksefNumber === ksefNumber ? { ...inv, status: newStatus } : inv
      ))
    } catch (error) {
      console.error('Status update error:', error)
    }
  }

  async function handleExportXlsx() {
    const selected = invoices.filter(i => selectedIds.has(i.ksefNumber))
    if (selected.length === 0) return
    try {
      await window.api.exportInvoicesXlsx(selected)
    } catch (error) {
      console.error('Export error:', error)
    }
  }

  async function handleDownload(ksefNumber: string) {
    try {
      const xml = await window.api.downloadInvoice(ksefNumber)
      await window.api.saveInvoiceXml(ksefNumber, xml)
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  async function handlePreview(inv: InvoiceMetadata) {
    try {
      setPreviewNumber(inv.invoiceNumber || inv.ksefNumber)
      const xml = await window.api.downloadInvoice(inv.ksefNumber)
      setPreviewXml(xml)
    } catch (error) {
      console.error('Preview error:', error)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Faktury
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Przeglądaj faktury z lokalnej bazy danych
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FilterAltRoundedIcon />}
            onClick={() => setShowFilters(!showFilters)}
            size="small"
          >
            Filtry
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      {showFilters && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  label="Podmiot"
                  select
                  value={subjectType}
                  onChange={(e) => setSubjectType(e.target.value as SubjectType)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="Subject1">Sprzedawca (wystawione)</MenuItem>
                  <MenuItem value="Subject2">Nabywca (otrzymane)</MenuItem>
                  <MenuItem value="Subject3">Inne</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  label="Data od"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  label="Data do"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  label="Typ daty"
                  select
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value as DateType)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="PermanentStorage">Data utrwalenia</MenuItem>
                  <MenuItem value="Invoicing">Data fakturowania</MenuItem>
                  <MenuItem value="Issue">Data wystawienia</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  label="Sortowanie"
                  select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="Desc">Najnowsze</MenuItem>
                  <MenuItem value="Asc">Najstarsze</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  fullWidth
                  startIcon={<SearchRoundedIcon />}
                  sx={{ height: 40 }}
                >
                  Szukaj
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Search bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              placeholder="Szukaj po numerze, sprzedawcy, nabywcy..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              fullWidth
              size="small"
              InputProps={{
                startAdornment: <SearchRoundedIcon sx={{ color: 'text.secondary', mr: 1 }} />
              }}
            />
            {totalCount > 0 && (
              <Chip label={`${totalCount} faktur`} size="small" variant="outlined" />
            )}
            {selectedIds.size > 0 && (() => {
              const selected = invoices.filter(i => selectedIds.has(i.ksefNumber))
              const sumNet = selected.reduce((s, i) => s + (i.netAmount || 0), 0)
              const sumGross = selected.reduce((s, i) => s + (i.grossAmount || 0), 0)
              return (
                <>
                  <Chip
                    label={`Zaznaczono: ${selectedIds.size}`}
                    color="primary"
                    onDelete={() => setSelectedIds(new Set())}
                  />
                  <Chip label={`Netto: ${formatCurrency(sumNet)}`} size="small" variant="outlined" color="primary" />
                  <Chip label={`Brutto: ${formatCurrency(sumGross)}`} size="small" variant="outlined" color="primary" />
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<FileDownloadRoundedIcon />}
                    onClick={handleExportXlsx}
                  >
                    Excel
                  </Button>
                </>
              )
            })()}
          </Box>
        </CardContent>
      </Card>

      {/* Error */}
      {apiError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {apiError}
        </Alert>
      )}

      {/* Invoice list */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {/* Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr 1.2fr 1.2fr 110px 110px 90px 100px 100px',
              p: 2,
              borderBottom: (t) => `1px solid ${t.palette.divider}`,
              background: (t) => alpha(t.palette.primary.main, 0.04)
            }}
          >
            <Checkbox
              size="small"
              checked={selectedIds.size === invoices.length && invoices.length > 0}
              indeterminate={selectedIds.size > 0 && selectedIds.size < invoices.length}
              onChange={toggleSelectAll}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              NR FAKTURY
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              SPRZEDAWCA
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              NABYWCA
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'right' }}>
              NETTO
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'right' }}>
              BRUTTO
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'center' }}>
              DATA
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'center' }}>
              STATUS
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'center' }}>
              AKCJE
            </Typography>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : invoices.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Brak faktur — zsynchronizuj dane na stronie Dashboard
              </Typography>
            </Box>
          ) : (
            invoices.map((inv) => (
              <Box
                key={inv.ksefNumber}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr 1.2fr 1.2fr 110px 110px 90px 100px 100px',
                  p: 2,
                  alignItems: 'center',
                  borderBottom: (t) => `1px solid ${t.palette.divider}`,
                  transition: 'background 0.15s',
                  '&:hover': {
                    background: (t) => alpha(t.palette.primary.main, 0.04)
                  },
                  ...(selectedIds.has(inv.ksefNumber)
                    ? { background: (t) => alpha(t.palette.primary.main, 0.08) }
                    : inv.status === 'zsynchronizowany'
                      ? { background: (t) => alpha(t.palette.success.main, 0.08) }
                      : {})
                }}
              >
                <Checkbox
                  size="small"
                  checked={selectedIds.has(inv.ksefNumber)}
                  onChange={() => toggleSelect(inv.ksefNumber)}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    {inv.invoiceNumber || '-'}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', fontSize: '0.65rem', wordBreak: 'break-all' }}
                  >
                    {inv.ksefNumber}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {inv.seller?.name || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    NIP: {inv.seller?.nip || '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {inv.buyer?.name || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {inv.buyer?.identifier?.value || '-'}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{ textAlign: 'right', fontWeight: 500, fontSize: '0.8rem' }}
                >
                  {formatCurrency(inv.netAmount || 0)}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8rem' }}
                >
                  {formatCurrency(inv.grossAmount || 0)}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textAlign: 'center', fontSize: '0.8rem' }}
                >
                  {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('pl-PL') : '-'}
                </Typography>
                <TextField
                  select
                  value={inv.status || 'nowy'}
                  onChange={(e) => handleStatusChange(inv.ksefNumber, e.target.value)}
                  size="small"
                  variant="standard"
                  sx={{
                    '& .MuiInput-input': {
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      color: inv.status === 'zsynchronizowany' ? 'success.main' : 'warning.main',
                      fontWeight: 600
                    }
                  }}
                >
                  <MenuItem value="nowy">Nowy</MenuItem>
                  <MenuItem value="zsynchronizowany">Zsynchronizowany</MenuItem>
                </TextField>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                  <Tooltip title="Podgląd">
                    <IconButton size="small" onClick={() => handlePreview(inv)}>
                      <VisibilityRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Pobierz XML">
                    <IconButton size="small" onClick={() => handleDownload(inv.ksefNumber)}>
                      <DownloadRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))
          )}

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Pagination
                count={Math.ceil(totalCount / PAGE_SIZE)}
                page={page}
                onChange={(_e, p) => setPage(p)}
                color="primary"
                shape="rounded"
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Invoice Preview Dialog */}
      <Dialog
        open={!!previewXml}
        onClose={() => setPreviewXml(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>
          Podgląd faktury: {previewNumber}
        </DialogTitle>
        <DialogContent>
          {previewXml && <InvoiceViewer xml={previewXml} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewXml(null)}>Zamknij</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
