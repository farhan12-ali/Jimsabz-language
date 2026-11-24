// Applied before model requests, persistence, and tool dispatch.
const privateBlock = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g;
const token = /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g;
const assignment = /\b((?:[A-Za-z_]*_)?(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|PASSWORD|CLIENT_SECRET))\s*[:=]\s*(["'])([^"'\r\n]{4,})\2/gi;
export function redactSecrets(value) {
  return String(value).replace(privateBlock, '[PRIVATE KEY REDACTED]').replace(token, '[TOKEN REDACTED]')
    .replace(assignment, '$1 = "[SECRET REDACTED]"');
}
export function containsSecrets(value) { return redactSecrets(value) !== String(value); }
export function privatePath(path) {
  return /(?:^|\/)\.git(?:\/|$)/i.test(path) || /(?:^|\/)(?:\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519|secrets?(?:\..*)?)$/i.test(path)
    || /\.(?:pem|p12|pfx|key)$/i.test(path);
}
export function safeText(value, maximum = 60000) {
  const text = redactSecrets(value);
  return text.length > maximum ? text.slice(0, maximum) + '\n[Truncated]' : text;
}
export function textArgument(args, key, maximum = 256000, { empty = false } = {}) {
  if (!args || typeof args[key] !== 'string' || (!empty && !args[key].trim()) || args[key].length > maximum)
    throw new Error(`${key} must be ${empty ? 'text' : 'nonempty text'} of at most ${maximum} characters.`);
  return args[key];
}
