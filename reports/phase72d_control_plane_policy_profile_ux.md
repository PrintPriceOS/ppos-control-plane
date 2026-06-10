# Phase 72D — Control Plane Policy Profile Admin UX

**Generated:** 2026-06-10T18:59:55.911Z  
**Smoke:** ✅ PASSED  
**Results:** 66/66 passed

## New Files
- `src/api/services/policyProfileService.js` — profile resolution + panel builder
- `src/ui/components/PolicyProfilePanel.tsx` — operator React component

## Test Results
| # | Test | Pass |
|---|------|------|
| 1 | 1.1 profile_id from worker governance | ✅ |
| 2 | 1.1 source=worker_governance | ✅ |
| 3 | 1.1 profile_label is string | ✅ |
| 4 | 1.2 NONE default when no governance present | ✅ |
| 5 | 1.2 source=default | ✅ |
| 6 | 1.3 NONE profile_id treated as default | ✅ |
| 7 | 2.1 profile_id from pre-computed | ✅ |
| 8 | 2.1 profile_passed from pre-computed | ✅ |
| 9 | 2.1 source=pre_computed_by_worker | ✅ |
| 10 | 2.2 profile_passed=false preserved | ✅ |
| 11 | 2.2 PROFILE_BLEED_REQUIRED preserved | ✅ |
| 12 | 2.3 production_certified scrubbed to false | ✅ |
| 13 | 2.3 standard_certified scrubbed to false | ✅ |
| 14 | 2.3 compliance_claim_allowed scrubbed to false | ✅ |
| 15 | 2.4 Fresh evaluation returns profile_passed boolean | ✅ |
| 16 | 2.4 Fresh evaluation: production_certified=false | ✅ |
| 17 | 3.1 buildProfilePanel ok=true | ✅ |
| 18 | 3.1 policy_profile_ux present | ✅ |
| 19 | 3.1 active_profile.profile_id | ✅ |
| 20 | 3.1 profile_passed=true | ✅ |
| 21 | 3.1 profile_blockers is array | ✅ |
| 22 | 3.1 profile_warnings is array | ✅ |
| 23 | 3.1 audience=operator | ✅ |
| 24 | 3.2 ok=true for blocked profile | ✅ |
| 25 | 3.2 profile_passed=false | ✅ |
| 26 | 3.2 PROFILE_BLEED_REQUIRED in panel | ✅ |
| 27 | 3.2 JS blocker in panel | ✅ |
| 28 | 3.3 blockers_detail present for operator | ✅ |
| 29 | 3.3 blockers_detail not empty | ✅ |
| 30 | 3.3 blockers_detail[].code present | ✅ |
| 31 | 3.3 blockers_detail[].description present | ✅ |
| 32 | 3.4 audience=customer | ✅ |
| 33 | 3.4 no blockers_detail for customer | ✅ |
| 34 | 4.1 Raw filesystem paths redacted from panel output | ✅ |
| 35 | 4.2 No PII keys in panel output | ✅ |
| 36 | 5.1 production_certified=false | ✅ |
| 37 | 5.2 standard_certified=false | ✅ |
| 38 | 5.3 compliance_claim_allowed=false | ✅ |
| 39 | 5.4 print_ready_claim_allowed=false | ✅ |
| 40 | 5.5 No production_certified:true in JSON | ✅ |
| 41 | 5.6 No standard_certified:true in JSON | ✅ |
| 42 | 5.7 No compliance_claim_allowed:true in JSON | ✅ |
| 43 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_BLEED_REQUIRED" | ✅ |
| 44 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_TAC_LIMIT_EXCEEDED" | ✅ |
| 45 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_CMYK_REQUIRED" | ✅ |
| 46 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_FONTS_MUST_BE_EMBEDDED" | ✅ |
| 47 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_TYPE3_FONTS_NOT_ALLOWED" | ✅ |
| 48 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_NO_JAVASCRIPT_VIOLATED" | ✅ |
| 49 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_NO_EMBEDDED_FILES_VIOLATED" | ✅ |
| 50 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_NO_LAUNCH_ACTIONS_VIOLATED" | ✅ |
| 51 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_CROP_MARKS_REQUIRED" | ✅ |
| 52 | 6.1 BLOCKER_DESCRIPTIONS has "PROFILE_STANDARD_MISMATCH" | ✅ |
| 53 | 7.1 PolicyProfilePanel.tsx exists | ✅ |
| 54 | 7.2 Component export present | ✅ |
| 55 | 7.3 profile_passed rendered | ✅ |
| 56 | 7.4 profile_blockers rendered | ✅ |
| 57 | 7.5 profile_warnings rendered | ✅ |
| 58 | 7.6 data-testid attributes for testing | ✅ |
| 59 | 7.7 Governance note in component | ✅ |
| 60 | 7.8 No "✅ Production Certified" in component | ✅ |
| 61 | 8.1 policyProfileService.js exists | ✅ |
| 62 | 8.2 getActiveProfile exported | ✅ |
| 63 | 8.3 evaluateProfileStatus exported | ✅ |
| 64 | 8.4 buildProfilePanel exported | ✅ |
| 65 | 8.5 production_certified:false enforcement | ✅ |
| 66 | 8.6 BLOCKER_DESCRIPTIONS present | ✅ |
