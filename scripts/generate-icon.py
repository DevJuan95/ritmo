"""Generate the Ritmo app icon with only the Python standard library."""

from math import cos, hypot, radians, sin
from pathlib import Path
import struct
import zlib


SIZE = 512
SAMPLES = 2
OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "icon.png"
ANGLE = radians(28)


def rounded_box(x, y, half_width, half_height, radius):
    dx = abs(x) - half_width + radius
    dy = abs(y) - half_height + radius
    return hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - radius


def pixel(x, y):
    red = green = blue = alpha = 0.0
    for sy in range(SAMPLES):
        for sx in range(SAMPLES):
            px = (x + (sx + 0.5) / SAMPLES) / SIZE
            py = (y + (sy + 0.5) / SAMPLES) / SIZE
            cx, cy = px - 0.5, py - 0.5
            if rounded_box(cx, cy, 0.445, 0.445, 0.105) > 0:
                continue

            # The navy tile and yellow rhythm mark match the in-app brand.
            color = (19 + int(20 * (1 - py)), 36 + int(31 * (1 - py)), 59 + int(48 * (1 - py)))
            distance = hypot(cx, cy)
            if 0.275 <= distance <= 0.327:
                color = (244, 200, 94)
            else:
                rotated_x = cx * cos(ANGLE) - cy * sin(ANGLE)
                rotated_y = cx * sin(ANGLE) + cy * cos(ANGLE)
                for bar_x, bar_height in ((-0.10, 0.105), (0.0, 0.205), (0.10, 0.105)):
                    if rounded_box(rotated_x - bar_x, rotated_y, 0.021, bar_height, 0.021) <= 0:
                        color = (244, 200, 94)
                        break

            red += color[0]
            green += color[1]
            blue += color[2]
            alpha += 1

    count = SAMPLES * SAMPLES
    if not alpha:
        return bytes((0, 0, 0, 0))
    return bytes((round(red / alpha), round(green / alpha), round(blue / alpha), round(255 * alpha / count)))


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def main():
    OUTPUT.parent.mkdir(exist_ok=True)
    rows = bytearray()
    for y in range(SIZE):
        rows.append(0)  # PNG filter: none
        for x in range(SIZE):
            rows.extend(pixel(x, y))
    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack(">2I5B", SIZE, SIZE, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", zlib.compress(rows, 9)))
    png.extend(chunk(b"IEND", b""))
    OUTPUT.write_bytes(png)


if __name__ == "__main__":
    main()
