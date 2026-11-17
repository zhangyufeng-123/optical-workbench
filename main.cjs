const { app, BrowserWindow, Menu, dialog, shell, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { registerAIService } = require('./ai-service.cjs');

const webRoot = path.join(__dirname, 'web');
let mainWindow;

function isLocalPage(url) {
  try {
    const relative = path.relative(webRoot, fileURLToPath(url));
    return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function configureWindow(window) {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isLocalPage(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalPage(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 850,
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') }
        }
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('did-create-window', configureWindow);
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      dialog.showErrorBox('光学光路设计台', '界面进程已退出，请重新打开程序。已自动暂存的工程会在下次启动时恢复。');
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '光学光路设计台 V5.9',
    width: 1500,
    height: 960,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#edf1f3',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') }
  });
  configureWindow(mainWindow);
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: '保存导出文件', defaultPath: item.getFilename() });
    item.on('done', (_doneEvent, state) => {
      if (state === 'interrupted') dialog.showErrorBox('导出失败', '文件保存中断，请检查目标文件夹后重新导出。');
    });
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(webRoot, '打开光纤实验搭建台.html')).catch(error => {
    dialog.showErrorBox('启动失败', error.message);
    app.quit();
  });
}

app.setName('光学光路设计台');
const profilePath = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profilePath || path.join(app.getPath('appData'), 'OpticalWorkbenchDesktop'));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerAIService(ipcMain, { userDataPath: app.getPath('userData'), safeStorage }, event =>
      Boolean(event.senderFrame && event.senderFrame === event.sender.mainFrame && isLocalPage(event.senderFrame.url))
    );
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
