export interface Log {
  level: string;
  message: string;
  resourceId: string;
  timestamp: string;
  traceId: string;
  spanId: string;
  commit: string;
  metadata: {
    parentResourceId: string;
  };
}

export interface LogQueryParams {
  level?: string;
  message?: string;
  resourceId?: string;
  traceId?: string;
  spanId?: string;
  commit?: string;
  parentResourceId?: string;
  startTime?: string;
  endTime?: string;
  regex?: string;
  page?: number;
  pageSize?: number;
}

export interface LogQueryResult {
  logs: (Log & { _id: string })[];
  total: number;
  page: number;
  pageSize: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  esQuery?: any; // included for demo/interview purposes — shows the raw ES query
}
