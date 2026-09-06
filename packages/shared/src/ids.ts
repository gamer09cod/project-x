export type Uuid = string & { readonly __brand: "uuid" };
export type IsoTimestamp = string & { readonly __brand: "iso-timestamp" };
export type GameId = "basketball_v1";

export const GAME_ID_BASKETBALL_V1 = "basketball_v1" satisfies GameId;
