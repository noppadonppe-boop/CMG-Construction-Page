import type { MaterialRequest } from "./db/materials";

/** Project stored items into independent tracking rows without changing the request identity. */
export function materialRequestRows(request: MaterialRequest): MaterialRequest[] {
  if (!request.items?.length) return [request];
  return request.items.map((item) => ({
    ...request,
    ...item,
    id: request.id + ":" + item.id,
    request_id: request.id,
    item_id: item.id,
    receipts: request.receipts.filter((receipt) => receipt.item_id === item.id),
  }));
}
