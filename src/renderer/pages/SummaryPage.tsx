import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  MenuItem,
  CircularProgress,
  alpha,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material'
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded'
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded'
import type { InvoiceMetadata, InvoiceSummary, DateType } from '../../shared/types'

export function SummaryPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [dateType, setDateType] = useState<DateType>('PermanentStorage')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [invoices, setInvoices] = useState<InvoiceMetadata[]>([])

  async function generateSummary() {
    setLoading(true)
    try {
      // Fetch all invoices for the period
      let allInvoices: InvoiceMetadata[] = []
      let pageOffset = 0
      let hasMore = true

      while (hasMore) {
        const response = await window.api.queryInvoices({
          subjectType: 'Subject1',
          dateRange: {
            dateType,
            from: new Date(dateFrom).toISOString(),
            to: new Date(dateTo + 'T23:59:59').toISOString()
          },
          sortOrder: 'Asc',
          pageSize: 100,
          pageOffset
        })

        allInvoices = [...allInvoices, ...(response.invoices || [])]
        hasMore = response.hasMore
        pageOffset += 100

        // Safety limit
        if (pageOffset > 5000) break
      }

      setInvoices(allInvoices)
      setSummary(calculateSummary(allInvoices, dateFrom, dateTo))
    } catch (error) {
      console.error('Error generating summary:', error)
    } finally {
      setLoading(false)
    }
  }

  function calculateSummary(
    invoices: InvoiceMetadata[],
    from: string,
    to: string
  ): InvoiceSummary {
    const byCurrency: InvoiceSummary['byCurrency'] = {}
    const bySeller: InvoiceSummary['bySeller'] = {}
    const byMonth: InvoiceSummary['byMonth'] = {}

    let totalNet = 0
    let totalGross = 0
    let totalVat = 0

    for (const inv of invoices) {
      const net = inv.netAmount || 0
      const gross = inv.grossAmount || 0
      const vat = inv.vatAmount || 0

      totalNet += net
      totalGross += gross
      totalVat += vat

      // By currency
      const currency = inv.currency || 'PLN'
      if (!byCurrency[currency]) {
        byCurrency[currency] = { net: 0, gross: 0, vat: 0, count: 0 }
      }
      byCurrency[currency].net += net
      byCurrency[currency].gross += gross
      byCurrency[currency].vat += vat
      byCurrency[currency].count++

      // By seller
      const sellerKey = inv.seller?.nip || 'unknown'
      if (!bySeller[sellerKey]) {
        bySeller[sellerKey] = { name: inv.seller?.name || 'Nieznany', net: 0, gross: 0, vat: 0, count: 0 }
      }
      bySeller[sellerKey].net += net
      bySeller[sellerKey].gross += gross
      bySeller[sellerKey].vat += vat
      bySeller[sellerKey].count++

      // By month
      const date = inv.issueDate || inv.invoicingDate
      if (date) {
        const monthKey = date.substring(0, 7) // YYYY-MM
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { net: 0, gross: 0, vat: 0, count: 0 }
        }
        byMonth[monthKey].net += net
        byMonth[monthKey].gross += gross
        byMonth[monthKey].vat += vat
        byMonth[monthKey].count++
      }
    }

    return {
      totalInvoices: invoices.length,
      totalNet,
      totalGross,
      totalVat,
      byCurrency,
      bySeller,
      byMonth,
      dateFrom: from,
      dateTo: to
    }
  }

  const formatCurrency = (amount: number, currency = 'PLN') =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amount)

  const formatMonth = (key: string) => {
    const [year, month] = key.split('-')
    const monthNames = [
      'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
    ]
    return `${monthNames[parseInt(month) - 1]} ${year}`
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          Podsumowania
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Generuj raporty i podsumowania z wybranego okresu
        </Typography>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
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
            <Grid item xs={12} sm={6} md={3}>
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
            <Grid item xs={12} sm={6} md={3}>
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
            <Grid item xs={12} sm={6} md={3}>
              <Button
                variant="contained"
                onClick={generateSummary}
                fullWidth
                startIcon={<CalculateRoundedIcon />}
                disabled={loading}
                sx={{ height: 40 }}
              >
                {loading ? 'Generowanie...' : 'Generuj raport'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {summary && !loading && (
        <>
          {/* Overview cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ p: 2.5, textAlign: 'center', '&:last-child': { pb: 2.5 } }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Liczba faktur
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {summary.totalInvoices}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ p: 2.5, textAlign: 'center', '&:last-child': { pb: 2.5 } }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Suma netto
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'secondary.main' }}>
                    {formatCurrency(summary.totalNet)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ p: 2.5, textAlign: 'center', '&:last-child': { pb: 2.5 } }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Suma brutto
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
                    {formatCurrency(summary.totalGross)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent sx={{ p: 2.5, textAlign: 'center', '&:last-child': { pb: 2.5 } }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Suma VAT
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'error.main' }}>
                    {formatCurrency(summary.totalVat)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* By month */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <BarChartRoundedIcon sx={{ color: 'primary.main' }} />
                <Typography variant="h6">Podsumowanie miesięczne</Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Miesiąc</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Ilość</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Netto</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>VAT</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Brutto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(summary.byMonth)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([month, data]) => (
                        <TableRow key={month} hover>
                          <TableCell>{formatMonth(month)}</TableCell>
                          <TableCell align="center">
                            <Chip label={data.count} size="small" color="primary" variant="outlined" />
                          </TableCell>
                          <TableCell align="right">{formatCurrency(data.net)}</TableCell>
                          <TableCell align="right">{formatCurrency(data.vat)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatCurrency(data.gross)}
                          </TableCell>
                        </TableRow>
                      ))}
                    <TableRow sx={{ background: (t) => alpha(t.palette.primary.main, 0.06) }}>
                      <TableCell sx={{ fontWeight: 700 }}>RAZEM</TableCell>
                      <TableCell align="center">
                        <Chip label={summary.totalInvoices} size="small" color="primary" />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatCurrency(summary.totalNet)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatCurrency(summary.totalVat)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatCurrency(summary.totalGross)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          {/* By seller */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Podsumowanie wg sprzedawców
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Sprzedawca</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>NIP</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Ilość</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Netto</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>VAT</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Brutto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(summary.bySeller)
                      .sort(([, a], [, b]) => b.gross - a.gross)
                      .map(([nip, data]) => (
                        <TableRow key={nip} hover>
                          <TableCell>{data.name}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {nip}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={data.count} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell align="right">{formatCurrency(data.net)}</TableCell>
                          <TableCell align="right">{formatCurrency(data.vat)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatCurrency(data.gross)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          {/* By currency (if multiple) */}
          {Object.keys(summary.byCurrency).length > 1 && (
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Podsumowanie wg walut
                </Typography>
                <Grid container spacing={2}>
                  {Object.entries(summary.byCurrency).map(([currency, data]) => (
                    <Grid item xs={12} sm={6} md={4} key={currency}>
                      <Card variant="outlined">
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Chip label={currency} size="small" color="primary" />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {data.count} faktur
                            </Typography>
                          </Box>
                          <Divider sx={{ my: 1 }} />
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption">Netto:</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {formatCurrency(data.net, currency)}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption">Brutto:</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {formatCurrency(data.gross, currency)}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  )
}
