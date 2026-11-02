import { useEffect, useState } from 'react'
import { codeFromBytes, syncAvailable } from './sync'

// Sync with a passkey instead of a code. Passkeys live in the system's password manager (iCloud
// Keychain on Apple devices, Google Password Manager, 1Password), which already carries them to
// your other devices. The WebAuthn PRF extension gets the same secret out of a passkey on every
// one of them, and the sync code is derived from it, so signing in with the passkey anywhere lands
// in the same synced space. Nothing about the passkey goes to the server: there's no account, and
// the code is all sync ever needed.

// Changing this, or the HKDF salt and info below, moves every passkey user to a new, empty sync space.
export const PRF_INPUT = new TextEncoder().encode('readout sync v1')

export type PasskeySupport = 'yes' | 'no' | 'unknown'

/** Whether this browser can do passkeys with PRF. Many can't say until asked, hence 'unknown'. */
export async function passkeySupport(): Promise<PasskeySupport> {
  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials?.create) return 'no'
  const caps = await (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities?.().catch(() => undefined)
  if (caps && 'extension:prf' in caps) return caps['extension:prf'] ? 'yes' : 'no'
  return 'unknown'
}

export async function codeFromPrf(secret: BufferSource): Promise<string> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('readout-sync'), info: new TextEncoder().encode('sync code v1') }, base, 26 * 8)
  return codeFromBytes(new Uint8Array(bits))
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

class PasskeyError extends Error {}

const explain = (err: unknown): Error => {
  if (err instanceof PasskeyError) return err
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError') return new PasskeyError('No passkey was used')
  if (name === 'SecurityError') return new PasskeyError("Passkeys don't work on this address")
  return new PasskeyError(err instanceof Error ? err.message : 'The passkey didn’t work')
}

/** Asks for the sync passkey (any of them, or the one just made) and returns its sync code. */
async function signIn(only?: ArrayBuffer): Promise<string> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      userVerification: 'required',
      allowCredentials: only ? [{ type: 'public-key', id: only }] : [],
      extensions: { prf: { eval: { first: PRF_INPUT } } },
    },
  })) as PublicKeyCredential | null
  const secret = cred?.getClientExtensionResults().prf?.results?.first
  if (!secret) throw new PasskeyError("This passkey can't be used for sync here. Use the sync code instead")
  return codeFromPrf(secret)
}

/** Signs in with an existing sync passkey: how a second device joins. */
export async function codeFromPasskey(): Promise<string> {
  try {
    return await signIn()
  } catch (err) {
    throw explain(err)
  }
}

/** Makes a new sync passkey and returns its sync code: the first device. */
export async function createSyncPasskey(): Promise<string> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'PaperWing' },
        user: { id: random(16), name: 'PaperWing sync', displayName: 'PaperWing sync' },
        challenge: random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        extensions: { prf: { eval: { first: PRF_INPUT } } },
      },
    })) as PublicKeyCredential | null
    if (!cred) throw new PasskeyError('No passkey was made')
    const prf = cred.getClientExtensionResults().prf
    if (prf?.results?.first) return await codeFromPrf(prf.results.first)
    if (!prf || prf.enabled === false) throw new PasskeyError("This browser or password manager can't use passkeys for sync. Use the sync code instead")
    // Some password managers only hand out the secret at sign-in, not when the passkey is made.
    return await signIn(cred.rawId)
  } catch (err) {
    throw explain(err)
  }
}

/**
 * What this device can do for sync: whether the deployment has it, and whether passkeys work here.
 * Both are undefined until known.
 */
export function useSyncReadiness(): { available?: boolean; passkeys?: PasskeySupport } {
  const [available, setAvailable] = useState<boolean>()
  const [passkeys, setPasskeys] = useState<PasskeySupport>()
  useEffect(() => void syncAvailable().then(setAvailable), [])
  useEffect(() => void passkeySupport().then(setPasskeys), [])
  return { available, passkeys }
}
