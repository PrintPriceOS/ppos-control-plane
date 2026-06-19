'use strict';

function redactDatabaseUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = 'REDACTED_PASSWORD_PLACEHOLDER';
    }
    return parsed.toString().replace('REDACTED_PASSWORD_PLACEHOLDER', '[REDACTED]');
  } catch (err) {
    return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1[REDACTED]$3');
  }
}

function redactEnvValue(value) {
  if (!value) return '';
  return '[REDACTED]';
}

function assertNoSecretLeak(output) {
  if (!output) return;
  const rawUrl = process.env.DATABASE_URL;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.password && output.includes(parsed.password)) {
        throw new Error("SECRET LEAK DETECTED: Output contains database password!");
      }
    } catch (_e) {
      // Regex password extraction fallback
      const match = rawUrl.match(/:\/\/[^:]+:([^@]+)@/);
      const password = match && match[1];
      if (password && output.includes(password)) {
        throw new Error("SECRET LEAK DETECTED: Output contains database password!");
      }
    }
  }

  const jwt = process.env.JWT_SECRET;
  if (jwt && output.includes(jwt)) {
    throw new Error("SECRET LEAK DETECTED: Output contains raw JWT_SECRET!");
  }
}

module.exports = {
  redactDatabaseUrl,
  redactEnvValue,
  assertNoSecretLeak,
};
