# I04: what adopting the existing bootstrap would change — 2026-11-05

BACKLOG I04 is to take the dev account's bootstrap resources (left by the
retired root states, ADR 028's correction) into the foundation stack. Before
doing it, a plan with `import` blocks for all eleven was run against the
account (read-only: nothing was written to state or to AWS). This records
what an apply would change, so the decision is made on the diff.

Plan: `11 to import, 24 to add, 8 to change, 0 to destroy` (with
`enable_bootstrap = true` and the run's other variables). The 24 adds are
the stack's other always-on resources on an empty state (the hosted zone,
the ECR repositories) plus the permissions-boundary policy, which no old
state created.

## Imported unchanged

The KMS alias, the ECR pull-through cache rule and the state bucket's
encryption configuration.

## Changed, harmless

- **GitHub OIDC provider:** tags only.
- **State KMS key:** tags, plus two arguments Terraform records on import
  (`deletion_window_in_days = 30`, `bypass_policy_lockout_safety_check =
  false`); the key and its policy are unchanged.

## Changed, needs a decision

**`cloudops-deployer` trust policy** gains
`Bool aws:MultiFactorAuthPresent = true`: the plan used the default
`bootstrap_require_mfa`. With the repo's `terraform.tfvars`
(`bootstrap_require_mfa = false`) it would not; whoever assumes the role
must use MFA if it does.

**`cloudops-github-actions-infrastructure` and
`cloudops-deployer-infrastructure`** (the same document for both). Today
one statement grants service wildcards, including `iam:*`, on every
resource. After:

| Statement | Grants | On |
|---|---|---|
| InfrastructureDeployment | 33 service wildcards | `*` |
| IAMProjectResources | `iam:*` | `role/cloudops-*`, `policy/cloudops-*`, `oidc-provider/*`, `instance-profile/cloudops-*` |
| IAMRead | `iam:Get*`, `iam:List*` | `*` |
| IAMServiceLinkedRoles | create, delete, deletion status | `role/aws-service-role/*` |
| S3ProjectBuckets | `s3:*` | `cloudops-*` buckets and objects |
| S3Account | account public-access block, list buckets | `*` |
| S3ServerlessRepoChangeSets | `s3:GetObject` | `awsserverlessrepo-changesets*` |

InfrastructureDeployment gains apigateway, backup, backup-storage, budgets,
cloudformation, cloudtrail, cognito-idp, config, dynamodb, eks, events,
guardduty, kinesis, kms, lambda, securityhub, serverlessrepo, sns, sqs,
states and wafv2, and loses autoscaling, ecs, iam (moved to the scoped
statement) and vpc. So IAM and S3 become narrower, and the role can manage
more services than it can today; notably `eks:*`, which the live policy
does not grant.

## Not known from the plan

Three documents are built by data sources the plan defers to apply ("will
be read during apply"), so their new text is unknown here and the plan
shows them only as changing:

- `cloudops-github-actions`'s trust policy (which repositories and refs may
  assume it; today pull requests, `feature/*` and `main` of
  tamen25/CloudOps);
- `cloudops-github-actions-permissions` (ECR push, EKS read, state access);
- `cloudops-deployer-state-access`.

Rendering them, for example with `terraform console` on the data sources
after the import, is the next step before an apply.

## Risks of applying

- CI's role changes in one apply. If its new trust policy or permissions are
  wrong, every AWS job fails until the next apply, which then needs an
  operator's credentials, since CI cannot fix its own role.
- The foundation's destroy would then delete the role CI uses and the key
  the old states are encrypted with; the Destroy workflow would need
  `enable_bootstrap = false` again, or a split of bootstrap into its own
  stack, before the next teardown.

## Suggested order

1. Render the three deferred documents and compare them with the live ones.
2. Set `bootstrap_require_mfa` deliberately.
3. Apply the import with S01's scoped deployer policy in mind (S01 and I04
   change the same roles).
4. Then delete the two root states, and the March KMS key that encrypts old
   versions of one of them.
