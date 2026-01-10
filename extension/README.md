# Nexus Researcher Browser Extension

A modern browser extension for quickly saving research papers to your Nexus backend. Built with Bun, TypeScript, and Vite.

## Features

- **One-click paper capture**: Save papers from any webpage with a single click
- **DOI detection**: Automatically extracts DOI from URLs (including ArXiv)
- **Group organization**: Select a group to organize your saved papers
- **Configurable backend**: Set your backend URL in the options page
- **TypeScript**: Full type safety with Chrome extension types
- **Modern build**: Built with Vite and Bun for fast development

## Development

### Prerequisites

- [Bun](https://bun.sh) installed
- Backend server running (see main project README)

### Setup

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Build the extension**:
   ```bash
   bun run build
   ```

   This creates a `dist/` folder with the compiled extension.

3. **Development mode** (watch for changes):
   ```bash
   bun run dev
   ```

   This will rebuild automatically when you make changes.

### Testing in Browser

1. **Build the extension**:
   ```bash
   bun run build
   ```
   This compiles TypeScript, bundles with Vite, and prepares the `dist/` folder.

2. **Load in Chrome/Edge**:
   - Open Chrome or Edge browser
   - Navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `dist/` folder from this directory (not `src/`)

3. **Quick test command**:
   ```bash
   bun run test
   ```
   This builds and shows instructions.

4. **Development workflow**:
   - Run `bun run dev` for watch mode (rebuilds on file changes)
   - After changes, go to `chrome://extensions/`
   - Click the reload icon (🔄) on the extension card
   - Test your changes

5. **Verify the extension works**:
   - Navigate to any paper webpage (e.g., ArXiv)
   - Click the extension icon
   - You should see the popup with paper details
   - Try saving a paper to test the backend connection

### Configure Backend URL

1. Right-click the extension icon in the toolbar
2. Select "Options"
3. Enter your backend URL (default: `http://localhost:8000`)
4. Click "Save" (it will test the connection automatically)

## Usage

1. Navigate to a paper webpage (e.g., ArXiv, Nature, ScienceDirect, etc.)
2. Click the extension icon in your browser toolbar
3. Review the paper information:
   - Title and URL are automatically detected
   - DOI is extracted if available in the URL
4. Select a group (optional):
   - If you have groups created in Nexus, select one from the dropdown
5. Click "Save to Nexus":
   - The paper will be ingested by the backend
   - PDF will be downloaded and processed
   - Embeddings will be generated for semantic search
   - Success message will appear and popup will close automatically

## Project Structure

```
extension/
├── src/
│   ├── manifest.json    # Extension manifest
│   ├── popup.html       # Popup UI
│   ├── popup.ts         # Popup logic (TypeScript)
│   ├── options.html     # Options page UI
│   ├── options.ts       # Options page logic (TypeScript)
│   ├── style.css        # Styling
│   └── icons/           # Extension icons
├── dist/                # Build output (generated)
├── package.json         # Bun package configuration
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite build configuration
└── README.md           # This file
```

## Supported Paper Sources

The extension works with any URL, but is optimized for:
- **ArXiv**: Automatically detects ArXiv IDs
- **DOI URLs**: Extracts DOI from `https://doi.org/...` URLs
- **Direct PDF links**: Any direct PDF URL
- **Paper repository pages**: Any webpage with paper information

## Troubleshooting

### Build Errors

- Ensure all dependencies are installed: `bun install`
- Check TypeScript errors: `bun run build` will show them
- Make sure `src/manifest.json` is valid JSON

### "Cannot connect to backend"

- Ensure the backend server is running at the configured URL
- Check the backend URL in extension options (right-click extension → Options)
- Verify the backend is accessible: open `http://localhost:8000/docs` in your browser

### Extension not loading

- Make sure you're loading the `dist/` folder, not `src/`
- Check browser console for errors (right-click extension popup → Inspect)
- Verify `dist/manifest.json` exists and is valid

### Changes not appearing

- Rebuild the extension: `bun run build`
- Reload the extension in `chrome://extensions/`
- Hard refresh the extension popup (close and reopen)

## Development Tips

- Use `bun run dev` for watch mode during development
- Check browser console for errors (right-click popup → Inspect)
- Use TypeScript for better IDE support and type checking
- The `dist/` folder is generated - don't edit it directly

## API Integration

The extension uses the following backend endpoints:

- `GET /api/v1/groups` - Fetch available groups
- `POST /api/v1/ingest` - Ingest a new paper

See the main project README for full API documentation.

## Permissions

The extension requires:
- `activeTab`: To access the current tab's URL and title
- `storage`: To save backend URL configuration
- `host_permissions`: To communicate with the backend API

## Browser Compatibility

- Chrome 88+
- Edge 88+
- Other Chromium-based browsers

## License

MIT
