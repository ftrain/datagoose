FROM postgres:16-alpine

LABEL maintainer="datagoose-team"
LABEL description="PostgreSQL with extensions for data migration"

# Copy initialization scripts
COPY init/ /docker-entrypoint-initdb.d/

EXPOSE 5432
