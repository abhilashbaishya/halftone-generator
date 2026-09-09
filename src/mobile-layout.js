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
  const nav = document.createElement("nav");
  nav.className = "mobile-editor-tabs";
  nav.setAttribute("aria-label", "Editor controls");
  let active = "image";
  const scrollPositions = new Map();
  const scroller = (tab) => tab === "export" ? actions : panel;
  const buttons = ["Image", "Adjust", "Colors", "Export"].map((label) => {
    const button = document.createElement("button");
    button.type = "button";
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
  rail.insertBefore(nav, panel);
  function sync() {
    if (!media.matches) finishScroll();
    nav.hidden = !media.matches;
    panel.hidden = media.matches && active === "export";
    actions.hidden = media.matches && active !== "export";
    for (const [name, sections] of Object.entries(groups)) {
      for (const section of sections) section.hidden = media.matches && active !== name;
    }
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.textContent.toLowerCase() === active)));
  }
  media.addEventListener("change", sync);
  sync();
  return () => {
    finishScroll();
    for (const node of [panel, actions, rail]) node.removeEventListener('scroll', onScroll);
    media.removeEventListener("change", sync);
    phoneLandscape.removeEventListener("change", syncPhoneLandscape);
    if (workspace) workspace.inert = false;
    panel.hidden = actions.hidden = false;
    Object.values(groups).flat().forEach((section) => { section.hidden = false; });
    nav.remove();
  };
}
