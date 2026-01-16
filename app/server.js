const http = require('http');
const crypto = require('crypto');

/* ====================================================
   1. VALIDATION
==================================================== */
function validateInvoice(data) {
  const errors = [];
  if (!data.invoiceNumber) errors.push('invoiceNumber is required');
  if (!data.vatNumber) errors.push('vatNumber is required');
  if (!data.issueDate) errors.push('issueDate is required');
  if (data.totalAmount === undefined) errors.push('totalAmount is required');
  if (data.totalAmount !== undefined && typeof data.totalAmount !== 'number') {
    errors.push('totalAmount must be a number');
  }
  return errors;
}

/* ====================================================
   2. ZATCA-STYLE XML GENERATION
==================================================== */
function jsonToZatcaXml(invoice, previousHash) {
  return `
<Invoice
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${invoice.invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PreviousInvoiceHash</cbc:ID>
    <cbc:UUID>${previousHash || 'FIRST_INVOICE'}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:CompanyID>${invoice.vatNumber}</cbc:CompanyID>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="SAR">${invoice.totalAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>
`.trim();
}

/* ====================================================
   3. ENCODING & HASHING
==================================================== */
function base64Encode(text) {
  return Buffer.from(text).toString('base64');
}

function sha256Hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function simulateSignature(hash) {
  return crypto.createHash('sha256').update('SIGN-' + hash).digest('hex');
}

/* ====================================================
   4. MOCK ZATCA SANDBOX RESPONSE
==================================================== */
function submitToZatcaSandbox(payload) {
  return {
    clearanceStatus: 'CLEARED',
    reportingStatus: 'REPORTED',
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString()
  };
}

/* ====================================================
   4A. ZATCA B2C QR GENERATOR (REAL)
==================================================== */
function generateZatcaB2CQR({ sellerName, vatNumber, timestamp, total, vat }) {
  const tlv = [
    Buffer.from([1, Buffer.byteLength(sellerName)]),
    Buffer.from(sellerName),

    Buffer.from([2, Buffer.byteLength(vatNumber)]),
    Buffer.from(vatNumber),

    Buffer.from([3, Buffer.byteLength(timestamp)]),
    Buffer.from(timestamp),

    Buffer.from([4, Buffer.byteLength(total.toString())]),
    Buffer.from(total.toString()),

    Buffer.from([5, Buffer.byteLength(vat.toString())]),
    Buffer.from(vat.toString())
  ];

  return Buffer.concat(tlv).toString('base64');
}

/* ====================================================
   5. HTTP SERVER
==================================================== */
const server = http.createServer((req, res) => {

  /* -------------------------------
     WEBHOOK (LOYVERSE)
  -------------------------------- */
  if (req.method === 'POST' && req.url.startsWith('/webhook')) {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      console.log('Webhook received:', body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'RECEIVED' }));
    });
    return;
  }

  /* -------------------------------
     MANUAL INVOICE TEST ENDPOINT
  -------------------------------- */
  if (req.method === 'POST' && req.url === '/invoice') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      let invoiceData;
      try {
        invoiceData = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          status: 'ERROR',
          errors: ['Invalid JSON']
        }));
      }

      const errors = validateInvoice(invoiceData);
      if (errors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          status: 'ERROR',
          errors
        }));
      }

      const xml = jsonToZatcaXml(invoiceData, invoiceData.previousInvoiceHash);
      const base64Xml = base64Encode(xml);
      const hash = sha256Hash(base64Xml);
      const signature = simulateSignature(hash);

      const zatcaPayload = {
        invoiceHash: hash,
        uuid: crypto.randomUUID(),
        invoice: base64Xml,
        signature
      };

      const sellerName = invoiceData.sellerName || 'DEMO SELLER';
      const vatNumber = invoiceData.vatNumber;
      const timestamp = new Date().toISOString();
      const total = invoiceData.totalAmount;
      const vat = Number((total * 0.15).toFixed(2));

      const qrBase64 = generateZatcaB2CQR({
        sellerName,
        vatNumber,
        timestamp,
        total,
        vat
      });

      const zatcaResponse = submitToZatcaSandbox(zatcaPayload);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'SUBMITTED_TO_SANDBOX',
        uuid: zatcaPayload.uuid,
        invoiceHash: hash,
        qrBase64,
        response: zatcaResponse
      }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

/* ====================================================
   6. START SERVER
==================================================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ZATCA sandbox middleware running on port ${PORT}`);
});