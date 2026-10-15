import { expect, mock, test } from 'claude-code/testing'

import { colourOf, labelOf, leftOf, limitColourOf, usedOf } from './register'

const NOW = Date.parse('2026-10-09T00:00:00Z')

const BAND = {
  plugin: 'context-colour',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 40,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the colour follows the fill', () => {
  expect(colourOf(39)).toBe('success')
  expect(colourOf(40)).toBe('warning')
  expect(colourOf(64)).toBe('warning')
  expect(colourOf(65)).toBe('error')
  expect(limitColourOf(49)).toBe('success')
  expect(limitColourOf(50)).toBe('warning')
  expect(limitColourOf(80)).toBe('error')
  expect([usedOf(0), usedOf(1), usedOf(50), usedOf(100)]).toEqual([0, 1, 3, 6])
  expect(labelOf({ percent: 42, tokens: 84_000, window: 200_000 })).toBe(' 42% · 84k/200k')
})

test('the time left is told in its two largest units', () => {
  expect(leftOf(-1)).toBe('now')
  expect(leftOf(30_000)).toBe('1m')
  expect(leftOf(59 * 60_000)).toBe('59m')
  expect(leftOf(134 * 60_000)).toBe('2h 14m')
  expect(leftOf((3 * 24 + 4) * 3_600_000 + 60_000)).toBe('3d 4h')
})

test('the line is drawn above what is beneath, on every surface', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Text',
    props: {},
    children: ['beneath'],
  }))
  await $.session.measure({
    context: { percent: 80, tokens: 160_000, window: 200_000 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 7 },
      { kind: 'spend_limit', percentUsed: 99 },
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-09T02:14:00Z' },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
    // The terminal's bar is glyphs; the desktop's is painted boxes, no text.
    const bar = (used: number) =>
      surface === 'terminal' ? ['━'.repeat(used), '━'.repeat(6 - used)] : []
    expect(texts).toEqual([
      'Context ', ...bar(5), ' 80%', ' · 160k/200k',
      '5h ', ...bar(1), ' 24%', ' · resets 2h 14m',
      'Week ', ...bar(1), ' 7%',
      'beneath',
    ])
    if (surface === 'desktop') {
      const widths = (await ui.findAll({ type: 'Box' }))
        .filter(one => one.props.backgroundColor !== undefined)
        .map(one => one.props.width)
      expect(widths).toEqual(['80%', '20%', '24%', '76%', '7%', '93%'])
    }
    await ui.unmount()
  }
})

test('the countdown moves on each minute, with no new measurement', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Text',
    props: {},
    children: ['beneath'],
  }))
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-10-09T02:14:00Z' }],
    changed: ['rateLimits'],
  })
  await clock.advance(3 * 60_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toContain(' · resets 2h 11m')
  await ui.unmount()
})

test('with no rate-limit reading, the context is drawn alone', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Text',
    props: {},
    children: ['beneath'],
  }))
  await $.session.measure({
    context: { percent: 5, tokens: 46_000, window: 1_000_000 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toEqual(['Context ', ' 5%', ' · 46k/1.0M', 'beneath'])
  await ui.unmount()
})
