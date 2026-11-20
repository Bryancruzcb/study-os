import { OFFLINE, SERVER_PROBLEM, SOMETHING_WENT_WRONG, failureMessage, messageOf } from './errors'

test('the server\'s own sentence wins over the status', () => {
  expect(failureMessage(400, 'Pick at least one concept.')).toBe('Pick at least one concept.')
})

test('a blank server sentence counts as none', () => {
  expect(failureMessage(400, '   ')).toBe("That request wasn't valid.")
})

test.each([
  [400, "That request wasn't valid."],
  [401, 'Your sign-in ended. Sign in again.'],
  [403, "You don't have access to that."],
  [404, "That isn't there any more. It may have been deleted."],
  [409, 'That changed while you were working. Reload and try again.'],
  [413, 'That file is too big to upload (the limit is 32 MB).'],
  [429, 'Too many requests. Wait a moment and try again.'],
])('a %i without a sentence reads "%s"', (status, sentence) => {
  expect(failureMessage(status)).toBe(sentence)
})

test('every server error reads the same, from the first 5xx to the last', () => {
  expect(failureMessage(500)).toBe(SERVER_PROBLEM)
  expect(failureMessage(502)).toBe(SERVER_PROBLEM)
  expect(failureMessage(599)).toBe(SERVER_PROBLEM)
})

test('a status with no sentence of its own falls back to a general one', () => {
  expect(failureMessage(418)).toBe(SOMETHING_WENT_WRONG)
})

test('the offline sentence names the connection', () => {
  expect(OFFLINE).toBe("Can't reach Study OS. Check your connection and try again.")
})

test('an Error shows its message without the "Error:" that String would put in front', () => {
  expect(messageOf(new Error(SERVER_PROBLEM))).toBe(SERVER_PROBLEM)
})

test('a thrown string shows as it is', () => {
  expect(messageOf('That username is taken.')).toBe('That username is taken.')
})

test('anything else, or an empty message, shows the general sentence', () => {
  expect(messageOf(undefined)).toBe(SOMETHING_WENT_WRONG)
  expect(messageOf({ status: 500 })).toBe(SOMETHING_WENT_WRONG)
  expect(messageOf(new Error(''))).toBe(SOMETHING_WENT_WRONG)
})
