'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outputDir = path.join(__dirname, '..', 'assets');
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function roundedRect(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function render(size) {
  const scale = 4;
  const dimension = size * scale;
  const pixels = Buffer.alloc(dimension * dimension * 4);
  const bars = [
    [0.219, 0.559, 0.359, 0.777],
    [0.430, 0.426, 0.570, 0.777],
    [0.641, 0.246, 0.781, 0.777],
  ];

  for (let y = 0; y < dimension; y++) {
    for (let x = 0; x < dimension; x++) {
      const nx = (x + 0.5) / dimension;
      const ny = (y + 0.5) / dimension;
      const offset = (y * dimension + x) * 4;
      if (!roundedRect(nx, ny, 0.047, 0.047, 0.953, 0.953, 0.211)) continue;

      const mix = (nx + ny) / 2;
      pixels[offset] = Math.round(17 + (36 - 17) * mix);
      pixels[offset + 1] = Math.round(24 + (19 - 24) * mix);
      pixels[offset + 2] = Math.round(39 + (61 - 39) * mix);
      pixels[offset + 3] = 255;

      for (let index = 0; index < bars.length; index++) {
        const [left, top, right, bottom] = bars[index];
        if (!roundedRect(nx, ny, left, top, right, bottom, (right - left) / 2)) continue;
        const gradient = Math.min(1, Math.max(0, (nx - 0.219) / 0.562));
        const stops = gradient < 0.52
          ? [[34, 211, 238], [139, 92, 246], gradient / 0.52]
          : [[139, 92, 246], [236, 72, 153], (gradient - 0.52) / 0.48];
        pixels[offset] = Math.round(stops[0][0] + (stops[1][0] - stops[0][0]) * stops[2]);
        pixels[offset + 1] = Math.round(stops[0][1] + (stops[1][1] - stops[0][1]) * stops[2]);
        pixels[offset + 2] = Math.round(stops[0][2] + (stops[1][2] - stops[0][2]) * stops[2]);
      }

      const dx = nx - 0.738;
      const dy = ny - 0.203;
      if (dx * dx + dy * dy <= 0.039 * 0.039) {
        pixels[offset] = 248;
        pixels[offset + 1] = 250;
        pixels[offset + 2] = 252;
      }
    }
  }

  const downsampled = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const source = (((y * scale + sy) * dimension) + (x * scale + sx)) * 4;
          for (let channel = 0; channel < 4; channel++) sums[channel] += pixels[source + channel];
        }
      }
      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel++) downsampled[target + channel] = Math.round(sums[channel] / 16);
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    downsampled.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const images = iconSizes.map((size) => ({ size, data: render(size) }));
const icoHeader = Buffer.alloc(6 + images.length * 16);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(images.length, 4);
let offset = icoHeader.length;
images.forEach(({ size, data }, index) => {
  const entry = 6 + index * 16;
  icoHeader[entry] = size === 256 ? 0 : size;
  icoHeader[entry + 1] = size === 256 ? 0 : size;
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(data.length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'app-icon.png'), images.at(-1).data);
fs.writeFileSync(path.join(outputDir, 'app-icon.ico'), Buffer.concat([icoHeader, ...images.map((image) => image.data)]));
console.log('[icons] assets/app-icon.png y assets/app-icon.ico generados.');
