import { describe, expect, it } from 'vitest'
import { assertPublicUrl, isPrivateAddress, stripHtml } from './http'

describe('stripHtml', () => {
  it('decodes double-encoded numeric entities from WordPress feeds', () => {
    expect(stripHtml('A month&amp;#8217;s worth &amp;#8211; really')).toBe('A month’s worth – really')
  })
  it('decodes hex and named entities and drops tags', () => {
    expect(stripHtml('<p>Fish &amp; chips &#x2014; &ldquo;ok&rdquo;</p>')).toBe('Fish & chips — “ok”')
  })
  it('does not turn encoded markup into tags', () => {
    expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt; hi')).toBe('alert(1) hi')
  })
})

describe('private address check', () => {
  it('blocks every way of writing a private or local address', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:127.0.0.1', '::ffff:ac10:1', 'ff02::1', 'not an ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })
  it('allows ordinary public addresses', () => {
    for (const ip of ['1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:5db8:d822']) expect(isPrivateAddress(ip), ip).toBe(false)
  })
})

describe('assertPublicUrl', () => {
  it('refuses IP literals in private ranges however they are written', async () => {
    for (const url of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/latest', 'http://2130706433/', 'http://0x7f.1/', 'http://[::1]:9001/', 'file:///etc/passwd']) {
      await expect(assertPublicUrl(url), url).rejects.toThrow()
    }
  })
})
