export interface DemoHighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

export interface DemoTooltipPlacement {
  top: number;
  left: number;
  width: number;
}

const VIEWPORT_MARGIN = 16;
const TOOLTIP_GAP = 12;
const DEFAULT_TOOLTIP_WIDTH = 300;

function isInteractiveLeaf(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    el instanceof HTMLSelectElement
  );
}

/** Prefer the actual control over a large wrapper (e.g. form). */
export function resolveDemoHighlightElement(el: Element): Element {
  if (isInteractiveLeaf(el)) return el;

  const marked = el.querySelector("[data-setup-demo-highlight]");
  if (marked) return marked;

  const interactiveChildren = Array.from(
    el.querySelectorAll("input, textarea, button, a[href], select")
  );
  if (interactiveChildren.length === 1) {
    return interactiveChildren[0]!;
  }

  return el;
}

function highlightPadding(el: Element): number {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return 3;
  }
  if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) {
    return 4;
  }
  return 5;
}

function readCornerRadius(el: Element): number {
  const style = window.getComputedStyle(el);
  const values = style.borderRadius
    .split(" ")
    .map((part) => parseFloat(part))
    .filter((n) => Number.isFinite(n) && n > 0);
  const base = values.length > 0 ? Math.max(...values) : 6;
  return Math.min(base + 1, 12);
}

export function measureDemoHighlight(el: Element): DemoHighlightRect | null {
  const target = resolveDemoHighlightElement(el);
  const box = target.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;

  const pad = highlightPadding(target);
  return {
    top: box.top - pad,
    left: box.left - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
    radius: readCornerRadius(target),
  };
}

function rectsOverlap(
  a: { top: number; left: number; width: number; height: number },
  b: { top: number; left: number; width: number; height: number }
): boolean {
  return !(
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  );
}

export function placeDemoTooltip(
  highlight: DemoHighlightRect,
  tooltipHeight: number,
  tooltipWidth = DEFAULT_TOOLTIP_WIDTH
): DemoTooltipPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(tooltipWidth, vw - VIEWPORT_MARGIN * 2);

  const target = {
    top: highlight.top,
    left: highlight.left,
    width: highlight.width,
    height: highlight.height,
  };

  const spaceBelow = vh - (target.top + target.height) - VIEWPORT_MARGIN;
  const spaceAbove = target.top - VIEWPORT_MARGIN;
  const preferBelow = spaceBelow >= spaceAbove;

  const candidates: Array<{ top: number; left: number }> = [];

  if (preferBelow) {
    candidates.push({
      top: target.top + target.height + TOOLTIP_GAP,
      left: target.left,
    });
    candidates.push({
      top: target.top - tooltipHeight - TOOLTIP_GAP,
      left: target.left,
    });
  } else {
    candidates.push({
      top: target.top - tooltipHeight - TOOLTIP_GAP,
      left: target.left,
    });
    candidates.push({
      top: target.top + target.height + TOOLTIP_GAP,
      left: target.left,
    });
  }

  candidates.push({
    top: Math.min(
      Math.max(VIEWPORT_MARGIN, target.top + target.height + TOOLTIP_GAP),
      vh - tooltipHeight - VIEWPORT_MARGIN
    ),
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(target.left, vw - width - VIEWPORT_MARGIN)
    ),
  });

  for (const candidate of candidates) {
    const clampedTop = Math.max(
      VIEWPORT_MARGIN,
      Math.min(candidate.top, vh - tooltipHeight - VIEWPORT_MARGIN)
    );
    const clampedLeft = Math.max(
      VIEWPORT_MARGIN,
      Math.min(candidate.left, vw - width - VIEWPORT_MARGIN)
    );
    const tooltip = {
      top: clampedTop,
      left: clampedLeft,
      width,
      height: tooltipHeight,
    };
    if (!rectsOverlap(target, tooltip)) {
      return { top: clampedTop, left: clampedLeft, width };
    }
  }

  const fallbackTop = Math.max(
    VIEWPORT_MARGIN,
    Math.min(target.top + target.height + TOOLTIP_GAP, vh - tooltipHeight - VIEWPORT_MARGIN)
  );
  const fallbackLeft = Math.max(
    VIEWPORT_MARGIN,
    Math.min(target.left, vw - width - VIEWPORT_MARGIN)
  );

  return { top: fallbackTop, left: fallbackLeft, width };
}

export function highlightRectsEqual(
  a: DemoHighlightRect | null,
  b: DemoHighlightRect | null
): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    Math.abs(a.radius - b.radius) < 0.5
  );
}
