export type RouteResult = {
  distanceKm: number;
  durationMinutes: number;
  points: [number, number][];
  steps: Array<{ instruction: string; distanceMeters: number }>;
  engine: string;
};

export type RouteMode = "pedestrian" | "bicycle" | "auto";

type ValhallaResponse = {
  trip?: {
    summary?: { length?: number; time?: number };
    legs?: Array<{
      shape?: string;
      maneuvers?: Array<{
        instruction?: string;
        length?: number;
      }>;
    }>;
  };
};

function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([latitude / 1e6, longitude / 1e6]);
  }

  return coordinates;
}

function translateInstruction(instruction: string) {
  const directions: Record<string, string> = {
    north: "北",
    northeast: "东北",
    east: "东",
    southeast: "东南",
    south: "南",
    southwest: "西南",
    west: "西",
    northwest: "西北",
  };

  const walkway = instruction.match(
    /^Walk (north|northeast|east|southeast|south|southwest|west|northwest) on the walkway\.$/i,
  );
  if (walkway) {
    return `沿步道向${directions[walkway[1].toLowerCase()]}步行`;
  }
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

async function fetchFromValhalla(
  origin: [number, number],
  destination: [number, number],
  mode: RouteMode,
): Promise<RouteResult> {
  const payload = {
    locations: [
      { lat: origin[0], lon: origin[1] },
      { lat: destination[0], lon: destination[1] },
    ],
    costing: mode,
    units: "kilometers",
    directions_options: { units: "kilometers" },
  };
  const endpoint =
    "https://valhalla1.openstreetmap.de/route?json=" +
    encodeURIComponent(JSON.stringify(payload));
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("校园步行路线暂时无法加载，请使用外部地图。");
  }

  const data = (await response.json()) as ValhallaResponse;
  const summary = data.trip?.summary;
  const leg = data.trip?.legs?.[0];
  if (!summary || !leg?.shape) {
    throw new Error("路线服务没有返回可用的校园步道。");
  }

  return {
    distanceKm: summary.length ?? 0,
    durationMinutes: Math.max(1, Math.round((summary.time ?? 0) / 60)),
    points: decodePolyline6(leg.shape),
    steps: (leg.maneuvers ?? []).slice(0, 12).map((step) => ({
      instruction: translateInstruction(step.instruction ?? "继续步行"),
      distanceMeters: Math.round((step.length ?? 0) * 1000),
    })),
    engine: `Valhalla ${mode} / OpenStreetMap`,
  };
}

export async function fetchRoute(
  origin: [number, number],
  destination: [number, number],
  mode: RouteMode,
): Promise<RouteResult> {
  const isGitHubPages =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith("github.io");

  if (!isGitHubPages) {
    const search = new URLSearchParams({
      originLat: String(origin[0]),
      originLon: String(origin[1]),
      destLat: String(destination[0]),
      destLon: String(destination[1]),
      mode,
    });

    try {
      const response = await fetch(`/api/route?${search.toString()}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("application/json")) {
        return (await response.json()) as RouteResult;
      }
    } catch {
      // Independent static hosts use Valhalla directly below.
    }
  }

  return fetchFromValhalla(origin, destination, mode);
}
