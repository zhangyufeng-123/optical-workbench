const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opticalAI', Object.freeze({
  getConfig: () => ipcRenderer.invoke('optical-ai:getConfig'),
  saveConfig: config => ipcRenderer.invoke('optical-ai:saveConfig', config),
  listJobs: () => ipcRenderer.invoke('optical-ai:listJobs'),
  createJob: input => ipcRenderer.invoke('optical-ai:createJob', input),
  getJob: id => ipcRenderer.invoke('optical-ai:getJob', id),
  pollJob: id => ipcRenderer.invoke('optical-ai:pollJob', id),
  getModel: id => ipcRenderer.invoke('optical-ai:getModel', id),
  cancelJob: id => ipcRenderer.invoke('optical-ai:cancelJob', id)
}));
