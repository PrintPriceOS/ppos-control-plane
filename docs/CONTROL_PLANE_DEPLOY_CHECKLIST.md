# CONTROL_PLANE_DEPLOY_CHECKLIST

**Target Domain**: `control.printprice.pro`
**Release Type**: UI Serving & Auth Fix

This checklist is for a git-driven redeploy in Plesk or any standard Node.js runtime.

## 🚀 Redeploy Steps

1. **Fetch Latest Code**: 
   `git pull origin main`
2. **Update Dependencies**:
   `npm install` (Required as new frontend/static packages were added)
3. **Build Frontend Bundle**:
   `npm run build`
   *This will generate the `dist` folder that server.js now requires.*
4. **Environment Check**:
   Confirm `.env` is present and contains the `PPOS_CONTROL_TOKEN`.
5. **Restart Service**:
   Restart the Phusion Passenger (Plesk) or generic `server.js` process.

## ✅ Validation (Post-Deploy)

- [ ] `https://control.printprice.pro/` (Should load the UI shell, not return Unauthorized)
- [ ] `https://control.printprice.pro/health` (Should return UP)
- [ ] `https://control.printprice.pro/favicon.ico` (Should be accessible)
- [ ] `https://control.printprice.pro/api/system/health` (Should return connectivity stats)

---

**CRITICAL NOTE**: Do NOT skip the `npm run build` step; otherwise, the server will error out trying to serve the `dist` folder.
