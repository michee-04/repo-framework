import {
  Document,
  FilterQuery,
  UpdateQuery,
  Types,
} from 'mongoose';
import { BaseRepository } from '../repositories';
import { escapeRegex, slugify } from '../utils';

import {
  ServiceConfig,
  PaginationConfig,
  SearchConfig,
  FilterConfig,
  SlugConfig,
  HooksConfig,
  ValidationConfig,
  PopulateConfig,
  CacheConfig,
  AggregationConfig,
  CacheEntry,
  MergedServiceConfig,
} from '../types';
import { ErrorResponse, ErrorResponseType, SuccessResponseType } from '../handlers';
import { LoggerService } from '@nodesandbox/logger';

const Logger = LoggerService.getInstance();

export class BaseService<T extends Document, R extends BaseRepository<T>> {
  protected readonly repository: R;
  protected readonly config: MergedServiceConfig<T>;
  protected readonly uniqueFields: Set<keyof T>;
  private readonly cache: Map<string, CacheEntry<any>>;

  constructor(repository: R, config: ServiceConfig<T> = {}) {
    this.repository = repository;
    this.config = this.mergeConfig(config);
    this.uniqueFields = this.detectUniqueFields();
    this.cache = new Map();
  }

  private mergeConfig(config: ServiceConfig<T>): MergedServiceConfig<T> {
    const defaultPagination: PaginationConfig = {
      defaultLimit: 10,
      maxLimit: 100,
      defaultPage: 1,
    };

    const defaultSearch: SearchConfig<T> = {
      enabled: false,
      fields: [],
      caseSensitive: false,
      fuzzySearch: false,
      weightedFields: {},
    };

    const defaultFilter: FilterConfig<T> = {
      allowedFields: [],
      defaultSort: { createdAt: -1 },
      customFilters: {},
    };

    const defaultSlug: SlugConfig<T> = {
      enabled: false,
      sourceField: 'name' as keyof T,
      targetField: 'slug' as keyof T,
      generator: slugify,
      uniqueResolver: (baseSlug: string, count: number) => `${baseSlug}-${count}`,
    };

    const defaultPopulate: PopulateConfig = {
      fields: [],
      defaultPopulate: false,
    };

    const defaultValidation: ValidationConfig<T> = {
      customValidators: {},
      // preValidate: undefined,
      // postValidate: undefined,
    };

    const defaultHooks: HooksConfig<T> = {
      // beforeCreate: undefined,
      // afterCreate: undefined,
      // beforeUpdate: undefined,
      // afterUpdate: undefined,
      // beforeDelete: undefined,
      // afterDelete: undefined,
    };

    const defaultCache: CacheConfig = {
      enabled: false,
      ttl: 300,
      ignoredFields: [],
    };

    const defaultAggregation: AggregationConfig<T> = {
      customPipelines: {},
      virtualFields: {},
    };

    return {
      pagination: { ...defaultPagination, ...config.pagination },
      search: {
        ...defaultSearch,
        ...config.search,
        fields: config.search?.fields ?? defaultSearch.fields,
        weightedFields: config.search?.weightedFields ?? defaultSearch.weightedFields,
      },
      filter: {
        ...defaultFilter,
        ...config.filter,
        allowedFields: config.filter?.allowedFields ?? defaultFilter.allowedFields,
        customFilters: config.filter?.customFilters ?? defaultFilter.customFilters,
      },
      slug: {
        enabled: config.slug?.enabled ?? defaultSlug.enabled,
        sourceField: config.slug?.sourceField ?? defaultSlug.sourceField,
        targetField: config.slug?.targetField ?? defaultSlug.targetField,
        generator: config.slug?.generator ?? defaultSlug.generator,
        uniqueResolver: config.slug?.uniqueResolver ?? defaultSlug.uniqueResolver,
      },
      populate: {
        ...defaultPopulate,
        ...config.populate,
        fields: config.populate?.fields ?? defaultPopulate.fields,
      },
      validation: {
        ...defaultValidation,
        ...config.validation,
        customValidators: config.validation?.customValidators ?? defaultValidation.customValidators,
      },
      hooks: {
        ...defaultHooks,
        ...config.hooks,
      },
      cache: {
        ...defaultCache,
        ...config.cache,
        ignoredFields: config.cache?.ignoredFields ?? defaultCache.ignoredFields,
      },
      aggregation: {
        ...defaultAggregation,
        ...config.aggregation,
        customPipelines: config.aggregation?.customPipelines ?? defaultAggregation.customPipelines,
        virtualFields: config.aggregation?.virtualFields ?? defaultAggregation.virtualFields,
      },
      softDelete: config.softDelete ?? true
    };
  }


  private detectUniqueFields(): Set<keyof T> {
    const uniqueFields = new Set<keyof T>();
    const paths = this.repository.getModel().schema.paths;

    for (const path in paths) {
      if (paths[path].options?.unique) {
        uniqueFields.add(path as keyof T);
      }
    }

    return uniqueFields;
  }

  private async validateUniqueFields(
    doc: Partial<T>,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const uniqueValidations = Array.from(this.uniqueFields).map(
      async (field) => {
        if (!doc[field]) return;

        const query: FilterQuery<T> = {
          [field]: doc[field],
          ...(excludeId && { _id: { $ne: excludeId } }),
        };

        const exists = await this.exists(query);
        if (exists) {
          throw new ErrorResponse({
            code: 'UNIQUE_FIELD_ERROR',
            message: `The ${String(field)} must be unique.`,
            suggestions: [
              `Value '${String(doc[field])}' is already taken for ${String(field)}.`,
            ],
          });
        }
      },
    );

    await Promise.all(uniqueValidations);
  }

  private async generateUniqueSlug(
    doc: Partial<T>,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    if (!this.config.slug.enabled) return;

    const sourceField = this.config.slug.sourceField;
    const targetField = this.config.slug.targetField;


    if (!(sourceField in doc)) {
      throw new Error(`Source field '${String(sourceField)}' not found in document.`);
    }

    const sourceValue = doc[sourceField];
    if (!sourceValue) return;

    let slug = this.config.slug.generator(sourceValue as string);
    let count = 0;

    while (true) {
      const query: FilterQuery<T> = {
        [targetField]: slug,
        ...(excludeId && { _id: { $ne: excludeId } }),
      };

      const exists = await this.repository.exists(query);
      if (!exists) break;

      count++;
      slug = this.config.slug.uniqueResolver(
        this.config.slug.generator(sourceValue as string),
        count,
      );
    }


    doc[targetField] = slug as T[keyof T];
  }

  private async applyPopulation(doc: T): Promise<T> {
    if (!this.config.populate.defaultPopulate || !this.config.populate.fields.length) {
      return doc;
    }
  
    const populateOptions = this.config.populate.fields.map((field) => {
      if (typeof field === 'string') {
        return { path: field };
      }
  
      const { path, select, match, options } = field;
      return { path, select, match, options };
    });
  
    return doc.populate(populateOptions);
  }
  


  private async runCustomValidators(doc: Partial<T>): Promise<void> {
    if (this.config.validation.customValidators) {
      const validations = Object.entries(
        this.config.validation.customValidators,
      ).map(async ([field, validator]) => {
        const fieldKey = field as keyof T;
        if (doc[fieldKey] !== undefined) {
          const isValid = await validator(doc[fieldKey], doc);
          if (!isValid) {
            throw new ErrorResponse({
              code: 'VALIDATION_ERROR',
              message: `Validation failed for field ${field}.`,
              suggestions: [`Invalid value for ${field}.`],
            });
          }
        }
      });
      await Promise.all(validations);
    }
  }

  private async executeHook(
    hookName: keyof HooksConfig<T>,
    doc: any,
    updateData?: any,
  ): Promise<void> {
    const hook = this.config.hooks[hookName];
    if (hook) {
      if (updateData) {
        await (hook as (doc: any, updateData: any) => Promise<void>)(doc, updateData);
      } else {
        await (hook as (doc: any) => Promise<void>)(doc);
      }
    }
  }

  private createRegexCondition(field: keyof T, regex: RegExp): FilterQuery<T> {
    return { [field]: { $regex: regex } } as FilterQuery<T>;
  }

  private buildSearchQuery(searchTerm?: string): FilterQuery<T> {
    if (
      !searchTerm ||
      !this.config.search.enabled ||
      !this.config.search.fields.length
    ) {
      return {};
    }

    const regexOptions = this.config.search.caseSensitive ? '' : 'i';
    const regex = new RegExp(escapeRegex(searchTerm), regexOptions);

    const searchConditions = this.config.search.fields.map((field) =>
      this.createRegexCondition(field, regex)
    );

    return {
      $or: searchConditions,
    };
  }

  private filterAllowedFields(query: Record<string, any>): FilterQuery<T> {
    if (!this.config.filter.allowedFields.length) return query;

    const allowedFieldsSet = new Set(
      this.config.filter.allowedFields.map((field) => field as string)
    );

    const filteredQuery = Object.entries(query).reduce((acc, [key, value]) => {
      if (allowedFieldsSet.has(key)) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

    return filteredQuery as FilterQuery<T>;
  }

  protected getCacheKey(method: string, params: any): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  protected async getCachedData<R>(
    key: string,
    getter: () => Promise<R>,
  ): Promise<R> {
    if (!this.config.cache.enabled) {
      return getter();
    }

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cache.ttl * 1000) {
      return cached.data;
    }

    const data = await getter();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  protected async validateDocument(doc: Partial<T>): Promise<void> {
    if (this.config.validation.preValidate) {
      await this.config.validation.preValidate(doc);
    }

    await this.runCustomValidators(doc);

    if (this.config.validation.postValidate) {
      await this.config.validation.postValidate(doc);
    }
  }

  async exists(
    query: FilterQuery<T>,
    includeDeleted = false,
  ): Promise<boolean> {
    return this.repository.exists(query, includeDeleted);
  }

  async create(
    input: Partial<T>,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      await this.executeHook('beforeCreate', input);

      await this.validateUniqueFields(input);
      await this.validateDocument(input);
      await this.generateUniqueSlug(input);

      const document = await this.repository.create(input);

      await this.executeHook('afterCreate', document);

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(document)
      : document;

      return {
        success: true,
        data: {
          docs: populatedDoc,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'DATABASE_ERROR',
              message: (error as Error).message,
              originalError: error as Error,
            }),
      };
    }
  }

  async findAll({
    query = {},
    sort,
    page,
    limit,
    searchTerm,
    paginate = true,
    includeDeleted = false,
    populate = this.config.populate.defaultPopulate,
  }: {
    query?: Record<string, any>;
    sort?: Record<string, 1 | -1>;
    page?: number;
    limit?: number;
    searchTerm?: string;
    paginate?: boolean;
    includeDeleted?: boolean;
    populate?: boolean;
  } = {}): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      Logger.info("Got query", query);
      const cacheKey = this.getCacheKey('findAll', arguments[0]);
      return this.getCachedData(cacheKey, async () => {
        const finalQuery = {
          ...this.filterAllowedFields(query),
          ...this.buildSearchQuery(searchTerm),
        };
        Logger.info('findall final query', finalQuery);
        const finalSort = sort || this.config.filter.defaultSort;
        const finalPage = Math.max(
          1,
          page ?? this.config.pagination.defaultPage,
        );

        const finalLimit = Math.min(
          this.config.pagination.maxLimit,
          limit ?? this.config.pagination.defaultLimit,
        );

        const options = {
          sort: finalSort,
          ...(paginate && {
            skip: (finalPage - 1) * finalLimit,
            limit: finalLimit,
          }),
        };

        const [documents, total] = await Promise.all([
          this.repository.findAll(finalQuery, options, includeDeleted),
          this.repository.countDocuments({},{}, includeDeleted),
        ]);

        const populatedDocs = populate
        ? await Promise.all(documents.map((doc) => this.applyPopulation(doc)))
        : documents;

        const results = await this.repository.countDocuments(
          finalQuery,
          {},
          includeDeleted,
        );

        const totalPages = Math.ceil(results / finalLimit);
        const itemsFetched = finalPage * finalLimit;
        const remaining = results - itemsFetched;
        const remainingItems = remaining > 0 ? remaining : 0;
        
        return {
          success: true,
          meta: {
            total,
            results,
            ...(paginate && {
              page: finalPage,
              limit: finalLimit,
              totalPages,
              remainingItems,
              pageItemsCount: documents.length
            }),
          },
          data: {
            docs: populatedDocs,
          },
        };
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({ code: 'DATABASE_ERROR', message: (error as Error).message }),
      }
    }
  }

  async findOne(
    query: FilterQuery<T>,
    populate = this.config.populate.defaultPopulate,
    includeDeleted = false,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const cacheKey = this.getCacheKey('findOne', arguments[0]);
      return this.getCachedData(cacheKey, async () => {
        const document = await this.repository.findOne(
          query,
          {},
          includeDeleted,
        );

        if (!document) {
          throw new ErrorResponse({
            code:'NOT_FOUND_ERROR',
            message:'The requested document was not found.',
          });
        }

        const populatedDoc = populate ? await this.applyPopulation(document) : document;

        return {
          success: true,
          data: {
            docs: populatedDoc,
          },
        };
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({code:'DATABASE_ERROR', message:(error as Error).message}),
      };
    }
  }

  async update(
    query: FilterQuery<T>,
    updateInput: UpdateQuery<T>,
    includeDeleted = false,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const documentToUpdate = await this.repository.findOne(
        query,
        {},
        includeDeleted,
      );

      if (!documentToUpdate) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Document to update not found.',
        });
      }

      await this.executeHook('beforeUpdate', documentToUpdate, updateInput);

      await this.validateUniqueFields(
        updateInput as Partial<T>,
        documentToUpdate._id as Types.ObjectId,
      );
      await this.validateDocument(updateInput as Partial<T>);

      if (
        this.config.slug.enabled &&
        (updateInput as any)[this.config.slug.sourceField] !==
        documentToUpdate[this.config.slug.sourceField]
      ) {
        await this.generateUniqueSlug(
          { ...updateInput, _id: documentToUpdate._id } as Partial<T>,
          documentToUpdate._id as Types.ObjectId,
        );
      }

      const updatedDocument = await this.repository.update(
        query,
        updateInput,
        {},
        includeDeleted,
      );

      if (!updatedDocument) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Updated document not found.',
        });
      }

      await this.executeHook('afterUpdate', updatedDocument);

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(updatedDocument)
      : updatedDocument;

      return {
        success: true,
        data: {
          docs: populatedDoc,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'DATABASE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async delete(
    query: FilterQuery<T>,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const documentToDelete = await this.repository.findOne(query);

      if (!documentToDelete) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Document to delete not found.',
        });
      }

      await this.executeHook('beforeDelete', documentToDelete);

      const deletedDocument = await this.repository.delete(
        query,
        {},
        this.config.softDelete,
      );

      if (!deletedDocument) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: this.config.softDelete ? 'Document to soft delete not found.' : 'Document to delete not found.',
        });
      }

      await this.executeHook('afterDelete', deletedDocument);

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(deletedDocument)
      : deletedDocument;

      return { success: true, data: { docs: populatedDoc } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'DATABASE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async bulkCreate(
    documents: Partial<T>[],
    options: { skipValidation?: boolean; ordered?: boolean } = {},
  ): Promise<SuccessResponseType<T[]> | ErrorResponseType> {
    try {
      if (!options.skipValidation) {
        await Promise.all(
          documents.map(async (doc) => {
            await this.executeHook('beforeCreate', doc);
            await this.validateUniqueFields(doc);
            await this.validateDocument(doc);
            await this.generateUniqueSlug(doc);
          }),
        );
      }

      const createdDocs = await this.repository.createMany(
        documents,
        options.ordered ?? true
      );

      await Promise.all(
        createdDocs.map(async (doc) => {
          await this.executeHook('afterCreate', doc);
        }),
      );

      return {
        success: true,
        data: {
          docs: createdDocs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'BULK_CREATE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async bulkUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options: { validateEach?: boolean } = {},
  ): Promise<SuccessResponseType<{ modified: number }> | ErrorResponseType> {
    try {
      if (options.validateEach) {
        const docs = await this.repository.findAll(filter);
        await Promise.all(
          docs.map((doc) =>
            this.validateDocument({ ...doc.toObject(), ...update }),
          ),
        );
      }

      const modified = await this.repository.updateMany(filter, update);
      return {
        success: true,
        data: {
          modified,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({ code: 'BULK_UPDATE_ERROR', message: (error as Error).message }),
      };
    }
  }

  async restore(
    query: FilterQuery<T>,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    if (!this.config.softDelete) {
      return {
        success: false,
        error: new ErrorResponse({
          code: 'OPERATION_NOT_SUPPORTED',
          message: 'Soft delete is not enabled for this service.',
        }),
      };
    }

    try {
      const restoredDoc = await this.repository.restore(query);
      if (!restoredDoc) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Document not found in deleted state.',
        });
      }

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(restoredDoc)
      : restoredDoc;

      return { success: true, data: { docs: populatedDoc } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'RESTORE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async clone(
    id: string,
    override: Partial<T> = {},
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const doc = await this.repository.findById(id);
      if (!doc) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Source document not found.',
        });
      }

      const cloneData = {
        ...doc.toObject(),
        ...override,
        _id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        deletedAt: undefined,
        deletedBy: undefined,
      };

      return this.create(cloneData);
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'CLONE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async aggregate(
    pipelineName: string,
    params: any = {},
  ): Promise<SuccessResponseType<any[]> | ErrorResponseType> {
    try {
      if (!this.config.aggregation.customPipelines[pipelineName]) {
        throw new ErrorResponse({
          code: 'PIPELINE_NOT_FOUND',
          message: `Aggregation pipeline '${pipelineName}' not found.`,
        });
      }

      const pipeline = this.config.aggregation.customPipelines[pipelineName](
        params,
      );
      const results = await this.repository.getModel().aggregate(pipeline);

      return { success: true, data: { docs: results } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'AGGREGATION_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async exportData(
    query: FilterQuery<T> = {},
    format: 'json' | 'csv' = 'json',
    options: {
      include?: string[]; 
      exclude?: string[];
    } = {},
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      if (options.include && options.exclude) {
        throw new ErrorResponse({
          code: 'EXPORT_ERROR',
          message: 'Les options "include" et "exclude" ne peuvent pas être utilisées ensemble.',
        });
      }
      
      Logger.info('Query', query);

      const results = await this.findAll({ query });

      if(!results.success){
        throw results.error;
      }

      const documents = results?.data?.docs as T[];
      
      const allFields = Object.keys(this.repository.getModel().schema.paths);
  
      let fields = allFields;
      if (options.include) {
        fields = options.include;
      } else if (options.exclude) {
        fields = fields.filter((field) => !(options.exclude?.includes(field)));
      }
  
      const filteredDocuments = documents.map((doc) =>
        fields.reduce((acc, field) => {
          acc[field] = doc.get(field);
          return acc;
        }, {} as Record<string, any>),
      );
  
      if (format === 'csv') {
        const csv = this.generateCSV(fields, filteredDocuments);
        return { success: true, data: { result: csv, format: 'csv' } };
      }
  
      return { success: true, data: { result: filteredDocuments, format: 'json' } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
                code: 'EXPORT_ERROR',
                message: (error as Error).message,
                statusCode:400,
              }),
      };
    }
  }
  
  private generateCSV(headers: string[], rows: Record<string, any>[]): string {
    const csvRows = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value || '';
          })
          .join(','),
      ),
    ];
    return csvRows.join('\n');
  }
  

  async findById(
    id: string | Types.ObjectId,
    populate = this.config.populate.defaultPopulate,
    includeDeleted = false,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const document = await this.repository.findById(id, includeDeleted);

      if (!document) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'The requested document was not found.',
        });
      }

      const populatedDoc = populate
      ? await this.applyPopulation(document)
      : document;

      return { success: true, data: { docs: populatedDoc } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'DATABASE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async updateById(
    id: string | Types.ObjectId,
    updateInput: UpdateQuery<T>,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const documentToUpdate = await this.repository.findById(id);

      if (!documentToUpdate) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Document to update not found.',
        });
      }

      await this.executeHook('beforeUpdate', documentToUpdate, updateInput);

      await this.validateUniqueFields(
        updateInput as Partial<T>,
        documentToUpdate._id as Types.ObjectId,
      );
      await this.validateDocument(updateInput as Partial<T>);

      const updatedDocument = await this.repository.updateById(
        id,
        updateInput,
      );

      if (!updatedDocument) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Updated document not found.',
        });
      }

      await this.executeHook('afterUpdate', updatedDocument);

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(updatedDocument)
      : updatedDocument;

      return { success: true, data: { docs: populatedDoc } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'DATABASE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async deleteById(
    id: string | Types.ObjectId,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    try {
      const documentToDelete = await this.repository.findById(id);

      if (!documentToDelete) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Document to delete not found.',
        });
      }

      await this.executeHook('beforeDelete', documentToDelete);

      const deletedDocument = await this.repository.deleteById(
        id,
        this.config.softDelete,
      );

      if (!deletedDocument) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: this.config.softDelete ? 'Document to soft delete not found.' : 'Document to delete not found.',
        });
      }

      await this.executeHook('afterDelete', deletedDocument);

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(deletedDocument)
      : deletedDocument;

      return { success: true, data: { docs: populatedDoc } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'DATABASE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async restoreById(
    id: string | Types.ObjectId,
  ): Promise<SuccessResponseType<T> | ErrorResponseType> {
    if (!this.config.softDelete) {
      return {
        success: false,
        error: new ErrorResponse({
          code: 'OPERATION_NOT_SUPPORTED',
          message: 'Soft delete is not enabled for this service.',
        }),
      };
    }
    try {
      const restoredDoc = await this.repository.restoreById(id);

      if (!restoredDoc) {
        throw new ErrorResponse({
          code: 'NOT_FOUND_ERROR',
          message: 'Document not found in deleted state.',
        });
      }

      const populatedDoc = this.config.populate.defaultPopulate
      ? await this.applyPopulation(restoredDoc)
      : restoredDoc;

      return { success: true, data: { docs: populatedDoc } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({
              code: 'RESTORE_ERROR',
              message: (error as Error).message,
            }),
      };
    }
  }

  async bulkDelete(
    filter: FilterQuery<T>,
    softDelete = true,
  ): Promise<SuccessResponseType<{ deleted: number }> | ErrorResponseType> {
    try {
      const deleted = await this.repository.deleteMany(filter, softDelete);
      return { success: true, data: { deleted } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse({ code: 'BULK_DELETE_ERROR', message: (error as Error).message }),
      };
    }
  }

  async batchCreate(
    documents: Partial<T>[],
    options: {
      skipValidation?: boolean;
      ordered?: boolean;
      validateBeforeInsert?: boolean;
    } = {}
  ): Promise<SuccessResponseType<T[]> | ErrorResponseType> {
    try {
      if (options.validateBeforeInsert && !options.skipValidation) {
        await Promise.all(
          documents.map(async (doc) => {
            await this.validateUniqueFields(doc);
            await this.validateDocument(doc);
            await this.generateUniqueSlug(doc);
          })
        );
      }

      const createdDocuments = await this.repository.createMany(
        documents,
        options.ordered ?? true
      );

      return {
        success: true,
        data: {
          docs: createdDocuments,
          total: createdDocuments.length
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof ErrorResponse
          ? error
          : new ErrorResponse({
            code: 'BATCH_CREATE_ERROR',
            message: (error as Error).message,
          }),
      };
    }
  }

  async batchUpdate(
    updates: Array<{
      filter: FilterQuery<T>,
      update: UpdateQuery<T>
    }>,
    options: {
      validateEach?: boolean;
      stopOnError?: boolean;
    } = {}
  ): Promise<SuccessResponseType<{ updated: number }> | ErrorResponseType> {
    try {
      const results = await Promise.all(
        updates.map(async ({ filter, update }) => {
          if (options.validateEach) {
            const docsToUpdate = await this.repository.findAll(filter);
            await Promise.all(
              docsToUpdate.map(doc =>
                this.validateDocument({ ...doc.toObject(), ...update })
              )
            );
          }

          return this.repository.updateMany(filter, update);
        })
      );

      const totalUpdated = results.reduce((sum, result) => sum + result, 0);

      return {
        success: true,
        data: {
          updated: totalUpdated
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof ErrorResponse
          ? error
          : new ErrorResponse({ code: 'BATCH_UPDATE_ERROR', message: (error as Error).message }),
      };
    }
  }

  async batchDelete(
    filters: FilterQuery<T>[],
    options: {
      softDelete?: boolean;
      validateBeforeDelete?: boolean;
    } = {}
  ): Promise<SuccessResponseType<{ deleted: number }> | ErrorResponseType> {
    try {
      const softDelete = options.softDelete ?? this.config.softDelete;

      const results = await Promise.all(
        filters.map(async (filter) => {
          if (options.validateBeforeDelete) {
            const docsToDelete = await this.repository.findAll(filter);
            if (docsToDelete.length === 0) return 0;
          }

          return this.repository.deleteMany(filter, softDelete);
        })
      );

      const totalDeleted = results.reduce((sum, result) => sum + result, 0);

      return {
        success: true,
        data: {
          deleted: totalDeleted
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof ErrorResponse
          ? error
          : new ErrorResponse({ code: 'BATCH_DELETE_ERROR', message: (error as Error).message }),
      };
    }
  }

  async batchRestore(
    filters: FilterQuery<T>[],
    options: {
      validateBeforeRestore?: boolean;
    } = {}
  ): Promise<SuccessResponseType<{ restored: number }> | ErrorResponseType> {
    if (!this.config.softDelete) {
      return {
        success: false,
        error: new ErrorResponse({
          code: 'OPERATION_NOT_SUPPORTED',
          message: 'Soft delete is not enabled for this service.'
        }),
      };
    }

    try {
      const results = await Promise.all(
        filters.map(async (filter) => {
          if (options.validateBeforeRestore) {
            const docsToRestore = await this.repository.findAll(
              { ...filter, deletedAt: { $ne: null } }
            );
            if (docsToRestore.length === 0) return 0;
          }

          const restoredCount = await this.repository.restoreMany(filter);
          return restoredCount;
        })
      );

      const totalRestored = results.reduce((sum, result) => sum + result, 0);

      return {
        success: true,
        data: {
          restored: totalRestored
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof ErrorResponse
          ? error
          : new ErrorResponse({ code: 'BATCH_RESTORE_ERROR', message: (error as Error).message }),
      };
    }
  }

  /**
   * NOTE
   * batch and bulk peuvent sembler similaire ou redondant mais
   * 
   * Bulk : Opération sur tous les documents qui correspondent à un même filtre
   * Batch : Plusieurs opérations différentes dans une seule transaction
   * 
   */
}
