import { reqOf } from "./req";

export type ProviderKeyInfo = {
  key: string;
};

let cachedKey: string | undefined;
let cachedAt = 0;
let pending: Promise<string> | null = null;

const CACHE_TTL_MS = 10 * 60 * 1000;

export const getGrsProviderKey = async (forceRefresh?: boolean): Promise<string> => {
  const now = Date.now();
  if (!forceRefresh && cachedKey && now - cachedAt < CACHE_TTL_MS) return cachedKey;
  if (pending) return pending;

  pending = (async () => {
    const res = await reqOf("provider").get<ProviderKeyInfo>("/app/grs");
    const key = (res?.key || "").trim();
    if (!key) throw new Error("Provider Key 为空");
    cachedKey = key;
    cachedAt = Date.now();
    return key;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
};
