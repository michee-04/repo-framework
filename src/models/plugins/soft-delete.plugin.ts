import { Schema } from 'mongoose';

const softDeletePlugin = (schema: Schema) => {
  const deletedAtField = 'deletedAt';

  schema.add({ [deletedAtField]: { type: Date, default: null } });

  schema.methods.softDelete = async function () {
    this[deletedAtField] = new Date();
    await this.save();
  };

  schema.methods.restore = async function () {
    this[deletedAtField] = null;
    await this.save();
  };

  const addNotDeletedCondition = function (this: any) {
    this.where({ [deletedAtField]: null });
  };

  schema.pre('find', addNotDeletedCondition);
  schema.pre('findOne', addNotDeletedCondition);
  schema.pre('findOneAndUpdate', addNotDeletedCondition);
  schema.pre('updateMany', addNotDeletedCondition);
  schema.pre('countDocuments', addNotDeletedCondition);
  schema.pre('aggregate', function (next) {
    this.pipeline().unshift({ $match: { [deletedAtField]: null } });
    next();
  });
};

export default softDeletePlugin;
