import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../index';

export const powerPlantsRouter = Router();

// Query validation schema
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  country: z.string().length(3).optional(),
  fuel: z.string().optional(),
  minCapacity: z.coerce.number().positive().optional(),
  maxCapacity: z.coerce.number().positive().optional(),
  search: z.string().optional(),
});

/**
 * GET /api/power-plants
 * List power plants with pagination and filtering
 */
powerPlantsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const { page, limit, country, fuel, minCapacity, maxCapacity, search } = query;
    const offset = (page - 1) * limit;

    // Build WHERE clauses
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (country) {
      conditions.push(`country_code = $${paramIndex++}`);
      params.push(country.toUpperCase());
    }

    if (fuel) {
      conditions.push(`primary_fuel = $${paramIndex++}`);
      params.push(fuel);
    }

    if (minCapacity) {
      conditions.push(`capacity_mw >= $${paramIndex++}`);
      params.push(minCapacity);
    }

    if (maxCapacity) {
      conditions.push(`capacity_mw <= $${paramIndex++}`);
      params.push(maxCapacity);
    }

    if (search) {
      conditions.push(`name ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM power_plants ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const dataResult = await pool.query(
      `SELECT
        id, gppd_idnr, name, country_code, country,
        capacity_mw, latitude, longitude, primary_fuel,
        commissioning_year, owner
       FROM power_plants
       ${whereClause}
       ORDER BY capacity_mw DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/power-plants/:id
 * Get a single power plant with generation data
 */
powerPlantsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ message: 'Invalid ID' });
      return;
    }

    // Get power plant
    const plantResult = await pool.query(
      `SELECT * FROM power_plants WHERE id = $1`,
      [id]
    );

    if (plantResult.rows.length === 0) {
      res.status(404).json({ message: 'Power plant not found' });
      return;
    }

    // Get generation data
    const genResult = await pool.query(
      `SELECT year, generation_gwh, estimated_generation_gwh, estimation_method
       FROM power_plant_generation
       WHERE power_plant_id = $1
       ORDER BY year`,
      [id]
    );

    res.json({
      ...plantResult.rows[0],
      generation: genResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/power-plants/nearby
 * Find power plants near a location
 */
powerPlantsRouter.get('/nearby/:lat/:lng', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lat = parseFloat(req.params.lat);
    const lng = parseFloat(req.params.lng);
    const radius = parseFloat(req.query.radius as string) || 100; // km
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ message: 'Invalid coordinates' });
      return;
    }

    // Haversine distance calculation (approximate for small distances)
    const result = await pool.query(
      `SELECT
        id, gppd_idnr, name, country_code, country,
        capacity_mw, latitude, longitude, primary_fuel,
        (6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) AS distance_km
       FROM power_plants
       WHERE (6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) < $3
       ORDER BY distance_km
       LIMIT $4`,
      [lat, lng, radius, limit]
    );

    res.json({
      data: result.rows,
      center: { latitude: lat, longitude: lng },
      radius_km: radius,
    });
  } catch (error) {
    next(error);
  }
});
