FROM pgvector/pgvector:pg16

LABEL maintainer="datagoose-team"
LABEL description="PostgreSQL with pgvector, PostGIS, full-text search, and extensions for data migration"

# Install PostGIS and other extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-16-postgis-3 \
    postgresql-16-postgis-3-scripts \
    postgresql-16-similarity \
    && rm -rf /var/lib/apt/lists/*

# Copy initialization scripts
COPY init/ /docker-entrypoint-initdb.d/

EXPOSE 5432
