import { mountSlider, mountColorControl } from "dialkit/vanilla";
import { mountPresetSelect } from "./preset-select.js";
import { EXPORT_FORMAT_OPTIONS } from "../export-formats.js";
import { mountTouchSlider } from "./touch-slider.js";
import { mountMobileLayout, PHONE_LAYOUT } from "./mobile-layout.js";
import { createStudioIcon } from "./icons.js";
import { mountPhoneSheetMotion } from "./preset-menu-motion.js";

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

// Measure once per toggle so the controls retain their natural layout while
// the section opens. A quick reversal starts at the currently visible height.
export function mountStudioFolder(host, title, defaultOpen = true, root = false) {
  const folder = element("div", `dialkit-folder${root ? " dialkit-folder-root" : " studio-folder"}`);
  const header = element("div", `dialkit-folder-header${root ? " dialkit-panel-header" : ""}`);
  const trigger = element(root ? "div" : "button", "dialkit-folder-header-top");
  trigger.append(element("span", `dialkit-folder-title${root ? " dialkit-folder-title-root" : ""}`, title));
  const flatHeading = root ? null : element("h2", "dialkit-folder-header-top studio-folder-static-heading");
  if (flatHeading) {
    flatHeading.append(element("span", "dialkit-folder-title", title));
    flatHeading.hidden = true;
  }
  const content = element("div", "dialkit-folder-content");
  const body = element("div", "dialkit-folder-inner");
  content.append(body);
  header.append(trigger);
  if (flatHeading) header.append(flatHeading);
  folder.append(header, content);
  host.append(folder);
  let flat = false;
  let openBeforeFlat = defaultOpen;
  const syncDisclosure = () => {
    if (root) return;
    if (flat) {
      trigger.hidden = true;
      flatHeading.hidden = false;
    } else {
      trigger.hidden = false;
      flatHeading.hidden = true;
      trigger.setAttribute("aria-controls", content.id);
      trigger.setAttribute("aria-expanded", folder.dataset.open);
    }
  };
  const setOpen = (requestedOpen, allowAnimation = true) => {
    const open = flat ? true : requestedOpen;
    if (folder.dataset.open === String(open)) return;
    const animate = allowAnimation && !root && folder.dataset.open !== undefined && folder.getClientRects().length > 0
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate) {
      const height = content.getBoundingClientRect().height;
      content.style.transition = 'none';
      content.style.height = `${height}px`;
      // Establish the starting height once, including on an interrupted transition.
      void content.offsetHeight;
    }
    folder.dataset.open = String(open);
    if (!root && !flat) trigger.setAttribute("aria-expanded", String(open));
    content.inert = !open;
    content.setAttribute("aria-hidden", String(!open));
    content.style.transition = '';
    content.style.height = animate ? `${open ? body.scrollHeight : 0}px` : open ? 'auto' : '0px';
  };
  const setFlat = (nextFlat) => {
    if (root || flat === nextFlat) return;
    if (nextFlat) openBeforeFlat = folder.dataset.open === "true";
    flat = nextFlat;
    folder.dataset.phoneFlat = String(flat);
    setOpen(flat ? true : openBeforeFlat, false);
    content.style.transition = '';
    content.style.height = folder.dataset.open === "true" ? 'auto' : '0px';
    syncDisclosure();
  };
  content.addEventListener('transitionend', (event) => {
    if (event.target !== content || event.propertyName !== 'height') return;
    // Open sections must grow naturally when presets or validation text change.
    if (folder.dataset.open === 'true') content.style.height = 'auto';
  });
  if (!root) {
    content.id = `studio-section-${title.toLowerCase()}`;
    trigger.setAttribute("aria-controls", content.id);
    const glyph = createStudioIcon('chevron-down', { class: 'dialkit-folder-icon', width: 20, height: 20 });
    trigger.append(glyph);
    trigger.addEventListener("click", () => {
      if (!flat) setOpen(folder.dataset.open !== "true");
    });
  }
  setOpen(defaultOpen);
  syncDisclosure();
  return { body, setOpen, setFlat };
}

function mountStaticSection(host, title, showHeading = true) {
  const section = element("div", "dialkit-folder studio-folder studio-static-section");
  section.dataset.open = "true";
  if (showHeading) {
    const header = element("div", "dialkit-folder-header");
    const row = element("div", "dialkit-folder-header-top");
    row.append(element("span", "dialkit-folder-title", title));
    header.append(row);
    section.append(header);
  }
  const content = element("div", "dialkit-folder-content");
  content.id = `studio-section-${title.toLowerCase()}`;
  const body = element("div", "dialkit-folder-inner");
  content.append(body);
  section.append(content);
  host.append(section);
  return body;
}

function mountSegments(host, options, label, columns, onChange, className = "") {
  const group = element("div", `export-format-grid ${className}`);
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  group.style.setProperty("--segments", columns);
  const surfaces = element("span", "export-format-surfaces");
  surfaces.setAttribute("aria-hidden", "true");
  options.forEach(() => surfaces.append(element("span", "export-format-surface")));
  const thumb = element("span", "export-format-thumb");
  thumb.setAttribute("aria-hidden", "true");
  group.append(surfaces, thumb);
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
    if (nextValue === value && nextDisabled === disabled) return;
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
  const compact = window.matchMedia("(max-width: 980px)");
  const phone = window.matchMedia(PHONE_LAYOUT);
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
  const source = mountStaticSection(folders, "Source");

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
  const warning = createStudioIcon('circle-alert', { class: 'studio-upload-warning', width: 18, height: 18 });
  const errorBody = element("div", "");
  const errorText = element("p", "");
  errorBody.append(element("strong", "", "Image not uploaded"), errorText);
  uploadError.append(warning, errorBody);
  source.append(fileInput, upload, uploadError);

  const presets = mountStaticSection(folders, "Presets", false);
  let naming = false;
  const selectHost = element("div", "studio-control-host");
  presets.append(selectHost);
  const selectProps = () => ({ label: state.presetModified ? "Preset · Edited" : "Preset", value: state.selectedPreset,
    options: state.presets, onChange: (value) => { closeNamer(false); studio.selectPreset(value); } });
  const select = mountPresetSelect(selectHost, selectProps());
  let previousSelect = JSON.stringify(selectProps());
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
  presets.append(actions, namer);
  function closeNamer(focus = true) {
    naming = false;
    updateSource();
    if (focus) (save.disabled ? selectHost.querySelector("button") : save)?.focus();
  }
  function updateSource() {
    upload.classList.toggle("dialkit-button-primary", !state.hasUserImage);
    uploadError.hidden = !state.uploadError;
    if (errorText.textContent !== state.uploadError) errorText.textContent = state.uploadError;
    const nextSelect = selectProps();
    const selectSignature = JSON.stringify(nextSelect);
    if (selectSignature !== previousSelect) {
      previousSelect = selectSignature;
      select.update(nextSelect);
    }
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
  const layoutFolder = mountStudioFolder(folders, "Layout");
  const layout = layoutFolder.body;
  slider(layout, "cellSize", "Cell size", 3, 12, 1);
  slider(layout, "screenAngle", "Screen angle", -75, 75, 1, "°");
  const toneFolder = mountStudioFolder(folders, "Tone");
  const tone = toneFolder.body;
  slider(tone, "contrast", "Contrast", .5, 2.5, .05);
  slider(tone, "gamma", "Gamma", .4, 2.4, .01);
  slider(tone, "toneCurve", "Tone curve", .45, 2.2, .01);
  slider(tone, "minDot", "Minimum dot", 0, 60, 1, "%");
  const colorsFolder = mountStudioFolder(folders, "Colors");
  const colors = colorsFolder.body;
  for (const [key, label] of [["inkColor", "Ink"], ["paperColor", "Paper"]]) {
    const host = element("div", "studio-control-host");
    colors.append(host);
    const props = { label, value: state.settings[key], onChange: (value) => studio.setSetting(key, value) };
    const control = mountColorControl(host, props);
    controls.push(control);
    const swatch = host.querySelector('.dialkit-color-swatch');
    const sheetMotion = mountPhoneSheetMotion(host, swatch);
    controls.push(sheetMotion);
    const closeOnPhoneLayoutChange = () => {
      if (swatch.getAttribute('aria-expanded') === 'true') swatch.click();
    };
    phone.addEventListener('change', closeOnPhoneLayoutChange);
    controls.push({ destroy: () => phone.removeEventListener('change', closeOnPhoneLayoutChange) });
    swatch.addEventListener('click', () => {
      if (swatch.getAttribute('aria-expanded') !== 'true') return;
      const popup = root.querySelector(`.dialkit-color-popover[aria-label="${label} color picker"]`);
      if (!popup) return;
      popup.classList.toggle('studio-phone-sheet', window.matchMedia(PHONE_LAYOUT).matches);
      sheetMotion.open(popup);
      popup.querySelector('.dialkit-color-format-row').hidden = true;
      const plane = popup.querySelector('.dialkit-color-plane');
      // DialKit normally focuses the active format tab. Start at the first
      // visible control instead, without changing a pasted CSS color value.
      plane.focus({ preventScroll: true });
      popup.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || !event.shiftKey || event.target !== plane) return;
        event.preventDefault();
        event.stopPropagation();
        swatch.click();
        swatch.focus({ preventScroll: true });
      }, true);
    });
    let previous = props.value;
    bindings.push(() => {
      if (previous === state.settings[key]) return;
      previous = state.settings[key];
      control.update({ ...props, value: previous });
    });
  }
  colors.append(element("p", "studio-color-note", "Colors export in sRGB"));
  const advanced = mountStudioFolder(folders, "Advanced", !compact.matches);
  const adjustableFolders = [layoutFolder, toneFolder, colorsFolder, advanced];
  const syncAdjustLayout = () => {
    adjustableFolders.forEach(({ setFlat }) => setFlat(phone.matches));
    if (!phone.matches) advanced.setOpen(!compact.matches);
  };
  compact.addEventListener("change", syncAdjustLayout);
  phone.addEventListener("change", syncAdjustLayout);
  syncAdjustLayout();
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
    image: [source.closest(".studio-folder")],
    adjust: [presets, layout, tone, advanced.body].map((body) => body.closest(".studio-folder")),
    colors: [colors.closest(".studio-folder")]
  }, { onScrollActivity: (active) => studio.setPanelScrolling?.(active) });

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
    compact.removeEventListener("change", syncAdjustLayout);
    phone.removeEventListener("change", syncAdjustLayout);
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
