export { b } from '../b';

export async function load(): Promise<unknown> {
  return import('../b');
}
