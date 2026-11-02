import { describe, expect, it } from 'vitest'
import { PIP_FULL, pipShapes } from './pip'

describe('pipShapes done', () => {
  const done = pipShapes('done')
  const parts = (shapes: typeof done, part: string) => shapes.filter((s) => s.part === part)

  it('shuts the eyes and drops the shine', () => {
    expect(parts(done, 'eyes')).toHaveLength(1)
    expect(parts(done, 'shineL')).toHaveLength(0)
    expect(parts(done, 'shineR')).toHaveLength(0)
  })

  it('swaps the open book for the closed one, once', () => {
    const book = parts(done, 'book')
    expect(book).toHaveLength(5)
    expect(book.some((s) => parts(PIP_FULL, 'book').includes(s))).toBe(false)
  })

  it('keeps every other part of Pip, in order', () => {
    const rest = (shapes: typeof done) => shapes.filter((s) => !['eyes', 'book', 'shineL', 'shineR'].includes(s.part))
    expect(rest(done)).toEqual(rest(PIP_FULL))
  })

  it('wears the season’s hat in place of the tuft', () => {
    const dressed = pipShapes('done', 'christmas')
    expect(parts(dressed, 'tuft')).toHaveLength(0)
    expect(dressed.length).toBeGreaterThan(done.length - parts(done, 'tuft').length)
  })
})
