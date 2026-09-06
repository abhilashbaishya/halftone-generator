import { mountSlider, mountSelectControl, mountColorControl } from "dialkit/vanilla";
import { EXPORT_FORMAT_OPTIONS } from "../export-formats.js";
import { mountTouchSlider } from "./touch-slider.js";
import { mountMobileLayout } from "./mobile-layout.js";

const PROFILE_OPTIONS = ["draft", "high", "ultra", "print"].map((value) => ({
  value, label: value[0].toUpperCase() + value.slice(1)
}));

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  if (tag === "button") node.type = "button";
  return node;
}

function button(label, onClick, className = "") {
  const node = element("button", `dialkit-button ${className}`, label);
  node.addEventListener("click", onClick);
  return node;
}

// Native buttons provide Enter/Space activation. CSS keeps our fast, clipping
// section motion independent of DialKit's default fading spring animation.
export function mountStudioFolder(host, title, defaultOpen = true, root = false) {
  const folder = element("div", `dialkit-folder${root ? " dialkit-folder-root" : " studio-folder"}`);
  const header = element("div", `dialkit-folder-header${root ? " dialkit-panel-header" : ""}`);
  const trigger = element(root ? "div" : "button", "dialkit-folder-header-top");
  trigger.append(element("span", `dialkit-folder-title${root ? " dialkit-folder-title-root" : ""}`, title));
  const content = element("div", "dialkit-folder-content");
  const body = element("div", "dialkit-folder-inner");
  content.append(body);
  header.append(trigger);
  folder.append(header, content);
  host.append(folder);
  const setOpen = (open) => {
    folder.dataset.open = String(open);
    if (!root) trigger.setAttribute("aria-expanded", String(open));
    content.inert = !open;
    content.setAttribute("aria-hidden", String(!open));
  };
  if (!root) {
    content.id = `studio-section-${title.toLowerCase()}`;
    trigger.setAttribute("aria-controls", content.id);
    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    glyph.setAttribute("viewBox", "0 0 16 16");
    glyph.setAttribute("class", "dialkit-folder-icon");
    glyph.setAttribute("aria-hidden", "true");
    glyph.innerHTML = '<path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    trigger.append(glyph);
    trigger.addEventListener("click", () => setOpen(folder.dataset.open !== "true"));
  }
  setOpen(defaultOpen);
  return { body, setOpen };
}

function mountSegments(host, options, label, columns, onChange, className = "") {
  const group = element("div", `export-format-grid ${className}`);
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  group.style.setProperty("--segments", columns);
  group.append(element("span", "export-format-thumb"));
  let value, disabled = false;
  const buttons = options.map((option) => {
    const node = element("button", "export-format-option", option.label);
    node.setAttribute("role", "radio");
    node.dataset.value = option.value;
    node.addEventListener("click", () => { if (!disabled) onChange(option.value); });
    group.append(node);
    return node;
  });
  group.addEventListener("keydown", (event) => {
    if (disabled) return;
    const current = Math.max(0, options.findIndex((option) => option.value === value));
    const keys = { ArrowRight: (current + 1) % options.length, ArrowDown: (current + 1) % options.length,
      ArrowLeft: (current + options.length - 1) % options.length, ArrowUp: (current + options.length - 1) % options.length,
      Home: 0, End: options.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    onChange(options[keys[event.key]].value);
    buttons[keys[event.key]].focus();
  });
  host.append(group);
  requestAnimationFrame(() => requestAnimationFrame(() => group.classList.add("is-ready")));
  return (nextValue, nextDisabled = false) => {
    value = nextValue;
    disabled = nextDisabled;
    group.style.setProperty("--segment-index", Math.max(0, options.findIndex((option) => option.value === value)));
    buttons.forEach((node, index) => {
      const selected = options[index].value === value;
      node.tabIndex = selected ? 0 : -1;
      node.disabled = disabled;
      node.dataset.selected = String(selected);
      node.setAttribute("aria-checked", String(selected));
    });
  };
}

export function mountStudioPanel(studio) {
  let state = studio.getState();
  const bindings = [];
  const controls = [];
  const root = element("div", "dialkit-root halftone-dialkit");
  root.dataset.mode = "inline";
  root.dataset.theme = state.theme;
  const panel = element("div", "dialkit-panel");
  panel.dataset.mode = "inline";
  const inner = element("div", "dialkit-panel-inner dialkit-panel-inline");
  panel.append(inner);
  root.append(panel);
  document.getElementById("dialPanelRoot").replaceChildren(root);
  const folders = mountStudioFolder(inner, "Halftone Studio", true, true).body;
  const source = mountStudioFolder(folders, "Source").body;

  const fileInput = element("input", "sr-only");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.tabIndex = -1;
  fileInput.setAttribute("aria-hidden", "true");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) studio.openImageFile(file);
  });
  const upload = button("Upload image", () => fileInput.click(), "studio-upload-button");
  const uploadError = element("div", "dialkit-upload-error");
  uploadError.setAttribute("role", "alert");
  uploadError.setAttribute("aria-live", "assertive");
  uploadError.setAttribute("aria-atomic", "true");
  const warning = element("span", "studio-upload-warning", "!");
  warning.setAttribute("aria-hidden", "true");
  const errorBody = element("div", "");
  const errorText = element("p", "");
  errorBody.append(element("strong", "", "Image not uploaded"), errorText);
  uploadError.append(warning, errorBody);
  source.append(fileInput, upload, uploadError);

  let naming = false;
  const selectHost = element("div", "studio-control-host");
  source.append(selectHost);
  const selectProps = () => ({ label: state.presetModified ? "Preset · Edited" : "Preset", value: state.selectedPreset,
    options: state.presets, onChange: (value) => { closeNamer(false); studio.selectPreset(value); } });
  const select = mountSelectControl(selectHost, selectProps());
  controls.push(select);
  const actions = element("div", "dialkit-preset-actions");
  const namer = element("form", "dialkit-preset-namer");
  const nameRow = element("label", "dialkit-text-control");
  const nameInput = element("input", "dialkit-text-input");
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.placeholder = "Preset name";
  nameInput.autocomplete = "off";
  nameRow.append(element("span", "dialkit-text-label", "Name"), nameInput);
  const nameError = element("p", "dialkit-inline-error");
  nameError.id = "studio-preset-error";
  nameError.setAttribute("role", "alert");
  nameInput.setAttribute("aria-describedby", nameError.id);
  const nameActions = element("div", "dialkit-preset-actions");
  const confirm = button("Save", () => {}, "dialkit-button-primary");
  confirm.type = "submit";
  const cancel = button("Cancel", () => closeNamer());
  nameActions.append(confirm, cancel);
  namer.append(nameRow, nameError, nameActions);
  namer.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = studio.savePreset(nameInput.value);
    if (!result.ok) {
      nameError.textContent = result.message;
      nameError.hidden = false;
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
    } else closeNamer();
  });
  nameInput.addEventListener("input", () => {
    nameError.hidden = true;
    nameInput.removeAttribute("aria-invalid");
  });
  namer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeNamer(); }
  });
  const save = button("Save preset", () => {
    naming = true;
    nameInput.value = state.isCustomPreset ? state.selectedPreset : "";
    nameError.hidden = true;
    nameInput.removeAttribute("aria-invalid");
    updateSource();
    nameInput.focus();
    nameInput.select();
  });
  const revert = button("Revert", () => { studio.revertPreset(); selectHost.querySelector("button")?.focus(); });
  const remove = button("Delete", () => { studio.deletePreset(); selectHost.querySelector("button")?.focus(); }, "dialkit-button-danger");
  actions.append(save, revert, remove);
  source.append(actions, namer);
  function closeNamer(focus = true) {
    naming = false;
    updateSource();
    if (focus) (save.disabled ? selectHost.querySelector("button") : save)?.focus();
  }
  function updateSource() {
    upload.classList.toggle("dialkit-button-primary", !state.hasUserImage);
    uploadError.hidden = !state.uploadError;
    if (errorText.textContent !== state.uploadError) errorText.textContent = state.uploadError;
    select.update(selectProps());
    namer.hidden = !naming;
    actions.hidden = naming;
    save.disabled = !state.presetModified;
    save.textContent = state.isCustomPreset && state.presetModified ? "Update preset" : "Save preset";
    save.classList.toggle("dialkit-button-primary", state.presetModified);
    revert.hidden = !state.presetModified;
    remove.hidden = !state.isCustomPreset;
  }
  bindings.push(updateSource);

  function slider(host, key, label, min, max, step, unit = "") {
    const target = element("div", "studio-control-host");
    host.append(target);
    const props = { label, min, max, step, unit, value: state.settings[key], onChange: (value) => studio.setSetting(key, value) };
    const control = mountSlider(target, props);
    const track = target.querySelector(".dialkit-slider");
    // The studio uses pointer-driven sliders; keep normal editing inside the
    // numeric input, but opt out of DialKit 2's new slider keyboard shortcuts.
    track.tabIndex = -1;
    track.addEventListener("keydown", (event) => {
      if (event.target === track) event.stopImmediatePropagation();
    }, true);
    track.addEventListener("focusin", () => { track.tabIndex = -1; });
    track.addEventListener("focusout", () => {
      queueMicrotask(() => { track.tabIndex = -1; });
    });
    const removeTouch = mountTouchSlider(track, { ...props, onInteraction: (active) => studio.setPreviewInteraction?.(active) });
    controls.push({ destroy: removeTouch });
    controls.push(control);
    let previous = props.value;
    bindings.push(() => {
      if (previous === state.settings[key]) return;
      previous = state.settings[key];
      control.update({ ...props, value: previous });
    });
  }
  const layout = mountStudioFolder(folders, "Layout").body;
  slider(layout, "cellSize", "Cell size", 3, 20, 1, "px");
  slider(layout, "screenAngle", "Screen angle", -75, 75, 1, "°");
  const tone = mountStudioFolder(folders, "Tone").body;
  slider(tone, "contrast", "Contrast", .5, 2.5, .05);
  slider(tone, "gamma", "Gamma", .4, 2.4, .01);
  slider(tone, "toneCurve", "Tone curve", .45, 2.2, .01);
  slider(tone, "minDot", "Minimum dot", 0, 60, 1, "%");
  const colors = mountStudioFolder(folders, "Colors").body;
  for (const [key, label] of [["inkColor", "Ink"], ["paperColor", "Paper"]]) {
    const host = element("div", "studio-control-host");
    colors.append(host);
    const props = { label, value: state.settings[key], onChange: (value) => studio.setSetting(key, value) };
    const control = mountColorControl(host, props);
    controls.push(control);
    let previous = props.value;
    bindings.push(() => {
      if (previous === state.settings[key]) return;
      previous = state.settings[key];
      control.update({ ...props, value: previous });
    });
  }
  colors.append(element("p", "studio-color-note", "Colors export in sRGB"));
  const compact = window.matchMedia("(max-width: 980px)");
  const advanced = mountStudioFolder(folders, "Advanced", !compact.matches);
  const onCompact = () => advanced.setOpen(!compact.matches);
  compact.addEventListener("change", onCompact);
  slider(advanced.body, "grainStrength", "Grain", 0, 100, 1, "%");
  slider(advanced.body, "bloomStrength", "Bloom", 0, 100, 1, "%");
  slider(advanced.body, "crtStrength", "CRT", 0, 100, 1, "%");

  const exportRoot = element("div", "dialkit-root halftone-dialkit export-dialkit");
  exportRoot.dataset.mode = "inline";
  const exportControls = element("div", "export-controls");
  const qualityField = element("div", "segmented-field");
  qualityField.append(element("span", "segmented-field-label", "Render profile"));
  const updateQuality = mountSegments(qualityField, PROFILE_OPTIONS, "Render profile", 4, (value) => studio.setSetting("quality", value), "render-profile-grid");
  exportControls.append(qualityField);
  const updateFormat = mountSegments(exportControls, EXPORT_FORMAT_OPTIONS, "Export format", 3, (value) => studio.setExportFormat(value));
  exportRoot.append(exportControls);
  document.getElementById("exportControlsRoot").replaceChildren(exportRoot);
  bindings.push(() => { updateQuality(state.settings.quality); updateFormat(state.export.format, state.export.exporting); });

  const unmountMobile = mountMobileLayout({
    presets: [source.closest(".studio-folder")],
    adjust: [layout, tone, advanced.body].map((body) => body.closest(".studio-folder")),
    colors: [colors.closest(".studio-folder")]
  });

  // Observe only our color drag surfaces; DialKit/native ranges retain their
  // own pointer capture. This tells the renderer when to refine the preview.
  const colorPointers = new Set();
  const colorStart = (event) => {
    if (event.pointerType !== "touch" || !event.target.closest(".halftone-dialkit .dialkit-color-plane, .halftone-dialkit .dialkit-color-track")) return;
    if (colorPointers.has(event.pointerId)) return;
    colorPointers.add(event.pointerId);
    studio.setPreviewInteraction?.(true);
  };
  const colorEnd = (event) => {
    if (colorPointers.delete(event.pointerId)) studio.setPreviewInteraction?.(false);
  };
  const colorCancel = () => {
    for (const id of colorPointers) colorEnd({ pointerId: id });
  };
  document.addEventListener("pointerdown", colorStart, true);
  document.addEventListener("pointerup", colorEnd, true);
  document.addEventListener("pointercancel", colorEnd, true);
  document.addEventListener("lostpointercapture", colorEnd, true);
  window.addEventListener("blur", colorCancel);

  const update = (event) => {
    state = event?.detail ?? studio.getState();
    root.dataset.theme = exportRoot.dataset.theme = state.theme;
    bindings.forEach((bind) => bind());
  };
  window.addEventListener(studio.eventName, update);
  update();
  return () => {
    window.removeEventListener(studio.eventName, update);
    compact.removeEventListener("change", onCompact);
    unmountMobile();
    colorCancel();
    document.removeEventListener("pointerdown", colorStart, true);
    document.removeEventListener("pointerup", colorEnd, true);
    document.removeEventListener("pointercancel", colorEnd, true);
    document.removeEventListener("lostpointercapture", colorEnd, true);
    window.removeEventListener("blur", colorCancel);
    controls.forEach((control) => control.destroy());
    root.remove();
    exportRoot.remove();
  };
}
