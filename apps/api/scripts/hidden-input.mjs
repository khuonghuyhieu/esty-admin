import { StringDecoder } from 'node:string_decoder';

export function readHiddenPassword(input = process.stdin, output = process.stdout, prompt = 'Type CONVERT to prepare separate Vercel files (hidden; Ctrl+C cancels): ') {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') return Promise.reject(new Error('Owner input requires an interactive TTY; no argv, environment or pipe password input.'));
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    const wasFlowing = input.readableFlowing === true;
    const decoder = new StringDecoder('utf8');
    let value = '';
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      input.removeListener('data', data);
      input.removeListener('end', cancel);
      input.removeListener('error', cancel);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGTSTP']) process.removeListener(signal, cancel);
      try { input.setRawMode(Boolean(wasRaw)); } catch { error = new Error('Terminal restoration failed.'); }
      if (!wasFlowing) input.pause();
      try { output.write('\n'); } catch { error = new Error('Terminal output failed; input mode restored.'); }
      const password = value;
      value = '';
      if (error) reject(error); else resolve(password);
    };
    const cancel = () => finish(new Error('Owner input cancelled; no private files written.'));
    const data = chunk => {
      for (const character of decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))) {
        if (character === '\r' || character === '\n') { finish(); return; }
        if (['\u0003', '\u0004', '\u001a', '\u001b'].includes(character)) { cancel(); return; }
        if (character === '\u007f' || character === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (character === '\u0015') value = '';
        else value += character;
        if (value.length > 4096) { cancel(); return; }
      }
    };
    const timer = setTimeout(cancel, 300000);
    try {
      input.setRawMode(true);
      input.on('data', data);
      input.once('end', cancel);
      input.once('error', cancel);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGTSTP']) process.once(signal, cancel);
      output.write(prompt);
      input.resume();
    } catch { cancel(); }
  });
}
