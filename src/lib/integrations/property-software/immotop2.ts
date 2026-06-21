import "server-only";

import {
  wwDmsConnect,
  WW_DMS_DEFAULT_USER as IMMOTOP2_DEFAULT_USER,
} from "@/lib/integrations/property-software/ww-dms-rest";

export { IMMOTOP2_DEFAULT_USER };

export async function immotop2Connect(
  baseUrl: string,
  username: string,
  password: string
) {
  return wwDmsConnect("ImmoTop2", baseUrl, username, password);
}
