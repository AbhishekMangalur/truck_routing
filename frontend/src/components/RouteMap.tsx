
import { Fragment, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

type Checkpoint = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  lng?: number;
  coordinates?: [number, number];
  risk_level?: string;
  risk?: string;
  weather_risk?: string;
  wind_mph?: number;
  wind_speed?: number;
  rain_in?: number;
  precipitation?: number;
  snow_in?: number;
  eta?: string;
  arrival_time?: string;
  [key: string]: unknown;
};

type Route = {
  route_id: number;
  geometry: {
    coordinates: [number, number][];
  };
  checkpoints?: Checkpoint[];
  distance_miles?: number;
  duration_minutes?: number;
  is_recommended?: boolean;
  recommended?: boolean;
  [key: string]: unknown;
};

type RouteMapProps = {
  routes: Route[];
  selectedRouteId?: number | null;
  recommendedRouteId?: number | null;
  showHeatmap?: boolean;
};

const ROUTE_COLORS: Record<number, string> = {
  1: "#2563eb",
  2: "#16a34a",
  3: "#9333ea",
};

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];

function getRisk(checkpoint: Checkpoint): string {
  return String(
    checkpoint.risk_level ??
      checkpoint.weather_risk ??
      checkpoint.risk ??
      "low"
  )
    .toLowerCase()
    .replaceAll("_", " ");
}

function riskColor(risk: string): string {
  if (risk.includes("no travel")) return "#7f1d1d";
  if (risk.includes("severe")) return "#dc2626";
  if (risk.includes("high")) return "#f97316";
  if (risk.includes("moderate")) return "#eab308";
  return "#16a34a";
}

function getCheckpointPosition(
  checkpoint: Checkpoint
): [number, number] | null {
  if (Array.isArray(checkpoint.coordinates)) {
    const [lon, lat] = checkpoint.coordinates;

    if (
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      Math.abs(lon) <= 180 &&
      Math.abs(lat) <= 90
    ) {
      return [lat, lon];
    }
  }

  const lat = checkpoint.latitude ?? checkpoint.lat;
  const lon = checkpoint.longitude ?? checkpoint.lon ?? checkpoint.lng;

  if (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  ) {
    return [lat, lon];
  }

  return null;
}

function getRoutePositions(route: Route): [number, number][] {
  if (!Array.isArray(route.geometry?.coordinates)) {
    return [];
  }

  return route.geometry.coordinates
    .filter(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]) &&
        Math.abs(coordinate[0]) <= 180 &&
        Math.abs(coordinate[1]) <= 90
    )
    .map(
      ([longitude, latitude]) =>
        [latitude, longitude] as [number, number]
    );
}

function FitRoutes({ routes }: { routes: Route[] }) {
  const map = useMap();

  useEffect(() => {
    const positions = routes.flatMap(getRoutePositions);

    if (positions.length) {
      map.fitBounds(L.latLngBounds(positions), {
        padding: [40, 40],
        maxZoom: 12,
      });
    }
  }, [map, routes]);

  return null;
}

function WeatherHeatmap({
  routes,
  enabled,
}: {
  routes: Route[];
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const leaflet = L as typeof L & {
      heatLayer?: (
        points: [number, number, number][],
        options?: Record<string, unknown>
      ) => L.Layer;
    };

    if (typeof leaflet.heatLayer !== "function") {
      console.error(
        "Leaflet heat plugin is unavailable. Install the leaflet.heat package."
      );
      return;
    }

    const points: [number, number, number][] = [];

    routes.forEach((route) => {
      (route.checkpoints ?? []).forEach((checkpoint) => {
        const position = getCheckpointPosition(checkpoint);
        if (!position) return;

        const risk = getRisk(checkpoint);

        let intensity = 0.25;
        if (risk.includes("moderate")) intensity = 0.45;
        if (risk.includes("high")) intensity = 0.7;
        if (risk.includes("severe")) intensity = 0.9;
        if (risk.includes("no travel")) intensity = 1;

        points.push([position[0], position[1], intensity]);
      });
    });

    if (!points.length) {
      console.warn("Heatmap not displayed: no valid checkpoint coordinates.");
      return;
    }

    const heatLayer = leaflet.heatLayer(points, {
      radius: 35,
      blur: 25,
      minOpacity: 0.45,
      maxZoom: 17,
      max: 1,
      gradient: {
        0.2: "#22c55e",
        0.45: "#eab308",
        0.7: "#f97316",
        1: "#dc2626",
      },
    });

    heatLayer.addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, routes, enabled]);

  return null;
}

function RouteLegend({
  recommendedRouteId,
}: {
  recommendedRouteId: number | null;
}) {
  const riskItems: [string, string][] = [
    ["Low", "#16a34a"],
    ["Moderate", "#eab308"],
    ["High", "#f97316"],
    ["Severe", "#dc2626"],
    ["No Travel", "#7f1d1d"],
  ];

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 1000,
        bottom: 20,
        left: 12,
        background: "#fff",
        color: "#111827",
        padding: "12px 14px",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        fontSize: 12,
        lineHeight: 1.8,
      }}
    >
      <strong>Routes</strong>

      {Object.entries(ROUTE_COLORS).map(([id, color]) => (
        <div
          key={id}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 22,
              height: 5,
              borderRadius: 2,
              background: color,
              display: "inline-block",
            }}
          />
          Route {id}
          {Number(id) === recommendedRouteId && (
            <strong style={{ color: "#15803d" }}>Recommended</strong>
          )}
        </div>
      ))}

      {recommendedRouteId !== null && (
        <div style={{ fontSize: 11, color: "#15803d" }}>
          Thick dark outline = recommended route
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          marginTop: 6,
          paddingTop: 5,
        }}
      >
        <strong>Weather risk</strong>

        {riskItems.map(([label, color]) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: color,
                display: "inline-block",
              }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RouteMap({
  routes,
  selectedRouteId = null,
  recommendedRouteId = null,
  showHeatmap = true,
}: RouteMapProps) {
  const validRoutes = (routes ?? []).filter(
    (route) =>
      Number.isFinite(route.route_id) &&
      getRoutePositions(route).length >= 2
  );

  const allPositions = validRoutes.flatMap(getRoutePositions);

  const initialCenter =
    allPositions.length > 0 ? allPositions[0] : DEFAULT_CENTER;

  useEffect(() => {
    console.table(
      validRoutes.map((route) => {
        const positions = getRoutePositions(route);

        return {
          route_id: route.route_id,
          points: positions.length,
          checkpoints: route.checkpoints?.length ?? 0,
          first: JSON.stringify(positions[0]),
          middle: JSON.stringify(
            positions[Math.floor(positions.length / 2)]
          ),
          last: JSON.stringify(positions[positions.length - 1]),
        };
      })
    );
  }, [routes]);

  // Draw ordinary routes first and the recommended route last.
  // This helps keep the recommended route visible where lines overlap.
  const orderedRoutes = [...validRoutes].sort((a, b) => {
    const aRecommended =
      a.route_id === recommendedRouteId ||
      a.is_recommended === true ||
      a.recommended === true;

    const bRecommended =
      b.route_id === recommendedRouteId ||
      b.is_recommended === true ||
      b.recommended === true;

    return Number(aRecommended) - Number(bRecommended);
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 450,
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <MapContainer
        center={initialCenter}
        zoom={10}
        scrollWheelZoom
        style={{ width: "100%", height: "100%", minHeight: 450 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitRoutes routes={validRoutes} />

        <WeatherHeatmap routes={validRoutes} enabled={showHeatmap} />

        {orderedRoutes.map((route) => {
          const positions = getRoutePositions(route);
          const color = ROUTE_COLORS[route.route_id] ?? "#64748b";

          const isSelected = selectedRouteId === route.route_id;
          const isRecommended =
            route.route_id === recommendedRouteId ||
            route.is_recommended === true ||
            route.recommended === true;

          return (
            <Fragment key={route.route_id}>
              {/* Outline for visibility where route lines overlap */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color: isRecommended
                    ? "#14532d"
                    : route.route_id === 3
                      ? "#581c87"
                      : "#ffffff",
                  weight: isRecommended ? 14 : route.route_id === 3 ? 13 : 9,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                interactive={false}
              />

              {/* Main route line */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color,
                  weight: isRecommended
                    ? 9
                    : isSelected
                      ? 8
                      : route.route_id === 3
                        ? 8
                        : 5,
                  opacity: isRecommended ? 1 : 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              >
                <Popup>
                  <strong>Route {route.route_id}</strong>

                  {isRecommended && (
                    <div style={{ color: "#15803d", fontWeight: 700 }}>
                      Recommended route
                    </div>
                  )}

                  {typeof route.distance_miles === "number" && (
                    <div>Distance: {route.distance_miles.toFixed(1)} mi</div>
                  )}

                  {typeof route.duration_minutes === "number" && (
                    <div>Duration: {route.duration_minutes} min</div>
                  )}

                  <div>Checkpoints: {route.checkpoints?.length ?? 0}</div>
                </Popup>
              </Polyline>
            </Fragment>
          );
        })}

        {/* Weather checkpoint markers */}
        {validRoutes.map((route) =>
          (route.checkpoints ?? []).map((checkpoint, index) => {
            const position = getCheckpointPosition(checkpoint);
            if (!position) return null;

            const risk = getRisk(checkpoint);

            return (
              <CircleMarker
                key={`${route.route_id}-checkpoint-${index}`}
                center={position}
                radius={5}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1.5,
                  fillColor: riskColor(risk),
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <strong>
                    Route {route.route_id} — Checkpoint {index + 1}
                  </strong>

                  <div>Risk: {risk}</div>

                  {typeof checkpoint.wind_mph === "number" && (
                    <div>Wind: {checkpoint.wind_mph} mph</div>
                  )}

                  {typeof checkpoint.wind_speed === "number" && (
                    <div>Wind: {checkpoint.wind_speed} mph</div>
                  )}

                  {typeof checkpoint.rain_in === "number" && (
                    <div>Rain: {checkpoint.rain_in} in</div>
                  )}

                  {typeof checkpoint.precipitation === "number" && (
                    <div>Precipitation: {checkpoint.precipitation}</div>
                  )}

                  {typeof checkpoint.snow_in === "number" && (
                    <div>Snow: {checkpoint.snow_in} in</div>
                  )}

                  {(checkpoint.eta ?? checkpoint.arrival_time) && (
                    <div>
                      ETA: {String(checkpoint.eta ?? checkpoint.arrival_time)}
                    </div>
                  )}
                </Popup>
              </CircleMarker>
            );
          })
        )}

        {allPositions.length > 0 && (
          <>
            <CircleMarker
              center={allPositions[0]}
              radius={8}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: "#7c3aed",
                fillOpacity: 1,
              }}
            >
              <Popup>Origin</Popup>
            </CircleMarker>

            <CircleMarker
              center={allPositions[allPositions.length - 1]}
              radius={8}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: "#111827",
                fillOpacity: 1,
              }}
            >
              <Popup>Destination</Popup>
            </CircleMarker>
          </>
        )}
      </MapContainer>

      <RouteLegend recommendedRouteId={recommendedRouteId} />
    </div>
  );
}
