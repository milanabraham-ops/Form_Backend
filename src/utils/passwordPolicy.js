// Enforced specifically on the forced first-login change (the only place a user picks their
// own password now that admin-created accounts all start on the same shared default) — strong
// enough that swapping the default for another easy-to-guess password isn't a real option.
const MIN_LENGTH = 8

function validatePassword(password) {
  if (!password || password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must include a number'
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must include a special character'
  return null
}

module.exports = { validatePassword }
