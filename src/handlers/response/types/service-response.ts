import { ErrorResponse } from '../error/response';

export type SuccessResponseType<T> = {
  success: true;
  meta?: MetaType;
  data?: {
    docs?: T | T[];
    [key: string]: any;
  };
};


export type ErrorResponseType = {
  success: boolean;
  error: ErrorResponse;
  data?: never;
  meta?: never;
};

type MetaType = {
  total?: number;
  results?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  remainingItems?: number;
  [key: string]: any;
};
