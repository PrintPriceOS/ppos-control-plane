/**
 * src/ui/pages/PrinthouseRegistrationPage.tsx
 *
 * Auth Identity Suite — Printhouse Registration (Phase Auth v2).
 * Fused with Partner B2B Onboarding Flow.
 *
 * Visual Standard: Glassmorphic Cards inside AuthShell.
 */
import React, { useState, useCallback, useEffect, useRef, CSSProperties } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Building2,
    Mail,
    Lock,
    Globe,
    Phone,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    Eye,
    EyeOff,
    MapPin,
    FileText,
    Sparkles,
    Sliders,
    Scale,
    BarChart,
    Cpu,
    Trash2,
    Plus,
    HelpCircle,
    ShieldCheck,
    CheckSquare,
    Sprout,
    TrendingUp,
    Factory
} from 'lucide-react';
import { getAuthToken, setAuthToken, setAuthUser } from '../lib/authStore';
import { AuthInput, AuthButton, MotionBackground, AuthShell } from '../components/auth/AuthShell';
import { AuthToastContainer, useAuthToast } from '../components/auth/AuthToast';
import { PrintPriceLogo } from '../components/PrintPriceLogo';

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip & Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
    const [show, setShow] = useState(false);
    return (
        <div style={{ position: 'relative', display: 'inline-block', marginLeft: '6px' }}>
            <HelpCircle
                size={15}
                strokeWidth={1.5}
                style={{ cursor: 'help', color: '#dc0000', display: 'inline', verticalAlign: 'middle' }}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />
            {show && (
                <div style={{
                    position: 'absolute',
                    bottom: '120%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#09090b',
                    color: '#ffffff',
                    border: '1px solid #dc0000',
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    whiteSpace: 'normal',
                    width: '200px',
                    zIndex: 9999,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5)',
                    lineHeight: '1.4',
                    textAlign: 'left'
                }}>
                    {text}
                </div>
            )}
        </div>
    );
};

const ValidatedInput: React.FC<{
    id: string;
    label: string;
    type: string;
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    icon: any;
    error?: string | null;
    validator: (val: string) => boolean;
    autoFocus?: boolean;
    autoComplete?: string;
    disabled?: boolean;
    rightSlot?: React.ReactNode;
}> = ({ validator, value, ...props }) => {
    const isValid = value.trim() !== '' && validator(value);
    return (
        <div style={{ position: 'relative' }}>
            <AuthInput {...props} value={value} />
            {isValid && (
                <div style={{ position: 'absolute', right: props.rightSlot ? '40px' : '14px', top: '35px', pointerEvents: 'none', zIndex: 10 }}>
                    <CheckCircle size={16} strokeWidth={1.5} style={{ color: '#10b981' }} />
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Password strength checker
// ─────────────────────────────────────────────────────────────────────────────

interface StrengthResult { score: 0 | 1 | 2 | 3 | 4; label: string; color: string; }

function checkPasswordStrength(pw: string): StrengthResult {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
    const map: Record<0 | 1 | 2 | 3 | 4, { label: string; color: string }> = {
        0: { label: 'Very weak', color: '#ef4444' },
        1: { label: 'Weak', color: '#f97316' },
        2: { label: 'Medium', color: '#eab308' },
        3: { label: 'Strong', color: '#22c55e' },
        4: { label: 'Very strong', color: '#10b981' },
    };
    return { score: clamped, ...map[clamped] };
}

const COUNTRIES = [
    { code: 'AF', label: 'Afghanistan' },
    { code: 'AX', label: 'Åland Islands' },
    { code: 'AL', label: 'Albania' },
    { code: 'DZ', label: 'Algeria' },
    { code: 'AS', label: 'American Samoa' },
    { code: 'AD', label: 'Andorra' },
    { code: 'AO', label: 'Angola' },
    { code: 'AI', label: 'Anguilla' },
    { code: 'AQ', label: 'Antarctica' },
    { code: 'AG', label: 'Antigua and Barbuda' },
    { code: 'AR', label: 'Argentina' },
    { code: 'AM', label: 'Armenia' },
    { code: 'AW', label: 'Aruba' },
    { code: 'AU', label: 'Australia' },
    { code: 'AT', label: 'Austria' },
    { code: 'AZ', label: 'Azerbaijan' },
    { code: 'BS', label: 'Bahamas' },
    { code: 'BH', label: 'Bahrain' },
    { code: 'BD', label: 'Bangladesh' },
    { code: 'BB', label: 'Barbados' },
    { code: 'BY', label: 'Belarus' },
    { code: 'BE', label: 'Belgium' },
    { code: 'BZ', label: 'Belize' },
    { code: 'BJ', label: 'Benin' },
    { code: 'BM', label: 'Bermuda' },
    { code: 'BT', label: 'Bhutan' },
    { code: 'BO', label: 'Bolivia' },
    { code: 'BQ', label: 'Bonaire, Sint Eustatius and Saba' },
    { code: 'BA', label: 'Bosnia and Herzegovina' },
    { code: 'BW', label: 'Botswana' },
    { code: 'BV', label: 'Bouvet Island' },
    { code: 'BR', label: 'Brazil' },
    { code: 'IO', label: 'British Indian Ocean Territory' },
    { code: 'BN', label: 'Brunei Darussalam' },
    { code: 'BG', label: 'Bulgaria' },
    { code: 'BF', label: 'Burkina Faso' },
    { code: 'BI', label: 'Burundi' },
    { code: 'CV', label: 'Cabo Verde' },
    { code: 'KH', label: 'Cambodia' },
    { code: 'CM', label: 'Cameroon' },
    { code: 'CA', label: 'Canada' },
    { code: 'KY', label: 'Cayman Islands' },
    { code: 'CF', label: 'Central African Republic' },
    { code: 'TD', label: 'Chad' },
    { code: 'CL', label: 'Chile' },
    { code: 'CN', label: 'China' },
    { code: 'CX', label: 'Christmas Island' },
    { code: 'CC', label: 'Cocos (Keeling) Islands' },
    { code: 'CO', label: 'Colombia' },
    { code: 'KM', label: 'Comoros' },
    { code: 'CD', label: 'Congo, Democratic Republic of the' },
    { code: 'CG', label: 'Congo, Republic of the' },
    { code: 'CK', label: 'Cook Islands' },
    { code: 'CR', label: 'Costa Rica' },
    { code: 'CI', label: "Côte d'Ivoire" },
    { code: 'HR', label: 'Croatia' },
    { code: 'CU', label: 'Cuba' },
    { code: 'CW', label: 'Curaçao' },
    { code: 'CY', label: 'Cyprus' },
    { code: 'CZ', label: 'Czechia' },
    { code: 'DK', label: 'Denmark' },
    { code: 'DJ', label: 'Djibouti' },
    { code: 'DM', label: 'Dominica' },
    { code: 'DO', label: 'Dominican Republic' },
    { code: 'EC', label: 'Ecuador' },
    { code: 'EG', label: 'Egypt' },
    { code: 'SV', label: 'El Salvador' },
    { code: 'GQ', label: 'Equatorial Guinea' },
    { code: 'ER', label: 'Eritrea' },
    { code: 'EE', label: 'Estonia' },
    { code: 'SZ', label: 'Eswatini' },
    { code: 'ET', label: 'Ethiopia' },
    { code: 'FK', label: 'Falkland Islands' },
    { code: 'FO', label: 'Faroe Islands' },
    { code: 'FJ', label: 'Fiji' },
    { code: 'FI', label: 'Finland' },
    { code: 'FR', label: 'France' },
    { code: 'GF', label: 'French Guiana' },
    { code: 'PF', label: 'French Polynesia' },
    { code: 'TF', label: 'French Southern Territories' },
    { code: 'GA', label: 'Gabon' },
    { code: 'GM', label: 'Gambia' },
    { code: 'GE', label: 'Georgia' },
    { code: 'DE', label: 'Germany' },
    { code: 'GH', label: 'Ghana' },
    { code: 'GI', label: 'Gibraltar' },
    { code: 'GR', label: 'Greece' },
    { code: 'GL', label: 'Greenland' },
    { code: 'GD', label: 'Grenada' },
    { code: 'GP', label: 'Guadeloupe' },
    { code: 'GU', label: 'Guam' },
    { code: 'GT', label: 'Guatemala' },
    { code: 'GG', label: 'Guernsey' },
    { code: 'GN', label: 'Guinea' },
    { code: 'GW', label: 'Guinea-Bissau' },
    { code: 'GY', label: 'Guyana' },
    { code: 'HT', label: 'Haiti' },
    { code: 'HM', label: 'Heard Island and McDonald Islands' },
    { code: 'VA', label: 'Holy See' },
    { code: 'HN', label: 'Honduras' },
    { code: 'HK', label: 'Hong Kong' },
    { code: 'HU', label: 'Hungary' },
    { code: 'IS', label: 'Iceland' },
    { code: 'IN', label: 'India' },
    { code: 'ID', label: 'Indonesia' },
    { code: 'IR', label: 'Iran' },
    { code: 'IQ', label: 'Iraq' },
    { code: 'IE', label: 'Ireland' },
    { code: 'IM', label: 'Isle of Man' },
    { code: 'IL', label: 'Israel' },
    { code: 'IT', label: 'Italy' },
    { code: 'JM', label: 'Jamaica' },
    { code: 'JP', label: 'Japan' },
    { code: 'JE', label: 'Jersey' },
    { code: 'JO', label: 'Jordan' },
    { code: 'KZ', label: 'Kazakhstan' },
    { code: 'KE', label: 'Kenya' },
    { code: 'KI', label: 'Kiribati' },
    { code: 'KP', label: 'Korea, Democratic People\'s Republic of' },
    { code: 'KR', label: 'Korea, Republic of' },
    { code: 'KW', label: 'Kuwait' },
    { code: 'KG', label: 'Kyrgyzstan' },
    { code: 'LA', label: 'Lao People\'s Democratic Republic' },
    { code: 'LV', label: 'Latvia' },
    { code: 'LB', label: 'Lebanon' },
    { code: 'LS', label: 'Lesotho' },
    { code: 'LR', label: 'Liberia' },
    { code: 'LY', label: 'Libya' },
    { code: 'LI', label: 'Liechtenstein' },
    { code: 'LT', label: 'Lithuania' },
    { code: 'LU', label: 'Luxembourg' },
    { code: 'MO', label: 'Macao' },
    { code: 'MG', label: 'Madagascar' },
    { code: 'MW', label: 'Malawi' },
    { code: 'MY', label: 'Malaysia' },
    { code: 'MV', label: 'Maldives' },
    { code: 'ML', label: 'Mali' },
    { code: 'MT', label: 'Malta' },
    { code: 'MH', label: 'Marshall Islands' },
    { code: 'MQ', label: 'Martinique' },
    { code: 'MR', label: 'Mauritania' },
    { code: 'MU', label: 'Mauritius' },
    { code: 'YT', label: 'Mayotte' },
    { code: 'MX', label: 'Mexico' },
    { code: 'FM', label: 'Micronesia' },
    { code: 'MD', label: 'Moldova' },
    { code: 'MC', label: 'Monaco' },
    { code: 'MN', label: 'Mongolia' },
    { code: 'ME', label: 'Montenegro' },
    { code: 'MS', label: 'Montserrat' },
    { code: 'MA', label: 'Morocco' },
    { code: 'MZ', label: 'Mozambique' },
    { code: 'MM', label: 'Myanmar' },
    { code: 'NA', label: 'Namibia' },
    { code: 'NR', label: 'Nauru' },
    { code: 'NP', label: 'Nepal' },
    { code: 'NL', label: 'Netherlands' },
    { code: 'NC', label: 'New Caledonia' },
    { code: 'NZ', label: 'New Zealand' },
    { code: 'NI', label: 'Nicaragua' },
    { code: 'NE', label: 'Niger' },
    { code: 'NG', label: 'Nigeria' },
    { code: 'NU', label: 'Niue' },
    { code: 'NF', label: 'Norfolk Island' },
    { code: 'MK', label: 'North Macedonia' },
    { code: 'MP', label: 'Northern Mariana Islands' },
    { code: 'NO', label: 'Norway' },
    { code: 'OM', label: 'Oman' },
    { code: 'PK', label: 'Pakistan' },
    { code: 'PW', label: 'Palau' },
    { code: 'PS', label: 'Palestine, State of' },
    { code: 'PA', label: 'Panama' },
    { code: 'PG', label: 'Papua New Guinea' },
    { code: 'PY', label: 'Paraguay' },
    { code: 'PE', label: 'Peru' },
    { code: 'PH', label: 'Philippines' },
    { code: 'PN', label: 'Pitcairn' },
    { code: 'PL', label: 'Poland' },
    { code: 'PT', label: 'Portugal' },
    { code: 'PR', label: 'Puerto Rico' },
    { code: 'QA', label: 'Qatar' },
    { code: 'RE', label: 'Réunion' },
    { code: 'RO', label: 'Romania' },
    { code: 'RU', label: 'Russian Federation' },
    { code: 'RW', label: 'Rwanda' },
    { code: 'BL', label: 'Saint Barthélemy' },
    { code: 'SH', label: 'Saint Helena' },
    { code: 'KN', label: 'Saint Kitts and Nevis' },
    { code: 'LC', label: 'Saint Lucia' },
    { code: 'MF', label: 'Saint Martin' },
    { code: 'PM', label: 'Saint Pierre and Miquelon' },
    { code: 'VC', label: 'Saint Vincent and the Grenadines' },
    { code: 'WS', label: 'Samoa' },
    { code: 'SM', label: 'San Marino' },
    { code: 'ST', label: 'Sao Tome and Principe' },
    { code: 'SA', label: 'Saudi Arabia' },
    { code: 'SN', label: 'Senegal' },
    { code: 'RS', label: 'Serbia' },
    { code: 'SC', label: 'Seychelles' },
    { code: 'SL', label: 'Sierra Leone' },
    { code: 'SG', label: 'Singapore' },
    { code: 'SX', label: 'Sint Maarten' },
    { code: 'SK', label: 'Slovakia' },
    { code: 'SI', label: 'Slovenia' },
    { code: 'SB', label: 'Solomon Islands' },
    { code: 'SO', label: 'Somalia' },
    { code: 'ZA', label: 'South Africa' },
    { code: 'GS', label: 'South Georgia and the South Sandwich Islands' },
    { code: 'SS', label: 'South Sudan' },
    { code: 'ES', label: 'Spain' },
    { code: 'LK', label: 'Sri Lanka' },
    { code: 'SD', label: 'Sudan' },
    { code: 'SR', label: 'Suriname' },
    { code: 'SJ', label: 'Svalbard and Jan Mayen' },
    { code: 'SE', label: 'Sweden' },
    { code: 'CH', label: 'Switzerland' },
    { code: 'SY', label: 'Syrian Arab Republic' },
    { code: 'TW', label: 'Taiwan' },
    { code: 'TJ', label: 'Tajikistan' },
    { code: 'TZ', label: 'Tanzania, United Republic of' },
    { code: 'TH', label: 'Thailand' },
    { code: 'TL', label: 'Timor-Leste' },
    { code: 'TG', label: 'Togo' },
    { code: 'TK', label: 'Tokelau' },
    { code: 'TO', label: 'Tonga' },
    { code: 'TT', label: 'Trinidad and Tobago' },
    { code: 'TN', label: 'Tunisia' },
    { code: 'TR', label: 'Türkiye' },
    { code: 'TM', label: 'Turkmenistan' },
    { code: 'TC', label: 'Turks and Caicos Islands' },
    { code: 'TV', label: 'Tuvalu' },
    { code: 'UG', label: 'Uganda' },
    { code: 'UA', label: 'Ukraine' },
    { code: 'AE', label: 'United Arab Emirates' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'UM', label: 'United States Minor Outlying Islands' },
    { code: 'US', label: 'United States' },
    { code: 'UY', label: 'Uruguay' },
    { code: 'UZ', label: 'Uzbekistan' },
    { code: 'VU', label: 'Vanuatu' },
    { code: 'VE', label: 'Venezuela' },
    { code: 'VN', label: 'Viet Nam' },
    { code: 'VG', label: 'Virgin Islands, British' },
    { code: 'VI', label: 'Virgin Islands, U.S.' },
    { code: 'WF', label: 'Wallis and Futuna' },
    { code: 'EH', label: 'Western Sahara' },
    { code: 'YE', label: 'Yemen' },
    { code: 'ZM', label: 'Zambia' },
    { code: 'ZW', label: 'Zimbabwe' }
];

const B2B_PRODUCTION_TYPES = [
    'Offset', 'Digital', 'Large Format', 'Packaging', 'Hardcover Binding', 'Softcover Binding', 'Spiral/Wire-O'
];

const B2B_CERTIFICATIONS = [
    'ISO 12647 (PSO)', 'FOGRA Cert', 'GRACoL / G7', 'ISO 9001', 'ISO 14001', 'BRC Packaging', 'FSC Certified', 'PEFC', 'SGP Partnership', 'EMAS'
];

const B2B_QA_MODULES = [
    { id: 'preflight', label: 'File Validation / Preflight Audit', desc: 'Pre-production verification of digital assets and trapping.' },
    { id: 'densitometry', label: 'On-press Densitometry', desc: 'Real-time monitoring of color density and registration.' },
    { id: 'sampling', label: 'In-process Random Sampling', desc: 'Periodic quality checks during high-volume production.' },
    { id: 'finishing', label: 'Post-press / Finishing Audit', desc: 'Verification of binding, cutting, and lamination tolerances.' },
    { id: 'traceability', label: 'Traceability / Batch Logging', desc: 'Detailed event logging for every production node state.' },
    { id: 'packaging', label: 'Final Packaging QC', desc: 'Automated weight and quantity audit before dispatch.' }
];

const B2B_INTEGRATIONS = [
    { title: 'Dashboard only', badge: 'MANUAL', desc: 'Manage jobs via the PrintPrice OS portal. Best for starting out.' },
    { title: 'API-ready', badge: 'INTEGRATED', desc: 'Connect your ERP/MIS (JDF/JMF) for direct order processing.' },
    { title: 'Fully automated routing', badge: 'ORCHESTRATED', desc: 'Zero manual touch. Files routed directly to your DFE.' }
];

const SUPPORTED_SHEET_SIZES = [
    { value: '70x100', label: '70 x 100 cm (B1 Full Sheet)' },
    { value: '65x92', label: '65 x 92 cm (B2+ Sheet)' },
    { value: '50x70', label: '50 x 70 cm (B2 Sheet)' },
    { value: '45x64', label: '45 x 64 cm (B3 Sheet)' },
    { value: '35x50', label: '35 x 50 cm (B4 Sheet)' },
    { value: 'custom', label: 'Custom Large Format (> B1)' }
];

interface MachineTemplate {
    id: string;
    manufacturer: string;
    model: string;
    machine_type: 'OFFSET' | 'DIGITAL' | 'OTHER';
    category: 'Offset' | 'Digital' | 'Large Format' | 'Finishing';
}

const COMMON_MACHINE_TEMPLATES: MachineTemplate[] = [
    // Offset
    { id: "tpl-1", manufacturer: "Heidelberg", model: "Speedmaster XL 106", machine_type: "OFFSET", category: "Offset" },
    { id: "tpl-2", manufacturer: "Heidelberg", model: "Speedmaster CX 102", machine_type: "OFFSET", category: "Offset" },
    { id: "tpl-3", manufacturer: "Komori", model: "Lithrone G40", machine_type: "OFFSET", category: "Offset" },
    // Digital
    { id: "tpl-7", manufacturer: "HP", model: "Indigo 100K Digital Press", machine_type: "DIGITAL", category: "Digital" },
    { id: "tpl-8", manufacturer: "HP", model: "Indigo 12000 Digital Press", machine_type: "DIGITAL", category: "Digital" },
    { id: "tpl-10", manufacturer: "Canon", model: "imagePRESS V1350", machine_type: "DIGITAL", category: "Digital" },
    // Large Format
    { id: "tpl-15", manufacturer: "Konica Minolta", model: "AccurioJet KM-1e", machine_type: "DIGITAL", category: "Large Format" },
    // Finishing
    { id: "tpl-17", manufacturer: "Müller Martini", model: "Alegro Perfect Binder", machine_type: "OTHER", category: "Finishing" },
    { id: "tpl-19", manufacturer: "Horizon", model: "StitchLiner Mark III", machine_type: "OTHER", category: "Finishing" },
    { id: "tpl-21", manufacturer: "Bobst", model: "Novacut 106 ER", machine_type: "OTHER", category: "Finishing" },
    { id: "tpl-22", manufacturer: "Polar", model: "Titan 115 Cutter", machine_type: "OTHER", category: "Finishing" }
];

// ─────────────────────────────────────────────────────────────────────────────
// Form state interface
// ─────────────────────────────────────────────────────────────────────────────

interface FormData {
    // Step 1: Legal
    termsAccepted: boolean;
    termsReviewed: boolean;
    // Step 2: Company
    companyName: string;
    contactName: string;
    country: string;
    city: string;
    phone: string;
    website: string;
    // Step 3: Admin Account
    email: string;
    password: string;
    confirmPassword: string;
    // B2B Stepper extra qualifications
    productionTypes: string[];
    maxSheetSize: string;
    presses: Array<{ templateId: string; quantity: number; name: string }>;
    typicalJobs: string;
    monthlyVolume: string;
    utilization: string;
    integrationLevel: string;
    standards: boolean;
    certifications: string[];
    qaModules: string[];
    qaCustomDetails: string;
    selectedPlan: string;
    billingInterval: 'monthly' | 'annual';
}

function isDark() {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Minimal Printhouse Registration (Phase 191B / RC17)
// ─────────────────────────────────────────────────────────────────────────────

const PublicPrinthouseRegistration: React.FC = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'EMAIL_ENTRY' | 'SENDING' | 'CHECK_EMAIL' | 'RESENDING' | 'ERROR'>('EMAIL_ENTRY');
    const [resendStatus, setResendStatus] = useState<'IDLE' | 'RESENDING' | 'SENT'>('IDLE');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !normalizedEmail.includes('@')) return;

        setStatus('SENDING');
        setErrorMessage(null);
        setResendStatus('IDLE');

        try {
            const res = await fetch('/api/auth/printhouse/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: normalizedEmail })
            });
            if (res.ok || res.status === 200 || res.status === 201) {
                setStatus('CHECK_EMAIL');
            } else {
                const data = await res.json().catch(() => null);
                if (data && data.message) {
                    setStatus('CHECK_EMAIL');
                } else {
                    setStatus('ERROR');
                    setErrorMessage('Unable to process registration. Please try again.');
                }
            }
        } catch (err) {
            setStatus('ERROR');
            setErrorMessage('Network error. Please check your connection and try again.');
        }
    };

    const handleResend = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) return;

        setResendStatus('RESENDING');

        try {
            await fetch('/api/auth/printhouse/resend-activation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: normalizedEmail })
            });
            setResendStatus('SENT');
        } catch (err) {
            setResendStatus('SENT');
        }
    };

    const handleReset = () => {
        setStatus('EMAIL_ENTRY');
        setEmail('');
        setResendStatus('IDLE');
        setErrorMessage(null);
    };

    return (
        <AuthShell
            title="Create your printhouse account"
            subtitle="Enter your work email and we'll send you an activation link."
            maxWidth={460}
        >
            {status === 'ERROR' && (
                <div style={{
                    padding: '16px',
                    marginBottom: '16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    fontSize: '14px',
                    textAlign: 'center'
                }}>
                    <p style={{ margin: 0 }}>{errorMessage || 'An error occurred. Please try again.'}</p>
                    <button
                        type="button"
                        onClick={handleReset}
                        style={{
                            marginTop: '12px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        Try Again
                    </button>
                </div>
            )}

            {(status === 'CHECK_EMAIL' || status === 'RESENDING') && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        margin: '0 auto 16px auto',
                        borderRadius: '50%',
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#34d399'
                    }}>
                        <CheckCircle size={32} />
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                        Check your email
                    </h2>
                    <p style={{ color: '#a1a1aa', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
                        If this address can be used, activation instructions will be sent shortly.
                    </p>

                    {resendStatus === 'SENT' && (
                        <div style={{
                            padding: '10px',
                            marginBottom: '16px',
                            borderRadius: '6px',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#34d399',
                            fontSize: '12px'
                        }}>
                            Activation instructions resent. Please check your inbox.
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={resendStatus === 'RESENDING'}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                background: '#27272a',
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: 600,
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: resendStatus === 'RESENDING' ? 'not-allowed' : 'pointer',
                                opacity: resendStatus === 'RESENDING' ? 0.6 : 1,
                                transition: 'background 0.2s'
                            }}
                        >
                            {resendStatus === 'RESENDING' ? 'Sending link...' : 'Resend activation email'}
                        </button>
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '12px',
                                color: '#71717a',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                            }}
                        >
                            Use a different email
                        </button>
                    </div>

                    <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '13px', color: '#a1a1aa' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#dc0000', fontWeight: 600, textDecoration: 'none' }}>
                            Sign in
                        </Link>
                    </div>
                </div>
            )}

            {(status === 'EMAIL_ENTRY' || status === 'SENDING') && (
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '8px' }}>
                            Work Email Address
                        </label>
                        <input
                            type="email"
                            required
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="owner@printhouse.com"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                background: '#09090b',
                                border: '1px solid #27272a',
                                color: '#ffffff',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'SENDING' || !email.trim()}
                        style={{
                            width: '100%',
                            padding: '14px 16px',
                            borderRadius: '8px',
                            background: '#dc0000',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '15px',
                            border: 'none',
                            cursor: status === 'SENDING' || !email.trim() ? 'not-allowed' : 'pointer',
                            opacity: status === 'SENDING' || !email.trim() ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 14px rgba(220, 0, 0, 0.3)',
                            transition: 'background 0.2s'
                        }}
                    >
                        {status === 'SENDING' ? 'Sending activation link...' : 'Send activation link'}
                        <ArrowRight size={16} />
                    </button>

                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'center', fontSize: '13px', color: '#a1a1aa' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#dc0000', fontWeight: 600, textDecoration: 'none' }}>
                            Sign in
                        </Link>
                    </div>
                </form>
            )}
        </AuthShell>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Printhouse Provisioning Wizard (Legacy / Internal Admin Mode)
// ─────────────────────────────────────────────────────────────────────────────

const AdminPrinthouseProvision: React.FC = () => {
    const adminMode = true;
    // Steps: 1: Legal Terms, 2: Company, 3: Capabilities, 4: Machinery & Capacity, 5: Compliance & QA, 6: Plan Selection, 7: Admin Credentials, 8: Success
    // In adminMode: step 1 (T&C) is skipped — start at 2
    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(2);
    const [formData, setFormData] = useState<FormData>({
        termsAccepted: false,
        termsReviewed: false,
        companyName: '',
        contactName: '',
        country: '',
        city: '',
        phone: '',
        website: '',
        email: '',
        password: '',
        confirmPassword: '',
        productionTypes: [],
        maxSheetSize: '',
        presses: [],
        typicalJobs: '',
        monthlyVolume: '',
        utilization: '',
        integrationLevel: '',
        standards: false,
        certifications: [],
        qaModules: [],
        qaCustomDetails: '',
        selectedPlan: 'starter',
        billingInterval: 'monthly',
    });
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});
    const [showPw, setShowPw] = useState(false);
    const [showCpw, setShowCpw] = useState(false);
    const [loading, setLoading] = useState(false);

    // Step 4 selector state
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [customModel, setCustomModel] = useState<string>('');
    const [machineQuantity, setMachineQuantity] = useState<number>(1);


    const termsContainerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { toasts, addToast, dismiss } = useAuthToast();
    const dark = isDark();

    const cardRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData((p) => ({ ...p, [key]: val }));
        setFieldErrors((p) => ({ ...p, [key]: undefined }));
    };

    // AutoScroll terms validation
    const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (formData.termsReviewed) return;

        const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 20;
        if (isAtBottom) {
            setFormData(prev => ({ ...prev, termsReviewed: true }));
        }
    };

    // Recovery of draft B2B onboarding data
    useEffect(() => {
        const saved = localStorage.getItem('printhouse_onboarding_draft');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setFormData(prev => ({ ...prev, ...parsed }));
                addToast('info', 'Draft recovered', 'We restored previously entered data.');
            } catch (e) { }
        }
    }, []);

    // Auto-save B2B onboarding draft on change (excluding sensitive password info)
    useEffect(() => {
        const draft = {
            companyName: formData.companyName,
            contactName: formData.contactName,
            country: formData.country,
            city: formData.city,
            phone: formData.phone,
            website: formData.website,
            productionTypes: formData.productionTypes,
            maxSheetSize: formData.maxSheetSize,
            presses: formData.presses,
            typicalJobs: formData.typicalJobs,
            monthlyVolume: formData.monthlyVolume,
            utilization: formData.utilization,
            integrationLevel: formData.integrationLevel,
            standards: formData.standards,
            certifications: formData.certifications,
            qaModules: formData.qaModules,
            qaCustomDetails: formData.qaCustomDetails,
            selectedPlan: formData.selectedPlan,
            billingInterval: formData.billingInterval,
        };
        localStorage.setItem('printhouse_onboarding_draft', JSON.stringify(draft));
    }, [
        formData.companyName, formData.contactName, formData.country, formData.city,
        formData.phone, formData.website, formData.productionTypes, formData.maxSheetSize,
        formData.presses, formData.typicalJobs, formData.monthlyVolume, formData.utilization,
        formData.integrationLevel, formData.standards, formData.certifications,
        formData.qaModules, formData.qaCustomDetails, formData.selectedPlan, formData.billingInterval
    ]);

    // ── Validations per step ──────────────────────────────────────────────────
    const validateStep1 = (): boolean => {
        if (!formData.termsAccepted) {
            addToast('error', 'Terms Acceptance Required', 'You must read and accept the Partner Terms to proceed.');
            return false;
        }
        return true;
    };

    const validateStep2 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (!formData.companyName.trim()) errs.companyName = 'Company name is required';
        if (!formData.contactName.trim()) errs.contactName = 'Contact name is required';
        if (!formData.country.trim()) errs.country = 'Country is required';
        else {
            const exists = COUNTRIES.some(c => c.code.toLowerCase() === formData.country.toLowerCase());
            if (!exists) errs.country = 'Invalid country selection';
        }
        if (!formData.city.trim()) errs.city = 'City is required';
        if (formData.website && !/^https?:\/\//.test(formData.website.trim())) {
            errs.website = 'URL must start with http:// or https://';
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateStep3 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (formData.productionTypes.length === 0) {
            addToast('warning', 'Capabilities Selection', 'Please select at least one production node capability.');
            return false;
        }
        if (!formData.maxSheetSize.trim()) {
            errs.maxSheetSize = 'Max sheet size is required (e.g. 720 x 1020 mm)';
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateStep4 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (formData.presses.length === 0) {
            addToast('warning', 'Machines Required', 'Please add at least one machine template.');
            return false;
        }
        if (!formData.monthlyVolume) errs.monthlyVolume = 'Select monthly finished copies volume';
        if (!formData.utilization) {
            addToast('warning', 'Utilization Required', 'Please select system utilization level.');
            return false;
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateStep5 = (): boolean => {
        if (!formData.selectedPlan) {
            addToast('warning', 'Plan Selection Required', 'Please select a subscription plan.');
            return false;
        }
        if (!formData.integrationLevel) {
            addToast('warning', 'Integration Protocol', 'Please select an integration protocol.');
            return false;
        }
        return true;
    };

    const validateStep6 = (): boolean => {
        return true;
    };

    const validateStep7 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        const cleanEmail = formData.email.trim().toLowerCase();
        if (!cleanEmail) errs.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errs.email = 'Invalid email format';
        if (!formData.password) errs.password = 'Password is required';
        else if (formData.password.length < 8) errs.password = 'Minimum 8 characters';
        else if (checkPasswordStrength(formData.password).score < 2) errs.password = 'Password is too weak';
        if (formData.password !== formData.confirmPassword) errs.confirmPassword = 'Passwords do not match';
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // ── Navigation helpers ────────────────────────────────────────────────────
    const next = () => {
        if (step === 1 && validateStep1()) setStep(2);
        else if (step === 2 && validateStep2()) setStep(3);
        else if (step === 3 && validateStep3()) setStep(4);
        else if (step === 4 && validateStep4()) setStep(5);
        else if (step === 5 && validateStep5()) setStep(6);
        else if (step === 6 && validateStep6()) setStep(7);
    };

    const back = () => {
        setFieldErrors({});
        // In adminMode step 2 is the first visible step
        const minStep = adminMode ? 2 : 1;
        setStep(prev => Math.max(prev - 1, minStep) as any);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep7()) return;

        if (formData.presses.length === 0) {
            addToast('error', 'Missing Data', 'Step 4: Machine inventory is empty. Please add at least one press.');
            return;
        }
        if (!formData.selectedPlan || !['starter', 'growth', 'enterprise'].includes(formData.selectedPlan)) {
            addToast('error', 'Missing Data', 'Step 6: Invalid plan selected. Please select a valid subscription plan.');
            return;
        }

        setLoading(true);
        try {
            let computedIntegrationLevel = 'Dashboard Only';
            if (formData.selectedPlan === 'growth') computedIntegrationLevel = 'API-ready';
            else if (formData.selectedPlan === 'enterprise') computedIntegrationLevel = 'Fully automated routing';

            // Bundle B2B qualification responses inside a structured metadata object
            const payload = {
                companyName: formData.companyName.trim(),
                contactName: formData.contactName.trim(),
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                country: formData.country,
                city: formData.city.trim(),
                phone: formData.phone.trim() || undefined,
                website: formData.website.trim() || undefined,
                metadata: {
                    b2b_onboarding: true,
                    terms_accepted_at: adminMode ? null : new Date().toISOString(),
                    admin_provisioned: adminMode,
                    qualification: {
                        integrationLevel: computedIntegrationLevel,
                        productionCapabilities: formData.productionTypes,
                        machineInventory: formData.presses.map(p => ({
                            templateId: p.templateId,
                            quantity: p.quantity,
                            name: p.name
                        })),
                        maxSheetSize: formData.maxSheetSize.trim(),
                        typicalJobs: formData.typicalJobs.trim(),
                        monthlyVolume: formData.monthlyVolume,
                        utilization: formData.utilization,
                        compliance_iso_standards: formData.standards,
                        certifications: formData.certifications,
                        qaModules: formData.qaModules,
                        qaCustomDetails: formData.qaCustomDetails.trim(),
                        selectedPlan: formData.selectedPlan,
                        billingInterval: formData.billingInterval,
                    }
                }
            };

            // Route: adminMode → protected admin endpoint, self-register → public auth endpoint
            const endpoint = adminMode
                ? '/api/admin/printhouses/provision'
                : '/api/auth/printhouse/register';

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (adminMode) {
                const token = getAuthToken();
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                addToast('error', 'Error', data?.error || `Error ${response.status}. Please try again.`);
                return;
            }

            if (adminMode) {
                // Admin mode: show success screen without auto-login
                setStep(8);
                return;
            }

            // Self-register mode: auto-login
            if (!data.token || !data.user) {
                addToast('error', 'Unexpected response', 'The server did not return a valid session.');
                return;
            }

            setAuthToken(data.token);
            setAuthUser(data.user);
            setStep(8);

            localStorage.removeItem('printhouse_onboarding_draft');

            // Redirect trial user to dashboard where the PaywallModal or SubscriptionGuard will prompt them if needed
            setTimeout(() => navigate('/dashboard', { replace: true }), 3000);
        } catch {
            addToast('error', 'Connection error', 'Cannot reach the server. Please check your internet connection.');
        } finally {
            setLoading(false);
        }
    }, [formData, navigate, addToast]);

    // Toggle array helpers
    const toggleProductionType = (type: string) => {
        setFormData(p => ({
            ...p,
            productionTypes: p.productionTypes.includes(type)
                ? p.productionTypes.filter(t => t !== type)
                : [...p.productionTypes, type]
        }));
    };

    const toggleCertification = (cert: string) => {
        setFormData(p => ({
            ...p,
            certifications: p.certifications.includes(cert)
                ? p.certifications.filter(c => c !== cert)
                : [...p.certifications, cert]
        }));
    };

    const toggleQaModule = (moduleId: string) => {
        setFormData(p => ({
            ...p,
            qaModules: p.qaModules.includes(moduleId)
                ? p.qaModules.filter(m => m !== moduleId)
                : [...p.qaModules, moduleId]
        }));
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Styles
    // ─────────────────────────────────────────────────────────────────────────

    const backdrop: CSSProperties = {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: dark
            ? 'radial-gradient(ellipse at 20% 20%, rgba(220,0,0,0.07) 0%, transparent 60%), #0e0e0f'
            : 'radial-gradient(ellipse at 20% 20%, rgba(220,0,0,0.04) 0%, transparent 60%), #f1f5f9',
        fontFamily: "'Manrope', system-ui, sans-serif",
    };

    const cardWrap: CSSProperties = {
        width: '100%',
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
    };

    const glassCard: CSSProperties = {
        background: dark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        padding: '48px 40px',
        boxShadow: isFocused
            ? (dark ? '0 40px 80px rgba(0,0,0,0.8)' : '0 40px 80px rgba(0,0,0,0.2)')
            : (dark ? '0 32px 64px rgba(0,0,0,0.6)' : '0 32px 64px rgba(0,0,0,0.10)'),
        transform: isFocused ? 'scale(1.01)' : 'scale(1)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };

    const stepDot = (n: number): CSSProperties => ({
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 800,
        background: step >= n ? '#dc0000' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
        color: step >= n ? '#fff' : dark ? '#52525b' : '#94a3b8',
        border: `1px solid ${step >= n ? '#dc0000' : dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        transition: 'all 0.25s ease',
    });

    const stepLine: CSSProperties = {
        flex: 1, height: 1,
        background: step >= 2 ? '#dc0000' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
        transition: 'background 0.25s ease',
    };

    const strength = checkPasswordStrength(formData.password);

    const renderReviewSummary = () => (
        <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: dark ? '#fff' : '#0f172a' }}>Review your setup</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: dark ? '#ffffff' : '#000000' }}>Selected Plan:</span>
                    <span style={{ fontWeight: 600, color: dark ? '#fff' : '#0f172a' }}>{formData.selectedPlan.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: dark ? '#ffffff' : '#000000' }}>Billing Cycle:</span>
                    <span style={{ fontWeight: 600, color: dark ? '#fff' : '#0f172a' }}>{formData.billingInterval === 'annual' ? 'Annual (Save 20%)' : 'Monthly'}</span>
                </div>

                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(234, 179, 8, 0.1)', borderRadius: '8px', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                    <p style={{ fontSize: '13px', color: '#eab308', margin: 0 }}>
                        {formData.selectedPlan === 'trial' || formData.selectedPlan === 'starter'
                            ? "Your 14-day free evaluation starts immediately upon registration. Full platform access included."
                            : "Your subscription billing cycle starts immediately. Enterprise-grade routing & support active."}
                    </p>
                </div>
            </div>
        </div>
    );

    // ── Success Screen ─────────────────────────────────────────────────────────
    if (step === 8) {
        return (
            <>
                <div style={adminMode ? { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' } : backdrop}>
                    <div style={{ ...cardWrap, maxWidth: 440 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ width: 72, height: 72, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <CheckCircle size={40} strokeWidth={1.5} style={{ color: '#10b981' }} />
                            </div>
                            {!adminMode && <PrintPriceLogo className="w-10 h-10 mx-auto mb-4" />}
                            <h1 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                {adminMode ? 'Partner Provisioned!' : 'Onboarding Complete!'}
                            </h1>
                            <p style={{ margin: '0 0 4px', fontSize: '14px', color: dark ? '#71717a' : '#64748b' }}>
                                {adminMode
                                    ? `${formData.companyName} has been registered and activated. Credentials have been set.`
                                    : 'Your print house has been qualified and registered.'}
                            </p>
                            <p style={{ margin: '0 0 20px', fontSize: '13px', color: dark ? '#52525b' : '#94a3b8' }}>
                                {adminMode
                                    ? 'The partner can now log in using the credentials you provided.'
                                    : 'Activating node & redirecting to dashboard…'}
                            </p>
                            {adminMode && (
                                <button
                                    onClick={() => navigate('/admin/printhouse-onboarding')}
                                    style={{
                                        padding: '10px 24px',
                                        background: '#10b981',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ← Back to Onboarding List
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
            </>
        );
    }



    // ── Main Form ──────────────────────────────────────────────────────────────
    return (
        <>
            <div style={backdrop}>
                {/* Dynamic drift orbs */}
                <MotionBackground />

                <div style={cardWrap}>
                    {/* Branding */}
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 }}>
                        <div style={{ width: 52, height: 52, background: dark ? 'rgba(220,0,0,0.15)' : 'rgba(220,0,0,0.08)', border: '1px solid rgba(220,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PrintPriceLogo className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a', letterSpacing: '-0.3px' }}>
                                PrintPrice Partner Network
                            </h1>
                            <p style={{ margin: '3px 0 0', fontSize: '11px', fontWeight: 700, color: dark ? '#71717a' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                B2B Qualification Stepper
                            </p>
                        </div>
                    </div>

                    {/* Stepper Card */}
                    <div style={{ position: 'relative', zIndex: 1 }} onFocusCapture={() => setIsFocused(true)} onBlurCapture={() => setIsFocused(false)}>
                        <div
                            ref={cardRef}
                            style={glassCard}
                        >
                            {/* Step indicator */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                                {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                    <React.Fragment key={i}>
                                        <div style={stepDot(i)}>{i}</div>
                                        {i < 7 && <div style={{ ...stepLine, background: step >= i + 1 ? '#dc0000' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Progress Bar & Estimated Time */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{
                                    height: '4px',
                                    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${(() => {
                                            const stepPercent = { 1: 14, 2: 28, 3: 42, 4: 57, 5: 71, 6: 85, 7: 100, 8: 100 };
                                            return stepPercent[step] || 0;
                                        })()}%`,
                                        height: '100%',
                                        background: '#dc0000',
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginTop: '8px',
                                    fontSize: '11px',
                                    color: dark ? '#71717a' : '#64748b'
                                }}>
                                    <span>Progress {(() => {
                                        const stepPercent = { 1: 14, 2: 28, 3: 42, 4: 57, 5: 71, 6: 85, 7: 100, 8: 100 };
                                        return stepPercent[step] || 0;
                                    })()}%</span>
                                    <span>Estimated time: {step === 1 ? '3 min left' : step <= 3 ? '2 min left' : '1 min left'}</span>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                    {step === 1 && 'Step 1: Partner Terms'}
                                    {step === 2 && 'Step 2: Company Identity'}
                                    {step === 3 && 'Step 3: Node Capabilities'}
                                    {step === 4 && 'Step 4: Machinery & Volume'}
                                    {step === 5 && 'Step 5: Plan & Compliance'}
                                    {step === 6 && 'Step 6: Review Qualification'}
                                    {step === 7 && 'Step 7: Administrator Credentials'}
                                </h2>
                                <p style={{ margin: 0, fontSize: '13px', color: dark ? '#ffffff' : '#000000' }}>
                                    {step === 1 && 'Review and accept the legal B2B operating terms.'}
                                    {step === 2 && 'Basic identifiers of your facility.'}
                                    {step === 3 && 'Machine output dimensions and capability nodes.'}
                                    {step === 4 && 'Identify baseline machinery and monthly capacity.'}
                                    {step === 5 && 'Select subscription plan & integration standard.'}
                                    {step === 6 && 'Verify all B2B data before establishing your master admin account.'}
                                    {step === 7 && 'Establish the master administrative account.'}
                                </p>
                            </div>

                            {/* ── STEP 1: TERMS ────────────────────────────────────── */}
                            {step === 1 && (
                                <div>
                                    <div
                                        ref={termsContainerRef}
                                        onScroll={handleTermsScroll}
                                        style={{
                                            height: '240px',
                                            overflowY: 'auto',
                                            padding: '16px',
                                            background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                                            marginBottom: '20px',
                                            fontSize: '12px',
                                            lineHeight: '1.6',
                                            color: dark ? '#ffffff' : '#000000',
                                        }}
                                    >
                                        <h4 style={{ color: dark ? '#f4f4f5' : '#0f172a', fontWeight: 800, marginBottom: '8px' }}>B2B Print Node Terms</h4>
                                        <p style={{ fontSize: '10px', opacity: 0.6 }}>Last updated: 2026-03-25</p>
                                        <p><strong>1. Scope:</strong> These Partner Terms govern the commercial relationship between Print Price Pro and B2B print houses joining the PrintPrice OS network.</p>
                                        <p><strong>2. Nature of the Relationship:</strong> PrintPrice Pro operates an orchestration system connecting validated demand with qualified partners. No joint venture or employment relationship is created.</p>
                                        <p><strong>3. Admission and Qualification:</strong> Admission is subject to technical verification of capabilities, equipment, quality control modules, and compliance registry.</p>
                                        <p><strong>4. Partner Obligations:</strong> Partners must maintain accurate capacity levels, execute jobs to spec, secure customer files, and avoid platform bypass.</p>
                                        <p><strong>5. Quality and SLA:</strong> Production must strictly conform to color, binding, and finishing specs. Defective jobs require remediation or reprints.</p>
                                        <p><strong>6. Non-Circumvention:</strong> Partners agree not to bypass PrintPrice Pro to transact directly with platform-sourced publishers.</p>
                                    </div>

                                    <p style={{ fontSize: '12.5px', color: dark ? '#ffffff' : '#000000', fontStyle: 'italic', margin: '18px 0 0', opacity: 0.9, textAlign: 'left', lineHeight: '1.4' }}>
                                        <strong>Start your 14-day free trial.</strong> Full access to all feature nodes. No credit card required upfront.
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            cursor: formData.termsReviewed ? 'pointer' : 'not-allowed',
                                            opacity: formData.termsReviewed ? 1 : 0.5
                                        }}>
                                            <input
                                                type="checkbox"
                                                disabled={!formData.termsReviewed}
                                                checked={formData.termsAccepted}
                                                onChange={(e) => setFormData(p => ({ ...p, termsAccepted: e.target.checked }))}
                                                style={{ width: '18px', height: '18px', accentColor: '#dc0000' }}
                                            />
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: dark ? '#e2e8f0' : '#334155' }}>I accept the Partner Operating Terms</span>
                                        </label>
                                        <span style={{ fontSize: '11px', color: '#dc0000', display: !formData.termsReviewed ? 'block' : 'none' }}>
                                            * Please scroll to the bottom of the terms container to enable acceptance.
                                        </span>
                                    </div>



                                    <div style={{ marginTop: '24px' }}>
                                        <AuthButton id="reg-next-1" type="button" onClick={next} disabled={!formData.termsAccepted}>
                                            <span>Accept & Continue</span>
                                            <ArrowRight size={16} strokeWidth={1.5} />
                                        </AuthButton>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 2: COMPANY IDENTITY ─────────────────────────── */}
                            {step === 2 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <ValidatedInput
                                            id="reg-company"
                                            label="Company Name *"
                                            type="text"
                                            placeholder="Garciaprint Ltd"
                                            value={formData.companyName}
                                            onChange={set('companyName')}
                                            icon={Building2 as any}
                                            error={fieldErrors.companyName}
                                            validator={val => val.trim().length > 0}
                                        />
                                    </div>
                                    <ValidatedInput
                                        id="reg-contact"
                                        label="Contact Name *"
                                        type="text"
                                        placeholder="John Garcia"
                                        value={formData.contactName}
                                        onChange={set('contactName')}
                                        icon={Building2 as any}
                                        error={fieldErrors.contactName}
                                        validator={val => val.trim().length > 0}
                                    />
                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                            Country *
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                id="reg-country"
                                                list="country-options"
                                                placeholder="Type to search country..."
                                                value={COUNTRIES.find(c => c.code === formData.country)?.label || formData.country}
                                                onChange={(e) => {
                                                    const label = e.target.value;
                                                    const found = COUNTRIES.find(c => c.label.toLowerCase() === label.toLowerCase() || c.code.toLowerCase() === label.toLowerCase());
                                                    setFormData(p => ({ ...p, country: found ? found.code : label }));
                                                }}
                                                style={{
                                                    width: '100%', padding: '11px 14px',
                                                    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
                                                    color: dark ? '#f4f4f5' : '#0f172a',
                                                    fontSize: '14px', fontWeight: 500, outline: 'none',
                                                    fontFamily: "'Manrope', system-ui, sans-serif",
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                            {COUNTRIES.some(c => c.code.toLowerCase() === formData.country.toLowerCase()) && (
                                                <div style={{ position: 'absolute', right: '14px', top: '14px', pointerEvents: 'none', zIndex: 10 }}>
                                                    <CheckCircle size={16} strokeWidth={1.5} style={{ color: '#10b981' }} />
                                                </div>
                                            )}
                                        </div>
                                        <datalist id="country-options">
                                            {COUNTRIES.map((c) => (
                                                <option key={c.code} value={c.label} />
                                            ))}
                                        </datalist>
                                        {fieldErrors.country && <span style={{ fontSize: '11px', color: '#ef4444', textAlign: 'left', display: 'block', marginTop: '4px' }}>{fieldErrors.country}</span>}
                                    </div>
                                    <ValidatedInput
                                        id="reg-city"
                                        label="City *"
                                        type="text"
                                        placeholder="London"
                                        value={formData.city}
                                        onChange={set('city')}
                                        icon={MapPin as any}
                                        error={fieldErrors.city}
                                        validator={val => val.trim().length > 0}
                                    />
                                    <ValidatedInput
                                        id="reg-phone"
                                        label="Phone (Optional)"
                                        type="tel"
                                        placeholder="+44 20 7946 0192"
                                        value={formData.phone}
                                        onChange={set('phone')}
                                        icon={Phone as any}
                                        validator={val => val.trim().length > 0}
                                    />
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <ValidatedInput
                                            id="reg-website"
                                            label="Website (Optional)"
                                            type="url"
                                            placeholder="https://garciaprint.com"
                                            value={formData.website}
                                            onChange={set('website')}
                                            icon={Globe as any}
                                            error={fieldErrors.website}
                                            validator={val => val.trim() === '' || /^https?:\/\//.test(val.trim())}
                                        />
                                    </div>

                                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '12px' }}>
                                        <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                        <div style={{ flex: 1 }}>
                                            <AuthButton id="reg-next-2" type="button" onClick={next}>
                                                <span>Continue</span>
                                                <ArrowRight size={16} strokeWidth={1.5} />
                                            </AuthButton>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 3: CAPABILITIES ─────────────────────────────── */}
                            {step === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                                            Production Capabilities (Select all that apply) *
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {B2B_PRODUCTION_TYPES.map(type => {
                                                const active = formData.productionTypes.includes(type);
                                                return (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => toggleProductionType(type)}
                                                        style={badgeBtnStyle(active, dark)}
                                                    >
                                                        {active && <CheckSquare size={14} strokeWidth={1.5} style={{ marginRight: '4px', verticalAlign: 'middle', display: 'inline-block' }} />}
                                                        {type}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{
                                            fontSize: '10px', fontWeight: 800,
                                            color: dark ? '#52525b' : '#94a3b8',
                                            textTransform: 'uppercase', letterSpacing: '0.08em',
                                            fontFamily: "'Manrope', system-ui, sans-serif",
                                            display: 'block', marginBottom: '6px'
                                        }}>
                                            Max Supported Sheet Size *
                                            <InfoTooltip text="Used to route jobs that fit your presses. Reduces waste by 23% on average." />
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <select
                                                id="reg-maxsheet"
                                                value={formData.maxSheetSize}
                                                onChange={set('maxSheetSize')}
                                                style={{
                                                    ...selectStyle(dark),
                                                    border: fieldErrors.maxSheetSize ? '1px solid #ef4444' : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
                                                    boxSizing: 'border-box'
                                                }}
                                            >
                                                <option value="">-- Select Sheet Size Variable --</option>
                                                {SUPPORTED_SHEET_SIZES.map(opt => (
                                                    <option key={opt.value} value={opt.value} style={{ background: dark ? '#18181b' : '#fff' }}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {fieldErrors.maxSheetSize && (
                                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#ef4444', textAlign: 'left' }}>
                                                    {fieldErrors.maxSheetSize}
                                                </p>
                                            )}
                                        </div>
                                        <p style={{ margin: '4.5px 0 0', fontSize: '11px', color: dark ? '#ffffff' : '#000000', textAlign: 'left', lineHeight: '1.4', opacity: 0.85 }}>
                                            Allows our AI to route mathematically perfect jobs to your presses, minimizing paper waste.
                                        </p>
                                    </div>

                                    {/* Minimalist Data Flow Illustration */}
                                    <div style={{
                                        marginTop: '8px',
                                        padding: '16px',
                                        background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                        border: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                                        borderRadius: '8px',
                                        textAlign: 'center'
                                    }}>
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#71717a' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                                            Real-time B2B Orchestration Pipeline
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            <div style={{ padding: '6px 10px', background: dark ? '#18181b' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '4px', fontSize: '10px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                                Capability Node
                                            </div>
                                            <svg width="24" height="12" viewBox="0 0 24 12" fill="none" style={{ flexShrink: 0 }}>
                                                <path d="M0 6H18M18 6L13 2M18 6L13 10" stroke="#dc0000" strokeWidth="1.5" strokeDasharray="3 3" />
                                            </svg>
                                            <div style={{ padding: '6px 10px', background: dark ? '#18181b' : '#fff', border: '1px solid #dc0000', borderRadius: '4px', fontSize: '10px', fontWeight: 700, color: '#dc0000' }}>
                                                PrintPrice OS
                                            </div>
                                            <svg width="24" height="12" viewBox="0 0 24 12" fill="none" style={{ flexShrink: 0 }}>
                                                <path d="M0 6H18M18 6L13 2M18 6L13 10" stroke="#dc0000" strokeWidth="1.5" />
                                            </svg>
                                            <div style={{ padding: '6px 10px', background: '#dc0000', color: '#fff', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                                                JDF Router
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                        <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                        <div style={{ flex: 1 }}>
                                            <AuthButton id="reg-next-3" type="button" onClick={next}>
                                                <span>Continue</span>
                                                <ArrowRight size={16} strokeWidth={1.5} />
                                            </AuthButton>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 4: MACHINERY & CAPACITY ─────────────────────── */}
                            {step === 4 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                            Primary Presses & Finishing Machinery *
                                        </label>

                                        {/* Selector Row */}
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                            <div style={{ flex: 1 }}>
                                                <select
                                                    id="reg-presses-selector"
                                                    value={selectedTemplateId}
                                                    onChange={(e) => {
                                                        setSelectedTemplateId(e.target.value);
                                                        setCustomModel('');
                                                    }}
                                                    style={selectStyle(dark)}
                                                >
                                                    <option value="">-- Select Machine Template --</option>
                                                    <optgroup label="Offset Presses" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                        {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Offset').map(t => (
                                                            <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Digital Presses" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                        {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Digital').map(t => (
                                                            <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Large Format" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                        {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Large Format').map(t => (
                                                            <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Finishing Machinery" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                        {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Finishing').map(t => (
                                                            <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Custom Equipment" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                        <option value="other">Other (Custom Machine)</option>
                                                    </optgroup>
                                                </select>
                                                {selectedTemplateId === 'other' && (
                                                    <div style={{ marginTop: '8px' }}>
                                                        <input
                                                            type="text"
                                                            placeholder="Specify machine model (e.g. Heidelberg Speedmaster SM 52)"
                                                            value={customModel}
                                                            onChange={(e) => setCustomModel(e.target.value)}
                                                            style={{
                                                                ...selectStyle(dark),
                                                                border: fieldErrors.presses ? '1px solid #ef4444' : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                                                                boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start', paddingTop: '1px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', marginTop: '12px' }}>QTY</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="50"
                                                    value={machineQuantity}
                                                    onChange={(e) => setMachineQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                    style={{ ...selectStyle(dark), width: '64px', textAlign: 'center', padding: '11px 8px' }}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!selectedTemplateId) {
                                                        addToast('error', 'Selection Required', 'Please choose a template from the list.');
                                                        return;
                                                    }

                                                    const isOther = selectedTemplateId === 'other';
                                                    if (isOther && !customModel.trim()) {
                                                        addToast('error', 'Specify Model', 'Please specify the machine model.');
                                                        return;
                                                    }

                                                    const template = isOther
                                                        ? { id: 'other', manufacturer: 'Custom', model: customModel.trim(), category: 'Custom' as any }
                                                        : COMMON_MACHINE_TEMPLATES.find(t => t.id === selectedTemplateId);

                                                    if (!template) return;

                                                    const name = isOther ? customModel.trim() : `${template.manufacturer} ${template.model}`;

                                                    // Check if already added
                                                    const exists = formData.presses.some(p => p.name.toLowerCase() === name.toLowerCase());
                                                    if (exists) {
                                                        addToast('warning', 'Already Added', `${name} is already added. Adjust quantity inside the list.`);
                                                        return;
                                                    }

                                                    setFormData(p => ({
                                                        ...p,
                                                        presses: [
                                                            ...p.presses,
                                                            {
                                                                templateId: template.id,
                                                                quantity: machineQuantity,
                                                                name,
                                                                model: name,
                                                                qty: machineQuantity
                                                            }
                                                        ]
                                                    }));
                                                    setSelectedTemplateId('');
                                                    setCustomModel('');
                                                    setMachineQuantity(1);
                                                }}
                                                style={{
                                                    padding: '11px 16px',
                                                    background: '#dc0000',
                                                    color: '#fff',
                                                    border: 'none',
                                                    fontWeight: 800,
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontFamily: "'Manrope', system-ui, sans-serif",
                                                }}
                                            >
                                                <Plus size={16} strokeWidth={1.5} />
                                                Add
                                            </button>
                                        </div>

                                        {/* Selected Machines List */}
                                        {formData.presses.length > 0 ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '8px' }}>
                                                {formData.presses.map((item) => {
                                                    const template = COMMON_MACHINE_TEMPLATES.find(t => t.id === item.templateId);
                                                    return (
                                                        <div key={item.templateId} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '12px 16px',
                                                            background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                                            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                                            borderRadius: '4px',
                                                            backdropFilter: 'blur(8px)',
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{
                                                                    width: '32px',
                                                                    height: '32px',
                                                                    background: dark ? 'rgba(220,0,0,0.15)' : 'rgba(220,0,0,0.08)',
                                                                    border: '1px solid rgba(220,0,0,0.2)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    borderRadius: '4px',
                                                                }}>
                                                                    <Cpu size={16} strokeWidth={1.5} style={{ color: '#dc0000' }} />
                                                                </div>
                                                                <div style={{ textAlign: 'left' }}>
                                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                                                        {item.name}
                                                                    </div>
                                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc0000', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
                                                                        {template?.category || 'Machine'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#71717a' : '#94a3b8', textTransform: 'uppercase' }}>Qty:</span>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max="50"
                                                                        value={item.quantity}
                                                                        onChange={(e) => {
                                                                            const val = Math.max(1, parseInt(e.target.value) || 1);
                                                                            setFormData(p => ({
                                                                                ...p,
                                                                                presses: p.presses.map(m => m.templateId === item.templateId ? { ...m, quantity: val } : m)
                                                                            }));
                                                                        }}
                                                                        style={{
                                                                            width: '50px',
                                                                            padding: '4px',
                                                                            fontSize: '12px',
                                                                            fontWeight: 700,
                                                                            textAlign: 'center',
                                                                            background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                                                            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                                                                            color: dark ? '#f4f4f5' : '#0f172a',
                                                                            outline: 'none',
                                                                        }}
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setFormData(p => ({
                                                                            ...p,
                                                                            presses: p.presses.filter(m => m.templateId !== item.templateId)
                                                                        }));
                                                                    }}
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        padding: '4px',
                                                                        color: dark ? '#a1a1aa' : '#64748b',
                                                                    }}
                                                                >
                                                                    <Trash2 size={16} strokeWidth={1.5} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p style={{ margin: '0 0 12px', fontSize: '12px', color: dark ? '#52525b' : '#94a3b8', fontStyle: 'italic', textAlign: 'left' }}>
                                                No machines added yet. Select a template and click "Add".
                                            </p>
                                        )}
                                        {fieldErrors.presses && <span style={{ fontSize: '11px', color: '#ef4444' }}>{fieldErrors.presses}</span>}
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                            Monthly Production Volume *
                                        </label>
                                        <select
                                            id="reg-volume"
                                            value={formData.monthlyVolume}
                                            onChange={set('monthlyVolume')}
                                            style={selectStyle(dark)}
                                        >
                                            <option value="">Select volume range...</option>
                                            <option value="< 10k copies">&lt; 10,000 copies</option>
                                            <option value="10k – 50k copies">10,000 – 50,000 copies</option>
                                            <option value="50k – 200k copies">50,000 – 200,000 copies</option>
                                            <option value="200k+ copies">200,000+ copies</option>
                                        </select>
                                        {fieldErrors.monthlyVolume && <span style={{ fontSize: '11px', color: '#ef4444' }}>{fieldErrors.monthlyVolume}</span>}
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                            System Utilization *
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {['Low', 'Medium', 'High'].map(util => {
                                                const active = formData.utilization === util;
                                                return (
                                                    <button
                                                        key={util}
                                                        type="button"
                                                        onClick={() => setFormData(p => ({ ...p, utilization: util }))}
                                                        style={{
                                                            flex: 1,
                                                            padding: '10px',
                                                            fontSize: '12px',
                                                            fontWeight: 700,
                                                            background: active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                                            color: active ? '#fff' : (dark ? '#a1a1aa' : '#475569'),
                                                            border: `1px solid ${active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)')}`,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {util}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                        <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                        <div style={{ flex: 1 }}>
                                            <AuthButton id="reg-next-4" type="button" onClick={next}>
                                                <span>Continue</span>
                                                <ArrowRight size={16} strokeWidth={1.5} />
                                            </AuthButton>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 5: PLAN & COMPLIANCE ────────────────────────── */}
                            {step === 5 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Part A: Plan Selection */}
                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '12px' }}>
                                            Subscription Plan *
                                        </label>

                                        {/* Monthly / Annual Toggle Switch */}
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: formData.billingInterval === 'monthly' ? 800 : 500, color: formData.billingInterval === 'monthly' ? (dark ? '#fff' : '#0f172a') : (dark ? '#71717a' : '#64748b') }}>
                                                Monthly Billing
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, billingInterval: p.billingInterval === 'monthly' ? 'annual' : 'monthly' }))}
                                                style={{
                                                    width: '50px',
                                                    height: '26px',
                                                    background: '#dc0000',
                                                    borderRadius: '9999px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    padding: '3px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: formData.billingInterval === 'annual' ? 'flex-end' : 'flex-start',
                                                    transition: 'all 0.25s ease'
                                                }}
                                            >
                                                <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                                            </button>
                                            <span style={{ fontSize: '13px', fontWeight: formData.billingInterval === 'annual' ? 800 : 500, color: formData.billingInterval === 'annual' ? (dark ? '#fff' : '#0f172a') : (dark ? '#71717a' : '#64748b'), display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                Annual Billing
                                                <span style={{ background: 'rgba(220,0,0,0.15)', color: '#dc0000', fontSize: '10px', fontWeight: 900, padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(220,0,0,0.25)' }}>
                                                    SAVE 20%
                                                </span>
                                            </span>
                                        </div>

                                        {/* Plan Cards */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                            {/* Starter Plan (14-DAY FREE TRIAL) */}
                                            <div
                                                onClick={() => setFormData(p => ({ ...p, selectedPlan: 'starter' }))}
                                                style={{
                                                    padding: '24px 16px',
                                                    background: formData.selectedPlan === 'starter' ? (dark ? 'rgba(220,0,0,0.1)' : 'rgba(220,0,0,0.04)') : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                                                    border: formData.selectedPlan === 'starter' ? '2px solid #dc0000' : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                                    cursor: 'pointer',
                                                    borderRadius: '6px',
                                                    transition: 'all 0.25s ease',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    minHeight: '380px',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                <div style={{ width: '100%' }}>
                                                    <Sprout size={40} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ display: 'block', margin: '0 auto 12px' }} />
                                                    <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 900, color: dark ? '#fff' : '#0f172a' }}>14-DAY FREE TRIAL</h3>
                                                    <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: dark ? '#e4e4e7' : '#000000', lineHeight: '1.3' }}>"Full platform evaluation grace period."</p>
                                                    <hr style={{ border: 'none', borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', width: '100%', margin: '14px 0' }} />
                                                    <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', textAlign: 'left', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Preflight:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>10</code> Jobs + <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>10</code> AI Scans</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Mockups:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>15</code> HD generated copies</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Budgeter:</strong> Base BPE Form</span></li>
                                                    </ul>
                                                </div>
                                                <div style={{ marginTop: '14px' }}>
                                                    <div>
                                                        <span style={{ fontSize: '24px', fontWeight: 900, color: dark ? '#fff' : '#0f172a' }}>$0</span>
                                                        <span style={{ fontSize: '12px', color: dark ? '#e4e4e7' : '#000000' }}> / 14 days</span>
                                                    </div>
                                                    <p style={{ margin: '6px 0 0', fontSize: '10px', color: dark ? '#a1a1aa' : '#000000', fontStyle: 'italic', lineHeight: '1.2' }}>
                                                        Requires plan selection after 14 days to maintain node activity.
                                                    </p>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#dc0000', textTransform: 'uppercase', marginTop: '8px' }}>
                                                        {formData.selectedPlan === 'starter' ? 'Selected' : 'Choose Trial'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Growth Plan */}
                                            <div
                                                onClick={() => setFormData(p => ({ ...p, selectedPlan: 'growth' }))}
                                                style={{
                                                    padding: '24px 16px',
                                                    background: formData.selectedPlan === 'growth' ? (dark ? 'rgba(220,0,0,0.1)' : 'rgba(220,0,0,0.04)') : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                                                    border: formData.selectedPlan === 'growth' ? '2px solid #dc0000' : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                                    cursor: 'pointer',
                                                    borderRadius: '6px',
                                                    transition: 'all 0.25s ease',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    minHeight: '380px',
                                                    textAlign: 'center',
                                                    position: 'relative',
                                                }}
                                            >
                                                <div style={{ position: 'absolute', top: '-10px', background: '#dc0000', color: '#fff', fontSize: '10px', fontWeight: 900, padding: '2px 10px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.05em', zIndex: 10 }}>
                                                    Recommended
                                                </div>
                                                <div style={{ width: '100%' }}>
                                                    <TrendingUp size={40} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ display: 'block', margin: '0 auto 12px' }} />
                                                    <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 900, color: dark ? '#fff' : '#0f172a' }}>Growth</h3>
                                                    <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: dark ? '#e4e4e7' : '#000000', lineHeight: '1.3' }}>"Automated sales & workflow scaling."</p>
                                                    <hr style={{ border: 'none', borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', width: '100%', margin: '14px 0' }} />
                                                    <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', textAlign: 'left', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Control Plane:</strong> Unlimited orders</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Preflight:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>100</code> Jobs + <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>100</code> Scans</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Mockups:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>150</code> HD / mo</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Budgeter:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>1,000</code> Chat Credits</span></li>
                                                    </ul>
                                                </div>
                                                <div style={{ marginTop: '14px' }}>
                                                    <div>
                                                        <span style={{ fontSize: '24px', fontWeight: 900, color: dark ? '#fff' : '#0f172a' }}>
                                                            ${formData.billingInterval === 'annual' ? '159' : '199'}
                                                        </span>
                                                        <span style={{ fontSize: '12px', color: dark ? '#e4e4e7' : '#000000' }}>/ mo</span>
                                                    </div>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#dc0000', textTransform: 'uppercase', marginTop: '8px' }}>
                                                        {formData.selectedPlan === 'growth' ? 'Selected' : 'Choose Growth'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Enterprise Plan */}
                                            <div
                                                onClick={() => setFormData(p => ({ ...p, selectedPlan: 'enterprise' }))}
                                                style={{
                                                    padding: '24px 16px',
                                                    background: formData.selectedPlan === 'enterprise' ? (dark ? 'rgba(220,0,0,0.1)' : 'rgba(220,0,0,0.04)') : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                                                    border: formData.selectedPlan === 'enterprise' ? '2px solid #dc0000' : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                                    cursor: 'pointer',
                                                    borderRadius: '6px',
                                                    transition: 'all 0.25s ease',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    minHeight: '380px',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                <div style={{ width: '100%' }}>
                                                    <Factory size={40} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ display: 'block', margin: '0 auto 12px' }} />
                                                    <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 900, color: dark ? '#fff' : '#0f172a' }}>Enterprise</h3>
                                                    <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: dark ? '#e4e4e7' : '#000000', lineHeight: '1.3' }}>"Industrial scale & White-Label deployment."</p>
                                                    <hr style={{ border: 'none', borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', width: '100%', margin: '14px 0' }} />
                                                    <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', textAlign: 'left', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Preflight:</strong> Unlimited Jobs + Scans</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Mockups:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: dark ? '#fff' : '#000' }}>500</code> HD / mo</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Budgeter:</strong> 1st position rotation</span></li>
                                                        <li style={{ fontSize: '11px', color: dark ? '#e4e4e7' : '#000000', display: 'flex', alignItems: 'center' }}><ShieldCheck size={14} strokeWidth={1.5} color="#dc0000" fill="#71717a" fillOpacity={0.25} style={{ marginRight: '6px', flexShrink: 0 }} /><span style={{ color: dark ? '#e4e4e7' : '#000000' }}><strong>Ecosystem:</strong> White-Label Subdomain</span></li>
                                                    </ul>
                                                </div>
                                                <div style={{ marginTop: '14px' }}>
                                                    <div>
                                                        <span style={{ fontSize: '24px', fontWeight: 900, color: dark ? '#fff' : '#0f172a' }}>
                                                            ${formData.billingInterval === 'annual' ? '399' : '499'}
                                                        </span>
                                                        <span style={{ fontSize: '12px', color: dark ? '#e4e4e7' : '#000000' }}>/ mo</span>
                                                    </div>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#dc0000', textTransform: 'uppercase', marginTop: '8px' }}>
                                                        ${formData.selectedPlan === 'enterprise' ? 'Selected' : 'Choose Enterprise'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Part B: Compliance & Integration */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, paddingTop: '20px' }}>
                                        <div>
                                            <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                                                Integration Standard *
                                            </label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {B2B_INTEGRATIONS.map(opt => {
                                                    const active = formData.integrationLevel === opt.title;
                                                    return (
                                                        <button
                                                            key={opt.title}
                                                            type="button"
                                                            onClick={() => setFormData(p => ({ ...p, integrationLevel: opt.title }))}
                                                            style={{
                                                                padding: '12px',
                                                                textAlign: 'left',
                                                                background: active ? (dark ? 'rgba(220,0,0,0.1)' : 'rgba(220,0,0,0.05)') : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                                                                border: `1px solid ${active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)')}`,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 800, fontSize: '13px', color: dark ? '#f4f4f5' : '#0f172a' }}>{opt.title}</span>
                                                                <span style={{ fontSize: '9px', color: '#dc0000', fontWeight: 900 }}>{opt.badge}</span>
                                                            </div>
                                                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: dark ? '#71717a' : '#64748b' }}>{opt.desc}</p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                cursor: 'pointer',
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.standards}
                                                    onChange={(e) => setFormData(p => ({ ...p, standards: e.target.checked }))}
                                                    style={{ width: '18px', height: '18px', accentColor: '#dc0000' }}
                                                />
                                                <span style={{ fontWeight: 700, fontSize: '12px', color: dark ? '#e2e8f0' : '#334155' }}>We follow ISO print standards and FOGRA/GRACoL certifications.</span>
                                            </label>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                                                Certifications
                                                <InfoTooltip text="Higher QA standards automatically unlock access to premium corporate buyers." />
                                            </label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                                                {B2B_CERTIFICATIONS.map(cert => {
                                                    const active = formData.certifications.includes(cert);
                                                    return (
                                                        <button
                                                            key={cert}
                                                            type="button"
                                                            onClick={() => toggleCertification(cert)}
                                                            style={{
                                                                padding: '8px 12px',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                borderRadius: '20px',
                                                                border: active
                                                                    ? '1px solid #dc0000'
                                                                    : (dark ? '1px dashed rgba(255,255,255,0.15)' : '1px dashed rgba(0,0,0,0.15)'),
                                                                background: active
                                                                    ? (dark ? 'rgba(220,0,0,0.12)' : 'rgba(220,0,0,0.05)')
                                                                    : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                                                                color: active ? '#dc0000' : (dark ? '#a1a1aa' : '#475569'),
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s ease',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '6px',
                                                                boxShadow: active
                                                                    ? (dark ? '0 0 10px rgba(220,0,0,0.3)' : '0 0 10px rgba(220,0,0,0.1)')
                                                                    : 'none',
                                                                outline: 'none',
                                                                fontFamily: "'Manrope', system-ui, sans-serif"
                                                            }}
                                                        >
                                                            <ShieldCheck
                                                                size={14}
                                                                strokeWidth={1.5}
                                                                color={active ? '#dc0000' : (dark ? '#52525b' : '#94a3b8')}
                                                                fill={active ? '#dc0000' : 'none'}
                                                                fillOpacity={0.2}
                                                                style={{ flexShrink: 0 }}
                                                            />
                                                            <span>{cert}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p style={{ margin: '8px 0 0', fontSize: '11px', color: dark ? '#ffffff' : '#000000', textAlign: 'left', lineHeight: '1.4', opacity: 0.85 }}>
                                                Higher QA standards automatically unlock access to premium corporate buyers in the PrintPrice network.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                        <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                        <div style={{ flex: 1 }}>
                                            <AuthButton id="reg-next-5" type="button" onClick={next}>
                                                <span>Continue</span>
                                                <ArrowRight size={16} strokeWidth={1.5} />
                                            </AuthButton>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 6: REVIEW SUMMARY ───────────────────────────── */}
                            {step === 6 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {renderReviewSummary()}

                                    <div style={{
                                        background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                        padding: '20px',
                                        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                        borderRadius: '6px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        textAlign: 'left'
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, paddingBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#ffffff' : '#000000', textTransform: 'uppercase' }}>Company Name:</span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a' }}>{formData.companyName}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, paddingBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#ffffff' : '#000000', textTransform: 'uppercase' }}>Location:</span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a' }}>{formData.city}, {COUNTRIES.find(c => c.code === formData.country)?.label || formData.country}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, paddingBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#ffffff' : '#000000', textTransform: 'uppercase' }}>Capabilities:</span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a' }}>{formData.productionTypes.join(', ')}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, paddingBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#ffffff' : '#000000', textTransform: 'uppercase' }}>Machinery:</span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a' }}>{formData.presses.map(p => `${p.name} (Qty: ${p.quantity})`).join('; ')}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, paddingBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#ffffff' : '#000000', textTransform: 'uppercase' }}>Plan Selection:</span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a', textTransform: 'capitalize' }}>{formData.selectedPlan} ({formData.billingInterval})</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#ffffff' : '#000000', textTransform: 'uppercase' }}>Integration Level:</span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f4f4f5' : '#0f172a' }}>{formData.integrationLevel}</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                        <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                        <div style={{ flex: 1 }}>
                                            <AuthButton id="reg-next-6" type="button" onClick={next}>
                                                <span>Proceed to Administrator Setup</span>
                                                <ArrowRight size={16} strokeWidth={1.5} />
                                            </AuthButton>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 7: ADMIN ACCOUNT ────────────────────────────── */}
                            {step === 7 && (
                                <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <AuthInput
                                        id="reg-email"
                                        label="Administrator Email *"
                                        type="email"
                                        autoFocus
                                        autoComplete="email"
                                        placeholder="admin@garciaprint.com"
                                        value={formData.email}
                                        onChange={set('email')}
                                        icon={Mail as any}
                                        error={fieldErrors.email}
                                        disabled={loading}
                                    />

                                    <div>
                                        <AuthInput
                                            id="reg-password"
                                            label="Password *"
                                            type={showPw ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            placeholder="Minimum 8 characters"
                                            value={formData.password}
                                            onChange={set('password')}
                                            icon={Lock as any}
                                            error={fieldErrors.password}
                                            disabled={loading}
                                            rightSlot={
                                                <button type="button" onClick={() => setShowPw((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: dark ? '#52525b' : '#94a3b8' }} aria-label="Toggle password visibility">
                                                    {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                                                </button>
                                            }
                                        />

                                        {/* Password strength meter */}
                                        {formData.password.length > 0 && (
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                                                    {[0, 1, 2, 3].map((i) => (
                                                        <div key={i} style={{
                                                            flex: 1, height: 3,
                                                            background: i < strength.score ? strength.color : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                                            transition: 'background 0.2s ease',
                                                        }} />
                                                    ))}
                                                </div>
                                                <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: strength.color, fontFamily: "'Manrope', system-ui, sans-serif" }}>
                                                    Strength: {strength.label}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <AuthInput
                                        id="reg-confirm-password"
                                        label="Confirm Password *"
                                        type={showCpw ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        placeholder="Confirm password"
                                        value={formData.confirmPassword}
                                        onChange={set('confirmPassword')}
                                        icon={Lock as any}
                                        error={fieldErrors.confirmPassword}
                                        disabled={loading}
                                        rightSlot={
                                            <button type="button" onClick={() => setShowCpw((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: dark ? '#52525b' : '#94a3b8' }} aria-label="Toggle confirm password visibility">
                                                {showCpw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                                            </button>
                                        }
                                    />

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={back}
                                            disabled={loading}
                                            style={backBtnStyle(dark)}
                                        >
                                            <ArrowLeft size={14} strokeWidth={1.5} />
                                            Back
                                        </button>
                                        <div style={{ flex: 1 }}>
                                            <AuthButton id="reg-submit" type="submit" loading={loading} disabled={loading}>
                                                <CheckCircle size={16} strokeWidth={1.5} />
                                                <span>Complete Registration</span>
                                            </AuthButton>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <p style={{ textAlign: 'center', fontSize: '12px', color: dark ? '#3f3f46' : '#94a3b8', fontWeight: 600, margin: 0 }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#dc0000', textDecoration: 'none', fontWeight: 700 }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>

            <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
    );
};

// Styles helpers
const backBtnStyle = (dark: boolean): CSSProperties => ({
    flex: '0 0 auto', padding: '13px 16px',
    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    color: dark ? '#a1a1aa' : '#64748b',
    fontSize: '13px', fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
    fontFamily: "'Manrope', system-ui, sans-serif",
});

const badgeBtnStyle = (active: boolean, dark: boolean): CSSProperties => ({
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    background: active ? 'rgba(220,0,0,0.15)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
    border: `1px solid ${active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)')}`,
    color: active ? '#dc0000' : (dark ? '#a1a1aa' : '#475569'),
    cursor: 'pointer',
    transition: 'all 0.2s ease'
});

const textareaStyle = (dark: boolean): CSSProperties => ({
    width: '100%',
    padding: '12px',
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
    color: dark ? '#f4f4f5' : '#0f172a',
    fontSize: '14px',
    fontWeight: 500,
    outline: 'none',
    fontFamily: "'Manrope', system-ui, sans-serif",
    minHeight: '80px',
    resize: 'vertical',
    boxSizing: 'border-box'
});

const selectStyle = (dark: boolean): CSSProperties => ({
    width: '100%',
    padding: '11px 14px',
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
    color: dark ? '#f4f4f5' : '#0f172a',
    fontSize: '14px',
    fontWeight: 500,
    outline: 'none',
    fontFamily: "'Manrope', system-ui, sans-serif",
});

// ─────────────────────────────────────────────────────────────────────────────
// Page Export
// ─────────────────────────────────────────────────────────────────────────────

export const PrinthouseRegistrationPage: React.FC<{ adminMode?: boolean }> = ({ adminMode = false }) => {
    if (adminMode) {
        return <AdminPrinthouseProvision />;
    }
    return <PublicPrinthouseRegistration />;
};

