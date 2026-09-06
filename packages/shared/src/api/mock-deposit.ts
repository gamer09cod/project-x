import type { Cents } from "../money";
import type { Uuid } from "../ids";
import type { MutationAuth } from "./errors";

export const MOCK_DEPOSIT = "mockDeposit" as const;

/** Tester-only ADMIN_CREDIT. Phase 10 may add an allowlist; Phase 4 accepts any active authed user. */
export type MockDepositRequest = {
  cents: Cents;
  idempotencyKey: Uuid;
};

export type MockDepositResponse = {
  userId: Uuid;
  creditedCents: Cents;
  balanceCents: Cents;
  ledgerId: Uuid;
};

export const mockDepositAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;

/** Soft cap for tester credits ($500). */
export const MOCK_DEPOSIT_MAX_CENTS = 50_000;
