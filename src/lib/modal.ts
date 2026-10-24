/** Keep focus restoration reliable when React removes a native dialog. */
export function openModal(dialog: HTMLDialogElement | null): () => void {
  const active = document.activeElement
  const opener = active instanceof HTMLElement && active !== document.body ? active : null
  const fallback = ['.mobile-menu-toggle', '.site-header .brand']
    .map(selector => document.querySelector<HTMLElement>(selector))
    .find(element => element && element.getClientRects().length > 0)
  dialog?.showModal()
  return () => {
    dialog?.close()
    const target = opener?.isConnected && opener.getClientRects().length > 0 ? opener : fallback
    if (target?.isConnected) target.focus({ preventScroll: true })
  }
}
