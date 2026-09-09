import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';

test('production CSS retains standard preset blur and its reduced-transparency override', async () => {
  // Source CSS worked in development; minification dropped the unprefixed
  // declaration when the WebKit alias came last. Check the actual build output.
  const result = await build({ logLevel: 'silent', build: { write: false } });
  const css = [result].flat().flatMap((bundle) => bundle.output)
    .filter((asset) => asset.type === 'asset' && asset.fileName.endsWith('.css'))
    .map((asset) => String(asset.source)).join('\n');
  const glass = css.match(/[^{}]*studio-preset-menu[^{}]*\{[^{}]*--preset-glass:[^{}]*blur\(16px\)[^{}]*\}/)?.[0];
  assert.ok(glass, 'Built preset glass rule exists');
  assert.match(glass, /[;{]backdrop-filter:blur\(16px\)/);
  assert.match(glass, /[;{]-webkit-backdrop-filter:blur\(16px\)/);
  const reduced = css.match(/@media\s*\(prefers-reduced-transparency:\s*reduce\)\{([^}]*studio-preset-menu[^}]*\})/)?.[1];
  assert.ok(reduced, 'Reduced-transparency rule exists');
  assert.match(reduced, /[;{]backdrop-filter:none[;}]/);
  assert.match(css, /studio-folder\[data-phone-flat=true\]/);
  assert.match(css, /studio-phone-sheet/);
  assert.match(css, /max-height:calc\(44dvh/);
  assert.match(css, /transform-origin:bottom!important|transform-origin:50% 100%!important/);
});
