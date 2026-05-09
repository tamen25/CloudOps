#This file defines password settings for CloudOps.
#Generate a random secure password for the RDS master user
resource "random_password" "master_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}
