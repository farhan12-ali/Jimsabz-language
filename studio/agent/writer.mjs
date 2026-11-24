function pause(milliseconds, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// Reveal checked source one complete line at a time, preserving every byte.
export async function writeCodeLines(code, { onLine, signal, delayMs = 240 }) {
  const lines = code.match(/[^\n]*\n|[^\n]+$/g) || [];
  let text = "";
  for (let index = 0; index < lines.length; index++) {
    signal?.throwIfAborted();
    text += lines[index];
    await onLine({ text, line: index + 1, total: lines.length });
    if (index + 1 < lines.length) await pause(delayMs, signal);
  }
  return { text, lines: lines.length };
}
