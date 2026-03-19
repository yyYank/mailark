const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openMboxFile: () => ipcRenderer.invoke('open-mbox-file'),
  readMbox: (filePath) => ipcRenderer.invoke('read-mbox', filePath),
  saveAttachment: (data) => ipcRenderer.invoke('save-attachment', data),
});
