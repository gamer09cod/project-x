/**
 * Integer cents only. $1.25 = 125.
 * Fractional payouts are floored in Firebase Functions BEFORE any ledger write.
 * Never use number arithmetic that can produce IEEE floats for money — convert
 * to integer cents first, then floor.
 */
export type Cents = number & { readonly __brand: "cents" };

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new Error("money must be integer cents");
  }
}
