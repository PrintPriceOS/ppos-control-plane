# Runbook — PPOS Control Plane

## 🎡 Governance Overview
The `ppos-control-plane` is the central observability and coordination hub for the PrintPrice OS.

---

## 🛠 Operation & Setup

### 1. Initial Setup
```bash
npm install
cp .env.example .env
npm start
```

### 2. Environment Variables
| Variable | Description | Default |
| :--- | :--- | :--- |
| `PPOS_CONTROL_PORT` | Port for the control plane | `8080` |
| `PPOS_CONTROL_TOKEN`| Bearer token for admin API | `admin-secret` |

---

## 🚑 Health & Troubleshooting

### Health Check Endpoint
- **URL**: `GET /health` (Public)
- **Output**: Returns service core status and metrics.

### Security (Bearer Token)
- All `/federation/*` endpoints require an `Authorization: Bearer <TOKEN>` header.
- 401 response indicates a missing or invalid token.

### Federation Monitoring
- The control plane polls child services for health status.
- Monitor logs for `Federation check failed` to identify regional outages.

---

## 🚀 Deployment (Staging)
1. Ensure `NODE_ENV=production`.
2. Secure the `PPOS_CONTROL_TOKEN` with a strong secret.
3. Deploy behind a VPN or with IP-restricted access for extra security.
