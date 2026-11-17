export const TABLE_OPTIONS = {
  board: '完整实验桌（孔阵列）',
  surface: '简洁台面',
  none: '不显示桌面'
};

export function resolveTable(options = {}, hasSurface = false) {
  if (options.table !== undefined) {
    if (!Object.hasOwn(TABLE_OPTIONS, options.table)) throw new Error('未知实验桌设置');
    return options.table;
  }
  // Retain the legacy capture API for existing callers and saved render settings.
  return options.hideBoard === false ? 'board' : hasSurface ? 'surface' : 'none';
}

export function editorTableVisible(presentation) {
  return presentation?.showTable !== false;
}

export const EDITOR_APPEARANCE_DEFAULTS = Object.freeze({
  background: '#e8ecef',
  floor: '#e8ecef'
});

const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** Resolve a view without mutating the saved palette or scene. */
export function resolveEditorAppearance(presentation = {}) {
  const studio = presentation?.stage === 'studio';
  const appearance = presentation?.appearance || {};
  const showTable = editorTableVisible(presentation);
  return {
    stage: studio ? 'studio' : 'bench',
    showTable,
    background: studio ? '#ffffff' : validColor(appearance.background) ? appearance.background : EDITOR_APPEARANCE_DEFAULTS.background,
    floor: studio ? '#ffffff' : validColor(appearance.floor) ? appearance.floor : EDITOR_APPEARANCE_DEFAULTS.floor,
    table: validColor(appearance.table) ? appearance.table : null,
    floorY: showTable ? -66 : -1
  };
}

export function editorStagePresentation(presentation = {}, stage = 'bench') {
  if (!['bench', 'studio'].includes(stage)) throw new Error('未知编辑视图');
  return {...presentation, stage, showTable: stage === 'bench'};
}

export function editorTablePresentation(presentation = {}, visible = true) {
  // Showing the table is an explicit return to the working view. In particular,
  // it cannot leave the user trapped in the white-preview tab.
  return {...presentation, stage: visible ? 'bench' : presentation?.stage || 'bench', showTable: !!visible};
}

export function resetEditorAppearance(presentation = {}) {
  const {appearance, ...rest} = presentation || {};
  // Keep view/camera choices, palette metadata and all unrelated project data.
  return {...rest, stage: 'bench', showTable: true};
}
