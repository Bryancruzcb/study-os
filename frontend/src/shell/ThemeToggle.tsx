import { useSyncExternalStore } from 'react'
import Icon from '../icons'
import {
  effectiveTheme, getThemeChoice, onSystemThemeChange, onThemeChoiceChange, setThemeChoice, systemPrefersDark, toggled,
} from '../theme'

/* The sun or the moon: it shows the theme it switches to, and says so to a screen reader */
export default function ThemeToggle() {
  const choice = useSyncExternalStore(onThemeChoiceChange, getThemeChoice)
  const systemDark = useSyncExternalStore(onSystemThemeChange, systemPrefersDark)
  const dark = effectiveTheme(choice, systemDark) === 'dark'
  return (
    <button className="theme-toggle" type="button"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setThemeChoice(toggled(choice, systemDark))}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  )
}
