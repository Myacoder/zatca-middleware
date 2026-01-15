const http = require('http');
const crypto = require('crypto');

function validateInvoice(data) {
  const errors = [];
    if (!data.invoiceNumber) errors.push('invoiceNumber is required');
      if (!data.vatNumber) errors.push('vatNumber is required');
        if (!data.issueDate) errors.push('issueDate is required');
          if (!data.totalAmount) errors.push('totalAmount is required');
            if (data.totalAmount && typeof data.totalAmount !== 'number') {
                errors.push('totalAmount must be a number');
                  }
                    return errors;
                    }

                    function jsonToZatcaXml(invoice, previousHash) {
                      return `
                      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
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

                                                                function base64Encode(text) {
                                                                  return Buffer.from(text).toString('base64');
                                                                  }

                                                                  function sha256Hash(text) {
                                                                    return crypto.createHash('sha256').update(text).digest('hex');
                                                                    }

                                                                    function simulateSignature(hash) {
                                                                      return crypto.createHash('sha256').update('SIGN-' + hash).digest('hex');
                                                                      }

                                                                      /**
                                                                       * MOCK ZATCA SANDBOX SUBMISSION
                                                                        * This simulates the exact response shape
                                                                         */
                                                                         function submitToZatcaSandbox(payload) {
                                                                           return {
                                                                               clearanceStatus: 'CLEARED',
                                                                                   reportingStatus: 'REPORTED',
                                                                                       uuid: crypto.randomUUID(),
                                                                                           timestamp: new Date().toISOString()
                                                                                             };
                                                                                             }

                                                                                             const server = http.createServer((req, res) => {
                                                                                               if (req.method === 'POST' && req.url === '/invoice') {
                                                                                                   let body = '';

                                                                                                       req.on('data', chunk => body += chunk.toString());
                                                                                                           req.on('end', () => {
                                                                                                                 let invoiceData;
                                                                                                                       try {
                                                                                                                               invoiceData = JSON.parse(body);
                                                                                                                                     } catch {
                                                                                                                                             res.writeHead(400, { 'Content-Type': 'application/json' });
                                                                                                                                                     return res.end(JSON.stringify({ status: 'ERROR', errors: ['Invalid JSON'] }));
                                                                                                                                                           }

                                                                                                                                                                 const errors = validateInvoice(invoiceData);
                                                                                                                                                                       if (errors.length > 0) {
                                                                                                                                                                               res.writeHead(400, { 'Content-Type': 'application/json' });
                                                                                                                                                                                       return res.end(JSON.stringify({ status: 'ERROR', errors }));
                                                                                                                                                                                             }

                                                                                                                                                                                                   const xml = jsonToZatcaXml(invoiceData, invoiceData.previousInvoiceHash);
                                                                                                                                                                                                         const base64Xml = base64Encode(xml);
                                                                                                                                                                                                               const hash = sha256Hash(base64Xml);
                                                                                                                                                                                                                     const signature = simulateSignature(hash);

                                                                                                                                                                                                                           // Payload exactly like ZATCA expects
                                                                                                                                                                                                                                 const zatcaPayload = {
                                                                                                                                                                                                                                         invoiceHash: hash,
                                                                                                                                                                                                                                                 uuid: crypto.randomUUID(),
                                                                                                                                                                                                                                                         invoice: base64Xml,
                                                                                                                                                                                                                                                                 signature
                                                                                                                                                                                                                                                                       };

                                                                                                                                                                                                                                                                             const zatcaResponse = submitToZatcaSandbox(zatcaPayload);

                                                                                                                                                                                                                                                                                   res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                                                                                                                                                                                                                                         res.end(JSON.stringify({
                                                                                                                                                                                                                                                                                                 status: 'SUBMITTED_TO_SANDBOX',
                                                                                                                                                                                                                                                                                                         request: zatcaPayload,
                                                                                                                                                                                                                                                                                                                 response: zatcaResponse
                                                                                                                                                                                                                                                                                                                       }));
                                                                                                                                                                                                                                                                                                                           });
                                                                                                                                                                                                                                                                                                                             } else {
                                                                                                                                                                                                                                                                                                                                 res.writeHead(404);
                                                                                                                                                                                                                                                                                                                                     res.end();
                                                                                                                                                                                                                                                                                                                                       }
                                                                                                                                                                                                                                                                                                                                       });

                                                                                                                                                                                                                                                                                                                                       const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`ZATCA sandbox submission (mock) running on port ${PORT}`);
});