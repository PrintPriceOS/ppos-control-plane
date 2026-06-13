/**
 * src/api/routes/printhouseCapabilities.js
 * 
 * Phase 76A — Express routes for Printhouse capabilities and onboarding.
 */
const express = require('express');
const router = express.Router();
const printhouseCapabilityService = require('../services/printhouseCapabilityService');
const { resolveActorContext } = require('../middleware/auth');

// Middleware to resolve actor and enforce base tenant context
function getActorAndTenant(req, res) {
    const actor = resolveActorContext(req);
    const tenantId = actor?.tenantId || 'system';
    return { actor, tenantId };
}

// ----------------------------------------------------------------------
// PRINTHOUSES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities - Create Printhouse
router.post('/', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        // Only SUPER_ADMIN can create printhouses
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Only Super Admins can create printhouses' });
        }
        const created = await printhouseCapabilityService.createPrinthouse(req.body, actor);
        return res.status(201).json({ ok: true, printhouse: created });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating printhouse:', err);
        return res.status(400).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities - List Printhouses
router.get('/', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const filters = {};
        // Scoping by tenant unless super admin
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN') {
            filters.tenantId = tenantId;
        } else if (req.query.tenantId) {
            filters.tenantId = req.query.tenantId;
        }
        if (req.query.status) {
            filters.status = req.query.status;
        }
        const list = await printhouseCapabilityService.listPrinthouses(filters);
        return res.json({ ok: true, printhouses: list });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing printhouses:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

const MACHINE_TEMPLATES = [
  {
    id: "tpl-heidelberg-xl106",
    manufacturer: "Heidelberg",
    model: "Speedmaster XL 106",
    machine_name: "Heidelberg Speedmaster XL 106",
    machine_type: "OFFSET",
    max_sheet_width_mm: 1060,
    max_sheet_height_mm: 750,
    min_sheet_width_mm: 410,
    min_sheet_height_mm: 340,
    max_print_width_mm: 1050,
    max_print_height_mm: 740,
    max_tac_percent: 400,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: true,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["OFFSET"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-heidelberg-cx102",
    manufacturer: "Heidelberg",
    model: "Speedmaster CX 102",
    machine_name: "Heidelberg Speedmaster CX 102",
    machine_type: "OFFSET",
    max_sheet_width_mm: 1020,
    max_sheet_height_mm: 720,
    min_sheet_width_mm: 400,
    min_sheet_height_mm: 340,
    max_print_width_mm: 1010,
    max_print_height_mm: 710,
    max_tac_percent: 400,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["OFFSET"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-komori-g40",
    manufacturer: "Komori",
    model: "Lithrone G40",
    machine_name: "Komori Lithrone G40",
    machine_type: "OFFSET",
    max_sheet_width_mm: 1030,
    max_sheet_height_mm: 720,
    min_sheet_width_mm: 520,
    min_sheet_height_mm: 360,
    max_print_width_mm: 1020,
    max_print_height_mm: 710,
    max_tac_percent: 380,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: true,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["OFFSET"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-komori-s29",
    manufacturer: "Komori",
    model: "Lithrone S29",
    machine_name: "Komori Lithrone S29",
    machine_type: "OFFSET",
    max_sheet_width_mm: 750,
    max_sheet_height_mm: 530,
    min_sheet_width_mm: 280,
    min_sheet_height_mm: 200,
    max_print_width_mm: 740,
    max_print_height_mm: 520,
    max_tac_percent: 360,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["OFFSET"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-kb-rapida106",
    manufacturer: "Koenig & Bauer",
    model: "Rapida 106",
    machine_name: "Koenig & Bauer Rapida 106",
    machine_type: "OFFSET",
    max_sheet_width_mm: 1060,
    max_sheet_height_mm: 740,
    min_sheet_width_mm: 400,
    min_sheet_height_mm: 340,
    max_print_width_mm: 1050,
    max_print_height_mm: 730,
    max_tac_percent: 400,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: true,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["OFFSET"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-manroland-r700",
    manufacturer: "Manroland",
    model: "Roland 700 Evolution",
    machine_name: "Manroland Roland 700 Evolution",
    machine_type: "OFFSET",
    max_sheet_width_mm: 1050,
    max_sheet_height_mm: 740,
    min_sheet_width_mm: 480,
    min_sheet_height_mm: 340,
    max_print_width_mm: 1040,
    max_print_height_mm: 730,
    max_tac_percent: 390,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["OFFSET"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-hp-indigo100k",
    manufacturer: "HP",
    model: "Indigo 100K Digital Press",
    machine_name: "HP Indigo 100K Digital Press",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 750,
    max_sheet_height_mm: 530,
    min_sheet_width_mm: 460,
    min_sheet_height_mm: 320,
    max_print_width_mm: 740,
    max_print_height_mm: 510,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: true,
    supports_variable_data: true,
    supports_white_ink: true,
    supports_spot_uv: false,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK", "RGB", "INDICHROME"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-hp-indigo12000",
    manufacturer: "HP",
    model: "Indigo 12000 Digital Press",
    machine_name: "HP Indigo 12000 Digital Press",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 750,
    max_sheet_height_mm: 530,
    min_sheet_width_mm: 510,
    min_sheet_height_mm: 330,
    max_print_width_mm: 740,
    max_print_height_mm: 510,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: true,
    supports_variable_data: true,
    supports_white_ink: true,
    supports_spot_uv: false,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK", "RGB", "INDICHROME"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-hp-indigo7k",
    manufacturer: "HP",
    model: "Indigo 7K Digital Press",
    machine_name: "HP Indigo 7K Digital Press",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 330,
    max_sheet_height_mm: 482,
    min_sheet_width_mm: 140,
    min_sheet_height_mm: 140,
    max_print_width_mm: 317,
    max_print_height_mm: 462,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: true,
    supports_variable_data: true,
    supports_white_ink: true,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK", "RGB", "WHITE"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-canon-v1350",
    manufacturer: "Canon",
    model: "imagePRESS V1350",
    machine_name: "Canon imagePRESS V1350",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 330,
    max_sheet_height_mm: 483,
    min_sheet_width_mm: 182,
    min_sheet_height_mm: 182,
    max_print_width_mm: 323,
    max_print_height_mm: 475,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: true,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-canon-ix3200",
    manufacturer: "Canon",
    model: "varioPRINT iX3200",
    machine_name: "Canon varioPRINT iX3200",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 350,
    max_sheet_height_mm: 508,
    min_sheet_width_mm: 203,
    min_sheet_height_mm: 203,
    max_print_width_mm: 343,
    max_print_height_mm: 501,
    max_tac_percent: 280,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: true,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-xerox-iridesse",
    manufacturer: "Xerox",
    model: "Iridesse Production Press",
    machine_name: "Xerox Iridesse Production Press",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 330,
    max_sheet_height_mm: 488,
    min_sheet_width_mm: 182,
    min_sheet_height_mm: 182,
    max_print_width_mm: 326,
    max_print_height_mm: 482,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: true,
    supports_variable_data: true,
    supports_white_ink: true,
    supports_spot_uv: true,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK", "RGB", "CLEAR", "SILVER", "GOLD"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-xerox-versant4100",
    manufacturer: "Xerox",
    model: "Versant 4100 Press",
    machine_name: "Xerox Versant 4100 Press",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 330,
    max_sheet_height_mm: 488,
    min_sheet_width_mm: 98,
    min_sheet_height_mm: 146,
    max_print_width_mm: 326,
    max_print_height_mm: 482,
    max_tac_percent: 280,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: true,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-km-accuriopress-c14000",
    manufacturer: "Konica Minolta",
    model: "AccurioPress C14000",
    machine_name: "Konica Minolta AccurioPress C14000",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 330,
    max_sheet_height_mm: 900,
    min_sheet_width_mm: 148,
    min_sheet_height_mm: 148,
    max_print_width_mm: 323,
    max_print_height_mm: 893,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: true,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-km-accuriojet-km1e",
    manufacturer: "Konica Minolta",
    model: "AccurioJet KM-1e",
    machine_name: "Konica Minolta AccurioJet KM-1e",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 585,
    max_sheet_height_mm: 750,
    min_sheet_width_mm: 250,
    min_sheet_height_mm: 375,
    max_print_width_mm: 575,
    max_print_height_mm: 735,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: true,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-ricoh-c9500",
    manufacturer: "Ricoh",
    model: "Pro C9500",
    machine_name: "Ricoh Pro C9500",
    machine_type: "DIGITAL",
    max_sheet_width_mm: 330,
    max_sheet_height_mm: 487,
    min_sheet_width_mm: 100,
    min_sheet_height_mm: 140,
    max_print_width_mm: 323,
    max_print_height_mm: 480,
    max_tac_percent: 300,
    supports_pdfx: true,
    supports_pdfa: false,
    supports_variable_data: true,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: ["CMYK"],
    supported_print_methods_json: ["DIGITAL"],
    supported_sides_json: ["4/4", "1/1", "2/2"]
  },
  {
    id: "tpl-mm-alegro",
    manufacturer: "Müller Martini",
    model: "Alegro",
    machine_name: "Müller Martini Alegro",
    machine_type: "OTHER",
    max_sheet_width_mm: null,
    max_sheet_height_mm: null,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: true,
    supports_softcover: true,
    supports_saddle_stitch: false,
    supports_perfect_binding: true,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["BINDING"],
    supported_sides_json: []
  },
  {
    id: "tpl-mm-primera",
    manufacturer: "Müller Martini",
    model: "Primera MC",
    machine_name: "Müller Martini Primera MC",
    machine_type: "OTHER",
    max_sheet_width_mm: null,
    max_sheet_height_mm: null,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: true,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["BINDING"],
    supported_sides_json: []
  },
  {
    id: "tpl-horizon-sl3",
    manufacturer: "Horizon",
    model: "StitchLiner Mark III",
    machine_name: "Horizon StitchLiner Mark III",
    machine_type: "OTHER",
    max_sheet_width_mm: null,
    max_sheet_height_mm: null,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: true,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["BINDING"],
    supported_sides_json: []
  },
  {
    id: "tpl-horizon-bq480",
    manufacturer: "Horizon",
    model: "BQ-480 Perfect Binder",
    machine_name: "Horizon BQ-480 Perfect Binder",
    machine_type: "OTHER",
    max_sheet_width_mm: null,
    max_sheet_height_mm: null,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: true,
    supports_saddle_stitch: false,
    supports_perfect_binding: true,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["BINDING"],
    supported_sides_json: []
  },
  {
    id: "tpl-bobst-novacut106",
    manufacturer: "Bobst",
    model: "Novacut 106 ER",
    machine_name: "Bobst Novacut 106 ER",
    machine_type: "OTHER",
    max_sheet_width_mm: 1060,
    max_sheet_height_mm: 760,
    min_sheet_width_mm: 400,
    min_sheet_height_mm: 350,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["FINISHING"],
    supported_sides_json: []
  },
  {
    id: "tpl-polar-titan115",
    manufacturer: "Polar",
    model: "Titan 115 Cutter",
    machine_name: "Polar Titan 115 Cutter",
    machine_type: "OTHER",
    max_sheet_width_mm: 1150,
    max_sheet_height_mm: 1150,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["CUTTING"],
    supported_sides_json: []
  },
  {
    id: "tpl-mbo-k8rs",
    manufacturer: "MBO",
    model: "K8RS Folder",
    machine_name: "MBO K8RS Folder",
    machine_type: "OTHER",
    max_sheet_width_mm: 780,
    max_sheet_height_mm: 1200,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["FOLDING"],
    supported_sides_json: []
  },
  {
    id: "tpl-scodix-ultra6000",
    manufacturer: "Scodix",
    model: "Ultra 6000 Foil/UV",
    machine_name: "Scodix Ultra 6000 Foil/UV",
    machine_type: "OTHER",
    max_sheet_width_mm: 760,
    max_sheet_height_mm: 1060,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: true,
    supports_lamination: true,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["FINISHING"],
    supported_sides_json: []
  },
  {
    id: "tpl-duplo-dc648",
    manufacturer: "Duplo",
    model: "DC-648",
    machine_name: "Duplo DC-648",
    machine_type: "OTHER",
    max_sheet_width_mm: 370,
    max_sheet_height_mm: 670,
    min_sheet_width_mm: null,
    min_sheet_height_mm: null,
    max_print_width_mm: null,
    max_print_height_mm: null,
    max_tac_percent: null,
    supports_pdfx: false,
    supports_pdfa: false,
    supports_variable_data: false,
    supports_white_ink: false,
    supports_spot_uv: false,
    supports_lamination: false,
    supports_hardcover: false,
    supports_softcover: false,
    supports_saddle_stitch: false,
    supports_perfect_binding: false,
    supports_case_binding: false,
    supported_color_modes_json: [],
    supported_print_methods_json: ["FINISHING"],
    supported_sides_json: []
  }
];

// GET /api/admin/printhouse-capabilities/machine-templates - Search presets
router.get('/machine-templates', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        if (!actor) {
            return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
        }
        const query = (req.query.q || '').trim().toLowerCase();
        if (!query) {
            return res.json({ ok: true, templates: MACHINE_TEMPLATES });
        }
        const filtered = MACHINE_TEMPLATES.filter(t => 
            t.manufacturer.toLowerCase().includes(query) || 
            t.model.toLowerCase().includes(query) ||
            t.machine_name.toLowerCase().includes(query)
        );
        return res.json({ ok: true, templates: filtered });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing templates:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId - Get Printhouse
router.get('/:printhouseId', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        // Tenant isolation
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }
        return res.json({ ok: true, printhouse });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error getting printhouse:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId - Update Printhouse
router.put('/:printhouseId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const updated = await printhouseCapabilityService.updatePrinthouse(printhouseId, req.body, actor);
        return res.json({ ok: true, printhouse: updated });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating printhouse:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// MACHINES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/machines - Create Machine
router.post('/:printhouseId/machines', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const machine = await printhouseCapabilityService.createMachine(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, machine });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating machine:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/machines - List Machines
router.get('/:printhouseId/machines', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const machines = await printhouseCapabilityService.listMachines(printhouseId);
        return res.json({ ok: true, machines });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing machines:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/machines/:machineId - Update Machine (with strict isolation)
router.put('/:printhouseId/machines/:machineId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, machineId } = req.params;

        const machineBefore = await printhouseCapabilityService.getMachine(machineId);
        if (!machineBefore) {
            return res.status(404).json({ ok: false, error: 'MACHINE_NOT_FOUND' });
        }
        // Strict isolation: verify machine matches printhouseId in path
        if (machineBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_MACHINE_ASSOCIATION', message: 'Machine does not belong to specified Printhouse' });
        }

        const machine = await printhouseCapabilityService.updateMachine(machineId, req.body, actor);
        return res.json({ ok: true, machine });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating machine:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// MEDIA CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/media - Create Media
router.post('/:printhouseId/media', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const media = await printhouseCapabilityService.createMedia(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, media });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating media:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/media - List Media
router.get('/:printhouseId/media', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const media = await printhouseCapabilityService.listMedia(printhouseId);
        return res.json({ ok: true, media });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing media:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/media/:mediaId - Update Media
router.put('/:printhouseId/media/:mediaId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, mediaId } = req.params;

        const mediaBefore = await printhouseCapabilityService.getMedia(mediaId);
        if (!mediaBefore) {
            return res.status(404).json({ ok: false, error: 'MEDIA_NOT_FOUND' });
        }
        if (mediaBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_MEDIA_ASSOCIATION' });
        }

        const media = await printhouseCapabilityService.updateMedia(mediaId, req.body, actor);
        return res.json({ ok: true, media });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating media:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// POLICY PROFILES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/policy-profiles - Create Policy Profile
router.post('/:printhouseId/policy-profiles', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const profile = await printhouseCapabilityService.createPolicyProfile(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating policy profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/policy-profiles - List Policy Profiles
router.get('/:printhouseId/policy-profiles', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const profiles = await printhouseCapabilityService.listPolicyProfiles(printhouseId);
        return res.json({ ok: true, profiles });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing policy profiles:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/policy-profiles/:profileId - Update Policy Profile
router.put('/:printhouseId/policy-profiles/:profileId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, profileId } = req.params;

        const profileBefore = await printhouseCapabilityService.getPolicyProfile(profileId);
        if (!profileBefore) {
            return res.status(404).json({ ok: false, error: 'POLICY_PROFILE_NOT_FOUND' });
        }
        if (profileBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_POLICY_PROFILE_ASSOCIATION' });
        }

        const profile = await printhouseCapabilityService.updatePolicyProfile(profileId, req.body, actor);
        return res.json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating policy profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// SLA PROFILES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/sla-profiles - Create SLA Profile
router.post('/:printhouseId/sla-profiles', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const profile = await printhouseCapabilityService.createSlaProfile(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating SLA profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/sla-profiles - List SLA Profiles
router.get('/:printhouseId/sla-profiles', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const profiles = await printhouseCapabilityService.listSlaProfiles(printhouseId);
        return res.json({ ok: true, profiles });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing SLA profiles:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/sla-profiles/:profileId - Update SLA Profile
router.put('/:printhouseId/sla-profiles/:profileId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, profileId } = req.params;

        const profileBefore = await printhouseCapabilityService.getSlaProfile(profileId);
        if (!profileBefore) {
            return res.status(404).json({ ok: false, error: 'SLA_PROFILE_NOT_FOUND' });
        }
        if (profileBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_SLA_PROFILE_ASSOCIATION' });
        }

        const profile = await printhouseCapabilityService.updateSlaProfile(profileId, req.body, actor);
        return res.json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating SLA profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// READINESS & AUDIT
// ----------------------------------------------------------------------

// GET /api/admin/printhouse-capabilities/:printhouseId/readiness - Evaluate readiness status
router.get('/:printhouseId/readiness', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const readiness = await printhouseCapabilityService.evaluatePrinthouseOnboardingReadiness(printhouseId);
        return res.json({ ok: true, readiness });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error evaluating readiness:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/audit - Retrieve audit logs
router.get('/:printhouseId/audit', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const rows = await require('../services/mysqlClient').query(`
            SELECT * FROM printhouse_capability_audit 
            WHERE printhouse_id = ? AND tenant_id = ?
            ORDER BY created_at DESC 
            LIMIT 100
        `, [printhouseId, printhouse.tenant_id]);

        return res.json({ ok: true, audit: rows });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing audit logs:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
