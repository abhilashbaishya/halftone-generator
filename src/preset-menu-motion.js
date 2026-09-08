// DialKit owns focus and selection. A non-interactive visual copy lets its
// immediate close remain accessible while the surface finishes fading away.
export function mountPresetMenuMotion(host, trigger) {
  let current, entering, exiting, exitAnimation, pending, destroyed = false;
  let closeFrame = 0;
  const canAnimate = (node) => typeof node?.animate === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const appearance = (node) => {
    const style = getComputedStyle(node);
    return { opacity: style.opacity || '1', transform: style.transform || 'none' };
  };
  const clearExit = () => {
    exitAnimation?.cancel();
    exiting?.remove();
    exitAnimation = exiting = undefined;
  };
  const captureClose = (event) => {
    const popup = current;
    if (destroyed || !popup?.isConnected || !canAnimate(popup) || pending === popup) return;
    const inside = popup.contains(event.target), onTrigger = trigger.contains(event.target);
    const closes = event.type === 'click' && (onTrigger || event.target.closest('.dialkit-select-option') && inside)
      || event.type === 'pointerdown' && !inside && !onTrigger
      || event.type === 'focusin' && !inside && !onTrigger
      || event.type === 'keydown' && inside && ['Escape', 'Tab', 'Enter', ' '].includes(event.key);
    if (!closes) return;
    const from = appearance(popup);
    const copy = popup.cloneNode(true);
    const scrollTop = popup.scrollTop;
    pending = popup;
    // Native events can checkpoint microtasks between capture and bubble
    // listeners. Wait for the whole event before checking DialKit's removal.
    closeFrame = requestAnimationFrame(() => {
      closeFrame = 0;
      if (pending === popup) pending = undefined;
      if (destroyed || !host.isConnected || popup.isConnected || current !== popup) return;
      current = undefined;
      entering?.cancel();
      clearExit();
      copy.classList.remove('studio-preset-menu');
      copy.classList.add('studio-preset-menu-exit');
      copy.removeAttribute('id');
      copy.removeAttribute('role');
      copy.setAttribute('aria-hidden', 'true');
      copy.inert = true;
      copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      host.closest('.dialkit-root').append(copy);
      copy.scrollTop = scrollTop;
      if (typeof copy.showPopover === 'function') {
        copy.setAttribute('popover', 'manual');
        copy.showPopover();
      }
      exiting = copy;
      const animation = copy.animate([from, { opacity: 0, transform: 'translateY(-6px)' }], {
        duration: 240, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'forwards'
      });
      exitAnimation = animation;
      animation.finished.then(() => { if (exiting === copy) clearExit(); }, () => {});
    });
  };
  for (const type of ['click', 'pointerdown', 'focusin', 'keydown']) document.addEventListener(type, captureClose, true);
  return {
    open(popup) {
      if (current === popup) return;
      cancelAnimationFrame(closeFrame);
      closeFrame = 0;
      pending = undefined;
      const from = exiting ? appearance(exiting) : { opacity: 0, transform: 'translateY(-6px)' };
      clearExit();
      entering?.cancel();
      current = popup;
      if (!canAnimate(popup)) return;
      entering = popup.animate([from, { opacity: 1, transform: 'none' }], {
        duration: 300, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      });
      entering.finished.catch(() => {});
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(closeFrame);
      entering?.cancel();
      clearExit();
      for (const type of ['click', 'pointerdown', 'focusin', 'keydown']) document.removeEventListener(type, captureClose, true);
    }
  };
}
