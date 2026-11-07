/* Generates RecoverOS brand PNGs (icon, adaptive icon, splash mark) without dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const TEAL = [13, 110, 99];
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Coverage (0..1) of the white mark at normalised coords, scaled into a box. */
function mark(x, y, scale, size) {
  const cx = 0.5, cy = 0.5;
  const u = (x - cx) / scale + 0.5, v = (y - cy) / scale + 0.5;
  const aa = 1.2 / (size * scale);
  const r = Math.hypot(u - 0.5, v - 0.5);
  const ring = Math.max(0, Math.min(1, (0.035 - Math.abs(r - 0.36)) / aa + 0.5));
  // Gap in the ring at the top-right (where the check exits), like a rising arrow.
  const ang = Math.atan2(v - 0.5, u - 0.5);
  const ringMasked = ang > -1.15 && ang < -0.35 ? 0 : ring;
  const d = Math.min(segDist(u, v, 0.33, 0.52, 0.45, 0.64), segDist(u, v, 0.45, 0.64, 0.74, 0.30));
  const check = Math.max(0, Math.min(1, (0.045 - d) / aa + 0.5));
  return Math.max(ringMasked, check);
}
const out = path.resolve(__dirname, '../assets');
fs.writeFileSync(path.join(out, 'icon.png'), png(1024, (x, y, s) => {
  const m = mark(x, y, 0.78, s);
  return [Math.round(TEAL[0] + (255 - TEAL[0]) * m), Math.round(TEAL[1] + (255 - TEAL[1]) * m), Math.round(TEAL[2] + (255 - TEAL[2]) * m), 255];
}));
fs.writeFileSync(path.join(out, 'adaptive-icon.png'), png(1024, (x, y, s) => [255, 255, 255, Math.round(255 * mark(x, y, 0.55, s))]));
fs.writeFileSync(path.join(out, 'splash-icon.png'), png(512, (x, y, s) => [255, 255, 255, Math.round(255 * mark(x, y, 0.9, s))]));
fs.writeFileSync(path.join(out, 'favicon.png'), png(64, (x, y, s) => {
  const m = mark(x, y, 0.8, s);
  return [Math.round(TEAL[0] + (255 - TEAL[0]) * m), Math.round(TEAL[1] + (255 - TEAL[1]) * m), Math.round(TEAL[2] + (255 - TEAL[2]) * m), 255];
}));
console.log('assets generated');
