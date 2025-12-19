const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStatusUpdate: (callback) => {
    ipcRenderer.on('update-status', (_event, message) => callback(message));
  },
  onError: (callback) => {
    ipcRenderer.on('update-error', (_event, message) => callback(message));
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getContentVersion: () => ipcRenderer.invoke('get-content-version')
});

contextBridge.exposeInMainWorld('serviceVersionsAPI', {
  getState: () => ipcRenderer.invoke('service-versions:getState'),
  refresh: () => ipcRenderer.invoke('service-versions:refresh'),
  installOrSync: (tag) => ipcRenderer.invoke('service-versions:install', { tag }),
  startActive: () => ipcRenderer.invoke('service-versions:startActive'),
  stopActive: () => ipcRenderer.invoke('service-versions:stopActive'),
  setRetentionPolicy: (keepCount) => ipcRenderer.invoke('service-versions:setRetentionPolicy', { keepCount }),
  deleteRetainedInstance: (containerId) =>
    ipcRenderer.invoke('service-versions:deleteRetainedInstance', { containerId }),
  updateToLatest: (dataLossAck) => ipcRenderer.invoke('service-versions:updateToLatest', { dataLossAck }),
  activateVersion: (tag, dataLossAck) => ipcRenderer.invoke('service-versions:activate', { tag, dataLossAck }),
  activateRetainedInstance: (containerId, dataLossAck) =>
    ipcRenderer.invoke('service-versions:activateRetainedInstance', { containerId, dataLossAck }),
  cancel: (opId) => ipcRenderer.invoke('service-versions:cancel', { opId }),
  openUi: () => ipcRenderer.invoke('service-versions:openUi'),
  onStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('service-versions:state', listener);
    return () => ipcRenderer.removeListener('service-versions:state', listener);
  },
  onProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('service-versions:progress', listener);
    return () => ipcRenderer.removeListener('service-versions:progress', listener);
  }
});
