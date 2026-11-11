/* 课序 · 截图/交互调试器（开发用）
   用法：
     node tools/shot.js <url> <out.png> [--width 393] [--height 852] [--dpr 2]
                        [--wait 600] [--eval "js"] [--eval "..."] [--full] [--dark] [--outdir?]
   例：
     node tools/shot.js http://127.0.0.1:8765/ .shots/schedule.png --eval "document.querySelector('[data-page=schedule]').click()"
     node tools/shot.js http://127.0.0.1:8765/ .shots/dark.png --dark
   会启动一个临时的 Edge（headless）→ CDP 控制 → 截图 → 关闭。 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 需要任意 Chromium 内核浏览器（Edge / Chrome）。
// 用 BROWSER_BIN 环境变量指定，否则按下面的默认路径找。
const EDGE = process.env.BROWSER_BIN ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333 + Math.floor(Math.random() * 200);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJSON(p) {
  const res = await fetch('http://127.0.0.1:' + PORT + p);
  return res.json();
}

(async function main() {
  const argv = process.argv.slice(2);
  const positional = [];
  const evals = [];
  const opt = { width: 393, height: 852, dpr: 2, wait: 700, full: false, dark: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--eval') evals.push(argv[++i]);
    else if (a === '--evalfile') evals.push(fs.readFileSync(argv[++i], 'utf8'));
    else if (a === '--width') opt.width = Number(argv[++i]);
    else if (a === '--height') opt.height = Number(argv[++i]);
    else if (a === '--dpr') opt.dpr = Number(argv[++i]);
    else if (a === '--wait') opt.wait = Number(argv[++i]);
    else if (a === '--full') opt.full = true;
    else if (a === '--dark') opt.dark = true;
    else positional.push(a);
  }
  const url = positional[0];
  const out = path.resolve(positional[1] || '.shots/shot.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-edge-'));
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  let info = null;
  for (let i = 0; i < 60; i++) {
    try { info = await getJSON('/json/version'); if (info) break; } catch (e) { }
    await sleep(150);
  }
  if (!info) {
    console.error('浏览器启动失败。用 BROWSER_BIN 环境变量指定 Chromium 内核浏览器，例如：');
    console.error('  BROWSER_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe"');
    proc.kill();
    process.exit(1);
  }

  const res = await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.text + ' ' + (d.exception && d.exception.description || ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map(a => a.value || a.description || '').join(' '));
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: opt.width, height: opt.height, deviceScaleFactor: opt.dpr, mobile: true
  });
  if (opt.dark) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  }

  await send('Page.navigate', { url });
  await sleep(opt.wait);

  for (const code of evals) {
    try {
      const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
      if (r && r.exceptionDetails) console.error('[eval error]', JSON.stringify(r.exceptionDetails.exception));
      else if (r && r.result && r.result.value !== undefined) console.log('[eval]', JSON.stringify(r.result.value));
    } catch (e) { console.error('[eval fail]', e.message); }
    await sleep(450);
  }

  const metrics = await send('Runtime.evaluate', {
    expression: `JSON.stringify({iw:innerWidth,ih:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,dev:document.getElementById('device').getBoundingClientRect().width,err:window.__err||null})`,
    returnByValue: true
  });
  console.log('[metrics]', metrics.result.value);

  const shotParams = { format: 'png', captureBeyondViewport: false };
  if (opt.full) {
    const m = await send('Page.getLayoutMetrics');
    shotParams.captureBeyondViewport = true;
    shotParams.clip = { x: 0, y: 0, width: opt.width, height: Math.min(m.cssContentSize.height, 4000), scale: 1 };
  }
  const shot = await send('Page.captureScreenshot', shotParams);
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved', out);
  if (errors.length) console.log('[console errors]', JSON.stringify(errors.slice(0, 8)));

  ws.close();
  proc.kill();
  await sleep(200);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
