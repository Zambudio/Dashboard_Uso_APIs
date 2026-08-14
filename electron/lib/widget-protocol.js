'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const WIDGET_SCHEME = 'dashboard-widget';
const WIDGET_HOST = 'app';
const WIDGET_URL = `${WIDGET_SCHEME}://${WIDGET_HOST}/widget.html`;
const ALLOWED_ASSETS = new Set([
  'widget.html',
  'widget.css',
  'widget.js',
  'logos/claude.png',
  'logos/deepseek.png',
  'logos/gemini.png',
  'logos/openai.png',
]);

function resolveWidgetAsset(requestUrl, rendererRoot) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${WIDGET_SCHEME}:` || parsed.host !== WIDGET_HOST || parsed.search || parsed.hash) {
    return null;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }

  if (!ALLOWED_ASSETS.has(relativePath)) return null;
  return path.join(rendererRoot, ...relativePath.split('/'));
}

function registerWidgetProtocol({ protocol, net, rendererRoot }) {
  return protocol.handle(WIDGET_SCHEME, (request) => {
    const assetPath = resolveWidgetAsset(request.url, rendererRoot);
    if (!assetPath) {
      return new Response('Recurso no encontrado.', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

module.exports = {
  ALLOWED_ASSETS,
  WIDGET_SCHEME,
  WIDGET_URL,
  registerWidgetProtocol,
  resolveWidgetAsset,
};
