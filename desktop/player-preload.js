'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('playerControls', Object.freeze({
  action: (name,value) => ipcRenderer.invoke('tshow:player-action',name,value),
  subscribe: callback => { ipcRenderer.on('tshow:player-state',(_event,state)=>callback(state)); ipcRenderer.invoke('tshow:player-ready'); }
}));
