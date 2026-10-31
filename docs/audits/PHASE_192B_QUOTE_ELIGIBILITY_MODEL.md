# Phase 192B: Quote Eligibility Model

## 1. Eligibility Formula

$$\text{LIVE\_QUOTE\_ELIGIBLE} = \text{MARKETPLACE\_VISIBLE} \land \text{LIVE\_QUOTING\_ALLOWED} \land \text{VALID\_PUBLISHED\_PRICING} \land \text{NOT\_SUSPENDED}$$

## 2. Decision Tree
```text
                          [ Live Quote Request ]
                                    │
                       [ Check activationAdapter ]
                      /                           \
           (Granted) /                             \ (Not Granted / Suspended)
                    ▼                               ▼
       [ Resolve Price Book ]            [ Reject: LIVE_QUOTING_NOT_GRANTED ]
       /                    \
(Published) /                \ (Draft / Missing)
           ▼                  ▼
[ Execute Engine ]     [ Reject: NO_PUBLISHED_PRICE_BOOK ]
           │
           ▼
 [ Return Live Quote ]
```
