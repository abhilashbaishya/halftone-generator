import { mountSelectControl } from 'dialkit/vanilla';
import { mountPresetMenuMotion } from './preset-menu-motion.js';
import { PHONE_LAYOUT } from './mobile-layout.js';

const samples = {
  red: { description: 'Crisp, balanced poster', image: new URL('./preset-previews/red.png', import.meta.url).href },
  orange: { description: 'Warm, textured print', image: new URL('./preset-previews/orange.png', import.meta.url).href },
  neon: { description: 'Neon negative with glow', image: new URL('./preset-previews/neon.png', import.meta.url).href },
  blue: { description: 'Fine, precise grid', image: new URL('./preset-previews/blue.png', import.meta.url).href },
  fine: { description: 'Soft photographic detail', image: new URL('./preset-previews/fine.png', import.meta.url).href }
};

// Keep DialKit's selection, positioning and keyboard behavior. Only decorate
// the option contents; style samples are static and never compete with rendering.
export function mountPresetSelect(host, initial) {
  let props = initial;
  const phone = window.matchMedia(PHONE_LAYOUT);
  const control = mountSelectControl(host, props);
  const trigger = host.querySelector('.dialkit-select-trigger');
  trigger.classList.add('studio-preset-trigger');
  const motion = mountPresetMenuMotion(host, trigger);
  const decorate = () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') return;
    const popup = host.closest('.dialkit-root')?.querySelector('.dialkit-select-dropdown:not(.studio-preset-menu-exit)');
    if (!popup) return;
    popup.classList.add('studio-preset-menu');
    popup.classList.toggle('studio-phone-sheet', phone.matches);
    popup.querySelectorAll('.dialkit-select-option').forEach((button, index) => {
      if (button.classList.contains('studio-preset-option')) return;
      const option = props.options[index];
      const sample = samples[option.value];
      const text = document.createElement('span');
      text.className = 'studio-preset-text';
      const name = document.createElement('span');
      name.className = 'studio-preset-name';
      name.textContent = option.label;
      const description = document.createElement('span');
      description.className = 'studio-preset-description';
      description.textContent = sample?.description ?? 'Your saved preset';
      text.append(name, description);
      button.classList.add('studio-preset-option');
      button.replaceChildren(text);
      if (sample) {
        const image = document.createElement('img');
        image.className = 'studio-preset-sample';
        image.src = sample.image;
        image.alt = '';
        image.width = image.height = 44;
        image.draggable = false;
        button.prepend(image);
      }
    });
    motion.open(popup);
  };
  trigger.addEventListener('click', decorate);
  trigger.addEventListener('keydown', decorate);
  return {
    update(next) { props = next; control.update(next); decorate(); },
    destroy() {
      motion.destroy();
      trigger.removeEventListener('click', decorate);
      trigger.removeEventListener('keydown', decorate);
      control.destroy();
    }
  };
}
