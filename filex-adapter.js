
/* ── filex-drawio: draw.io's embed protocol, spoken to filex ─────────────
 *
 * draw.io in embed mode talks JSON over postMessage to
 * `this.embedMessageSource || window.opener || window.parent`. In filex the
 * parent is filex itself, which only speaks its own bridge — so the adapter
 * names a MessagePort as draw.io's message source: draw.io's messages arrive
 * on the port, and the adapter's answers are dispatched to draw.io as
 * `message` events whose source is that port. The adapter speaks to filex
 * through the SDK (FilexAppUI, prepended to this file).
 */
(function () {
  urlParams['embed'] = '1';
  urlParams['proto'] = 'json';
  urlParams['spin'] = '1';
  urlParams['noExitBtn'] = '1';
  urlParams['saveAndExit'] = '0';
  urlParams['stealth'] = '1';
  urlParams['configure'] = '0';
  var log0 = [];
  var ch = new MessageChannel();
  var port = ch.port1;
  var post = port.postMessage.bind(port);
  // draw.io calls postMessage(text, "*"); a port takes no target origin.
  port.postMessage = function (m) { post(m); };
  // draw.io posts some messages (its Save) to `window.opener || window.parent`
  // directly. `opener` is [Replaceable]: naming the port there keeps them
  // off filex's own window (whose bridge ignores them) without touching
  // `parent`, which the SDK's handshake checks.
  try { window.opener = port; } catch (x) { log0.push('opener: ' + x); }
  Object.defineProperty(Object.prototype, 'embedMessageSource', {
    configurable: true,
    get: function () { return port; },
    set: function () {},
  });
  var fx = null;
  var lastXml = null;
  var log = (window.__filexDrawio = { events: [], errors: log0 });
  function toDrawio(msg) {
    window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(msg), source: port }));
  }
  var ready = FilexAppUI.connect().then(function (app) {
    fx = app;
    fx.onSave(function () { return lastXml; });
    return app;
  });
  ch.port2.onmessage = function (e) {
    var m;
    try { m = JSON.parse(e.data); } catch (x) { return; }
    log.events.push(m.event);
    if (m.event === 'init') {
      ready.then(function (app) { return app.open(0); }).then(function (f) { return f.text(); }).then(function (xml) {
        lastXml = xml;
        toDrawio({ action: 'load', xml: xml, autosave: 1, title: '' });
        log.loaded = true;
      }).catch(function (err) { log.errors.push(String(err && err.message || err)); });
    } else if (m.event === 'autosave') {
      lastXml = m.xml;
      if (fx) fx.dirty(true);
    } else if (m.event === 'save') {
      lastXml = m.xml;
      if (fx) fx.save(m.xml).then(function () { fx.dirty(false); log.saved = true; }, function (err) { log.errors.push(String(err && err.message || err)); });
    } else if (m.event === 'exit') {
      if (fx) fx.close();
    }
  };
})();
