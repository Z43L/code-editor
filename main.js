const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production' && process.defaultApp;

let mainWindow;

const sanitizeRelativeDirectory = (relativeDir) => {
  if (typeof relativeDir !== 'string') {
    return 'chats';
  }

  const normalized = relativeDir
    .trim()
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/^\\+/, '')
    .replace(/\\/g, '/');

  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');

  return segments.length > 0 ? segments.join('/') : 'chats';
};

const sanitizeFileName = (fileName) => {
  const fallback = 'chat.md';
  if (!fileName || typeof fileName !== 'string') {
    return fallback;
  }

  const trimmed = fileName.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.replace(/[\\/]/g, '');
  const hasMarkdownExtension = normalized.toLowerCase().endsWith('.md');
  const baseName = hasMarkdownExtension ? normalized.slice(0, -3) : normalized;

  const sanitizedBase = baseName
    .replace(/[^a-z0-9\-_.\s]/gi, '')
    .replace(/\s+/g, '-');

  const finalBase = sanitizedBase || 'chat';
  return `${finalBase}.md`;
};

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[MAIN] Preload script path:', preloadPath);
  console.log('[MAIN] Preload script exists:', fs.existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Code Editor',
    show: false, // Don't show until ready-to-show
    webPreferences: {
      nodeIntegration: false, // Disable for security
      contextIsolation: true, // Enable for security
      enableRemoteModule: false, // Disable for security
      preload: preloadPath, // Use preload script
      webSecurity: true, // Enable web security
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Allow HTTPS requests to external APIs
      webgl: false,
      plugins: false,
      // Enable fetch API for OpenRouter
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false
    }
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus the window to ensure it's interactive
    mainWindow.focus();
    
    // Only open devtools in development mode and when explicitly requested
    if (isDev && process.argv.includes('--dev-tools')) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Set Content Security Policy for better security
  const cspPolicy = isDev 
    ? "default-src 'self' 'unsafe-inline' data: blob: ws: wss: http://localhost:* http://127.0.0.1:* https://va.vercel-scripts.com https://openrouter.ai https://*.openrouter.ai; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:* https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob: http://localhost:* http://127.0.0.1:*; font-src 'self' data: http://localhost:* http://127.0.0.1:*; connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:* https://vercel.live https://*.vercel.app https://va.vercel-scripts.com https://openrouter.ai https://*.openrouter.ai;"
    : "default-src 'self' 'unsafe-inline' data: blob: file: app: https://openrouter.ai https://*.openrouter.ai; script-src 'self' 'unsafe-inline' 'unsafe-eval' file: app: https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' data: file: app:; img-src 'self' data: blob: file: app:; font-src 'self' data: file: app:; connect-src 'self' file: app: https://vercel.live https://*.vercel.app https://va.vercel-scripts.com https://openrouter.ai https://*.openrouter.ai;";

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspPolicy]
      }
    });
  });

  // Also set CSP via session
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({});
  });

  // Configuración para archivos estáticos en producción
  if (!isDev) {
    // Registrar un protocolo personalizado para servir archivos estáticos
    const { protocol } = require('electron');
    
    // Registrar el protocolo file para manejar todos los archivos estáticos
    protocol.interceptFileProtocol('file', (request, callback) => {
      let url = request.url.substr(7); // Eliminar 'file://'
      let finalPath;
      
      console.log('[PROTOCOL] Intercepting file request:', url);
      
      // Manejar rutas de archivos estáticos
      if (url.includes('/_next/') || url.includes('./static/') || url.includes('./chunks/')) {
        // Extraer la parte relativa de la ruta
        let relativePath = url;
        
        // Eliminar cualquier prefijo de ruta absoluta
        if (url.includes(__dirname)) {
          relativePath = url.substring(url.indexOf(__dirname) + __dirname.length);
        }
        
        // Limpiar la ruta relativa
        relativePath = relativePath.replace(/^\/+/, '');
        
        // Construir la ruta absoluta al archivo estático
        finalPath = path.join(__dirname, 'out', relativePath);
        console.log('[PROTOCOL] Static asset path:', finalPath);
      } else if (url.includes('out/index.html')) {
        // Manejar el archivo index.html
        finalPath = path.join(__dirname, 'out/index.html');
        console.log('[PROTOCOL] Index file path:', finalPath);
      } else {
        // Usar la ruta original para otros archivos
        finalPath = url;
        console.log('[PROTOCOL] Other file path:', finalPath);
      }
      
      // Verificar si el archivo existe
      if (fs.existsSync(finalPath)) {
        console.log('[PROTOCOL] File exists:', finalPath);
        callback({ path: finalPath });
      } else {
        console.log('[PROTOCOL] File does not exist:', finalPath);
        // Si el archivo no existe, intentar buscar en otras ubicaciones
        const alternativePath = path.join(__dirname, url);
        if (fs.existsSync(alternativePath)) {
          console.log('[PROTOCOL] Found alternative path:', alternativePath);
          callback({ path: alternativePath });
        } else {
          console.log('[PROTOCOL] No alternative path found, using original:', url);
          callback({ path: url });
        }
      }
    });
  }

  if (isDev) {
    const devPort = process.env.PORT || '3001';
    const devUrl = process.env.DEV_SERVER_URL || `http://localhost:${devPort}`;
    mainWindow.loadURL(devUrl);
  } else {
    // Usar un enfoque más simple para cargar el archivo index.html
    const indexPath = path.join(__dirname, 'out/index.html');
    console.log('[MAIN] Loading index from:', indexPath);
    
    // Verificar que el archivo existe
    if (fs.existsSync(indexPath)) {
      console.log('[MAIN] Index file exists, loading...');
      
      // Cargar el archivo directamente usando loadFile en lugar de loadURL
      // Esto permite que Electron maneje las rutas relativas correctamente
      mainWindow.loadFile(indexPath);
      
      // No abrimos DevTools en producción
      // Solo se abrirán en modo desarrollo cuando se solicite explícitamente
      
      // Agregar un manejador para errores de carga
      mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('[MAIN] Failed to load:', errorCode, errorDescription);
        // Intentar cargar de nuevo con URL absoluta como respaldo
        mainWindow.loadURL(`file://${indexPath}`);
      });
      
      // Registrar cuando la página se ha cargado completamente
      mainWindow.webContents.on('did-finish-load', () => {
        console.log('[MAIN] Page loaded successfully');
      });
    } else {
      console.error('[MAIN] Index file not found at:', indexPath);
      // Mostrar un mensaje de error
      mainWindow.loadURL(`data:text/html,<html><body><h1>Error: No se pudo cargar la aplicación</h1><p>No se encontró el archivo index.html en: ${indexPath}</p></body></html>`);
    }
  }

  // Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Disable CSP warnings in development
  if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  }
  
  // Register custom protocol to handle static files correctly
  if (!isDev) {
    const { protocol } = require('electron');
    
    // Registrar un esquema personalizado para depuración
    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
    ]);
    
    // Register a custom protocol for serving static files
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.substr(6); // Remove 'app://' prefix
      const filePath = path.join(__dirname, 'out', url);
      console.log('[PROTOCOL] app:// request for:', url, 'resolved to:', filePath);
      callback({ path: filePath });
    });
    
    // Intercept file protocol for better static file handling
    protocol.interceptFileProtocol('file', (request, callback) => {
      let url = request.url.substr(7); // Remove 'file://' prefix
      let finalPath;
      
      console.log('[PROTOCOL] Intercepting file:// request for:', url);
      
      // Handle relative paths starting with _next
      if (url.startsWith('_next/') || url.includes('/_next/')) {
        const relativePath = url.startsWith('_next/') ? url : url.substring(url.indexOf('_next/'));
        finalPath = path.join(__dirname, 'out', relativePath);
        console.log('[PROTOCOL] _next path detected, resolving to:', finalPath);
      } else if (url.includes('static/css/') || url.includes('static/js/') || url.includes('static/chunks/')) {
        // Manejar archivos CSS y JavaScript directamente
        const staticPath = url.includes('/out/') ? url : path.join(__dirname, 'out', url);
        finalPath = staticPath;
        console.log('[PROTOCOL] Static asset detected, resolving to:', finalPath);
      } else if (url.includes('out/index.html') || url === path.join(__dirname, 'out/index.html')) {
        // Si es la página principal, asegurarse de que la ruta es correcta
        finalPath = path.join(__dirname, 'out/index.html');
        console.log('[PROTOCOL] Index file detected, resolving to:', finalPath);
      } else {
        finalPath = url;
        console.log('[PROTOCOL] Other file detected, using original path:', finalPath);
      }
      
      // Verificar que el archivo existe
      if (fs.existsSync(finalPath)) {
        console.log('[PROTOCOL] File exists:', finalPath);
      } else {
        console.log('[PROTOCOL] WARNING: File does not exist:', finalPath);
      }
      
      callback({ path: finalPath });
    });
  }
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for secure communication
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (canceled) {
    return null;
  } else {
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      return { path: filePaths[0], content };
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  }
});

ipcMain.handle('dialog:saveFile', async (event, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (canceled) {
    return false;
  } else {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Error saving file:', error);
      return false;
    }
  }
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('window:minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow.close();
});

ipcMain.handle('dialog:openDirectory', async () => {
  console.log('[DEBUG] dialog:openDirectory called');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (canceled) {
    console.log('[DEBUG] Directory selection canceled');
    return null;
  } else {
    try {
      const directoryPath = filePaths[0];
      console.log('[DEBUG] Selected directory:', directoryPath);
      const directoryStructure = await readDirectoryStructure(directoryPath);
      console.log('[DEBUG] Directory structure read, items count:', directoryStructure.length);
        console.log('[DEBUG] First few items:', directoryStructure.slice(0, 3));
        const result = { path: directoryPath, structure: directoryStructure };
        console.log('[DEBUG] Returning result to frontend:', { path: result.path, structureLength: result.structure.length });
        console.log('🚀 [BACKEND] ===== SENDING DATA TO FRONTEND =====');
        console.log('📦 [BACKEND] Result structure sample:', JSON.stringify(result.structure.slice(0, 2), null, 2));
        return result;
    } catch (error) {
      console.error('[ERROR] Error reading directory structure:', error);
      return null;
    }
  }
});

// Test handler for debugging
ipcMain.handle('test:ping', async () => {
  console.log('[DEBUG] Test ping received');
  return { success: true, message: 'Pong from main process', timestamp: Date.now() };
});

// Handler para verificar si un archivo existe
ipcMain.handle('fs:fileExists', async (event, filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return { success: true, exists: true };
  } catch (error) {
    return { success: true, exists: false };
  }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('Error reading file:', filePath, error);
    return { success: false, error: error.message };
  }
});

// Handler para carga lazy de subdirectorios
ipcMain.handle('fs:loadSubdirectory', async (event, dirPath, rootPath) => {
  try {
    console.log('[DEBUG] Loading subdirectory:', dirPath);
    const structure = await readDirectoryStructure(dirPath, {
      maxDepth: 1,
      currentDepth: 0,
      rootPath: rootPath,
      lazyLoad: false, // Cambiar a false para cargar archivos inmediatamente
      includeFileStats: false
    });
    return { success: true, structure };
  } catch (error) {
    console.error('Error loading subdirectory:', dirPath, error);
    return { success: false, error: error.message };
  }
});

// Handler para refrescar la estructura de directorios
ipcMain.handle('fs:readDirectoryStructure', async (event, dirPath) => {
  try {
    console.log('[DEBUG] Refreshing directory structure for:', dirPath);
    const structure = await readDirectoryStructure(dirPath);
    console.log('[DEBUG] Refreshed structure loaded, items count:', structure.length);
    return { success: true, structure };
  } catch (error) {
    console.error('Error refreshing directory structure:', dirPath, error);
    return { success: false, error: error.message };
  }
});

// Handler para obtener estadísticas de archivos
ipcMain.handle('fs:getFileStats', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      success: true,
      stats: {
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      }
    };
  } catch (error) {
    console.error('Error getting file stats:', filePath, error);
    return { success: false, error: error.message };
  }
});

// Handler para búsqueda de archivos
ipcMain.handle('fs:searchFiles', async (event, searchPath, query, options = {}) => {
  try {
    const { maxResults = 100, includeContent = false, fileTypes = [] } = options;
    console.log('[DEBUG] Searching files in:', searchPath, 'query:', query);
    
    const results = [];
    await searchFilesRecursive(searchPath, query, results, maxResults, includeContent, fileTypes);
    
    return { success: true, results };
  } catch (error) {
    console.error('Error searching files:', error);
    return { success: false, error: error.message };
  }
});

// Función auxiliar para búsqueda recursiva
async function searchFilesRecursive(dirPath, query, results, maxResults, includeContent, fileTypes, depth = 0) {
  if (results.length >= maxResults || depth > 10) return;
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      
      if (shouldIgnoreEntry(entry.name, entry.isDirectory())) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        const matchesName = entry.name.toLowerCase().includes(query.toLowerCase());
        const matchesType = fileTypes.length === 0 || fileTypes.includes(path.extname(entry.name).toLowerCase());
        
        if (matchesName && matchesType) {
          const result = {
            name: entry.name,
            path: fullPath,
            type: 'file',
            extension: path.extname(entry.name)
          };
          
          if (includeContent) {
            try {
              const content = await fs.promises.readFile(fullPath, 'utf-8');
              if (content.toLowerCase().includes(query.toLowerCase())) {
                result.content = content;
                result.matchType = 'content';
              }
            } catch (error) {
              // Ignore files that can't be read as text
            }
          }
          
          results.push(result);
        }
      } else if (entry.isDirectory()) {
        await searchFilesRecursive(fullPath, query, results, maxResults, includeContent, fileTypes, depth + 1);
      }
    }
  } catch (error) {
    console.warn('Error reading directory during search:', dirPath, error);
  }
}

// Function to recursively read directory structure
// Cache para directorios ya leídos
const directoryCache = new Map();
const CACHE_EXPIRY = 30000; // 30 segundos

// Filtros optimizados para archivos y directorios a ignorar
const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', '.git', '.svn', '.hg',
  'coverage', '.nyc_output', '.cache', 'tmp', 'temp', '.tmp',
  'vendor', 'target', 'bin', 'obj', '.gradle', '.idea', '.vscode'
]);

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitignore', '.gitkeep',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
]);

async function readDirectoryStructure(dirPath, options = {}) {
  const {
    maxDepth = Infinity, // Eliminamos la limitación de profundidad
    currentDepth = 0,
    rootPath = null,
    lazyLoad = false, // Deshabilitamos lazy loading para cargar todo
    includeFileStats = false,
    maxFiles = 10000 // Aumentamos el límite de archivos
  } = options;

  if (currentDepth >= maxDepth) return [];
  
  // Set root path on first call
  const actualRootPath = rootPath || dirPath;
  if (rootPath === null) {
    console.log('[DEBUG] readDirectoryStructure starting with root:', actualRootPath);
  }

  // Check cache first
  const cacheKey = `${dirPath}:${currentDepth}:${maxDepth}`;
  const cached = directoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    console.log('[DEBUG] Using cached result for:', dirPath);
    return cached.data;
  }
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    console.log('[DEBUG] Reading directory:', dirPath, 'found', entries.length, 'entries');
    
    const structure = [];
    let fileCount = 0;
    
    // Procesar directorios primero para mejor UX
    const directories = entries.filter(entry => entry.isDirectory() && !shouldIgnoreEntry(entry.name, true));
    const files = entries.filter(entry => entry.isFile() && !shouldIgnoreEntry(entry.name, false));
    
    // Procesar directorios
    for (const entry of directories) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(actualRootPath, fullPath);
      
      let children = [];
      let hasChildren = false;
      
      // Siempre cargar hijos recursivamente para todos los niveles
      try {
        children = await readDirectoryStructure(fullPath, {
          ...options,
          currentDepth: currentDepth + 1,
          rootPath: actualRootPath
        });
        hasChildren = children.length > 0;
      } catch (error) {
        console.warn('[WARN] Could not read subdirectory:', fullPath, error);
        children = [];
        hasChildren = false;
      }
      
      structure.push({
        name: entry.name,
        type: 'directory',
        path: relativePath,
        fullPath: fullPath,
        children: children,
        hasChildren: hasChildren,
        isExpanded: true, // Auto-expandir todos los niveles
        isLoaded: true // Marcar todos como cargados
      });
    }
    
    // Procesar archivos con límite
    for (const entry of files) {
      if (fileCount >= maxFiles) {
        console.log('[DEBUG] File limit reached, stopping at:', maxFiles);
        break;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(actualRootPath, fullPath);

      const fileInfo = {
        name: entry.name,
        type: 'file',
        path: relativePath,
        fullPath: fullPath
      };

      let stats = null;
      try {
        stats = await fs.promises.stat(fullPath);
      } catch (error) {
        console.warn('[WARN] Could not get stats for file:', fullPath, error.message);
      }

      if (stats) {
        // Incluir estadísticas del archivo si se solicita
        if (includeFileStats) {
          fileInfo.size = stats.size;
          fileInfo.modified = stats.mtime;
          fileInfo.extension = path.extname(entry.name).toLowerCase();
        }

        const contextMetadata = await generateFileContextMetadata(fullPath, relativePath, entry.name, stats);
        if (contextMetadata) {
          fileInfo.context = contextMetadata;
        }
      }

      structure.push(fileInfo);
      fileCount++;
    }
    
    // Sort optimizado: directorios primero, luego archivos, ambos alfabéticamente
    const sortedStructure = structure.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    // Cache del resultado
    directoryCache.set(cacheKey, {
      data: sortedStructure,
      timestamp: Date.now()
    });
    
    return sortedStructure;
  } catch (error) {
    console.error('Error reading directory:', dirPath, error);
    return [];
  }
}

function shouldIgnoreEntry(name, isDirectory) {
  if (name.startsWith('.') && name !== '.env') return true;
  if (isDirectory) return IGNORED_DIRS.has(name);
  return IGNORED_FILES.has(name);
}

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.c', '.h', '.cpp', '.hpp', '.java', '.py', '.rb',
  '.go', '.rs', '.swift', '.php', '.cs', '.kt', '.kts', '.scala', '.sql', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.css',
  '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.svg', '.env', '.gitignore'
]);

const CONTEXT_PREVIEW_BYTES = 16 * 1024; // 16KB preview for summaries
const CONTEXT_HASH_SAMPLE_BYTES = 64 * 1024; // Sample up to 64KB for hashing
const SUMMARY_MAX_LINES = 12;
const SUMMARY_MAX_LENGTH = 600;

async function generateFileContextMetadata(fullPath, relativePath, displayName, stats) {
  try {
    const extension = path.extname(fullPath).toLowerCase();
    const metadata = {
      path: relativePath,
      name: displayName,
      extension,
      size: stats.size,
      modified: stats.mtimeMs
    };

    const isTextFile = isLikelyTextFile(extension, stats.size);

    const signature = await computeFileSignature(fullPath, stats);
    if (signature) {
      metadata.hash = signature;
    }

    if (!isTextFile || stats.size === 0) {
      return metadata;
    }

    const snippet = await readFileSnippet(fullPath, Math.min(CONTEXT_PREVIEW_BYTES, stats.size));
    if (snippet) {
      metadata.preview = snippet;
      metadata.summary = createSummaryFromContent(snippet);
      metadata.lineCount = snippet.split(/\r?\n/).length;
    }

    return metadata;
  } catch (error) {
    console.warn('[WARN] Could not generate context metadata for file:', fullPath, error.message);
    return null;
  }
}

function isLikelyTextFile(extension, fileSize) {
  if (TEXT_FILE_EXTENSIONS.has(extension)) {
    return true;
  }
  // Assume small files are text by default
  return fileSize <= 8 * 1024;
}

async function readFileSnippet(fullPath, length) {
  try {
    const fileHandle = await fs.promises.open(fullPath, 'r');
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fileHandle.read(buffer, 0, length, 0);
    await fileHandle.close();
    return buffer.slice(0, bytesRead).toString('utf-8');
  } catch (error) {
    console.warn('[WARN] Could not read snippet for file:', fullPath, error.message);
    return '';
  }
}

async function computeFileSignature(fullPath, stats) {
  try {
    if (stats.size === 0) {
      return 'empty';
    }

    const hash = crypto.createHash('sha1');
    const sampleEnd = Math.min(stats.size - 1, CONTEXT_HASH_SAMPLE_BYTES - 1);
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(fullPath, { start: 0, end: sampleEnd });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    return `${hash.digest('hex')}:${stats.size}:${stats.mtimeMs}`;
  } catch (error) {
    console.warn('[WARN] Could not hash file for context metadata:', fullPath, error.message);
    return `size:${stats.size}|mtime:${stats.mtimeMs}`;
  }
}

function createSummaryFromContent(content) {
  if (!content) {
    return '';
  }

  const normalized = content.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n').slice(0, SUMMARY_MAX_LINES);
  const joined = lines.join('\n');
  if (joined.length <= SUMMARY_MAX_LENGTH) {
    return joined;
  }
  return `${joined.slice(0, SUMMARY_MAX_LENGTH)}…`;
}

// Handler para crear archivos
ipcMain.handle('fs:createFile', async (event, filePath, content = '') => {
  try {
    console.log('[DEBUG] Creating file:', filePath);
    
    // Verificar si el archivo ya existe
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return { success: false, error: 'El archivo ya existe' };
    } catch (error) {
      // El archivo no existe, podemos crearlo
    }
    
    // Crear el directorio padre si no existe
    const dirPath = path.dirname(filePath);
    await fs.promises.mkdir(dirPath, { recursive: true });
    
    // Crear el archivo
    await fs.promises.writeFile(filePath, content, 'utf-8');
    
    console.log('[DEBUG] File created successfully:', filePath);
    return { success: true, filePath };
  } catch (error) {
    console.error('Error creating file:', filePath, error);
    return { success: false, error: error.message };
  }
});

// Handler para crear directorios
ipcMain.handle('fs:createDirectory', async (event, dirPath) => {
  try {
    console.log('[DEBUG] Creating directory:', dirPath);
    
    // Verificar si el directorio ya existe
    try {
      const stats = await fs.promises.stat(dirPath);
      if (stats.isDirectory()) {
        return { success: false, error: 'El directorio ya existe' };
      }
    } catch (error) {
      // El directorio no existe, podemos crearlo
    }
    
    // Crear el directorio
    await fs.promises.mkdir(dirPath, { recursive: true });
    
    console.log('[DEBUG] Directory created successfully:', dirPath);
    return { success: true, dirPath };
  } catch (error) {
    console.error('Error creating directory:', dirPath, error);
    return { success: false, error: error.message };
  }
});

// Handler para mover archivos y directorios
ipcMain.handle('fs:moveFileOrDirectory', async (event, sourcePath, destPath) => {
  try {
    console.log('[DEBUG] Moving from:', sourcePath, 'to:', destPath);
    
    // Verificar que el archivo/directorio origen existe
    try {
      await fs.promises.access(sourcePath, fs.constants.F_OK);
    } catch (error) {
      return { success: false, error: 'El archivo o directorio origen no existe' };
    }
    
    // Verificar que el destino no existe
    try {
      await fs.promises.access(destPath, fs.constants.F_OK);
      return { success: false, error: 'Ya existe un archivo o directorio con ese nombre en el destino' };
    } catch (error) {
      // El destino no existe, podemos mover
    }
    
    // Crear el directorio padre del destino si no existe
    const destDir = path.dirname(destPath);
    await fs.promises.mkdir(destDir, { recursive: true });
    
    // Mover el archivo o directorio
    await fs.promises.rename(sourcePath, destPath);
    
    console.log('[DEBUG] File/directory moved successfully from:', sourcePath, 'to:', destPath);
    return { success: true, sourcePath, destPath };
  } catch (error) {
    console.error('Error moving file/directory:', sourcePath, 'to:', destPath, error);
    return { success: false, error: error.message };
  }
});

// Handler para crear carpeta de chats
ipcMain.handle('fs:createChatsFolder', async (event, workspacePath, relativeDir = 'chats') => {
  try {
    const safeRelativeDir = sanitizeRelativeDirectory(relativeDir);
    const chatsPath = path.join(workspacePath, safeRelativeDir);
    console.log('[DEBUG] Creating chats folder at:', chatsPath);
    
    // Verificar si la carpeta ya existe
    try {
      await fs.promises.access(chatsPath, fs.constants.F_OK);
      console.log('[DEBUG] Chats folder already exists');
      return { success: true, path: chatsPath, created: false, relativePath: safeRelativeDir };
    } catch (error) {
      // La carpeta no existe, crearla
      await fs.promises.mkdir(chatsPath, { recursive: true });
      console.log('[DEBUG] Chats folder created successfully');
      return { success: true, path: chatsPath, created: true, relativePath: safeRelativeDir };
    }
  } catch (error) {
    console.error('Error creating chats folder:', error);
    return { success: false, error: error.message };
  }
});

// Handler para guardar conversación en archivo MD
ipcMain.handle('fs:saveChatToFile', async (event, workspacePath, relativeDir = 'chats', fileName, content) => {
  try {
    const safeRelativeDir = sanitizeRelativeDirectory(relativeDir);
    const chatsPath = path.join(workspacePath, safeRelativeDir);
    
    // Asegurar que la carpeta chats existe
    try {
      await fs.promises.access(chatsPath, fs.constants.F_OK);
    } catch (error) {
      await fs.promises.mkdir(chatsPath, { recursive: true });
    }
    
    const fullFileName = sanitizeFileName(fileName);
    const filePath = path.join(chatsPath, fullFileName);
    
    console.log('[DEBUG] Saving chat to:', filePath);
    
    // Guardar el archivo
    await fs.promises.writeFile(filePath, content, 'utf-8');
    
    return { 
      success: true, 
      filePath: filePath,
      fileName: fullFileName,
      relativePath: path.join(safeRelativeDir, fullFileName)
    };
  } catch (error) {
    console.error('Error saving chat file:', error);
    return { success: false, error: error.message };
  }
});

// Handler para listar archivos de chat existentes
ipcMain.handle('fs:listChatFiles', async (event, workspacePath, relativeDir = 'chats') => {
  try {
    const safeRelativeDir = sanitizeRelativeDirectory(relativeDir);
    const chatsPath = path.join(workspacePath, safeRelativeDir);
    
    // Verificar si la carpeta existe
    try {
      await fs.promises.access(chatsPath, fs.constants.F_OK);
    } catch (error) {
      return { success: true, files: [] };
    }
    
    const files = await fs.promises.readdir(chatsPath);
    const chatFiles = files
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        name: file,
        path: path.join(chatsPath, file),
        relativePath: path.join(safeRelativeDir, file)
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Ordenar por fecha (más reciente primero)
    
    return { success: true, files: chatFiles };
  } catch (error) {
    console.error('Error listing chat files:', error);
    return { success: false, error: error.message };
  }
});

// Handler para leer contenido de un archivo de chat
ipcMain.handle('fs:readChatFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('Error reading chat file:', filePath, error);
    return { success: false, error: error.message };
  }
});