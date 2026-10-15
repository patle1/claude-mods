import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Fill, Limit } from '../types'

// The context window degrades well before it is full; a rate-limit window
// only matters near its end.
const CONTEXT_AT = { warn: 40, danger: 65 }
const LIMIT_AT = { warn: 50, danger: 80 }

// A fixed, short bar of one glyph: a width counted in cells wraps where the
// surface's font is not the terminal's, and two glyphs do not sit on one line.
const CELLS = 6
const BAR = '━'
// The painted bar's height, as a part of one row.
const THICKNESS = 0.28

// The part of a painted bar that is filled, in percent: a window in use always
// shows a sliver. A whole number, as a Box's percentage width must be.
export const shareOf = (percent: number): number =>
  percent <= 0 ? 0 : Math.min(100, Math.max(3, Math.round(percent)))

// The rate-limit windows drawn, in order, and what each is called.
const WINDOWS = [
  { kind: 'five_hour', title: '5h ' },
  { kind: 'seven_day', title: 'Week ' },
]

// A window in use always shows at least one cell.
export const usedOf = (percent: number): number =>
  percent <= 0 ? 0 : Math.min(CELLS, Math.max(1, Math.round((CELLS * percent) / 100)))

const fill = atom({ plugin: 'context-colour', key: 'fill' } as const, null)
const limits = atom({ plugin: 'context-colour', key: 'limits' } as const, [])
// The time the countdowns are told from: written each minute, so they redraw.
const at = atom({ plugin: 'context-colour', key: 'at' } as const, 0)

export const colourOf = (percent: number, at = CONTEXT_AT): string =>
  percent >= at.danger ? 'error' : percent >= at.warn ? 'warning' : 'success'

export const limitColourOf = (percent: number): string => colourOf(percent, LIMIT_AT)

const short = (tokens: number): string =>
  tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(tokens / 1000)}k`

export const labelOf = (now: Fill): string =>
  ` ${now.percent}% · ${short(now.tokens)}/${short(now.window)}`

const measured = (context: SessionContextUsage): Fill | null =>
  context.percent === undefined || context.tokens === undefined
    ? null
    : { percent: context.percent, tokens: context.tokens, window: context.window }

const windowsOf = (rateLimits: SessionRateLimit[]): Limit[] =>
  rateLimits.map(one => {
    const resetsAt = one.resetsAt === undefined ? NaN : Date.parse(one.resetsAt)

    return {
      kind: one.kind,
      percent: one.percentUsed,
      ...(Number.isNaN(resetsAt) ? {} : { resetsAt }),
    }
  })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// How long until a window resets, in its two largest units.
export const leftOf = (ms: number): string => {
  if (ms <= 0) {
    return 'now'
  }

  const minutes = Math.ceil(ms / MINUTE)
  const days = Math.floor((minutes * MINUTE) / DAY)
  const hours = Math.floor((minutes * MINUTE) / HOUR) % 24

  return days > 0
    ? `${days}d ${hours}h`
    : hours > 0
      ? `${hours}h ${minutes % 60}m`
      : `${minutes}m`
}

export const limitLabelOf = (one: Limit, now: number): string =>
  ` ${Math.round(one.percent)}%` +
  (one.resetsAt === undefined ? '' : ` · resets ${leftOf(one.resetsAt - now)}`)

// A label is its percentage, drawn in the meter's colour, and what follows the
// first dot, drawn dim.
const SPLIT = ' · '

export const figureOf = (label: string): string => label.split(SPLIT)[0] ?? label

export const detailOf = (label: string): string =>
  label.includes(SPLIT) ? label.slice(label.indexOf(SPLIT)) : ''

let ticking = false

// Reads the clock into `at`, and from the first call on, once a minute. Local
// work alone: no model call is made.
const tell = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  await update($, at, () => now)

  if (!ticking) {
    ticking = true
    $.clock.every(MINUTE, () => tell($))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const { context, rateLimits } = await $.session.usage()
    await update($, fill, () => measured(context))
    await update($, limits, () => windowsOf(rateLimits))
    await tell($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, fill, () => measured(e.context))
    await update($, limits, () => windowsOf(e.rateLimits))
    await tell($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, fill)
    const windows = await read($, limits)
    const below = await next(e)
    const told = await read($, at)

    const meters = [
      ...(now === null
        ? []
        : [{ title: 'Context ', percent: now.percent, colour: colourOf(now.percent), label: labelOf(now) }]),
      ...WINDOWS.flatMap(({ kind, title }) => {
        const one = windows.find(each => each.kind === kind)

        return one === undefined
          ? []
          : [{ title, percent: one.percent, colour: limitColourOf(one.percent), label: limitLabelOf(one, told) }]
      }),
    ]

    if (e.props.hasSurvey || meters.length === 0) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    // The desktop paints boxes, so its bar is two of them at a part of a row's
    // height: solid, centred, and as thick as THICKNESS says. A terminal has
    // whole cells alone and keeps the line glyph.
    const painted = e.surface === 'desktop'

    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap" columnGap={2} width="100%">
          {meters.map(({ title, percent, colour, label }) => (
            <Box flexWrap="nowrap" alignItems="center" flexGrow={painted ? 1 : 0}>
              <Text color="text" wrap="truncate">{title}</Text>
              {painted ? (
                // The bars take what room the row has left, shared between them.
                <Box alignItems="center" flexGrow={1} minWidth={CELLS}>
                  <Box width={`${shareOf(percent)}%`} height={THICKNESS} backgroundColor={colour} />
                  <Box width={`${100 - shareOf(percent)}%`} height={THICKNESS} backgroundColor="subtle" />
                </Box>
              ) : (
                <Box>
                  <Text color={colour} wrap="truncate">{BAR.repeat(usedOf(percent))}</Text>
                  <Text dimColor wrap="truncate">{BAR.repeat(CELLS - usedOf(percent))}</Text>
                </Box>
              )}
              <Text color={colour} wrap="truncate">{figureOf(label)}</Text>
              {detailOf(label) === '' ? null : <Text dimColor wrap="truncate">{detailOf(label)}</Text>}
            </Box>
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
