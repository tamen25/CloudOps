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
    plan|apply)
      terraform -chdir="$stack_dir" "$command" -var-file="$TFVARS_FILE" "$@"
      ;;
  esac

  echo "::endgroup::"
done
