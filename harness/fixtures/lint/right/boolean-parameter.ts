export interface RenderOptions {
  readonly bold: boolean;
}

export function render(text: string, options: RenderOptions): string {
  return options.bold ? text.toUpperCase() : text;
}
