import {
  getHomeAssistantCatalogStatus,
  HomeAssistantError,
  refreshHomeAssistantCatalog,
} from "@/lib/home-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusCode(error: HomeAssistantError): number {
  if (error.code === "not_configured") return 400;
  if (error.code === "unauthorized") return 401;
  if (error.code === "timeout") return 504;
  return 502;
}

export async function GET() {
  return Response.json(getHomeAssistantCatalogStatus());
}

export async function POST() {
  try {
    return Response.json(await refreshHomeAssistantCatalog());
  } catch (error) {
    if (error instanceof HomeAssistantError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
          ...getHomeAssistantCatalogStatus(),
        },
        { status: statusCode(error) },
      );
    }
    return Response.json(
      { error: "Could not refresh Home Assistant catalogue." },
      { status: 502 },
    );
  }
}
