export function focusableWithin(root) {
  return [...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
    .filter(element => !element.closest('[hidden],[inert]') && element.getClientRects().length > 0);
}
export function trapDialogFocus(event, dialog) {
  if (event.key !== 'Tab') return;
  const targets = focusableWithin(dialog), first = targets[0], last = targets.at(-1);
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
export function rememberPanelFocus(panel) {
  const active = document.activeElement;
  if (!panel.contains(active)) return () => {};
  const keys = ['act','id','a','slot','src','g','tab','my','npc'];
  const attributes = Object.fromEntries(keys.filter(key=>active.dataset[key]!==undefined).map(key=>[key,active.dataset[key]]));
  const id = active.id;
  const selection = typeof active.selectionStart === 'number' ? [active.selectionStart,active.selectionEnd] : null;
  return () => {
    const candidates = focusableWithin(panel);
    const next = candidates.find(element => id ? element.id === id : Object.keys(attributes).length > 0 && Object.entries(attributes).every(([key,value])=>element.dataset[key]===value));
    const target = next ?? candidates.find(element=>element.closest('.care')) ?? candidates[0];
    target?.focus({preventScroll:true});
    if (next && selection && typeof next.setSelectionRange === 'function') { try { next.setSelectionRange(...selection); } catch { /* unsupported input type */ } }
  };
}
