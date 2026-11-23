import type { BrowserOpening } from '#api/browser';
import type { ServiceApi } from '#api/service-api';

/** What every screen and every command is given. */
export interface ClientSession {
  readonly api: ServiceApi;
  /** The moment now, read again on every call. */
  readonly now: () => string;
  /** The time zone of the user, such as `Europe/Prague`. */
  readonly timeZone: string;
  /**
   * Shows a page in the browser of the person. A session without it shows
   * no page, and no screen offers a key that would.
   */
  readonly openInBrowser?: (address: string) => Promise<BrowserOpening>;
}
