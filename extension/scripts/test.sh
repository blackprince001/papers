#!/bin/bash

# Build the extension
echo "Building extension..."
bun run build

if [ $? -ne 0 ]; then
  echo "Build failed!"
  exit 1
fi

echo ""
echo "✓ Extension built successfully!"
echo ""
echo "To test the extension:"
echo "1. Open Chrome/Edge and go to chrome://extensions/ (or edge://extensions/)"
echo "2. Enable 'Developer mode' (toggle in top-right)"
echo "3. Click 'Load unpacked'"
echo "4. Select the 'dist' folder in this directory:"
echo "   $(pwd)/dist"
echo ""
echo "Or use the browser command:"
echo "  chrome://extensions/"
















