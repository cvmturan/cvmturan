'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { preparePlaybackRequest } = require('./security');
const { launchPlayer } = require('./player');
const { EmbeddedPlayer } = require('./embedded-player');
const { PlaybackView } = require('./playback-view');

const APP_ORIGIN = 'https://showt.fun';
let mainWindow;
let playback;
let playbackRequest = 0;
const resourcesPath = () => app.isPackaged ? process.resourcesPath : path.join(__dirname, 'vendor');
let playerView;
let lastPayload;
function restoreBrowse() { playerView?.close(); }
function playerAction(name, value) {
  if (name === 'back') { playbackRequest++; playback?.stop(); restoreBrowse(); return; }
  if (name === 'retry' && lastPayload) return startPlayback(lastPayload);
  if (name === 'fullscreen') { mainWindow.setFullScreen(!mainWindow.isFullScreen()); return; }
  if (!playback?.session) return;
  if (name === 'pause') playback.command(['cycle','pause']);
  if (name === 'seek' && Number.isFinite(value)) playback.command(['seek',Math.max(-60,Math.min(60,value)),'relative']);
  if (name === 'position' && Number.isFinite(value)) playback.command(['seek',Math.max(0,Math.min(playback.session.duration||0,value)),'absolute']);
  if (name === 'volume' && Number.isFinite(value)) playback.command(['set_property','volume',Math.max(0,Math.min(100,value))]);
  if (name === 'speed' && [0.75,1,1.25,1.5,2].includes(Number(value))) playback.command(['set_property','speed',Number(value)]);
  if (['audio','subtitle'].includes(name) && (value === 'no' || /^\d{1,6}$/.test(String(value)))) playback.command(['set_property',name==='audio'?'aid':'sid',value==='no'?'no':Number(value)]);
}

function isTrustedSender(event) {
  try {
    return new URL(event.senderFrame.url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
    title: 'TShow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) {
        event.preventDefault();
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.setMenu(null);
  playerView = new PlaybackView(mainWindow, playerAction);
  playback = new EmbeddedPlayer({ resourcesPath: resourcesPath(), onEvent: event => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!(event.type === 'closed' && event.reason === 'error')) mainWindow.webContents.send('tshow:playback', event);
    if (event.type === 'playing') playerView.update({ phase: 'playing' });
    if (event.type === 'state') playerView.update(event.state);
    if (event.type === 'progress') playerView.update({position:event.position,duration:event.duration});
    if (event.type === 'error') playerView.update({phase:'error',error:event.error});
    if (event.type === 'fullscreen') playerAction('fullscreen');
    if (event.type === 'closed' && event.reason !== 'error') restoreBrowse();
  } });
  mainWindow.on('closed', () => { playbackRequest++; playback.stop(); playerView.destroy(); });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) { playbackRequest++; playback.stop(); }
  });
  mainWindow.loadURL(`${APP_ORIGIN}/?desktop=1`);
}

ipcMain.handle('tshow:stop', event => {
  if (!isTrustedSender(event)) return;
  playbackRequest++;
  playback?.stop();
});

ipcMain.handle('tshow:player-action', (event,name,value) => {
  if (event.sender !== playerView?.view.webContents) return;
  return playerAction(name,value);
});
ipcMain.handle('tshow:player-ready', event => {
  if (event.sender === playerView?.view.webContents) playerView.update({});
});
ipcMain.handle('tshow:play', (event,payload) => {
  if (!isTrustedSender(event)) return {ok:false,error:'Untrusted playback request.'};
  return startPlayback(payload);
});
async function startPlayback(payload) {
  const generation = ++playbackRequest;
  const embedded = payload?.preferredPlayer !== 'vlc' && process.platform === 'win32';
  if (embedded) lastPayload = payload;
  playback.stop();
  if (embedded) playerView.open(String(payload?.title || 'TShow').slice(0,180));
  try {
    let timer;
    const request = await Promise.race([preparePlaybackRequest(payload), new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The media host took too long to respond. Try another source.')),8000);})]).finally(()=>clearTimeout(timer));
    if (generation !== playbackRequest || !mainWindow || mainWindow.isDestroyed()) return { ok:false,error:'Playback cancelled.' };
    if (!embedded) return {ok:true,...await launchPlayer(request,{resourcesPath:resourcesPath()})};
    return await playback.start(request,playerView.surface.getNativeWindowHandle().readUInt32LE(0),{
      sessionId:typeof payload.sessionId==='string'?payload.sessionId.slice(0,128):'',
      start:Number.isFinite(payload.start)?payload.start:0
    });
  } catch(error) {
    if(generation===playbackRequest && embedded) playerView.update({phase:'error',error:error.message||'The video could not be opened.'});
    return {ok:false,error:error.message||'The video could not be opened.'};
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
