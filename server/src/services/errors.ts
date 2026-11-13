export class SessionNotFoundError extends Error {
  constructor(message = 'Session not found') {
    super(message)
  }
}

export class InvalidSessionError extends Error {
  constructor(message = 'Invalid session') {
    super(message)
  }
}

export class InvalidMediaError extends Error {
  constructor(message = 'Invalid media message') {
    super(message)
  }
}

export class InvalidJidError extends Error {
  constructor(message = 'Invalid JID') {
    super(message)
  }
}

export class AccessDeniedError extends Error {
  constructor(message = 'Access denied') {
    super(message)
  }
}

export class InvalidLocationError extends Error {
  constructor(message = 'Invalid location') {
    super(message)
  }
}

export class EventNotFoundError extends Error {
  constructor(message = 'Event not found') {
    super(message)
  }
}

export type WaSessionError =
  | SessionNotFoundError
  | InvalidSessionError
  | InvalidMediaError
  | InvalidJidError
