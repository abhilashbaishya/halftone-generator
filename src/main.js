const MOBILE_SHELL = "(pointer: coarse), (hover: none) and (max-width: 820px)";
let desktopBoot;

function syncShell() {
  if (window.matchMedia(MOBILE_SHELL).matches) {
    document.title = "Halftone Studio · Open on a computer";
    return;
  }
  document.title = "Halftone Studio";
  // Phones keep the lightweight gate; the editor and its styles load on demand.
  desktopBoot ??= Promise.all([
    import("../script.js"), import("./studio-panel.js"),
    import("./studio-styles.js")
  ])
    .then(([, { mountStudioPanel }]) => mountStudioPanel(window.halftoneStudio));
}

syncShell();
window.matchMedia(MOBILE_SHELL).addEventListener("change", syncShell);
