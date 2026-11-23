export async function size(read: () => Promise<string>): Promise<number> {
  return read().then((text) => text.length);
}
