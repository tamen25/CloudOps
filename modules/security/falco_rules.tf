resource "kubernetes_config_map" "falco_cloudops_rules" {
  metadata {
    name      = "falco-cloudops-rules"
    namespace = kubernetes_namespace.falco.metadata[0].name
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
      "app.kubernetes.io/component"  = "falco-rules"
    }
  }

  data = {
    "cloudops_rules.yaml" = <<-RULES
      # CloudOps custom Falco rules
      # These rules extend Falco's default ruleset with CloudOps-specific threat detection.

      # ── Rule 1: Shell spawned inside application or monitoring container ──────────
      # Interactive shells inside running containers indicate potential compromise
      # or unauthorized exec access. Alert on any shell in the cloudops or monitoring
      # namespace where no interactive debugging should occur in production.

      - rule: cloudops_shell_in_container
        desc: >
          A shell was spawned inside a pod running in the cloudops or monitoring namespace.
          Interactive shells inside running containers indicate potential compromise or
          unauthorized access attempts.
        condition: >
          spawned_process and
          container and
          (k8s.ns.name = "${var.application_namespace}" or k8s.ns.name = "monitoring") and
          shell_procs
        output: >
          Shell spawned in container
          (pod=%k8s.pod.name ns=%k8s.ns.name image=%container.image.repository
          user=%user.name cmd=%proc.cmdline parent=%proc.pname)
        priority: CRITICAL
        tags: [cloudops, shell, container, T1059]

      # ── Rule 2: Unexpected outbound connection from order-api ─────────────────────
      # order-api should only connect to: RDS on 5432, OTel Collector on 4318,
      # AWS VPC endpoints (Secrets Manager, ECR, etc.) on 443, and DNS on 53.
      # Any other destination is anomalous and may indicate C2 or data exfiltration.

      - rule: cloudops_unexpected_outbound
        desc: >
          The order-api pod initiated an outbound TCP connection to a destination
          other than RDS (5432), OTel Collector (4318), AWS VPC endpoints (443),
          or DNS (53). Unexpected outbound connections may indicate data exfiltration
          or command-and-control activity.
        condition: >
          outbound and
          container and
          k8s.ns.name = "${var.application_namespace}" and
          not fd.rport in (5432, 4318, 443, 53) and
          not fd.rip startswith "169.254."
        output: >
          Unexpected outbound connection from order-api
          (pod=%k8s.pod.name ns=%k8s.ns.name
          src=%fd.lip:%fd.lport dest=%fd.rip:%fd.rport
          cmd=%proc.cmdline)
        priority: HIGH
        tags: [cloudops, network, exfiltration, T1041]

      # ── Rule 3: Kubernetes service account token read at runtime ──────────────────
      # Service account tokens are mounted at /var/run/secrets/kubernetes.io/serviceaccount/.
      # Legitimate reads happen at container startup by the kubelet/SDK. Runtime reads
      # by unexpected processes are a strong indicator of credential theft.

      - rule: cloudops_secret_file_read
        desc: >
          A process read a Kubernetes service account token or other projected secret
          outside of expected init container startup. Reading these files at runtime
          may indicate credential theft attempts.
        condition: >
          open_read and
          container and
          fd.name startswith "/var/run/secrets/kubernetes.io" and
          not proc.name in (node, python3, python, java, dotnet) and
          not k8s.ns.name in (kube-system, kube-public, falco)
        output: >
          Kubernetes secret file read by unexpected process
          (pod=%k8s.pod.name ns=%k8s.ns.name
          proc=%proc.name file=%fd.name
          user=%user.name cmd=%proc.cmdline)
        priority: HIGH
        tags: [cloudops, secrets, credential-access, T1552]

      # ── Rule 4: Privilege escalation via setuid/setgid ───────────────────────────
      # Containers should run as non-root with a read-only root filesystem.
      # A successful setuid or setgid call inside a container indicates an active
      # privilege escalation exploit, likely targeting a SUID binary or kernel vuln.

      - rule: cloudops_privilege_escalation
        desc: >
          A process called setuid or setgid successfully inside a container, attempting
          to elevate its effective privileges. This is a strong indicator of a privilege
          escalation exploit in progress.
        condition: >
          evt.type in (setuid, setgid) and
          container and
          evt.res = 0 and
          not user.name = "root" and
          not proc.name in (su, sudo, newgrp, sg)
        output: >
          Privilege escalation via setuid/setgid in container
          (pod=%k8s.pod.name ns=%k8s.ns.name
          proc=%proc.name user=%user.name
          uid=%user.uid cmd=%proc.cmdline)
        priority: CRITICAL
        tags: [cloudops, privilege-escalation, T1548]

      # ── Rule 5: Crypto mining process or mining pool connection ──────────────────
      # Compromised containers are frequently repurposed for crypto mining.
      # Detect both known miner binary names at launch and outbound connections
      # to well-known stratum mining pool ports.

      - rule: cloudops_crypto_mining
        desc: >
          A known crypto mining binary was launched, or an outbound connection was made
          to a common stratum mining pool port. Crypto mining in containers indicates
          unauthorized resource abuse or active malware infection.
        condition: >
          (spawned_process and
           container and
           proc.name in (xmrig, minerd, cpuminer, ethminer, t-rex, nbminer,
                         claymore, phoenixminer, gminer, lolminer, sgminer)) or
          (outbound and
           container and
           fd.rport in (3333, 4444, 5555, 7777, 8888, 14444, 45560, 45700))
        output: >
          Crypto mining activity detected in container
          (pod=%k8s.pod.name ns=%k8s.ns.name
          proc=%proc.name cmd=%proc.cmdline
          dest=%fd.rip:%fd.rport)
        priority: CRITICAL
        tags: [cloudops, crypto-mining, malware, T1496]

      # ── Rule 6: Pod calling Kubernetes API server directly ────────────────────────
      # Application pods should never need to call the Kubernetes API directly.
      # Direct API server connections from workload namespaces indicate lateral
      # movement, cluster recon, or an attacker attempting to escalate to cluster-admin.

      - rule: cloudops_k8s_api_abuse
        desc: >
          A pod outside of kube-system initiated a direct TCP connection to the
          Kubernetes API server (kubernetes.default.svc port 443). Applications
          should interact with AWS via IRSA, not with the cluster API. Direct API
          access from workload pods may indicate lateral movement or cluster takeover.
        condition: >
          outbound and
          container and
          fd.rport = 443 and
          not k8s.ns.name in (kube-system, kube-public, kube-node-lease) and
          fd.rip.name contains "kubernetes.default"
        output: >
          Pod calling Kubernetes API server directly
          (pod=%k8s.pod.name ns=%k8s.ns.name
          dest=%fd.rip:%fd.rport cmd=%proc.cmdline
          user=%user.name)
        priority: HIGH
        tags: [cloudops, k8s-api, lateral-movement, T1613]
    RULES
  }
}
