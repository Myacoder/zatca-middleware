const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* =========================
   VALIDATION
========================= */
function validateInvoice(data) {
  const errors = [];
  if (!data.invoiceNumber) errors.push('invoiceNumber is required');
  if (!data.vatNumber) errors.push('vatNumber is required');
  if (!data.issueDate) errors.push('issueDate is required');
  if (typeof data.totalAmount !== 'number') {
    errors.push('totalAmount must be a number');
  }
  return errors;
}

/* =========================
   QR (ZATCA B2C – TLV)
========================= */
function generateZatcaB2CQR({ sellerName, vatNumber, timestamp, total, vat }) {
  const tlv = [
    Buffer.from([1, sellerName.length]), Buffer.from(sellerName),
    Buffer.from([2, vatNumber.length]), Buffer.from(vatNumber),
    Buffer.from([3, timestamp.length]), Buffer.from(timestamp),
    Buffer.from([4, total.toString().length]), Buffer.from(total.toString()),
    Buffer.from([5, vat.toString().length]), Buffer.from(vat.toString())
  ];
  return Buffer.concat(tlv).toString('base64');
}

/* =========================
   HTTP SERVER
========================= */
const server = http.createServer((req, res) => {

  /* ---- PILOT PAGE ---- */
  if (req.method === 'GET' && req.url === '/pilot') {
    const html = fs.readFileSync(
      path.join(__dirname, 'pilot.html'),
      'utf8'
    );

    const invoiceData = {
      invoiceNumber: 'INV-PILOT-001',
      vatNumber: '300123456700003',
      totalAmount: 115,
      vatAmount: 17.25,
      timestamp: new Date().toISOString(),
      qrImageBase64: generateZatcaB2CQR({
        sellerName: 'DEMO SELLER',
        vatNumber: '300123456700003',
        timestamp: new Date().toISOString(),
        total: 115,
        vat: 17.25
      })
    };

    const finalHtml = html.replace(
      'const data = window.INVOICE_DATA;',
      `const data = ${JSON.stringify(invoiceData)};`
    );

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(finalHtml);
    return;
  }

  /* ---- WEBHOOK ---- */
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('Webhook received:', body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'RECEIVED' }));
    });
    return;
  }

  /* ---- INVOICE API ---- */
  if (req.method === 'POST' && req.url === '/invoice') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ errors: ['Invalid JSON'] }));
      }

      const errors = validateInvoice(data);
      if (errors.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ errors }));
      }

      const total = data.totalAmount;
      const vat = Number((total * 0.15).toFixed(2));

      const qrBase64 = generateZatcaB2CQR({
        sellerName: data.sellerName || 'DEMO SELLER',
        vatNumber: data.vatNumber,
        timestamp: new Date().toISOString(),
        total,
        vat
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OK',
        qrBase64
      }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});