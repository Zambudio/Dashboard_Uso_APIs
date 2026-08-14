'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { WIDGET_URL, resolveWidgetAsset } = require('./widget-protocol');

const rendererRoot = path.resolve('electron', 'renderer');

test('resuelve exclusivamente los recursos publicados del widget', () => {
  assert.equal(resolveWidgetAsset(WIDGET_URL, rendererRoot), path.join(rendererRoot, 'widget.html'));
  assert.equal(
    resolveWidgetAsset('dashboard-widget://app/logos/openai.png', rendererRoot),
    path.join(rendererRoot, 'logos', 'openai.png')
  );
});

test('rechaza hosts, esquemas y recursos no permitidos', () => {
  assert.equal(resolveWidgetAsset('https://app/widget.html', rendererRoot), null);
  assert.equal(resolveWidgetAsset('dashboard-widget://otro/widget.html', rendererRoot), null);
  assert.equal(resolveWidgetAsset('dashboard-widget://app/preload.js', rendererRoot), null);
  assert.equal(resolveWidgetAsset('dashboard-widget://app/widget.html?debug=1', rendererRoot), null);
});

test('rechaza rutas manipuladas o mal codificadas', () => {
  assert.equal(resolveWidgetAsset('dashboard-widget://app/../preload.js', rendererRoot), null);
  assert.equal(resolveWidgetAsset('dashboard-widget://app/%2e%2e%2fpreload.js', rendererRoot), null);
  assert.equal(resolveWidgetAsset('dashboard-widget://app/%E0%A4%A', rendererRoot), null);
});
