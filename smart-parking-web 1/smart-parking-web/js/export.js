// Export helpers: CSV, Excel (.xlsx) and PDF - all built in the browser, no internet or library needed.
const Export = (function () {
  const enc = new TextEncoder();

  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------------- CSV ----------------
  function csv(name, rows) {
    const text = rows.map(r => r.map(v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    save(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }), name);
  }

  // ---------------- XLSX (zip, stored) ----------------
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]),
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const x = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
                          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  function col(i) { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }

  // sheets: [{name, rows:[[...]], head:true}]   first row of each sheet is styled as a header when head is true
  function xlsx(fileName, sheets) {
    const sheetXml = sh => {
      const widths = [];
      sh.rows.forEach(r => r.forEach((v, i) => { widths[i] = Math.min(46, Math.max(widths[i] || 8, String(v == null ? "" : v).length + 2)); }));
      const rows = sh.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
        const ref = col(ci) + (ri + 1), st = sh.head !== false && ri === 0 ? ' s="1"' : "";
        if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"' + st + "><v>" + v + "</v></c>";
        return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + x(v == null ? "" : v) + "</t></is></c>";
      }).join("") + "</row>").join("");
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0">' + (sh.head !== false ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "") + "</sheetView></sheetViews>" +
        "<cols>" + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") + "</cols>" +
        "<sheetData>" + rows + "</sheetData></worksheet>";
    };
    const files = [
      { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") + "</Types>" },
      { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
          sheets.map((s, i) => '<sheet name="' + x(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
          '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB71C1C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ].concat(sheets.map((s, i) => ({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", text: sheetXml(s) })));
    save(zip(files), fileName);
  }

  // ---------------- PDF ----------------
  const latin = s => String(s == null ? "" : s).replace(/₹/g, "Rs. ").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "?");
  const pe = s => latin(s).replace(/[\\()]/g, "\\$&");
  const bytes = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const RED = "0.718 0.110 0.110", PINK = "0.992 0.925 0.925", GREY = "0.48 0.40 0.40";

  function loadLogo() {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = 120;
          const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 120, 120); g.drawImage(img, 0, 0, 120, 120);
          const d = g.getImageData(0, 0, 120, 120).data, rgb = new Uint8Array(120 * 120 * 3);
          for (let i = 0, j = 0; i < d.length; i += 4) { rgb[j++] = d[i]; rgb[j++] = d[i + 1]; rgb[j++] = d[i + 2]; }
          res(rgb);
        } catch (e) { res(null); }   // blocked when opened as a file:// page - PDF is made without the logo
      };
      img.onerror = () => res(null);
      img.src = "images/adcet-logo.png";
    });
  }

  // opts: {fileName, title, subtitle, summary:[[label,value]], head:[..], rows:[[..]], widths:[relative..]}
  async function pdf(opts) {
    const logo = await loadLogo();
    const PW = 595, PH = 842, M = 36, CW = PW - 2 * M;
    const pages = [];
    let cur, y;

    const text = (str, x0, y0, size, bold, color) =>
      "BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " + (color || "0.17 0.10 0.10") + " rg " + x0.toFixed(1) + " " + y0.toFixed(1) + " Td (" + pe(str) + ") Tj ET\n";
    const rect = (x0, y0, w, h, color) => color + " rg " + x0.toFixed(1) + " " + y0.toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1) + " re f\n";
    const fit = (s, w, size) => { s = latin(s); const n = Math.max(1, Math.floor(w / (size * 0.5))); return s.length > n ? s.slice(0, n - 1) + "." : s; };

    function newPage(first) {
      cur = ""; pages.push(cur = { c: "" });
      if (first) {
        cur.c += rect(0, PH - 78, PW, 78, RED);
        if (logo) cur.c += "q 54 0 0 54 " + M + " " + (PH - 66) + " cm /Im1 Do Q\n";
        const tx = logo ? M + 66 : M;
        cur.c += text("ADCET Smart Parking", tx, PH - 38, 20, true, "1 1 1");
        cur.c += text("Annasaheb Dange College of Engineering & Technology, Ashta", tx, PH - 53, 9, false, "1 0.9 0.9");
        cur.c += text("PDF generated by Omkar Joshi", tx, PH - 65, 8.5, true, "1 1 1");
        y = PH - 78 - 28;
        cur.c += text(opts.title, M, y, 15, true, RED);
        y -= 15;
        if (opts.subtitle) { cur.c += text(opts.subtitle, M, y, 9.5, false, GREY); y -= 8; }
        y -= 12;
      } else {
        cur.c += rect(0, PH - 26, PW, 26, RED) + text("ADCET Smart Parking - " + opts.title, M, PH - 17, 9, true, "1 1 1");
        y = PH - 26 - 24;
      }
    }

    newPage(true);

    // summary tiles, 3 per row
    if (opts.summary && opts.summary.length) {
      const per = 3, gap = 8, tw = (CW - gap * (per - 1)) / per, th = 38;
      opts.summary.forEach((s, i) => {
        const col = i % per;
        if (col === 0 && i) y -= th + gap;
        const x0 = M + col * (tw + gap);
        cur.c += rect(x0, y - th + 6, tw, th, PINK) + rect(x0, y - th + 6, 3, th, RED);
        cur.c += text(fit(s[0], tw - 14, 8), x0 + 10, y - 8, 8, false, GREY) + text(fit(s[1], tw - 14, 12), x0 + 10, y - 24, 12, true, RED);
      });
      y -= th + 18;
    }

    // table
    const total = opts.widths.reduce((a, b) => a + b, 0), cw = opts.widths.map(w => w / total * CW), FS = 7.5, RH = 17;
    function head() {
      cur.c += rect(M, y - 12, CW, RH, RED);
      let x0 = M;
      opts.head.forEach((h, i) => { cur.c += text(fit(h, cw[i] - 6, FS), x0 + 3, y - 7, FS, true, "1 1 1"); x0 += cw[i]; });
      y -= RH;
    }
    head();
    if (!opts.rows.length) { cur.c += text("No records for this period.", M + 3, y - 8, 9, false, GREY); y -= RH; }
    opts.rows.forEach((r, ri) => {
      if (y < M + 30) { newPage(false); head(); }
      if (ri % 2) cur.c += rect(M, y - 12, CW, RH, "0.99 0.96 0.96");
      let x0 = M;
      r.forEach((v, i) => { cur.c += text(fit(v, cw[i] - 6, FS), x0 + 3, y - 7, FS, false); x0 += cw[i]; });
      y -= RH;
    });

    // footers
    const stamp = "PDF generated by Omkar Joshi | " + new Date().toLocaleString("en-IN") + " | All Rights Reserved by Omkar Joshi";
    pages.forEach((p, i) => { p.c += text(stamp, M, 20, 7.5, false, GREY) + text("Page " + (i + 1) + " of " + pages.length, PW - M - 52, 20, 7.5, false, GREY); });

    // assemble the file
    const objs = [];                       // each: array of Uint8Array pieces
    const add = (...pieces) => { objs.push(pieces); return objs.length; };
    add(bytes("<< /Type /Catalog /Pages 2 0 R >>"));
    add(bytes("<< /Type /Pages /Kids [" + pages.map((_, i) => (6 + i * 2) + " 0 R").join(" ") + "] /Count " + pages.length + " >>"));
    add(bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
    add(bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
    if (logo) add(bytes("<< /Type /XObject /Subtype /Image /Width 120 /Height 120 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length " + logo.length + " >>\nstream\n"), logo, bytes("\nendstream"));
    else add(bytes("<< >>"));
    pages.forEach((p, i) => {
      const body = bytes(p.c);
      add(bytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>" +
        (logo ? " /XObject << /Im1 5 0 R >>" : "") + " >> /Contents " + (7 + i * 2) + " 0 R >>"));
      add(bytes("<< /Length " + body.length + " >>\nstream\n"), body, bytes("\nendstream"));
    });

    const out = [bytes("%PDF-1.4\n")];
    let pos = out[0].length;
    const offs = [];
    objs.forEach((pieces, i) => {
      offs.push(pos);
      const chunk = [bytes((i + 1) + " 0 obj\n")].concat(pieces, [bytes("\nendobj\n")]);
      chunk.forEach(c => { out.push(c); pos += c.length; });
    });
    let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    offs.forEach(o => { xref += String(o).padStart(10, "0") + " 00000 n \n"; });
    xref += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + pos + "\n%%EOF";
    out.push(bytes(xref));
    save(new Blob(out, { type: "application/pdf" }), opts.fileName);
  }

  return { csv, xlsx, pdf, save };
})();
