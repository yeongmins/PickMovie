const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.tabIndex !== -1 &&
      el.getAttribute("aria-hidden") !== "true",
  );
}

export function trapTabKey(
  event: KeyboardEvent,
  container: HTMLElement,
): boolean {
  if (event.key !== "Tab") return false;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (event.shiftKey) {
    if (!active || active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    return false;
  }

  if (!active || active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
