// All devices use the same editor; the responsive shell arranges its controls.
Promise.all([
  import("../script.js"), import("./studio-panel.js"),
  import("./studio-styles.js")
]).then(([, { mountStudioPanel }]) => mountStudioPanel(window.halftoneStudio));
