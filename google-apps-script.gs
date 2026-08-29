/**
 * UNIFAHE — espelhamento de vendas aprovadas para Google Sheets.
 * Planilha: https://docs.google.com/spreadsheets/d/1BzqFOj4TaLjpgRmnocQxxlQq8O7wWeOQsxbTzZI0gUQ/
 * Aba: Vendas
 *
 * Segurança:
 * 1) Em Configurações do projeto > Propriedades do script, crie WEBHOOK_TOKEN.
 * 2) Use o MESMO valor em GOOGLE_SHEETS_WEBHOOK_TOKEN na Vercel.
 */

const SPREADSHEET_ID = '1BzqFOj4TaLjpgRmnocQxxlQq8O7wWeOQsxbTzZI0gUQ';
const SHEET_NAME = 'Vendas';

const REQUIRED_HEADERS = [
  'ID VENDA',
  'DATA',
  'VENDEDOR',
  'ALUNO',
  'TIPO PAGAMENTO',
  'TAXA / PARCELA',
  'PARCELAS',
  'VALOR TOTAL',
  'MODALIDADE',
  'PENDÊNCIA',
  'CURSO',
  'ESTADO',
  'ORIGEM',
  'QTD. CURSOS',
  'AUDITORIA',
  'AUDITADO POR',
  'DATA AUDITORIA',
  'QTD. COMPROVANTES',
  'COMPROVANTE 1',
  'COMPROVANTE 2',
  'COMPROVANTE 3',
  'CRIADO EM',
  'SINCRONIZADO EM'
];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedToken = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN') || '';
    if (!expectedToken || String(body.token || '') !== expectedToken) {
      return response_({ ok: false, error: 'Token inválido.' });
    }
    if (body.event !== 'sale.audit_ok') {
      return response_({ ok: false, error: 'Evento não suportado.' });
    }
    if (!body.sale || body.sale.audit_status !== 'ok') {
      return response_({ ok: false, error: 'Somente vendas com auditoria OK podem ser gravadas.' });
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('A aba "Vendas" não foi encontrada.');

    const headers = ensureHeaders_(sheet);
    const sale = body.sale;
    const receipts = Array.isArray(sale.receipts) ? sale.receipts.slice(0, 3) : [];
    const record = {
      'ID VENDA': sale.id || '',
      'DATA': sale.sale_date || '',
      'VENDEDOR': sale.seller_name || '',
      'ALUNO': sale.student_name || '',
      'TIPO PAGAMENTO': paymentLabel_(sale.payment_type),
      'TAXA / PARCELA': number_(sale.fee_value),
      'PARCELAS': number_(sale.installments),
      'VALOR TOTAL': number_(sale.total_value),
      'MODALIDADE': sale.modality || '',
      'PENDÊNCIA': sale.pending || '',
      'CURSO': sale.course || '',
      'ESTADO': sale.state || '',
      'ORIGEM': sale.origin || '',
      'QTD. CURSOS': number_(sale.course_quantity),
      'AUDITORIA': 'OK',
      'AUDITADO POR': sale.audited_by || '',
      'DATA AUDITORIA': sale.audited_at || '',
      'QTD. COMPROVANTES': receipts.length,
      'COMPROVANTE 1': receipts[0] ? receipts[0].name || '' : '',
      'COMPROVANTE 2': receipts[1] ? receipts[1].name || '' : '',
      'COMPROVANTE 3': receipts[2] ? receipts[2].name || '' : '',
      'CRIADO EM': sale.created_at || '',
      'SINCRONIZADO EM': new Date()
    };

    const row = findSaleRow_(sheet, headers, String(sale.id || ''));
    writeRecord_(sheet, headers, record, row);
    return response_({ ok: true, row: row || sheet.getLastRow(), sale_id: sale.id });
  } catch (error) {
    console.error(error);
    return response_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function ensureHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) { return String(v || '').trim(); });
  const isEmpty = headers.every(function(v) { return !v; });

  if (isEmpty) {
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    styleHeader_(sheet, REQUIRED_HEADERS.length);
    return REQUIRED_HEADERS.slice();
  }

  const missing = REQUIRED_HEADERS.filter(function(header) { return headers.indexOf(header) === -1; });
  if (missing.length) {
    const start = headers.length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
    styleHeader_(sheet, headers.length);
  }
  return headers;
}

function findSaleRow_(sheet, headers, saleId) {
  if (!saleId) return 0;
  const idColumn = headers.indexOf('ID VENDA') + 1;
  if (!idColumn || sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).createTextFinder(saleId).matchEntireCell(true).findNext();
  return finder ? finder.getRow() : 0;
}

function writeRecord_(sheet, headers, record, existingRow) {
  const row = existingRow || Math.max(sheet.getLastRow() + 1, 2);
  const current = existingRow ? sheet.getRange(row, 1, 1, headers.length).getValues()[0] : new Array(headers.length).fill('');
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(record, header)) current[index] = record[header];
  });
  sheet.getRange(row, 1, 1, headers.length).setValues([current]);

  const moneyHeaders = ['TAXA / PARCELA', 'VALOR TOTAL'];
  moneyHeaders.forEach(function(header) {
    const column = headers.indexOf(header) + 1;
    if (column) sheet.getRange(row, column).setNumberFormat('R$ #,##0.00');
  });
}

function styleHeader_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground('#122945')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
}

function paymentLabel_(type) {
  return ({ cartao: 'Cartão', boleto: 'Boleto', sem_taxa_migracao: 'Sem taxa migração' })[type] || type || '';
}

function number_(value) {
  const parsed = Number(value || 0);
  return isFinite(parsed) ? parsed : 0;
}

function response_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
