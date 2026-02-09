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
