const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let menuWindow;
let petWindow;
let petInterval;

function createMenuWindow() {
  menuWindow = new BrowserWindow({
    width: 300,
    height: 200,
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

  // If Always On, start pet immediately
  if (config.alwaysOn) {
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
  if (shouldStart) {
    createPetWindow();
    createSmallPotatoes();
  } else {
    if (petWindow) {
      petWindow.close();
    }
    stopSmallPotatoes();
  }
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
  return { alwaysOn: true }; // Default
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
});

ipcMain.on('toggle-always-on', (event, isAlwaysOn) => {
  const config = loadConfig();
  config.alwaysOn = isAlwaysOn;
  saveConfig(config);

  app.setLoginItemSettings({
    openAtLogin: isAlwaysOn,
    path: process.execPath,
    args: [path.resolve(__dirname)]
  });

  // If enabled, ensure pet is running
  if (isAlwaysOn && !petWindow) {
    createPetWindow();
  }
});

// --- Small Potatoes Logic ---

let smallPotato1, smallPotato2;
let smallPotatoInterval;

const POTATO_SIZE = 60; // Smaller size (assuming main pet is 100)
// Actually user asked for "small potatoes 1 and 2". 
// Let's assume they are smaller than the main one.

// State for small potatoes
let sp1State = { x: 0, y: 0, val: 0, direction: 'right', action: 'idle', interactTimer: 0 };
let sp2State = { x: 0, y: 0, val: 0, direction: 'left', action: 'idle', interactTimer: 0 };

function createSmallPotatoes() {
  if (smallPotato1 || smallPotato2) return;

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea; // Excludes taskbar
  const bounds = display.bounds;

  // Position at bottom-left of work area
  const GROUND_OFFSET = 0; // Sit on taskbar line

  // Initial positions
  sp1State.x = 20;
  sp1State.y = workArea.y + workArea.height - POTATO_SIZE - GROUND_OFFSET;

  sp2State.x = 100;
  sp2State.y = workArea.y + workArea.height - POTATO_SIZE - GROUND_OFFSET;

  const createMsg = (state, windowName) => {
    const win = new BrowserWindow({
      width: POTATO_SIZE,
      height: POTATO_SIZE,
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
    return win;
  };

  smallPotato1 = createMsg(sp1State, 'sp1');
  smallPotato2 = createMsg(sp2State, 'sp2');

  // Initial images
  smallPotato1.webContents.once('did-finish-load', () => {
    smallPotato1.webContents.send('set-image', path.join(__dirname, 'assets/1.png'));
  });
  smallPotato2.webContents.once('did-finish-load', () => {
    smallPotato2.webContents.send('set-direction', 'left'); // Face left initially
    smallPotato2.webContents.send('set-image', path.join(__dirname, 'assets/2.png'));
  });

  smallPotato1.on('closed', () => smallPotato1 = null);
  smallPotato2.on('closed', () => smallPotato2 = null);

  startSmallPotatoLoop();
}

function startSmallPotatoLoop() {
  if (smallPotatoInterval) clearInterval(smallPotatoInterval);

  smallPotatoInterval = setInterval(() => {
    if (!smallPotato1 || !smallPotato2 || smallPotato1.isDestroyed() || smallPotato2.isDestroyed()) return;

    updateSmallPotato(smallPotato1, sp1State, 1);
    updateSmallPotato(smallPotato2, sp2State, 2);

    checkInteraction();
    checkMouseAvoidance();

  }, 100);
}

function updateSmallPotato(win, state, id) {
  if (state.action === 'interacting') return; // Don't move if interacting

  // Random move logic
  // 5% chance to change action (idle <-> walk)
  if (Math.random() < 0.05) {
    const r = Math.random();
    if (r < 0.3) state.action = 'idle';
    else if (r < 0.65) {
      state.action = 'walk_left';
      state.direction = 'left';
    } else {
      state.action = 'walk_right';
      state.direction = 'right';
    }
  }

  // Visual update freq
  // Update image based on action
  let img = id + '.png'; // Default idle
  if (state.action.startsWith('walk')) {
    img = `walking_${id}.png`;
  }

  // Send updates
  win.webContents.send('set-image', path.join(__dirname, 'assets', img));
  win.webContents.send('set-direction', state.direction);

  // Move
  const speed = 2; // px per tick
  if (state.action === 'walk_left') state.x -= speed;
  if (state.action === 'walk_right') state.x += speed;

  // Bounds (0 to 400)
  if (state.x < 0) { state.x = 0; state.action = 'walk_right'; }
  if (state.x > 400) { state.x = 400; state.action = 'walk_left'; }

  win.setBounds({
    x: Math.round(state.x),
    y: Math.round(state.y),
    width: POTATO_SIZE,
    height: POTATO_SIZE
  });
}

function checkMouseAvoidance() {
  const cursor = screen.getCursorScreenPoint();
  const avoidDist = 150;
  const runSpeed = 8;

  [
    { win: smallPotato1, state: sp1State, id: 1 },
    { win: smallPotato2, state: sp2State, id: 2 }
  ].forEach(p => {
    // Check intersection AND allow running away even if interaction started
    if (p.state.action.startsWith('interacting') && p.state.action !== 'scared') {
      const dx = p.state.x + POTATO_SIZE / 2 - cursor.x;
      const dy = p.state.y + POTATO_SIZE / 2 - cursor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > avoidDist) return; // Ignore if far away
    }
    // If not interacting, we proceed. If interacting and close, we proceed below to interrupt.

    const dx = p.state.x + POTATO_SIZE / 2 - cursor.x;
    const dy = p.state.y + POTATO_SIZE / 2 - cursor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < avoidDist) {
      // Interrupt interaction
      if (p.state.action.startsWith('interacting')) {
        p.state.interactStage = 0;
        p.state.interactTimer = 0;
      }

      // Run away horizontally
      if (dx < 0) { // Cursor is to the right
        p.state.action = 'walk_left';
        p.state.x -= runSpeed;
        p.state.direction = 'left';
      } else { // Cursor is to the left
        p.state.action = 'walk_right';
        p.state.x += runSpeed;
        p.state.direction = 'right';
      }

      if (p.state.x < 0) p.state.x = 0;
      // Expand bounds if running away
      if (p.state.x > 800) p.state.x = 800;

      try {
        p.win.setBounds({ x: Math.round(p.state.x), y: Math.round(p.state.y), width: POTATO_SIZE, height: POTATO_SIZE });
        p.win.webContents.send('set-image', path.join(__dirname, `assets/walking_${p.id}.png`));
        p.win.webContents.send('set-direction', p.state.direction);
      } catch (e) { }
    }
  });
}

function checkInteraction() {
  if (sp1State.action === 'interacting' || sp2State.action === 'interacting') {
    sp1State.interactTimer--;
    if (sp1State.interactTimer <= 0) {
      // End interaction
      sp1State.action = 'idle';
      sp2State.action = 'idle';
    }
    return;
  }

  // Distance between them
  const dx = Math.abs(sp1State.x - sp2State.x);
  if (dx < 40) { // Close enough
    // 10% chance to interact when close
    if (Math.random() < 0.1) {
      startInteraction();
    }
  }
}

function stopSmallPotatoes() {
  if (smallPotatoInterval) {
    clearInterval(smallPotatoInterval);
    smallPotatoInterval = null;
  }
  if (smallPotato1 && !smallPotato1.isDestroyed()) {
    smallPotato1.close();
  }
  if (smallPotato2 && !smallPotato2.isDestroyed()) {
    smallPotato2.close();
  }
  smallPotato1 = null;
  smallPotato2 = null;
}

function startInteraction() {
  sp1State.action = 'interacting';
  sp2State.action = 'interacting';
  sp1State.interactTimer = 50; // 5 seconds (50 * 100ms)

  // Face each other
  if (sp1State.x < sp2State.x) {
    sp1State.direction = 'right';
    sp2State.direction = 'left';
  } else {
    sp1State.direction = 'left';
    sp2State.direction = 'right';
  }

  // Ensure windows exist before sending
  if (smallPotato1 && !smallPotato1.isDestroyed()) {
    smallPotato1.webContents.send('set-direction', sp1State.direction);
    smallPotato1.webContents.send('set-image', path.join(__dirname, 'assets/interacting 1.png'));
  }
  if (smallPotato2 && !smallPotato2.isDestroyed()) {
    smallPotato2.webContents.send('set-direction', sp2State.direction);
    smallPotato2.webContents.send('set-image', path.join(__dirname, 'assets/interacting 2.png'));
  }
}
