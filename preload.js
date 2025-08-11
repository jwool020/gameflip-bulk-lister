const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectCsvFile: () => ipcRenderer.invoke('select-csv-file'),
    readCsvFile: (filePath) => ipcRenderer.invoke('read-csv-file', filePath),
    startListing: (csvFilePath, apiKey, apiSecret, delayMs) => ipcRenderer.invoke('start-listing', csvFilePath, apiKey, apiSecret, delayMs),
    saveCredentials: (key, secret) => ipcRenderer.invoke('save-credentials', key, secret),
    loadCredentials: () => ipcRenderer.invoke('load-credentials'),
    stopListing: () => ipcRenderer.send('stop-listing'), 
    onListingProgress: (callback) => ipcRenderer.on('listing-progress', (_event, value) => callback(value))
});