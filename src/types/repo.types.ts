import { FilterQuery, PipelineStage, QueryOptions, Types, UpdateQuery } from "mongoose";

export interface IBaseRepository<T> {
    create(input: Partial<T>): Promise<T>;
    createMany(items: Partial<T>[], ordered?: boolean): Promise<T[]>;
    findAll(query?: FilterQuery<T>, options?: QueryOptions, includeDeleted?: boolean): Promise<T[]>;
    findById(id: string | Types.ObjectId, includeDeleted?: boolean): Promise<T | null>;
    findOne(query: FilterQuery<T>, options?: QueryOptions, includeDeleted?: boolean): Promise<T | null>;
    update(query: FilterQuery<T>, update: UpdateQuery<T>, options?: QueryOptions, includeDeleted?: boolean): Promise<T | null>;
    updateById(id: string | Types.ObjectId, update: UpdateQuery<T>, options?: QueryOptions): Promise<T | null>;
    updateMany(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<number>;
    delete(query: FilterQuery<T>, options?: QueryOptions, softDelete?: boolean): Promise<T | null>;
    deleteById(id: string | Types.ObjectId, softDelete?: boolean): Promise<T | null>;
    deleteMany(filter: FilterQuery<T>, softDelete?: boolean): Promise<number>;
    restore(query: FilterQuery<T>): Promise<T | null>;
    restoreById(id: string | Types.ObjectId): Promise<T | null>;
    countDocuments(query?: FilterQuery<T>, includeDeleted?: boolean): Promise<number>;
    exists(filter: FilterQuery<T>, includeDeleted?: boolean): Promise<boolean>;
    aggregate(pipeline: PipelineStage[]): Promise<any[]>;
  }