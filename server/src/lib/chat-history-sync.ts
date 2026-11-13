export interface HistorySyncProgress {
  errorId?: string
  phase: 'saving' | 'waiting' | 'complete' | 'error'
  messages: number
  contacts: number
  conversations: number
}

/** Serializes history batches independently of the browser's connection. */
export class ChatHistorySync {
  private queue: Promise<void> = Promise.resolve()
  private pending = 0
  private failed = false
  private complete = false
  private completionNotified = false
  progress: HistorySyncProgress | undefined

  private readonly publish: () => void
  private readonly onComplete?: () => Promise<void>

  constructor(publish: () => void, onComplete?: () => Promise<void>) {
    this.publish = publish
    this.onComplete = onComplete
  }

  get status(): 'idle' | 'syncing' | 'error' {
    if (this.failed) return 'error'
    return this.progress && this.progress.phase !== 'complete' ? 'syncing' : 'idle'
  }

  enqueue(work: () => Promise<void>, complete: boolean): Promise<void> {
    this.pending++
    this.progress ??= {
      phase: 'saving',
      messages: 0,
      contacts: 0,
      conversations: 0,
    }
    this.progress.phase = 'saving'
    this.publish()
    const task = this.queue.then(async () => {
      try {
        await work()
        this.complete ||= complete
      } catch (error) {
        this.markFailed()
        throw error
      } finally {
        this.pending--
        if (this.progress)
          this.progress.phase = this.pending
            ? 'saving'
            : this.failed
              ? 'error'
              : this.complete
                ? 'complete'
                : 'waiting'
        this.publish()
        if (!this.pending && this.complete && !this.failed && !this.completionNotified) {
          this.completionNotified = true
          await this.onComplete?.()
        }
      }
    })
    // Keep the queue alive; each task's caller must handle its rejection.
    this.queue = task.catch(() => {})
    return task
  }

  markFailed() {
    this.failed = true
    this.progress ??= { phase: 'error', messages: 0, contacts: 0, conversations: 0 }
    this.progress.errorId = crypto.randomUUID()
    this.publish()
  }

  acknowledgeError(errorId: string) {
    if (!this.failed || this.progress?.errorId !== errorId) return
    this.failed = false
    delete this.progress.errorId
    if (this.pending) this.progress.phase = 'saving'
    else this.progress = undefined
    this.publish()
  }

  advance(kind: 'messages' | 'contacts' | 'conversations', count = 1) {
    if (!this.progress) return
    this.progress[kind] += count
    if (kind !== 'messages' || this.progress.messages % 50 === 0) this.publish()
  }
}
