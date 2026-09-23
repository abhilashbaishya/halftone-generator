// Keep this breakpoint in sync with styles.css and dial-panel.css.
export const PHONE_LAYOUT = "(max-width: 767px), (max-width: 980px) and (max-height: 500px) and (pointer: coarse)";
export const PHONE_LANDSCAPE = "(max-width: 980px) and (max-height: 500px) and (pointer: coarse) and (orientation: landscape)";
// Includes iPads in landscape and with a trackpad attached.
export const TOUCH_LAYOUT = "(max-width: 767px), (any-pointer: coarse)";

export function mountMobileLayout(groups, { onScrollActivity = () => {} } = {}) {
  const rail = document.querySelector(".control-rail");
  const workspace = document.querySelector(".workspace");
  const landscapeHeading = document.getElementById("phoneLandscapeTitle");
  const panel = document.getElementById("dialPanelRoot");
  const actions = rail.querySelector(".rail-actions");
  const media = window.matchMedia(TOUCH_LAYOUT);
  const phoneLandscape = window.matchMedia(PHONE_LANDSCAPE);
  let scrollTimer;
  let scrolling = false;
  let portraitFocus = null;
  const finishScroll = () => {
    clearTimeout(scrollTimer);
    if (!scrolling) return;
    scrolling = false;
    onScrollActivity(false);
  };
  const onScroll = () => {
    if (!media.matches) return;
    if (!scrolling) {
      scrolling = true;
      onScrollActivity(true);
    }
    clearTimeout(scrollTimer);
    // Momentum also emits scroll events; wait until it settles before resuming work.
    scrollTimer = setTimeout(finishScroll, 180);
  };
  for (const node of [panel, actions, rail]) node.addEventListener('scroll', onScroll, { passive: true });
  const syncPhoneLandscape = () => {
    if (!workspace || !landscapeHeading) return;
    if (phoneLandscape.matches) {
      const active = document.activeElement;
      if (workspace.contains(active)) portraitFocus = active;
      workspace.inert = true;
      landscapeHeading.focus({ preventScroll: true });
      return;
    }
    workspace.inert = false;
    const restore = portraitFocus?.isConnected ? portraitFocus : null;
    portraitFocus = null;
    if (restore) restore.focus({ preventScroll: true });
    else if (document.activeElement === landscapeHeading) landscapeHeading.blur();
  };
  phoneLandscape.addEventListener("change", syncPhoneLandscape);
  syncPhoneLandscape();

  // Shrink the control sheet with the keyboard instead of letting iOS shove it.
  const phone = window.matchMedia(PHONE_LAYOUT);
  const root = document.documentElement;
  const syncKeyboardInset = () => {
    if (!phone.matches || !window.visualViewport) {
      root.style.removeProperty("--phone-keyboard-inset");
      return;
    }
    const vv = window.visualViewport;
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty("--phone-keyboard-inset", `${inset}px`);
  };
  window.visualViewport?.addEventListener("resize", syncKeyboardInset);
  window.visualViewport?.addEventListener("scroll", syncKeyboardInset);
  phone.addEventListener("change", syncKeyboardInset);
  syncKeyboardInset();

  const labels = ["Image", "Adjust", "Colors", "Export"];
  const nav = document.createElement("nav");
  nav.className = "mobile-editor-tabs export-format-grid";
  nav.setAttribute("aria-label", "Editor controls");
  nav.style.setProperty("--segments", String(labels.length));
  const surfaces = document.createElement("span");
  surfaces.className = "export-format-surfaces";
  surfaces.setAttribute("aria-hidden", "true");
  labels.forEach(() => {
    const surface = document.createElement("span");
    surface.className = "export-format-surface";
    surfaces.append(surface);
  });
  const thumb = document.createElement("span");
  thumb.className = "export-format-thumb";
  thumb.setAttribute("aria-hidden", "true");
  nav.append(surfaces, thumb);
  let active = "image";
  const scrollPositions = new Map();
  const scroller = (tab) => tab === "export" ? actions : panel;
  const buttons = labels.map((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "export-format-option";
    button.textContent = label;
    button.addEventListener("click", () => {
      const next = label.toLowerCase();
      if (next === active) return;
      finishScroll();
      scrollPositions.set(active, scroller(active).scrollTop);
      active = next;
      sync();
      scroller(active).scrollTop = scrollPositions.get(active) ?? 0;
    });
    nav.append(button);
    return button;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add("is-ready")));
  rail.insertBefore(nav, panel);
  function sync() {
    if (!media.matches) finishScroll();
    nav.hidden = !media.matches;
    panel.hidden = media.matches && active === "export";
    actions.hidden = media.matches && active !== "export";
    for (const [name, sections] of Object.entries(groups)) {
      for (const section of sections) section.hidden = media.matches && active !== name;
    }
    buttons.forEach((button, index) => {
      const selected = button.textContent.toLowerCase() === active;
      button.setAttribute("aria-pressed", String(selected));
      button.dataset.selected = String(selected);
      if (selected) nav.style.setProperty("--segment-index", String(index));
    });
  }
  media.addEventListener("change", sync);
  sync();
  return () => {
    finishScroll();
    for (const node of [panel, actions, rail]) node.removeEventListener('scroll', onScroll);
    media.removeEventListener("change", sync);
    phoneLandscape.removeEventListener("change", syncPhoneLandscape);
    window.visualViewport?.removeEventListener("resize", syncKeyboardInset);
    window.visualViewport?.removeEventListener("scroll", syncKeyboardInset);
    phone.removeEventListener("change", syncKeyboardInset);
    root.style.removeProperty("--phone-keyboard-inset");
    if (workspace) workspace.inert = false;
    panel.hidden = actions.hidden = false;
    Object.values(groups).flat().forEach((section) => { section.hidden = false; });
    nav.remove();
  };
}
