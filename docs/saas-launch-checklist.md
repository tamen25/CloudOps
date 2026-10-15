# SaaS Launch Checklist

Closes backlog #43. Starter checklist for the legal / privacy / tax / compliance
work that must be reviewed and signed off **before** the platform takes
revenue. Not legal advice. Confirm every item with qualified counsel and
accounting for your target market before launch.

## Legal documents

- [ ] **Terms of Service** — limits of liability, warranty disclaimer,
      acceptable use, account termination, governing law, dispute resolution.
- [ ] **Privacy Policy** — what is collected, why, who it is shared with,
      retention, user rights (access / delete / export), contact for
      privacy requests, cookie policy.
- [ ] **Data Processing Agreement (DPA)** — required when processing
      personal data on behalf of customers (B2B SaaS). Include sub-processor
      list and SCCs/UK addendum for international transfers.
- [ ] **Master Service Agreement (MSA)** — for direct enterprise contracts.
- [ ] **Incident Response policy** — published RTO/RPO, breach
      notification timelines aligned with GDPR (72 h) and US state laws.
- [ ] **Security whitepaper or trust page** — encryption (in transit + at
      rest), access controls, audit logging, sub-processors.

## Privacy / data protection

- [ ] **GDPR applicability** — if any EU/EEA/UK data subjects, appoint
      Data Protection Officer if scale requires, document lawful basis,
      DPIA for high-risk processing, ensure right to erasure works
      end-to-end (DB + backups + logs + analytics).
- [ ] **CCPA / CPRA applicability** — if any California residents, publish
      "Do Not Sell or Share" link, honor opt-outs, post privacy notice at
      collection.
- [ ] **HIPAA exclusion** — confirm in writing that the platform is NOT a
      Business Associate. If even one customer wants to upload PHI, you
      need a BAA, BAA-compatible architecture, and a HIPAA security
      assessment before accepting that customer.
- [ ] **COPPA exclusion** — confirm no users under 13, or implement
      parental consent flow.
- [ ] **PCI-DSS scope** — if you ever handle card numbers, even briefly,
      you are in scope. Outsource card capture to Stripe/Adyen/etc. and
      keep PAN out of your stack so you stay at SAQ-A.
- [ ] **Data residency** — document where customer data is stored. If you
      promise EU data residency, the platform must be deployable to an EU
      region and the DPA must reflect that. Default backups must not
      cross-region into the US.
- [ ] **Sub-processor list** — public, dated, with notification commitment
      for additions.

## Money / tax

- [ ] **Sales tax / VAT registration** — economic-nexus thresholds vary by
      US state and EU country. Confirm with accountant before invoicing.
- [ ] **Money Services Business (MSB) exclusion** — confirm in writing
      that the platform is NOT transferring/storing customer funds. If
      payouts/escrow features are added later, MSB and state money-
      transmitter licensing apply.
- [ ] **Refund policy** — published, aligned with EU consumer-rights
      directive (14-day right of withdrawal for individuals).
- [ ] **Pricing page** — currency, tax inclusion/exclusion, billing
      frequency, auto-renewal disclosure (US state laws require explicit
      cancellation paths).

## Identity / authentication

- [ ] **Real authentication shipped (#7)** — replace shared API key with
      OIDC/JWKS validation, scopes/roles, brute-force protection.
- [ ] **Multi-tenant data isolation (#8)** — `tenant_id` + RLS or
      equivalent before onboarding any second customer.
- [ ] **MFA available** for admin accounts; required for billing/tenant
      admin actions.
- [ ] **Session management** — idle timeout, single-session-per-tenant
      option, revocable refresh tokens.
- [ ] **Audit log** — admin actions, security-relevant events, retained
      per the longest applicable regulation.

## Operations

- [ ] **Status page** — public, with subscriber notifications.
- [ ] **Incident-response runbook** — escalation, customer comms templates,
      breach-notification template per regulation.
- [ ] **Backup + restore drill** — last successful drill date documented.
- [ ] **Disaster-recovery plan** — RTO/RPO matched to what is published in
      the SLA.
- [ ] **Vendor list** — every sub-processor with SOC 2 / ISO 27001 / GDPR
      compliance evidence on file.
- [ ] **Insurance** — cyber liability, professional indemnity (E&O),
      sized to contracts.

## Compliance posture (roadmap, not gating launch)

- [ ] **SOC 2 Type 1 readiness assessment** — typical 4–6 weeks. Required
      by mid-market enterprise customers.
- [ ] **SOC 2 Type 2** — 6–12 month observation window after Type 1.
- [ ] **ISO 27001** — if EU enterprise customers ask. 9–18 month effort.
- [ ] **HIPAA, PCI-DSS, FedRAMP** — only when a specific customer
      requires; each is multi-month and expensive.

## Sign-off log

| Item | Owner | Reviewed by | Date | Notes |
|------|-------|-------------|------|-------|
| Terms of Service | | | | |
| Privacy Policy | | | | |
| DPA | | | | |
| GDPR DPIA | | | | |
| Sales tax registration | | | | |
| Real auth (#7) | | | | |
| Multi-tenant isolation (#8) | | | | |
| Backup drill | | | | |
| Cyber insurance | | | | |
