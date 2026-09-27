// The README's pictures, taken from a real filex with this app installed:
//   node measure/screenshots.mjs <filex binary> dist/ui.zip
// Writes docs/screenshots/{install-review,editing,new-document}.png — the
// install review (Admin → Apps → Install, stopped at its permissions), a
// diagram being edited in filex, and filex's New document dialog with the
// app's row. English, 1440 px wide, Chromium, headless; Playwright's own
// input only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PW = process.env.PW_CORE || 'playwright-core';
const { chromium } = require(PW);
const BINARY = process.argv[2];
const UIZIP = path.resolve(process.argv[3] ?? path.join(HERE, '..', 'dist', 'ui.zip'));
const PORT = 5315;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(HERE, '..', 'docs', 'screenshots');
const MANIFEST = path.join(HERE, '..', 'filex-app.json');
fs.mkdirSync(OUT, { recursive: true });

// A diagram worth looking at: a small flow, drawn in draw.io's own shapes.
const FLOW = `<mxfile><diagram id="flow" name="Review"><mxGraphModel dx="900" dy="600" grid="1" gridSize="10" page="1" pageWidth="850" pageHeight="1100"><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="Upload" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="60" y="80" width="140" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="Review" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1"><mxGeometry x="280" y="80" width="140" height="60" as="geometry"/></mxCell>
<mxCell id="c" value="Approved?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1"><mxGeometry x="500" y="70" width="120" height="80" as="geometry"/></mxCell>
<mxCell id="d" value="Publish" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="490" y="220" width="140" height="60" as="geometry"/></mxCell>
<mxCell id="e" value="Revise" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="280" y="220" width="140" height="60" as="geometry"/></mxCell>
<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="b" target="c"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e3" value="yes" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="c" target="d"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e4" value="no" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="c" target="e"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="560" y="190"/><mxPoint x="350" y="190"/></Array></mxGeometry></mxCell>
<mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="e" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not come up');
}

async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'filex-drawio-shots-'));
  const store = path.join(data, 'Projects');
  fs.mkdirSync(store);
  fs.writeFileSync(path.join(store, 'release-flow.drawio'), FLOW);
  const srv = spawn(BINARY, ['serve'], {
    env: { ...process.env, FILEX_DATA_DIR: path.join(data, 'data'), FILEX_LISTEN: `127.0.0.1:${PORT}`, FILEX_PUBLIC_URL: BASE,
      FILEX_ADMIN_EMAIL: 'admin@example.com', FILEX_ADMIN_PASSWORD: 'screenshots-only', FILEX_SECRET_KEY: 'screenshots-secret-key-not-for-production',
      FILEX_APP_PLUGIN_UPDATE_CHECK: '0' },
    stdio: 'ignore',
  });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  try {
    await waitUp();
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, locale: 'en-US', colorScheme: 'light' });
    await ctx.request.post('/api/auth/login', { data: { email: 'admin@example.com', password: 'screenshots-only' } });
    await ctx.request.post('/api/admin/storages', { data: { name: 'projects', driver: 'local', mount_path: store, config: { path: store }, enabled: true } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { localStorage.setItem('filex.tourDone', '1'); localStorage.setItem('filex.installPrompt.dismissed', '1'); localStorage.setItem('filex.locale', 'en'); } catch {}
    });

    // 1. The install review.
    await page.goto('/admin/plugins');
    await page.getByTestId('plugins-tab-apps').click();
    await page.getByTestId('app-plugin-add').click();
    await page.getByTestId('app-plugin-wizard').waitFor();
    await page.getByTestId('app-plugin-source-file').click();
    await page.getByTestId('app-plugin-manifest').setInputFiles(MANIFEST);
    await page.getByTestId('app-plugin-ui').setInputFiles(UIZIP);
    await page.getByTestId('app-plugin-review').click();
    await page.getByTestId('app-plugin-permissions').waitFor({ timeout: 120_000 });
    await page.getByTestId('perm-ui:package-fetch').waitFor({ timeout: 10_000 });
    const dialog = page.locator('[role="dialog"]').filter({ has: page.getByTestId('app-plugin-permissions') });
    for (let i = 0; i < 5; i++) {
      const box = await dialog.boundingBox();
      const view = page.viewportSize();
      if (box && view && box.y >= 0 && box.y + box.height <= view.height) break;
      await page.setViewportSize({ width: 1440, height: Math.min(2600, Math.ceil((box?.y ?? 0) + (box?.height ?? 900) + 48)) });
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(400);
    await dialog.screenshot({ path: path.join(OUT, 'install-review.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel(/I understand/).check();
    await page.getByTestId('app-plugin-install').click();
    await page.waitForTimeout(3000);
    await page.keyboard.press('Escape');

    // 2. A diagram, edited in filex.
    await page.goto('/admin/explore?storage=projects');
    // The listing settles before a row is opened: a row double-clicked while
    // the explorer re-lists the folder can open read-only (its level is
    // reset for the new listing).
    await page.waitForLoadState('networkidle');
    const row = page.locator('[data-fe-path="projects://release-flow.drawio"]');
    await row.waitFor({ timeout: 20_000 });
    await row.getByText('release-flow.drawio', { exact: true }).dblclick();
    const el = page.locator('iframe[data-testid="app-frame"]');
    await el.waitFor({ timeout: 30_000 });
    await page.locator('.fe-appframe[data-connected="true"]').waitFor({ timeout: 60_000 });
    const frame = await (await el.elementHandle()).contentFrame();
    await frame.waitForFunction(() => window.__filexDrawio && window.__filexDrawio.loaded, null, { timeout: 90_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'editing.png') });
    await page.getByTestId('viewer-close').click();
    await el.waitFor({ state: 'detached', timeout: 15_000 });

    // 3. New document, with the app's row.
    await page.getByTestId('sidenav-new').click();
    await page.locator('.fe-ctx__item', { hasText: 'New document' }).click();
    const modal = page.getByTestId('newdoc-modal');
    await modal.waitFor();
    await page.getByTestId('newdoc-type-app:drawio:drawio').click();
    await page.waitForTimeout(600);
    await page.locator('.fe-modal__card').filter({ has: modal }).first().screenshot({ path: path.join(OUT, 'new-document.png') })
      .catch(async () => page.screenshot({ path: path.join(OUT, 'new-document.png') }));
    console.log('wrote', fs.readdirSync(OUT).join(', '));
  } finally {
    await browser.close();
    srv.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
