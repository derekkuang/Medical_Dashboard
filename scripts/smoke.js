/**
 * Browser smoke test.
 *
 *   npm run build && npm run preview     # in another shell
 *   npm run smoke
 *
 * Exists because the unit suite cannot establish that this application works.
 * jsdom has no canvas, no layout and no real ResizeObserver, and a stub that
 * behaved unlike a browser already let a bug ship where every chart rendered
 * blank while 368 tests passed. Some claims can only be checked by running the
 * thing and looking at the pixels.
 *
 * Two phases, deliberately separated by what they depend on:
 *
 *   render     the page loads and every chart draws marks. Needs nothing but
 *              the app and its own data file, so it is safe to block a build on.
 *   telemetry  a case replays from the live VitalDB API. Depends on a third
 *              party, so an outage there is not a defect here — CI runs it for
 *              signal rather than as a gate. Set SMOKE_SKIP_TELEMETRY=1 to omit.
 *
 * No new dependencies: Chrome is driven over the DevTools Protocol using the
 * WebSocket client built into Node 22.
 */
import { spawn } from 'node:child_process';

const APP_URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PORT = Number(process.env.SMOKE_CDP_PORT ?? '9333');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SKIP_TELEMETRY = process.env.SMOKE_SKIP_TELEMETRY === '1';

/** Charts the dashboard is expected to draw before any case is chosen. */
const EXPECTED_CHARTS = 6;

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

function makeEvaluator(socket) {
  let nextId = 1;
  return (expression) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
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

/** Shared page-side helpers, prepended to each scenario. */
const PRELUDE = `
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
  const chartFrames = () => [
    ...document.querySelectorAll('svg[role="img"], svg[role="group"]'),
  ];
`;

/**
 * Phase one: the page renders, and the charts contain actual geometry.
 *
 * Counting marks rather than frames is the point. The blank-chart bug left
 * every frame present in the DOM and empty inside it, so an assertion that only
 * looked for the containers would have passed straight through it.
 */
const RENDER_SCENARIO = `(async () => {
  ${PRELUDE}
  const frames = await waitFor(() => {
    const found = chartFrames();
    return found.length >= ${String(EXPECTED_CHARTS)} ? found : null;
  });
  if (!frames) {
    return { ok: false, step: 'render chart frames', found: chartFrames().length };
  }

  const marks = frames.map((f) => f.querySelectorAll('rect, circle, path').length);
  const empty = frames
    .map((f, i) => ({ title: f.querySelector('title')?.textContent ?? '?', marks: marks[i] }))
    .filter((f) => f.marks === 0);

  return { ok: empty.length === 0, frames: frames.length, marks, empty };
})()`;

/** Phase two: a case actually replays, drawn from the live API. */
const TELEMETRY_SCENARIO = `(async () => {
  ${PRELUDE}
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

  // A numeric readout means samples reached the draw loop: it is written by
  // that loop and shows an em dash until the first one lands.
  const readouts = await waitFor(() => {
    const values = [...document.querySelectorAll('figcaption span span')]
      .map((s) => s.textContent ?? '')
      .filter((t) => /[0-9]/.test(t));
    return values.length > 0 ? values : null;
  }, 60000);

  // Non-transparent pixels distinguish a canvas that was painted from one that
  // merely exists in the DOM.
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
    ok: Boolean(readouts) && painted.every((p) => p > 100),
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
    // CI containers give /dev/shm 64 MB, which Chrome exhausts and then
    // crashes on a page this size.
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${String(PORT)}`,
    '--window-size=1400,1600',
    APP_URL,
  ]);

  let socket;
  let failed = false;

  try {
    const debuggerUrl = await waitForTarget();
    socket = new WebSocket(debuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => {
        reject(new Error('Could not attach to the page'));
      });
    });

    const evaluate = makeEvaluator(socket);

    const render = await evaluate(RENDER_SCENARIO);
    console.log('render:', JSON.stringify(render));
    if (!render?.ok) {
      console.error(`\nFAILED: charts did not draw (${render?.step ?? 'empty frames'})`);
      failed = true;
    } else {
      console.log(`  ${String(render.frames)} charts drew marks`);
    }

    if (SKIP_TELEMETRY) {
      console.log('\ntelemetry: skipped (SMOKE_SKIP_TELEMETRY=1)');
    } else {
      const telemetry = await evaluate(TELEMETRY_SCENARIO);
      console.log('telemetry:', JSON.stringify(telemetry));
      if (!telemetry?.ok) {
        console.error(`\nFAILED: telemetry did not replay (${telemetry?.step ?? 'no pixels'})`);
        failed = true;
      } else {
        console.log(`  replayed ${telemetry.chosen}, readouts ${telemetry.readouts.join(', ')}`);
      }
    }

    if (!failed) console.log('\nSmoke test passed.');
    process.exitCode = failed ? 1 : 0;
  } finally {
    socket?.close();
    chrome.kill();
  }
}

await main();
