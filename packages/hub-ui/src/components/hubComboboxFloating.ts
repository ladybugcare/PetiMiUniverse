export type ComboboxFloatingRect = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

const VIEW_MARGIN = 8;
const GAP = 4;
const MAX_PANEL = 360;
const MIN_COMFORTABLE = 180;

/**
 * Posiciona o painel do combobox na viewport: abre para baixo quando cabe;
 * senão abre para cima. Nunca força uma altura maior que o espaço disponível.
 */
export function computeComboboxFloating(trigger: DOMRect): ComboboxFloatingRect {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;
  const vw = vv?.width ?? window.innerWidth;
  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;

  const width = Math.max(trigger.width, 200);
  let left = trigger.left;
  const rightBound = offsetLeft + vw - VIEW_MARGIN;
  if (left + width > rightBound) {
    left = Math.max(offsetLeft + VIEW_MARGIN, rightBound - width);
  }
  if (left < offsetLeft + VIEW_MARGIN) left = offsetLeft + VIEW_MARGIN;

  const spaceBelow = offsetTop + vh - trigger.bottom - VIEW_MARGIN;
  const spaceAbove = trigger.top - offsetTop - VIEW_MARGIN;
  const openDown = spaceBelow >= MIN_COMFORTABLE || spaceBelow >= spaceAbove;

  if (openDown) {
    return {
      top: trigger.bottom + GAP,
      left,
      width,
      maxHeight: Math.max(0, Math.min(MAX_PANEL, spaceBelow)),
    };
  }

  return {
    bottom: offsetTop + vh - trigger.top + GAP,
    left,
    width,
    maxHeight: Math.max(0, Math.min(MAX_PANEL, spaceAbove)),
  };
}
