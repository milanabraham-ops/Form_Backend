const bcrypt = require('bcryptjs')
const { OAuth2Client } = require('google-auth-library')
const User = require('../models/User')
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt')
const { validatePassword } = require('../utils/passwordPolicy')
const { REFRESH_COOKIE_NAME, refreshCookieOptions, csrfCookieOptions } = require('../utils/cookies')
const { generateCsrfToken } = require('../middleware/csrf')

const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID)

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || '',
    role: user.role || 'poc',
    mustChangePassword: Boolean(user.mustChangePassword),
  }
}

// Starts (or renews) a session: sets the HttpOnly refresh cookie and a matching, JS-readable CSRF
// cookie (the frontend reads this straight out of document.cookie when it needs to echo it back
// as a header — no need to also carry it through the response body), and returns the short-lived
// access token + user payload. Every place a session actually begins or rotates (login, Google
// sign-in, refresh) goes through this so the cookie/token pairing can never drift out of sync.
// csrfToken used to be scoped to Path=/api/auth (a since-fixed bug — that made it invisible to
// document.cookie on the frontend's own pages). Browsers never overwrite a cookie set at a
// different Path, so anyone who logged in before the fix still has that stale copy sitting
// alongside the corrected one; browsers send the more specific path first, and the first one
// wins server-side, so the stale copy would otherwise keep beating the current one forever.
// Explicitly clearing the old path here self-heals every affected session on its next login.
function clearStaleCsrfCookie(res) {
  res.clearCookie('csrfToken', { path: '/api/auth' })
}

function issueSession(res, user) {
  res.cookie(REFRESH_COOKIE_NAME, signRefreshToken(user), refreshCookieOptions())
  clearStaleCsrfCookie(res)
  res.cookie('csrfToken', generateCsrfToken(), csrfCookieOptions())
  return { token: signAccessToken(user), user: toPublicUser(user) }
}

function clearSessionCookies(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions())
  res.clearCookie('csrfToken', csrfCookieOptions())
  clearStaleCsrfCookie(res)
}

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

    res.json(issueSession(res, user))
  } catch (err) {
    next(err)
  }
}

exports.google = async (req, res, next) => {
  try {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' })
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
      return res.status(500).json({ error: 'Google sign-in is not configured on the server' })
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) return res.status(401).json({ error: 'Invalid Google credential' })

    // Google sign-in never creates an account on its own — only an admin-added user (any
    // authProvider) can sign in this way, and only for the exact email an admin added.
    let user = await User.findOne({ googleId: payload.sub })
    if (!user) {
      user = await User.findOne({ email: payload.email.toLowerCase() })
      if (!user) return res.status(403).json({ error: 'No account found for this email. Ask an admin to add you first.' })
      user.googleId = payload.sub
      await user.save()
    }

    res.json(issueSession(res, user))
  } catch (err) {
    next(err)
  }
}

// Reads the HttpOnly refresh cookie, verifies it, and checks its embedded version against the
// user's current refreshTokenVersion. A mismatch means this exact token was already rotated away
// (or the session was ended via logout/password-change) — rejecting it here is what makes reusing
// an old refresh token fail instead of silently minting another valid session from it.
exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME]
    if (!token) return res.status(401).json({ error: 'No refresh token' })

    let payload
    try {
      payload = verifyRefreshToken(token)
    } catch {
      clearSessionCookies(res)
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    const user = await User.findById(payload.sub)
    if (!user || user.refreshTokenVersion !== payload.v) {
      clearSessionCookies(res)
      return res.status(401).json({ error: 'Session no longer valid' })
    }

    // Rotate — bump the version so the token just presented can never be used again, then issue
    // a fresh refresh token embedding the new version.
    user.refreshTokenVersion += 1
    await user.save()

    res.json(issueSession(res, user))
  } catch (err) {
    next(err)
  }
}

// Bumping refreshTokenVersion invalidates every outstanding refresh token for this user at once —
// simple and correct for this app's needs, at the cost of also ending any other active session
// for the same account (there's no per-device session tracking, just one shared counter).
exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME]
    if (token) {
      try {
        const payload = verifyRefreshToken(token)
        await User.findByIdAndUpdate(payload.sub, { $inc: { refreshTokenVersion: 1 } })
      } catch {
        // Already invalid/expired — nothing to invalidate, still clear cookies below.
      }
    }
    clearSessionCookies(res)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

// Only path off the forced mustChangePassword state — requires the current password too (not
// just a valid session token) so a compromised/left-open session can't silently take over the
// account by changing the password without knowing it.
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body

    const policyError = validatePassword(newPassword)
    if (policyError) return res.status(400).json({ error: policyError })

    const user = await User.findById(req.user._id)
    if (!user || !user.passwordHash) return res.status(400).json({ error: 'Password change is not available for this account' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })

    const reused = await bcrypt.compare(newPassword, user.passwordHash)
    if (reused) return res.status(400).json({ error: 'New password must be different from your current password' })

    user.passwordHash = await bcrypt.hash(newPassword, 10)
    user.mustChangePassword = false
    // A password change should end every other session on this account — the same mechanism
    // logout uses. The current tab gets a fresh session issued right below, in the same response.
    user.refreshTokenVersion += 1
    await user.save()

    res.json(issueSession(res, user))
  } catch (err) {
    next(err)
  }
}

exports.updateMe = async (req, res, next) => {
  try {
    const { avatarUrl } = req.body
    if (typeof avatarUrl !== 'string') return res.status(400).json({ error: 'avatarUrl must be a string' })
    const trimmed = avatarUrl.trim()
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      return res.status(400).json({ error: 'avatarUrl must be a valid http(s) URL' })
    }

    const user = await User.findByIdAndUpdate(req.user._id, { avatarUrl: trimmed }, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}
