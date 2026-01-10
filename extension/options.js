document.addEventListener('DOMContentLoaded', async () => {
  const backendUrlInput = document.getElementById('backend-url');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');

  // Load current settings
  const result = await chrome.storage.sync.get(['backendURL']);
  if (result.backendURL) {
    backendUrlInput.value = result.backendURL;
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
      // Validate URL format
      const url = new URL(backendURL);
      
      // Ensure it's http or https
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('URL must use http or https protocol');
      }
      
      // Test connection
      statusEl.textContent = 'Testing connection...';
      statusEl.className = 'status';
      
      try {
        const testResponse = await fetch(`${backendURL}/api/v1/groups`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (testResponse.ok || testResponse.status === 404) {
          // 404 is okay, means server is reachable
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
        statusEl.textContent = e.message || 'Invalid URL format';
      }
      statusEl.className = 'status error';
    }
  });
});

