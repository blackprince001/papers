document.addEventListener('DOMContentLoaded', async () => {
  const backendUrlInput = document.getElementById('backend-url') as HTMLInputElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const statusEl = document.getElementById('status') as HTMLDivElement;

  const result = await chrome.storage.sync.get(['backendURL']);
  if (result.backendURL) {
    backendUrlInput.value = result.backendURL as string;
  } else {
    backendUrlInput.value = 'http://localhost:8000';
  }

  saveBtn.addEventListener('click', async () => {
    const backendURL = backendUrlInput.value.trim();

    if (!backendURL) {
      statusEl.textContent = 'Please enter a backend URL';
      statusEl.className = 'status error';
      return;
    }

    try {
      const url = new URL(backendURL);

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('URL must use http or https protocol');
      }

      statusEl.textContent = 'Testing connection...';
      statusEl.className = 'status';

      try {
        const testResponse = await fetch(`${backendURL}/api/v1/groups`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (testResponse.ok || testResponse.status === 404) {
          await chrome.storage.sync.set({ backendURL });
          statusEl.textContent = 'Settings saved and connection verified!';
          statusEl.className = 'status success';
        } else {
          statusEl.textContent = 'Connection failed. Check if backend is running.';
          statusEl.className = 'status error';
          return;
        }
      } catch (fetchError) {
        statusEl.textContent = 'Cannot reach backend. Check URL and ensure server is running.';
        statusEl.className = 'status error';
        return;
      }

      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }, 3000);
    } catch (e) {
      if (e instanceof TypeError) {
        statusEl.textContent = 'Invalid URL format (e.g., http://localhost:8000)';
      } else {
        statusEl.textContent = (e as Error).message || 'Invalid URL format';
      }
      statusEl.className = 'status error';
    }
  });
});


