/**
 * src/ui/components/printhouse/onboarding/BindingFamilyIcons.tsx
 *
 * Dedicated, accessible SVG iconography for printshop binding families:
 * - Hardcover (Tapa dura)
 * - Softcover (Rústica)
 * - Wire-O (Espiral doble)
 * - Saddle Stitch (Grapado al caballete)
 *
 * Accessibility:
 * - Includes role="img" and aria-hidden="true" (labeling provided by parent container/text).
 * - High-contrast stroke & fill tailored for dark/light themes.
 */
import React from 'react';

export interface BindingIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number;
    className?: string;
    title?: string;
}

/**
 * Hardcover / Tapa dura:
 * Distinctive features: Rigid book board with overhang (cejilla), headbands (cabezadas), square spine.
 */
export const HardcoverIcon: React.FC<BindingIconProps> = ({
    size = 28,
    className = '',
    title,
    ...props
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-hidden="true"
        {...props}
    >
        {/* Outer rigid board with overhang (cejilla) */}
        <rect x="5" y="4" width="22" height="24" rx="2" stroke="currentColor" strokeWidth="1.8" className="text-zinc-800 dark:text-zinc-100" />
        {/* Rigid square spine line */}
        <line x1="10" y1="4" x2="10" y2="28" stroke="currentColor" strokeWidth="1.8" className="text-zinc-800 dark:text-zinc-100" />
        {/* Book block (interior pages with margin inside casing) */}
        <rect x="12" y="6" width="13" height="20" rx="1" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1 1" className="text-zinc-600 dark:text-zinc-400" />
        {/* Top headband (cabezada superior) */}
        <rect x="8" y="5" width="4" height="2" rx="0.5" fill="#dc0000" />
        {/* Bottom headband (cabezada inferior) */}
        <rect x="8" y="25" width="4" height="2" rx="0.5" fill="#dc0000" />
    </svg>
);

/**
 * Softcover / Rústica:
 * Distinctive features: Flexible wrap-around card cover, spine hinge score lines (hendidos de cortesía).
 */
export const SoftcoverIcon: React.FC<BindingIconProps> = ({
    size = 28,
    className = '',
    title,
    ...props
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-hidden="true"
        {...props}
    >
        {/* Flexible cover */}
        <rect x="6" y="5" width="20" height="22" rx="1.5" stroke="currentColor" strokeWidth="1.8" className="text-zinc-800 dark:text-zinc-100" />
        {/* Spine hinge score line (hendido de cortesía) */}
        <line x1="10" y1="5" x2="10" y2="27" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" className="text-zinc-700 dark:text-zinc-300" />
        {/* Interior page block flush with cover edge */}
        <path d="M 12 8 L 23 8 M 12 12 L 23 12 M 12 16 L 21 16 M 12 20 L 23 20 M 12 24 L 19 24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-500 dark:text-zinc-400" />
        {/* Spine glue layer accent */}
        <line x1="6" y1="5" x2="6" y2="27" stroke="#dc0000" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
);

/**
 * Wire-O:
 * Distinctive features: Twin-loop wire spiral rings through visible punched circular holes.
 */
export const WireOIcon: React.FC<BindingIconProps> = ({
    size = 28,
    className = '',
    title,
    ...props
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-hidden="true"
        {...props}
    >
        {/* Document page body */}
        <rect x="9" y="4" width="18" height="24" rx="1.5" stroke="currentColor" strokeWidth="1.8" className="text-zinc-800 dark:text-zinc-100" />
        {/* Horizontal page lines */}
        <line x1="14" y1="9" x2="23" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-500" />
        <line x1="14" y1="14" x2="23" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-500" />
        <line x1="14" y1="19" x2="23" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-500" />
        <line x1="14" y1="24" x2="20" y2="24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-500" />
        {/* Punched holes and Wire-O twin rings */}
        {[7, 12, 17, 22].map((y) => (
            <g key={y}>
                {/* Punch hole */}
                <circle cx="10" cy={y} r="1.3" fill="currentColor" className="text-zinc-900 dark:text-zinc-100" />
                {/* Twin wire loops */}
                <path
                    d={`M 6 ${y - 1.2} C 4 ${y - 1.2} 4 ${y + 1.2} 10 ${y + 1.2}`}
                    stroke="#dc0000"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    fill="none"
                />
            </g>
        ))}
    </svg>
);

/**
 * Saddle Stitch / Grapado al caballete:
 * Distinctive features: Folded booklet with two prominent metallic wire staples along the fold line.
 */
export const SaddleStitchIcon: React.FC<BindingIconProps> = ({
    size = 28,
    className = '',
    title,
    ...props
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-hidden="true"
        {...props}
    >
        {/* Open folded booklet silhouette */}
        <path
            d="M 5 6 L 16 4 L 27 6 L 27 26 L 16 28 L 5 26 Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            className="text-zinc-800 dark:text-zinc-100"
        />
        {/* Center fold crease line */}
        <line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400 dark:text-zinc-500" />
        {/* Left page line hints */}
        <line x1="8" y1="12" x2="13" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-600" />
        <line x1="8" y1="17" x2="13" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-600" />
        {/* Right page line hints */}
        <line x1="19" y1="11" x2="24" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-600" />
        <line x1="19" y1="16" x2="24" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-zinc-400 dark:text-zinc-600" />
        {/* Top staple (grapa metálica) */}
        <rect x="14.6" y="9" width="2.8" height="5" rx="1" fill="#dc0000" stroke="currentColor" strokeWidth="0.8" className="text-zinc-900 dark:text-white" />
        {/* Bottom staple (grapa metálica) */}
        <rect x="14.6" y="19" width="2.8" height="5" rx="1" fill="#dc0000" stroke="currentColor" strokeWidth="0.8" className="text-zinc-900 dark:text-white" />
    </svg>
);

/**
 * Universal dispatcher helper for binding family icons
 */
export const BindingIcon: React.FC<{ family: string; size?: number; className?: string }> = ({
    family,
    size = 28,
    className = ''
}) => {
    const famStr = String(family || 'HARDCOVER').toUpperCase();
    switch (famStr) {
        case 'HARDCOVER':
        case 'TAPA_DURA':
        case 'TAPADURA':
            return <HardcoverIcon size={size} className={className} />;
        case 'SOFTCOVER':
        case 'RUSTICA':
        case 'RÚSTICA':
            return <SoftcoverIcon size={size} className={className} />;
        case 'WIRE_O':
        case 'WIREO':
        case 'ESPIRAL':
            return <WireOIcon size={size} className={className} />;
        case 'SADDLE_STITCH':
        case 'GRAPADO':
        case 'STITCHED':
            return <SaddleStitchIcon size={size} className={className} />;
        default:
            return <SoftcoverIcon size={size} className={className} />;
    }
};
