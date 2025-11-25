# IPEDS Analysis Queries

Saved SQL queries for analyzing IPEDS higher education data.

## Usage

Run any query with:
```bash
docker exec -i datagoose-ipeds-postgres-1 psql -U postgres -d datagoose < queries/<category>/<filename>.sql
```

Or connect interactively and use `\i`:
```bash
docker exec -it datagoose-ipeds-postgres-1 psql -U postgres -d datagoose
\i queries/vector/similar_institutions.sql
```

## Query Categories

### Standard Analysis
- `admissions/` - Selectivity, test scores, yield rates, Ivy League trends
- `graduation/` - Graduation rates, equity gaps, Pell outcomes, HBCU rankings
- `enrollment/` - Trends, demographics, by state, public vs private
- `completions/` - Degrees by field, CS growth trends, gender gaps
- `financial/` - Net price by income, Pell rates, best value institutions
- `institutions/` - Profiles, search, summary statistics

### Advanced Search (PostgreSQL Extensions)

#### Geospatial (`geo/`) - PostGIS
Find institutions by location using spatial queries.
```sql
-- Example: Schools within 25 miles of Boston
SELECT name, city, state,
    ROUND((ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)::geography) / 1609.34)::numeric, 1) as miles
FROM institution
WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)::geography, 25 * 1609.34);
```

- `nearby_institutions.sql` - Find schools within X miles of a point
- `institutions_in_radius.sql` - All schools in radius with details
- `nearest_hbcu.sql` - Find closest HBCU to a location
- `state_bounding_box.sql` - Schools within state boundaries
- `density_by_region.sql` - Institution density analysis

#### Fuzzy Text Search (`search/`) - pg_trgm
Find institutions with misspelled or partial names.
```sql
-- Example: Find "Stanford" even when spelled wrong
SELECT name, similarity(name, 'standford') as score
FROM institution
WHERE name % 'standford'
ORDER BY score DESC;
```

- `fuzzy_name_search.sql` - Tolerant name matching
- `autocomplete.sql` - Type-ahead suggestions
- `similar_names.sql` - Find institutions with similar names
- `keyword_in_name.sql` - Search for keywords in names

#### Vector Similarity (`vector/`) - pgvector
Find similar institutions using ML-style embeddings.
```sql
-- Example: Schools similar to MIT
SELECT name, 1 - (feature_vector <=> target.feature_vector) as similarity
FROM institution, (SELECT feature_vector FROM institution WHERE unitid = 166683) target
WHERE feature_vector IS NOT NULL
ORDER BY feature_vector <=> target.feature_vector
LIMIT 10;
```

- `similar_institutions.sql` - Find schools most like a given school
- `find_by_profile.sql` - Search by custom profile vector
- `cluster_peers.sql` - Find natural peer groups for benchmarking
- `affordable_alternatives.sql` - Similar but cheaper schools

## Feature Vector Dimensions

The 10-dimensional feature vector on `institution.feature_vector`:
| Index | Feature | Range | Description |
|-------|---------|-------|-------------|
| 0 | admit_rate | 0-1 | Admission rate |
| 1 | grad_rate | 0-1 | 6-year graduation rate |
| 2 | size | 0-1 | Normalized enrollment |
| 3 | pell_pct | 0-1 | Pell grant recipient % |
| 4 | affordability | 0-1 | Inverted net price (higher=cheaper) |
| 5 | sat | 0-1 | Normalized SAT scores |
| 6 | public | 0/1 | Public institution |
| 7 | 4year | 0/1 | 4-year institution |
| 8 | hbcu | 0/1 | Historically Black college |
| 9 | research_proxy | 0-1 | Research activity level |

## Data Years Available

Check current coverage:
```sql
SELECT 'admissions' as tbl, array_agg(DISTINCT year ORDER BY year) FROM admissions
UNION ALL SELECT 'graduation_rates', array_agg(DISTINCT year ORDER BY year) FROM graduation_rates
UNION ALL SELECT 'enrollment', array_agg(DISTINCT year ORDER BY year) FROM enrollment
UNION ALL SELECT 'completions', array_agg(DISTINCT year ORDER BY year) FROM completions
UNION ALL SELECT 'financial_aid', array_agg(DISTINCT year ORDER BY year) FROM financial_aid;
```

## Adding New Queries

1. Create SQL file in appropriate category directory
2. Add descriptive comment header
3. Use parameterized examples (e.g., specific unitid) that can be modified
4. Include relevant JOINs to show useful context
