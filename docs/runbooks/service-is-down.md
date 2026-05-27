# Runbook: Service Is Down

**Trigger:** Better Stack alert — `/api/v1/health` returning non-200, or no response for > 2 minutes.

---

## 1. Immediate triage (< 5 min)

### Check health endpoint directly
```bash
curl https://<api-host>/api/v1/health
# Expected: {"status":"ok","checks":{"db":true,"redis":true,"s3":true}}
# Degraded example: {"status":"degraded","checks":{"db":true,"redis":false,"s3":true}}
```

### Check ECS task status
```bash
aws ecs describe-services \
  --cluster <cluster-name> \
  --services <service-name> \
  --region af-south-1 \
  --query 'services[0].{running:runningCount,desired:desiredCount,deployments:deployments}'
```

### Check recent CloudWatch logs
```bash
aws logs tail /l2l/api/production --since 15m --region af-south-1
```

---

## 2. Diagnose by symptom

### `db: false` — database unreachable
1. Check RDS instance status in AWS Console → RDS → Databases.
2. Check security group rules — ECS tasks need TCP 5432 inbound from the VPC.
3. Check `DATABASE_URL` secret in AWS Secrets Manager is correct.
4. If RDS is down: use manual fallback (see below) and open an AWS support ticket.

### `redis: false` — Redis unreachable
1. Check ElastiCache cluster status in AWS Console → ElastiCache.
2. BullMQ job processing will be suspended; quote dispatch and notifications queue up.
3. The API itself continues serving (Redis is not on the critical path for reads/writes).
4. Restart ElastiCache node if status is `impaired`.

### `s3: false` — S3 unreachable
1. Check AWS S3 service health at https://health.aws.amazon.com/
2. Document upload and PTO generation will fail; all other API operations continue.
3. If prolonged, switch `S3_ENDPOINT` to Backblaze B2 (backup bucket maintained in `us-east-005`).

### ECS task keeps crashing (exit code non-zero)
1. Fetch stopped task reason:
   ```bash
   aws ecs describe-tasks --cluster <cluster> --tasks <task-arn> \
     --query 'tasks[0].containers[0].reason'
   ```
2. Check if a required environment variable is missing (common cause: new env var not added to task definition).
3. Roll back to previous image tag via the production deploy workflow (`workflow_dispatch` with the last known good SHA).

---

## 3. Manual fallback

If the system is unavailable for > 30 minutes, council operations continue on paper:

| Workflow | Paper fallback | Back-entry deadline |
|---|---|---|
| Resident registration | Form L2L-RR-01 (in `docs/templates/`) | 48 hours after recovery |
| Land application | Form L2L-LA-01 | 48 hours after recovery |
| PTO issuance | Signed paper PTO with council stamp | Back-enter as `manual_pto` flag |
| Resale listing | Form L2L-RS-01 | 48 hours after recovery |

All paper records must be photographed and stored in the council's designated Google Drive folder during the outage. Foot soldiers are briefed on this procedure during onboarding.

---

## 4. Recovery steps

1. Confirm health endpoint returns `{"status":"ok"}`.
2. Back-enter any paper records created during the outage (see forms above).
3. Verify audit log has no unexplained gaps via `/api/v1/audit-events`.
4. Post an incident summary to the founders Slack channel within 24 hours.

---

## 5. Escalation

| Time down | Action |
|---|---|
| < 15 min | On-call engineer investigates. |
| 15–60 min | Notify council secretary via WhatsApp: "System is temporarily unavailable. Use paper fallback. We are working on it." |
| > 60 min | Founders notified. Consider rollback to previous stable release. |
| > 4 hours | AWS Support case opened (Business tier). Manual fallback formalised for the session. |

**On-call contact:** See PagerDuty schedule at https://l2l.pagerduty.com
