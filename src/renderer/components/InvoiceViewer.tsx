import React, { useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  alpha,
  IconButton,
  Tooltip,
  Tab,
  Tabs
} from '@mui/material'
import CodeRoundedIcon from '@mui/icons-material/CodeRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'

interface ParsedInvoice {
  // Header
  formCode: string
  formVariant: string
  createdDate: string
  systemInfo: string

  // Seller (Podmiot1)
  sellerNip: string
  sellerName: string
  sellerAddress1: string
  sellerAddress2: string
  sellerPhone: string
  sellerEmail: string
  sellerPrefix: string
  sellerEori: string
  sellerKrs: string
  sellerRegon: string

  // Buyer (Podmiot2)
  buyerNip: string
  buyerName: string
  buyerAddress1: string
  buyerAddress2: string
  buyerPhone: string
  buyerEmail: string
  buyerClientNr: string

  // Invoice data (Fa)
  currency: string
  issueDate: string
  invoiceNumber: string
  periodFrom: string
  periodTo: string
  totalNet: string
  totalVat: string
  totalGross: string
  invoiceType: string

  // Line items
  lines: {
    nr: string
    description: string
    unit: string
    quantity: string
    unitPrice: string
    discount: string
    netAmount: string
    vatAmount: string
    vatRate: string
  }[]

  // Additional descriptions
  additionalDescriptions: { key: string; value: string; lineNr?: string }[]

  // Payment
  paymentDue: string
  paymentForm: string
  bankAccount: string
  contractNumber: string

  // Footer
  footerLines: string[]
  fullCompanyName: string
}

function getTextContent(parent: Element | Document, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0]
  return el?.textContent?.trim() || ''
}

function getNestedText(parent: Element | Document, ...tags: string[]): string {
  let current: Element | Document = parent
  for (const tag of tags) {
    const found = (current as Element).getElementsByTagName
      ? (current as Element).getElementsByTagName(tag)[0]
      : (current as Document).getElementsByTagName(tag)[0]
    if (!found) return ''
    current = found
  }
  return current?.textContent?.trim() || ''
}

function paymentFormLabel(code: string): string {
  const forms: Record<string, string> = {
    '1': 'Gotówka',
    '2': 'Karta',
    '3': 'Bon',
    '4': 'Czek',
    '5': 'Kredyt',
    '6': 'Przelew',
    '7': 'Mobilna'
  }
  return forms[code] || code
}

function parseInvoiceXml(xml: string): ParsedInvoice | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')

    const podmiot1 = doc.getElementsByTagName('Podmiot1')[0]
    const podmiot2 = doc.getElementsByTagName('Podmiot2')[0]
    const fa = doc.getElementsByTagName('Fa')[0]
    const stopka = doc.getElementsByTagName('Stopka')[0]
    const naglowek = doc.getElementsByTagName('Naglowek')[0]
    const rejestry = doc.getElementsByTagName('Rejestry')[0]

    // Line items
    const lines: ParsedInvoice['lines'] = []
    const wiersze = fa?.getElementsByTagName('FaWiersz') || []
    for (let i = 0; i < wiersze.length; i++) {
      const w = wiersze[i]
      lines.push({
        nr: getTextContent(w, 'NrWierszaFa'),
        description: getTextContent(w, 'P_7'),
        unit: getTextContent(w, 'P_8A'),
        quantity: getTextContent(w, 'P_8B'),
        unitPrice: getTextContent(w, 'P_9A'),
        discount: getTextContent(w, 'P_10'),
        netAmount: getTextContent(w, 'P_11'),
        vatAmount: getTextContent(w, 'P_11Vat'),
        vatRate: getTextContent(w, 'P_12')
      })
    }

    // Additional descriptions
    const additionalDescriptions: ParsedInvoice['additionalDescriptions'] = []
    const opisy = fa?.getElementsByTagName('DodatkowyOpis') || []
    for (let i = 0; i < opisy.length; i++) {
      const o = opisy[i]
      additionalDescriptions.push({
        key: getTextContent(o, 'Klucz'),
        value: getTextContent(o, 'Wartosc'),
        lineNr: getTextContent(o, 'NrWiersza') || undefined
      })
    }

    // Footer lines
    const footerLines: string[] = []
    const infos = stopka?.getElementsByTagName('Informacje') || []
    for (let i = 0; i < infos.length; i++) {
      const text = getTextContent(infos[i], 'StopkaFaktury').trim()
      if (text) footerLines.push(text)
    }

    return {
      formCode: naglowek ? getTextContent(naglowek, 'KodFormularza') : '',
      formVariant: naglowek ? getTextContent(naglowek, 'WariantFormularza') : '',
      createdDate: naglowek ? getTextContent(naglowek, 'DataWytworzeniaFa') : '',
      systemInfo: naglowek ? getTextContent(naglowek, 'SystemInfo') : '',

      sellerNip: podmiot1 ? getNestedText(podmiot1, 'DaneIdentyfikacyjne', 'NIP') : '',
      sellerName: podmiot1 ? getNestedText(podmiot1, 'DaneIdentyfikacyjne', 'Nazwa') : '',
      sellerAddress1: podmiot1 ? getNestedText(podmiot1, 'Adres', 'AdresL1') : '',
      sellerAddress2: podmiot1 ? getNestedText(podmiot1, 'Adres', 'AdresL2') : '',
      sellerPhone: podmiot1 ? getNestedText(podmiot1, 'DaneKontaktowe', 'Telefon') : '',
      sellerEmail: podmiot1 ? getNestedText(podmiot1, 'DaneKontaktowe', 'Email') : '',
      sellerPrefix: podmiot1 ? getTextContent(podmiot1, 'PrefiksPodatnika') : '',
      sellerEori: podmiot1 ? getTextContent(podmiot1, 'NrEORI') : '',
      sellerKrs: rejestry ? getTextContent(rejestry, 'KRS') : '',
      sellerRegon: rejestry ? getTextContent(rejestry, 'REGON') : '',

      buyerNip: podmiot2 ? getNestedText(podmiot2, 'DaneIdentyfikacyjne', 'NIP') : '',
      buyerName: podmiot2 ? getNestedText(podmiot2, 'DaneIdentyfikacyjne', 'Nazwa') : '',
      buyerAddress1: podmiot2 ? getNestedText(podmiot2, 'Adres', 'AdresL1') : '',
      buyerAddress2: podmiot2 ? getNestedText(podmiot2, 'Adres', 'AdresL2') : '',
      buyerPhone: podmiot2 ? getNestedText(podmiot2, 'DaneKontaktowe', 'Telefon') : '',
      buyerEmail: podmiot2 ? getNestedText(podmiot2, 'DaneKontaktowe', 'Email') : '',
      buyerClientNr: podmiot2 ? getTextContent(podmiot2, 'NrKlienta') : '',

      currency: fa ? getTextContent(fa, 'KodWaluty') : 'PLN',
      issueDate: fa ? getTextContent(fa, 'P_1') : '',
      invoiceNumber: fa ? getTextContent(fa, 'P_2') : '',
      periodFrom: fa ? getNestedText(fa, 'OkresFa', 'P_6_Od') : '',
      periodTo: fa ? getNestedText(fa, 'OkresFa', 'P_6_Do') : '',
      totalNet: fa ? getTextContent(fa, 'P_13_1') : '',
      totalVat: fa ? getTextContent(fa, 'P_14_1') : '',
      totalGross: fa ? getTextContent(fa, 'P_15') : '',
      invoiceType: fa ? getTextContent(fa, 'RodzajFaktury') : '',

      lines,
      additionalDescriptions,

      paymentDue: fa ? getNestedText(fa, 'Platnosc', 'TerminPlatnosci', 'Termin') : '',
      paymentForm: fa ? getNestedText(fa, 'Platnosc', 'FormaPlatnosci') : '',
      bankAccount: fa ? getNestedText(fa, 'Platnosc', 'RachunekBankowy', 'NrRB') : '',
      contractNumber: fa ? getNestedText(fa, 'WarunkiTransakcji', 'Umowy', 'NrUmowy') : '',

      footerLines,
      fullCompanyName: rejestry ? getTextContent(rejestry, 'PelnaNazwa') : ''
    }
  } catch {
    return null
  }
}

function formatAmount(val: string, currency: string = 'PLN'): string {
  const num = parseFloat(val)
  if (isNaN(num)) return val
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(num)
}

function formatDate(val: string): string {
  if (!val) return ''
  try {
    const d = new Date(val)
    return d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return val
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', mt: 3, mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </Typography>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 120, flexShrink: 0 }}>
        {label}:
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value}
      </Typography>
    </Box>
  )
}

interface InvoiceViewerProps {
  xml: string
}

export function InvoiceViewer({ xml }: InvoiceViewerProps) {
  const [tab, setTab] = useState(0)
  const parsed = useMemo(() => parseInvoiceXml(xml), [xml])

  if (!parsed) {
    return (
      <Box component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', p: 2 }}>
        {xml}
      </Box>
    )
  }

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab icon={<DescriptionRoundedIcon />} iconPosition="start" label="Podgląd" />
        <Tab icon={<CodeRoundedIcon />} iconPosition="start" label="XML" />
      </Tabs>

      {tab === 1 ? (
        <Box component="pre" sx={{
          background: (t) => alpha(t.palette.background.default, 0.5),
          p: 2, borderRadius: 2, overflow: 'auto', maxHeight: 500,
          fontSize: '0.75rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}>
          {xml}
        </Box>
      ) : (
        <Box>
          {/* Invoice header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Faktura {parsed.invoiceType}
              </Typography>
              <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 600 }}>
                {parsed.invoiceNumber}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Chip label={`${parsed.currency}`} size="small" sx={{ mb: 0.5 }} />
              {parsed.issueDate && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Data wystawienia: {formatDate(parsed.issueDate)}
                </Typography>
              )}
              {parsed.periodFrom && parsed.periodTo && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Okres: {formatDate(parsed.periodFrom)} — {formatDate(parsed.periodTo)}
                </Typography>
              )}
            </Box>
          </Box>

          <Divider />

          {/* Seller & Buyer */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, my: 2 }}>
            <Box>
              <SectionTitle>Sprzedawca</SectionTitle>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>{parsed.sellerName}</Typography>
              <InfoRow label="NIP" value={parsed.sellerNip} />
              {parsed.sellerAddress1 && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {parsed.sellerAddress1}
                  {parsed.sellerAddress2 ? `, ${parsed.sellerAddress2}` : ''}
                </Typography>
              )}
              <InfoRow label="Telefon" value={parsed.sellerPhone} />
              <InfoRow label="Email" value={parsed.sellerEmail} />
              <InfoRow label="KRS" value={parsed.sellerKrs} />
              <InfoRow label="REGON" value={parsed.sellerRegon} />
            </Box>
            <Box>
              <SectionTitle>Nabywca</SectionTitle>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>{parsed.buyerName}</Typography>
              <InfoRow label="NIP" value={parsed.buyerNip} />
              {parsed.buyerAddress1 && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {parsed.buyerAddress1}
                  {parsed.buyerAddress2 ? `, ${parsed.buyerAddress2}` : ''}
                </Typography>
              )}
              <InfoRow label="Telefon" value={parsed.buyerPhone} />
              <InfoRow label="Email" value={parsed.buyerEmail} />
              <InfoRow label="Nr klienta" value={parsed.buyerClientNr} />
            </Box>
          </Box>

          <Divider />

          {/* Line items */}
          <SectionTitle>Pozycje faktury</SectionTitle>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ background: (t) => alpha(t.palette.primary.main, 0.06) }}>
                  <TableCell sx={{ fontWeight: 600, width: 40 }}>Lp.</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Opis</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>J.m.</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Ilość</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Cena jdn.</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Netto</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>VAT %</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>VAT</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {parsed.lines.map((line, idx) => (
                  <TableRow key={idx} sx={{ '&:hover': { background: (t) => alpha(t.palette.primary.main, 0.03) } }}>
                    <TableCell>{line.nr}</TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>{line.description}</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>{line.unit}</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{line.quantity}</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{formatAmount(line.unitPrice, parsed.currency)}</TableCell>
                    <TableCell sx={{ textAlign: 'right', fontWeight: 500 }}>{formatAmount(line.netAmount, parsed.currency)}</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>{line.vatRate}%</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{formatAmount(line.vatAmount, parsed.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Totals */}
          <Box sx={{
            display: 'flex', justifyContent: 'flex-end', gap: 4, p: 2, mb: 2,
            background: (t) => alpha(t.palette.primary.main, 0.04), borderRadius: 2
          }}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Netto</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{formatAmount(parsed.totalNet, parsed.currency)}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>VAT</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{formatAmount(parsed.totalVat, parsed.currency)}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Brutto</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>{formatAmount(parsed.totalGross, parsed.currency)}</Typography>
            </Box>
          </Box>

          <Divider />

          {/* Payment */}
          {(parsed.paymentDue || parsed.bankAccount) && (
            <>
              <SectionTitle>Płatność</SectionTitle>
              <InfoRow label="Termin" value={formatDate(parsed.paymentDue)} />
              <InfoRow label="Forma" value={paymentFormLabel(parsed.paymentForm)} />
              <InfoRow label="Nr rachunku" value={parsed.bankAccount} />
              <InfoRow label="Nr umowy" value={parsed.contractNumber} />
            </>
          )}

          {/* Additional descriptions */}
          {parsed.additionalDescriptions.length > 0 && (
            <>
              <SectionTitle>Informacje dodatkowe</SectionTitle>
              {parsed.additionalDescriptions.map((d, idx) => (
                <InfoRow key={idx} label={d.lineNr ? `[${d.lineNr}] ${d.key}` : d.key} value={d.value} />
              ))}
            </>
          )}

          {/* Footer */}
          {parsed.footerLines.length > 0 && (
            <>
              <Divider sx={{ mt: 2 }} />
              <Box sx={{ mt: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {parsed.footerLines.map((line, idx) => (
                  <Typography key={idx} variant="caption" sx={{ color: 'text.secondary' }}>
                    {line}
                  </Typography>
                ))}
              </Box>
            </>
          )}

          {/* System info */}
          {parsed.systemInfo && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
              Wygenerowano przez: {parsed.systemInfo} | {parsed.createdDate ? formatDate(parsed.createdDate) : ''}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}
