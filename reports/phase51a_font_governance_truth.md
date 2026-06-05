# Phase 51A: Font Governance Truth & Policy Matrix

## Executive Summary
This document establishes the initial governance contract for font-related Preflight findings. Fonts are visually sensitive and carry significant risks of reflow, glyph changes, and legal violations when manipulated automatically. Phase 51A explicitly separates font **findings** (detectable issues) from font **fixes** (which remain explicitly disabled, unauthorized for production, and require human review).

## Font Governance Truth Table

| Issue Area | Canonical Fix | Detectable | Engine Status | Truth Status | Review Required | Prod Certified |
|------------|---------------|------------|---------------|--------------|----------------|----------------|
| `NON_EMBEDDED_FONTS` | `EMBED_FONTS` | ✅ Yes | `UNSUPPORTED` | `REVIEW_REQUIRED_CAPABILITY` | ✅ Yes | ❌ No |
| `TYPE3_FONTS` | `OUTLINE_FONTS` | ✅ Yes | `UNSUPPORTED` | `REVIEW_REQUIRED_CAPABILITY` | ✅ Yes | ❌ No |
| `MISSING_GLYPHS` | `GLYPH_REPAIR` | ✅ Yes | `UNSUPPORTED` | `BLOCKED_UNSAFE` | ✅ Yes | ❌ No |
| `FONT_SUBSTITUTION_RISK` | `REPLACE_MISSING_FONTS`| ✅ Yes | `UNSUPPORTED` | `REVIEW_REQUIRED_CAPABILITY` | ✅ Yes | ❌ No |

## Current System State

### Detectable Today
- `NON_EMBEDDED_FONTS`
- `TYPE3_FONTS`
- `MISSING_GLYPHS`
- `FONT_SUBSTITUTION_RISK`

### Safely Correctable Today
- **None.** All font-related fixes are currently scaffolded as `implemented: false`, `autofixable: false`, and `production_safe: false`.

### Why Automatic Font Fixes Are Risky
- **Layout Reflow**: Font substitution or embedding using alternative metric dictionaries can cause text to reflow unpredictably.
- **Glyph Drops**: Character subsets might be missing, leading to dropped glyphs or rendering as squares.
- **Licensing Restrictions**: Automatically embedding a proprietary font may violate usage agreements.

## Policy Matrix

| Policy Target | Treatment for Font Fixes |
|---------------|--------------------------|
| **SAFE** Mode | Automatically skipped. Font findings block `production_certified` status. |
| **REVIEW_REQUIRED** | Skipped/Unsupported. Operator must review findings in the Control Plane. |
| **BLOCKED** | `MISSING_GLYPHS` are treated as critical (blocked unsafe) unless explicitly overridden. |
| **EXPERIMENTAL** | Allowed for diagnostic trials only, but still requires explicit human review. |

## Control Plane Wording

### Customer Summary Wording
> "The PDF uses fonts that may not be safely available for production. A human review is required."

### Operator Breakdown Examples
- **`NON_EMBEDDED_FONTS`**: "The PDF contains fonts that are not embedded. Output may vary across RIPs or production systems."
- **`TYPE3_FONTS`**: "The PDF contains Type3 fonts, which can render unpredictably in print workflows and require review."
- **`MISSING_GLYPHS`**: "Some characters may not render correctly because glyphs are missing. The source file or correct font may be required."

## Next Phase Recommendation
Proceed to **Phase 51B**, which will tackle the actual implementation of `EMBED_FONTS` utilizing ghostscript, carefully adhering to the `REVIEW_REQUIRED` and `EXPERIMENTAL` policy bounds defined here.
