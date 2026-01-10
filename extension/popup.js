// Extract DOI from URL or page content
function extractDOI(url) {
  // Pattern for DOI in URL (e.g., https://doi.org/10.1234/example)
  const doiPattern = /10\.\d+\/[^\s/]+/;
  const match = url.match(doiPattern);
  if (match) {
    return match[0];
  }

  // ArXiv pattern
  const arxivPattern = /arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/;
  const arxivMatch = url.match(arxivPattern);
  if (arxivMatch) {
    return `arxiv:${arxivMatch[1]}`;
  }

  return null;
}

// Get backend URL from storage or use default
async function getBackendURL() {
  const result = await chrome.storage.sync.get(['backendURL']);
  return result.backendURL || 'http://localhost:8000';
}

// Load groups from backend
async function loadGroups(backendURL) {
  try {
    const response = await fetch(`${backendURL}/api/v1/groups`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const groups = await response.json();
      return groups;
    } else {
      console.warn('Failed to load groups:', response.status, response.statusText);
    }
  } catch (e) {
    console.error('Failed to load groups:', e);
  }
  return [];
}

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const backendURL = await getBackendURL();

  const titleEl = document.getElementById('paper-title');
  const urlEl = document.getElementById('paper-url');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  const groupSelect = document.getElementById('group-select');
  const loadingEl = document.getElementById('loading');
  const doiEl = document.getElementById('paper-doi');

  // Handle cases where tab info might not be available
  if (!tab) {
    titleEl.textContent = 'No active tab';
    urlEl.textContent = 'Please navigate to a webpage';
    saveBtn.disabled = true;
    return;
  }

  titleEl.textContent = tab.title || 'Untitled';
  urlEl.textContent = tab.url || 'No URL available';
  
  // Disable save if URL is invalid
  if (!tab.url || !tab.url.startsWith('http')) {
    saveBtn.disabled = true;
    statusEl.textContent = 'Invalid URL. Navigate to a valid webpage.';
    statusEl.className = 'status error';
  }

  // Extract DOI
  const doi = extractDOI(tab.url);
  if (doi) {
    doiEl.textContent = `DOI: ${doi}`;
    doiEl.style.display = 'block';
  }

  // Load groups
  try {
    loadingEl.textContent = 'Loading groups...';
    const groups = await loadGroups(backendURL);
    loadingEl.textContent = '';

    if (groups.length > 0) {
      groupSelect.style.display = 'block';
      groups.forEach((group) => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        groupSelect.appendChild(option);
      });
    }
  } catch (e) {
    loadingEl.textContent = '';
    console.error('Error loading groups:', e);
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    statusEl.textContent = '';
    statusEl.className = 'status';

    try {
      const selectedGroupId = groupSelect.value ? parseInt(groupSelect.value) : null;
      const payload = {
        title: tab.title || 'Untitled',
        url: tab.url,
      };

      if (doi) {
        payload.doi = doi;
      }

      if (selectedGroupId) {
        payload.group_ids = [selectedGroupId];
      }

      // Validate URL before sending
      if (!tab.url || !tab.url.startsWith('http')) {
        throw new Error('Invalid URL. Please navigate to a valid webpage.');
      }

      const response = await fetch(`${backendURL}/api/v1/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        saveBtn.textContent = 'Saved!';
        statusEl.textContent = `Paper "${result.title || tab.title}" saved successfully`;
        statusEl.className = 'status success';
        setTimeout(() => window.close(), 2000);
      } else {
        let errorMessage = 'Failed to save paper';
        try {
          const error = await response.json();
          errorMessage = error.detail || error.message || errorMessage;
        } catch (e) {
          if (response.status === 0 || response.status >= 500) {
            errorMessage = 'Server error. Check if backend is running.';
          } else if (response.status === 404) {
            errorMessage = 'API endpoint not found. Check backend URL.';
          } else if (response.status === 400) {
            errorMessage = 'Invalid request. Check the paper URL.';
          }
        }
        throw new Error(errorMessage);
      }
    } catch (e) {
      saveBtn.textContent = 'Save to Nexus';
      const errorMsg = e.message || 'Check backend connection and settings';
      statusEl.textContent = errorMsg;
      statusEl.className = 'status error';
      saveBtn.disabled = false;
      
      // Show helpful message if connection fails
      if (errorMsg.includes('fetch') || errorMsg.includes('Network')) {
        statusEl.textContent = 'Cannot connect to backend. Check URL in options.';
      }
    }
  });
});
