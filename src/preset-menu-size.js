// DialKit's 320px cap includes our extra footer. Reserve four complete rows
// instead, and place the resulting menu on whichever side has room.
export function mountPresetMenuSize(popup, trigger) {
  const list = popup.querySelector('.studio-preset-list');
  const footer = popup.querySelector('.studio-preset-menu-actions');
  const update = () => {
    if (!popup.isConnected || popup.classList.contains('studio-phone-sheet')) return;
    const style = getComputedStyle(popup);
    const px = (value) => parseFloat(value) || 0;
    const chrome = px(style.paddingTop) + px(style.paddingBottom)
      + px(style.borderTopWidth) + px(style.borderBottomWidth);
    const rows = [...list.children].slice(0, 4);
    const desired = Math.ceil(rows.reduce((height, row) => height + row.offsetHeight, 0)
      + footer.offsetHeight + px(getComputedStyle(footer).marginTop) + chrome);
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const rect = trigger.getBoundingClientRect();
    const below = Math.max(0, viewportTop + viewportHeight - rect.bottom - 12);
    const above = Math.max(0, rect.top - viewportTop - 12);
    const openAbove = below < desired && above > below;
    const height = Math.min(desired, openAbove ? above : below);
    const top = Math.max(viewportTop + 8, openAbove ? rect.top - height - 4 : rect.bottom + 4);
    for (const [name, value] of [['--preset-menu-height', height], ['--preset-menu-top', top]]) {
      if (popup.style.getPropertyValue(name) !== `${value}px`) popup.style.setProperty(name, `${value}px`);
    }
  };
  // Reapply after DialKit positions the portal, including while the panel moves.
  const positionObserver = new MutationObserver(update);
  positionObserver.observe(popup, { attributes: true, attributeFilter: ['style'] });
  const sizeObserver = new ResizeObserver(update);
  for (const element of [trigger, footer, ...list.children]) sizeObserver.observe(element);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  update();
  return () => {
    positionObserver.disconnect();
    sizeObserver.disconnect();
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update, true);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
  };
}
