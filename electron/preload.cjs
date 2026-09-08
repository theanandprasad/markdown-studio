'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  getInitialDocument: () => ipcRenderer.invoke('document:initial'),
  setDirty: (dirty) => ipcRenderer.send('document:dirty', !!dirty),
  save: () => ipcRenderer.invoke('document:save'),
  saveAs: () => ipcRenderer.invoke('document:save-as'),
  open: () => ipcRenderer.invoke('document:open'),
  openPath: (fp) => ipcRenderer.invoke('document:open-path', fp),
  newDocument: () => ipcRenderer.invoke('document:new'),
  reveal: () => ipcRenderer.invoke('document:reveal'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  chooseImage: () => ipcRenderer.invoke('dialog:choose-image'),
  relativeImagePath: (absPath) => ipcRenderer.invoke('path:relative-image', absPath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  setFullWidth: (value) => ipcRenderer.invoke('settings:set-full-width', !!value),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, payload) => cb(payload)),
  onLoad: (cb) => ipcRenderer.on('document:load', (_e, payload) => cb(payload)),
  onSaved: (cb) => ipcRenderer.on('document:saved', (_e, payload) => cb(payload)),
  onMenuCommand: (cb) => ipcRenderer.on('menu:command', (_e, cmd, arg) => cb(cmd, arg)),
});
