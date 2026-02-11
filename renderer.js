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


// --- Hardened Watermark Injection ---
(function () {
    const wmText = "yulia";
    const wmId = "wm-" + Math.random().toString(36).substr(2, 9); // Random ID to avoid easy CSS targeting by ID

    function createWatermark() {
        const wm = document.createElement('div');
        wm.id = wmId;
        wm.textContent = wmText;

        // Inline styles for hardness
        wm.style.position = 'fixed';
        wm.style.top = '5px';
        wm.style.left = '5px';
        wm.style.fontSize = '12px';
        wm.style.fontWeight = 'bold';
        wm.style.color = 'rgba(0, 0, 0, 0.2)';
        wm.style.pointerEvents = 'none';
        wm.style.userSelect = 'none';
        wm.style.zIndex = '2147483647'; // Max z-index
        wm.style.fontFamily = "'Courier New', Courier, monospace";

        document.body.appendChild(wm);
        return wm;
    }

    let wmElement = createWatermark();

    // Watch for removal
    const observer = new MutationObserver((mutations) => {
        if (!document.body.contains(wmElement)) {
            // Re-create if removed
            wmElement = createWatermark();
        } else {
            // Optional: Watch for attribute changes (like hiding it)
            if (wmElement.style.display === 'none' || wmElement.style.visibility === 'hidden' || wmElement.style.opacity === '0') {
                wmElement.style.display = 'block';
                wmElement.style.visibility = 'visible';
                wmElement.style.opacity = '1';
                wmElement.style.color = 'rgba(0, 0, 0, 0.2)'; // Restore color
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    // Also observe the element itself for attribute changes
    // (We need to re-attach observer if element is re-created, so we can't easily do it here for the *instance*, 
    // but the body observer handles strict removal. To handle attribute tampering, we'd need a separate observer on wmElement.)
    // For simplicity/performance, just ensuring presence is usually enough "unremovable" for this context.
})();
