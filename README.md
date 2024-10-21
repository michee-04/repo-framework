# @nodesandbox/repo-framework

A TypeScript framework designed to simplify CRUD operations in Node.js applications using Mongoose.

## Features

- **Simplified CRUD operations**: A streamlined approach to performing CRUD actions on Mongoose models.
- **Repository Pattern**: Provides a generic repository pattern for interacting with models.
- **Service Layer**: Allows for the creation of reusable services that encapsulate business logic.
- **Search and Filters**: Built-in support for search and filters across entity fields.
- **Plugins**: Several essential plugins are included by default to enhance functionality:
  - **Audit Trail**: Tracks user actions and modifications in the database, helping to maintain accountability. Requires the `currentUserId` to be set via `AsyncStorage`.
  - **History Tracking**: Keeps a record of changes made to documents for better data management.
  - **Indexing**: Allows for efficient data retrieval by creating indexes on specified fields.
  - **Soft Delete**: Enables marking records as deleted without removing them from the database, preserving historical data.
  - **Versioning**: Manages versions of documents to track changes over time.

  You can also **add** or **exclude** plugins as needed to customize your implementation.

## Installation

```bash
npm install @nodesandbox/repo-framework mongoose
```

Ensure you also have `mongoose` installed in your project.

## Usage

### Define a Model

You can create a base schema and extend it for your specific needs:

```typescript
import { createBaseSchema, BaseModel } from '@nodesandbox/repo-framework';

const TODO_MODEL_NAME = 'Todo';

const todoSchema = createBaseSchema<ITodoModel>({
  name: { type: String, required: true },
  slug: { type: String, unique: true, required: true },
  description: { type: String },
  completed: { type: Boolean, default: false },
  dueDate: { type: Date },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
}, {
  modelName: TODO_MODEL_NAME,
});

const TodoModel = new BaseModel<ITodoModel>(
  TODO_MODEL_NAME,
  todoSchema
).getModel();

export { TodoModel };
```

### Define a Repository

Extend the base repository to add custom methods for your model:

```typescript
import { BaseRepository } from '@nodesandbox/repo-framework';
import { Model } from 'mongoose';

export class TodoRepository extends BaseRepository<ITodoModel> {
  constructor(model: Model<ITodoModel>) {
    super(model);
  }

  async findIncomplete(): Promise<ITodoModel[]> {
    return this.model.find({ completed: false }).exec();
  }

  async findByPriority(priority: string): Promise<ITodoModel[]> {
    return this.model.find({ priority }).exec();
  }
}
```

### Define a Service

Extend the base service to encapsulate business logic:

```typescript
import { BaseService } from '@nodesandbox/repo-framework';

class TodoService extends BaseService<ITodoModel, TodoRepository> {
  constructor() {
    const todoRepo = new TodoRepository(TodoModel);
    super(todoRepo, true, []);
    this.allowedFilterFields = ['dueDate', 'completed', 'priority'];
    this.searchFields = ['title', 'description'];
  }

  async getTodos(filters: Record<string, any>): Promise<any> {
    const { page = 1, limit = 10, sort, search = '', priority, completed, upcoming } = filters;
    const query: any = {};
    if (priority) query.priority = priority;
    if (completed !== undefined) query.completed = completed === 'true';
    if (upcoming) {
      const days = parseInt(upcoming as string) || 7;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      query.dueDate = { $gte: new Date(), $lte: futureDate };
    }
    const sortObject = sort ? parseSortParam(sort) : {};
    return this.findAll({
      query,
      sort: sortObject,
      page: parseInt(page),
      limit: parseInt(limit),
      searchTerm: search as string,
    });
  }
}
```

### Example

This framework provides a flexible structure for various CRUD operations, suitable for any application using Node.js, Express, and MongoDB.

## Contributing

We welcome contributions! Please submit a pull request or open an issue if you have any suggestions.

## License

MIT © 2024 NodeSandbox