variable "database_url" {
  type    = string
  default = getenv("MIGRATION_DATABASE_URL")
}

env "local" {
  src = "file://migrations/schema.sql"
  dev = "docker://postgres/16/dev"
  url = var.database_url

  diff {
    skip {
      drop_schema = true
      drop_table  = true
      # db-migrate runs with --auto-approve on an unattended deploy. Never let an
      # accidental column removal in schema.sql silently drop production data — an
      # intentional column drop must be done as a deliberate manual apply without this.
      drop_column = true
    }
  }
}
