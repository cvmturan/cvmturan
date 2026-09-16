'use strict';
const { WebContentsView } = require('electron');
const path = require('node:path');
const { NativeSurface, revealVideo } = require('./native-video');

class PlaybackView {
  constructor(window, onAction) {
    this.window = window;
    this.onAction = onAction;
    this.state = { phase: 'loading', title: 'TShow', position: 0, duration: 0, tracks: [] };
    this.view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'player-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    this.view.setBackgroundColor('#090a10');
    this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.view.webContents.on('will-navigate', event => event.preventDefault());
    this.view.webContents.loadFile(path.join(__dirname, 'player.html'));
    this.view.webContents.on('did-finish-load', () => this.update({}));
    this.surface = new NativeSurface(window);
    this.layout = () => {
      if (!this.visible || this.surface.isDestroyed() || window.isDestroyed()) return;
      const bounds = window.getContentBounds();
      this.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
      this.surface.setBounds();
    };
    this.hideSurface = () => this.surface.hide();
    this.restoreSurface = () => { if (this.visible && this.state.videoReady && this.state.phase !== 'error' && !window.isMinimized()) this.surface.showInactive(); };
    for (const event of ['resize', 'move', 'enter-full-screen', 'leave-full-screen']) window.on(event, this.layout);
    window.on('minimize', this.hideSurface); window.on('restore', this.restoreSurface);
    window.on('show', this.restoreSurface); window.on('hide', this.hideSurface);
  }
  open(title) {
    this.state = { phase: 'loading', title, position: 0, duration: 0, tracks: [], paused: false, volume: 100, speed: 1, videoReady: false };
    if (!this.visible) this.window.contentView.addChildView(this.view);
    this.visible = true;
    this.surface.hide(); this.layout(); this.update({}); this.view.webContents.focus();
  }
  update(patch) {
    Object.assign(this.state, patch);
    if (!this.view.webContents.isDestroyed()) this.view.webContents.send('tshow:player-state', this.state);
    if (this.visible && patch.videoReady) this.restoreSurface();
    if (patch.phase === 'error') this.surface.hide();
  }
  close() {
    this.visible = false;
    if (!this.surface.isDestroyed()) this.surface.hide();
    if (!this.window.isDestroyed()) { this.window.contentView.removeChildView(this.view); this.window.webContents.focus(); }
  }
  destroy() {
    for (const event of ['resize', 'move', 'enter-full-screen', 'leave-full-screen']) this.window.removeListener(event, this.layout);
    for (const [event,listener] of [['minimize',this.hideSurface],['restore',this.restoreSurface],['show',this.restoreSurface],['hide',this.hideSurface]]) this.window.removeListener(event,listener);
    if (!this.surface.isDestroyed()) this.surface.destroy();
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
  }
}
module.exports = { PlaybackView };
