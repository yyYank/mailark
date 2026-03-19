import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openMboxFile: () => ipcRenderer.invoke('open-mbox-file'),
  readMbox: (filePath: string) => ipcRenderer.invoke('read-mbox', filePath),
  getEmailDetail: (id: string) => ipcRenderer.invoke('get-email-detail', id),
  searchEmails: (params: unknown) => ipcRenderer.invoke('search-emails', params),
  saveAttachment: (data: unknown) => ipcRenderer.invoke('save-attachment', data),
  onLoadProgress: (cb: (data: unknown) => void) => ipcRenderer.on('load-progress', (_event, data) => cb(data)),
  offLoadProgress: () => ipcRenderer.removeAllListeners('load-progress'),
});
