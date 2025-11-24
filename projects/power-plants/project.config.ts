/**
 * Power Plants Project Configuration
 *
 * This file defines the project-specific settings for the Global Power Plant Database migration.
 */

export interface ProjectConfig {
  name: string;
  displayName: string;
  description: string;
  database: {
    name: string;
    migrations: string;
    rollback: string;
  };
  api: {
    basePath: string;
    routes: string;
    port: number;
  };
  ui: {
    title: string;
    pages: string;
    port: number;
  };
  etl: {
    pipeline: string;
    defaultSource: string;
    batchSize: number;
  };
  docker: {
    projectName: string;
    postgresPort: number;
  };
}

export const config: ProjectConfig = {
  name: 'power-plants',
  displayName: 'Global Power Plant Database',
  description: 'A comprehensive database of 34,936 power plants worldwide with generation data from 2013-2019',

  database: {
    name: 'datagoose_power_plants',
    migrations: './schemas/migrations',
    rollback: './schemas/rollback',
  },

  api: {
    basePath: '/api',
    routes: './api/routes',
    port: 3001,
  },

  ui: {
    title: 'Datagoose - Power Plants',
    pages: './ui/pages',
    port: 5174,
  },

  etl: {
    pipeline: './etl/migrate_power_plants.py',
    defaultSource: './data/source/global_power_plant_database.csv',
    batchSize: 1000,
  },

  docker: {
    projectName: 'datagoose-power-plants',
    postgresPort: 5433,
  },
};

export default config;
