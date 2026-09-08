import type { Cents } from "../money";
import type { Uuid } from "../ids";
import type { UserStatus } from "../domain";
import type { MutationAuth } from "./errors";

export const ENSURE_PROFILE = "ensureProfile" as const;

export type EnsureProfileRequest = {
  /** Optional display name; server keeps existing if omitted. */
  displayName?: string | null;
};

export type EnsureProfileResponse = {
  userId: Uuid;
  firebaseUid: string;
  /** Server-assigned gamer tag when the client/token omit a name. */
  displayName: string | null;
  status: UserStatus;
  rating: number;
  /** Includes $10 welcome ADMIN_CREDIT on first provision. */
  walletBalanceCents: Cents;
};

/** Auth required. App Check required on money paths from Phase 9; profile upsert is Phase 4. */
export const ensureProfileAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;
