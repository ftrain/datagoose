import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../index';

export const statsRouter = Router();

/**
 * GET /api/stats/summary
 * Get overall database summary statistics
 */
statsRouter.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_plants,
        SUM(capacity_mw) as total_capacity_mw,
        COUNT(DISTINCT country_code) as total_countries,
        COUNT(DISTINCT primary_fuel) as fuel_types,
        AVG(capacity_mw) as avg_capacity_mw,
        MAX(capacity_mw) as max_capacity_mw,
        MIN(commissioning_year) as oldest_plant_year,
        MAX(commissioning_year) as newest_plant_year
      FROM power_plants
    `);

    const stats = result.rows[0];
    res.json({
      totalPlants: parseInt(stats.total_plants, 10),
      totalCapacityMw: parseFloat(stats.total_capacity_mw),
      totalCapacityGw: parseFloat(stats.total_capacity_mw) / 1000,
      totalCountries: parseInt(stats.total_countries, 10),
      fuelTypes: parseInt(stats.fuel_types, 10),
      avgCapacityMw: parseFloat(stats.avg_capacity_mw),
      maxCapacityMw: parseFloat(stats.max_capacity_mw),
      oldestPlantYear: stats.oldest_plant_year,
      newestPlantYear: stats.newest_plant_year,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/by-country
 * Get statistics aggregated by country
 */
statsRouter.get('/by-country', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);

    const result = await pool.query(`
      SELECT
        country_code,
        country,
        COUNT(*) as plant_count,
        SUM(capacity_mw) as total_capacity_mw,
        AVG(capacity_mw) as avg_capacity_mw,
        COUNT(DISTINCT primary_fuel) as fuel_diversity
      FROM power_plants
      GROUP BY country_code, country
      ORDER BY total_capacity_mw DESC
      LIMIT $1
    `, [limit]);

    res.json({
      data: result.rows.map(row => ({
        countryCode: row.country_code,
        country: row.country,
        plantCount: parseInt(row.plant_count, 10),
        totalCapacityMw: parseFloat(row.total_capacity_mw),
        totalCapacityGw: parseFloat(row.total_capacity_mw) / 1000,
        avgCapacityMw: parseFloat(row.avg_capacity_mw),
        fuelDiversity: parseInt(row.fuel_diversity, 10),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/by-fuel
 * Get statistics aggregated by fuel type
 */
statsRouter.get('/by-fuel', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`
      SELECT
        primary_fuel,
        COUNT(*) as plant_count,
        SUM(capacity_mw) as total_capacity_mw,
        AVG(capacity_mw) as avg_capacity_mw,
        COUNT(DISTINCT country_code) as country_count
      FROM power_plants
      GROUP BY primary_fuel
      ORDER BY total_capacity_mw DESC
    `);

    const totalCapacity = result.rows.reduce(
      (sum, row) => sum + parseFloat(row.total_capacity_mw),
      0
    );

    res.json({
      data: result.rows.map(row => ({
        fuel: row.primary_fuel,
        plantCount: parseInt(row.plant_count, 10),
        totalCapacityMw: parseFloat(row.total_capacity_mw),
        totalCapacityGw: parseFloat(row.total_capacity_mw) / 1000,
        percentageOfTotal: (parseFloat(row.total_capacity_mw) / totalCapacity * 100).toFixed(2),
        avgCapacityMw: parseFloat(row.avg_capacity_mw),
        countryCount: parseInt(row.country_count, 10),
      })),
      totalCapacityMw: totalCapacity,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/generation-trends
 * Get generation trends over years
 */
statsRouter.get('/generation-trends', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`
      SELECT
        year,
        COUNT(*) as plants_with_data,
        SUM(COALESCE(generation_gwh, estimated_generation_gwh)) as total_generation_gwh
      FROM power_plant_generation
      GROUP BY year
      ORDER BY year
    `);

    res.json({
      data: result.rows.map(row => ({
        year: row.year,
        plantsWithData: parseInt(row.plants_with_data, 10),
        totalGenerationGwh: parseFloat(row.total_generation_gwh) || 0,
        totalGenerationTwh: (parseFloat(row.total_generation_gwh) || 0) / 1000,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/top-plants
 * Get the largest power plants
 */
statsRouter.get('/top-plants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const fuel = req.query.fuel as string;

    let query = `
      SELECT
        id, name, country, country_code,
        capacity_mw, primary_fuel, commissioning_year
      FROM power_plants
    `;

    const params: any[] = [];
    if (fuel) {
      query += ` WHERE primary_fuel = $1`;
      params.push(fuel);
    }

    query += ` ORDER BY capacity_mw DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});
