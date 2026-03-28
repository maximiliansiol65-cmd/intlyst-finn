# 🚀 INTLYST PRODUCTION DEPLOYMENT GUIDE

## Quick Start Deployment

### Option 1: Docker Deployment (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/your-org/intlyst.git
cd intlyst/Backend/backend

# 2. Create production environment file
cp .env.example .env.production
# EDIT: Set real API keys in .env.production

# 3. Build production image
docker build --target production -t intlyst-api:v1.0.0 .

# 4. Run container
docker run -d \
  --name intlyst-api \
  -p 8000:8000 \
  --env-file .env.production \
  --restart always \
  intlyst-api:v1.0.0

# 5. Verify running
curl http://localhost:8000/
# Expected: {"status":"ok",...}
```

### Option 2: Docker Compose (Full Stack)

```bash
# 1. Setup
cp .env.example .env.production
# EDIT: Set all production values

# 2. Build & start
docker-compose -f docker-compose.yml up -d --build

# 3. Verify
docker-compose ps
docker-compose logs -f api

# 4. Access
# API: http://localhost:8000
# Frontend: http://localhost:5173 (development only)
```

## Production Checklist

### Security Preparation
- [ ] Generated strong JWT secret (32+ bytes):
  ```bash
  openssl rand -base64 32
  ```
  
- [ ] Rotated Anthropic API key:
  - Go to https://console.anthropic.com/
  - Generate new key
  - Update `.env.production`
  
- [ ] Rotated Google Maps API key:
  - Go to https://console.cloud.google.com/
  - Generate new key
  - Enable Maps APIs
  - Update `.env.production`
  
- [ ] Set STRIPE_SECRET_KEY:
  - Use `sk_live_...` (not `sk_test_...`)
  - From https://dashboard.stripe.com/
  
- [ ] Generated Stripe webhook secret:
  - From https://dashboard.stripe.com/webhooks
  
- [ ] Set ALLOWED_ORIGINS to production domain:
  ```bash
  ALLOWED_ORIGINS=https://intlyst.example.com,https://app.intlyst.example.com
  ```

### Infrastructure Preparation
- [ ] SSL/TLS certificate ready (Let's Encrypt or commercial CA)
- [ ] Reverse proxy configured (Nginx recommended)
- [ ] Database backup strategy in place (daily backups)
- [ ] Monitoring & alerting configured (Sentry, DataDog, etc.)
- [ ] Logging aggregation configured (CloudWatch, ELK, etc.)

### Testing
- [ ] Run all 45 tests in production config:
  ```bash
  python test_ai_v2.py
  # All 45/45 should pass
  ```
  
- [ ] Load test (1000 requests, 50 concurrent):
  ```bash
  ab -n 1000 -c 50 http://localhost:8000/api/ai/analysis
  ```
  
- [ ] Test fallback system (simulate API outage):
  ```bash
  python test_ai_v2.py --force-fallback
  ```

## Production Infrastructure Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    PRODUCTION ARCHITECTURE               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ USERS (Internet)                                │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────┐    │
│  │ CloudFlare / CDN (DDoS Protection, Edge Cache)  │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────┐    │
│  │ Nginx Reverse Proxy                            │    │
│  │ ├─ SSL/TLS Termination                         │    │
│  │ ├─ Rate Limiting (30 req/s for /api/ai)       │    │
│  │ ├─ Security Headers (HSTS, CSP)               │    │
│  │ └─ Gzip Compression                           │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────┐    │
│  │ Load Balancer (if multiple API instances)      │    │
│  │ ├─ Healthcheck: GET / (200 OK)                 │    │
│  │ ├─ Least connections algorithm                 │    │
│  │ └─ Failover to backup instance                 │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────┐    │
│  │ Docker Swarm / Kubernetes Cluster               │    │
│  │ ├─ Container 1: API Instance                   │    │
│  │ ├─ Container 2: API Instance (replica)         │    │
│  │ └─ Container 3: API Instance (replica)         │    │
│  │                                                 │    │
│  │ Port 8000 TCP                                  │    │
│  │ Memory: 512MB min (API gets ~200MB)           │    │
│  │ CPU: 0.5 core min per instance                │    │
│  │ Restart: Always                                │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                   │
│  ┌────────────────────X────────────────────────────┐    │
│  │                                                 │    │
│  │  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │ PostgreSQL   │  │ Redis Cache  │              │    │
│  │  │ Database     │  │ (Sessions)   │              │    │
│  │  │ Replica 1    │  └──────────────┘              │    │
│  │  │ Replica 2    │                                │    │
│  │  │ Backups      │  ┌──────────────────┐         │    │
│  │  │ (3 copies)   │  │ External APIs    │         │    │
│  │  └──────────────┘  ├─ Anthropic      │         │    │
│  │                    ├─ Google Maps    │         │    │
│  │  ┌──────────────┐  ├─ Stripe         │         │    │
│  │  │ File Storage │  └──────────────────┘         │    │
│  │  │ S3 / Blob    │                                │    │
│  │  │ Backups      │  ┌──────────────────┐         │    │
│  │  │ (Encrypted)  │  │ Monitoring       │         │    │
│  │  └──────────────┘  ├─ Sentry (Errors)│         │    │
│  │                    ├─ DataDog (APM) │         │    │
│  │                    └──────────────────┘         │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Deployment Commands

### AWS ECS / Fargate

```bash
# 1. Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker build -t intlyst-api:v1.0.0 .
docker tag intlyst-api:v1.0.0 123456789.dkr.ecr.us-east-1.amazonaws.com/intlyst-api:v1.0.0
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/intlyst-api:v1.0.0

# 2. Update ECS task definition (see ecs-task-definition.json)
aws ecs update-service --cluster production --service intlyst-api --force-new-deployment
```

### Kubernetes Deployment

```bash
# 1. Create namespace
kubectl create namespace intlyst-prod

# 2. Create secrets
kubectl create secret generic intlyst-secrets \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-... \
  --from-literal=JWT_SECRET=... \
  --from-literal=STRIPE_SECRET_KEY=sk_live_... \
  -n intlyst-prod

# 3. Deploy
kubectl apply -f k8s-deployment.yaml -n intlyst-prod

# 4. Verify
kubectl get pods -n intlyst-prod
kubectl logs -f deployment/intlyst-api -n intlyst-prod

# 5. Check service
kubectl get svc -n intlyst-prod
```

### Traditional VM Deployment

```bash
# 1. Install dependencies
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Create app directory
sudo mkdir -p /opt/intlyst
sudo chown $USER:$USER /opt/intlyst
cd /opt/intlyst

# 3. Copy files
scp -r . user@host:/opt/intlyst/

# 4. Create systemd service
sudo tee /etc/systemd/system/intlyst-api.service > /dev/null <<EOF
[Unit]
Description=INTLYST API Service
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/intlyst
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable intlyst-api
sudo systemctl start intlyst-api

# 5. Monitor
sudo systemctl status intlyst-api
sudo journalctl -fu intlyst-api
```

## Post-Deployment Verification

```bash
# 1. Health check
curl -X GET https://intlyst.example.com/
# Expected: {"status":"ok"}

# 2. AI endpoint test
curl -X GET "https://intlyst.example.com/api/ai/analysis?days=30"
# Expected: {"summary":"...", "health_score":75, "source":"claude", ...}

# 3. Metrics endpoint
curl -X GET "https://intlyst.example.com/api/ai/metrics"
# Expected: {"endpoints":{...}, "totals":{...}}

# 4. Response times
curl -w "\nTime: %{time_total}s\n" -X GET "https://intlyst.example.com/api/ai/analysis?days=30"
# Expected: Time < 1s

# 5. SSL verification
curl -I https://intlyst.example.com/ | grep -i ssl
# Expected: HSTS header present
```

## Monitoring Setup

### Sentry (Error Tracking)
```bash
pip install sentry-sdk
# Add to main.py:
import sentry_sdk
sentry_sdk.init("https://key@sentry.io/project")
```

### New Relic (APM)
```bash
pip install newrelic
newrelic-admin generate-config YOUR_LICENSE_KEY newrelic.ini
newrelic-admin run-program uvicorn main:app
```

### DataDog (Infrastructure)
```bash
docker run -d \
  --name dd-agent \
  --env DD_API_KEY=YOUR_API_KEY \
  datadog/agent:latest
```

## Scaling Strategy

### Horizontal Scaling (Add More Instances)
```
Load: 0-100 req/s   → 1 instance       (1 CPU, 1GB RAM)
Load: 100-500 req/s → 3 instances      (3 CPUs, 3GB RAM)
Load: 500+ req/s    → 5+ instances     (5+ CPUs, 5GB+ RAM)

Rule: Add 1 instance when CPU > 70% or Memory > 80%
Remove instance when CPU < 30% for 10 minutes
```

### Vertical Scaling (Larger Instances)
```
Max CPU per instance: 2 cores (more requires load balancing)
Max Memory per instance: 4GB (more is inefficient)
Recommended: Use horizontal scaling above 70% utilization
```

## Disaster Recovery

### Backup Strategy
```bash
# Daily PostgreSQL backups
docker exec intlyst-db pg_dump -U intlyst intlyst > backup-$(date +%Y%m%d).sql

# Store in S3
aws s3 cp backup-*.sql s3://intlyst-backups/daily/

# Retention: Keep 30 days of daily backups
aws s3api list-objects-v2 --bucket intlyst-backups --prefix daily/ | \
  grep Key | awk -F'"' '{print $4}' | sort | head -n -30 | \
  xargs -I {} aws s3 rm s3://intlyst-backups/{}
```

### Restore Procedure
```bash
# 1. Download backup
aws s3 cp s3://intlyst-backups/daily/backup-20260322.sql .

# 2. Restore to database
cat backup-20260322.sql | docker exec -i intlyst-db psql -U intlyst intlyst

# 3. Verify
docker exec intlyst-db psql -U intlyst -c "SELECT COUNT(*) FROM daily_metrics;"
```

## Rollback Procedure

```bash
# If new deployment has issues:

# 1. Check current version
docker ps | grep intlyst-api

# 2. Rollback to previous version
docker run -d \
  --name intlyst-api-rollback \
  -p 8000:8000 \
  --env-file .env.production \
  intlyst-api:v0.24.0

# 3. Verify new container works
curl http://localhost:8000/

# 4. Remove failed container
docker stop intlyst-api
docker rm intlyst-api

# 5. Rename rollback to primary
docker rename intlyst-api-rollback intlyst-api

# 6. Restart
docker start intlyst-api
```

## Support & Troubleshooting

### Common Issues

**Issue: 502 Bad Gateway**
```bash
# Check API container
docker logs intlyst-api | tail -50

# Check Nginx config
sudo nginx -t

# Verify container is running
docker ps | grep intlyst-api
```

**Issue: Slow API responses (>1000ms)**
```bash
# Check /api/ai/metrics
curl http://localhost:8000/api/ai/metrics | jq '.totals.avg_fallback_rate'

# If fallback rate is high, Claude API might be down
# Check Anthropic status: https://status.anthropic.com/

# Monitor database
docker exec intlyst-db psql -U intlyst -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 5;"
```

**Issue: API running out of memory**
```bash
# Check memory usage
docker stats intlyst-api

# Increase limit
docker update --memory 2g intlyst-api

# Restart
docker restart intlyst-api
```

---

**Last Updated:** 2026-03-22  
**Version:** 1.0.0  
**Maintainer:** INTLYST DevOps Team
