import {
  Model,
  Document,
  FilterQuery,
  UpdateQuery,
  QueryOptions,
  PipelineStage,
  Types,
} from 'mongoose';
import { IBaseRepository } from '../types';

export class BaseRepository<T extends Document> implements IBaseRepository<T> {
  protected model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  getModel(): Model<T> {
    return this.model;
  }

  async create(input: Partial<T>): Promise<T> {
    const document = new this.model(input);
    return await document.save();
  }

  async createMany(items: Partial<T>[], ordered = true): Promise<T[]> {
    const result = await this.model.insertMany(items, { ordered }) as unknown as T[];
    return result;
  }

  async findAll(
    query: FilterQuery<T> = {},
    options: QueryOptions = {},
    includeDeleted = false,
  ): Promise<T[]> {
    const effectiveQuery = includeDeleted
      ? query
      : { ...query, deletedAt: null };
    return await this.model.find(effectiveQuery, null, options).exec();
  }

  async findById(
    id: string | Types.ObjectId,
    includeDeleted = false,
  ): Promise<T | null> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
    const query = includeDeleted
      ? { _id: objectId }
      : { _id: objectId, deletedAt: null };
    return await this.model.findOne(query).exec();
  }

  async findOne(
    query: FilterQuery<T>,
    options: QueryOptions = {},
    includeDeleted = false,
  ): Promise<T | null> {
    const effectiveQuery = includeDeleted
      ? query
      : { ...query, deletedAt: null };
    return await this.model.findOne(effectiveQuery, null, options).exec();
  }

  async update(
    query: FilterQuery<T>,
    update: UpdateQuery<T>,
    options: QueryOptions = {},
    includeDeleted = false,
  ): Promise<T | null> {
    const effectiveQuery = includeDeleted
      ? query
      : { ...query, deletedAt: null };
    return await this.model
      .findOneAndUpdate(effectiveQuery, update, { new: true, ...options })
      .exec();
  }

  async updateById(
    id: string | Types.ObjectId,
    update: UpdateQuery<T>,
    options: QueryOptions = {},
  ): Promise<T | null> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
    return await this.model
      .findByIdAndUpdate(objectId, update, { new: true, ...options })
      .exec();
  }

  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
  ): Promise<number> {
    const result = await this.model.updateMany(
      { ...filter, deletedAt: null },
      update,
    );
    return result.modifiedCount || 0;
  }

  async delete(
    query: FilterQuery<T>,
    options: QueryOptions = {},
    softDelete = true,
  ): Promise<T | null> {
    if (softDelete) {
      return await this.update(
        query,
        { $set: { deletedAt: new Date() } } as UpdateQuery<T>,
        options,
        true,
      );
    } else {
      return await this.model.findOneAndDelete(query, options).exec();
    }
  }

  async deleteById(
    id: string | Types.ObjectId,
    softDelete = true,
  ): Promise<T | null> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
    if (softDelete) {
      return await this.updateById(
        objectId,
        { $set: { deletedAt: new Date() } } as UpdateQuery<T>,
      );
    }
    return await this.model.findByIdAndDelete(objectId).exec();
  }

  async deleteMany(
    filter: FilterQuery<T>,
    softDelete = true,
  ): Promise<number> {
    if (softDelete) {
      const result = await this.model.updateMany(filter, {
        $set: { deletedAt: new Date() },
      });
      return result.modifiedCount || 0;
    }
    const result = await this.model.deleteMany(filter);
    return result.deletedCount || 0;
  }

  async restore(query: FilterQuery<T>): Promise<T | null> {
    const deletedDoc = await this.findOne(
      { ...query, deletedAt: { $ne: null } },
      {},
      true
    );
  
    if (!deletedDoc) {
      return null;
    }
  
    return await this.update(
      { _id: deletedDoc._id },
      { $unset: { deletedAt: 1, deletedBy: 1 } },
      { new: true },
      true
    );
  }

  async restoreById(id: string | Types.ObjectId): Promise<T | null> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
  
    const deletedDoc = await this.findById(objectId, true);
  
    if (!deletedDoc) {
      return null;
    }
  
    return await this.update(
      { _id: objectId },
      { $unset: { deletedAt: 1, deletedBy: 1 } },
      {},
      true
    );
  }

  async restoreMany(
    filter: FilterQuery<T> = {},
  ): Promise<number> {
    const result = await this.model.updateMany(
      { ...filter, deletedAt: { $ne: null } },
      { $unset: { deletedAt: 1 } }
    );
    return result.modifiedCount || 0;
  }

  /*async countDocuments(
    query: FilterQuery<T> = {},
    includeDeleted = false,
  ): Promise<number> {
    const effectiveQuery = includeDeleted
      ? query
      : { ...query, deletedAt: null };
    return await this.model.countDocuments(effectiveQuery).exec();
  }*/

  async countDocuments(
    query: FilterQuery<T> = {},
    options: { limit?: number; skip?: number } = {},
    includeDeleted = false,
  ): Promise<number> {
    const effectiveQuery = includeDeleted
      ? query
      : { ...query, deletedAt: null };
    
    const countQuery = this.model.countDocuments(effectiveQuery);
    
    if (options.limit !== undefined) {
      countQuery.limit(options.limit);
    }
    
    if (options.skip !== undefined) {
      countQuery.skip(options.skip);
    }
    
    return await countQuery.exec();
  }

  async exists(
    filter: FilterQuery<T>,
    includeDeleted = false,
  ): Promise<boolean> {
    const query = includeDeleted ? filter : { ...filter, deletedAt: null };
    return (await this.model.exists(query)) !== null;
  }

  async aggregate(pipeline: PipelineStage[]): Promise<any[]> {
    return await this.model.aggregate(pipeline).exec();
  }
}