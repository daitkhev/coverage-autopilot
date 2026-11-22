import type { VerifyPatchRequest } from '#verification/application/contracts/verification-public-api';

/** Apply a patch to a clean clone of its commit and run the seven checks. */
export type VerifyPatchCommand = VerifyPatchRequest;
