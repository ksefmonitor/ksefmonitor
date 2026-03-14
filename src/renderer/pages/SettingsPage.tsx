import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  Snackbar,
  MenuItem,
  alpha,
  Chip,
  IconButton,
  InputAdornment
} from '@mui/material'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import SystemUpdateRoundedIcon from '@mui/icons-material/SystemUpdateRounded'
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import type { AppConfig } from '../../shared/types'

interface SettingsPageProps {
  onThemeChange: (theme: 'light' | 'dark') => void
}

export function SettingsPage({ onThemeChange }: SettingsPageProps) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getConfig().then(setConfig)
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  async function handleSave() {
    if (!config) return

    if (!config.apiUrl) {
      setError('Adres API jest wymagany')
      return
    }

    try {
      await window.api.saveConfig(config)
      setSaved(true)
      onThemeChange(config.theme)
    } catch (err) {
      setError('Błąd zapisu konfiguracji')
    }
  }

  function updateConfig(partial: Partial<AppConfig>) {
    if (!config) return
    setConfig({ ...config, ...partial })
  }

  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  async function handleCheckUpdates() {
    setUpdateStatus('Sprawdzanie...')
    try {
      const result = await window.api.checkForUpdates()
      if (result && typeof result === 'object' && 'message' in result) {
        setUpdateStatus(result.message as string)
      } else {
        setUpdateStatus('Masz najnowszą wersję')
      }
    } catch {
      setUpdateStatus('Nie udało się sprawdzić aktualizacji')
    }
    setTimeout(() => setUpdateStatus(null), 5000)
  }

  if (!config) return null

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          Ustawienia
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Konfiguracja połączenia z KSeF i preferencje aplikacji
        </Typography>
      </Box>

      {/* API Configuration */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <SecurityRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Połączenie z API KSeF</Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Adres API"
                value={config.apiUrl}
                onChange={(e) => updateConfig({ apiUrl: e.target.value })}
                fullWidth
                helperText="Domyślnie: https://api.ksef.mf.gov.pl/v2"
                placeholder="https://api.ksef.mf.gov.pl/v2"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Token autoryzacyjny"
                type={showToken ? 'text' : 'password'}
                value={config.token}
                onChange={(e) => updateConfig({ token: e.target.value })}
                fullWidth
                helperText="Token Bearer do uwierzytelniania z API KSeF"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowToken(!showToken)}
                        edge="end"
                        size="small"
                      >
                        {showToken ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="NIP"
                value={config.nip}
                onChange={(e) => updateConfig({ nip: e.target.value })}
                fullWidth
                helperText="NIP podmiotu w KSeF"
                placeholder="1234567890"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Auto-check settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <TuneRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Automatyczne sprawdzanie</Typography>
          </Box>

          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.autoCheckEnabled}
                    onChange={(e) => updateConfig({ autoCheckEnabled: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">
                      Włącz automatyczne sprawdzanie nowych faktur
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Aplikacja będzie cyklicznie odpytywać API KSeF
                    </Typography>
                  </Box>
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Interwał sprawdzania (minuty)"
                type="number"
                value={config.checkIntervalMinutes}
                onChange={(e) =>
                  updateConfig({ checkIntervalMinutes: Math.max(1, parseInt(e.target.value) || 15) })
                }
                fullWidth
                inputProps={{ min: 1, max: 1440 }}
                helperText="Zalecane: 15-60 minut (uwaga na limity API)"
                disabled={!config.autoCheckEnabled}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>
            Wygląd
          </Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Motyw"
                select
                value={config.theme}
                onChange={(e) => updateConfig({ theme: e.target.value as 'light' | 'dark' })}
                fullWidth
              >
                <MenuItem value="dark">Ciemny</MenuItem>
                <MenuItem value="light">Jasny</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <SystemUpdateRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Aktualizacje</Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<SystemUpdateRoundedIcon />}
              onClick={handleCheckUpdates}
            >
              Sprawdź aktualizacje
            </Button>
            <Chip label={`v${appVersion}`} size="small" variant="outlined" />
          </Box>
          {updateStatus && (
            <Typography variant="body2" sx={{ mt: 1, color: 'primary.main', fontWeight: 500 }}>
              {updateStatus}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
            Aktualizacje są pobierane automatycznie z serwera GitHub Releases
          </Typography>
        </CardContent>
      </Card>

      {/* Save button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveRoundedIcon />}
          onClick={handleSave}
          sx={{ px: 4 }}
        >
          Zapisz ustawienia
        </Button>
      </Box>

      {/* Success snackbar */}
      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" variant="filled" sx={{ borderRadius: 2 }}>
          Ustawienia zapisane pomyślnie!
        </Alert>
      </Snackbar>

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}
