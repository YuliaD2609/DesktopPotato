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
    if (petWindow) {
      petWindow.close();
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
  // Random time between 30s and 2m
  const minTime = 30000;
  const maxTime = 120000;
  const randomTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;

  jumpTimeout = setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed()) {
      if (!isMoving) { // Only jump if not running
        performJump();
      }
      scheduleRandomJump(); // Schedule next likelihood
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
  createMenuWindow();

  // Set launch on startup
  app.setLoginItemSettings({
    openAtLogin: true,
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
  } else {
    if (petWindow) {
      petWindow.close();
    }
  }
});
