export function getCssVariable(
  variable: string,
  defaultValue: string,
  parent?: Element
): string {
  if (typeof window === "undefined") return defaultValue;
  const style = getComputedStyle(parent ?? document.documentElement);
  const value = style.getPropertyValue(variable).trim();
  return value || defaultValue;
}
