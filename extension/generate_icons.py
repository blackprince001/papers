#!/usr/bin/env python3
"""
Simple script to generate placeholder icons for the extension.
Requires PIL (Pillow): pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow is required. Install with: pip install Pillow")
    exit(1)


def create_icon(size, output_path):
    """Create a simple icon with 'N' letter."""
    # Create image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw background circle
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(0, 0, 0, 255),  # Black circle
    )

    # Draw 'N' letter
    try:
        # Try to use a nice font
        font_size = int(size * 0.6)
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size
        )
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            # Fallback to default font
            font = ImageFont.load_default()

    # Calculate text position (centered)
    text = "N"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]

    # Draw white 'N'
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    # Save
    img.save(output_path, "PNG")
    print(f"Created {output_path} ({size}x{size})")


if __name__ == "__main__":
    import os

    icons_dir = os.path.join(os.path.dirname(__file__), "icons")
    os.makedirs(icons_dir, exist_ok=True)

    sizes = [16, 32, 48, 128]
    for size in sizes:
        output_path = os.path.join(icons_dir, f"icon{size}.png")
        create_icon(size, output_path)

    print("\nIcons generated successfully!")
    print("You can now load the extension in Chrome/Edge.")













