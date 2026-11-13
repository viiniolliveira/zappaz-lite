import { createHash } from 'node:crypto'
import type { WAProto } from 'baileys'
import type { z } from 'zod'
import type { PollSchema, PollVoteSchema } from './chat-contract.ts'

export type Poll = z.infer<typeof PollSchema>
type PollVote = z.infer<typeof PollVoteSchema>

export function normalizePollVotes(
  updates: WAProto.IPollUpdate[],
  ownJid?: string | null,
): PollVote[] {
  return updates.flatMap((update) => {
    const key = update.pollUpdateMessageKey
    const voterId = key?.fromMe ? ownJid : (key?.participant ?? key?.remoteJid)
    if (!voterId || !update.vote) return []
    const milliseconds = Number(update.senderTimestampMs)
    const date = new Date(milliseconds)
    return [
      {
        voterId,
        fromMe: key?.fromMe ?? false,
        selectedOptions: (update.vote.selectedOptions ?? []).map((option) =>
          Buffer.from(option).toString('base64'),
        ),
        timestamp:
          Number.isFinite(milliseconds) && milliseconds > 0 && !Number.isNaN(date.getTime())
            ? date.toISOString()
            : null,
      },
    ]
  })
}

/** One current vote per author, including empty selections (vote removals). */
export function applyPollVotes(poll: Poll, updates: PollVote[]): Poll {
  const votes = new Map(poll.votes.map((vote) => [vote.voterId, vote]))
  for (const vote of updates) {
    const previous = votes.get(vote.voterId)
    if (previous?.timestamp && (!vote.timestamp || previous.timestamp > vote.timestamp)) continue
    votes.set(vote.voterId, vote)
  }
  const currentVotes = [...votes.values()]
  return {
    ...poll,
    votes: currentVotes,
    options: poll.options.map((option) => ({
      ...option,
      votes: currentVotes.filter((vote) => vote.selectedOptions.includes(option.hash)).length,
    })),
  }
}

export function normalizePoll(content: WAProto.IMessage): Poll | null {
  const poll =
    content.pollCreationMessage ?? content.pollCreationMessageV2 ?? content.pollCreationMessageV3
  if (!poll) return null
  return {
    name: poll.name ?? '',
    selectableOptionsCount: poll.selectableOptionsCount ?? 0,
    options: (poll.options ?? []).map((option) => ({
      name: option.optionName ?? '',
      hash: createHash('sha256')
        .update(option.optionName ?? '')
        .digest('base64'),
      votes: 0,
    })),
    votes: [],
  }
}
