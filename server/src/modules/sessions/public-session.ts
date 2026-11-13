import type { WaConfig, WaSession } from '@generated/prisma'

/** Explicit allowlist: new database fields are private until intentionally exposed. */
export function publicSession(
  session: Omit<WaSession, 'status'> & {
    status: string | null | undefined
    config: WaConfig | null
  },
) {
  return {
    id: session.id,
    status: session.status ?? null,
    disconnectedAt: session.disconnectedAt,
    connectedAt: session.connectedAt,
    jid: session.jid,
    enabled: session.enabled,
    userId: session.userId,
    profilePictureUrl: session.profilePictureUrl,
    displayName: session.displayName,
    archived: session.archived,
    config: session.config
      ? {
          syncFullHistory: session.config.syncFullHistory,
          markOnlineOnConnect: session.config.markOnlineOnConnect,
          ignoreGroups: session.config.ignoreGroups,
          clientConnectionName: session.config.clientConnectionName,
          rejectCalls: session.config.rejectCalls,
          messageOnCall: session.config.messageOnCall,
          signatureEnabled: session.config.signatureEnabled,
          signatureName: session.config.signatureName,
        }
      : null,
  }
}
