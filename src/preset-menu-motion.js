const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const DEFAULT_MOTION = {
  enterDuration: 200,
  exitDuration: 150,
  enterTransform: 'translateY(-4px) scale(0.97)',
  exitTransform: 'translateY(-4px) scale(0.97)',
  enterEasing: EASE_OUT,
  exitEasing: EASE_OUT
};

const PHONE_SHEET_MOTION = {
  enterDuration: 220,
  exitDuration: 160,
  enterTransform: 'translateY(14px) scale(0.98)',
  exitTransform: 'translateY(10px) scale(0.98)',
  enterEasing: EASE_OUT,
  exitEasing: 'cubic-bezier(0.4, 0, 1, 1)'
};

const phoneSheetDismissals = new WeakSet();

export function isPhoneSheetDismissal(event) {
  return phoneSheetDismissals.has(event);
}

function anchorTransformOrigin(popup, trigger) {
  if (popup.classList.contains('studio-phone-sheet')) {
    popup.style.transformOrigin = 'center bottom';
    return;
  }
  const popupRect = popup.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  if (!popupRect.width || !popupRect.height) {
    popup.style.transformOrigin = '50% 0%';
    return;
  }
  const x = Math.min(
    Math.max(triggerRect.left + triggerRect.width / 2 - popupRect.left, 0),
    popupRect.width
  );
  const y = Math.min(
    Math.max(triggerRect.top + triggerRect.height / 2 - popupRect.top, 0),
    popupRect.height
  );
  popup.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
}

// DialKit owns focus and selection. A non-interactive visual copy lets its
// immediate close remain accessible while the surface finishes fading away.
function mountPopupMotion(host, trigger, {
  enabled = () => true,
  optionSelector = '',
  liveClass,
  exitClass
}) {
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
  const motionFor = (node) => node.classList.contains('studio-phone-sheet')
    ? PHONE_SHEET_MOTION
    : DEFAULT_MOTION;
  const captureClose = (event) => {
    const popup = current;
    if (destroyed || !popup?.isConnected || !enabled(popup) || pending === popup) return;
    const inside = popup.contains(event.target), onTrigger = trigger.contains(event.target);
    const choseOption = optionSelector && inside && event.target.closest(optionSelector);
    const closes = event.type === 'click' && (onTrigger || choseOption)
      || event.type === 'pointerdown' && !inside && !onTrigger
      || event.type === 'focusin' && !inside && !onTrigger
      || event.type === 'keydown' && inside && ['Escape', 'Tab', 'Enter', ' '].includes(event.key);
    if (!closes) return;
    if (event.type === 'pointerdown' && popup.classList.contains('studio-phone-sheet')) {
      phoneSheetDismissals.add(event);
    }
    if (!canAnimate(popup)) return;
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
      if (liveClass) copy.classList.remove(liveClass);
      copy.classList.add(exitClass);
      if (copy.classList.contains('studio-phone-sheet')) copy.classList.add('studio-phone-sheet-exit');
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
      const motion = motionFor(copy);
      copy.style.transformOrigin = popup.style.transformOrigin || copy.style.transformOrigin;
      const animation = copy.animate([from, { opacity: 0, transform: motion.exitTransform }], {
        duration: motion.exitDuration, easing: motion.exitEasing, fill: 'forwards'
      });
      exitAnimation = animation;
      animation.finished.then(() => { if (exiting === copy) clearExit(); }, () => {});
    });
  };
  for (const type of ['click', 'pointerdown', 'focusin', 'keydown']) document.addEventListener(type, captureClose, true);
  return {
    open(popup) {
      if (!enabled(popup) || current === popup) return;
      cancelAnimationFrame(closeFrame);
      closeFrame = 0;
      pending = undefined;
      const motion = motionFor(popup);
      const from = exiting ? appearance(exiting) : { opacity: 0, transform: motion.enterTransform };
      clearExit();
      entering?.cancel();
      current = popup;
      if (!canAnimate(popup)) return;
      anchorTransformOrigin(popup, trigger);
      entering = popup.animate([from, { opacity: 1, transform: 'none' }], {
        duration: motion.enterDuration, easing: motion.enterEasing
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

export function mountPresetMenuMotion(host, trigger) {
  return mountPopupMotion(host, trigger, {
    optionSelector: '.dialkit-select-option',
    liveClass: 'studio-preset-menu',
    exitClass: 'studio-preset-menu-exit'
  });
}

export function mountPhoneSheetMotion(host, trigger) {
  return mountPopupMotion(host, trigger, {
    enabled: (popup) => popup.classList.contains('studio-phone-sheet'),
    exitClass: 'studio-phone-sheet-exit'
  });
}
