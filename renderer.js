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

    // Sync button state with config
    if (config.isRunning) {
        isRunning = true;
        toggleBtn.textContent = 'Stop';
    } else {
        isRunning = false;
        toggleBtn.textContent = 'Start';
    }
});

alwaysOnToggle.addEventListener('change', (e) => {
    ipcRenderer.send('toggle-always-on', e.target.checked);
    // If we toggle ON, we assume it starts running (as per main.js logic)
    if (e.target.checked) {
        isRunning = true;
        toggleBtn.textContent = 'Stop';
    }
});

const sizeSlider = document.getElementById('sizeSlider');
const sizeValue = document.getElementById('sizeValue');

sizeSlider.addEventListener('input', (e) => {
    const size = parseInt(e.target.value, 10);
    sizeValue.textContent = size;
    ipcRenderer.send('update-potato-size', size);
});

ipcRenderer.on('size-updated', (event, size) => {
    sizeSlider.value = size;
    sizeValue.textContent = size;
});

const countSlider = document.getElementById('countSlider');
const countValue = document.getElementById('countValue');

countSlider.addEventListener('input', (e) => {
    const count = parseInt(e.target.value, 10);
    countValue.textContent = count;
    ipcRenderer.send('update-potato-count', count);
});

ipcRenderer.on('count-updated', (event, count) => {
    countSlider.value = count;
    countValue.textContent = count;
});
