// ZATCA (Fatoora) e-invoicing helpers: UBL 2.1 XML, SHA-256 invoice hash chain,
// ECDSA (secp256k1) signature and Base64 TLV QR payload (tags 1-8).
import crypto from 'node:crypto';

export const INITIAL_PIH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export function generateKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  return {
    private_pem: privateKey.export({ type: 'sec1', format: 'pem' }),
    public_pem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

function tlv(tag, value) {
  const v = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return Buffer.concat([Buffer.from([tag, Math.min(v.length, 255)]), v.subarray(0, 255)]);
}

function party(p) {
  const id = p.cr_number ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(p.cr_number)}</cbc:ID></cac:PartyIdentification>` : '';
  const tax = p.vat_number ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(p.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '';
  return `<cac:Party>${id}<cac:PostalAddress><cbc:StreetName>${esc(p.street || p.address || '')}</cbc:StreetName><cbc:BuildingNumber>${esc(p.building_no || '0000')}</cbc:BuildingNumber><cbc:CitySubdivisionName>${esc(p.district || '')}</cbc:CitySubdivisionName><cbc:CityName>${esc(p.city || 'Riyadh')}</cbc:CityName><cbc:PostalZone>${esc(p.postal_code || '00000')}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>${tax}<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name || '')}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>`;
}

function buildXml(seller, inv, ext) {
  const subtype = inv.type === 'B2B' ? '0100000' : '0200000';
  const lines = (inv.lines || []).map((l, i) => `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">${esc(l.qty)}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">${m2(l.line_total)}</cbc:LineExtensionAmount><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${m2(l.vat_amount)}</cbc:TaxAmount><cbc:RoundingAmount currencyID="SAR">${m2(l.line_total + l.vat_amount)}</cbc:RoundingAmount></cac:TaxTotal><cac:Item><cbc:Name>${esc(l.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="SAR">${m2(l.unit_price)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">${ext ? ext.ubl : ''}<cbc:ProfileID>reporting:1.0</cbc:ProfileID><cbc:ID>${esc(inv.number)}</cbc:ID><cbc:UUID>${esc(inv.uuid)}</cbc:UUID><cbc:IssueDate>${esc(inv.issue_date)}</cbc:IssueDate><cbc:IssueTime>${esc(inv.issue_time)}</cbc:IssueTime><cbc:InvoiceTypeCode name="${subtype}">388</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode><cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${inv.icv}</cbc:UUID></cac:AdditionalDocumentReference><cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(inv.prev_hash)}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>${ext ? ext.qr : ''}${ext ? '<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>' : ''}<cac:AccountingSupplierParty>${party(seller)}</cac:AccountingSupplierParty><cac:AccountingCustomerParty>${party(inv.buyer || {})}</cac:AccountingCustomerParty><cac:Delivery><cbc:ActualDeliveryDate>${esc(inv.issue_date)}</cbc:ActualDeliveryDate></cac:Delivery><cac:PaymentMeans><cbc:PaymentMeansCode>${inv.type === 'B2B' ? '42' : '10'}</cbc:PaymentMeansCode></cac:PaymentMeans><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${m2(inv.vat)}</cbc:TaxAmount></cac:TaxTotal><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${m2(inv.vat)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">${m2(inv.subtotal)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">${m2(inv.vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="SAR">${m2(inv.subtotal)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="SAR">${m2(inv.subtotal)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="SAR">${m2(inv.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="SAR">${m2(inv.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lines}</Invoice>`;
}

export function computeLines(rawLines) {
  const lines = (rawLines || []).map((l) => {
    const qty = Number(l.qty) || 0, unit_price = Number(l.unit_price) || 0;
    const line_total = Math.round(qty * unit_price * 100) / 100;
    const vat_amount = Math.round(line_total * 0.15 * 100) / 100;
    return { description: String(l.description || '').slice(0, 300), qty, unit_price, line_total, vat_amount };
  }).filter((l) => l.description && l.qty > 0 && l.unit_price >= 0);
  const subtotal = Math.round(lines.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  const vat = Math.round(lines.reduce((s, l) => s + l.vat_amount, 0) * 100) / 100;
  return { lines, subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100 };
}

export function signInvoice({ company, inv, keys }) {
  const seller = { name: company.legal_name_en, cr_number: company.cr_number, vat_number: company.vat_number, street: company.street, building_no: company.building_no, district: company.district, city: company.city, postal_code: company.postal_code };
  const core = buildXml(seller, inv, null);
  const hash = crypto.createHash('sha256').update(core, 'utf8').digest('base64');
  const signature = crypto.sign('sha256', Buffer.from(hash, 'utf8'), crypto.createPrivateKey(keys.private_pem)).toString('base64');
  const pubDer = crypto.createPublicKey(keys.public_pem).export({ type: 'spki', format: 'der' });
  const ts = `${inv.issue_date}T${inv.issue_time}`;
  const qr = Buffer.concat([
    tlv(1, seller.name || ''), tlv(2, seller.vat_number || ''), tlv(3, ts), tlv(4, m2(inv.total)), tlv(5, m2(inv.vat)),
    tlv(6, hash), tlv(7, signature), tlv(8, pubDer),
  ]).toString('base64');
  const ubl = `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent><sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2"><sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/><ds:Reference Id="invoiceSignedData" URI=""><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${hash}</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>${signature}</ds:SignatureValue><ds:KeyInfo><ds:KeyValue>${pubDer.toString('base64')}</ds:KeyValue></ds:KeyInfo></ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;
  const qrRef = `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qr}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
  const xml = buildXml(seller, inv, { ubl, qr: qrRef });
  return { hash, signature, qr, xml, public_key: pubDer.toString('base64') };
}
