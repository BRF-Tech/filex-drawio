// draw.io as a filex app, measured end to end in real browsers:
//   node measure/drawio-measure.mjs <filex binary> dist/ui.zip [chromium|firefox|webkit ...]
// Installs the app from ../filex-app.json + ui.zip into a fresh filex, then in
// each browser: opens a .drawio file, draws a shape with draw.io's own
// sidebar, saves with draw.io's own Save (a new version on disk), and makes a
// NEW diagram from filex's New menu (the app's `new_documents` row), which is
// a draft until filex's "Save to folder". Headless; Playwright's own input,
// never the person's mouse or keyboard.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// `npm install` in measure/ (playwright-core), or PW_CORE=<path to a playwright-core>.
const PW = process.env.PW_CORE || 'playwright-core';
const { chromium, firefox, webkit } = require(PW);
const BINARY = process.argv[2];
const UIZIP = process.argv[3];
const BROWSERS = process.argv.slice(4).length ? process.argv.slice(4) : ['chromium', 'firefox', 'webkit'];
const PORT = 5313;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'filex-app.json'), 'utf8'));

const DIAGRAM = '<mxfile><diagram id="d1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="2" value="Hello filex" style="rounded=1;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry x="80" y="80" width="160" height="60" as="geometry"/></mxCell>' +
  '</root></mxGraphModel></diagram></mxfile>';

/** How many shapes a saved diagram holds (plain XML; -1: a compressed page). */
function shapes(xml) {
  const plain = (xml.match(/vertex="1"/g) || []).length;
  return plain || (xml.includes('<diagram') && !xml.includes('<mxGraphModel') ? -1 : 0);
}

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not come up');
}

async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'filex-drawio-measure-'));
  const store = path.join(data, 'depo');
  fs.mkdirSync(store);
  const logFd = fs.openSync(path.join(OUT, 'server.log'), 'w');
  const srv = spawn(BINARY, ['serve'], {
    env: { ...process.env, FILEX_DATA_DIR: path.join(data, 'data'), FILEX_LISTEN: `127.0.0.1:${PORT}`, FILEX_PUBLIC_URL: BASE,
      FILEX_ADMIN_EMAIL: 'admin@example.com', FILEX_ADMIN_PASSWORD: 'measure-only', FILEX_SECRET_KEY: 'measure-secret-key-not-for-production', FILEX_APP_PLUGIN_UPDATE_CHECK: '0' },
    stdio: ['ignore', logFd, logFd],
  });
  const results = {};
  try {
    await waitUp();
    // Every browser's file before the storage is made (its first listing).
    for (const name of BROWSERS) fs.writeFileSync(path.join(store, `hello-${name}.drawio`), DIAGRAM);
    for (const name of BROWSERS) {
      results[name] = await measure(name, store);
      console.log(name, JSON.stringify(results[name], null, 1));
    }
  } finally {
    srv.kill();
    fs.writeFileSync(path.join(OUT, 'drawio.json'), JSON.stringify(results, null, 2));
  }
}

async function frameOf(page) {
  const el = page.locator('iframe[data-testid="app-frame"]');
  await el.waitFor({ timeout: 30000 });
  await page.locator('.fe-appframe[data-connected="true"]').waitFor({ timeout: 60000 });
  const frame = await (await el.elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.__filexDrawio && window.__filexDrawio.loaded, null, { timeout: 90000 });
  await frame.locator('.geDiagramContainer').first().waitFor({ timeout: 60000 });
  return frame;
}

/** Draw: click the first shape of draw.io's own Shapes panel (it lands on the
 *  page). In embed mode the panel starts closed: Ctrl+Shift+K opens it, as
 *  it does for a person. */
async function draw(frame, page) {
  const before = await frame.evaluate(() => window.__filexDrawio.events.length);
  const shape = frame.locator('.geSidebarContainer a.geItem').first();
  if (!(await shape.isVisible().catch(() => false))) {
    const box = await frame.locator('.geDiagramContainer').first().boundingBox();
    await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40);
    await page.keyboard.press('Control+Shift+K');
  }
  await shape.waitFor({ timeout: 20000 });
  await shape.click();
  await frame.waitForFunction((n) => window.__filexDrawio.events.slice(n).includes('autosave'), before, { timeout: 20000 });
}

/** draw.io's own Save, and the adapter's save through filex. */
async function drawioSave(frame) {
  await frame.evaluate(() => { window.__filexDrawio.saved = false; });
  const btn = frame.getByRole('button', { name: /^(Save|Kaydet)$/ }).or(frame.locator('button.geBigButton', { hasText: 'Save' }));
  await btn.first().click();
  await frame.waitForFunction(() => window.__filexDrawio.saved || window.__filexDrawio.errors.length, null, { timeout: 20000 });
  return frame.evaluate(() => ({ saved: window.__filexDrawio.saved, errors: window.__filexDrawio.errors.slice() }));
}

async function measure(name, store) {
  const type = { chromium, firefox, webkit }[name];
  const browser = await type.launch(name === 'chromium' ? { channel: 'chrome', headless: true } : { headless: true });
  const R = { browser: name + ' ' + browser.version() };
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1400, height: 900 } });
  try {
    await ctx.request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'measure-only' } });
    const list = await (await ctx.request.get('/api/admin/storages')).json();
    const rows = Array.isArray(list) ? list : list.storages ?? [];
    if (!rows.find((s) => s.name === 'depo')) {
      await ctx.request.post('/api/admin/storages', { data: { name: 'depo', driver: 'local', mount_path: store, config: { path: store }, enabled: true } });
    }
    const apps = await (await ctx.request.get('/api/admin/app-plugins')).json();
    if (!(apps.plugins ?? []).find((p) => p.name === 'drawio')) {
      const files = {
        manifest: { name: 'filex-app.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(MANIFEST)) },
        ui: { name: 'ui.zip', mimeType: 'application/zip', buffer: fs.readFileSync(UIZIP) },
      };
      const t0 = Date.now();
      const dry = await ctx.request.post('/api/admin/app-plugins?dry_run=1', { multipart: { ...files, grant: JSON.stringify({ permissions: [] }) }, timeout: 300000 });
      if (!dry.ok()) throw new Error('dry run ' + dry.status() + ' ' + (await dry.text()));
      const d = await dry.json();
      R.review = d.permissions.map((p) => `${p.id} = ${p.label}`);
      const inst = await ctx.request.post('/api/admin/app-plugins', { multipart: { ...files, grant: JSON.stringify({ permissions: d.permissions.map((p) => p.id) }) }, timeout: 300000 });
      if (!inst.ok()) throw new Error('install ' + inst.status() + ' ' + (await inst.text()));
      R.installMs = Date.now() - t0;
    }
    const page = await ctx.newPage();
    const consoleMsgs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    const failed = [];
    page.on('requestfailed', (r) => failed.push(r.url().replace(BASE, '').slice(0, 120) + ' ' + (r.failure()?.errorText ?? '')));
    await page.addInitScript(() => { try { localStorage.setItem('filex.tourDone', '1'); localStorage.setItem('filex.installPrompt.dismissed', '1'); } catch {} });
    await page.goto('/admin/explore?storage=depo');
    // The listing settles before a row is opened: a row double-clicked while
    // the explorer re-lists the folder can open read-only (its level is
    // reset for the new listing).
    await page.waitForLoadState('networkidle');

    // 1. Open, draw, save: a new version of the file on disk.
    const file = `hello-${name}.drawio`;
    const row = page.locator(`[data-fe-path="depo://${file}"]`);
    await row.waitFor({ timeout: 20000 });
    await row.getByText(file, { exact: true }).dblclick();
    let frame = await frameOf(page);
    R.opened = true;
    await draw(frame, page);
    R.save = await drawioSave(frame);
    const disk = fs.readFileSync(path.join(store, file), 'utf8');
    R.saved = { shapesBefore: shapes(DIAGRAM), shapesAfter: shapes(disk), changed: disk !== DIAGRAM, head: disk.slice(0, 60) };
    await page.screenshot({ path: path.join(OUT, `open-${name}.png`) });
    await page.getByTestId('viewer-close').click();
    await page.locator('iframe[data-testid="app-frame"]').waitFor({ state: 'detached', timeout: 15000 });

    // 2. New → draw.io diagram: a draft that opens in draw.io, is drawn on,
    //    saved into the draft, and lands in the folder on "Save to folder".
    await page.getByTestId('sidenav-new').click();
    await page.locator('.fe-ctx__item', { hasText: 'New document' }).click();
    await page.getByTestId('newdoc-modal').waitFor();
    const tile = page.getByTestId('newdoc-type-app:drawio:drawio');
    R.newRow = await tile.innerText().catch(() => null);
    await tile.click();
    await page.getByTestId('newdoc-name').fill(`Plan-${name}`);
    await page.waitForTimeout(400);
    await page.getByTestId('newdoc-create').click();
    await page.getByTestId('draft-bar').waitFor({ timeout: 20000 });
    frame = await frameOf(page);
    R.draftOpened = true;
    await draw(frame, page);
    R.draftSave = await drawioSave(frame);
    R.inFolderBefore = fs.existsSync(path.join(store, `Plan-${name}.drawio`));
    await page.getByTestId('draft-save').click();
    await page.getByTestId('draft-saved-note').waitFor({ timeout: 20000 });
    const planPath = path.join(store, `Plan-${name}.drawio`);
    const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : '';
    R.draft = { inFolderAfter: !!plan, shapes: shapes(plan), fromTemplate: plan.includes('<mxfile') };
    await page.screenshot({ path: path.join(OUT, `draft-${name}.png`) });
    R.console = consoleMsgs.slice(0, 15);
    R.cspViolations = consoleMsgs.filter((m) => /Content Security Policy|Content-Security-Policy|Connection-Allowlist/i.test(m)).length;
    R.failedRequests = failed.slice(0, 15);
  } catch (e) {
    R.failure = String(e && e.stack ? e.stack : e).slice(0, 700);
    try { for (const pg of ctx.pages()) await pg.screenshot({ path: path.join(OUT, `fail-${name}.png`) }); } catch {}
  } finally {
    await ctx.close();
    await browser.close();
  }
  return R;
}

main().catch((e) => { console.error(e); process.exit(1); });
