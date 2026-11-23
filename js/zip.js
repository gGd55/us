/* ===========================================================
   极简 ZIP 打包器（仅 store 存储，不压缩）
   JPEG 本身已压缩，store 模式体积影响很小，换来零依赖。
   用法：
     const blob = createZip([{ name: "photos/a.jpg", data: uint8 }]);
   =========================================================== */

(function (global) {
  "use strict";

  // ---- CRC32 ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  function dosTime(d) {
    return (
      ((d.getHours() & 0x1f) << 11) |
      ((d.getMinutes() & 0x3f) << 5) |
      ((d.getSeconds() / 2) & 0x1f)
    );
  }

  function dosDate(d) {
    return (
      (((d.getFullYear() - 1980) & 0x7f) << 9) |
      (((d.getMonth() + 1) & 0x0f) << 5) |
      (d.getDate() & 0x1f)
    );
  }

  function createZip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const time = dosTime(now);
    const date = dosDate(now);

    files.forEach((f) => {
      const nameBytes = utf8(f.name);
      const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const crc = crc32(data);
      const size = data.length;

      // ----- local file header -----
      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); // signature
      lv.setUint16(4, 20, true); // version needed
      lv.setUint16(6, 0x0800, true); // flags: UTF-8 names
      lv.setUint16(8, 0, true); // method: store
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true); // extra length
      lh.set(nameBytes, 30);

      chunks.push(lh, data);

      // ----- central directory entry -----
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true); // version made by
      cv.setUint16(6, 20, true); // version needed
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true); // external attrs
      cv.setUint32(42, offset, true); // local header offset
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += lh.length + data.length;
    });

    const centralStart = offset;
    let centralSize = 0;
    central.forEach((c) => {
      chunks.push(c);
      centralSize += c.length;
      offset += c.length;
    });

    // ----- end of central directory -----
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    ev.setUint16(20, 0, true);
    chunks.push(eocd);

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    chunks.forEach((c) => {
      out.set(c, p);
      p += c.length;
    });
    return out;
  }

  global.createZip = createZip;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createZip, crc32 };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
