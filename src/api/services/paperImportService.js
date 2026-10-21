/**
 * src/api/services/paperImportService.js
 * 
 * Engine for parsing, normalizing, validating, staging, reviewing,
 * and confirming paper technical catalogs from ODS, XLSX, and CSV formats.
 * 
 * Invariants:
 * 1. Zero external untracked heavy packages (pure Node.js / built-in zlib / Buffer).
 * 2. Format auto-detection by inspecting binary magic bytes and content structure.
 * 3. Complete audit traceability: file_sha256, sheet_name, original row_number, raw_data, normalization_rules_version.
 * 4. Technical isolation: DOES NOT create commercial offers, DOES NOT mutate inventory, DOES NOT alter pricing engine costs.
 * 5. Strict units & evidence-based normalization:
 *    - Respect explicit header units. Never transform mm to cm based on numeric thresholds.
 *    - Flag conflicting or ambiguous units/dimensions as WARNING/issues; require explicit review decision.
 *    - Correct UNCOATED vs COATED (and NEKRĪTOTS vs KRĪTOTS) without partial match inversions.
 *    - Preserve physical differences (thickness/caliper, grain, finish) in variant fingerprint.
 * 6. Full review flow & atomicity:
 *    - Paginated query of staged rows with filter by validation_status and decision.
 *    - Updating row decisions and manual override corrections.
 *    - Atomic confirmation with row locks (SELECT ... FOR UPDATE) and rollback on failure.
 *    - Pending technical issues are NOT confirmed by default.
 *    - Commercial issues (unpriced, no currency) do not block pure technical catalog confirmation.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');

const NORMALIZATION_RULES_VERSION = '1.1.0';

// Safety thresholds to prevent resource exhaustion / zip bombs
const MAX_UNCOMPRESSED_ENTRY_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_TOTAL_ROWS = 25000;
const MAX_CELLS_PER_ROW = 100;

/**
 * Detect file format from buffer content.
 * Returns 'ODS' | 'XLSX' | 'CSV' | 'UNKNOWN'
 */
function detectFormat(buffer) {
    if (!buffer || buffer.length < 4) return 'UNKNOWN';

    // Check PK magic number (Zip archive: ODS or XLSX)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
        try {
            const entries = listZipEntryNames(buffer);
            if (entries.includes('mimetype')) {
                try {
                    const mime = extractZipEntry(buffer, 'mimetype').toString('utf8').trim();
                    if (mime.includes('opendocument.spreadsheet')) return 'ODS';
                } catch (e) {}
            }
            if (entries.includes('content.xml')) {
                return 'ODS';
            }
            if (entries.some(e => e.startsWith('xl/') || e === '[Content_Types].xml')) {
                return 'XLSX';
            }
        } catch (e) {
            // Not a valid zip
            return 'UNKNOWN';
        }
        return 'UNKNOWN';
    }

    // CSV detection: check text content
    const textPreview = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf8');
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
 * Extract single entry buffer from a ZIP archive with size guard.
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
        const uncompSize = buffer.readUInt32LE(offset + 24);
        const nameLen = buffer.readUInt16LE(offset + 28);
        const extraLen = buffer.readUInt16LE(offset + 30);
        const commentLen = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);

        if (name === targetName) {
            if (uncompSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
                throw new Error(`FILE_TOO_LARGE: Uncompressed zip entry ${targetName} exceeds limit of ${MAX_UNCOMPRESSED_ENTRY_BYTES} bytes`);
            }
            const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
            const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const compData = buffer.subarray(dataOffset, dataOffset + compSize);

            if (method === 0) {
                return compData;
            } else if (method === 8) {
                return zlib.inflateRawSync(compData, { maxOutputLength: MAX_UNCOMPRESSED_ENTRY_BYTES });
            } else {
                throw new Error(`Unsupported compression method ${method}`);
            }
        }
        offset += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`Entry '${targetName}' not found in zip`);
}

/**
 * Parse OpenDocument Spreadsheet (ODS) buffer into structured sheets and rows.
 */
function parseOdsBuffer(buffer, targetSheetName = null) {
    const contentXmlBuffer = extractZipEntry(buffer, 'content.xml');
    const contentXml = contentXmlBuffer.toString('utf8');

    // Find all sheets (<table:table table:name="...">)
    const tableRegex = /<table:table\s+[^>]*table:name="([^"]+)"(.*?)<\/table:table>/gs;
    let tables = [...contentXml.matchAll(tableRegex)];

    if (tables.length === 0) {
        tables = [['', 'Sheet1', contentXml]];
    }

    const resultSheets = [];

    for (const tableMatch of tables) {
        const sheetName = tableMatch[1] || 'Sheet1';
        if (targetSheetName && sheetName !== targetSheetName) {
            continue;
        }

        const tableBody = tableMatch[2] || tableMatch[0];
        const rowRegex = /<table:table-row(?:\s+[^>]*)?>(.*?)<\/table:table-row>/gs;
        let headerRow = null;
        const dataRows = [];
        let sourceFileRowIndex = 0;

        for (const rowMatch of tableBody.matchAll(rowRegex)) {
            sourceFileRowIndex++;
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

                if (repeat > MAX_CELLS_PER_ROW && !cellText) continue;
                for (let r = 0; r < Math.min(repeat, MAX_CELLS_PER_ROW); r++) {
                    cells.push(cellText);
                }
            }

            const hasAnyText = cells.some(c => c && c.trim() !== '');
            if (hasAnyText) {
                if (!headerRow) {
                    while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
                    headerRow = cells;
                } else {
                    dataRows.push({
                        fileRowNumber: sourceFileRowIndex,
                        cells
                    });
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
 * Robust RFC 4180 compliant CSV parser with quote escaping and multiline field support.
 */
function parseCsvBuffer(buffer) {
    const text = buffer.toString('utf8');
    if (!text.trim()) return [{ sheetName: 'Sheet1', headers: [], rows: [] }];

    // Detect delimiter from first non-empty line
    const firstLinePreview = text.split(/\r?\n/)[0] || '';
    const delimiter = (firstLinePreview.match(/;/g) || []).length > (firstLinePreview.match(/,/g) || []).length ? ';' : ',';

    const records = [];
    let currentRecord = [];
    let currentField = '';
    let inQuotes = false;
    let fileLineNumber = 1;
    let recordStartLine = 1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '\n') {
            fileLineNumber++;
        }

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++; // Skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            currentRecord.push(currentField.trim());
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
                fileLineNumber++;
            }
            currentRecord.push(currentField.trim());
            if (currentRecord.some(c => c.length > 0)) {
                records.push({ fileRowNumber: recordStartLine, cells: currentRecord });
            }
            currentRecord = [];
            currentField = '';
            recordStartLine = fileLineNumber;
        } else {
            currentField += char;
        }
    }

    if (currentField.length > 0 || currentRecord.length > 0) {
        currentRecord.push(currentField.trim());
        if (currentRecord.some(c => c.length > 0)) {
            records.push({ fileRowNumber: recordStartLine, cells: currentRecord });
        }
    }

    if (records.length === 0) return [{ sheetName: 'Sheet1', headers: [], rows: [] }];

    const headers = records[0].cells;
    const dataRows = records.slice(1);

    return [{
        sheetName: 'Sheet1',
        headers,
        rows: dataRows
    }];
}

/**
 * Parse XLSX buffer supporting multiple sheets, shared strings, and inline strings.
 */
function parseXlsxBuffer(buffer, targetSheetName = null) {
    const entryNames = listZipEntryNames(buffer);

    // 1. Shared strings
    let sharedStrings = [];
    if (entryNames.includes('xl/sharedStrings.xml')) {
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
        } catch (e) {}
    }

    // 2. Discover sheets from workbook.xml
    const sheetMap = [];
    if (entryNames.includes('xl/workbook.xml')) {
        try {
            const wbXml = extractZipEntry(buffer, 'xl/workbook.xml').toString('utf8');
            const sMatches = [...wbXml.matchAll(/<sheet\s+[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/gs)];
            sMatches.forEach((m, idx) => {
                const name = m[1];
                const sheetIndex = idx + 1;
                const pathName = `xl/worksheets/sheet${sheetIndex}.xml`;
                if (entryNames.includes(pathName)) {
                    sheetMap.push({ name, path: pathName });
                }
            });
        } catch (e) {}
    }

    if (sheetMap.length === 0) {
        // Fallback to searching all sheets in zip
        entryNames.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/.test(e)).forEach((e, idx) => {
            sheetMap.push({ name: `Sheet${idx + 1}`, path: e });
        });
    }

    const resultSheets = [];

    for (const sInfo of sheetMap) {
        if (targetSheetName && sInfo.name !== targetSheetName) {
            continue;
        }

        const sheetXml = extractZipEntry(buffer, sInfo.path).toString('utf8');
        const rowMatches = [...sheetXml.matchAll(/<row\s+r="(\d+)"[^>]*>(.*?)<\/row>/gs)];

        const rawRowsWithIndex = [];
        let headerCells = null;

        for (const rMatch of rowMatches) {
            const fileRowNumber = parseInt(rMatch[1], 10);
            const rowXml = rMatch[2];
            const cellMatches = [...rowXml.matchAll(/<c\s+r="([A-Z]+)(\d+)"(?:\s+t="([^"]+)")?[^>]*>(?:<v>(.*?)<\/v>)?(?:<is><t>(.*?)<\/t><\/is>)?<\/c>/gs)];

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
                colMap[colIdx] = (cellValue || '').trim();
            }

            const maxCol = Math.max(-1, ...Object.keys(colMap).map(Number));
            if (maxCol >= 0) {
                const rowCells = [];
                for (let i = 0; i <= maxCol; i++) {
                    rowCells.push(colMap[i] || '');
                }
                if (rowCells.some(c => c.length > 0)) {
                    if (!headerCells) {
                        headerCells = rowCells;
                    } else {
                        rawRowsWithIndex.push({
                            fileRowNumber,
                            cells: rowCells
                        });
                    }
                }
            }
        }

        resultSheets.push({
            sheetName: sInfo.name,
            headers: headerCells || [],
            rows: rawRowsWithIndex
        });
    }

    return resultSheets;
}

/**
 * Universal buffer parser according to detected format.
 */
function parseSpreadsheetBuffer(buffer, forcedFormat = null, targetSheetName = null) {
    const format = forcedFormat || detectFormat(buffer);
    if (format === 'ODS') {
        return { format: 'ODS', sheets: parseOdsBuffer(buffer, targetSheetName) };
    } else if (format === 'XLSX') {
        return { format: 'XLSX', sheets: parseXlsxBuffer(buffer, targetSheetName) };
    } else if (format === 'CSV') {
        return { format: 'CSV', sheets: parseCsvBuffer(buffer) };
    } else {
        throw new Error(`UNSUPPORTED_FORMAT: Could not detect or parse format '${format}'`);
    }
}

/**
 * Parse and normalize grain direction from text declaration.
 * Returns 'LONG_GRAIN' | 'SHORT_GRAIN' | 'UNKNOWN'.
 */
/**
 * Parse and normalize dimension string with optional explicit unit (mm, cm, m, in).
 * If no unit in string, defaults to fallbackUnit (e.g. from header).
 * Returns { raw, unit, mm } where mm is null if unit is unknown.
 */
function normalizeDimensionValue(valStr, fallbackUnit = null) {
    if (!valStr || typeof valStr !== 'string') return null;
    const match = valStr.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|m|in|inch|inches)?$/i);
    if (!match) return null;
    const num = parseFloat(match[1].replace(',', '.'));
    if (isNaN(num) || num <= 0) return null;
    let unit = (match[2] || '').toLowerCase() || fallbackUnit || null;
    let mm = null;
    if (unit === 'mm') mm = num;
    else if (unit === 'cm') mm = num * 10;
    else if (unit === 'm') mm = num * 1000;
    else if (unit === 'in' || unit === 'inch' || unit === 'inches') mm = num * 25.4;
    return { raw: num, unit, mm };
}

/**
 * Parse FORMAT dimension string (e.g., "70 x 100 cm", "100 x 150 mm", "B1 720 x 1020").
 * Normalizes units to mm when units are declared or inferable.
 */
function parseFormatDimensions(formatStr) {
    if (!formatStr || typeof formatStr !== 'string') return null;
    const match = formatStr.match(/([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|m|in)?\s*[xX*]\s*([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|m|in)?/i);
    if (!match) return null;
    const val1 = parseFloat(match[1].replace(',', '.'));
    const unit1 = (match[2] || '').toLowerCase();
    const val2 = parseFloat(match[3].replace(',', '.'));
    const unit2 = (match[4] || '').toLowerCase();
    const commonUnit = unit2 || unit1 || null;
    const uW = unit1 || commonUnit;
    const uH = unit2 || commonUnit;

    const toMm = (val, u) => {
        if (!u) return null;
        if (u === 'mm') return val;
        if (u === 'cm') return val * 10;
        if (u === 'm') return val * 1000;
        if (u === 'in') return val * 25.4;
        return null;
    };

    return {
        rawW: val1,
        unitW: uW,
        mmW: toMm(val1, uW),
        rawH: val2,
        unitH: uH,
        mmH: toMm(val2, uH)
    };
}

function parseGrainDirection(text) {
    if (!text) return 'UNKNOWN';
    const upper = String(text).toUpperCase();
    if (/\b(LONG[\s_]*GRAIN|LG|GARĀ[\s_]*ŠĶIEDRA|BB|BREITBAHN)\b/.test(upper)) return 'LONG_GRAIN';
    if (/\b(SHORT[\s_]*GRAIN|SG|ĪSĀ[\s_]*ŠĶIEDRA|SB|SCHMALBAHN)\b/.test(upper)) return 'SHORT_GRAIN';
    return 'UNKNOWN';
}

/**
 * Compute deterministic variant fingerprint incorporating name, gsm, dimensions, finish, caliper, and grain.
 */
function computeVariantFingerprint({ name, gsm, width_mm, height_mm, finish, caliper_um, grain_direction }) {
    const normalizedName = (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const grain = grain_direction || 'UNKNOWN';
    const fpString = `${normalizedName}|${gsm || 0}|${width_mm || 0}x${height_mm || 0}|${finish || 'UNCOATED'}|${caliper_um || 0}|${grain}`;
    return crypto.createHash('sha256').update(fpString).digest('hex').substring(0, 32);
}

/**
 * Shared validator for technical row attributes.
 * Recalculates issues and validationStatus consistently across import and manual review/correction.
 */
function validateTechnicalRow({
    name,
    gsm,
    width_mm,
    height_mm,
    finish,
    caliper_um,
    grain_direction,
    colGsm,
    nameGsm,
    colW_mm,
    colH_mm,
    formatDimensions
}) {
    const technicalIssues = [];

    if (!name) {
        technicalIssues.push({
            code: 'MISSING_NAME',
            severity: 'ERROR',
            category: 'TECHNICAL',
            message: 'Product name is missing or empty'
        });
    }

    if (!gsm) {
        technicalIssues.push({
            code: 'MISSING_GSM',
            severity: 'WARNING',
            category: 'TECHNICAL',
            message: 'GSM (grammage) could not be determined with certainty.'
        });
    }

    // GSM conflict evidence check
    if (colGsm && nameGsm && colGsm !== nameGsm) {
        if (gsm !== nameGsm) {
            technicalIssues.push({
                code: 'GSM_DESCRIPTION_CONFLICT',
                severity: 'WARNING',
                category: 'TECHNICAL',
                message: `Declared grammage (${colGsm} gsm) conflicts with description (${nameGsm} gsm). Explicit review required.`
            });
        }
    }

    // Dimensions check
    if (!width_mm || !height_mm) {
        technicalIssues.push({
            code: 'MISSING_DIMENSIONS',
            severity: 'WARNING',
            category: 'TECHNICAL',
            message: 'Width and Height dimensions could not be parsed.'
        });
    } else {
        // Check dimension contradiction evidence if formatDimensions and col dimensions exist
        if (formatDimensions && colW_mm !== undefined && colH_mm !== undefined && colW_mm !== null && colH_mm !== null) {
            const fmt = formatDimensions;
            const fmtHasExplicitUnits = fmt.mmW !== null && fmt.mmH !== null;
            let hasContradiction = false;
            if (fmtHasExplicitUnits) {
                if (Math.abs(colW_mm - fmt.mmW) > 1e-3 || Math.abs(colH_mm - fmt.mmH) > 1e-3) {
                    hasContradiction = true;
                }
            } else {
                if (Math.abs(colW_mm - fmt.rawW) > 1e-3 || Math.abs(colH_mm - fmt.rawH) > 1e-3) {
                    hasContradiction = true;
                }
            }

            if (hasContradiction) {
                const isStillColValue = (Math.abs(width_mm - colW_mm) < 1e-3 && Math.abs(height_mm - colH_mm) < 1e-3);
                if (isStillColValue) {
                    technicalIssues.push({
                        code: 'DIMENSION_CONTRADICTION',
                        severity: 'WARNING',
                        category: 'TECHNICAL',
                        message: `Contradiction between FORMAT field and dimension columns. Preserving raw values; explicit review required.`
                    });
                }
            }
        }

        if (width_mm < 100 || height_mm < 100 || width_mm > 3000 || height_mm > 3000) {
            technicalIssues.push({
                code: 'AMBIGUOUS_DIMENSION_UNITS',
                severity: 'WARNING',
                category: 'TECHNICAL',
                message: `Dimensions ${width_mm}x${height_mm} mm are outside standard sheet range and require review.`
            });
        }
    }

    let validationStatus = 'VALID';
    if (technicalIssues.some(i => i.severity === 'ERROR')) {
        validationStatus = 'REJECTED';
    } else if (technicalIssues.some(i => i.severity === 'WARNING')) {
        validationStatus = 'WARNING';
    }

    return { technicalIssues, validationStatus };
}

/**
 * Normalize row data using evidence-based rules without guessing or inversions.
 */
function normalizeRowData(rawCells, headers = [], fileRowNumber = 1) {
    const headerMap = {};
    if (Array.isArray(headers) && headers.length > 0) {
        headers.forEach((h, idx) => {
            if (h && typeof h === 'string') {
                headerMap[h.trim().toUpperCase()] = idx;
            }
        });
    }

    const getVal = (namedKey, positionalIdx) => {
        if (headerMap[namedKey] !== undefined) {
            return (rawCells[headerMap[namedKey]] || '').trim();
        }
        return (rawCells[positionalIdx] || '').trim();
    };

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
    const grainStr = getVal('GRAIN', -1) || getVal('FIBRA', -1) || getVal('VIRZIENS', -1);

    const technicalIssues = [];
    const commercialIssues = [];

    // 1. Name validation
    if (!name) {
        technicalIssues.push({
            code: 'MISSING_NAME',
            severity: 'ERROR',
            category: 'TECHNICAL',
            message: 'Product name is missing or empty'
        });
    }

    // 2. Grammage (GSM)
    let gsm = null;
    let colGsm = null;
    if (gramsStr) {
        const parsed = parseInt(gramsStr.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) {
            colGsm = parsed;
            gsm = parsed;
        }
    }

    let nameGsm = null;
    if (name) {
        const nameMatch = name.match(/\b(\d{2,4})\s*(?:gsm|g|gr)\b/i) || name.match(/\b(\d{2,4})\b/);
        if (nameMatch) {
            const val = parseInt(nameMatch[1], 10);
            if (val >= 40 && val <= 1000) {
                nameGsm = val;
            }
        }
    }

    // Check conflict between declared column gsm and name gsm
    if (colGsm && nameGsm && colGsm !== nameGsm) {
        technicalIssues.push({
            code: 'GSM_DESCRIPTION_CONFLICT',
            severity: 'WARNING',
            category: 'TECHNICAL',
            message: `Declared grammage (${colGsm} gsm) conflicts with description (${nameGsm} gsm). Explicit review required.`
        });
    } else if (!gsm && nameGsm) {
        gsm = nameGsm;
    }

    if (!gsm) {
        technicalIssues.push({
            code: 'MISSING_GSM',
            severity: 'WARNING',
            category: 'TECHNICAL',
            message: 'GSM (grammage) could not be determined with certainty.'
        });
    }

    // 3. Dimensions: Respect explicit units of columns and FORMAT separately, normalize each to mm and compare.
    // Never use numeric thresholds or coincidence as evidence of cm.
    let width_mm = null;
    let height_mm = null;

    const widthHeader = (headers[headerMap['WIDTH (MM)']] || headers[13] || '').toUpperCase();
    const colHeaderUnit = (widthHeader.includes('(MM)') || widthHeader.includes(' MM')) ? 'mm' : null;

    const parsedColW = normalizeDimensionValue(widthStr, colHeaderUnit);
    const parsedColH = normalizeDimensionValue(heightStr, colHeaderUnit);
    const parsedFmt = parseFormatDimensions(formatStr);

    let colW_mm = null;
    let colH_mm = null;

    if (parsedColW && parsedColH) {
        colW_mm = parsedColW.mm !== null ? parsedColW.mm : parsedColW.raw;
        colH_mm = parsedColH.mm !== null ? parsedColH.mm : parsedColH.raw;

        if (parsedFmt) {
            const fmtHasExplicitUnits = (parsedFmt.mmW !== null && parsedFmt.mmH !== null);
            if (fmtHasExplicitUnits) {
                // Both sources normalized to mm
                if (Math.abs(colW_mm - parsedFmt.mmW) < 1e-3 && Math.abs(colH_mm - parsedFmt.mmH) < 1e-3) {
                    width_mm = Math.round(colW_mm);
                    height_mm = Math.round(colH_mm);
                } else {
                    width_mm = colW_mm;
                    height_mm = colH_mm;
                    technicalIssues.push({
                        code: 'DIMENSION_CONTRADICTION',
                        severity: 'WARNING',
                        category: 'TECHNICAL',
                        message: `Contradiction between FORMAT field (${parsedFmt.rawW}${parsedFmt.unitW || ''}x${parsedFmt.rawH}${parsedFmt.unitH || ''}) and dimension columns (${colW_mm}x${colH_mm} mm). Preserving raw values; explicit review required.`
                    });
                }
            } else {
                // FORMAT has no explicit unit
                if (Math.abs(colW_mm - parsedFmt.rawW) < 1e-3 && Math.abs(colH_mm - parsedFmt.rawH) < 1e-3) {
                    width_mm = Math.round(colW_mm);
                    height_mm = Math.round(colH_mm);
                } else {
                    width_mm = colW_mm;
                    height_mm = colH_mm;
                    technicalIssues.push({
                        code: 'DIMENSION_CONTRADICTION',
                        severity: 'WARNING',
                        category: 'TECHNICAL',
                        message: `Contradiction between FORMAT field (${parsedFmt.rawW}x${parsedFmt.rawH}) and dimension columns (${colW_mm}x${colH_mm} mm). Preserving raw values; explicit review required.`
                    });
                }
            }
        } else {
            width_mm = colW_mm;
            height_mm = colH_mm;
        }
    } else if (parsedFmt) {
        if (parsedFmt.mmW !== null && parsedFmt.mmH !== null) {
            width_mm = Math.round(parsedFmt.mmW);
            height_mm = Math.round(parsedFmt.mmH);
        } else {
            width_mm = parsedFmt.rawW;
            height_mm = parsedFmt.rawH;
        }
    }

    if (!width_mm || !height_mm) {
        technicalIssues.push({
            code: 'MISSING_DIMENSIONS',
            severity: 'WARNING',
            category: 'TECHNICAL',
            message: 'Width and Height dimensions could not be parsed.'
        });
    } else if (width_mm < 100 || height_mm < 100 || width_mm > 3000 || height_mm > 3000) {
        technicalIssues.push({
            code: 'AMBIGUOUS_DIMENSION_UNITS',
            severity: 'WARNING',
            category: 'TECHNICAL',
            message: `Dimensions ${width_mm}x${height_mm} mm are outside standard sheet range and require review.`
        });
    }

    // 4. Caliper / Thickness
    let caliper_um = null;
    let caliper_mm = null;
    if (micronsStr) {
        const parsed = parseInt(micronsStr.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) {
            caliper_um = parsed;
            caliper_mm = parseFloat((caliper_um / 1000).toFixed(4));
        }
    }
    if (!caliper_mm && thicknessMmStr) {
        const parsed = parseFloat(thicknessMmStr.replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0) {
            caliper_mm = parsed;
            caliper_um = Math.round(caliper_mm * 1000);
        }
    }

    // 5. Acabado (Finish) & Categoría: Strict word-boundary matching without partial inversions
    const fullTextUpper = ` ${paperTypeStr} ${coatStr} ${name} `.toUpperCase();

    // Check UNCOATED / NEKRĪTOTS first to prevent partial match by COATED / KRĪTOTS!
    let finish = 'UNCOATED';
    let isExplicitUncoated = /\bNEKRĪTOTS\b/.test(fullTextUpper) || 
                             /\bUNCOATED\b/.test(fullTextUpper) ||
                             /\bOFSET\b/.test(fullTextUpper) || 
                             /\bOFFSET\b/.test(fullTextUpper);

    let isExplicitCoated = /\bKRĪTOTS\b/.test(fullTextUpper) || 
                           /\bCOATED\b/.test(fullTextUpper) || 
                           /\bGLOSS\b/.test(fullTextUpper);

    let isSilk = /\bMATT\b/.test(fullTextUpper) || 
                 /\bSILK\b/.test(fullTextUpper) || 
                 /\bZĪDA\b/.test(fullTextUpper);

    if (isExplicitUncoated && !fullTextUpper.includes('DUO')) {
        finish = 'UNCOATED';
    } else if (isSilk) {
        finish = 'SILK';
    } else if (isExplicitCoated) {
        finish = 'COATED';
    }

    let category = 'OTHER';
    if (fullTextUpper.includes('KARTONS') || fullTextUpper.includes('CARTON') || fullTextUpper.includes('GC1') || fullTextUpper.includes('GC2')) {
        category = 'CARTON';
    } else if (isExplicitUncoated) {
        category = 'OFFSET';
    } else if (isExplicitCoated || isSilk) {
        category = 'COATED';
    } else if (fullTextUpper.includes('DIZAINA') || fullTextUpper.includes('DESIGN')) {
        category = 'DESIGN';
    } else if (fullTextUpper.includes('DIGITĀL') || fullTextUpper.includes('DIGITAL')) {
        category = 'DIGITAL';
    }

    // 6. Commercial signals (Separated from technical confirmation)
    let rawPrice = null;
    let priceStatus = 'CONFIRMED';
    if (!priceStr || priceStr.trim() === '') {
        priceStatus = 'EMPTY_PRICE';
        commercialIssues.push({
            code: 'EMPTY_PRICE',
            severity: 'WARNING',
            category: 'COMMERCIAL',
            message: 'Price is not specified in source sheet.'
        });
    } else {
        rawPrice = parseFloat(priceStr.replace(',', '.'));
        if (isNaN(rawPrice) || rawPrice === 0) {
            priceStatus = 'ZERO_PRICE';
            commercialIssues.push({
                code: 'ZERO_PRICE',
                severity: 'WARNING',
                category: 'COMMERCIAL',
                message: 'Price is zero in source sheet; flagged as unpriced/review required.'
            });
        }
    }

    commercialIssues.push({
        code: 'CURRENCY_NOT_DECLARED',
        severity: 'INFO',
        category: 'COMMERCIAL',
        message: 'No currency or commercial price basis declared in file.'
    });

    // 7. Grain Direction & Physical Variant Fingerprint
    const grain_direction = parseGrainDirection(grainStr || fullTextUpper);
    const fingerprint = computeVariantFingerprint({
        name,
        gsm,
        width_mm,
        height_mm,
        finish,
        caliper_um,
        grain_direction
    });

    // 8. Proposed supplier matching
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

    // Overall Status
    const allIssues = [...technicalIssues, ...commercialIssues];
    const hasTechnicalError = technicalIssues.some(i => i.severity === 'ERROR');
    const hasTechnicalWarning = technicalIssues.some(i => i.severity === 'WARNING');

    let validationStatus = 'VALID';
    if (hasTechnicalError) validationStatus = 'REJECTED';
    else if (hasTechnicalWarning) validationStatus = 'WARNING';

    return {
        rowNumber: fileRowNumber,
        code,
        name,
        category,
        finish,
        gsm,
        caliper_um,
        caliper_mm,
        grain_direction,
        width_mm,
        height_mm,
        fingerprint,
        priceStatus,
        rawPrice,
        proposedSupplierMatch,
        providerLabel: providerStr,
        issues: allIssues,
        technicalIssues,
        commercialIssues,
        validationStatus,
        evidence: {
            colGsm,
            nameGsm,
            colW_mm,
            colH_mm,
            formatDimensions: parsedFmt
        }
    };
}

/**
 * Process a file buffer into a preview batch with validation, duplicates, and issues.
 */
async function processImportPreview({ buffer, fileName, tenantId, supplierId, createdBy, targetSheetName = null }) {
    const format = detectFormat(buffer);
    if (format === 'UNKNOWN') {
        throw new Error('UNSUPPORTED_FORMAT: Could not detect valid ODS, XLSX, or CSV file.');
    }

    const fileSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const parseResult = parseSpreadsheetBuffer(buffer, format, targetSheetName);

    const sheet = parseResult.sheets[0] || { sheetName: 'Sheet1', headers: [], rows: [] };
    const rawRows = sheet.rows;

    let validCount = 0;
    let pendingIssueCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;

    const seenFingerprints = new Set();
    const normalizedRows = [];

    rawRows.forEach(item => {
        const fileRowNumber = item.fileRowNumber;
        const rowCells = item.cells;
        const norm = normalizeRowData(rowCells, sheet.headers, fileRowNumber);

        if (seenFingerprints.has(norm.fingerprint)) {
            norm.validationStatus = 'DUPLICATE';
            norm.issues.push({
                code: 'DUPLICATE_IN_FILE',
                severity: 'WARNING',
                category: 'TECHNICAL',
                message: `Duplicate technical variant fingerprint in file (${norm.fingerprint})`
            });
            duplicateCount++;
        } else {
            seenFingerprints.add(norm.fingerprint);
            if (norm.validationStatus === 'VALID') validCount++;
            else if (norm.validationStatus === 'WARNING') pendingIssueCount++;
            else if (norm.validationStatus === 'REJECTED') rejectedCount++;
        }

        normalizedRows.push({
            rowNumber: fileRowNumber,
            sheetName: sheet.sheetName,
            rawCells: rowCells,
            normalized: norm,
            validationStatus: norm.validationStatus,
            issues: norm.issues
        });
    });

    const batchId = `imp_batch_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

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
            pendingRows: pendingIssueCount,
            duplicateRows: duplicateCount,
            rejectedRows: rejectedCount
        },
        rows: normalizedRows
    };
}

/**
 * Persist import batch and granular rows atomically to MySQL.
 */
async function stageImportBatch(previewData) {
    const { batchId, tenantId, supplierId, fileName, fileSha256, format, summary, createdBy, rows } = previewData;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(
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
                summary.pendingRows,
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

            await conn.query(
                `INSERT INTO paper_import_rows 
                (id, batch_id, \`row_number\`, sheet_name, raw_data_json, normalized_data_json, issues_json, validation_status, decision)
                VALUES ${placeholders.join(', ')}`,
                values
            );
        }

        await conn.commit();
        return { batchId, status: 'STAGED', summary };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Query paginated staged rows with filtering by status and decision.
 */
async function getImportBatchRows({ batchId, tenantId, supplierId, page = 1, limit = 50, status = null, decision = null }) {
    // Verify batch ownership by tenant and supplierId
    const batchQuery = supplierId 
        ? 'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ? AND supplier_id = ?'
        : 'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ?';
    const batchParams = supplierId ? [batchId, tenantId, supplierId] : [batchId, tenantId];

    const batches = await db.query(batchQuery, batchParams);
    const batch = Array.isArray(batches) ? batches[0] : null;
    if (!batch) {
        throw new Error('BATCH_NOT_FOUND: Import batch not found for tenant and supplier');
    }

    const offset = Math.max(0, (page - 1) * limit);
    let whereClause = 'WHERE batch_id = ?';
    const params = [batchId];

    if (status) {
        whereClause += ' AND validation_status = ?';
        params.push(status);
    }
    if (decision) {
        whereClause += ' AND decision = ?';
        params.push(decision);
    }

    const countRows = await db.query(`SELECT COUNT(*) as count FROM paper_import_rows ${whereClause}`, params);
    const totalCount = countRows[0]?.count || 0;

    const dataQuery = `SELECT * FROM paper_import_rows ${whereClause} ORDER BY \`row_number\` ASC LIMIT ? OFFSET ?`;
    const rows = await db.query(dataQuery, [...params, limit, offset]);

    return {
        batchId,
        batchStatus: batch.status,
        page,
        limit,
        totalRows: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        rows: rows.map(r => ({
            id: r.id,
            rowNumber: r.row_number,
            sheetName: r.sheet_name,
            validationStatus: r.validation_status,
            decision: r.decision,
            normalized: typeof r.normalized_data_json === 'string' ? JSON.parse(r.normalized_data_json) : r.normalized_data_json,
            issues: typeof r.issues_json === 'string' ? JSON.parse(r.issues_json) : r.issues_json,
            mappedProductId: r.mapped_product_id,
            mappedVariantId: r.mapped_variant_id
        }))
    };
}

/**
 * Review / correct specific staged rows before confirmation.
 */
async function updateImportRowDecisions({ batchId, tenantId, supplierId, actorId, decisions }) {
    // decisions: { [rowId]: { decision: 'ACCEPTED' | 'REJECTED' | 'PENDING', overrides?: { width_mm, height_mm, gsm, finish, caliper_um, grain_direction } } }
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Lock batch row first with FOR UPDATE to prevent race conditions
        const batchQuery = supplierId 
            ? 'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ? AND supplier_id = ? FOR UPDATE'
            : 'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ? FOR UPDATE';
        const batchParams = supplierId ? [batchId, tenantId, supplierId] : [batchId, tenantId];

        const [batchRows] = await conn.query(batchQuery, batchParams);
        const batch = Array.isArray(batchRows) ? (batchRows[0] || null) : batchRows;
        if (!batch) {
            throw new Error('BATCH_NOT_FOUND: Import batch not found for tenant and supplier');
        }
        if (batch.status === 'CONFIRMED') {
            throw new Error('BATCH_ALREADY_CONFIRMED: Cannot edit decisions on a confirmed batch');
        }

        const ALLOWED_OVERRIDE_FIELDS = ['width_mm', 'height_mm', 'gsm', 'finish', 'caliper_um', 'grain_direction'];
        let updatedCount = 0;

        for (const [rowId, dec] of Object.entries(decisions)) {
            const decisionValue = typeof dec === 'string' ? dec : dec.decision;
            if (!['ACCEPTED', 'REJECTED', 'PENDING'].includes(decisionValue)) {
                continue;
            }

            // Fetch existing row to audit and validate
            const [existingRows] = await conn.query('SELECT * FROM paper_import_rows WHERE id = ? AND batch_id = ? FOR UPDATE', [rowId, batchId]);
            const existing = existingRows && existingRows[0];
            if (!existing) continue;

            const norm = typeof existing.normalized_data_json === 'string' ? JSON.parse(existing.normalized_data_json) : (existing.normalized_data_json || {});
            const prevValues = {};
            const newValues = {};

            if (dec.overrides && typeof dec.overrides === 'object') {
                for (const [key, val] of Object.entries(dec.overrides)) {
                    if (!ALLOWED_OVERRIDE_FIELDS.includes(key)) {
                        throw new Error(`INVALID_OVERRIDE_FIELD: Field '${key}' is not allowed for manual override.`);
                    }

                    // Strict type and range validation
                    if (key === 'width_mm' || key === 'height_mm') {
                        const num = Number(val);
                        if (isNaN(num) || num < 10 || num > 3000) {
                            throw new Error(`INVALID_OVERRIDE_VALUE: ${key} must be a number between 10 and 3000.`);
                        }
                        prevValues[key] = norm[key];
                        norm[key] = Math.round(num);
                        newValues[key] = norm[key];
                    } else if (key === 'gsm') {
                        const num = Number(val);
                        if (isNaN(num) || num < 20 || num > 2000) {
                            throw new Error(`INVALID_OVERRIDE_VALUE: gsm must be a number between 20 and 2000.`);
                        }
                        prevValues[key] = norm[key];
                        norm[key] = Math.round(num);
                        newValues[key] = norm[key];
                    } else if (key === 'finish') {
                        const str = String(val).toUpperCase();
                        if (!['COATED', 'UNCOATED', 'SILK'].includes(str)) {
                            throw new Error(`INVALID_OVERRIDE_VALUE: finish must be one of 'COATED', 'UNCOATED', 'SILK'.`);
                        }
                        prevValues[key] = norm[key];
                        norm[key] = str;
                        newValues[key] = norm[key];
                    } else if (key === 'caliper_um') {
                        const num = Number(val);
                        if (isNaN(num) || num < 0 || num > 10000) {
                            throw new Error(`INVALID_OVERRIDE_VALUE: caliper_um must be a number between 0 and 10000.`);
                        }
                        prevValues[key] = norm[key];
                        norm[key] = Math.round(num);
                        norm.caliper_mm = parseFloat((norm[key] / 1000).toFixed(4));
                        newValues[key] = norm[key];
                    } else if (key === 'grain_direction') {
                        const grain = parseGrainDirection(val);
                        prevValues[key] = norm[key] || 'UNKNOWN';
                        norm[key] = grain;
                        newValues[key] = norm[key];
                    }
                }

                // Recalculate issues and validation status using shared function; NEVER force VALID simply because overrides exist!
                const evidence = norm.evidence || {};
                const validation = validateTechnicalRow({
                    name: norm.name,
                    gsm: norm.gsm,
                    width_mm: norm.width_mm,
                    height_mm: norm.height_mm,
                    finish: norm.finish,
                    caliper_um: norm.caliper_um,
                    grain_direction: norm.grain_direction,
                    colGsm: evidence.colGsm,
                    nameGsm: evidence.nameGsm,
                    colW_mm: evidence.colW_mm,
                    colH_mm: evidence.colH_mm,
                    formatDimensions: evidence.formatDimensions
                });

                norm.technicalIssues = validation.technicalIssues;
                norm.issues = [...validation.technicalIssues, ...(norm.commercialIssues || [])];
                norm.validationStatus = validation.validationStatus;

                // Recalculate fingerprint using shared function
                norm.fingerprint = computeVariantFingerprint({
                    name: norm.name,
                    gsm: norm.gsm,
                    width_mm: norm.width_mm,
                    height_mm: norm.height_mm,
                    finish: norm.finish,
                    caliper_um: norm.caliper_um,
                    grain_direction: norm.grain_direction
                });
            }

            // Record audit trail
            const existingAudit = norm._audit_log || [];
            existingAudit.push({
                actor_id: actorId || 'system',
                timestamp: new Date().toISOString(),
                decision: decisionValue,
                previous_values: prevValues,
                new_values: newValues
            });
            norm._audit_log = existingAudit;

            await conn.query(
                'UPDATE paper_import_rows SET decision = ?, normalized_data_json = ?, issues_json = ?, validation_status = ? WHERE id = ? AND batch_id = ?',
                [decisionValue, JSON.stringify(norm), JSON.stringify(norm.issues || []), norm.validationStatus || existing.validation_status, rowId, batchId]
            );
            updatedCount++;
        }

        await conn.commit();
        return { ok: true, updatedCount };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function confirmImportBatch({ batchId, tenantId, supplierId, actorId, selectedDecisions = null }) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Lock batch row with FOR UPDATE
        const batchQuery = supplierId 
            ? 'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ? AND supplier_id = ? FOR UPDATE'
            : 'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ? FOR UPDATE';
        const batchParams = supplierId ? [batchId, tenantId, supplierId] : [batchId, tenantId];

        const [batchRows] = await conn.query(batchQuery, batchParams);
        const batch = Array.isArray(batchRows) ? (batchRows[0] || null) : batchRows;

        if (!batch) {
            throw new Error('BATCH_NOT_FOUND: Import batch not found for tenant and supplier');
        }
        if (batch.status === 'CONFIRMED') {
            await conn.commit();
            return { ok: true, status: 'ALREADY_CONFIRMED', batchId, message: 'Batch was already confirmed previously.' };
        }

        // 2. Fetch staged rows for update
        const [rows] = await conn.query(
            'SELECT * FROM paper_import_rows WHERE batch_id = ? ORDER BY `row_number` ASC FOR UPDATE',
            [batchId]
        );

        // REQUIREMENT 3: Impide cerrar el lote mientras existan pendientes sin resolver o filas incompletas.
        // Valida los requisitos técnicos de todas las filas no rechazadas, independientemente de que su decisión sea PENDING o ACCEPTED.
        // ACCEPTED no sustituye un gramaje o una dimensión obligatoria ausente.
        const unresolvedRowIds = [];
        const incompleteRowIds = [];

        for (const row of rows) {
            let decision = row.decision;
            if (selectedDecisions && selectedDecisions[row.id]) {
                const dec = selectedDecisions[row.id];
                decision = typeof dec === 'string' ? dec : dec.decision;
            }

            // Exclude rejected rows from technical completeness checks
            if (decision === 'REJECTED' || row.validation_status === 'REJECTED') {
                continue;
            }

            const norm = typeof row.normalized_data_json === 'string' ? JSON.parse(row.normalized_data_json) : (row.normalized_data_json || {});

            // Check mandatory technical attributes on all non-rejected rows
            if (!norm.name || !norm.width_mm || !norm.height_mm || !norm.gsm) {
                incompleteRowIds.push(row.id);
                continue;
            }

            // A row with decision PENDING cannot be confirmed if it has warnings, duplicate or issues
            if (decision === 'PENDING') {
                const hasTechWarning = (row.validation_status === 'WARNING' || row.validation_status === 'DUPLICATE' ||
                    (norm && norm.technicalIssues && norm.technicalIssues.some(i => i.severity === 'WARNING' || i.severity === 'ERROR')));

                if (hasTechWarning) {
                    unresolvedRowIds.push(row.id);
                }
            }
        }

        if (incompleteRowIds.length > 0) {
            throw new Error(`INCOMPLETE_ROWS_EXIST: Cannot confirm batch while ${incompleteRowIds.length} non-rejected row(s) lack mandatory technical attributes (name, gsm, width_mm, height_mm). Correct or reject them before confirmation.`);
        }

        if (unresolvedRowIds.length > 0) {
            throw new Error(`UNRESOLVED_ROWS_EXIST: Cannot confirm batch while ${unresolvedRowIds.length} row(s) remain pending review with issues or unassigned decisions. Resolve or reject them before confirmation.`);
        }

        let validCount = 0;
        let pendingCount = 0;
        let duplicateCount = 0;
        let rejectedCount = 0;
        let confirmedCount = 0;

        for (const row of rows) {
            const norm = typeof row.normalized_data_json === 'string' ? JSON.parse(row.normalized_data_json) : row.normalized_data_json;
            const validationStatus = row.validation_status;
            let decision = row.decision;

            if (selectedDecisions && selectedDecisions[row.id]) {
                const dec = selectedDecisions[row.id];
                decision = typeof dec === 'string' ? dec : dec.decision;
            }

            if (validationStatus === 'DUPLICATE') {
                duplicateCount++;
            }

            // Exclude rejected rows
            if (decision === 'REJECTED' || validationStatus === 'REJECTED') {
                await conn.query('UPDATE paper_import_rows SET decision = "REJECTED" WHERE id = ?', [row.id]);
                rejectedCount++;
                continue;
            }

            // DO NOT confirm technical warnings/issues by default without explicit ACCEPTED decision
            if (validationStatus === 'WARNING' && decision !== 'ACCEPTED') {
                pendingCount++;
                continue;
            }

            // Validate mandatory technical attributes
            if (!norm.name || !norm.width_mm || !norm.height_mm || !norm.gsm) {
                pendingCount++;
                continue;
            }

            validCount++;

            // Upsert paper_product
            const productId = `prod_${crypto.createHash('md5').update(norm.name.toLowerCase().trim()).digest('hex').substring(0, 16)}`;
            await conn.query(
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

            // Upsert paper_variant with unique deterministic fingerprint
            const variantId = `var_${crypto.createHash('md5').update(norm.fingerprint).digest('hex').substring(0, 16)}`;
            await conn.query(
                `INSERT INTO paper_variants 
                 (id, product_id, gsm, caliper_um, caliper_mm, width_mm, height_mm, finish, grain_direction, fingerprint, metadata_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    norm.grain_direction || 'UNKNOWN',
                    norm.fingerprint,
                    JSON.stringify({ original_code: norm.code, batch_id: batchId })
                ]
            );

            await conn.query(
                'UPDATE paper_import_rows SET decision = "ACCEPTED", mapped_product_id = ?, mapped_variant_id = ? WHERE id = ?',
                [productId, variantId, row.id]
            );
            confirmedCount++;
        }

        // 3. Mark batch confirmed with audit metadata
        await conn.query(
            `UPDATE paper_import_batches 
             SET status = "CONFIRMED", confirmed_at = CURRENT_TIMESTAMP, 
                 metadata_json = JSON_OBJECT(
                     'confirmed_by', ?,
                     'confirmed_products', ?,
                     'valid_count', ?,
                     'pending_count', ?,
                     'duplicate_count', ?,
                     'rejected_count', ?
                 )
             WHERE id = ?`,
            [actorId, confirmedCount, validCount, pendingCount, duplicateCount, rejectedCount, batchId]
        );

        await conn.commit();

        return {
            ok: true,
            batchId,
            status: 'CONFIRMED',
            confirmedProducts: confirmedCount,
            counts: {
                valid: validCount,
                pending: pendingCount,
                duplicate: duplicateCount,
                rejected: rejectedCount
            }
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
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
    getImportBatchRows,
    updateImportRowDecisions,
    confirmImportBatch,
    parseGrainDirection,
    computeVariantFingerprint,
    validateTechnicalRow,
    normalizeDimensionValue,
    parseFormatDimensions,
    NORMALIZATION_RULES_VERSION
};
