/**
 * src/ui/lib/blockerLocalization.ts
 *
 * Localizes backend blocker codes and advisories into user-facing copy in ES, EN, and DE.
 * Prevents raw English strings from leaking into Spanish/German interfaces.
 */

export interface BlockerInput {
    code?: string;
    message?: string;
    module?: string;
}

const BLOCKER_DICTIONARY: Record<string, { es: string; en: string; de: string }> = {
    ADD_LEGAL_COMPANY_NAME: {
        es: 'Define la razón social y nombre legal de la empresa',
        en: 'Set official legal company name',
        de: 'Offiziellen Firmennamen festlegen'
    },
    ADD_COUNTRY: {
        es: 'Especifica el país principal de operación',
        en: 'Specify primary country of operation',
        de: 'Hauptbetriebsland angeben'
    },
    ADD_PRIMARY_CONTACT: {
        es: 'Añade persona de contacto principal y teléfono',
        en: 'Add primary contact person and phone number',
        de: 'Hauptansprechpartner und Telefonnummer hinzufügen'
    },
    ADD_FIRST_PRODUCTION_SITE: {
        es: 'Configura la planta de producción principal',
        en: 'Configure primary production site',
        de: 'Hauptproduktionsstandort konfigurieren'
    },
    COMPLETE_SITE_ADDRESS: {
        es: 'Indica la ciudad y dirección de la instalación',
        en: 'Provide complete city and facility location',
        de: 'Vollständige Stadt und Standortadresse angeben'
    },
    ADD_SITE_TIMEZONE: {
        es: 'Selecciona la zona horaria de la planta',
        en: 'Select production site timezone',
        de: 'Zeitzone des Produktionsstandorts wählen'
    },
    ADD_FIRST_MACHINE: {
        es: 'Añade al menos una prensa o línea de producción',
        en: 'Add at least one production machine to a site',
        de: 'Mindestens eine Produktionsmaschine hinzufügen'
    },
    CONFIGURE_MACHINE_CAPABILITIES: {
        es: 'Configura capacidades de producción en una máquina',
        en: 'Configure production capabilities on at least one machine',
        de: 'Produktionsfähigkeiten für mindestens eine Maschine festlegen'
    },
    ADD_FIRST_MATERIAL: {
        es: 'Añade al menos un material al catálogo de papeles',
        en: 'Add at least one material to the catalog',
        de: 'Mindestens ein Material zum Katalog hinzufügen'
    },
    CONFIGURE_SITE_CAPACITY: {
        es: 'Configura los límites de capacidad diaria y turnos',
        en: 'Configure daily capacity limits',
        de: 'Tageskapazitätsgrenzen und Schichten konfigurieren'
    },
    NO_ACTIVE_SHIFTS: {
        es: 'Configura turnos de trabajo en el calendario',
        en: 'No shifts scheduled',
        de: 'Keine Schichten geplant'
    },
    CONFIGURE_SITE_LEAD_TIMES: {
        es: 'Configura plazos de entrega y hora límite de recepción',
        en: 'Configure site lead times and cutoff rules',
        de: 'Lieferzeiten und Annahmeschlussregeln konfigurieren'
    },
    NO_CUTOFF_TIME: {
        es: 'Define la hora límite diaria de corte',
        en: 'No daily cut-off defined',
        de: 'Keine tägliche Annahmeschlusszeit definiert'
    },
    SITES_WITHOUT_MACHINES: {
        es: 'Existen plantas sin maquinaria configurada',
        en: 'Sites have no machines configured',
        de: 'Standorte ohne konfigurierte Maschinen vorhanden'
    },
    MISSING_INTERIOR_PRICING: {
        es: 'Configura tarifas de pliegos o tiradas de interior',
        en: 'Configure interior printing sheet or run rates',
        de: 'Preise für Innendruckbögen oder Auflagen konfigurieren'
    },
    MISSING_PAPER_PRICING: {
        es: 'Configura el coste de papel por kilo',
        en: 'Configure paper cost per kilo',
        de: 'Papierpreis pro Kilo konfigurieren'
    },
    MISSING_BINDING_PRICING: {
        es: 'Configura al menos una tarifa de encuadernación',
        en: 'Configure at least one binding rate',
        de: 'Mindestens einen Bindetarif konfigurieren'
    },
    MISSING_TRANSPORT_PRICING: {
        es: 'Configura costes de transporte de entrega',
        en: 'Configure destination transport cost',
        de: 'Liefer- und Transportkosten konfigurieren'
    },
    MISSING_INDUSTRIAL_PRICING: {
        es: 'Configura y guarda las tarifas de fabricación industrial',
        en: 'Configure and save industrial manufacturing rates',
        de: 'Industrielle Fertigungstarife konfigurieren und speichern'
    },
    MISSING_PRINTER_NODE: {
        es: 'No hay nodo de imprenta configurado para tarifas',
        en: 'No printer node configured for pricing',
        de: 'Kein Druckerknoten für Tarife konfiguriert'
    },
    SHIFT_SCHEDULES_REQUIRED: {
        es: 'Se requieren turnos de trabajo y límites de capacidad diaria',
        en: 'Shift schedules and throughput limits required',
        de: 'Schichtpläne und tägliche Durchsatzgrenzen erforderlich'
    },
    TURNAROUND_SLAS_REQUIRED: {
        es: 'Se requieren plazos de entrega y SLAs de producción para la planificación',
        en: 'Turnaround SLAs required for scheduling',
        de: 'Durchlaufzeit-SLAs für die Planung erforderlich'
    },
    UNPUBLISHED_PRICE_BOOKS: {
        es: 'Tarifas y listas de precios no publicadas',
        en: 'Unpublished price books',
        de: 'Unveröffentlichte Preisbücher'
    }
};

const MESSAGE_PATTERN_MAP: { pattern: RegExp; key: string }[] = [
    { pattern: /legal company name/i, key: 'ADD_LEGAL_COMPANY_NAME' },
    { pattern: /primary country/i, key: 'ADD_COUNTRY' },
    { pattern: /primary contact/i, key: 'ADD_PRIMARY_CONTACT' },
    { pattern: /production site/i, key: 'ADD_FIRST_PRODUCTION_SITE' },
    { pattern: /city and facility/i, key: 'COMPLETE_SITE_ADDRESS' },
    { pattern: /timezone/i, key: 'ADD_SITE_TIMEZONE' },
    { pattern: /production machine/i, key: 'ADD_FIRST_MACHINE' },
    { pattern: /capabilities on at least one machine/i, key: 'CONFIGURE_MACHINE_CAPABILITIES' },
    { pattern: /material to the catalog/i, key: 'ADD_FIRST_MATERIAL' },
    { pattern: /shift schedules|throughput limits/i, key: 'SHIFT_SCHEDULES_REQUIRED' },
    { pattern: /capacity limits/i, key: 'CONFIGURE_SITE_CAPACITY' },
    { pattern: /turnaround slas|slas required/i, key: 'TURNAROUND_SLAS_REQUIRED' },
    { pattern: /shifts scheduled/i, key: 'NO_ACTIVE_SHIFTS' },
    { pattern: /lead times and cutoff/i, key: 'CONFIGURE_SITE_LEAD_TIMES' },
    { pattern: /cut-off defined/i, key: 'NO_CUTOFF_TIME' },
    { pattern: /no machines configured/i, key: 'SITES_WITHOUT_MACHINES' },
    { pattern: /unpublished price/i, key: 'UNPUBLISHED_PRICE_BOOKS' },
    { pattern: /interior printing/i, key: 'MISSING_INTERIOR_PRICING' },
    { pattern: /paper cost per kilo/i, key: 'MISSING_PAPER_PRICING' },
    { pattern: /binding rate/i, key: 'MISSING_BINDING_PRICING' },
    { pattern: /transport cost/i, key: 'MISSING_TRANSPORT_PRICING' },
    { pattern: /industrial manufacturing rates/i, key: 'MISSING_INDUSTRIAL_PRICING' },
    { pattern: /no printer node/i, key: 'MISSING_PRINTER_NODE' }
];

function formatUnknownCode(code: string, loc: 'es' | 'en' | 'de'): string {
    const readable = code
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/^./, (str) => str.toUpperCase());
    if (loc === 'es') return `Requisito pendiente: ${readable}`;
    if (loc === 'de') return `Ausstehende Anforderung: ${readable}`;
    return `Pending requirement: ${readable}`;
}

export function localizeBlocker(item: BlockerInput | string, locale: string = 'es'): string {
    const loc = (locale === 'de' ? 'de' : locale === 'en' ? 'en' : 'es') as 'es' | 'en' | 'de';

    let code = '';
    let message = '';

    if (typeof item === 'string') {
        const trimmed = item.trim();
        if (/^[A-Z0-9_]+$/.test(trimmed)) {
            code = trimmed;
        } else {
            message = trimmed;
        }
    } else if (item && typeof item === 'object') {
        code = item.code || '';
        message = item.message || '';
    }

    if (code) {
        if (BLOCKER_DICTIONARY[code]) {
            return BLOCKER_DICTIONARY[code][loc];
        }
        for (const { pattern, key } of MESSAGE_PATTERN_MAP) {
            if (pattern.test(code)) {
                return BLOCKER_DICTIONARY[key][loc];
            }
        }
    }

    if (message) {
        for (const { pattern, key } of MESSAGE_PATTERN_MAP) {
            if (pattern.test(message)) {
                return BLOCKER_DICTIONARY[key][loc];
            }
        }
        return message;
    }

    if (code) {
        return formatUnknownCode(code, loc);
    }

    return loc === 'es' ? 'Requisito pendiente' : loc === 'de' ? 'Ausstehende Anforderung' : 'Pending requirement';
}
