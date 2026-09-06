// Keep this breakpoint in sync with styles.css and dial-panel.css.
export const PHONE_LAYOUT = "(max-width: 767px), (max-width: 980px) and (max-height: 500px) and (pointer: coarse)";

export function mountMobileLayout(groups) {
  const rail = document.querySelector(".control-rail");
  const panel = document.getElementById("dialPanelRoot");
  const actions = rail.querySelector(".rail-actions");
  const media = window.matchMedia(PHONE_LAYOUT);
  const nav = document.createElement("nav");
  nav.className = "mobile-editor-tabs";
  nav.setAttribute("aria-label", "Editor controls");
  let active = "presets";
  const buttons = ["Presets", "Adjust", "Colors", "Export"].map((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      active = label.toLowerCase();
      sync();
      panel.scrollTop = actions.scrollTop = 0;
    });
    nav.append(button);
    return button;
  });
  rail.insertBefore(nav, panel);
  function sync() {
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
    media.removeEventListener("change", sync);
    panel.hidden = actions.hidden = false;
    Object.values(groups).flat().forEach((section) => { section.hidden = false; });
    nav.remove();
  };
}
