const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let menuWindow;
let petWindow;
let petInterval;

function createMenuWindow() {
  menuWindow = new BrowserWindow({
    width: 300,
    height: 300,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: "Potato Pet Menu"
  });

  menuWindow.loadFile('index.html');

  menuWindow.on('closed', () => {
    menuWindow = null;
    const config = loadConfig();
    if (!config.alwaysOn && petWindow) {
      petWindow.close();
      stopSmallPotatoes();
    }
  });
}

function createPetWindow() {
  if (petWindow) return; // Already exists

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  petWindow = new BrowserWindow({
    width: 100,
    height: 100,
    x: width / 2,
    y: height / 2,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  petWindow.loadFile('pet.html');
  petWindow.setIgnoreMouseEvents(true);

  petWindow.on('closed', () => {
    petWindow = null;
    clearInterval(petInterval);
    clearTimeout(jumpTimeout);
  });

  startPetMovement();
  scheduleRandomJump();
}

let jumpTimeout;
let isMoving = false;

function scheduleRandomJump() {
  // Random time between 1s and 10s
  const minTime = 1000;
  const maxTime = 10000;
  const randomTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;

  jumpTimeout = setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed()) {
      if (!isMoving) { // Only jump if not running
        performJump();
        // Wait for jump to finish (200ms) before scheduling next to avoid overlap
        setTimeout(scheduleRandomJump, 200);
      } else {
        scheduleRandomJump(); // Schedule next likelihood
      }
    }
  }, randomTime);
}

function performJump() {
  if (!petWindow) return;

  // Simple jump
  const bounds = petWindow.getBounds();
  const jumpHeight = 30;
  const originalY = bounds.y;

  // Sound removed as requested
  // petWindow.webContents.send('play-sound');

  // Up
  petWindow.setBounds({ y: originalY - jumpHeight });

  // Down after 200ms
  setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed()) {

      // Re-check bounds in case it moved (?) - usually fine for simple jump
      // To be safe, just set Y back if X hasn't changed drastically?
      // Or just restore originalY if we assume no movement during jump.
      // But let's just use setBounds with current X.
      const current = petWindow.getBounds();
      petWindow.setBounds({ y: originalY, x: current.x });
    }
  }, 200);
}

function startPetMovement() {
  let lastCursorPos = screen.getCursorScreenPoint();

  petInterval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;

    try {
      const cursor = screen.getCursorScreenPoint();
      const petBounds = petWindow.getBounds();

      // Calculate cursor velocity
      const cursorDx = cursor.x - lastCursorPos.x;
      lastCursorPos = cursor;

      // Target position logic:
      // Default: To the right (cursor.x + 30)
      // If cursor moving right (cursorDx > 0), lag behind on left (cursor.x - 50)
      // If cursor moving right (cursorDx > 0), lag behind on left (cursor.x - 50)

      let targetOffsetX = 30; // Default right

      const sensitivity = 5; // Movement threshold
      if (cursorDx > sensitivity) {
        targetOffsetX = -60; // Switch to left while moving right
      } else if (cursorDx < -sensitivity) {
        targetOffsetX = 50; // Stay on right (or exaggerate) while moving left
      }

      // Smooth transition for the offset could be nice, but instant switch is more responsive to "while running"

      const targetX = cursor.x + targetOffsetX;
      const targetY = cursor.y - 20;

      const currentX = petBounds.x;
      const currentY = petBounds.y;

      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

      // Move only if not already at target (threshold 5px)
      if (distanceToTarget > 15) {
        isMoving = true;

        // Fluid follow
        const lerpFactor = 0.1; // Slightly looser to allow the "catch up" effect to be visible

        const newX = currentX + dx * lerpFactor;
        const newY = currentY + dy * lerpFactor;

        petWindow.setBounds({
          x: Math.round(newX),
          y: Math.round(newY),
          width: 100,
          height: 100
        });

        // Determine direction based on movement relative to pet
        // If pet is moving right (dx > 0), face right.
        const direction = (newX - currentX) > 0 ? 'right' : 'left';
        petWindow.webContents.send('pet-state', 'running', direction);
      } else {
        isMoving = false;
        // Close enough to target, stop running
        petWindow.webContents.send('pet-state', 'idle');
      }

    } catch (e) {
      console.error("Error moving pet:", e);
    }
  }, 16);
}


app.whenReady().then(() => {
  const config = loadConfig();

  // If Always On OR previously running, start pet immediately
  if (config.alwaysOn || config.isRunning) {
    createPetWindow();
    createSmallPotatoes();
  }

  createMenuWindow();

  // Ensure login item settings are synced (optional, but good practice)
  app.setLoginItemSettings({
    openAtLogin: config.alwaysOn,
    path: process.execPath,
    args: [path.resolve(__dirname)]
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMenuWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.on('toggle-pet', (event, shouldStart) => {
  const config = loadConfig();
  config.isRunning = shouldStart;

  if (shouldStart) {
    createPetWindow();
    createSmallPotatoes();
    // If we start explicitly, maybe we should enable Always On if it was off? 
    // User requested: "if i close it activated it should be opened again altready activated"
    // So just creating the window is enough, but saving state is key.
  } else {
    if (petWindow) {
      petWindow.close();
    }
    stopSmallPotatoes();
    // Use requested: "user should be able to deactivate it"
    // If we stop explicitly, we should probably disable Always On to prevent confusion
    if (config.alwaysOn) {
      config.alwaysOn = false;
      // Also update login settings
      app.setLoginItemSettings({
        openAtLogin: false,
        path: process.execPath,
        args: [path.resolve(__dirname)]
      });
      // Notify renderer to uncheck box? 
      // We can send 'settings-updated' back if needed, or let renderer handle it.
      if (menuWindow && !menuWindow.isDestroyed()) {
        menuWindow.webContents.send('settings-updated', config);
      }
    }
  }
  saveConfig(config);
});

// Settings Handling
const fs = require('fs');
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath);
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading config:", e);
  }
  return { alwaysOn: true, isRunning: true }; // Default
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {
    console.error("Error saving config:", e);
  }
}

ipcMain.on('get-settings', (event) => {
  const config = loadConfig();
  event.sender.send('settings-updated', config);
  // Send current size too (default 100 if not set)
  event.sender.send('size-updated', config.potatoSize || 100);
  event.sender.send('count-updated', config.potatoCount !== undefined ? config.potatoCount : 4);
});

ipcMain.on('toggle-always-on', (event, isAlwaysOn) => {
  const config = loadConfig();
  config.alwaysOn = isAlwaysOn;

  // "when i toggle the box to activate the always on display, the small potatoes should also be added."
  // implies turning Always On -> Starts everything.
  if (isAlwaysOn) {
    config.isRunning = true;
    createPetWindow();
    createSmallPotatoes();
  }
  // If disabling Always On, do we stop? User didn't explicitly say "stop when disabled", 
  // but "user should be able to deactivate it". Usually toggling off Always On just means "don't start on boot".
  // But for consistency with "Start/Stop" button, maybe we just leave it running until they click Stop?
  // User said: "toggle the box ... small potatoes added ... button started".
  // So Toggling ON -> Start. Toggling OFF -> Just disable auto-start? Or Stop?
  // Let's assume Toggling OFF just affects boot, unless they explicitly click Stop. 
  // HOWEVER, the user said "button should be started" when toggling ON.

  saveConfig(config);

  app.setLoginItemSettings({
    openAtLogin: isAlwaysOn,
    path: process.execPath,
    args: [path.resolve(__dirname)]
  });

  // If enabled, ensure pet is running (Already done above)
});

ipcMain.on('update-potato-size', (event, size) => {
  const config = loadConfig();
  config.potatoSize = size;
  saveConfig(config);

  // Update runtime variable
  currentPotatoSize = size;

  // Force update all potatoes immediately
  if (smallPotatoes.length > 0) {
    smallPotatoes.forEach(p => {
      if (!p.win.isDestroyed()) {
        p.win.setBounds({
          x: Math.round(p.state.x),
          // Recalculate Y based on bottom alignment with new size
          y: Math.round(screen.getPrimaryDisplay().workArea.y + screen.getPrimaryDisplay().workArea.height - currentPotatoSize + (isSitting(p) ? getSitOffset() : 0)),
          width: currentPotatoSize,
          height: currentPotatoSize
        });
        // Update internal state y to match new baseline
        p.state.y = screen.getPrimaryDisplay().workArea.y + screen.getPrimaryDisplay().workArea.height - currentPotatoSize;
      }
    });
  }
});

// --- Small Potatoes Logic ---

let smallPotatoes = []; // Array of { win, state, type, id, offset }
let smallPotatoInterval;

let currentPotatoSize = 100; // Default

function getSitOffset() {
  return currentPotatoSize * 0.2; // 20% of height
}

function isSitting(p) {
  return !p.state.isMoving;
}

ipcMain.on('update-potato-count', (event, count) => {
  const config = loadConfig();
  config.potatoCount = count;
  saveConfig(config);

  // Only adjust if pet is running
  if (petWindow && !petWindow.isDestroyed()) {
    adjustSmallPotatoCount(count);
  }
});

function adjustSmallPotatoCount(targetCount) {
  const currentCount = smallPotatoes.length;

  if (targetCount > currentCount) {
    // Add potatoes
    const countToAdd = targetCount - currentCount;
    for (let i = 0; i < countToAdd; i++) {
      addSinglePotato();
    }
  } else if (targetCount < currentCount) {
    // Remove potatoes
    const countToRemove = currentCount - targetCount;
    for (let i = 0; i < countToRemove; i++) {
      removeSinglePotato();
    }
  }
}

function addSinglePotato() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  // Simple alternation based on current count
  const type = (smallPotatoes.length % 2) === 0 ? 1 : 2;

  // Assign a unique offset relative to cursor
  // Alternate sides:
  // Potato 0: -60 (Left)
  // Potato 1: +60 (Right)
  // Potato 2: -120
  // Potato 3: +120
  const pairIndex = Math.floor(smallPotatoes.length / 2);
  const side = (smallPotatoes.length % 2 === 0) ? -1 : 1;
  const offset = side * (60 + (pairIndex * 50)); // Spaced out

  const maxX = workArea.width - currentPotatoSize;
  const randomX = Math.floor(Math.random() * maxX);

  const state = {
    x: randomX,
    y: workArea.y + workArea.height - currentPotatoSize + getSitOffset(),
    direction: type === 1 ? 'right' : 'left',
    action: 'idle',
    offset: offset,
    isMoving: false
  };

  const win = new BrowserWindow({
    width: currentPotatoSize,
    height: currentPotatoSize,
    x: Math.round(state.x),
    y: Math.round(state.y),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('small_potato.html');
  win.setIgnoreMouseEvents(true);

  const maxId = smallPotatoes.reduce((max, p) => Math.max(max, p.id), -1);
  const newId = maxId + 1;

  const potatoObj = { win, state, type: type, id: newId };
  smallPotatoes.push(potatoObj);

  win.webContents.once('did-finish-load', () => {
    const img = type === 1 ? '1.png' : '2.png';
    win.webContents.send('set-image', path.join(__dirname, 'assets', img));
    if (type === 2) win.webContents.send('set-direction', 'left');
  });

  win.on('closed', () => {
    // Remove from array if closed individually
    const idx = smallPotatoes.findIndex(p => p.id === potatoObj.id);
    if (idx !== -1) smallPotatoes.splice(idx, 1);
  });

  // Jump removed

}

function removeSinglePotato() {
  if (smallPotatoes.length === 0) return;

  const potatoToRemove = smallPotatoes.pop();
  if (potatoToRemove && potatoToRemove.win && !potatoToRemove.win.isDestroyed()) {
    potatoToRemove.win.close();
  }
}


function createSmallPotatoes() {
  if (smallPotatoes.length > 0) return;

  const config = loadConfig();
  currentPotatoSize = config.potatoSize || 100;

  // Default to 4 if not set
  const count = config.potatoCount !== undefined ? config.potatoCount : 4;

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  for (let i = 0; i < count; i++) {
    addSinglePotato();
  }

  startSmallPotatoLoop();
}

function startSmallPotatoLoop() {
  if (smallPotatoInterval) clearInterval(smallPotatoInterval);

  smallPotatoInterval = setInterval(() => {
    if (smallPotatoes.length === 0) return;
    updateSmallPotatoesMovement();
  }, 16); // 60 FPS for smooth movement
}

function stopSmallPotatoes() {
  if (smallPotatoInterval) {
    clearInterval(smallPotatoInterval);
    smallPotatoInterval = null;
  }

  // Make a copy to iterate because 'closed' handler modifies array
  const potatoesToClose = [...smallPotatoes];
  potatoesToClose.forEach(p => {
    if (p.win && !p.win.isDestroyed()) p.win.close();
    if (p.jumpTimeout) clearTimeout(p.jumpTimeout);
  });
  smallPotatoes = [];
}

function updateSmallPotatoesMovement() {
  // Check if cursor available (screen might be off/locked)
  let cursor;
  try {
    cursor = screen.getCursorScreenPoint();
  } catch (e) { return; }

  const workArea = screen.getPrimaryDisplay().workArea;
  const baseY = workArea.y + workArea.height - currentPotatoSize;

  // Interaction logic helper
  const tryInteract = (p1) => {
    if (p1.type !== 1) return;
    if (p1.state.action === 'interacting' || p1.state.isFleeing) return;

    // Find a close Type 2
    const p2 = smallPotatoes.find(p => p.type === 2 && p.state.action !== 'interacting' && !p.state.isFleeing && Math.abs(p.state.x - p1.state.x) < 50);

    if (p2 && Math.random() < 0.005) { // 0.5% chance per tick if close
      startInteraction(p1, p2);
    }
  };

  const startInteraction = (p1, p2) => {
    p1.state.action = 'interacting';
    p2.state.action = 'interacting';
    p1.state.isMoving = false;
    p2.state.isMoving = false;

    // Hide 1
    if (!p1.win.isDestroyed()) p1.win.hide();

    // Show interacting 1 on p2
    if (!p2.win.isDestroyed()) {
      p2.win.webContents.send('set-image', path.join(__dirname, 'assets', 'interacting 1.png'));
      // Force reset height to Sitting Level (lower)
      p2.win.setBounds({
        x: Math.round(p2.state.x),
        y: Math.round(baseY + getSitOffset()),
        width: currentPotatoSize,
        height: currentPotatoSize
      });
    }

    // Random timings
    const duration1 = Math.random() * 1000 + 1000; // 1s - 2s
    const duration2 = Math.random() * 1000 + 1000; // 1s - 2s

    setTimeout(() => {
      if (p2.win && !p2.win.isDestroyed() && p2.state.action === 'interacting') {
        p2.win.webContents.send('set-image', path.join(__dirname, 'assets', 'interacting 2.png'));
      }
    }, duration1);

    setTimeout(() => {
      endInteraction(p1, p2);
    }, duration1 + duration2);
  };

  const endInteraction = (p1, p2) => {
    // Restore
    if (p1.win && !p1.win.isDestroyed()) {
      p1.win.show();
      p1.state.action = 'run_away';
      p1.state.isMoving = true;
      p1.state.direction = 'left';
    }
    if (p2.win && !p2.win.isDestroyed()) {
      p2.state.action = 'run_away';
      p2.state.isMoving = true;
      p2.state.direction = 'right';
    }

    // Run for a bit then reset to idle/random
    setTimeout(() => {
      if (p1 && p1.state && p1.state.action === 'run_away') p1.state.action = 'idle';
      if (p2 && p2.state && p2.state.action === 'run_away') p2.state.action = 'idle';
    }, 1500);
  };


  smallPotatoes.forEach(p => {
    if (p.win.isDestroyed()) return;

    tryInteract(p);

    // Avoidance Logic
    const potatoCenterX = p.state.x + currentPotatoSize / 2;
    const potatoCenterY = baseY + getSitOffset() + currentPotatoSize / 2;

    const distX = cursor.x - potatoCenterX;
    const distY = cursor.y - potatoCenterY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    let isFleeing = false;

    // Only flee if cursor is close AND onscreen
    if (distance < 150) {
      isFleeing = true;
      p.state.isMoving = true;
      p.state.isFleeing = true;

      // Interrupt Interaction if active
      if (p.state.action === 'interacting') {
        if (p.type === 1 && !p.win.isDestroyed()) p.win.show();
      }

      // Run away
      if (distX > 0) { // Cursor is to the right
        p.state.direction = 'left';
        p.state.action = 'run_left';
      } else { // Cursor is to the left
        p.state.direction = 'right';
        p.state.action = 'run_right';
      }
    } else {
      p.state.isFleeing = false;

      // If interacting and NOT fleeing, stay put
      if (p.state.action === 'interacting') return;

      // Normal Random Walk if not running away
      if (p.state.action !== 'run_away' && p.state.action !== 'run_left' && p.state.action !== 'run_right') {
        // 2% chance to change state per tick
        if (Math.random() < 0.02) {
          const r = Math.random();
          if (r < 0.4) {
            p.state.action = 'idle';
            p.state.isMoving = false;
          } else if (r < 0.7) {
            p.state.action = 'walk_left';
            p.state.direction = 'left';
            p.state.isMoving = true;
          } else {
            p.state.action = 'walk_right';
            p.state.direction = 'right';
            p.state.isMoving = true;
          }
        }
      }
    }

    if (p.state.isMoving) {
      // Speed: 4 if fleeing/running, 1 if walking
      const isRunning = p.state.action.startsWith('run');
      const speed = isRunning ? 4 : 1;

      if (p.state.direction === 'left') {
        p.state.x -= speed;
      } else {
        p.state.x += speed;
      }

      // Bounce / Clamp
      const maxX = workArea.width - currentPotatoSize;
      if (p.state.x < 0) {
        p.state.x = 0;
        p.state.direction = 'right';
        if (!isFleeing) p.state.action = 'walk_right';
      } else if (p.state.x > maxX) {
        p.state.x = maxX;
        p.state.direction = 'left';
        if (!isFleeing) p.state.action = 'walk_left';
      }

      // Update Visuals
      const img = `walking_${p.type}.png`;
      p.win.webContents.send('set-image', path.join(__dirname, 'assets', img));
      p.win.webContents.send('set-direction', p.state.direction);

      // Smaller Walking Size
      const walkSize = Math.round(currentPotatoSize * 0.85);
      const xOffset = (currentPotatoSize - walkSize) / 2;

      // Calculate Y to align bottom (and be slightly higher than sitting)
      // Sitting Bottom = baseY + getSitOffset() + currentPotatoSize
      // We want Walking Bottom to be 10px higher than Sitting Bottom
      const sittingBottom = baseY + getSitOffset() + currentPotatoSize;
      const walkingBottom = sittingBottom - 10;
      const walkY = walkingBottom - walkSize;

      p.win.setBounds({
        x: Math.round(p.state.x + xOffset),
        y: Math.round(walkY),
        width: walkSize,
        height: walkSize
      });

    } else {
      // Idle
      const img = p.type === 1 ? '1.png' : '2.png';
      p.win.webContents.send('set-image', path.join(__dirname, 'assets', img));
      p.win.webContents.send('set-direction', p.state.direction);

      // Sit Height: Normal (lower), Full Size
      p.win.setBounds({
        x: Math.round(p.state.x),
        y: Math.round(baseY + getSitOffset()),
        width: currentPotatoSize,
        height: currentPotatoSize
      });
    }
  });
}

// Jump functions removed

