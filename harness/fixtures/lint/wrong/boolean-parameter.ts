export function render(text: string, bold: boolean): string {
  return bold ? text.toUpperCase() : text;
}
