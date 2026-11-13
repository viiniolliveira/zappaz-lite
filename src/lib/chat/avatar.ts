const AVATAR_CACHE_MS = 60 * 60 * 1000

export function isAvatarExpired(checkedAt: string | null, now = Date.now()) {
  return checkedAt === null || now - Date.parse(checkedAt) >= AVATAR_CACHE_MS
}
