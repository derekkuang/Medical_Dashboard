/**
 * Browser smoke test for telemetry replay.
 *
 *   npm run dev            # in another shell
 *   node scripts/smoke-telemetry.js
 *
 * Exists because the unit suite cannot prove this works. jsdom has no canvas,
 * no layout and no real ResizeObserver, and a stub that behaved unlike a
 * browser already let a bug ship where every chart rendered blank while 368
 * tests passed. This drives a real Chrome against the real VitalDB API and
 * asserts that pixels actually got painted.
 *
 * No new dependencies: Chrome is driven over the DevTools Protocol using the
 * WebSocket client built into Node 22.
 */
import { spawn } from 'node:child_process';

const APP_URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PORT = 9333;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(PORT)}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome has not opened the port yet.
    }
    await sleep(500);
  }
  throw new Error('Chrome never exposed a debuggable page');
}

/** Runs one expression in the page and resolves its value. */
function evaluate(socket, expression, id) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text ?? 'Page threw'));
        return;
      }
      resolve(message.result?.result?.value);
    };
    socket.addEventListener('message', onMessage);
    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
  });
}

/**
 * The whole interaction runs inside the page as one awaited expression.
 *
 * Stepping through it over the protocol would mean a round trip per click and
 * a great deal of sequencing for no extra confidence.
 */
const SCENARIO = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 30000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const value = fn();
      if (value) return value;
      await sleep(200);
    }
    return null;
  };

  const combo = await waitFor(() =>
    [...document.querySelectorAll('[role="combobox"]')].find((c) =>
      (c.closest('.MuiFormControl-root')?.textContent ?? '').includes('Case'),
    ),
  );
  if (!combo) return { ok: false, step: 'find the case selector' };
  // MUI's Select opens on mousedown, not click, so a synthetic .click() alone
  // does nothing. Real pointer input produces both.
  combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  combo.click();

  const option = await waitFor(() =>
    [...document.querySelectorAll('[role="option"]')].find((o) =>
      (o.textContent ?? '').startsWith('#'),
    ),
  );
  if (!option) return { ok: false, step: 'open the case list' };
  const chosen = option.textContent;
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option.click();

  const canvases = await waitFor(() => {
    const found = [...document.querySelectorAll('canvas')];
    return found.length > 0 ? found : null;
  });
  if (!canvases) return { ok: false, step: 'render traces', chosen };

  const play = await waitFor(() => document.querySelector('button[aria-label="Start replay"]'));
  if (!play) return { ok: false, step: 'find the play button', chosen };
  play.click();

  // A numeric readout means samples reached the draw loop; the readout is
  // written by that loop and shows an em dash until the first one lands.
  const readouts = await waitFor(() => {
    const values = [...document.querySelectorAll('figcaption span span')]
      .map((s) => s.textContent ?? '')
      .filter((t) => /[0-9]/.test(t));
    return values.length > 0 ? values : null;
  }, 60000);

  // Count non-transparent pixels: proof the canvas was actually painted rather
  // than merely present in the DOM.
  const painted = canvases.map((c) => {
    try {
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque += 1;
      return opaque;
    } catch {
      return -1;
    }
  });

  return {
    ok: Boolean(readouts) && painted.some((p) => p > 100),
    chosen,
    traces: canvases.length,
    readouts,
    painted,
  };
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${String(PORT)}`,
    '--window-size=1400,1600',
    APP_URL,
  ]);

  let socket;
  try {
    const debuggerUrl = await waitForTarget();
    socket = new WebSocket(debuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => {
        reject(new Error('Could not attach to the page'));
      });
    });

    const result = await evaluate(socket, SCENARIO, 1);

    console.log(JSON.stringify(result, null, 2));
    if (!result?.ok) {
      console.error(`\nFAILED at: ${result?.step ?? 'unknown step'}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nTelemetry replay works in a real browser.');
  } finally {
    socket?.close();
    chrome.kill();
  }
}

await main();
