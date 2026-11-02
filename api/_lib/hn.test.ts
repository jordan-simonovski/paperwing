import { describe, expect, it } from 'vitest'
import { logoutLink, pageProblem, replyForm, sessionCookie, submitForm, voteLink } from './hn.js'

// Shapes as HN serves them.
const item = `<a href="logout?auth=x&amp;goto=item%3Fid%3D41">logout</a>
<td class="votelinks"><center><a id='up_41' class='clicky' href='vote?id=41&amp;how=up&amp;auth=0a1b2c3d&amp;goto=item%3Fid%3D41'><div class='votearrow' title='upvote'></div></a></center></td>
<a id='up_42' class='clicky' href='vote?id=42&amp;how=up&amp;auth=ffee99&amp;goto=item%3Fid%3D41%2342'></a>
<form action="comment" method="post"><input type="hidden" name="parent" value="41"><input type="hidden" name="goto" value="item?id=41"><input type="hidden" name="hmac" value="9f8e7d6c5b4a39281706f5e4d3c2b1a098765432"><textarea name="text" rows="8" cols="80"></textarea></form>`

describe('Hacker News pages', () => {
  it('find the vote link for exactly that item', () => {
    expect(voteLink(item, '41', 'up')).toBe('vote?id=41&how=up&auth=0a1b2c3d&goto=item%3Fid%3D41')
    expect(voteLink(item, '42', 'up')).toBe('vote?id=42&how=up&auth=ffee99&goto=item%3Fid%3D41%2342')
    expect(voteLink(item, '4', 'up')).toBeUndefined()
    expect(voteLink(item, '41', 'un')).toBeUndefined()
    expect(voteLink(`<a id='un_41' href='vote?id=41&amp;how=un&amp;auth=abc&amp;goto=news'>unvote</a>`, '41', 'un')).toBe('vote?id=41&how=un&auth=abc&goto=news')
  })
  it('refuse a vote link that points anywhere else', () => {
    expect(voteLink(`<a id='up_41' href='https://evil.example/vote?id=41&how=up'>`, '41', 'up')).toBeUndefined()
  })
  it('read the reply form', () => {
    expect(replyForm(item)).toEqual({ parent: '41', goto: 'item?id=41', hmac: '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432' })
    expect(replyForm('<p>no form</p>')).toBeUndefined()
  })
  it('take the session cookie from a sign-in', () => {
    expect(sessionCookie(['user=pg&AbCdEf1234567890; path=/; expires=Mon, 01 Jan 2035 00:00:00 GMT; secure; httponly'])).toBe('pg&AbCdEf1234567890')
    expect(sessionCookie(['other=1'])).toBeUndefined()
  })
  it('say why, in plain words', () => {
    expect(pageProblem('Bad login.')).toMatch(/didn’t accept/)
    expect(pageProblem('<div class="g-recaptcha">')).toMatch(/captcha/)
    expect(pageProblem("You're posting too fast. Please slow down. Thanks.")).toMatch(/too fast/)
  })
  it('read the submit form', () => {
    const html = `<form action="/r" method="post"><input type="hidden" name="fnid" value="Xy12abCD34efGH56"><input type="hidden" name="fnop" value="submit-page"><input type="text" name="title"></form>`
    expect(submitForm(html)).toEqual({ fnid: 'Xy12abCD34efGH56', fnop: 'submit-page' })
    expect(submitForm('<form action="comment"></form>')).toBeUndefined()
  })
  it('find the logout link, and nothing else', () => {
    expect(logoutLink(item)).toBe('logout?auth=x&goto=item%3Fid%3D41')
    expect(logoutLink(`<a href="logout?auth=x&amp;goto=https://evil.example/">`)).toBe('logout?auth=x&goto=https://evil.example/')
    expect(logoutLink('<a href="login">login</a>')).toBeUndefined()
  })
})
