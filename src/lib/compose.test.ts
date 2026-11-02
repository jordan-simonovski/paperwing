import { describe, expect, it } from 'vitest'
import { linkFrom } from './compose'

describe('the link in what someone pastes', () => {
  it('takes a full link as it is', () => {
    expect(linkFrom('https://example.com/post?a=1')).toBe('https://example.com/post?a=1')
  })
  it('accepts an address typed without https://', () => {
    expect(linkFrom('  example.com/post ')).toBe('https://example.com/post')
  })
  it('finds the link in a shared snippet with a title before it', () => {
    expect(linkFrom('A great read https://blog.example/slow')).toBe('https://blog.example/slow')
  })
  it('refuses anything that isn’t a web link', () => {
    expect(linkFrom('')).toBeUndefined()
    expect(linkFrom('just some words')).toBeUndefined()
    expect(linkFrom('javascript:alert(1)')).toBeUndefined()
    expect(linkFrom('ftp://example.com/file')).toBeUndefined()
    expect(linkFrom('https://localhost/admin')).toBeUndefined()
  })
})
