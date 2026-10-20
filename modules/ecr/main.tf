# ECR repositories for the images CloudOps builds: order-api, the mesh
# services and loadgen, the storefront. Created in the foundation stack, so
# they exist before the cluster pulls from them. Tags are immutable (a tag
# names one build), every push is scanned, and old untagged images expire.
#
# force_delete: images are build output, rebuilt from git, and a repository
# holding images would otherwise stop the Destroy workflow.

resource "aws_ecr_repository" "this" {
  for_each = toset(var.repositories)

  name                 = "${var.name_prefix}/${each.value}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = var.kms_key_arn == null ? "AES256" : "KMS"
    kms_key         = var.kms_key_arn
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after a day"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 1 }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the newest ${var.keep_images} images"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = var.keep_images }
        action       = { type = "expire" }
      },
    ]
  })
}
