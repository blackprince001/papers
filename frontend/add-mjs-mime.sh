#!/bin/sh
# Add .mjs extension to application/javascript MIME type in nginx mime.types file

MIME_TYPES_FILE="/etc/nginx/mime.types"

# Check if mjs is already present
if grep -q "application/javascript.*mjs" "$MIME_TYPES_FILE" 2>/dev/null; then
    exit 0
fi

# Add mjs to the application/javascript line
# nginx mime.types format: "    application/javascript    js;"
# Use sed to add mjs after js in the application/javascript line only
sed -i -E 's/^([[:space:]]*application\/javascript[[:space:]]+[^;]*js)(;)$/\1 mjs\2/' "$MIME_TYPES_FILE" 2>/dev/null || {
    # Fallback: if sed with -E doesn't work, try without
    sed -i 's/\(application\/javascript.*\)js;/\1js mjs;/' "$MIME_TYPES_FILE" 2>/dev/null || {
        # Last resort: use awk to modify the line
        awk '
        /^[[:space:]]*application\/javascript[[:space:]]+/ && !/mjs/ {
            sub(/js;/, "js mjs;")
        }
        { print }
        ' "$MIME_TYPES_FILE" > /tmp/mime.types.tmp && mv /tmp/mime.types.tmp "$MIME_TYPES_FILE"
    }
}

exit 0

