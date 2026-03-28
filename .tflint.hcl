plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# Child modules do not need to redeclare provider version constraints —
# the root module is the only consumer and it manages all provider pins
# in its own required_providers block.
rule "terraform_required_providers" {
  enabled = false
}
