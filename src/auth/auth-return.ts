export type AuthReturn = { kind: 'none' } | { kind: 'error'; code: string } | { kind: 'code'; code: string; flowId?: string }
const authKeys = ['code','sb_flow_id','access_token','refresh_token','provider_token','provider_refresh_token',
  'token','token_hash','token_type','expires_in','expires_at','error','error_code','error_description','type']

// Pure parser, never exposes the original URL to UI state or logs.
export function parseAuthReturn(href: string): { result: AuthReturn; cleanUrl: string; changed: boolean } {
  const url = new URL(href)
  const fragment = new URLSearchParams(url.hash.slice(1))
  const read = (key: string) => url.searchParams.get(key) ?? fragment.get(key)
  let result: AuthReturn = { kind: 'none' }
  if (read('error') || read('error_code') || read('error_description')) {
    result = { kind: 'error', code: read('error_code') ?? 'confirmation_failed' }
  } else if (read('access_token') || read('refresh_token') || read('token_hash') || read('token')) {
    // This app initiates PKCE only. Never adopt arbitrary tokens from a URL.
    result = { kind: 'error', code: 'unsupported_callback' }
  } else if (read('code')) {
    result = { kind: 'code', code: read('code')!, flowId: read('sb_flow_id') ?? undefined }
  }
  let changed = false, hashChanged = false
  for (const key of authKeys) {
    if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true }
    if (fragment.has(key)) { fragment.delete(key); hashChanged = true; changed = true }
  }
  if (hashChanged) url.hash = fragment.toString() ? `#${fragment}` : ''
  return { result, cleanUrl: `${url.pathname}${url.search}${url.hash}`, changed }
}

export function consumeAuthReturn(): AuthReturn {
  const parsed = parseAuthReturn(window.location.href)
  if (parsed.changed) window.history.replaceState(window.history.state, '', parsed.cleanUrl)
  return parsed.result
}
