import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Badge,
  alpha,
  Divider
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'

interface SidebarProps {
  newInvoicesCount: number
}

const menuItems = [
  { path: '/', label: 'Dashboard', icon: DashboardRoundedIcon },
  { path: '/invoices', label: 'Faktury', icon: ReceiptLongRoundedIcon, badgeKey: 'invoices' as const },
  { path: '/summary', label: 'Podsumowania', icon: BarChartRoundedIcon },
  { path: '/settings', label: 'Ustawienia', icon: SettingsRoundedIcon }
]

export function Sidebar({ newInvoicesCount }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  return (
    <Box
      sx={{
        width: 260,
        minWidth: 260,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: (t) =>
          t.palette.mode === 'dark'
            ? 'linear-gradient(180deg, #1A1A2E 0%, #16162A 100%)'
            : 'linear-gradient(180deg, #FFFFFF 0%, #F8F8FC 100%)',
        borderRight: (t) => `1px solid ${t.palette.divider}`,
        WebkitAppRegion: 'drag'
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          p: 3,
          pt: 5,
          pb: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            background: 'linear-gradient(135deg, #6C63FF 0%, #00D4AA 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(108, 99, 255, 0.3)'
          }}
        >
          <ReceiptLongRoundedIcon sx={{ color: '#fff', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontSize: '1.1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6C63FF 0%, #00D4AA 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            KSeF Monitor
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            v{appVersion}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mx: 2, my: 1 }} />

      {/* Navigation */}
      <List
        sx={{
          px: 1.5,
          py: 1,
          flex: 1,
          WebkitAppRegion: 'no-drag'
        }}
      >
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          const showBadge = item.badgeKey === 'invoices' && newInvoicesCount > 0

          return (
            <ListItemButton
              key={item.path}
              onClick={() => navigate(item.path)}
              sx={{
                borderRadius: 2.5,
                mb: 0.5,
                py: 1.2,
                px: 2,
                transition: 'all 0.2s ease',
                ...(isActive
                  ? {
                      background: (t) =>
                        alpha(t.palette.primary.main, 0.15),
                      '&:hover': {
                        background: (t) =>
                          alpha(t.palette.primary.main, 0.2)
                      }
                    }
                  : {
                      '&:hover': {
                        background: (t) =>
                          alpha(t.palette.primary.main, 0.08)
                      }
                    })
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Badge
                  badgeContent={showBadge ? newInvoicesCount : 0}
                  color="error"
                  sx={{
                    '& .MuiBadge-badge': {
                      fontSize: '0.65rem',
                      height: 18,
                      minWidth: 18
                    }
                  }}
                >
                  <Icon
                    sx={{
                      color: isActive ? 'primary.main' : 'text.secondary',
                      fontSize: 22
                    }}
                  />
                </Badge>
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'primary.main' : 'text.primary'
                }}
              />
              {isActive && (
                <Box
                  sx={{
                    width: 4,
                    height: 20,
                    borderRadius: 2,
                    background: 'linear-gradient(180deg, #6C63FF 0%, #00D4AA 100%)'
                  }}
                />
              )}
            </ListItemButton>
          )
        })}
      </List>
    </Box>
  )
}
