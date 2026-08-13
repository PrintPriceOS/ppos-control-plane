# Phase 191A — Target Onboarding Architecture

## 1. Architectural Overview
The target architecture decouples user signup from factory provisioning into three distinct stages:

```
[ Public Signup ] ---> [ Email Activation / Google OAuth ] ---> [ Printhouse Setup Hub (Dashboard) ]
(Email or Google)       (Account & Tenant Provisioning)         (Modular In-Dashboard Setup)
```

## 2. Component Design & Responsibilities

### Backend Services
1. `printhouseIdentityService.js`: Email normalization, duplicate check, user registration request management.
2. `printhouseActivationService.js`: Token generation (SHA-256 hash persistence), token validation, single-use consumption.
3. `printhouseOnboardingService.js`: Modular read/write of onboarding profile sections.
4. `onboardingReadinessService.js`: Evaluates facts against rules to compute readiness scores (`account_setup`, `operational_readiness`, `marketplace_readiness`).
5. `emailDeliveryService.js`: Provider-agnostic abstraction for email dispatch (SES/Resend/SMTP fallback).
6. `googleIdentityService.js`: Validates Google ID token signatures, issuers, audiences, and `email_verified` claims.

### Database Tables (Additive)
1. `printhouse_signup_requests`: Stores pending registration requests, hashed activation tokens, expiration, and attempt metadata.
2. `printhouse_onboarding_profiles`: Tracks section completion timestamps and readiness snapshots per tenant.

## 3. UI Component Architecture (`Printhouse Setup Hub`)
Location: `src/ui/pages/printhouse/PrinthouseSetupHub.tsx`
Extracted Modules:
- `CompanyProfileSetupCard.tsx`
- `ProductionSiteSetupCard.tsx`
- `MachineSetupWizard.tsx`
- `CapabilitySetupCard.tsx`
- `PricingSetupWizard.tsx`
- `IntegrationSetupCard.tsx`
- `MarketplaceReadinessCard.tsx`
