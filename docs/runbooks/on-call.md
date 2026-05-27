# On-Call Runbook — Land2Living

**Pilot launch date:** June 2026  
**On-call coverage:** 08:00–20:00 SAST weekdays; best-effort weekends  
**Primary escalation:** WhatsApp group "L2L INCIDENT"

---

## On-call roster

| Week | Primary | Secondary |
|---|---|---|
| Launch week | Founder 1 | Founder 2 |
| Week 2+ | Rotating | TBD |

*Complete this table before launch.*

---

## Severity levels

| Level | Description | Response time | Examples |
|---|---|---|---|
| P1 | Platform down, data breach, payments stuck | 15 minutes | API returning 5xx, database unreachable, PSP webhook failure |
| P2 | Major feature broken, single tenant affected | 1 hour | Residents can't register, council secretary can't approve |
| P3 | Minor feature broken, workaround available | 4 hours | Filter not working, notification delay |
| P4 | Cosmetic issue, no functional impact | Next business day | UI misalignment, typo |

---

## First response checklist (P1)

1. **Is the API responding?**
   - `curl https://api.ndebele.land2living.co.za/api/v1/health`
   - If not: check ECS service health in AWS console (af-south-1)

2. **Is the database reachable?**
   - Check RDS instance status in AWS console
   - Check CloudWatch for `DatabaseConnections` metric spike

3. **Is Redis reachable?**
   - Check ElastiCache instance in AWS console
   - If Redis is down: API will still work but BullMQ jobs will not run (notifications, supplier dispatch paused)

4. **Check recent deployments**
   - `git log --oneline -5` on main — was there a recent deploy?
   - If yes: consider rolling back via ECS task definition

5. **Check error volume**
   - Sentry dashboard for error spike
   - CloudWatch `5xx` metric for ALB

---

## Rollback procedure

```bash
# List recent ECS task definitions
aws ecs list-task-definitions --family-prefix l2l-api --sort DESC --max-items 5

# Roll back to previous task definition
aws ecs update-service \
  --cluster l2l-prod \
  --service l2l-api \
  --task-definition l2l-api:<PREVIOUS_REVISION>
```

---

## Database emergency access

In an emergency requiring direct database access:

1. Connect to the VPN
2. Use the read-only RDS replica first (never write directly to production DB except under explicit instructions)
3. All manual SQL runs must be logged in `docs/incidents/`

Connection string is in AWS Secrets Manager: `l2l/prod/database-url-admin`

---

## Escalation contacts

| Contact | Role | WhatsApp | When to use |
|---|---|---|---|
| TBD | Founder 1 | | Any P1/P2 |
| TBD | Founder 2 | | P1 backup |
| TBD | AWS support | | Infra P1 |
| TBD | Legal counsel | | Data breach |
| King's office liaison | TBD | | Council-facing P1 |

*Complete this table before launch.*

---

## Post-incident

After every P1 or P2:
1. Write an incident report in `docs/incidents/YYYY-MM-DD-<slug>.md`
2. Root cause and fix
3. Update monitoring alerts if the incident revealed a gap
4. Brief the council secretary on impact and resolution

---

## Useful AWS CLI snippets

```bash
# Check ECS service status
aws ecs describe-services --cluster l2l-prod --services l2l-api

# Force new deployment
aws ecs update-service --cluster l2l-prod --service l2l-api --force-new-deployment

# Tail CloudWatch logs
aws logs tail /ecs/l2l-api --follow

# RDS status
aws rds describe-db-instances --db-instance-identifier l2l-prod-db
```
