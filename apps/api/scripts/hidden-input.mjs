import { TextDecoder } from 'node:util';

export function readHiddenPassword(input = process.stdin, output = process.stdout, prompt = 'Type CONVERT to prepare separate Vercel files (hidden; Ctrl+C cancels): ', options = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') return Promise.reject(new Error('Owner input requires an interactive TTY; no argv, environment or pipe password input.'));
  const { maxBytes = 16384, maxCharacters = 4096, signal } = options;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536
    || !Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 65536 || signal?.aborted) {
    return Promise.reject(new Error('Owner input bounds or cancellation state are invalid.'));
  }
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    const wasFlowing = input.readableFlowing === true;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let value = '';
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      input.removeListener('data', data);
      input.removeListener('end', cancel);
      input.removeListener('error', cancel);
      for (const signalName of ['SIGINT', 'SIGTERM', 'SIGTSTP', 'SIGHUP']) process.removeListener(signalName, cancel);
      signal?.removeEventListener('abort', cancel);
      try { input.setRawMode(Boolean(wasRaw)); } catch { error = new Error('Terminal restoration failed.'); }
      if (!wasFlowing) input.pause();
      try { output.write('\n'); } catch { error = new Error('Terminal output failed; input mode restored.'); }
      const password = value;
      value = '';
      if (error) reject(error); else resolve(password);
    };
    const cancel = () => finish(new Error('Owner input cancelled; no private files written.'));
    const data = chunk => {
      let text;
      try { text = decoder.decode(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), { stream: true }); }
      catch { cancel(); return; }
      for (const character of text) {
        if (character === '\r' || character === '\n') { finish(); return; }
        if (['\u0000', '\u0003', '\u0004', '\u001a', '\u001b'].includes(character)) { cancel(); return; }
        if (character === '\u007f' || character === '\b') {
          const characters = Array.from(value), removed = characters.pop();
          if (removed) bytes -= Buffer.byteLength(removed);
          value = characters.join('');
        } else if (character === '\u0015') { value = ''; bytes = 0; }
        else { value += character; bytes += Buffer.byteLength(character); }
        if (value.length > maxCharacters || bytes > maxBytes) { cancel(); return; }
      }
    };
    const timer = setTimeout(cancel, 300000);
    try {
      input.setRawMode(true);
      input.on('data', data);
      input.once('end', cancel);
      input.once('error', cancel);
      for (const signalName of ['SIGINT', 'SIGTERM', 'SIGTSTP', 'SIGHUP']) process.once(signalName, cancel);
      signal?.addEventListener('abort', cancel, { once: true });
      output.write(prompt);
      input.resume();
    } catch { cancel(); }
  });
}
