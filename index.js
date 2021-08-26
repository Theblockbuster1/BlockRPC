const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');

const Store = require('electron-store');
const store = new Store();

let mainWindow, activityInterval, isQuiting, tray;

function createWindow() {
  app.allowRendererProcessReuse = false;

  mainWindow = new BrowserWindow({
    webPreferences: {
      contextIsolation: false,
      preload: path.join(__dirname, 'renderer.js'),
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'BlockRPC.png'),
    title: 'BlockRPC',
    frame: false
  });

  if (store.get('active')) mainWindow.loadURL(`https://discord.com/developers/applications/${store.get('active')}/rich-presence/visualizer`);
  else mainWindow.loadURL('https://discord.com/developers/applications');

  mainWindow.webContents.on('did-navigate-in-page', (_, url) => {
    if (url.startsWith('https://discord.com/app')) {
      if (store.get('active')) mainWindow.loadURL(`https://discord.com/developers/applications/${store.get('active')}/rich-presence/visualizer`);
      else mainWindow.loadURL('https://discord.com/developers/applications');
    }
    if (url.endsWith('/information')) mainWindow.loadURL(`https://discord.com/developers/applications/${url.match(/https?:\/\/discord\.com\/developers\/applications\/([0-9]+)/i)[1]}/rich-presence/visualizer`);
  });

  mainWindow.on('page-title-updated', (e) => { e.preventDefault(); });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  app.on('before-quit', function () {
    isQuiting = true;
  });  

  tray = new Tray(path.join(__dirname, 'BlockRPC.png'));
  var contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open BlockRPC',
      click: function() {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: function() {
        isQuiting = true;
        app.quit();
      }
    }
  ]);
  tray.setToolTip('BlockRPC');
  tray.setContextMenu(contextMenu);
  tray.on('click', function() {
    mainWindow.show();
  });

  mainWindow.on('close', function(e) {
    if (!isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  ipcMain.on('rpc-load', async function(_, clientId) {
    let dataUnclean = {
      state: await getValue('state'),
      details: await getValue('details'),
      startTimestamp: Number(await getValue('startTimestamp')),
      endTimestamp: Number(await getValue('endTimestamp')),
      largeImageKey: await getValue('largeImageKey'),
      largeImageText: await getValue('largeImageText'),
      smallImageKey: await getValue('smallImageKey'),
      smallImageText: await getValue('smallImageText'),
      instance: false,
      buttons: await getValue('buttons')
    };
    let data = {};
    Object.keys(dataUnclean).forEach(e => {
      if (e == 'buttons' && !dataUnclean[e].length) return;
      if (dataUnclean[e]) data[e] = dataUnclean[e];
    });
    console.log('Loading new presence');
    console.log(data);
    store.set(clientId, data);
    if (store.get('active') != clientId) {
      clearInterval(activityInterval);
      store.set('active', clientId);
      rpc.destroy();
      rpc = new DiscordRPC.Client({ transport: 'ipc' });
      rpc.once('ready', () => {
        setActivity();
        activityInterval = setInterval(async () => {
          setActivity();
        }, 15000);
      });
      rpc.login({ clientId }).catch(console.error);
    }
  });

  ipcMain.on('simulate-type', function(_, keys, modifiers) {
    for (var i = 0; i < keys.length; i++) {
      let modifiersObj = {};
      if (modifiers) if (modifiers[i]) modifiersObj.modifiers = modifiers[i];
      mainWindow.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: keys[i],
        ...modifiersObj
      });
      mainWindow.webContents.sendInputEvent({
        type: 'char',
        keyCode: keys[i],
        ...modifiersObj
      });
      mainWindow.webContents.sendInputEvent({
        type: 'keyup',
        keyCode: keys[i],
        ...modifiersObj
      });
    };
    mainWindow.webContents.send('finish-type');
  });

  ipcMain.on('focus-window', function() {
    mainWindow.focus();
    mainWindow.webContents.send('finish-focus');
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

let rpc = new DiscordRPC.Client({ transport: 'ipc' });

async function setActivity() {
  if (!rpc || !mainWindow) return;
  rpc.setActivity(store.get(store.get('active'))).catch(err => {
    console.error(err);
    mainWindow.webContents.send('error', err);
  });
}

async function getValue(name) {
  if (name == 'largeImageKey') {
    return await mainWindow.webContents.executeJavaScript(`$('label > div:contains("large Image Key")').parent().parent().find('div.select-2TCrqx').text()`);
  } else if (name == 'smallImageKey') {
    return await mainWindow.webContents.executeJavaScript(`$('label > div:contains("small Image Key")').parent().parent().find('div.select-2TCrqx').text()`);
  } else if (name == 'buttons') {
    return await mainWindow.webContents.executeJavaScript('getButtonData()');
  } else {
    return await mainWindow.webContents.executeJavaScript(`$('#app-mount > div > div > div.content-Cehfnq > div.contentWrapper-3RaMY1 > div.scrollerWrap-2lJEkd.scrollerThemed-2oenus.themeGhost-28MSn0 > div > div.contentWrapperInner-15LzPz > div.content-3TNSPU.marginBottomMedium-3rCQQt > div > div > div.flexChild-faoVW3.inputFieldWrapper-3WZuCF.child-3prNf2.columnSpread5-1LazT6.columnSpreadSmall12-1qNVMl.columnSpreadSmallMedium12-3VJcIp.columnSpreadMedium12-3FhN9p > div > div input[name="${name}"]').val()`);
  }
}

rpc.on('ready', () => {
  console.log(store.get(store.get('active')));
  setActivity();

  activityInterval = setInterval(async () => {
    setActivity();
  }, 15000);
});

if (store.get('active')) rpc.login({ clientId: store.get('active') }).catch(console.error);
