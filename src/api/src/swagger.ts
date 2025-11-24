export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Datagoose - Global Power Plant API',
    version: '1.0.0',
    description: 'REST API for exploring the Global Power Plant Database (34,936 power plants worldwide)',
    contact: {
      name: 'Datagoose Team',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT || 3001}`,
      description: 'Development server',
    },
  ],
  tags: [
    { name: 'Power Plants', description: 'Power plant data operations' },
    { name: 'Statistics', description: 'Aggregated statistics and analytics' },
  ],
  paths: {
    '/api/power-plants': {
      get: {
        tags: ['Power Plants'],
        summary: 'List power plants',
        description: 'Returns a paginated list of power plants with optional filtering',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'country', in: 'query', schema: { type: 'string' }, description: 'ISO 3166-1 alpha-3 country code' },
          { name: 'fuel', in: 'query', schema: { type: 'string' }, description: 'Primary fuel type' },
          { name: 'minCapacity', in: 'query', schema: { type: 'number' }, description: 'Minimum capacity in MW' },
          { name: 'maxCapacity', in: 'query', schema: { type: 'number' }, description: 'Maximum capacity in MW' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search in plant name' },
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PowerPlantListResponse' },
              },
            },
          },
        },
      },
    },
    '/api/power-plants/{id}': {
      get: {
        tags: ['Power Plants'],
        summary: 'Get power plant by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PowerPlantDetail' },
              },
            },
          },
          404: { description: 'Power plant not found' },
        },
      },
    },
    '/api/stats/summary': {
      get: {
        tags: ['Statistics'],
        summary: 'Get summary statistics',
        responses: {
          200: {
            description: 'Summary statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SummaryStats' },
              },
            },
          },
        },
      },
    },
    '/api/stats/by-country': {
      get: {
        tags: ['Statistics'],
        summary: 'Get statistics by country',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: 'Statistics by country',
          },
        },
      },
    },
    '/api/stats/by-fuel': {
      get: {
        tags: ['Statistics'],
        summary: 'Get statistics by fuel type',
        responses: {
          200: {
            description: 'Statistics by fuel type',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PowerPlant: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          gppd_idnr: { type: 'string' },
          name: { type: 'string' },
          country_code: { type: 'string' },
          country: { type: 'string' },
          capacity_mw: { type: 'number' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          primary_fuel: { type: 'string' },
          commissioning_year: { type: 'integer', nullable: true },
          owner: { type: 'string', nullable: true },
        },
      },
      PowerPlantDetail: {
        allOf: [
          { $ref: '#/components/schemas/PowerPlant' },
          {
            type: 'object',
            properties: {
              other_fuel1: { type: 'string', nullable: true },
              other_fuel2: { type: 'string', nullable: true },
              other_fuel3: { type: 'string', nullable: true },
              source: { type: 'string', nullable: true },
              url: { type: 'string', nullable: true },
              generation: {
                type: 'array',
                items: { $ref: '#/components/schemas/Generation' },
              },
            },
          },
        ],
      },
      Generation: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          generation_gwh: { type: 'number', nullable: true },
          estimated_generation_gwh: { type: 'number', nullable: true },
        },
      },
      PowerPlantListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/PowerPlant' },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      SummaryStats: {
        type: 'object',
        properties: {
          totalPlants: { type: 'integer' },
          totalCapacityMw: { type: 'number' },
          totalCountries: { type: 'integer' },
          fuelTypes: { type: 'integer' },
        },
      },
    },
  },
};
