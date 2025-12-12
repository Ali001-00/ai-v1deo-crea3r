import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ipcRenderer: {
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        on: (channel, func) => {
            const subscription = (_event, ...args) => func(...args)
            ipcRenderer.on(channel, subscription)
            return () => ipcRenderer.removeListener(channel, subscription)
        }
      }
    })

    contextBridge.exposeInMainWorld('api', {
        generateVoiceOver: (params) => ipcRenderer.invoke('generate-voiceover', params),
        generateText: (params) => ipcRenderer.invoke('generate-text', params),
        generateImage: (params) => ipcRenderer.invoke('generate-image', params),
        generateImageSequence: (params) => ipcRenderer.invoke('generate-image-sequence', params),
        searchStock: (params) => ipcRenderer.invoke('search-stock', params),
        assembleVideo: (params) => ipcRenderer.invoke('assemble-video', params),
        getSettings: (key) => ipcRenderer.invoke('get-settings', key),
        setSettings: (key, value) => ipcRenderer.invoke('set-settings', key, value),
    })

  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
