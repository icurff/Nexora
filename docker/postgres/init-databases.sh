#!/bin/sh
set -eu

# psql quotes values and identifiers; passwords are never printed or evaluated.
create_database() {
  psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 \
    --set db="$1_db" --set role="$1_user" --set password="$2" <<'SQL'
CREATE ROLE :"role" LOGIN PASSWORD :'password';
CREATE DATABASE :"db" OWNER :"role";
REVOKE CONNECT, TEMPORARY ON DATABASE :"db" FROM PUBLIC;
SQL
}

create_database auth "$AUTH_DB_PASSWORD"
create_database catalog "$CATALOG_DB_PASSWORD"
create_database order "$ORDER_DB_PASSWORD"
create_database payment "$PAYMENT_DB_PASSWORD"
create_database notification "$NOTIFICATION_DB_PASSWORD"
