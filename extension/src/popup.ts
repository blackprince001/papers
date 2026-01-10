function extractDOI(url: string | undefined): string | null {
  if (!url) return null;

  const doiPattern = /10\.\d+\/[^\s/]+/;
  const match = url.match(doiPattern);
  if (match) {
    return match[0];
  }

  const arxivPattern = /arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/;
  const arxivMatch = url.match(arxivPattern);
  if (arxivMatch) {
    return `arxiv:${arxivMatch[1]}`;
  }

  return null;
}

async function getBackendURL(): Promise<string> {
  const result = await chrome.storage.sync.get(['backendURL']);
  return (result.backendURL as string) || 'http://localhost:8000';
}

interface Group {
  id: number;
  name: string;
  parent_id?: number;
  children?: Group[];
}

async function loadGroups(backendURL: string): Promise<Group[]> {
  try {
    const response = await fetch(`${backendURL}/api/v1/groups`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      const groups = await response.json();
      return groups as Group[];
    } else {
      console.warn('Failed to load groups:', response.status, response.statusText);
    }
  } catch (e) {
    console.error('Failed to load groups:', e);
  }
  return [];
}

// Build hierarchical tree structure from flat groups list
function buildGroupTree(groups: Group[]): Group[] {
  const groupMap = new Map<number, Group & { _children?: Group[] }>();
  const roots: Group[] = [];

  // First pass: create map and initialize children arrays
  groups.forEach((group) => {
    groupMap.set(group.id, { ...group, _children: [] });
  });

  // Second pass: build parent-child relationships
  groups.forEach((group) => {
    const node = groupMap.get(group.id)!;
    if (group.parent_id) {
      const parent = groupMap.get(group.parent_id);
      if (parent) {
        if (!parent._children) parent._children = [];
        parent._children.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  // Convert _children to children for each node
  const processNode = (node: Group & { _children?: Group[] }): Group => {
    if (node._children && node._children.length > 0) {
      return { ...node, children: node._children.map(processNode) };
    }
    return node;
  };

  return roots.map(processNode);
}

// Build flat list with hierarchy indicators for select dropdown
function buildGroupOptions(groups: Group[], level = 0): Array<{ id: number; name: string; displayName: string }> {
  const options: Array<{ id: number; name: string; displayName: string }> = [];

  const processGroup = (group: Group, prefix: string, isLast: boolean) => {
    const connector = isLast ? '└─ ' : '├─ ';
    const displayName = prefix + connector + group.name;
    options.push({ id: group.id, name: group.name, displayName });

    if (group.children && group.children.length > 0) {
      const newPrefix = prefix + (isLast ? '   ' : '│  ');
      group.children.forEach((child, index) => {
        const childIsLast = index === group.children!.length - 1;
        processGroup(child, newPrefix, childIsLast);
      });
    }
  };

  groups.forEach((group, index) => {
    const isLast = index === groups.length - 1;
    processGroup(group, '', isLast);
  });

  return options;
}

interface PaperPayload {
  title: string;
  url: string;
  doi?: string;
  group_ids?: number[];
}

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const backendURL = await getBackendURL();

  const titleEl = document.getElementById('paper-title') as HTMLHeadingElement;
  const urlEl = document.getElementById('paper-url') as HTMLParagraphElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const statusEl = document.getElementById('status') as HTMLDivElement;
  const groupSelect = document.getElementById('group-select') as HTMLSelectElement;
  const loadingEl = document.getElementById('loading') as HTMLDivElement;
  const doiEl = document.getElementById('paper-doi') as HTMLParagraphElement;

  if (!tab) {
    titleEl.textContent = 'No active tab';
    urlEl.textContent = 'Please navigate to a webpage';
    saveBtn.disabled = true;
    return;
  }

  titleEl.textContent = tab.title || 'Untitled';
  urlEl.textContent = tab.url || 'No URL available';

  if (!tab.url || !tab.url.startsWith('http')) {
    saveBtn.disabled = true;
    statusEl.textContent = 'Invalid URL. Navigate to a valid webpage.';
    statusEl.className = 'status error';
  }

  const doi = extractDOI(tab.url);
  if (doi) {
    doiEl.textContent = `DOI: ${doi}`;
    doiEl.style.display = 'block';
  }

  try {
    loadingEl.textContent = 'Loading groups...';
    const groups = await loadGroups(backendURL);
    loadingEl.textContent = '';

    if (groups.length > 0) {
      groupSelect.style.display = 'block';
      
      // Build hierarchical tree structure
      const rootGroups = buildGroupTree(groups);
      const groupOptions = buildGroupOptions(rootGroups);

      // Add "No group" option
      const noGroupOption = document.createElement('option');
      noGroupOption.value = '';
      noGroupOption.textContent = 'No group';
      groupSelect.appendChild(noGroupOption);

      // Add separator
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '──────────';
      groupSelect.appendChild(separator);

      // Add groups with hierarchy
      groupOptions.forEach((groupOption) => {
        const option = document.createElement('option');
        option.value = groupOption.id.toString();
        option.textContent = groupOption.displayName;
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
      const payload: PaperPayload = {
        title: tab.title || 'Untitled',
        url: tab.url || '',
      };

      if (doi) {
        payload.doi = doi;
      }

      if (selectedGroupId) {
        payload.group_ids = [selectedGroupId];
      }

      if (!tab.url || !tab.url.startsWith('http')) {
        throw new Error('Invalid URL. Please navigate to a valid webpage.');
      }

      const response = await fetch(`${backendURL}/api/v1/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = (await response.json().catch(() => ({}))) as { title?: string };
        saveBtn.textContent = 'Saved!';
        statusEl.textContent = `Paper "${result.title || tab.title}" saved successfully`;
        statusEl.className = 'status success';
        setTimeout(() => window.close(), 2000);
      } else {
        let errorMessage = 'Failed to save paper';
        try {
          const error = (await response.json()) as { detail?: string; message?: string };
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
      const errorMsg = (e as Error).message || 'Check backend connection and settings';
      statusEl.textContent = errorMsg;
      statusEl.className = 'status error';
      saveBtn.disabled = false;

      if (errorMsg.includes('fetch') || errorMsg.includes('Network')) {
        statusEl.textContent = 'Cannot connect to backend. Check URL in options.';
      }
    }
  });
});


