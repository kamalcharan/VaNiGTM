/**
 * VaNi embed — the one file a tenant pastes into their site.
 *
 *   <script src="https://vani.vikuna.io/embed/vani.js"
 *           data-vani-token="…" defer></script>
 *
 * PLATFORM-OWNED, not Vara's. One tenant pastes ONE tag, and every agent
 * live for that workspace is reachable through it — Vara answers candidates,
 * Nova will answer whatever Nova answers. The tag is the one artefact we can
 * never migrate: once it is in someone's Wix site, that URL is theirs for the
 * life of the site. So it carries no agent's name.
 *
 * Works anywhere a script tag works — Wix, WordPress, Shopify, hand-written
 * HTML — because it asks nothing of the host page: no framework, no globals,
 * no styles leak in either direction. It draws one launcher button and one
 * iframe; everything else (branding, roles, the conversation) lives inside
 * the iframe on the platform origin, where it is versioned and deployed
 * without the tenant ever touching their site again.
 *
 * The iframe is told the host page's origin. The platform checks that origin
 * against the workspace's allowlist on every boot — an unlisted site gets a
 * refusal, not a widget.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var token = script.getAttribute('data-vani-token');
  if (!token) return;

  // Where the widget assets live = where this script was loaded from.
  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    return;
  }

  var open = false;
  var frame = null;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Chat with VaNi');
  btn.textContent = 'VaNi';
  btn.style.cssText =
    'position:fixed;right:20px;bottom:20px;z-index:2147483000;' +
    'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;' +
    'background:#c9a227;color:#141414;font-weight:700;font-size:14px;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.35);';

  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.title = 'VaNi';
    frame.src =
      origin +
      '/embed/chat?token=' +
      encodeURIComponent(token) +
      '&parent=' +
      encodeURIComponent(window.location.origin);
    frame.style.cssText =
      'position:fixed;right:20px;bottom:88px;z-index:2147483000;' +
      'width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);' +
      'border:none;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);' +
      'background:#141414;display:none;';
    document.body.appendChild(frame);
    return frame;
  }

  btn.addEventListener('click', function () {
    var f = ensureFrame();
    open = !open;
    f.style.display = open ? 'block' : 'none';
    btn.setAttribute('aria-expanded', String(open));
  });

  // The iframe can ask to close itself (the ✕ inside the chat header).
  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    if (e.data && e.data.type === 'vani:close' && frame) {
      open = false;
      frame.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  if (document.body) document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(btn); });
})();
