# Log 設計規範

文件版本：v1.0.0  
適用範圍：Next.js 後台系統、API 服務、GKE、Cloud Logging、Cloud Monitoring

---

## 1. 目的

本文件定義系統 Log 的輸出格式、欄位命名、事件分類、Next.js 實作方式，以及如何讓 GCP Cloud Logging 與 Cloud Monitoring 更容易查詢、監控與告警。

主要目標：

1. 統一 API 與非 API 服務的 Log 格式。
2. 讓 GKE Pod 的 stdout / stderr Log 可被 Cloud Logging 正確收集。
3. 讓 Log 可以透過 `jsonPayload` 欄位進行查詢。
4. 記錄 API 回應時間、頁面資料載入時間、背景任務耗時。
5. 支援 Cloud Monitoring 建立延遲、錯誤率、任務失敗等告警。

---

## 2. 基本原則

### 2.1 使用 JSON 結構化 Log

所有服務 Log 應使用單行 JSON 格式輸出。

不建議：

```ts
console.log('API request completed');
```

建議：

```ts
console.info(JSON.stringify({
  severity: 'INFO',
  service: 'example-admin',
  env: 'prod',
  eventType: 'api_request_completed',
  message: 'API request completed',
  method: 'POST',
  path: '/api/orders',
  status: 200,
  durationMs: 123,
  requestId: 'req_abc123',
  timestamp: new Date().toISOString(),
}));
```

---

### 2.2 輸出到 stdout / stderr

GKE 會收集 Container 的 stdout / stderr，並送到 Cloud Logging。

建議規則：

| Log 等級 | 輸出方式 | 說明 |
|---|---|---|
| `DEBUG` | `console.info` | 開發除錯資訊 |
| `INFO` | `console.info` | 一般流程資訊 |
| `NOTICE` | `console.info` | 重要但非錯誤事件 |
| `WARNING` | `console.error` 或 `console.warn` | 警告事件 |
| `ERROR` | `console.error` | 錯誤事件 |
| `CRITICAL` | `console.error` | 嚴重錯誤事件 |

---

### 2.3 不直接輸出敏感資料

Log 不應包含以下資料：

- 密碼
- Access Token
- Refresh Token
- Authorization Header
- 信用卡資料
- 身分證字號
- 個人敏感資料
- Cookie
- Session ID

如需記錄 request body，應只記錄必要欄位，或先進行遮罩處理。

---

## 3. 統一 Log 欄位規範

### 3.1 基本欄位

| 欄位 | 型別 | 必填 | 說明 |
|---|---:|---:|---|
| `severity` | string | 是 | Log 等級，例如 `INFO`、`ERROR` |
| `service` | string | 是 | 服務名稱，例如 `example-admin`、`example-api` |
| `env` | string | 是 | 環境，例如 `dev`、`qa`、`staging`、`prod` |
| `eventType` | string | 是 | 事件類型，例如 `api_request_completed` |
| `message` | string | 是 | 人類可讀的 Log 訊息 |
| `timestamp` | string | 是 | ISO 8601 時間 |
| `requestId` | string | 建議 | 單次請求追蹤 ID |
| `traceId` | string | 選填 | 跨服務追蹤 ID |
| `userId` | string | 選填 | 登入使用者 ID |
| `tenantId` | string | 選填 | 多租戶系統租戶 ID |

---

### 3.2 API 相關欄位

| 欄位 | 型別 | 說明 |
|---|---:|---|
| `method` | string | HTTP method，例如 `GET`、`POST` |
| `path` | string | API path，例如 `/api/orders` |
| `status` | number | HTTP status code |
| `durationMs` | number | API 處理時間，單位毫秒 |
| `ip` | string | 來源 IP |
| `userAgent` | string | User-Agent |

範例：

```json
{
  "severity": "INFO",
  "service": "example-admin",
  "env": "prod",
  "eventType": "api_request_completed",
  "message": "API request completed",
  "method": "POST",
  "path": "/api/orders",
  "status": 200,
  "durationMs": 123,
  "requestId": "req_abc123",
  "timestamp": "2026-04-28T06:00:00.000Z"
}
```

---

### 3.3 後台操作欄位

| 欄位 | 型別 | 說明 |
|---|---:|---|
| `action` | string | 操作名稱，例如 `update_order_status` |
| `targetType` | string | 操作對象類型，例如 `order`、`product` |
| `targetId` | string / number | 操作對象 ID |
| `oldValue` | object | 修改前資料，應避免敏感資料 |
| `newValue` | object | 修改後資料，應避免敏感資料 |
| `durationMs` | number | 操作耗時 |

範例：

```json
{
  "severity": "INFO",
  "service": "example-admin",
  "env": "prod",
  "eventType": "admin_action_completed",
  "message": "Admin action completed",
  "requestId": "req_123",
  "userId": "u_001",
  "action": "update_order_status",
  "targetType": "order",
  "targetId": 5566,
  "oldStatus": "pending",
  "newStatus": "completed",
  "durationMs": 95,
  "timestamp": "2026-04-28T06:00:00.000Z"
}
```

---

### 3.4 背景任務欄位

| 欄位 | 型別 | 說明 |
|---|---:|---|
| `jobId` | string | 任務執行 ID |
| `jobName` | string | 任務名稱 |
| `total` | number | 總處理筆數 |
| `success` | number | 成功筆數 |
| `failed` | number | 失敗筆數 |
| `durationMs` | number | 任務耗時 |

範例：

```json
{
  "severity": "INFO",
  "service": "example-admin",
  "env": "prod",
  "eventType": "job_completed",
  "message": "Job completed",
  "jobId": "sync_orders_1714284000000",
  "jobName": "sync_orders",
  "total": 100,
  "success": 98,
  "failed": 2,
  "durationMs": 12000,
  "timestamp": "2026-04-28T06:00:00.000Z"
}
```

---

## 4. EventType 命名規範

### 4.1 命名原則

使用小寫英文與底線：

```text
{domain}_{object/action}_{status}
```

範例：

```text
api_request_completed
admin_action_failed
job_completed
external_api_failed
```

---

### 4.2 API EventType

| EventType | 說明 |
|---|---|
| `api_request_started` | API 請求開始 |
| `api_request_completed` | API 請求成功完成 |
| `api_request_failed` | API 請求失敗 |
| `api_business_action` | API 內的業務操作事件 |
| `api_external_call_started` | API 呼叫外部服務開始 |
| `api_external_call_completed` | API 呼叫外部服務完成 |
| `api_external_call_failed` | API 呼叫外部服務失敗 |

---

### 4.3 後台系統 EventType

| EventType | 說明 |
|---|---|
| `admin_action_started` | 後台操作開始 |
| `admin_action_completed` | 後台操作成功完成 |
| `admin_action_failed` | 後台操作失敗 |
| `page_data_loaded` | 後台頁面資料載入完成 |
| `page_data_load_failed` | 後台頁面資料載入失敗 |
| `auth_login_success` | 登入成功 |
| `auth_login_failed` | 登入失敗 |
| `auth_permission_denied` | 權限不足 |

---

### 4.4 背景任務 EventType

| EventType | 說明 |
|---|---|
| `job_started` | 背景任務開始 |
| `job_completed` | 背景任務完成 |
| `job_failed` | 背景任務失敗 |
| `job_step_completed` | 背景任務步驟完成 |
| `job_step_failed` | 背景任務步驟失敗 |

---

### 4.5 DB / 外部服務 EventType

| EventType | 說明 |
|---|---|
| `db_query_completed` | DB 查詢完成 |
| `db_query_failed` | DB 查詢失敗 |
| `external_api_started` | 外部 API 呼叫開始 |
| `external_api_completed` | 外部 API 呼叫完成 |
| `external_api_failed` | 外部 API 呼叫失敗 |

---

## 5. Next.js 共用 Logger 實作

建議建立：

```text
src/lib/logger.ts
```

```ts
type LogSeverity = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL';

type LogPayload = Record<string, unknown>;

const SERVICE_NAME = process.env.SERVICE_NAME || 'nextjs-service';
const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development';

function safeJsonStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({
      severity: 'ERROR',
      message: 'Failed to stringify log payload',
    });
  }
}

function writeLog(
  severity: LogSeverity,
  eventType: string,
  message: string,
  payload: LogPayload = {},
) {
  const log = {
    severity,
    service: SERVICE_NAME,
    env: APP_ENV,
    eventType,
    message,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  const line = safeJsonStringify(log);

  if (severity === 'ERROR' || severity === 'CRITICAL' || severity === 'WARNING') {
    console.error(line);
    return;
  }

  console.info(line);
}

export const logger = {
  debug: (eventType: string, message: string, payload?: LogPayload) =>
    writeLog('DEBUG', eventType, message, payload),

  info: (eventType: string, message: string, payload?: LogPayload) =>
    writeLog('INFO', eventType, message, payload),

  notice: (eventType: string, message: string, payload?: LogPayload) =>
    writeLog('NOTICE', eventType, message, payload),

  warn: (eventType: string, message: string, payload?: LogPayload) =>
    writeLog('WARNING', eventType, message, payload),

  error: (eventType: string, message: string, payload?: LogPayload) =>
    writeLog('ERROR', eventType, message, payload),

  critical: (eventType: string, message: string, payload?: LogPayload) =>
    writeLog('CRITICAL', eventType, message, payload),
};
```

---

## 6. API 服務 Log 範例

檔案：

```text
app/api/orders/route.ts
```

```ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId =
    req.headers.get('x-request-id') ||
    req.headers.get('x-cloud-trace-context') ||
    crypto.randomUUID();

  const path = req.nextUrl.pathname;
  const method = req.method;

  logger.info('api_request_started', 'API request started', {
    requestId,
    method,
    path,
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for'),
  });

  try {
    const body = await req.json();

    logger.info('api_business_action', 'Create order requested', {
      requestId,
      method,
      path,
      productId: body.productId,
      quantity: body.quantity,
    });

    const order = {
      id: 123,
      productId: body.productId,
      quantity: body.quantity,
      status: 'created',
    };

    const durationMs = Date.now() - startTime;

    logger.info('api_request_completed', 'API request completed', {
      requestId,
      method,
      path,
      status: 200,
      durationMs,
      orderId: order.id,
    });

    return NextResponse.json(
      {
        success: true,
        data: order,
        requestId,
      },
      {
        status: 200,
        headers: {
          'x-request-id': requestId,
        },
      },
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('api_request_failed', 'API request failed', {
      requestId,
      method,
      path,
      status: 500,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal Server Error',
        requestId,
      },
      {
        status: 500,
        headers: {
          'x-request-id': requestId,
        },
      },
    );
  }
}
```

---

## 7. 後台操作 Log 範例

例如後台使用者修改訂單狀態：

```ts
import { logger } from '@/lib/logger';

export async function updateOrderStatus(params: {
  orderId: number;
  oldStatus: string;
  newStatus: string;
  userId: string;
  requestId: string;
}) {
  const startTime = Date.now();

  logger.info('admin_action_started', 'Admin action started', {
    requestId: params.requestId,
    userId: params.userId,
    action: 'update_order_status',
    targetType: 'order',
    targetId: params.orderId,
  });

  try {
    // update DB ...

    logger.info('admin_action_completed', 'Admin action completed', {
      requestId: params.requestId,
      userId: params.userId,
      action: 'update_order_status',
      targetType: 'order',
      targetId: params.orderId,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('admin_action_failed', 'Admin action failed', {
      requestId: params.requestId,
      userId: params.userId,
      action: 'update_order_status',
      targetType: 'order',
      targetId: params.orderId,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}
```

---

## 8. 後台頁面資料載入 Log 範例

檔案：

```text
app/admin/orders/page.tsx
```

```tsx
import { logger } from '@/lib/logger';

async function getOrders() {
  const startTime = Date.now();

  try {
    // const orders = await db.order.findMany();
    const orders = [];

    logger.info('page_data_loaded', 'Page data loaded', {
      page: '/admin/orders',
      dataSource: 'orders',
      resultCount: orders.length,
      durationMs: Date.now() - startTime,
    });

    return orders;
  } catch (error) {
    logger.error('page_data_load_failed', 'Page data load failed', {
      page: '/admin/orders',
      dataSource: 'orders',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <main>
      <h1>訂單管理</h1>
      {/* render orders */}
    </main>
  );
}
```

---

## 9. 背景任務 Log 範例

```ts
import { logger } from '@/lib/logger';

export async function syncOrdersJob() {
  const startTime = Date.now();
  const jobId = `sync_orders_${Date.now()}`;

  logger.info('job_started', 'Job started', {
    jobId,
    jobName: 'sync_orders',
  });

  try {
    const total = 100;
    const success = 98;
    const failed = 2;

    logger.info('job_completed', 'Job completed', {
      jobId,
      jobName: 'sync_orders',
      total,
      success,
      failed,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('job_failed', 'Job failed', {
      jobId,
      jobName: 'sync_orders',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}
```

---

## 10. 外部 API / DB 呼叫時間 Log 範例

```ts
import { logger } from '@/lib/logger';

export async function callErpApi(requestId: string) {
  const startTime = Date.now();

  logger.info('external_api_started', 'External API started', {
    requestId,
    provider: 'erp',
    operation: 'get_orders',
  });

  try {
    // const response = await fetch(...)

    logger.info('external_api_completed', 'External API completed', {
      requestId,
      provider: 'erp',
      operation: 'get_orders',
      status: 200,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('external_api_failed', 'External API failed', {
      requestId,
      provider: 'erp',
      operation: 'get_orders',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

---

## 11. Cloud Logging 查詢範例

### 11.1 查某個 GKE namespace 的服務

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
jsonPayload.service="example-admin"
```

---

### 11.2 查某支 API

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
jsonPayload.eventType="api_request_completed"
jsonPayload.path="/api/orders"
```

---

### 11.3 查 API 回應超過 1 秒

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
jsonPayload.eventType="api_request_completed"
jsonPayload.durationMs>1000
```

---

### 11.4 查後台頁面資料載入超過 2 秒

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
jsonPayload.eventType="page_data_loaded"
jsonPayload.page="/admin/orders"
jsonPayload.durationMs>2000
```

---

### 11.5 查所有錯誤

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
severity>=ERROR
```

---

### 11.6 查某一次 request

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
jsonPayload.requestId="6e15eb82-3cc9-4732-8985-b584fa8fd4b3e"
```

---

### 11.7 查某位後台使用者做了什麼

```text
resource.type="k8s_container"
resource.labels.namespace_name="example-namespace-prod"
jsonPayload.userId="u_001"
jsonPayload.eventType=~"admin_action_.*"
```

---

## 12. Cloud Monitoring 告警設計

Cloud Monitoring 可透過 Log-based Metric 建立告警。

建議先從以下指標開始：

| Metric 名稱 | 來源 EventType | 用途 |
|---|---|---|
| `api_latency_ms` | `api_request_completed` | API 回應時間 |
| `api_error_count` | `api_request_failed` 或 `status >= 500` | API 錯誤數 |
| `admin_action_latency_ms` | `admin_action_completed` | 後台操作耗時 |
| `page_data_latency_ms` | `page_data_loaded` | 後台頁面資料載入耗時 |
| `job_latency_ms` | `job_completed` | 背景任務耗時 |
| `job_failed_count` | `job_failed` | 背景任務失敗數 |
| `external_api_latency_ms` | `external_api_completed` | 外部 API 回應時間 |
| `external_api_failed_count` | `external_api_failed` | 外部 API 失敗數 |

---

### 12.1 API latency Log-based Metric

Filter：

```text
resource.type="k8s_container"
jsonPayload.eventType="api_request_completed"
jsonPayload.durationMs>0
```

Value Extractor：

```text
jsonPayload.durationMs
```

建議 Label：

| Label | 來源欄位 |
|---|---|
| `service` | `jsonPayload.service` |
| `env` | `jsonPayload.env` |
| `method` | `jsonPayload.method` |
| `path` | `jsonPayload.path` |
| `status` | `jsonPayload.status` |

---

### 12.2 API error count Log-based Metric

Filter：

```text
resource.type="k8s_container"
jsonPayload.eventType="api_request_failed"
```

或：

```text
resource.type="k8s_container"
jsonPayload.eventType="api_request_completed"
jsonPayload.status>=500
```

---

### 12.3 後台頁面回應時間 Metric

Filter：

```text
resource.type="k8s_container"
jsonPayload.eventType="page_data_loaded"
jsonPayload.durationMs>0
```

Value Extractor：

```text
jsonPayload.durationMs
```

建議 Label：

| Label | 來源欄位 |
|---|---|
| `service` | `jsonPayload.service` |
| `env` | `jsonPayload.env` |
| `page` | `jsonPayload.page` |
| `dataSource` | `jsonPayload.dataSource` |

---

### 12.4 背景任務失敗 Metric

Filter：

```text
resource.type="k8s_container"
jsonPayload.eventType="job_failed"
```

建議 Label：

| Label | 來源欄位 |
|---|---|
| `service` | `jsonPayload.service` |
| `env` | `jsonPayload.env` |
| `jobName` | `jsonPayload.jobName` |

---

## 13. 告警門檻建議

| 告警項目 | 建議條件 |
|---|---|
| API P95 回應時間過高 | 5 分鐘內 P95 > 1000ms |
| API P99 回應時間過高 | 5 分鐘內 P99 > 3000ms |
| 特定 API 過慢 | `/api/orders` P95 > 1500ms |
| API 5xx 錯誤 | 5 分鐘內 5xx > 10 次 |
| 後台頁面過慢 | `/admin/orders` P95 > 2000ms |
| 後台操作失敗 | `admin_action_failed` > 5 次 / 5 分鐘 |
| 背景任務失敗 | `job_failed` > 0 次 |
| 外部 API 過慢 | P95 > 3000ms |
| 外部 API 失敗 | 5 分鐘內失敗 > 5 次 |

---

## 14. 建議最小落地版本

初期至少實作以下 5 種事件：

```text
api_request_completed
api_request_failed
admin_action_completed
admin_action_failed
job_failed
```

最小欄位：

```json
{
  "severity": "INFO",
  "service": "example-admin",
  "env": "prod",
  "eventType": "api_request_completed",
  "message": "API request completed",
  "method": "POST",
  "path": "/api/orders",
  "status": 200,
  "durationMs": 123,
  "requestId": "req_abc123",
  "timestamp": "2026-04-28T06:00:00.000Z"
}
```

---

## 15. 建議架構

```text
Next.js API / Server Action / Page / Job
        ↓
src/lib/logger.ts
        ↓
console.info(JSON.stringify(...))
console.error(JSON.stringify(...))
        ↓
GKE stdout / stderr
        ↓
Cloud Logging jsonPayload
        ↓
Log-based Metrics
        ↓
Cloud Monitoring Alert
```

---

## 16. 實作檢查表

| 項目 | 是否完成 |
|---|---|
| 建立 `src/lib/logger.ts` |  |
| 所有 API route 使用 logger |  |
| API 成功時記錄 `api_request_completed` |  |
| API 失敗時記錄 `api_request_failed` |  |
| API Log 包含 `durationMs` |  |
| API Log 包含 `requestId` |  |
| 後台操作記錄 `admin_action_completed` / `admin_action_failed` |  |
| 背景任務記錄 `job_completed` / `job_failed` |  |
| 外部 API 呼叫記錄 `external_api_completed` / `external_api_failed` |  |
| 避免輸出密碼、Token、Cookie、Authorization |  |
| Cloud Logging 可查 `jsonPayload.eventType` |  |
| 建立 API latency Log-based Metric |  |
| 建立 API error count Log-based Metric |  |
| 建立 Cloud Monitoring 告警 |  |

---

## 17. 注意事項

1. `durationMs` 應固定使用毫秒，避免不同服務混用秒與毫秒。
2. `eventType` 命名應固定，不應每個工程師自行命名。
3. `path` 建議記錄 route pattern，例如 `/api/orders`，避免記錄大量不同 ID 造成 metrics label 爆量。
4. `requestId` 應從 Header 延續，若沒有才自行產生。
5. 錯誤 Log 應包含 `error`，必要時包含 `stack`。
6. Production 環境不建議輸出完整 request body。
7. 若使用 Log-based Metrics，應避免高基數 label，例如 `requestId`、`userId` 不建議作為 metric label。
8. Cloud Monitoring 告警應先從服務層級開始，再針對重要 API 建立細部告警。

