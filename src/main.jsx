import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  ButtonGroup,
  Folder,
  SelectControl,
  Slider,
  TextControl
} from "dialkit";
import "dialkit/styles.css";
import "./dial-panel.css";
import { EXPORT_FORMAT_OPTIONS, getExportFormat } from "../export-formats.js";
import "../script.js";

const RENDER_PROFILE_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
  { value: "print", label: "Print" }
];

const TOUCH_AXIS_THRESHOLD = 10;
const TOUCH_HORIZONTAL_BIAS = 1.15;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToHsv(hex) {
  if (!HEX_COLOR_PATTERN.test(hex)) return { h: 0, s: 0, v: 1 };

  const numeric = Number.parseInt(hex.slice(1), 16);
  const r = ((numeric >> 16) & 255) / 255;
  const g = ((numeric >> 8) & 255) / 255;
  const b = (numeric & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / delta + 2) / 6;
    else h = ((r - g) / delta + 4) / 6;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }) {
  const sector = Math.floor(h * 6);
  const fraction = h * 6 - sector;
  const p = v * (1 - s);
  const q = v * (1 - fraction * s);
  const t = v * (1 - (1 - fraction) * s);
  const colors = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]];
  const [r, g, b] = colors[sector % 6];

  return `#${[r, g, b]
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function snapSliderValue(clientX, rect, min, max, step) {
  const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const rawValue = min + percent * (max - min);
  const snappedValue = min + Math.round((rawValue - min) / step) * step;
  const decimals = `${step}`.split(".")[1]?.length ?? 0;
  return Number(Math.max(min, Math.min(max, snappedValue)).toFixed(decimals));
}

function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 980px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 980px)");
    const update = (event) => setCompact(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return compact;
}

function useStudioState() {
  const [state, setState] = useState(() => window.halftoneStudio?.getState() ?? null);

  useEffect(() => {
    const eventName = window.halftoneStudio.eventName;
    const update = (event) => setState(event.detail);
    window.addEventListener(eventName, update);
    setState(window.halftoneStudio.getState());
    return () => window.removeEventListener(eventName, update);
  }, []);

  return state;
}

function SettingSlider({ settingKey, value, min = 0, max = 1, step = 0.01, ...props }) {
  const touchGesture = useRef(null);

  const handleChange = useCallback((nextValue) => {
    window.halftoneStudio.setSetting(settingKey, nextValue);
  }, [settingKey]);

  const handlePointerDownCapture = useCallback((event) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;

    event.stopPropagation();
    touchGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode: "pending",
      rect: event.currentTarget.getBoundingClientRect()
    };
  }, []);

  const handlePointerMoveCapture = useCallback((event) => {
    const gesture = touchGesture.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    event.stopPropagation();
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (gesture.mode === "pending") {
      if (Math.max(horizontalDistance, verticalDistance) < TOUCH_AXIS_THRESHOLD) return;

      if (verticalDistance > horizontalDistance * TOUCH_HORIZONTAL_BIAS) {
        gesture.mode = "scroll";
        return;
      }

      if (horizontalDistance > verticalDistance * TOUCH_HORIZONTAL_BIAS) {
        gesture.mode = "adjust";
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        return;
      }
    }

    if (gesture.mode !== "adjust") return;
    event.preventDefault();
    handleChange(snapSliderValue(event.clientX, gesture.rect, min, max, step));
  }, [handleChange, max, min, step]);

  const finishTouchGesture = useCallback((event) => {
    const gesture = touchGesture.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    event.stopPropagation();
    if (gesture.mode === "adjust") {
      event.preventDefault();
      handleChange(snapSliderValue(event.clientX, gesture.rect, min, max, step));
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    touchGesture.current = null;
  }, [handleChange, max, min, step]);

  const cancelTouchGesture = useCallback((event) => {
    if (touchGesture.current?.pointerId === event.pointerId) {
      touchGesture.current = null;
    }
  }, []);

  return (
    <div
      className="dialkit-touch-safe-slider"
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={finishTouchGesture}
      onPointerCancelCapture={cancelTouchGesture}
    >
      <Slider value={value} onChange={handleChange} min={min} max={max} step={step} {...props} />
    </div>
  );
}

function SettingSelect({ settingKey, value, ...props }) {
  const handleChange = useCallback((nextValue) => {
    window.halftoneStudio.setSetting(settingKey, nextValue);
  }, [settingKey]);

  return <SelectControl value={value} onChange={handleChange} {...props} />;
}

function SettingColor({ settingKey, value, ...props }) {
  const handleChange = useCallback((nextValue) => {
    window.halftoneStudio.setSetting(settingKey, nextValue);
  }, [settingKey]);

  return <StudioColorControl value={value} onChange={handleChange} {...props} />;
}

function StudioColorControl({ label, value, onChange }) {
  const panelId = `studio-color-${useId().replaceAll(":", "")}`;
  const swatchRef = useRef(null);
  const panelRef = useRef(null);
  const nativeInputRef = useRef(null);
  const saturationRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toUpperCase());
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [position, setPosition] = useState(null);

  useEffect(() => {
    setHsv(hexToHsv(value));
    if (!editing) setEditValue(value.toUpperCase());
  }, [editing, value]);

  useEffect(() => {
    if (!open) return undefined;

    let frame = 0;
    const reposition = () => {
      const anchor = swatchRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const rect = anchor.getBoundingClientRect();
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const edge = 8;
      const gap = 6;
      const left = clampValue(rect.right - panelWidth, edge, window.innerWidth - panelWidth - edge);
      const spaceBelow = window.innerHeight - rect.bottom - edge;
      const spaceAbove = rect.top - edge;
      const openAbove = panelHeight > spaceBelow && spaceAbove > spaceBelow;
      const preferredTop = openAbove ? rect.top - panelHeight - gap : rect.bottom + gap;
      const top = clampValue(preferredTop, edge, window.innerHeight - panelHeight - edge);
      setPosition({ left, top });
    };
    const closeOutside = (event) => {
      if (panelRef.current?.contains(event.target) || swatchRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      swatchRef.current?.focus();
    };

    frame = requestAnimationFrame(() => {
      reposition();
      saturationRef.current?.focus({ preventScroll: true });
    });
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const commitHsv = useCallback((nextHsv) => {
    setHsv(nextHsv);
    onChange(hsvToHex(nextHsv));
  }, [onChange]);

  const updateSaturation = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    commitHsv({
      ...hsv,
      s: clampValue((event.clientX - rect.left) / rect.width, 0, 1),
      v: clampValue(1 - (event.clientY - rect.top) / rect.height, 0, 1)
    });
  }, [commitHsv, hsv]);

  const submitHex = useCallback(() => {
    const normalized = editValue.startsWith("#") ? editValue : `#${editValue}`;
    setEditing(false);
    if (HEX_COLOR_PATTERN.test(normalized)) {
      onChange(normalized.toLowerCase());
      return;
    }
    setEditValue(value.toUpperCase());
  }, [editValue, onChange, value]);

  const openPicker = () => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      nativeInputRef.current?.click();
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    setPosition(null);
    setOpen(true);
  };

  const picker = open ? createPortal(
    <div
      ref={panelRef}
      id={panelId}
      className="cpick-panel studio-color-panel"
      role="dialog"
      aria-label={`${label} color picker`}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden"
      }}
    >
      <div
        ref={saturationRef}
        className="cpick-canvas studio-color-saturation"
        role="application"
        tabIndex={0}
        aria-label={`${label} saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%. Use arrow keys to adjust.`}
        style={{ "--picker-hue": Math.round(hsv.h * 360) }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSaturation(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSaturation(event);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.05 : 0.01;
          let nextHsv = null;
          if (event.key === "ArrowLeft") nextHsv = { ...hsv, s: clampValue(hsv.s - step, 0, 1) };
          else if (event.key === "ArrowRight") nextHsv = { ...hsv, s: clampValue(hsv.s + step, 0, 1) };
          else if (event.key === "ArrowDown") nextHsv = { ...hsv, v: clampValue(hsv.v - step, 0, 1) };
          else if (event.key === "ArrowUp") nextHsv = { ...hsv, v: clampValue(hsv.v + step, 0, 1) };
          if (!nextHsv) return;
          event.preventDefault();
          commitHsv(nextHsv);
        }}
      >
        <span
          className="cpick-thumb"
          aria-hidden="true"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div className="cpick-hue-row">
        <input
          className="cpick-hue"
          type="range"
          min="0"
          max="360"
          step="1"
          value={Math.round(hsv.h * 360)}
          aria-label={`${label} hue`}
          onChange={(event) => commitHsv({ ...hsv, h: Number(event.target.value) / 360 })}
        />
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="dialkit-color-control">
      <span className="dialkit-color-label">{label}</span>
      <div className="dialkit-color-inputs">
        {editing ? (
          <input
            className="dialkit-color-hex-input"
            type="text"
            name={`${label.toLowerCase()}-color`}
            value={editValue}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            aria-label={`${label} color hex value`}
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={submitHex}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitHex();
              else if (event.key === "Escape") {
                setEditing(false);
                setEditValue(value.toUpperCase());
              }
            }}
            autoFocus
          />
        ) : (
          <button
            className="dialkit-color-hex studio-color-hex-button"
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label.toLowerCase()} color hex value`}
          >
            {value.toUpperCase()}
          </button>
        )}
        <button
          ref={swatchRef}
          className="dialkit-color-swatch"
          type="button"
          style={{ backgroundColor: value }}
          onClick={openPicker}
          aria-label={`Open ${label.toLowerCase()} color picker`}
          aria-expanded={open}
          aria-controls={panelId}
        />
        <input
          ref={nativeInputRef}
          className="dialkit-color-picker-native"
          type="color"
          value={value}
          aria-label={`${label} color`}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {picker}
    </div>
  );
}

function SourceControls({ state }) {
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState("");

  const uploadButtons = [{
    label: "Upload image",
    onClick: () => window.halftoneStudio.uploadImage()
  }];

  const selectPreset = useCallback((name) => {
    setNaming(false);
    setError("");
    window.halftoneStudio.selectPreset(name);
  }, []);

  const openNamer = useCallback(() => {
    setPresetName(state.isCustomPreset ? state.selectedPreset : "");
    setError("");
    setNaming(true);
  }, [state.isCustomPreset, state.selectedPreset]);

  const savePreset = useCallback(() => {
    const result = window.halftoneStudio.savePreset(presetName);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNaming(false);
    setError("");
  }, [presetName]);

  const deletePreset = useCallback(() => {
    setNaming(false);
    setError("");
    window.halftoneStudio.deletePreset();
  }, []);

  const revertPreset = useCallback(() => {
    setNaming(false);
    setError("");
    window.halftoneStudio.revertPreset();
  }, []);

  return (
    <>
      <ButtonGroup buttons={uploadButtons} />
      {state.uploadError ? (
        <div className="dialkit-upload-error" role="alert" aria-live="assertive" aria-atomic="true">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2.75 18 17H2L10 2.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 7.25v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="14.25" r=".9" fill="currentColor" />
          </svg>
          <div>
            <strong>Image not uploaded</strong>
            <p>{state.uploadError}</p>
          </div>
        </div>
      ) : null}
      <SelectControl
        label={state.presetModified ? "Preset · Edited" : "Preset"}
        value={state.selectedPreset}
        options={state.presets}
        onChange={selectPreset}
      />
      {naming ? (
        <div className="dialkit-preset-namer">
          <TextControl
            label="Name"
            value={presetName}
            onChange={(value) => {
              setPresetName(value);
              setError("");
            }}
            placeholder="Preset name"
          />
          {error ? <p className="dialkit-inline-error" role="alert">{error}</p> : null}
          <div className="dialkit-preset-actions">
            <button className="dialkit-button dialkit-button-primary" type="button" onClick={savePreset}>Save</button>
            <button className="dialkit-button" type="button" onClick={() => setNaming(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="dialkit-preset-actions">
          <button
            className={`dialkit-button${state.presetModified ? " dialkit-button-primary" : ""}`}
            type="button"
            disabled={!state.presetModified}
            onClick={openNamer}
          >
            {state.isCustomPreset && state.presetModified ? "Update preset" : "Save preset"}
          </button>
          {state.presetModified ? (
            <button className="dialkit-button" type="button" onClick={revertPreset}>Revert</button>
          ) : null}
          {state.isCustomPreset ? (
            <button className="dialkit-button dialkit-button-danger" type="button" onClick={deletePreset}>Delete</button>
          ) : null}
        </div>
      )}
    </>
  );
}

function DialPanel() {
  const state = useStudioState();
  const compact = useCompactLayout();

  if (!state) {
    return <div className="dial-panel-loading">Loading controls…</div>;
  }

  const settings = state.settings;

  return (
    <div className="dialkit-root halftone-dialkit" data-mode="inline" data-theme={state.theme}>
      <div className="dialkit-panel" data-mode="inline">
        <Folder title="Halftone Studio" isRoot inline>
          <Folder title="Source" defaultOpen>
            <SourceControls state={state} />
          </Folder>

          <Folder title="Layout" defaultOpen>
            <SettingSlider settingKey="cellSize" label="Cell size" value={settings.cellSize} min={3} max={20} step={1} unit="px" />
            <SettingSlider settingKey="screenAngle" label="Screen angle" value={settings.screenAngle} min={-75} max={75} step={1} unit="°" />
          </Folder>

          <Folder title="Tone" defaultOpen>
            <SettingSelect
              settingKey="quality"
              label="Render profile"
              value={settings.quality}
              options={RENDER_PROFILE_OPTIONS}
            />
            <SettingSlider settingKey="contrast" label="Contrast" value={settings.contrast} min={0.5} max={2.5} step={0.05} />
            <Folder key={compact ? "advanced-mobile" : "advanced-desktop"} title="Advanced" defaultOpen={!compact}>
              <SettingSlider settingKey="gamma" label="Gamma" value={settings.gamma} min={0.4} max={2.4} step={0.01} />
              <SettingSlider settingKey="toneCurve" label="Tone curve" value={settings.toneCurve} min={0.45} max={2.2} step={0.01} />
              <SettingSlider settingKey="minDot" label="Minimum dot" value={settings.minDot} min={0} max={60} step={1} unit="%" />
              <SettingSlider settingKey="grainStrength" label="Grain" value={settings.grainStrength} min={0} max={100} step={1} unit="%" />
              <SettingSlider settingKey="bloomStrength" label="Bloom" value={settings.bloomStrength} min={0} max={100} step={1} unit="%" />
              <SettingSlider settingKey="crtStrength" label="CRT" value={settings.crtStrength} min={0} max={100} step={1} unit="%" />
            </Folder>
          </Folder>

          <Folder title="Colors" defaultOpen>
            <SettingColor settingKey="inkColor" label="Ink" value={settings.inkColor} />
            <SettingColor settingKey="paperColor" label="Paper" value={settings.paperColor} />
          </Folder>
        </Folder>
      </div>
    </div>
  );
}

function ExportControls() {
  const state = useStudioState();

  const setFormat = useCallback((format) => {
    window.halftoneStudio.setExportFormat(format);
  }, []);

  if (!state) return null;

  const format = getExportFormat(state.export.format);

  return (
    <div className="dialkit-root halftone-dialkit export-dialkit" data-mode="inline" data-theme={state.theme}>
      <div className="export-controls" aria-label="Export settings">
        <div className="export-format-grid" role="radiogroup" aria-label="Export format">
          {EXPORT_FORMAT_OPTIONS.map((option) => {
            const selected = option.value === format.value;
            return (
              <button
                key={option.value}
                className="export-format-option"
                type="button"
                role="radio"
                aria-checked={selected}
                data-selected={selected}
                disabled={state.export.exporting}
                onClick={() => setFormat(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("dialPanelRoot")).render(<DialPanel />);

const exportControlsRoot = document.getElementById("exportControlsRoot");
if (exportControlsRoot) {
  createRoot(exportControlsRoot).render(<ExportControls />);
}
