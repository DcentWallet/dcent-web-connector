/**
 * v2 facade — state enum (m08-01-01)
 *
 * v1 src-v1/type/dcent-state.js의 state와 키·값 1:1 일치.
 * dcent connection state — setConnectionListener 콜백의 state 인자.
 */
export const state = Object.freeze({
  CONNECTED: 'dcent-connected',
  DISCONNECTED: 'dcent-disconnected',
} as const)

export type State = keyof typeof state
export type StateValue = typeof state[State]
