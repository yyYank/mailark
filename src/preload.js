const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openMboxFile: () => ipcRenderer.invoke('open-mbox-file'),
  readMbox: (filePath) => ipcRenderer.invoke('read-mbox', filePath),
  getEmailDetail: (id) => ipcRenderer.invoke('get-email-detail', id),
  searchEmails: (query) => ipcRenderer.invoke('search-emails', query),
  saveAttachment: (data) => ipcRenderer.invoke('save-attachment', data),
});
