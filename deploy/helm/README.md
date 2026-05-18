# ensemble Helm chart

Self-hosted Kubernetes deployment for ensemble.

## Install

```bash
# Bring-your-own DB + Redis (production)
helm install ensemble ./deploy/helm \
  --set postgres.url='postgres://USER:PASS@HOST:5432/ensemble' \
  --set redis.url='redis://HOST:6379' \
  --set ingress.host=ensemble.example.com \
  --set ingress.tls.enabled=true \
  --set ingress.tls.secretName=ensemble-tls

# Ephemeral test cluster (embedded postgres + redis)
helm install ensemble ./deploy/helm \
  --set postgres.embedded=true \
  --set redis.embedded=true
```

## What's deployed

- `Deployment ensemble-server` (replicas: 2 by default)
- `Deployment ensemble-web` (replicas: 2)
- `Service` for both (ClusterIP)
- `Ingress` (default class: nginx) routing `/api` + `/healthz` → server, rest → web
- `Secret` holding `databaseUrl` + `redisUrl`

## Probes

Liveness + readiness both hit `/healthz`. Initial delay 5s / 30s respectively.

## WebSocket support

Ingress annotations set `proxy-read-timeout` + `proxy-send-timeout` to 3600s
for `/api/v1/ws/*` long-lived connections.

## NOT included

- Postgres backup CronJob (use external + `pg_dump` cron in your cluster)
- Cert-manager TLS issuance (provide your own ClusterIssuer)
- HorizontalPodAutoscaler (add per workload pattern)
