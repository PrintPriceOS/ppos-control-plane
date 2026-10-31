# Phase 192C: Deterministic Ranking Model

## 1. Candidate Scoring Formula
```text
MatchScore = BaseScore (80)
           + 10 (Process Capability Match)
           + 10 (Live Quote Eligibility)
```

## 2. Deterministic Tie-Breaking
When candidates achieve identical match scores, candidates are ordered deterministically by `printhouseId` ASC. SQL row order or non-deterministic scores are strictly forbidden.
