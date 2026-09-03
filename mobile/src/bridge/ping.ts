/** Phase 3 handshake. Gameplay scorePayload is Phase 6. */
export const UNITY_BRIDGE_HOST = 'BridgeHost';
export const UNITY_BRIDGE_METHOD = 'ReceiveFromRn';

export const PING_MESSAGE_VERSION = 1;

export type PingMessage = {
  v: typeof PING_MESSAGE_VERSION;
  type: 'ping';
  nonce: string;
};

export type PongMessage = {
  v: typeof PING_MESSAGE_VERSION;
  type: 'pong';
  nonce: string;
  unityBuildId: string;
};

export function makePing(nonce: string): PingMessage {
  return {v: PING_MESSAGE_VERSION, type: 'ping', nonce};
}

export function parsePong(raw: string): PongMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as {type?: unknown}).type !== 'pong' ||
      (parsed as {v?: unknown}).v !== PING_MESSAGE_VERSION
    ) {
      return null;
    }
    const nonce = (parsed as {nonce?: unknown}).nonce;
    const unityBuildId = (parsed as {unityBuildId?: unknown}).unityBuildId;
    if (typeof nonce !== 'string' || typeof unityBuildId !== 'string') {
      return null;
    }
    return {v: PING_MESSAGE_VERSION, type: 'pong', nonce, unityBuildId};
  } catch {
    return null;
  }
}
