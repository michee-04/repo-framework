import { AsyncStorageService } from '@nodesandbox/async-storage';
import { LoggerService } from '@nodesandbox/logger';
import { Schema, Document } from 'mongoose';

const LOGGER = LoggerService.getInstance();
const ASYNC_STORAGE = AsyncStorageService.getInstance();

const auditTrailPlugin = (schema: Schema) => {
  schema.pre<Document>('save', function (next) {
    const currentUserId = ASYNC_STORAGE.get('currentUserId');

    if (!currentUserId) {
      LOGGER.warn(
        'Warning: currentUserId is undefined. Audit trail fields will not be set.',
      );
    }

    if (this.isNew) {
      this.set('createdBy', currentUserId || null);
    } else {
      this.set('updatedBy', currentUserId || null);
    }
    next();
  });

  schema.methods.softDelete = async function () {
    const currentUserId = ASYNC_STORAGE.get('currentUserId');
    this.deletedAt = new Date();
    this.deletedBy = currentUserId || null;
    await this.save();
  };

  schema.methods.restore = async function () {
    const currentUserId = ASYNC_STORAGE.get('currentUserId');
    this.deletedAt = null;
    this.deletedBy = null;
    await this.save();
  };
};

export default auditTrailPlugin;
