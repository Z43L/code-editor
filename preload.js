const { contextBridge, ipcRenderer } = require('electron');

console.log('[PRELOAD] Preload script is loading...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  openDirectory: async () => {
    console.log('🔍 [PRELOAD] Calling dialog:openDirectory...');
    const result = await ipcRenderer.invoke('dialog:openDirectory');
    console.log('📦 [PRELOAD] Received result:', result ? 'DATA RECEIVED' : 'NULL');
    if (result) {
      console.log('📊 [PRELOAD] Structure length:', result.structure?.length);
      console.log('📁 [PRELOAD] Path:', result.path);
    }
    return result;
  },
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),
  readDirectoryStructure: async (dirPath) => {
    console.log('🔄 [PRELOAD] Refreshing directory structure:', dirPath);
    const result = await ipcRenderer.invoke('fs:readDirectoryStructure', dirPath);
    console.log('📦 [PRELOAD] Directory structure refreshed:', result.success ? `${result.structure?.length} items` : 'FAILED');
    return result;
  },
  
  // Nuevas APIs optimizadas
  loadSubdirectory: async (dirPath, rootPath) => {
    console.log('🔍 [PRELOAD] Loading subdirectory:', dirPath);
    const result = await ipcRenderer.invoke('fs:loadSubdirectory', dirPath, rootPath);
    console.log('📦 [PRELOAD] Subdirectory loaded:', result.success ? 'SUCCESS' : 'FAILED');
    return result;
  },
  
  getFileStats: (filePath) => ipcRenderer.invoke('fs:getFileStats', filePath),
  
  searchFiles: async (searchPath, query, options = {}) => {
    console.log('🔍 [PRELOAD] Searching files:', query, 'in', searchPath);
    const result = await ipcRenderer.invoke('fs:searchFiles', searchPath, query, options);
    console.log('📦 [PRELOAD] Search completed:', result.success ? `${result.results?.length} results` : 'FAILED');
    return result;
  },
  
  // File and directory creation
  createFile: async (filePath, content = '') => {
    console.log('📄 [PRELOAD] Creating file:', filePath);
    const result = await ipcRenderer.invoke('fs:createFile', filePath, content);
    console.log('📦 [PRELOAD] File creation:', result.success ? 'SUCCESS' : 'FAILED');
    return result;
  },
  
  createDirectory: async (dirPath) => {
    console.log('📁 [PRELOAD] Creating directory:', dirPath);
    const result = await ipcRenderer.invoke('fs:createDirectory', dirPath);
    console.log('📦 [PRELOAD] Directory creation:', result.success ? 'SUCCESS' : 'FAILED');
    return result;
  },
  
  moveFileOrDirectory: async (sourcePath, destPath) => {
    console.log('🔄 [PRELOAD] Moving from:', sourcePath, 'to:', destPath);
    const result = await ipcRenderer.invoke('fs:moveFileOrDirectory', sourcePath, destPath);
    console.log('📦 [PRELOAD] Move operation:', result.success ? 'SUCCESS' : 'FAILED');
    return result;
  },
  
  // Chat management APIs
  createChatsFolder: async (workspacePath, relativeDir = 'chats') => {
    console.log('📁 [PRELOAD] Creating chats folder in:', workspacePath, 'dir:', relativeDir);
    const result = await ipcRenderer.invoke('fs:createChatsFolder', workspacePath, relativeDir);
    console.log('📦 [PRELOAD] Chats folder:', result.success ? (result.created ? 'CREATED' : 'EXISTS') : 'FAILED');
    return result;
  },
  
  saveChatToFile: async (workspacePath, relativeDir, fileName, content) => {
    console.log('💾 [PRELOAD] Saving chat:', fileName, 'dir:', relativeDir);
    const result = await ipcRenderer.invoke('fs:saveChatToFile', workspacePath, relativeDir, fileName, content);
    console.log('📦 [PRELOAD] Chat saved:', result.success ? result.fileName : 'FAILED');
    return result;
  },
  
  listChatFiles: async (workspacePath, relativeDir = 'chats') => {
    console.log('📋 [PRELOAD] Listing chat files in:', workspacePath, 'dir:', relativeDir);
    const result = await ipcRenderer.invoke('fs:listChatFiles', workspacePath, relativeDir);
    console.log('📦 [PRELOAD] Chat files found:', result.success ? result.files?.length : 'FAILED');
    return result;
  },
  
  readChatFile: async (filePath) => {
    console.log('📖 [PRELOAD] Reading chat file:', filePath);
    const result = await ipcRenderer.invoke('fs:readChatFile', filePath);
    console.log('📦 [PRELOAD] Chat file read:', result.success ? 'SUCCESS' : 'FAILED');
    return result;
  },
  
  testPing: () => ipcRenderer.invoke('test:ping'),
  
  // App information
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  
  // Platform detection
  platform: process.platform,
  
  // Check if running in Electron
  isElectron: true
});

console.log('[PRELOAD] electronAPI exposed successfully:', Object.keys(window.electronAPI || {}));

// Remove the loading text when the page is ready
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});