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

let smallPotatoes = []; // Array of { win, state, type, id }
let smallPotatoInterval;

const POTATO_SIZE = 100;
const INTERACTION_DURATION = 20;
const PAUSE_DURATION = 10;
const WALK_AWAY_DURATION = 20;



function createSmallPotatoes() {
  if (smallPotatoes.length > 0) return;

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const bounds = display.bounds; // Use bounds for full width if needed, but workArea is safer for bottom taskbar

  // Create 4 potatoes: 2 Type 1, 2 Type 2
  // Positions spread out
  const startPositions = [
    { x: 20, type: 1 },
    { x: 100, type: 2 },
    { x: 300, type: 1 },
    { x: 400, type: 2 }
  ];

  startPositions.forEach((pos, index) => {
    const state = {
      x: pos.x,
      y: workArea.y + workArea.height - POTATO_SIZE,
      val: 0,
      direction: pos.type === 1 ? 'right' : 'left',
      action: 'idle',
      interactTimer: 0,
      partnerId: null // To track who they are interacting with
    };

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

    // Unique ID for internal tracking
    const potatoObj = { win, state, type: pos.type, id: index };
    smallPotatoes.push(potatoObj);

    win.webContents.once('did-finish-load', () => {
      const img = pos.type === 1 ? '1.png' : '2.png';
      win.webContents.send('set-image', path.join(__dirname, 'assets', img));
      if (pos.type === 2) win.webContents.send('set-direction', 'left');
    });

    win.on('closed', () => {
      // Remove from array if closed individually (improbable but safe)
      const idx = smallPotatoes.findIndex(p => p.id === potatoObj.id);
      if (idx !== -1) smallPotatoes.splice(idx, 1);
    });
  });

  startSmallPotatoLoop();
}

function startSmallPotatoLoop() {
  if (smallPotatoInterval) clearInterval(smallPotatoInterval);

  smallPotatoInterval = setInterval(() => {
    if (smallPotatoes.length === 0) return;

    smallPotatoes.forEach(p => {
      if (!p.win.isDestroyed()) {
        updateSmallPotato(p);
      }
    });

    checkInteraction();
    checkMouseAvoidance();

  }, 100);
}

function stopSmallPotatoes() {
  if (smallPotatoInterval) {
    clearInterval(smallPotatoInterval);
    smallPotatoInterval = null;
  }
  smallPotatoes.forEach(p => {
    if (p.win && !p.win.isDestroyed()) p.win.close();
  });
  smallPotatoes = [];
}

function checkInteraction() {
  // Check pairs
  // We only want interactions between Type 1 and Type 2
  // And both must be 'idle' or 'walking' (not already interacting/hidden/walking_away)

  // Double loop to find pairs
  for (let i = 0; i < smallPotatoes.length; i++) {
    const p1 = smallPotatoes[i];
    if (isBusy(p1)) continue;

    for (let j = i + 1; j < smallPotatoes.length; j++) {
      const p2 = smallPotatoes[j];
      if (isBusy(p2)) continue;

      // Must be different types for this specific interaction logic (1 acts, 2 listens)
      if (p1.type === p2.type) continue;

      const dx = Math.abs(p1.state.x - p2.state.x);
      if (dx < 40) {
        if (Math.random() < 0.1) {
          // Interaction!
          // Identify who is Type 1 (actor) and Type 2 (listener/hidden)
          const actor = p1.type === 1 ? p1 : p2;
          const listener = p1.type === 1 ? p2 : p1;
          startInteraction(actor, listener);
        }
      }
    }
  }
}

function isBusy(p) {
  return p.state.action !== 'idle' && !p.state.action.startsWith('walk');
}

function startInteraction(actor, listener) {
  // Face each other
  if (actor.state.x < listener.state.x) {
    actor.state.direction = 'right';
    listener.state.direction = 'left';
  } else {
    actor.state.direction = 'left';
    listener.state.direction = 'right';
  }

  // Hide listener
  if (listener.win && !listener.win.isDestroyed()) listener.win.hide();
  listener.state.action = 'hidden';
  listener.state.partnerId = actor.id;

  // Actor starts stage 1
  actor.state.action = 'interacting_stage1';
  actor.state.partnerId = listener.id;
  actor.state.interactTimer = INTERACTION_DURATION;

  // Sync timer for listener just in case
  listener.state.interactTimer = INTERACTION_DURATION;

  updateInteractionImages(actor, listener);
}

function updateInteractionImages(actor, listener) {
  if (!actor.win.isDestroyed()) {
    if (actor.state.action === 'interacting_stage1') {
      actor.win.webContents.send('set-image', path.join(__dirname, 'assets/interacting 1.png'));
    } else if (actor.state.action === 'interacting_stage2') {
      actor.win.webContents.send('set-image', path.join(__dirname, 'assets/interacting 2.png'));
    } else if (actor.state.action === 'reappearing') {
      actor.win.webContents.send('set-image', path.join(__dirname, 'assets/1.png'));
    }
    actor.win.webContents.send('set-direction', actor.state.direction);

    // Enforce size
    actor.win.setBounds({
      x: Math.round(actor.state.x),
      y: Math.round(actor.state.y),
      width: POTATO_SIZE,
      height: POTATO_SIZE
    });
  }

  if (!listener.win.isDestroyed()) {
    if (listener.state.action === 'reappearing') {
      if (!listener.win.isVisible()) listener.win.show();
      listener.win.webContents.send('set-image', path.join(__dirname, 'assets/2.png'));
      listener.win.webContents.send('set-direction', listener.state.direction);

      // Enforce size
      listener.win.setBounds({
        x: Math.round(listener.state.x),
        y: Math.round(listener.state.y),
        width: POTATO_SIZE,
        height: POTATO_SIZE
      });
    }
  }
}

function handleInteractionTick(p) {
  // Only the ACTOR (Type 1) drives the state in this logic, 
  // or we handle both. Let's let the ACTOR drive it since they are linked by partnerId.
  // If we are Type 2 (hidden/listener), we just wait unless we are 'reappearing'.

  if (p.type === 2 && p.state.action === 'hidden') return; // Passive

  const partner = smallPotatoes.find(pot => pot.id === p.state.partnerId);
  if (!partner) {
    // Partner gone? Reset.
    resetPotato(p);
    return;
  }

  p.state.interactTimer--;

  if (p.state.interactTimer <= 0) {
    if (p.state.action === 'interacting_stage1') {
      p.state.action = 'interacting_stage2';
      p.state.interactTimer = INTERACTION_DURATION;
      updateInteractionImages(p, partner);
    } else if (p.state.action === 'interacting_stage2') {
      // Reappear phase
      p.state.action = 'reappearing';
      partner.state.action = 'reappearing';
      p.state.interactTimer = PAUSE_DURATION;
      updateInteractionImages(p, partner);
    } else if (p.state.action === 'reappearing') {
      // Walk away
      startWalkAway(p, partner);
    } else if (p.state.action === 'walking_away') {
      // Done walking away
      p.state.action = 'idle';
      partner.state.action = 'idle';
      p.state.partnerId = null;
      partner.state.partnerId = null;
    }
  }
}

function startWalkAway(p1, p2) {
  p1.state.action = 'walking_away';
  p2.state.action = 'walking_away';
  p1.state.interactTimer = WALK_AWAY_DURATION;
  p2.state.interactTimer = WALK_AWAY_DURATION;

  // Ensure visible
  if (!p1.win.isVisible()) p1.win.show();
  if (!p2.win.isVisible()) p2.win.show();

  // Directions
  if (p1.state.x < p2.state.x) {
    p1.state.direction = 'left';
    p2.state.direction = 'right';
  } else {
    p1.state.direction = 'right';
    p2.state.direction = 'left';
  }
}

function resetPotato(p) {
  p.state.action = 'idle';
  p.state.partnerId = null;
  if (p.win && !p.win.isDestroyed() && !p.win.isVisible()) p.win.show();
}

function updateSmallPotato(p) {
  // Handle interaction states specially
  if (p.state.action.startsWith('interacting') || p.state.action === 'reappearing' || p.state.action === 'walking_away' || p.state.action === 'hidden') {
    handleInteractionTick(p);

    // Actually move if walking away
    if (p.state.action === 'walking_away') {
      movePotato(p, 2);
    }
    return;
  }

  // Normal Random Logic
  if (Math.random() < 0.05) {
    const r = Math.random();
    if (r < 0.3) p.state.action = 'idle';
    else if (r < 0.65) {
      p.state.action = 'walk_left';
      p.state.direction = 'left';
    } else {
      p.state.action = 'walk_right';
      p.state.direction = 'right';
    }
  }

  let img = p.type === 1 ? '1.png' : '2.png';
  if (p.state.action.startsWith('walk')) {
    img = `walking_${p.type}.png`;
    movePotato(p, 2);
  } else {
    // Just visual update for stationary
    p.win.webContents.send('set-image', path.join(__dirname, 'assets', img));
    p.win.webContents.send('set-direction', p.state.direction);
  }
}

function movePotato(p, speed) {
  if (p.state.direction === 'left') p.state.x -= speed;
  else p.state.x += speed;

  // Bounds
  const maxWidth = screen.getPrimaryDisplay().workAreaSize.width - POTATO_SIZE;
  if (p.state.x < 0) {
    p.state.x = 0;
    if (p.state.action !== 'walking_away') {
      p.state.action = 'walk_right';
      p.state.direction = 'right';
    }
  }
  if (p.state.x > maxWidth) {
    p.state.x = maxWidth;
    if (p.state.action !== 'walking_away') {
      p.state.action = 'walk_left';
      p.state.direction = 'left';
    }
  }

  p.win.setBounds({
    x: Math.round(p.state.x),
    y: Math.round(p.state.y),
    width: POTATO_SIZE,
    height: POTATO_SIZE
  });

  // Update Image during move
  let img = p.type === 1 ? '1.png' : '2.png';
  if (p.state.action.startsWith('walk') || p.state.action === 'walking_away') {
    img = `walking_${p.type}.png`;
  }
  p.win.webContents.send('set-image', path.join(__dirname, 'assets', img));
  p.win.webContents.send('set-direction', p.state.direction);
}

function checkMouseAvoidance() {
  const cursor = screen.getCursorScreenPoint();
  const avoidDist = 150;
  const runSpeed = 8;

  smallPotatoes.forEach(p => {
    if (p.state.action === 'hidden') return; // Can't see ghost potatoes

    const dxCenter = p.state.x + POTATO_SIZE / 2 - cursor.x;
    const dyCenter = p.state.y + POTATO_SIZE / 2 - cursor.y;
    const dist = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);

    if (dist < avoidDist) {
      // Interrupt interaction
      if (p.state.action.startsWith('interacting') || p.state.action === 'reappearing' || p.state.partnerId) {
        // Break partnership
        const partner = smallPotatoes.find(pot => pot.id === p.state.partnerId);
        if (partner) resetPotato(partner);
        resetPotato(p);
      }

      // Run away
      if (dxCenter < 0) { // Cursor right
        p.state.action = 'walk_left';
        p.state.direction = 'left';
        p.state.x -= runSpeed;
      } else {
        p.state.action = 'walk_right';
        p.state.direction = 'right';
        p.state.x += runSpeed;
      }

      // Bounds check only (movePotato handles display update usually, but we need force update here)
      // Re-using movePotato logic would be cleaner but let's just stick to raw updates for verify consistency or call movePotato with 0 speed to update? 
      // Better to just invoke movePotato logic:

      // Actually, let's keep it simple and explicit here to ensure the 'run' speed applies.
      if (p.state.x < 0) p.state.x = 0;
      const maxWidth = screen.getPrimaryDisplay().workAreaSize.width - POTATO_SIZE;
      if (p.state.x > maxWidth) p.state.x = maxWidth;

      p.win.setBounds({ x: Math.round(p.state.x), y: Math.round(p.state.y), width: POTATO_SIZE, height: POTATO_SIZE });
      p.win.webContents.send('set-image', path.join(__dirname, `assets/walking_${p.type}.png`));
      p.win.webContents.send('set-direction', p.state.direction);
    }
  });
}

