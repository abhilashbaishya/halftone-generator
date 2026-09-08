import { createElement, ChevronDown, ChevronsLeftRight, CircleAlert, Moon, Sun, X } from 'lucide';

// Import only the icons used by the studio. DialKit owns its dropdown chevron.
const icons = {
  'chevron-down': ChevronDown,
  'chevrons-left-right': ChevronsLeftRight,
  'circle-alert': CircleAlert,
  moon: Moon,
  sun: Sun,
  x: X
};

export function createStudioIcon(name, attrs = {}) {
  if (!icons[name]) throw new Error(`Unknown studio icon: ${name}`);
  return createElement(icons[name], {
    ...attrs,
    class: `lucide lucide-${name} ${attrs.class ?? ''}`.trim(),
    'aria-hidden': 'true',
    focusable: 'false'
  });
}

export function mountStaticIcons(root = document) {
  root.querySelectorAll('[data-studio-icon]').forEach((placeholder) => {
    const attrs = Object.fromEntries(Array.from(placeholder.attributes, ({ name, value }) => [name, value]));
    placeholder.replaceWith(createStudioIcon(placeholder.dataset.studioIcon, attrs));
  });
}
