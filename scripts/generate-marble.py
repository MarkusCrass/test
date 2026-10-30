"""Generate the game's original, seamless checker-stone textures as PPM files.

No external imagery: deterministic procedural sine waves and analytic tile seams.
Convert with ImageMagick: convert marble_checker_diffuse.ppm -quality 92 marble_checker_diffuse.jpg
and likewise for marble_checker_normal.ppm. The resulting maps are game assets.
"""
import math
import os
import sys

SIZE = 512
out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)
heights = []
pixels = bytearray()

def clamp(value):
    return max(0, min(255, round(value)))

for y in range(SIZE):
    row = []
    v = y / SIZE
    for x in range(SIZE):
        u = x / SIZE
        tx, ty = u * 6, v * 6
        tile_x, tile_y = int(tx), int(ty)
        fx, fy = tx - tile_x, ty - tile_y
        edge = min(fx, fy, 1 - fx, 1 - fy)
        grout = max(0.0, 1.0 - edge / 0.033)
        # Integer-frequency waves tile cleanly on both edges.
        wave = (math.sin(2 * math.pi * (u * 5 + v * 3 + .15 * math.sin(2 * math.pi * v * 4)))
                + .55 * math.sin(2 * math.pi * (u * 13 - v * 9))
                + .25 * math.sin(2 * math.pi * (u * 61 + v * 53)))
        veins = abs(math.sin(2 * math.pi * (u * 2 - v * 3 + .09 * wave))) ** 22
        mottled = wave * 5 - veins * 8
        light = (tile_x + tile_y) % 2 == 0
        base = (185, 190, 192) if light else (102, 108, 111)
        shade = 1 - .30 * grout
        pixels.extend(clamp((channel + mottled) * shade) for channel in base)
        row.append(.018 * wave + .09 * (1 - grout))
    heights.append(row)

normal = bytearray()
for y in range(SIZE):
    for x in range(SIZE):
        dx = (heights[y][(x + 1) % SIZE] - heights[y][(x - 1) % SIZE]) * 3.0
        dy = (heights[(y + 1) % SIZE][x] - heights[(y - 1) % SIZE][x]) * 3.0
        length = math.sqrt(dx * dx + dy * dy + 1)
        normal.extend((clamp(127.5 * (1 - dx / length)), clamp(127.5 * (1 - dy / length)), clamp(127.5 * (1 + 1 / length))))

for name, data in [('marble_checker_diffuse', pixels), ('marble_checker_normal', normal)]:
    with open(os.path.join(out, name + '.ppm'), 'wb') as image:
        image.write(f'P6\n{SIZE} {SIZE}\n255\n'.encode())
        image.write(data)
