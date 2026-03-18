import { useEffect } from 'react'
import MainLayout from './presentation/layouts/MainLayout'
import { loadAllPlugins, unloadAllPlugins } from './infrastructure/plugins/plugin-loader'
import { useThemeStore } from './application/store/theme-store'
import { useSettingsStore } from './application/store/settings-store'

function App() {
  const { theme, setTheme, toggleTheme } = useThemeStore()
  const { global } = useSettingsStore()

  // Apply theme from settings store
  useEffect(() => {
    let effectiveTheme = global.theme
    
    if (effectiveTheme === 'auto') {
      // Detect system preference
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    
    if (effectiveTheme !== theme) {
      setTheme(effectiveTheme as 'light' | 'dark')
    }
  }, [global.theme, setTheme])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Expose theme toggle to window for Tauri
  useEffect(() => {
    ;(window as any).toggleTheme = toggleTheme
  }, [toggleTheme])

  // Load plugins on app start
  useEffect(() => {
    const initPlugins = async () => {
      try {
        await loadAllPlugins()
      } catch (error) {
        console.error('Failed to load plugins:', error)
      }
    }

    initPlugins()

    // Cleanup plugins on unmount
    return () => {
      unloadAllPlugins().catch(console.error)
    }
  }, [])

  return <MainLayout />
}

export default App
