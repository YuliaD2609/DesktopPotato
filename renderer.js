const { ipcRenderer } = require('electron');

const toggleBtn = document.getElementById('toggleBtn');
let isRunning = false;

toggleBtn.addEventListener('click', () => {
    isRunning = !isRunning;

    if (isRunning) {
        toggleBtn.textContent = 'Stop';
        ipcRenderer.send('toggle-pet', true);
    } else {
        toggleBtn.textContent = 'Start';
        ipcRenderer.send('toggle-pet', false);
    }
});

const alwaysOnToggle = document.getElementById('alwaysOnToggle');

// Request initial settings
ipcRenderer.send('get-settings');

ipcRenderer.on('settings-updated', (event, config) => {
    alwaysOnToggle.checked = config.alwaysOn;

    // If alwaysOn is true, the pet is running by default
    if (config.alwaysOn) {
        isRunning = true;
        toggleBtn.textContent = 'Stop';
    }
});

alwaysOnToggle.addEventListener('change', (e) => {
    ipcRenderer.send('toggle-always-on', e.target.checked);
});
