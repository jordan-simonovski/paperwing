import { usePrefs } from './store'

// Pip dresses for the season: the header logo, the launch splash and the summary mascot all wear
// the same hat (pip.ts, PIP_HATS). Settings, Appearance turns it off.

export type Season = 'christmas' | 'halloween' | 'newyear' | 'valentine' | 'easter'
export const SEASONS: Season[] = ['christmas', 'halloween', 'newyear', 'valentine', 'easter']

/** Easter Sunday for a year (the Gregorian computus, Meeus/Jones/Butcher). */
export function easter(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/**
 * The season on a given day: Christmas from 1 to 26 December, New Year from 31 December to
 * 2 January, Valentine's on 13 and 14 February, Easter from Good Friday to Easter Monday, and
 * Halloween's last week of October.
 */
export function seasonOf(d: Date): Season | undefined {
  const m = d.getMonth()
  const day = d.getDate()
  if (m === 11 && day <= 26) return 'christmas'
  if ((m === 11 && day === 31) || (m === 0 && day <= 2)) return 'newyear'
  if (m === 1 && (day === 13 || day === 14)) return 'valentine'
  if (m === 9 && day >= 24) return 'halloween'
  const sunday = easter(d.getFullYear())
  const days = Math.round((new Date(d.getFullYear(), m, day).getTime() - sunday.getTime()) / 86_400_000)
  if (days >= -2 && days <= 1) return 'easter'
  return undefined
}

/** `?season=halloween` on the URL tries one out. */
const asked = () => {
  try {
    const s =
      new URLSearchParams(location.search).get('season') ??
      new URLSearchParams(location.search)
        .get('splash')
        ?.split(',')
        .find((x) => SEASONS.includes(x as Season))
    return SEASONS.find((x) => x === s)
  } catch {
    return undefined
  }
}

/** Today's season, unless seasonal Pip is turned off. */
export const currentSeason = (): Season | undefined => (usePrefs.getState().seasonal ? (asked() ?? seasonOf(new Date())) : undefined)

/** The same, as a hook for components. */
export function useSeason(): Season | undefined {
  const on = usePrefs((p) => p.seasonal)
  return on ? (asked() ?? seasonOf(new Date())) : undefined
}
