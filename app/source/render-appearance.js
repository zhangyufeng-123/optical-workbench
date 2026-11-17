const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function editorCaptureBackground(presentation = {}) {
  if (presentation?.stage === 'studio') return '#ffffff';
  return validHex(presentation?.appearance?.background) ? presentation.appearance.background : '#ffffff';
}

export function publicationAppearance(look, options = {}, presentation = {}) {
  const colors = options.useSceneColors === false ? {} : presentation?.appearance || {};
  return {
    ...look,
    background: validHex(colors.background) ? parseInt(colors.background.slice(1), 16) : look.background,
    surface: validHex(colors.table) ? parseInt(colors.table.slice(1), 16) : look.surface,
    tableColor: validHex(colors.table) ? colors.table : null
  };
}

export function isDarkColor(value) {
  if (!validHex(value)) return false;
  const components = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * components[0] + .7152 * components[1] + .0722 * components[2] < .3;
}

export function annotationAppearance(background, table, tableColor) {
  const surface = table === 'board' || table === 'surface' ? tableColor : background;
  const darkSurface = isDarkColor(surface || background), darkBackground = isDarkColor(background);
  // Labels can land on either surface: mixed light/dark scenes use dark ink
  // with a white halo so the same label remains readable on both regions.
  const lightInk = darkSurface && darkBackground;
  return {color: lightInk ? '#edf3f8' : '#1e2c35', halo: !lightInk && (darkSurface || darkBackground)};
}
