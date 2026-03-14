import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  alpha,
  Shake
} from '@mui/material'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'

interface LockScreenProps {
  onUnlock: () => void
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pin) return

    const ok = await window.api.verifyPin(pin)
    if (ok) {
      onUnlock()
    } else {
      setError(true)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
    }
  }

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: (t) =>
          t.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #0F0F1A 0%, #1A1A2E 50%, #16162A 100%)'
            : 'linear-gradient(135deg, #F5F5FA 0%, #E8E8F0 50%, #EEEEF5 100%)',
        WebkitAppRegion: 'drag'
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: 4,
          background: 'linear-gradient(135deg, #6C63FF 0%, #00D4AA 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(108, 99, 255, 0.3)',
          mb: 3
        }}
      >
        <ReceiptLongRoundedIcon sx={{ color: '#fff', fontSize: 36 }} />
      </Box>

      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        KSeF Monitor
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        Wprowadź PIN aby odblokować aplikację
      </Typography>

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: 320,
          WebkitAppRegion: 'no-drag',
          animation: shake ? 'shake 0.5s ease' : 'none',
          '@keyframes shake': {
            '0%, 100%': { transform: 'translateX(0)' },
            '20%, 60%': { transform: 'translateX(-8px)' },
            '40%, 80%': { transform: 'translateX(8px)' }
          }
        }}
      >
        <TextField
          inputRef={inputRef}
          type="password"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            setError(false)
          }}
          placeholder="PIN"
          fullWidth
          autoFocus
          error={error}
          helperText={error ? 'Nieprawidłowy PIN' : ' '}
          InputProps={{
            startAdornment: (
              <LockRoundedIcon sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />
            ),
            sx: {
              borderRadius: 3,
              fontSize: '1.2rem',
              letterSpacing: '0.3em',
              textAlign: 'center'
            }
          }}
          inputProps={{
            style: { textAlign: 'center' }
          }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={!pin}
          sx={{
            mt: 1,
            borderRadius: 3,
            py: 1.5,
            background: 'linear-gradient(135deg, #6C63FF 0%, #918AFF 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5B54E6 0%, #8079E6 100%)'
            }
          }}
        >
          Odblokuj
        </Button>
      </Box>
    </Box>
  )
}
