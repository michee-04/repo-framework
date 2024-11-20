import { FilterQuery, PipelineStage } from "mongoose";
import { slugify } from "../utils";

export interface PaginationConfig {
    defaultLimit: number;
    maxLimit: number;
    defaultPage: number;
  }
  
  export interface SearchConfig<T> {
    enabled: boolean;
    fields: (keyof T)[];
    caseSensitive: boolean;
    fuzzySearch: boolean;
    weightedFields: Partial<Record<keyof T, number>>;
  }
  
  export interface FilterConfig<T> {
    allowedFields: (keyof T)[];
    defaultSort: Record<string, 1 | -1>;
    customFilters: Record<string, (value: any) => FilterQuery<T>>;
  }
  
  export interface SlugConfig<T> {
    enabled: boolean;
    sourceField: keyof T;
    targetField: keyof T;
    generator: (value: string) => string;
    uniqueResolver: (baseSlug: string, count: number) => string;
  }
  
  export interface PopulateConfig {
    fields: string[];
    defaultPopulate: boolean;
  }
  
  export interface ValidationConfig<T> {
    customValidators: Partial<
      Record<
        keyof T,
        (value: any, document: Partial<T>) => Promise<boolean> | boolean
      >
    >;
    preValidate?: (document: Partial<T>) => Promise<void> | void;
    postValidate?: (document: Partial<T>) => Promise<void> | void;
  }
  
  export interface HooksConfig<T> {
    beforeCreate?: (document: Partial<T>) => Promise<void> | void;
    afterCreate?: (document: T) => Promise<void> | void;
    beforeUpdate?: (
      document: T,
      updateData: Partial<T>,
    ) => Promise<void> | void;
    afterUpdate?: (document: T) => Promise<void> | void;
    beforeDelete?: (document: T) => Promise<void> | void;
    afterDelete?: (document: T) => Promise<void> | void;
  }
  
  export interface CacheConfig {
    enabled: boolean;
    ttl: number;
    ignoredFields: string[];
  }

  export type CacheEntry<T> = {
    data: T;
    timestamp: number;
  };
  
  export interface AggregationConfig<T> {
    customPipelines: Record<string, (params: any) => PipelineStage[]>;
    virtualFields: Partial<Record<keyof T, (document: T) => any>>;
  }
  
  export interface ServiceConfig<T> {
    pagination?: Partial<PaginationConfig>;
    search?: Partial<SearchConfig<T>>;
    filter?: Partial<FilterConfig<T>>;
    slug?: Partial<SlugConfig<T>>;
    populate?: Partial<PopulateConfig>;
    validation?: Partial<ValidationConfig<T>>;
    hooks?: Partial<HooksConfig<T>>;
    cache?: Partial<CacheConfig>;
    aggregation?: Partial<AggregationConfig<T>>;
    softDelete?: boolean;
  }
  
  // TODO: Use this later in mergeConfig()
  export const DEFAULT_CONFIG: Required<ServiceConfig<any>> = {
    pagination: {
      defaultLimit: 10,
      maxLimit: 100,
      defaultPage: 1,
    },
    search: {
      enabled: false,
      fields: [],
      caseSensitive: false,
      fuzzySearch: false,
      weightedFields: {},
    },
    filter: {
      allowedFields: [],
      defaultSort: { createdAt: -1 },
      customFilters: {},
    },
    slug: {
      enabled: false,
      sourceField: 'name',
      targetField: 'slug',
      generator: slugify,
      uniqueResolver: (baseSlug: string, count: number) => `${baseSlug}-${count}`,
    },
    populate: {
      fields: [],
      defaultPopulate: false,
    },
    validation: {
      customValidators: {},
    },
    hooks: {},
    cache: {
      enabled: false,
      ttl: 300, // 5 minutes
      ignoredFields: [],
    },
    aggregation: {
      customPipelines: {},
      virtualFields: {},
    },
    softDelete: true
  };

  export type MergedServiceConfig<T> = {
    pagination: Required<PaginationConfig>;
    search: Required<SearchConfig<T>>;
    filter: Required<FilterConfig<T>>;
    slug: Required<SlugConfig<T>>;
    populate: Required<PopulateConfig>;
    validation: ValidationConfig<T>;
    hooks: HooksConfig<T>;
    cache: Required<CacheConfig>;
    aggregation: Required<AggregationConfig<T>>;
    softDelete: boolean;
  };