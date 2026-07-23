"use client";

import {
  ArrowRight,
  BadgeCheck,
  Bike,
  BookOpen,
  Bus,
  CarFront,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  ExternalLink,
  Footprints,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  Printer,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type {
  CircleMarker,
  LayerGroup,
  Map as LeafletMap,
  Marker,
} from "leaflet";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AREA_META,
  AREA_ORDER,
  CATEGORY_META,
  FALL_2026_PLAN,
  OFFICIAL_LINKS,
  PLACES,
  SHUTTLE_ROUTE_NAME,
  SHUTTLE_ROUTE_SHAPE,
  SHUTTLE_STOPS,
  type Place,
  type PlaceArea,
  type PlaceCategory,
  type ShuttleStop,
} from "./data";
import {
  fetchRoute,
  type RouteMode as EngineRouteMode,
  type RouteResult,
} from "./route-client";

type OriginMode = "edens" | "current";
type TravelMode = "walk" | "bike" | "drive" | "shuttle";
type SheetSnap = "peek" | "medium" | "full";

type ShuttlePlan = {
  routeName: string;
  board: ShuttleStop;
  alight: ShuttleStop;
  stops: ShuttleStop[];
  originWalkKm: number;
  destinationWalkKm: number;
};

const EDENS = PLACES.find((place) => place.id === "edens-1a")!;

const TRAVEL_MODE_META: Record<
  TravelMode,
  { label: string; engine?: EngineRouteMode }
> = {
  walk: { label: "步行", engine: "pedestrian" },
  bike: { label: "骑行", engine: "bicycle" },
  drive: { label: "驾车", engine: "auto" },
  shuttle: { label: "Duke Shuttle" },
};

function placeArea(place: Place): PlaceArea {
  return place.area ?? "west";
}

function distanceKm(
  pointA: [number, number],
  pointB: [number, number],
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(pointB[0] - pointA[0]);
  const lonDelta = toRadians(pointB[1] - pointA[1]);
  const latA = toRadians(pointA[0]);
  const latB = toRadians(pointB[0]);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(lonDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function nearestShuttleStop(point: [number, number]) {
  return SHUTTLE_STOPS.reduce(
    (nearest, stop) => {
      const distance = distanceKm(point, stop.coordinates);
      return distance < nearest.distance ? { stop, distance } : nearest;
    },
    {
      stop: SHUTTLE_STOPS[0],
      distance: Number.POSITIVE_INFINITY,
    },
  );
}

function shuttlePlanFor(
  origin: [number, number],
  destination: [number, number],
): ShuttlePlan | null {
  const originStop = nearestShuttleStop(origin);
  const destinationStop = nearestShuttleStop(destination);
  const boardIndex = SHUTTLE_STOPS.findIndex(
    (stop) => stop.id === originStop.stop.id,
  );
  const alightIndex = SHUTTLE_STOPS.findIndex(
    (stop) => stop.id === destinationStop.stop.id,
  );

  if (
    boardIndex === alightIndex ||
    originStop.distance > 1.2 ||
    destinationStop.distance > 1.5
  ) {
    return null;
  }

  const stops: ShuttleStop[] = [];
  let index = boardIndex;
  while (true) {
    stops.push(SHUTTLE_STOPS[index]);
    if (index === alightIndex) break;
    index = (index + 1) % SHUTTLE_STOPS.length;
  }

  return {
    routeName: SHUTTLE_ROUTE_NAME,
    board: originStop.stop,
    alight: destinationStop.stop,
    stops,
    originWalkKm: originStop.distance,
    destinationWalkKm: destinationStop.distance,
  };
}

function shuttleShapeFor(plan: ShuttlePlan) {
  const nearestIndex = (point: [number, number]) =>
    SHUTTLE_ROUTE_SHAPE.reduce(
      (nearest, shapePoint, index) => {
        const distance = distanceKm(point, shapePoint);
        return distance < nearest.distance ? { index, distance } : nearest;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index;
  const boardIndex = nearestIndex(plan.board.coordinates);
  const alightIndex = nearestIndex(plan.alight.coordinates);
  const shape =
    boardIndex <= alightIndex
      ? SHUTTLE_ROUTE_SHAPE.slice(boardIndex, alightIndex + 1)
      : [
          ...SHUTTLE_ROUTE_SHAPE.slice(boardIndex),
          ...SHUTTLE_ROUTE_SHAPE.slice(0, alightIndex + 1),
        ];
  return [plan.board.coordinates, ...shape, plan.alight.coordinates];
}

function travelModesFor(
  place: Place,
  origin: [number, number],
): TravelMode[] {
  const tripDistance = distanceKm(origin, place.coordinates);
  const modes: TravelMode[] =
    tripDistance <= 4.5
      ? ["walk", "bike", "drive"]
      : tripDistance <= 18
        ? ["bike", "drive"]
        : ["drive"];
  if (shuttlePlanFor(origin, place.coordinates)) modes.push("shuttle");
  return modes;
}

function useHorizontalDrag<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const gesture = useRef({
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  return {
    ref,
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: event.currentTarget.scrollLeft,
        moved: false,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      if (gesture.current.pointerId !== event.pointerId) return;
      const delta = event.clientX - gesture.current.startX;
      if (Math.abs(delta) > 5 && !gesture.current.moved) {
        gesture.current.moved = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Dragging still works while the pointer remains over the strip.
        }
      }
      if (gesture.current.moved) {
        event.currentTarget.scrollLeft =
          gesture.current.startScrollLeft - delta;
        event.preventDefault();
      }
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (gesture.current.pointerId !== event.pointerId) return;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture is optional in some embedded browsers.
      }
      gesture.current.pointerId = -1;
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      if (gesture.current.pointerId !== event.pointerId) return;
      gesture.current.pointerId = -1;
    },
    onClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!gesture.current.moved) return;
      event.preventDefault();
      event.stopPropagation();
      gesture.current.moved = false;
    },
  };
}

function confidenceLabel(place: Place) {
  if (place.confidence === "verified") return "Duke 数据核验";
  if (place.confidence === "cross-checked") return "已交叉核验";
  return "课程信息待确认";
}

function mapsLink(
  place: Place,
  provider: "google" | "apple",
  mode: TravelMode,
) {
  const [lat, lon] = place.coordinates;
  if (provider === "apple") {
    return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=${mode === "drive" ? "d" : "w"}`;
  }
  const travelmode =
    mode === "drive" ? "driving" : mode === "bike" ? "bicycling" : "walking";
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${travelmode}`;
}

export default function DukeMapClient() {
  const [selectedId, setSelectedId] = useState("edens-1a");
  const [activeArea, setActiveArea] = useState<PlaceArea | "all">("west");
  const [activeCategory, setActiveCategory] = useState<
    PlaceCategory | "all"
  >("all");
  const [query, setQuery] = useState("");
  const [originMode, setOriginMode] = useState<OriginMode>("edens");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [locationMessage, setLocationMessage] = useState("");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [shuttlePlan, setShuttlePlan] = useState<ShuttlePlan | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("walk");
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const detailCardRef = useRef<HTMLElement | null>(null);
  const markerRefs = useRef<Record<string, Marker>>({});
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const routeEndpointRefs = useRef<{
    origin: Marker | null;
    destination: Marker | null;
  }>({ origin: null, destination: null });
  const userMarkerRef = useRef<CircleMarker | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const sheetGestureRef = useRef({
    pointerId: -1,
    startY: 0,
    startHeight: 0,
    moved: false,
  });
  const mobileAreaDrag = useHorizontalDrag();
  const areaDrag = useHorizontalDrag();
  const categoryDrag = useHorizontalDrag();

  const selectedPlace =
    PLACES.find((place) => place.id === selectedId) ?? EDENS;
  const routeOrigin =
    originMode === "current" && userLocation
      ? userLocation
      : EDENS.coordinates;
  const availableTravelModes = travelModesFor(selectedPlace, routeOrigin);
  const shuttlePreview = shuttlePlanFor(
    routeOrigin,
    selectedPlace.coordinates,
  );

  const availableCategories = useMemo(() => {
    const categories = new Set(
      PLACES.filter(
        (place) => activeArea === "all" || placeArea(place) === activeArea,
      ).map((place) => place.category),
    );
    return (Object.keys(CATEGORY_META) as PlaceCategory[]).filter((category) =>
      categories.has(category),
    );
  }, [activeArea]);

  const filteredPlaces = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return PLACES.filter((place) => {
      const areaMatches =
        activeArea === "all" || placeArea(place) === activeArea;
      const categoryMatches =
        activeCategory === "all" || place.category === activeCategory;
      const queryMatches =
        !normalized ||
        `${place.name} ${place.shortName} ${place.categoryLabel} ${AREA_META[placeArea(place)].label} ${place.room ?? ""} ${place.address ?? ""}`
          .toLowerCase()
          .includes(normalized);
      return areaMatches && categoryMatches && queryMatches;
    });
  }, [activeArea, activeCategory, query]);

  const groupedPlaces = useMemo(
    () =>
      AREA_ORDER.map((area) => ({
        area,
        places: filteredPlaces.filter((place) => placeArea(place) === area),
      })).filter((group) => group.places.length > 0),
    [filteredPlaces],
  );

  useEffect(() => {
    let cancelled = false;

    async function initialiseMap() {
      if (!mapNodeRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapNodeRef.current) return;

      const map = L.map(mapNodeRef.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
      }).setView([36.0013, -78.9397], 16);

      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      for (const place of PLACES) {
        const meta = CATEGORY_META[place.category];
        const marker = L.marker(place.coordinates, {
          title: place.name,
          alt: place.name,
          icon: L.divIcon({
            className: "duke-pin-shell",
            html: `<span class="duke-pin" style="--pin:${meta.color};--pin-soft:${meta.soft}"><b>${place.markerLabel}</b></span>`,
            iconSize: [44, 52],
            iconAnchor: [22, 48],
          }),
        });

        if (placeArea(place) === "west") marker.addTo(map);

        marker.bindTooltip(
          `<span class="marker-preview-emoji">${place.previewEmoji ?? place.markerLabel}</span><span class="marker-preview-copy"><b>${place.shortName}</b><small>${AREA_META[placeArea(place)].shortLabel} · ${place.categoryLabel}</small></span>`,
          {
            direction: "top",
            offset: [0, -43],
            opacity: 1,
            className: "marker-preview-tooltip",
          },
        );
        marker.on("click", () => {
          setSelectedId(place.id);
          const modes = travelModesFor(place, EDENS.coordinates);
          setTravelMode(modes.includes("walk") ? "walk" : modes[0]);
          setSheetOpen(true);
          setSheetHeight(null);
          setRoute(null);
          setShuttlePlan(null);
          setRouteMessage("");
          window.setTimeout(
            () =>
              detailCardRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }),
            80,
          );
        });
        markerRefs.current[place.id] = marker;
      }

      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 50);
    }

    initialiseMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRefs.current = {};
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const place of PLACES) {
      const marker = markerRefs.current[place.id];
      if (!marker) continue;
      const areaMatches =
        activeArea === "all" || placeArea(place) === activeArea;
      const categoryMatches =
        activeCategory === "all" || place.category === activeCategory;
      const shouldShow = areaMatches && categoryMatches;
      if (shouldShow && !map.hasLayer(marker)) marker.addTo(map);
      if (!shouldShow && map.hasLayer(marker)) marker.removeFrom(map);
    }
  }, [activeArea, activeCategory]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRefs.current[selectedPlace.id];
    if (!map || !marker) return;
    if (!map.hasLayer(marker)) marker.addTo(map);
    map.flyTo(selectedPlace.coordinates, 17, { duration: 0.65 });
  }, [selectedPlace]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("这台设备不支持定位。");
      return;
    }

    setLocationMessage("正在获取当前位置…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        setUserLocation(point);
        setOriginMode("current");
        const modes = travelModesFor(selectedPlace, point);
        if (!modes.includes(travelMode)) {
          setTravelMode(modes.includes("walk") ? "walk" : modes[0]);
        }
        setLocationMessage("已使用你当前的位置。");

        const map = mapRef.current;
        if (map) {
          const L = await import("leaflet");
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(point);
          } else {
            userMarkerRef.current = L.circleMarker(point, {
              radius: 8,
              color: "#ffffff",
              weight: 3,
              fillColor: "#1677ff",
              fillOpacity: 1,
            })
              .bindTooltip("你在这里")
              .addTo(map);
          }
          map.flyTo(point, 17, { duration: 0.6 });
        }
      },
      () => {
        setOriginMode("edens");
        setLocationMessage("定位未开启，已继续使用 Edens 1A。");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  function clearRouteLayers() {
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    routeEndpointRefs.current.origin?.remove();
    routeEndpointRefs.current.destination?.remove();
    routeEndpointRefs.current = { origin: null, destination: null };
  }

  async function addRouteEndpoints(
    origin: [number, number],
    destination: [number, number],
  ) {
    const map = mapRef.current;
    if (!map) return;
    const L = await import("leaflet");

    routeEndpointRefs.current.origin?.remove();
    routeEndpointRefs.current.destination?.remove();
    routeEndpointRefs.current.origin = L.marker(origin, {
      title: "路线起点",
      icon: L.divIcon({
        className: "route-endpoint-shell",
        html: '<span class="route-endpoint route-origin-pin"><b>起</b></span>',
        iconSize: [36, 42],
        iconAnchor: [18, 38],
      }),
    })
      .bindTooltip("路线起点", { direction: "top", offset: [0, -30] })
      .addTo(map);
    routeEndpointRefs.current.destination = L.marker(destination, {
      title: "路线终点",
      icon: L.divIcon({
        className: "route-endpoint-shell",
        html: '<span class="route-endpoint route-destination-pin"><b>终</b></span>',
        iconSize: [36, 42],
        iconAnchor: [18, 38],
      }),
    })
      .bindTooltip("路线终点", { direction: "top", offset: [0, -30] })
      .addTo(map);
  }

  async function fetchWalkingLeg(
    from: [number, number],
    to: [number, number],
  ) {
    if (distanceKm(from, to) < 0.025) {
      return {
        distanceKm: distanceKm(from, to),
        points: [from, to] as [number, number][],
      };
    }
    try {
      const result = await fetchRoute(from, to, "pedestrian");
      return { distanceKm: result.distanceKm, points: result.points };
    } catch {
      return {
        distanceKm: distanceKm(from, to),
        points: [from, to] as [number, number][],
      };
    }
  }

  async function buildRoute() {
    const origin = routeOrigin;
    const destination = selectedPlace.coordinates;

    if (selectedPlace.id === "edens-1a" && originMode === "edens") {
      setRoute(null);
      setShuttlePlan(null);
      setRouteMessage("Edens 1A 已经是路线起点。");
      return;
    }

    setRouteLoading(true);
    setRouteMessage("");
    clearRouteLayers();

    try {
      if (travelMode === "shuttle") {
        const draftPlan = shuttlePlanFor(origin, destination);
        if (!draftPlan) {
          setShuttlePlan(null);
          setRouteMessage("这两个地点之间没有合适的 Duke Shuttle 组合。");
          return;
        }

        const [originWalk, destinationWalk] = await Promise.all([
          fetchWalkingLeg(origin, draftPlan.board.coordinates),
          fetchWalkingLeg(draftPlan.alight.coordinates, destination),
        ]);
        const completedPlan = {
          ...draftPlan,
          originWalkKm: originWalk.distanceKm,
          destinationWalkKm: destinationWalk.distanceKm,
        };
        setShuttlePlan(completedPlan);
        setRoute(null);

        const L = await import("leaflet");
        const map = mapRef.current;
        if (map) {
          const shuttleShape = shuttleShapeFor(draftPlan);
          const layers = [
            L.polyline(originWalk.points, {
              color: "#d47a16",
              weight: 5,
              opacity: 0.9,
              dashArray: "8 8",
            }),
            L.polyline(shuttleShape, {
              color: "#007a5e",
              weight: 7,
              opacity: 0.94,
              lineJoin: "round",
            }),
            L.polyline(destinationWalk.points, {
              color: "#d47a16",
              weight: 5,
              opacity: 0.9,
              dashArray: "8 8",
            }),
          ];
          routeLayerRef.current = L.layerGroup(layers).addTo(map);
          await addRouteEndpoints(origin, destination);
          const allPoints = [
            ...originWalk.points,
            ...shuttleShape,
            ...destinationWalk.points,
          ];
          map.fitBounds(allPoints, {
            paddingTopLeft: [60, 110],
            paddingBottomRight: [60, 230],
            maxZoom: 17,
          });
        }
        return;
      }

      const engineMode = TRAVEL_MODE_META[travelMode].engine;
      if (!engineMode) throw new Error("请选择可用的路线方式。");
      const result = await fetchRoute(origin, destination, engineMode);

      setRoute(result);
      setShuttlePlan(null);
      const L = await import("leaflet");
      const map = mapRef.current;
      if (map) {
        routeLayerRef.current = L.layerGroup([
          L.polyline(result.points, {
            color: "#012169",
            weight: 6,
            opacity: 0.96,
            lineJoin: "round",
          }),
        ]).addTo(map);
        await addRouteEndpoints(origin, destination);
        map.fitBounds([origin, destination], {
          paddingTopLeft: [60, 110],
          paddingBottomRight: [60, 230],
          maxZoom: 18,
        });
      }
    } catch (error) {
      setRoute(null);
      setRouteMessage(
        error instanceof Error
          ? error.message
          : "步行路线暂时无法加载，请使用外部地图。",
      );
    } finally {
      setRouteLoading(false);
    }
  }

  function clearRoute() {
    setRoute(null);
    setShuttlePlan(null);
    setRouteMessage("");
    clearRouteLayers();
  }

  function choosePlace(place: Place) {
    setSelectedId(place.id);
    const modes = travelModesFor(place, routeOrigin);
    setTravelMode(modes.includes("walk") ? "walk" : modes[0]);
    setSheetOpen(true);
    setSheetHeight(null);
    clearRoute();
    window.setTimeout(
      () =>
        detailCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      80,
    );
  }

  function sheetSnapHeight(snap: SheetSnap) {
    const viewportHeight = window.innerHeight;
    if (snap === "peek") return 128;
    if (snap === "full") return Math.min(viewportHeight * 0.91, 860);
    return Math.min(viewportHeight * 0.66, 700);
  }

  function handleSheetPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const panel = sheetRef.current;
    if (!panel || window.innerWidth > 760) return;
    sheetGestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panel.getBoundingClientRect().height,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Dragging still works while the pointer remains over the handle.
    }
  }

  function handleSheetPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (sheetGestureRef.current.pointerId !== event.pointerId) return;
    const delta = sheetGestureRef.current.startY - event.clientY;
    if (Math.abs(delta) > 4) sheetGestureRef.current.moved = true;
    if (!sheetGestureRef.current.moved) return;
    setSheetDragging(true);
    const nextHeight = Math.max(
      112,
      Math.min(
        window.innerHeight * 0.93,
        sheetGestureRef.current.startHeight + delta,
      ),
    );
    setSheetHeight(nextHeight);
    setSheetOpen(nextHeight > 150);
    event.preventDefault();
  }

  function handleSheetPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (sheetGestureRef.current.pointerId !== event.pointerId) return;
    const currentHeight =
      sheetRef.current?.getBoundingClientRect().height ?? 128;
    const candidates: Array<{ snap: SheetSnap; height: number }> = [
      { snap: "peek", height: sheetSnapHeight("peek") },
      { snap: "medium", height: sheetSnapHeight("medium") },
      { snap: "full", height: sheetSnapHeight("full") },
    ];
    const nearest = candidates.reduce((best, candidate) =>
      Math.abs(candidate.height - currentHeight) <
      Math.abs(best.height - currentHeight)
        ? candidate
        : best,
    );
    setSheetHeight(nearest.height);
    setSheetOpen(nearest.snap !== "peek");
    setSheetDragging(false);
    sheetGestureRef.current.pointerId = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function toggleSheet() {
    if (sheetGestureRef.current.moved) {
      sheetGestureRef.current.moved = false;
      return;
    }
    const nextOpen = !sheetOpen;
    setSheetOpen(nextOpen);
    setSheetHeight(
      nextOpen ? sheetSnapHeight("medium") : sheetSnapHeight("peek"),
    );
  }

  return (
    <main className="map-app">
      <section className="map-stage" aria-label="Duke 与 Triangle 互动地图">
        <div ref={mapNodeRef} className="leaflet-map" />
        <div className="map-wash" aria-hidden="true" />

        <header className="mobile-map-header">
          <div className="mobile-mark">KD</div>
          <div>
            <strong>Klein&apos;s Duke Map</strong>
            <span>Duke + Triangle · V3.1</span>
          </div>
          <button
            type="button"
            className="round-icon-button"
            onClick={useCurrentLocation}
            aria-label="使用当前位置"
          >
            <LocateFixed size={18} />
          </button>
        </header>

        <nav
          className="mobile-category-strip draggable-tabs"
          aria-label="区域筛选"
          {...mobileAreaDrag}
        >
          <button
            type="button"
            className={activeArea === "all" ? "active" : ""}
            onClick={() => {
              setActiveArea("all");
              setActiveCategory("all");
            }}
          >
            全部
          </button>
          {AREA_ORDER.map((area) => (
            <button
              type="button"
              key={area}
              className={activeArea === area ? "active" : ""}
              onClick={() => {
                setActiveArea(area);
                setActiveCategory("all");
              }}
            >
              {AREA_META[area].shortLabel}
            </button>
          ))}
        </nav>

        <div className="map-accuracy-pill">
          <BadgeCheck size={15} />
          {PLACES.length} 个固定核验点 · 不再实时猜坐标
        </div>
      </section>

      <aside
        ref={sheetRef}
        className={`control-panel ${sheetOpen ? "sheet-open" : ""} ${sheetDragging ? "sheet-dragging" : ""}`}
        style={
          {
            "--sheet-height":
              sheetHeight === null ? undefined : `${sheetHeight}px`,
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="sheet-handle"
          aria-label={sheetOpen ? "收起详情" : "展开详情"}
          aria-expanded={sheetOpen}
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerUp}
          onClick={toggleSheet}
        >
          <span />
          {sheetOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>

        <div className="panel-scroll">
          <header className="brand-row">
            <div className="brand-mark">KD</div>
            <div>
              <h1>Klein&apos;s Duke Map</h1>
              <p>Duke + Triangle · Fall 2026 · V3.1</p>
            </div>
            <button
              type="button"
              className="round-icon-button desktop-locate"
              onClick={useCurrentLocation}
              aria-label="使用当前位置"
            >
              <LocateFixed size={18} />
            </button>
          </header>

          <div className="trust-banner">
            <BadgeCheck size={19} />
            <div>
              <strong>准确性优先</strong>
              <span>分区地点 + 多交通路线 + 官方来源日期</span>
            </div>
          </div>

          <label className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (value.trim()) {
                  setActiveArea("all");
                  setActiveCategory("all");
                }
              }}
              placeholder="搜索地点、餐厅、超市或景点"
              aria-label="搜索地点、餐厅、超市或景点"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清除搜索"
              >
                <X size={16} />
              </button>
            )}
          </label>

          <div
            className="area-tabs draggable-tabs"
            aria-label="地图区域"
            {...areaDrag}
          >
            <button
              type="button"
              className={activeArea === "all" ? "active" : ""}
              onClick={() => {
                setActiveArea("all");
                setActiveCategory("all");
              }}
            >
              全部区域
            </button>
            {AREA_ORDER.map((area) => (
              <button
                type="button"
                key={area}
                className={activeArea === area ? "active" : ""}
                onClick={() => {
                  setActiveArea(area);
                  setActiveCategory("all");
                }}
              >
                {AREA_META[area].shortLabel}
              </button>
            ))}
          </div>

          <div
            className="category-tabs draggable-tabs"
            aria-label="地点分类"
            {...categoryDrag}
          >
            <button
              type="button"
              className={activeCategory === "all" ? "active" : ""}
              onClick={() => setActiveCategory("all")}
            >
              全部
            </button>
            {availableCategories.map((category) => (
              <button
                type="button"
                key={category}
                className={activeCategory === category ? "active" : ""}
                onClick={() => setActiveCategory(category)}
              >
                {CATEGORY_META[category].label}
              </button>
            ))}
          </div>

          <section className="place-list-section">
            <div className="section-heading">
              <span>
                {activeArea === "all"
                  ? "全部地点"
                  : AREA_META[activeArea].label}
              </span>
              <small>{filteredPlaces.length} 个</small>
            </div>
            <div className="place-list">
              {groupedPlaces.map((group) => (
                <div className="place-area-group" key={group.area}>
                  {activeArea === "all" && (
                    <div className="place-area-heading">
                      <span>{AREA_META[group.area].label}</span>
                      <small>{group.places.length}</small>
                    </div>
                  )}
                  {group.places.map((place) => {
                    const meta = CATEGORY_META[place.category];
                    return (
                      <button
                        type="button"
                        key={place.id}
                        className={`place-row ${selectedPlace.id === place.id ? "active" : ""}`}
                        onClick={() => choosePlace(place)}
                      >
                        <span
                          className="place-glyph"
                          style={{ color: meta.color, background: meta.soft }}
                        >
                          {place.previewEmoji ?? place.markerLabel}
                        </span>
                        <span className="place-copy">
                          <strong>{place.shortName}</strong>
                          <small>
                            {place.categoryLabel}
                            {place.room ? ` · ${place.room}` : ""}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    );
                  })}
                </div>
              ))}
              {filteredPlaces.length === 0 && (
                <div className="empty-search">
                  <MapPin size={20} />
                  <strong>当前清单里没有这个地点</strong>
                  <span>尝试更短的名称，或切换到“全部区域”。</span>
                  <a
                    href="https://maps.duke.edu/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    去 Duke 官方地图搜索
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>
          </section>

          <section
            ref={detailCardRef}
            className="detail-card"
            aria-live="polite"
          >
            <div className="detail-topline">
              <span
                className="category-badge"
                style={{
                  color: CATEGORY_META[selectedPlace.category].color,
                  background: CATEGORY_META[selectedPlace.category].soft,
                }}
              >
                {AREA_META[placeArea(selectedPlace)].shortLabel} ·{" "}
                {selectedPlace.categoryLabel}
              </span>
              <span
                className={`confidence-badge confidence-${selectedPlace.confidence}`}
              >
                {selectedPlace.confidence === "review" ? (
                  <CircleAlert size={13} />
                ) : (
                  <BadgeCheck size={13} />
                )}
                {confidenceLabel(selectedPlace)}
              </span>
            </div>

            <h2>{selectedPlace.name}</h2>
            <p className="detail-summary">{selectedPlace.summary}</p>

            <ul className="fact-list">
              {selectedPlace.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>

            <div className="origin-control">
              <span>路线起点</span>
              <div role="group" aria-label="路线起点">
                <button
                  type="button"
                  className={originMode === "edens" ? "active" : ""}
                  onClick={() => {
                    setOriginMode("edens");
                    const modes = travelModesFor(
                      selectedPlace,
                      EDENS.coordinates,
                    );
                    if (!modes.includes(travelMode)) {
                      setTravelMode(
                        modes.includes("walk") ? "walk" : modes[0],
                      );
                    }
                    clearRoute();
                  }}
                >
                  Edens 1A
                </button>
                <button
                  type="button"
                  className={originMode === "current" ? "active" : ""}
                  onClick={useCurrentLocation}
                >
                  <LocateFixed size={14} />
                  当前位置
                </button>
              </div>
            </div>

            {locationMessage && (
              <p className="inline-message">{locationMessage}</p>
            )}

            <div className="travel-mode-control">
              <span>交通方式</span>
              <div role="group" aria-label="交通方式">
                {availableTravelModes.map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={travelMode === mode ? "active" : ""}
                    onClick={() => {
                      setTravelMode(mode);
                      clearRoute();
                    }}
                  >
                    {mode === "walk" && <Footprints size={14} />}
                    {mode === "bike" && <Bike size={14} />}
                    {mode === "drive" && <CarFront size={14} />}
                    {mode === "shuttle" && <Bus size={14} />}
                    {TRAVEL_MODE_META[mode].label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="primary-route-button"
              onClick={buildRoute}
              disabled={routeLoading}
            >
              {travelMode === "walk" && <Footprints size={19} />}
              {travelMode === "bike" && <Bike size={19} />}
              {travelMode === "drive" && <CarFront size={19} />}
              {travelMode === "shuttle" && <Bus size={19} />}
              {routeLoading
                ? "正在计算路线…"
                : travelMode === "shuttle"
                  ? "查看 Duke Shuttle 方案"
                  : `规划${TRAVEL_MODE_META[travelMode].label}路线`}
            </button>

            {travelMode === "shuttle" &&
              !shuttlePlan &&
              shuttlePreview && (
                <div className="shuttle-result shuttle-preview">
                  <Bus size={19} />
                  <div>
                    <strong>{shuttlePreview.routeName}</strong>
                    <span>
                      {shuttlePreview.board.shortName} →{" "}
                      {shuttlePreview.alight.shortName}
                    </span>
                    <small>点击上方按钮后显示沿途站点与两端步行。</small>
                  </div>
                </div>
              )}

            {shuttlePlan && (
              <div className="shuttle-result">
                <Bus size={19} />
                <div>
                  <strong>{shuttlePlan.routeName}</strong>
                  <span>
                    在 {shuttlePlan.board.shortName} 上车，于{" "}
                    {shuttlePlan.alight.shortName} 下车
                  </span>
                  <div className="shuttle-walk-summary">
                    <span>
                      起点步行 {(shuttlePlan.originWalkKm * 1000).toFixed(0)} m
                    </span>
                    <span>
                      下车后步行{" "}
                      {(shuttlePlan.destinationWalkKm * 1000).toFixed(0)} m
                    </span>
                  </div>
                  <ol className="shuttle-stop-list">
                    {shuttlePlan.stops.map((stop, index) => (
                      <li key={stop.id}>
                        <b>{index + 1}</b>
                        <span>{stop.name}</span>
                      </li>
                    ))}
                  </ol>
                  <a
                    href="https://duke.transloc.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    TransLoc 实时车辆
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}

            {routeMessage && (
              <div className="route-warning">
                <CircleAlert size={17} />
                {routeMessage}
              </div>
            )}

            {route && (
              <div className="route-result">
                <div className="route-summary">
                  <span>
                    <Clock3 size={17} />
                    <strong>{route.durationMinutes}</strong> 分钟
                  </span>
                  <span>
                    <Navigation size={17} />
                    <strong>{route.distanceKm.toFixed(2)}</strong> km
                  </span>
                  <button type="button" onClick={clearRoute}>
                    清除
                  </button>
                </div>
                <ol className="route-steps">
                  {route.steps.slice(0, 5).map((step, index) => (
                    <li key={`${step.instruction}-${index}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.instruction}</strong>
                        <small>{step.distanceMeters} m</small>
                      </div>
                    </li>
                  ))}
                </ol>
                <p>{route.engine} · 路线仍应以现场封路和标识为准</p>
              </div>
            )}

            <div className="external-route-links">
              <a
                href={mapsLink(selectedPlace, "apple", travelMode)}
                target="_blank"
                rel="noreferrer"
              >
                Apple Maps
                <ExternalLink size={14} />
              </a>
              <a
                href={mapsLink(selectedPlace, "google", travelMode)}
                target="_blank"
                rel="noreferrer"
              >
                Google Maps
                <ExternalLink size={14} />
              </a>
            </div>

            {selectedPlace.links?.map((link) => (
              <a
                className="source-action"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                key={link.url}
              >
                {link.label}
                <ExternalLink size={14} />
              </a>
            ))}

            <button
              type="button"
              className="source-toggle"
              onClick={() => setShowSources((show) => !show)}
            >
              <BadgeCheck size={15} />
              数据来源与核验日期
              {showSources ? (
                <ChevronUp size={15} />
              ) : (
                <ChevronDown size={15} />
              )}
            </button>
            {showSources && (
              <div className="source-detail">
                <a
                  href={selectedPlace.source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selectedPlace.source.label}
                  <ExternalLink size={13} />
                </a>
                <span>核验：{selectedPlace.source.checkedAt}</span>
                {selectedPlace.address && (
                  <span>地址：{selectedPlace.address}</span>
                )}
              </div>
            )}
          </section>

          <section className="schedule-card">
            <div className="section-heading">
              <span>Fall 2026 课程动线</span>
              <small>以 DukeHub 为准</small>
            </div>
            {FALL_2026_PLAN.map((day) => (
              <div className="schedule-day" key={day.day}>
                <strong>{day.day}</strong>
                {day.items.map((item) => {
                  const place = PLACES.find(
                    (candidate) => candidate.id === item.placeId,
                  )!;
                  return (
                    <button
                      type="button"
                      key={`${day.day}-${item.course}`}
                      onClick={() => choosePlace(place)}
                    >
                      <span>{item.time}</span>
                      <div>
                        <strong>{item.course}</strong>
                        <small>{place.shortName}</small>
                      </div>
                      <MapPin size={15} />
                    </button>
                  );
                })}
              </div>
            ))}
          </section>

          <section className="official-links-card">
            <div className="official-title">
              <Sparkles size={17} />
              实时信息交给官方
            </div>
            <div>
              {OFFICIAL_LINKS.map((link) => (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  key={link.url}
                >
                  {link.label}
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </section>

          <footer className="panel-footer">
            <span>
              <Map size={14} />
              地图 © OpenStreetMap
            </span>
            <span>
              <Bus size={14} />
              校车 © Duke / TransLoc
            </span>
            <span>
              <Printer size={14} />
              设施 © Duke ePrint
            </span>
            <span>
              <BookOpen size={14} />
              课程需 DukeHub 确认
            </span>
          </footer>
        </div>
      </aside>
    </main>
  );
}
