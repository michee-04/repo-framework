type SortType = Record<string, 1 | -1>;

export const parseSortParam = (sortParam: string): SortType => {
  if (!sortParam) return {};
  const sortFields = sortParam.split(',');
  const sortObj: SortType = {};

  sortFields.forEach((field) => {
    if (field.startsWith('-')) {
      const fieldName = field.substring(1);
      sortObj[fieldName] = -1;
    } else {
      sortObj[field] = 1;
    }
  });

  return sortObj;
};
