export type Fill = { percent: number; tokens: number; window: number }

// `resetsAt` is in `$.clock.now()`'s milliseconds.
export type Limit = { kind: string; percent: number; resetsAt?: number }

declare module 'claude-code' {
  interface PluginState {
    'context-colour': { fill: Fill | null; limits: Limit[]; at: number }
  }
}
