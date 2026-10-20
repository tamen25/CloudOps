#!/usr/bin/env bash
set -euo pipefail

command="${1:-}"
if [ -z "$command" ]; then
  echo "Usage: scripts/terraform-stacks.sh <plan|apply|validate|init> [terraform args...]" >&2
  exit 1
fi
shift || true

case "$command" in
  plan|apply|validate|init) ;;
  *)
    echo "Error: unsupported Terraform stack command '$command'." >&2
    exit 1
    ;;
esac

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
TFVARS_FILE="${TFVARS_FILE:-$REPO_ROOT/terraform.tfvars}"
STACKS="${STACKS:-foundation cluster platform}"

if [ ! -f "$TFVARS_FILE" ]; then
  echo "Error: $TFVARS_FILE not found." >&2
  exit 1
fi

#When TF_PLAN_DETAILED_EXITCODE=1 is set, `plan` propagates terraform's
#-detailed-exitcode semantics: 0 = no changes, 1 = error, 2 = drift/changes
#present. Drift across any stack becomes the final exit code 2 so callers
#can surface it as a warning (closes backlog #120). Without the flag,
#legacy behavior stays — plan returns 0 even with drift.
drift_seen=0

for stack in $STACKS; do
  stack_dir="$REPO_ROOT/stacks/$stack"
  if [ ! -d "$stack_dir" ]; then
    echo "Error: stack '$stack' not found at $stack_dir." >&2
    exit 1
  fi

  echo "::group::terraform $command ($stack)"
  STACK="$stack" TFVARS_FILE="$TFVARS_FILE" "$SCRIPT_DIR/tf-init.sh"

  case "$command" in
    init)
      ;;
    validate)
      terraform -chdir="$stack_dir" validate "$@"
      ;;
    plan)
      if [ "${TF_PLAN_DETAILED_EXITCODE:-0}" = "1" ]; then
        set +e
        terraform -chdir="$stack_dir" plan -detailed-exitcode -var-file="$TFVARS_FILE" "$@"
        rc=$?
        set -e
        case "$rc" in
          0)
            ;;
          2)
            echo "::notice::drift/changes detected in stack '$stack'"
            drift_seen=1
            ;;
          *)
            exit "$rc"
            ;;
        esac
      else
        terraform -chdir="$stack_dir" plan -var-file="$TFVARS_FILE" "$@"
      fi
      ;;
    apply)
      terraform -chdir="$stack_dir" apply -var-file="$TFVARS_FILE" "$@"
      ;;
  esac

  echo "::endgroup::"
done

if [ "${TF_PLAN_DETAILED_EXITCODE:-0}" = "1" ] && [ "$drift_seen" = "1" ]; then
  exit 2
fi
