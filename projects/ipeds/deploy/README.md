# IPEDS Explorer - Fly.io Deployment

This guide covers deploying the IPEDS Explorer to Fly.io with an embedded PostgreSQL database.

## Prerequisites

1. Install the Fly CLI: `brew install flyctl`
2. Login to Fly: `fly auth login`
3. Have Docker running locally

## Deployment Steps

### Step 1: Trim the Database

Run the trimming script to reduce database size from ~44GB to ~8-10GB:

```bash
# From the ipeds directory
docker exec -i datagoose-ipeds-postgres-1 psql -U postgres -d datagoose < scripts/trim_for_deploy.sql
```

This removes:
- Raw staging tables (~4.6GB)
- Redundant `gender='total'` rows from completions (~11GB)

You keep:
- All race breakdowns
- Gender breakdowns (men/women) - totals can be computed via SUM()
- All years of data

### Step 2: Export the Database

```bash
# Create a compressed dump
docker exec datagoose-ipeds-postgres-1 pg_dump -U postgres -Fc -Z9 datagoose > ipeds_trimmed.dump

# Check size (should be ~2-4GB compressed)
ls -lh ipeds_trimmed.dump
```

### Step 3: Create the Fly App

```bash
cd /path/to/ipeds
fly apps create ipeds-explorer
```

### Step 4: Create a Volume

```bash
# Create a 20GB volume for the database
fly volumes create ipeds_data --size 20 --region iad
```

### Step 5: Deploy the App

```bash
fly deploy
```

### Step 6: Load the Database

After the first deploy, you need to load the database dump:

```bash
# SSH into the machine
fly ssh console

# Inside the machine, restore the database
cd /app
pg_restore -U postgres -d datagoose -c /path/to/ipeds_trimmed.dump
```

Alternatively, use `fly sftp` to upload the dump first:

```bash
# Upload the dump
fly sftp shell
put ipeds_trimmed.dump /data/ipeds_trimmed.dump

# Then SSH and restore
fly ssh console
pg_restore -U postgres -d datagoose -c /data/ipeds_trimmed.dump
rm /data/ipeds_trimmed.dump
```

## Configuration

### Environment Variables

Set these in fly.toml or via `fly secrets`:

```bash
# If using AI features
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### Scaling

The default configuration uses:
- 4 shared CPUs
- 8GB RAM
- 20GB volume

To scale:

```bash
# More memory
fly scale memory 16384

# Dedicated CPU
fly scale vm dedicated-cpu-4x
```

## Costs

Estimated monthly cost:
- Machine (shared-cpu-2x, 4GB): ~$12/mo
- Volume (15GB): ~$2.25/mo
- **Total**: ~$15/mo

## Troubleshooting

### Check logs
```bash
fly logs
```

### SSH into machine
```bash
fly ssh console
```

### Check PostgreSQL
```bash
fly ssh console -C "psql -U postgres -d datagoose -c 'SELECT COUNT(*) FROM institution'"
```

### Restart
```bash
fly apps restart ipeds-explorer
```

## Updates

To deploy updates:

```bash
fly deploy
```

Note: Database data persists on the volume across deploys.
