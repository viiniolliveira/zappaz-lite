export function validateChatTestDatabaseUrl(value: string): string {
  const url = new URL(value)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/chat_validation' ||
    [...url.searchParams.keys()].some((key) => ['host', 'hostaddr', 'database', 'dbname'].includes(key.toLowerCase()))
  ) {
    throw new Error('CHAT_TEST_DATABASE_URL must select the local chat_validation database')
  }
  return value
}
