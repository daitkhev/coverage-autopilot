export async function size(read: () => Promise<string>): Promise<number> {
  const text = await read();
  return text.length;
}
