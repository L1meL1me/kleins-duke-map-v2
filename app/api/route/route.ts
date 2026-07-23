import { NextRequest, NextResponse } from "next/server";

const DUKE_BOUNDS = {
  minLat: 35.96,
  maxLat: 36.04,
  minLon: -78.99,
  maxLon: -78.89,
};

function isInsideDukeArea(lat: number, lon: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= DUKE_BOUNDS.minLat &&
    lat <= DUKE_BOUNDS.maxLat &&
    lon >= DUKE_BOUNDS.minLon &&
    lon <= DUKE_BOUNDS.maxLon
  );
}

function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e6, lon / 1e6]);
  }

  return coordinates;
}

function translateInstruction(instruction: string) {
  const directionMap: Record<string, string> = {
    north: "北",
    northeast: "东北",
    east: "东",
    southeast: "东南",
    south: "南",
    southwest: "西南",
    west: "西",
    northwest: "西北",
  };

  const walk = instruction.match(
    /^Walk (north|northeast|east|southeast|south|southwest|west|northwest) on the walkway\.$/i,
  );
  if (walk) return `沿步道向${directionMap[walk[1].toLowerCase()]}步行`;
  if (/^Turn right onto the walkway\.$/i.test(instruction))
    return "右转进入步道";
  if (/^Turn left onto the walkway\.$/i.test(instruction))
    return "左转进入步道";
  if (/^Bear right onto the walkway\.$/i.test(instruction))
    return "稍向右进入步道";
  if (/^Bear left onto the walkway\.$/i.test(instruction))
    return "稍向左进入步道";
  if (/destination is on the right/i.test(instruction)) return "目的地在右侧";
  if (/destination is on the left/i.test(instruction)) return "目的地在左侧";
  if (/arrived at your destination/i.test(instruction)) return "已到达目的地";
  return instruction;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const originLat = Number(params.get("originLat"));
  const originLon = Number(params.get("originLon"));
  const destLat = Number(params.get("destLat"));
  const destLon = Number(params.get("destLon"));
  const requestedMode = params.get("mode");
  const costing =
    requestedMode === "bicycle" || requestedMode === "auto"
      ? requestedMode
      : "pedestrian";

  if (
    !isInsideDukeArea(originLat, originLon) ||
    !isInsideDukeArea(destLat, destLon)
  ) {
    return NextResponse.json(
      { error: "路线点超出 Duke 校园范围。" },
      { status: 400 },
    );
  }

  const payload = {
    locations: [
      { lat: originLat, lon: originLon },
      { lat: destLat, lon: destLon },
    ],
    costing,
    units: "kilometers",
    directions_options: { units: "kilometers" },
  };

  const endpoint =
    "https://valhalla1.openstreetmap.de/route?json=" +
    encodeURIComponent(JSON.stringify(payload));

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "KleinDukeMapV2/1.0",
      },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`Routing failed: ${response.status}`);

    const data = (await response.json()) as {
      trip?: {
        summary?: { length?: number; time?: number };
        legs?: Array<{
          shape?: string;
          maneuvers?: Array<{
            instruction?: string;
            length?: number;
            time?: number;
          }>;
        }>;
      };
    };

    const leg = data.trip?.legs?.[0];
    if (!leg?.shape || !data.trip?.summary) {
      throw new Error("Routing response missing geometry");
    }

    return NextResponse.json(
      {
        distanceKm: data.trip.summary.length ?? 0,
        durationMinutes: Math.max(
          1,
          Math.round((data.trip.summary.time ?? 0) / 60),
        ),
        points: decodePolyline6(leg.shape),
        steps: (leg.maneuvers ?? []).slice(0, 12).map((step) => ({
          instruction: translateInstruction(step.instruction ?? "继续步行"),
          distanceMeters: Math.round((step.length ?? 0) * 1000),
        })),
        engine: `Valhalla ${costing} / OpenStreetMap`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error: "校园步行路线暂时无法加载，请使用 Apple Maps 或 Google Maps。",
      },
      { status: 502 },
    );
  }
}
