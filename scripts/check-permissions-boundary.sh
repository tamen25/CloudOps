#!/usr/bin/env bash
# Every IAM role the platform creates must take the permissions boundary
# (modules/bootstrap/permissions_boundary.tf), or switching the boundary on
# leaves that role uncapped and the deployer can no longer change it. Fails,
# naming the role, when an aws_iam_role outside modules/bootstrap has no
# permissions_boundary argument. The two bootstrap roles are exempt: an
# administrator applies them.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC2016 # the single-quoted text is an awk program
missing=$(git ls-files 'modules/**/*.tf' ':!modules/bootstrap/**' | xargs awk '
  /^resource "aws_iam_role" "/ { role = FILENAME ": " $3; has = 0; next }
  role && /^  permissions_boundary *=/ { has = 1 }
  role && /^}/ { if (!has) print role; role = "" }
')

if [ -n "$missing" ]; then
  echo "IAM roles without permissions_boundary = var.permissions_boundary_arn:"
  echo "$missing" | tr -d '"' | sed 's/^/  /'
  exit 1
fi

# The variable defaults to null, so a module call that does not pass it
# creates its roles without the boundary. Every call of a module that has a
# permissions_boundary_arn variable must pass it.
with_var=$(grep -l '^variable "permissions_boundary_arn"' modules/*/variables.tf | cut -d/ -f2 | sort -u)
# shellcheck disable=SC2016 # the single-quoted text is an awk program
unpassed=$(awk -v mods="$(echo "$with_var" | tr '\n' ' ')" '
  BEGIN { n = split(mods, m, " "); for (i = 1; i <= n; i++) want[m[i]] = 1 }
  /^module "/ { call = FILENAME ": module " $2; mod = ""; has = 0; next }
  call && /^  source *= *"[.\/]*modules\// { s = $0; sub(/.*modules\//, "", s); sub(/".*/, "", s); mod = s }
  call && /^  permissions_boundary_arn *=/ { has = 1 }
  call && /^}/ { if (want[mod] && !has) print call; call = "" }
' stacks/*/main.tf)

if [ -n "$unpassed" ]; then
  echo "Module calls that do not pass permissions_boundary_arn:"
  echo "$unpassed" | tr -d '"' | sed 's/^/  /'
  exit 1
fi
echo "Every workload IAM role takes the permissions boundary, and every module call passes it."
