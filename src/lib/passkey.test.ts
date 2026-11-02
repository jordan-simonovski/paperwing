import { describe, expect, it } from 'vitest'
import { codeFromPrf, PRF_INPUT } from './passkey'

// A passkey's sync space is derived, never stored: if the derivation drifts, everyone who syncs
// with a passkey silently lands in a new, empty space. These pin it.
describe('the sync code a passkey derives', () => {
  it('asks the passkey for the same secret it always has', () => {
    expect(new TextDecoder().decode(PRF_INPUT)).toBe('readout sync v1')
  })

  it('turns that secret into the same code on every device, forever', async () => {
    const secret = new Uint8Array(32).map((_, i) => i)
    expect(await codeFromPrf(secret)).toBe('35nigstipa4upe7wvxxqxrbswb')
  })
})
