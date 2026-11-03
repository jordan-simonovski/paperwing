import { describe, expect, it } from 'vitest'
import { resumeStep } from './onboarding'

describe('where a saved welcome tour resumes', () => {
  it('carries someone paused on a removed step on to the last step', () => {
    for (const gone of ['sharing', 'social', 'saving', 'ai']) expect(resumeStep(gone)).toBe('passkey')
  })

  it('keeps someone on a step that still exists where they were', () => {
    expect(resumeStep('ranking')).toBe('ranking')
    expect(resumeStep('topics')).toBe('topics')
  })
})
