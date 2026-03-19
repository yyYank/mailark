const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Open file dialog
ipcMain.handle('open-mbox-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'mbox files', extensions: ['mbox', 'mbx', ''] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Read and parse mbox file (streaming to avoid string length limit)
ipcMain.handle('read-mbox', async (event, filePath) => {
  try {
    return await parseMboxStream(filePath);
  } catch (err) {
    return { error: err.message };
  }
});

// Save attachment to temp and open
ipcMain.handle('save-attachment', async (event, { filename, data }) => {
  const tmpDir = os.tmpdir();
  const outPath = path.join(tmpDir, filename);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  shell.openPath(outPath);
  return outPath;
});

// ─── mbox parser ────────────────────────────────────────────────────────────

// Stream-based mbox parser to handle files larger than V8 string limit (~512MB)
function parseMboxStream(filePath) {
  return new Promise((resolve, reject) => {
    const emails = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    let currentLines = [];
    let inMessage = false;

    rl.on('line', (line) => {
      if (/^From .+/.test(line)) {
        // Start of a new message
        if (inMessage && currentLines.length > 0) {
          try {
            const raw = currentLines.join('\n');
            const email = parseEmail(raw);
            if (email) emails.push(email);
          } catch (e) {
            // skip malformed
          }
          currentLines = [];
        }
        inMessage = true;
      } else if (inMessage) {
        currentLines.push(line);
      }
    });

    rl.on('close', () => {
      // Process the last message
      if (inMessage && currentLines.length > 0) {
        try {
          const raw = currentLines.join('\n');
          const email = parseEmail(raw);
          if (email) emails.push(email);
        } catch (e) {
          // skip malformed
        }
      }
      resolve(emails);
    });

    rl.on('error', reject);
  });
}

function parseMbox(content) {
  const emails = [];
  // Split on "From " separator lines
  const rawMessages = content.split(/^From .+\r?\n/m).filter(Boolean);

  for (const raw of rawMessages) {
    try {
      const email = parseEmail(raw);
      if (email) emails.push(email);
    } catch (e) {
      // skip malformed
    }
  }

  return emails;
}

function parseEmail(raw) {
  const [headerSection, ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const bodyRaw = bodyParts.join('\n\n');

  // Parse headers
  const headers = {};
  const headerLines = headerSection.replace(/\r?\n\s+/g, ' ').split(/\r?\n/);
  for (const line of headerLines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const key = match[1].toLowerCase();
      headers[key] = decodeHeader(match[2]);
    }
  }

  if (!headers['from'] && !headers['subject']) return null;

  // Parse MIME
  const contentType = headers['content-type'] || 'text/plain';
  const { body, attachments, htmlBody } = parseMimePart(contentType, headers['content-transfer-encoding'] || '', bodyRaw, raw);

  return {
    id: Math.random().toString(36).substr(2, 9),
    from: headers['from'] || '(不明)',
    to: headers['to'] || '',
    subject: headers['subject'] || '(件名なし)',
    date: headers['date'] || '',
    dateObj: parseDate(headers['date']),
    body: body || '',
    htmlBody: htmlBody || '',
    attachments,
    raw: raw.substring(0, 200),
  };
}

function parseMimePart(contentType, encoding, bodyRaw, fullRaw) {
  let body = '';
  let htmlBody = '';
  let attachments = [];

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);

  if (boundaryMatch) {
    // Multipart
    const boundary = boundaryMatch[1];
    const parts = fullRaw.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
    for (const part of parts.slice(1)) {
      const [partHeaderRaw, ...partBodyParts] = part.split(/\r?\n\r?\n/);
      const partBody = partBodyParts.join('\n\n').trim();
      const partHeaders = {};
      const partHeaderLines = partHeaderRaw.replace(/\r?\n\s+/g, ' ').split(/\r?\n/);
      for (const line of partHeaderLines) {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (m) partHeaders[m[1].toLowerCase()] = m[2];
      }
      const partCT = partHeaders['content-type'] || 'text/plain';
      const partEnc = partHeaders['content-transfer-encoding'] || '';
      const partDisp = partHeaders['content-disposition'] || '';
      const filenameMatch = partCT.match(/name="?([^";]+)"?/i) || partDisp.match(/filename="?([^";]+)"?/i);

      if (partCT.includes('text/plain') && !partDisp.includes('attachment')) {
        body = decodeBody(partBody, partEnc);
      } else if (partCT.includes('text/html') && !partDisp.includes('attachment')) {
        htmlBody = decodeBody(partBody, partEnc);
      } else if (filenameMatch || partDisp.includes('attachment')) {
        attachments.push({
          filename: filenameMatch ? filenameMatch[1] : 'attachment',
          contentType: partCT.split(';')[0].trim(),
          data: partBody.replace(/\s/g, ''),
          encoding: partEnc,
        });
      } else if (partCT.includes('multipart/')) {
        // nested multipart
        const nested = parseMimePart(partCT, partEnc, partBody, part);
        if (nested.body) body = nested.body;
        if (nested.htmlBody) htmlBody = nested.htmlBody;
        attachments = attachments.concat(nested.attachments);
      }
    }
  } else {
    // Single part
    if (contentType.includes('text/html')) {
      htmlBody = decodeBody(bodyRaw, encoding);
    } else {
      body = decodeBody(bodyRaw, encoding);
    }
  }

  return { body, htmlBody, attachments };
}

function decodeBody(body, encoding) {
  const enc = (encoding || '').toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
    } catch { return body; }
  }
  if (enc === 'quoted-printable') {
    return body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

function decodeHeader(value) {
  if (!value) return '';
  // RFC2047 encoded words: =?charset?encoding?text?=
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, text) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf-8');
      } else {
        const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        return decoded;
      }
    } catch { return text; }
  });
}

function parseDate(dateStr) {
  if (!dateStr) return 0;
  try { return new Date(dateStr).getTime(); } catch { return 0; }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
