'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartday', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  savePreferences: (prefs) => ipcRenderer.invoke('settings:save', prefs),
  setCredentials: (credentials) => ipcRenderer.invoke('credentials:set', credentials),
  listModels: () => ipcRenderer.invoke('ai:models'),
  testAI: () => ipcRenderer.invoke('ai:test'),
  chat: (message, history = []) => ipcRenderer.invoke('ai:chat', { message, history }),
  inspectWebsite: (url) => ipcRenderer.invoke('website:inspect', url),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  hideToTray: () => ipcRenderer.invoke('window:hide'),
  showMain: () => ipcRenderer.invoke('window:show'),
  toggleWidget: () => ipcRenderer.invoke('widget:toggle'),
  closeWidget: () => ipcRenderer.invoke('widget:close'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onQuickAdd: (callback) => ipcRenderer.on('quick-add', () => callback()),
  platform: process.platform,
  version: '2.0.0'
});
