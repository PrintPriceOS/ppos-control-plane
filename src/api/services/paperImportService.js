/**
 * src/api/services/paperImportService.js
 * 
 * Engine for parsing, normalizing, validating, and staging paper catalogs
 * from ODS, XLSX, and CSV formats.
 * 
 * Invariants:
 * 1. Zero external untracked heavy packages (pure Node.js / built-in zlib / Buffer).
 * 2. Format auto-detection by inspecting binary magic bytes / content structure.
 * 3. Complete audit traceability: file_sha256, sheet_name, row_number, raw_data, normalization_rules_version.
 * 4. Technical isolation: DOES NOT create commercial offers, DOES NOT mutate inventory, DOES NOT alter pricing engine costs.
 * 5. Ambiguous dimensions or units flagged as WARNING/issues; zero/empty prices flagged without guessing currency.
 * 6. Deduplication fingerprinting on physical variant properties (name, gsm, width_mm, height_mm, finish).
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');

const NORMALIZATION_RULES_VERSION = '1.0.0';

/**
 * Detect file format from buffer content.
 * Returns 'ODS' | 'XLSX' | 'CSV' | 'UNKNOWN'
 */
function detectFormat(buffer) {
    if (!buffer || buffer.length < 4) return 'UNKNOWN';

    // Check PK magic number (Zip archive: ODS or XLSX)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
        // Inspect archive entries or mimetype
        const preview = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
        if (preview.includes('opendocument.spreadsheet') || preview.includes('content.xml')) {
            return 'ODS';
        }
        if (preview.includes('xl/workbook.xml') || preview.includes('[Content_Types].xml')) {
            return 'XLSX';
        }
        // Try reading zip central directory / entry names
        try {
            const entries = listZipEntryNames(buffer);
            if (entries.includes('content.xml') || entries.includes('mimetype')) {
                return 'ODS';
            }
            if (entries.some(e => e.startsWith('xl/') || e === '[Content_Types].xml')) {
                return 'XLSX';
            }
        } catch (e) {
            // fallback
        }
        return 'ODS'; // Default zip-based spreadsheet fallback
    }

    // CSV detection: check if text-like and contains commas or semicolons
    const textPreview = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('utf8');
    if (/^[^\x00-\x08\x0B\x0C\x0E-\x1F]+$/.test(textPreview)) {
        if (textPreview.includes(',') || textPreview.includes(';') || textPreview.includes('\t') || textPreview.includes('\n')) {
            return 'CSV';
        }
    }

    return 'UNKNOWN';
}

/**
 * List names of entries in a ZIP buffer.
 */
function listZipEntryNames(buffer) {
    const eocdSignature = 0x06054b50;
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
        if (buffer.readUInt32LE(i) === eocdSignature) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) return [];

    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    const cdRecords = buffer.readUInt16LE(eocdOffset + 8);
    const names = [];
    let offset = cdOffset;

    for (let i = 0; i < cdRecords; i++) {
        if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
        const nameLen = buffer.readUInt16LE(offset + 28);
        const extraLen = buffer.readUInt16LE(offset + 30);
        const commentLen = buffer.readUInt16LE(offset + 32);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
        names.push(name);
        offset += 46 + nameLen + extraLen + commentLen;
    }
    return names;
}

/**
 * Extract single entry buffer from a ZIP archive.
 */
function extractZipEntry(buffer, targetName) {
    const eocdSignature = 0x06054b50;
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
        if (buffer.readUInt32LE(i) === eocdSignature) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) throw new Error('Invalid zip file: EOCD not found');

    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    const cdRecords = buffer.readUInt16LE(eocdOffset + 8);
    let offset = cdOffset;

    for (let i = 0; i < cdRecords; i++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
        const method = buffer.readUInt16LE(offset + 10);
        const compSize = buffer.readUInt32LE(offset + 20);
        const nameLen = buffer.readUInt16LE(offset + 28);
        const extraLen = buffer.readUInt16LE(offset + 30);
        const commentLen = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);

        if (name === targetName) {
            const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
            const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const compData = buffer.subarray(dataOffset, dataOffset + compSize);

            if (method === 0) {
                return compData;
            } else if (method === 8) {
                return zlib.inflateRawSync(compData);
            } else {
                throw new Error(`Unsupported compression method ${method}`);
            }
        }
        offset += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`Entry '${targetName}' not found in zip`);
}

/**
 * Parse OpenDocument Spreadsheet (ODS) buffer into structured rows.
 */
function parseOdsBuffer(buffer) {
    const contentXmlBuffer = extractZipEntry(buffer, 'content.xml');
    const contentXml = contentXmlBuffer.toString('utf8');

    // Find sheets/tables
    const tableRegex = /<table:table\s+[^>]*table:name="([^"]+)"(.*?)<\/table:table>/gs;
    let tables = [...contentXml.matchAll(tableRegex)];

    // Fallback if table tag doesn't close or has single sheet
    if (tables.length === 0) {
        tables = [['', 'Sheet1', contentXml]];
    }

    const resultSheets = [];

    for (const tableMatch of tables) {
        const sheetName = tableMatch[1] || 'Sheet1';
        const tableBody = tableMatch[2] || tableMatch[0];

        const rowRegex = /<table:table-row(?:\s+[^>]*)?>(.*?)<\/table:table-row>/gs;
        let headerRow = null;
        const dataRows = [];

        for (const rowMatch of tableBody.matchAll(rowRegex)) {
            const rowXml = rowMatch[1];
            const cells = [];
            const cellMatches = [...rowXml.matchAll(/<table:table-cell(?:\s+([^>]*?))?(?:\/>|>(.*?)<\/table:table-cell>)/gs)];

            for (const cm of cellMatches) {
                const attrs = cm[1] || '';
                const inner = cm[2] || '';
                let repeat = 1;
                const repMatch = attrs.match(/table:number-columns-repeated="(\d+)"/);
                if (repMatch) repeat = parseInt(repMatch[1], 10);

                let cellText = '';
                if (inner) {
                    const textParts = [];
                    for (const p of inner.matchAll(/<text:p[^>]*>(.*?)<\/text:p>/gs)) {
                        const cleanText = p[1].replace(/<[^>]+>/g, '').trim();
                        if (cleanText) textParts.push(cleanText);
                    }
                    cellText = textParts.join(' ');
                }

                // Skip huge repeated empty trailing fillers
                if (repeat > 50 && !cellText) continue;
                for (let r = 0; r < Math.min(repeat, 50); r++) {
                    cells.push(cellText);
                }
            }

            const hasAnyText = cells.some(c => c && c.trim() !== '');
            if (hasAnyText) {
                if (!headerRow) {
                    // Normalize header row: trim trailing empty cells
                    while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
                    headerRow = cells;
                } else {
                    dataRows.push(cells);
                }
            }
        }

        resultSheets.push({
            sheetName,
            headers: headerRow || [],
            rows: dataRows
        });
    }

    return resultSheets;
}

/**
 * Parse CSV buffer into structured rows.
 */
function parseCsvBuffer(buffer) {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [{ sheetName: 'Sheet1', headers: [], rows: [] }];

    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

    const parseLine = (line) => {
        const row = [];
        let inQuotes = false;
        let token = '';
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    token += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                row.push(token.trim());
                token = '';
            } else {
                token += char;
            }
        }
        row.push(token.trim());
        return row;
    };

    const headers = parseLine(lines[0]);
    const dataRows = lines.slice(1).map(line => parseLine(line));

    return [{
        sheetName: 'Sheet1',
        headers,
        rows: dataRows
    }];
}

/**
 * Parse XLSX buffer into structured rows (minimal XML unpacker for workbook + sheet1).
 */
function parseXlsxBuffer(buffer) {
    // 1. Shared strings
    let sharedStrings = [];
    try {
        const ssXml = extractZipEntry(buffer, 'xl/sharedStrings.xml').toString('utf8');
        const siMatches = [...ssXml.matchAll(/<si>(.*?)<\/si>/gs)];
        sharedStrings = siMatches.map(m => {
            const textParts = [];
            for (const t of m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)) {
                textParts.push(t[1]);
            }
            return textParts.join('');
        });
    } catch (e) {
        // Shared strings might not exist if inline strings are used
    }

    // 2. Sheet 1
    const sheetXml = extractZipEntry(buffer, 'xl/worksheets/sheet1.xml').toString('utf8');
    const rowMatches = [...sheetXml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)];

    const allRows = [];
    for (const rMatch of rowMatches) {
        const rowXml = rMatch[1];
        const cellMatches = [...rowXml.matchAll(/<c\s+r="([A-Z]+)(\d+)"(?:\s+t="([^"]+)")?[^>]*>(?:<v>(.*?)<\/v>)?(?:<is><t>(.*?)<\/t><\/is>)?<\/c>/gs)];
        
        // Map column letters to 0-based indices: A=0, B=1, ...
        const colMap = {};
        for (const cm of cellMatches) {
            const colLetters = cm[1];
            let colIdx = 0;
            for (let i = 0; i < colLetters.length; i++) {
                colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64);
            }
            colIdx -= 1;

            const type = cm[3] || '';
            const val = cm[4] !== undefined ? cm[4] : (cm[5] || '');
            let cellValue = val;
            if (type === 's' && sharedStrings[parseInt(val, 10)] !== undefined) {
                cellValue = sharedStrings[parseInt(val, 10)];
            }
            colMap[colIdx] = cellValue;
        }

        const maxCol = Math.max(-1, ...Object.keys(colMap).map(Number));
        if (maxCol >= 0) {
            const rowCells = [];
            for (let i = 0; i <= maxCol; i++) {
                rowCells.push(colMap[i] || '');
            }
            allRows.push(rowCells);
        }
    }

    const headers = allRows[0] || [];
    const rows = allRows.slice(1);
    return [{
        sheetName: 'Sheet1',
        headers,
        rows
    }];
}

/**
 * Universal buffer parser according to detected format.
 */
function parseSpreadsheetBuffer(buffer, forcedFormat = null) {
    const format = forcedFormat || detectFormat(buffer);
    if (format === 'ODS') {
        return { format: 'ODS', sheets: parseOdsBuffer(buffer) };
    } else if (format === 'XLSX') {
        return { format: 'XLSX', sheets: parseXlsxBuffer(buffer) };
    } else if (format === 'CSV') {
        return { format: 'CSV', sheets: parseCsvBuffer(buffer) };
    } else {
        throw new Error(`UNSUPPORTED_FORMAT: Could not detect or parse format '${format}'`);
    }
}

function normalizeRowData(rawCells, headers = [], rowIndex = 1) {
    // Build a case-insensitive header-to-index map if headers are provided
    const headerMap = {};
    if (Array.isArray(headers) && headers.length > 0) {
        headers.forEach((h, idx) => {
            if (h && typeof h === 'string') {
                const normH = h.trim().toUpperCase();
                headerMap[normH] = idx;
            }
        });
    }

    const getVal = (namedKey, positionalIdx) => {
        if (headerMap[namedKey] !== undefined) {
            return (rawCells[headerMap[namedKey]] || '').trim();
        }
        return (rawCells[positionalIdx] || '').trim();
    };

    // Standard Column Lookup (named with positional fallback for canonical ODS):
    const code = getVal('CODE', 0);
    const qr = getVal('QR', 1);
    const name = getVal('NAME', 2);
    const priceStr = getVal('PRICE', 3);
    const micronsStr = getVal('MIKRONS', 4);
    const thicknessMmStr = getVal('THICKNESS (MM)', 5);
    const formatStr = getVal('FORMAT', 6);
    const gramsStr = getVal('GRAMS', 7);
    const coatStr = getVal('COAT', 9);
    const minQtyStr = getVal('MIN. QUANTITY', 10);
    const stepsUnitsStr = getVal('STEPS/UNITS', 11);
    const sortimentStr = getVal('SORTIMET', 12);
    const widthStr = getVal('WIDTH (MM)', 13) || getVal('WIDTH', 13);
    const heightStr = getVal('HEIGHTS (MM)', 14) || getVal('HEIGHT (MM)', 14) || getVal('HEIGHT', 14);
    const paperTypeStr = getVal('PAPER TYPE', 15) || getVal('TYPE', 15);
    const providerStr = getVal('PROVISER', 16) || getVal('PROVIDER', 16);
    const aktivStr = getVal('AKTIV', 17) || getVal('ACTIVE', 17);

    const issues = [];

    // 1. Validate Product Name
    if (!name) {
        issues.push({
            code: 'MISSING_NAME',
            severity: 'ERROR',
            message: 'Product name is missing or empty'
        });
    }

    // 2. Normalize GSM (Grammage)
    let gsm = null;
    if (gramsStr) {
        const parsedGsm = parseInt(gramsStr.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsedGsm) && parsedGsm > 0) {
            gsm = parsedGsm;
        }
    }
    // Fallback extraction from name if not in column
    if (!gsm && name) {
        const nameGsmMatch = name.match(/\b(\d{2,4})\s*(?:gsm|g|gr)\b/i) || name.match(/\b(\d{2,4})\b/);
        if (nameGsmMatch) {
            const val = parseInt(nameGsmMatch[1], 10);
            if (val >= 40 && val <= 1000) {
                gsm = val;
            }
        }
    }
    if (!gsm) {
        issues.push({
            code: 'MISSING_GSM',
            severity: 'WARNING',
            message: 'GSM (grammage) could not be determined with certainty'
        });
    }

    // 3. Normalize Dimensions (Width & Height in mm)
    let width_mm = null;
    let height_mm = null;
    let isDimensionAmbiguous = false;

    // Check columns 13 and 14
    const rawW = parseFloat(widthStr.replace(',', '.'));
    const rawH = parseFloat(heightStr.replace(',', '.'));

    if (!isNaN(rawW) && !isNaN(rawH) && rawW > 0 && rawH > 0) {
        // Detect if dimensions are in cm (< 250) or in mm (>= 250)
        // Standard paper sizes: 70x100 is 70cm x 100cm = 700mm x 1000mm
        // 640x920 is already mm
        if (rawW <= 200 && rawH <= 250) {
            // High evidence of cm units (e.g., 70 x 100 cm -> 700 x 1000 mm)
            width_mm = Math.round(rawW * 10);
            height_mm = Math.round(rawH * 10);
        } else {
            width_mm = Math.round(rawW);
            height_mm = Math.round(rawH);
        }
    } else if (formatStr) {
        // Try parsing FORMAT column (e.g., "B1 70 x 100", "A1 640 x 920", "64x92")
        const dimMatch = formatStr.match(/(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)/);
        if (dimMatch) {
            const parsedW = parseFloat(dimMatch[1].replace(',', '.'));
            const parsedH = parseFloat(dimMatch[2].replace(',', '.'));
            if (parsedW <= 200 && parsedH <= 250) {
                width_mm = Math.round(parsedW * 10);
                height_mm = Math.round(parsedH * 10);
            } else {
                width_mm = Math.round(parsedW);
                height_mm = Math.round(parsedH);
            }
        }
    }

    // Fallback extraction from name (e.g., "70x100", "64x92")
    if ((!width_mm || !height_mm) && name) {
        const nameDimMatch = name.match(/\b(\d{2,4})\s*[xX*]\s*(\d{2,4})\b/);
        if (nameDimMatch) {
            const parsedW = parseFloat(nameDimMatch[1]);
            const parsedH = parseFloat(nameDimMatch[2]);
            if (parsedW <= 200 && parsedH <= 250) {
                width_mm = Math.round(parsedW * 10);
                height_mm = Math.round(parsedH * 10);
            } else {
                width_mm = Math.round(parsedW);
                height_mm = Math.round(parsedH);
            }
        }
    }

    if (!width_mm || !height_mm) {
        issues.push({
            code: 'MISSING_DIMENSIONS',
            severity: 'WARNING',
            message: 'Width and Height dimensions could not be parsed'
        });
        isDimensionAmbiguous = true;
    } else {
        // Sanity check dimensions: width and height between 100mm and 3000mm
        if (width_mm < 100 || height_mm < 100 || width_mm > 3000 || height_mm > 3000) {
            issues.push({
                code: 'AMBIGUOUS_DIMENSION_UNITS',
                severity: 'WARNING',
                message: `Parsed dimensions ${width_mm}x${height_mm} mm are outside standard sheet range and require review`
            });
            isDimensionAmbiguous = true;
        }
    }

    // 4. Normalize Caliper / Thickness
    let caliper_um = null;
    let caliper_mm = null;
    if (micronsStr) {
        const parsedMicrons = parseInt(micronsStr.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsedMicrons) && parsedMicrons > 0) {
            caliper_um = parsedMicrons;
            caliper_mm = parseFloat((caliper_um / 1000).toFixed(4));
        }
    }
    if (!caliper_mm && thicknessMmStr) {
        const parsedThick = parseFloat(thicknessMmStr.replace(',', '.'));
        if (!isNaN(parsedThick) && parsedThick > 0) {
            caliper_mm = parsedThick;
            caliper_um = Math.round(caliper_mm * 1000);
        }
    }

    // 5. Price & Commercial Signal Validation (DO NOT ASSUME CURRENCY OR PUBLISH)
    let rawPrice = null;
    let priceStatus = 'CONFIRMED';
    if (!priceStr || priceStr.trim() === '') {
        priceStatus = 'EMPTY_PRICE';
        issues.push({
            code: 'EMPTY_PRICE',
            severity: 'WARNING',
            message: 'Price is not specified in source sheet'
        });
    } else {
        rawPrice = parseFloat(priceStr.replace(',', '.'));
        if (isNaN(rawPrice) || rawPrice === 0) {
            priceStatus = 'ZERO_PRICE';
            issues.push({
                code: 'ZERO_PRICE',
                severity: 'WARNING',
                message: 'Price is zero in source sheet; flagged as unpriced/review required'
            });
        }
    }

    // Flag absence of declared currency and price basis
    issues.push({
        code: 'CURRENCY_NOT_DECLARED',
        severity: 'INFO',
        message: 'No currency declared in file; commercial offer creation deferred'
    });

    // 6. Paper Classification / Category
    let category = 'OTHER';
    const typeUpper = (paperTypeStr + ' ' + name).toUpperCase();
    if (typeUpper.includes('KARTONS') || typeUpper.includes('CARTON') || typeUpper.includes('GC1') || typeUpper.includes('GC2')) {
        category = 'CARTON';
    } else if (typeUpper.includes('OFSET') || typeUpper.includes('OFFSET')) {
        category = 'OFFSET';
    } else if (typeUpper.includes('KRĪTOTS') || typeUpper.includes('COATED') || typeUpper.includes('GLOSS') || typeUpper.includes('SILK')) {
        category = 'COATED';
    } else if (typeUpper.includes('NEKRĪTOTS') || typeUpper.includes('UNCOATED')) {
        category = 'UNCOATED';
    } else if (typeUpper.includes('DIZAINA') || typeUpper.includes('DESIGN')) {
        category = 'DESIGN';
    } else if (typeUpper.includes('DIGITĀL') || typeUpper.includes('DIGITAL')) {
        category = 'DIGITAL';
    }

    // 7. Finish
    let finish = 'UNCOATED';
    const coatLower = (coatStr + ' ' + paperTypeStr + ' ' + name).toLowerCase();
    if (coatLower.includes('krītots') || coatLower.includes('coated') || coatLower.includes('gloss')) {
        finish = 'COATED';
    } else if (coatLower.includes('matt') || coatLower.includes('zīda') || coatLower.includes('silk')) {
        finish = 'SILK';
    }

    // 8. Physical Fingerprint (for deduplication and variant identity)
    const normalizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const fpString = `${normalizedName}|${gsm || 0}|${width_mm || 0}x${height_mm || 0}|${finish}`;
    const fingerprint = crypto.createHash('sha256').update(fpString).digest('hex').substring(0, 32);

    // 9. Proposed Supplier Matching
    let proposedSupplierMatch = null;
    const provUpper = providerStr.toUpperCase();
    if (provUpper.includes('ANTALIS')) {
        proposedSupplierMatch = { supplierCode: 'ANTALIS', label: 'Antalis', confidence: 'HIGH' };
    } else if (provUpper.includes('POLAP')) {
        proposedSupplierMatch = { supplierCode: 'POLAP', label: 'Polap', confidence: 'HIGH' };
    } else if (provUpper.includes('PAPYRUS')) {
        proposedSupplierMatch = { supplierCode: 'PAPYRUS', label: 'Papyrus', confidence: 'HIGH' };
    } else if (provUpper.includes('DARDEDZE')) {
        proposedSupplierMatch = { supplierCode: 'DARDEDZE', label: 'Dardedze hologrāfija', confidence: 'MEDIUM' };
    } else if (providerStr.trim()) {
        proposedSupplierMatch = { supplierCode: 'OTHER', label: providerStr.trim(), confidence: 'LOW' };
    }

    // Overall Row Status
    const hasErrors = issues.some(i => i.severity === 'ERROR');
    const hasWarnings = issues.some(i => i.severity === 'WARNING');
    const validationStatus = hasErrors ? 'REJECTED' : (hasWarnings ? 'WARNING' : 'VALID');

    return {
        rowNumber: rowIndex,
        code,
        name,
        category,
        finish,
        gsm,
        caliper_um,
        caliper_mm,
        width_mm,
        height_mm,
        fingerprint,
        priceStatus,
        rawPrice,
        proposedSupplierMatch,
        providerLabel: providerStr,
        issues,
        validationStatus
    };
}

/**
 * Process a file buffer into a preview batch with validation, duplicates, and issues.
 */
async function processImportPreview({ buffer, fileName, tenantId, supplierId, createdBy }) {
    const format = detectFormat(buffer);
    if (format === 'UNKNOWN') {
        throw new Error('UNSUPPORTED_FORMAT: Could not detect valid ODS, XLSX, or CSV file.');
    }

    const fileSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const parseResult = parseSpreadsheetBuffer(buffer, format);

    const sheet = parseResult.sheets[0] || { sheetName: 'Sheet1', headers: [], rows: [] };
    const rawRows = sheet.rows;

    let validCount = 0;
    let issueCount = 0;
    let duplicateCount = 0;

    const seenFingerprints = new Set();
    const normalizedRows = [];

    rawRows.forEach((row, idx) => {
        const rowNumber = idx + 1; // 1-indexed data row
        const norm = normalizeRowData(row, sheet.headers, rowNumber);

        // Check internal duplicate within this batch
        if (seenFingerprints.has(norm.fingerprint)) {
            norm.validationStatus = 'DUPLICATE';
            norm.issues.push({
                code: 'DUPLICATE_IN_FILE',
                severity: 'WARNING',
                message: `Duplicate technical variant fingerprint in file (${norm.fingerprint})`
            });
            duplicateCount++;
        } else {
            seenFingerprints.add(norm.fingerprint);
            if (norm.validationStatus === 'VALID') validCount++;
            else if (norm.validationStatus === 'WARNING') issueCount++;
            else issueCount++;
        }

        normalizedRows.push({
            rowNumber,
            sheetName: sheet.sheetName,
            rawCells: row,
            normalized: norm,
            validationStatus: norm.validationStatus,
            issues: norm.issues
        });
    });

    const batchId = `imp_batch_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // Staging to database if DB is available, or return in-memory preview
    return {
        batchId,
        fileName,
        fileSha256,
        format,
        normalizationRulesVersion: NORMALIZATION_RULES_VERSION,
        tenantId,
        supplierId: supplierId || null,
        createdBy,
        summary: {
            totalRows: rawRows.length,
            validRows: validCount,
            issueRows: issueCount,
            duplicateRows: duplicateCount
        },
        rows: normalizedRows
    };
}

/**
 * Persist import batch and granular rows to DB.
 */
async function stageImportBatch(previewData) {
    const { batchId, tenantId, supplierId, fileName, fileSha256, format, summary, createdBy, rows } = previewData;

    await db.query(
        `INSERT INTO paper_import_batches 
        (id, tenant_id, supplier_id, file_name, file_sha256, format, total_rows, valid_rows, issue_rows, duplicate_rows, normalization_rules_version, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PREVIEW', ?)`,
        [
            batchId,
            tenantId,
            supplierId || null,
            fileName,
            fileSha256,
            format,
            summary.totalRows,
            summary.validRows,
            summary.issueRows,
            summary.duplicateRows,
            NORMALIZATION_RULES_VERSION,
            createdBy
        ]
    );

    // Bulk insert rows in chunks of 200
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];

        chunk.forEach(r => {
            const rowId = `imp_row_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
            placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)');
            values.push(
                rowId,
                batchId,
                r.rowNumber,
                r.sheetName,
                JSON.stringify(r.rawCells),
                JSON.stringify(r.normalized),
                JSON.stringify(r.issues),
                r.validationStatus,
                'PENDING'
            );
        });

        await db.query(
            `INSERT INTO paper_import_rows 
            (id, batch_id, row_number, sheet_name, raw_data_json, normalized_data_json, issues_json, validation_status, decision)
            VALUES ${placeholders.join(', ')}`,
            values
        );
    }

    return { batchId, status: 'STAGED', summary };
}

/**
 * Confirm technical import batch.
 * Inserts confirmed records into paper_products and paper_variants.
 * DOES NOT create commercial offers or touch inventory!
 */
async function confirmImportBatch({ batchId, tenantId, actorId, selectedDecisions = null }) {
    // 1. Verify batch exists and is in PREVIEW
    const [batchRows] = await db.query(
        'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ?',
        [batchId, tenantId]
    );
    const batch = Array.isArray(batchRows) ? batchRows[0] : batchRows;
    if (!batch) {
        throw new Error('BATCH_NOT_FOUND: Import batch not found for tenant');
    }
    if (batch.status === 'CONFIRMED') {
        return { ok: true, status: 'ALREADY_CONFIRMED', batchId, message: 'Batch was already confirmed previously.' };
    }

    // 2. Fetch staged rows
    const [rows] = await db.query(
        'SELECT * FROM paper_import_rows WHERE batch_id = ? ORDER BY row_number ASC',
        [batchId]
    );

    let confirmedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
        const norm = typeof row.normalized_data_json === 'string' ? JSON.parse(row.normalized_data_json) : row.normalized_data_json;
        
        // Skip explicitly rejected rows or rows that have unresolvable errors
        if (row.validationStatus === 'REJECTED') {
            skippedCount++;
            continue;
        }

        if (selectedDecisions && selectedDecisions[row.id] === 'REJECT') {
            await db.query('UPDATE paper_import_rows SET decision = "REJECTED" WHERE id = ?', [row.id]);
            skippedCount++;
            continue;
        }

        if (!norm.name || !norm.width_mm || !norm.height_mm || !norm.gsm) {
            skippedCount++;
            continue;
        }

        // Upsert paper_product
        const productId = `prod_${crypto.createHash('md5').update(norm.name.toLowerCase()).digest('hex').substring(0, 16)}`;
        await db.query(
            `INSERT INTO paper_products (id, name, category, finish_summary, description, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
            [
                productId,
                norm.name,
                norm.category,
                norm.finish,
                `Imported from batch ${batchId}`,
                JSON.stringify({ original_code: norm.code, provider_label: norm.providerLabel })
            ]
        );

        // Upsert paper_variant with unique fingerprint
        const variantId = `var_${crypto.createHash('md5').update(norm.fingerprint).digest('hex').substring(0, 16)}`;
        await db.query(
            `INSERT INTO paper_variants 
             (id, product_id, gsm, caliper_um, caliper_mm, width_mm, height_mm, finish, fingerprint, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
            [
                variantId,
                productId,
                norm.gsm,
                norm.caliper_um,
                norm.caliper_mm,
                norm.width_mm,
                norm.height_mm,
                norm.finish,
                norm.fingerprint,
                JSON.stringify({ original_code: norm.code, batch_id: batchId })
            ]
        );

        await db.query(
            'UPDATE paper_import_rows SET decision = "ACCEPTED", mapped_product_id = ?, mapped_variant_id = ? WHERE id = ?',
            [productId, variantId, row.id]
        );
        confirmedCount++;
    }

    // 3. Mark batch confirmed
    await db.query(
        'UPDATE paper_import_batches SET status = "CONFIRMED", confirmed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [batchId]
    );

    return {
        ok: true,
        batchId,
        status: 'CONFIRMED',
        confirmedProducts: confirmedCount,
        skippedRows: skippedCount
    };
}

module.exports = {
    detectFormat,
    parseOdsBuffer,
    parseCsvBuffer,
    parseXlsxBuffer,
    parseSpreadsheetBuffer,
    normalizeRowData,
    processImportPreview,
    stageImportBatch,
    confirmImportBatch,
    NORMALIZATION_RULES_VERSION
};
