
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
import "./leafletHeat";

type Checkpoint = {
  distance_miles: number;
  coordinates: [number, number];
  risk: string;
  wind_mph?: number;
  rain_in_hr?: number;
  snow_in_hr?: number;
  arrival_time?: string;
};

type Route = {
  route_id: number;
  geometry: { coordinates: [number, number][] };
  checkpoints?: Checkpoint[];
};

type Props = {
  routes: Route[];
  recommendedRouteId: number | null;
};

function riskColor(risk: string): string {
  switch (risk.toLowerCase()) {
    case "moderate":
      return "#eab308";
    case "high":
      return "#f97316";
    case "severe":
      return "#ef4444";
    case "no travel":
      return "#7f1d1d";
    default:
      return "#22c55e";
  }
}

function FitRoutes({ routes }: { routes: Route[] }) {
  const map = useMap();

  useEffect(() => {
    const coordinates = routes.flatMap((route) =>
      route.geometry.coordinates.map(([lon, lat]) =>
        L.latLng(lat, lon)
      )
    );

    if (coordinates.length > 0) {
      map.fitBounds(L.latLngBounds(coordinates), {
        padding: [35, 35],
      });
    }
  }, [map, routes]);

  return null;
}

function WeatherHeatmap({ routes }: { routes: Route[] }) {
  const map = useMap();

  useEffect(() => {
    const heatPoints: [number, number, number][] = [];

    for (const route of routes) {
      for (const point of route.checkpoints ?? []) {
        const risk = point.risk.toLowerCase();

        const intensity =
          risk === "no travel"
            ? 1
            : risk === "severe"
              ? 0.9
              : risk === "high"
                ? 0.7
                : risk === "moderate"
                  ? 0.45
                  : 0.2;

        const [lon, lat] = point.coordinates;
        heatPoints.push([lat, lon, intensity]);
      }
    }

    const heatLayer = L.heatLayer(heatPoints, {
      radius: 35,
      blur: 28,
      maxZoom: 12,
      max: 1,
      minOpacity: 0.3,
      gradient: {
        0.2: "#16a34a",
        0.45: "#eab308",
        0.7: "#f97316",
        0.9: "#dc2626",
        1: "#7f1d1d",
      },
    });

    heatLayer.addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, routes]);

  return null;
}

export default function RouteMap({
  routes,
  recommendedRouteId,
}: Props) {
  const allCoordinates = routes.flatMap((route) =>
    route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon] as [number, number]
    )
  );

  const origin = allCoordinates[0] ?? [37.7749, -122.4194];
  const destination =
    allCoordinates[allCoordinates.length - 1] ?? origin;

  return (
    <>
      <MapContainer
        center={origin}
        zoom={8}
        style={{
          height: "550px",
          width: "100%",
          borderRadius: "12px",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <WeatherHeatmap routes={routes} />
        <FitRoutes routes={routes} />

        {routes.map((route) => {
          const coordinates = route.geometry.coordinates.map(
            ([lon, lat]) => [lat, lon] as [number, number]
          );

          const isRecommended =
            route.route_id === recommendedRouteId;

          const checkpoints = route.checkpoints ?? [];

          return (
            <Fragment key={route.route_id}>
              <Polyline
                positions={coordinates}
                pane="overlayPane"
                pathOptions={{
                  color: isRecommended ? "#2563eb" : "#64748b",
                  weight: isRecommended ? 6 : 4,
                  opacity: 0.9,
                }}
              >
                <Popup>
                  Route {route.route_id}
                  {isRecommended ? " (Recommended)" : ""}
                </Popup>
              </Polyline>

              {checkpoints.map((point, index) => {
                const nextPoint = checkpoints[index + 1];

                if (!nextPoint) return null;

                const segment: [number, number][] = [
                  [
                    point.coordinates[1],
                    point.coordinates[0],
                  ],
                  [
                    nextPoint.coordinates[1],
                    nextPoint.coordinates[0],
                  ],
                ];

                return (
                  <Polyline
                    key={`risk-${route.route_id}-${index}`}
                    positions={segment}
                    pane="overlayPane"
                    pathOptions={{
                      color: riskColor(point.risk),
                      weight: 5,
                      opacity: 1,
                    }}
                  />
                );
              })}

              {checkpoints.map((point, index) => (
                <CircleMarker
                  key={`checkpoint-${route.route_id}-${index}`}
                  center={[
                    point.coordinates[1],
                    point.coordinates[0],
                  ]}
                  radius={7}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: riskColor(point.risk),
                    fillOpacity: 1,
                  }}
                >
                  <Popup>
                    <strong>Route {route.route_id}</strong>
                    <br />
                    Distance: {point.distance_miles} miles
                    <br />
                    Risk: {point.risk}
                    <br />
                    Wind: {point.wind_mph ?? "N/A"} mph
                    <br />
                    Rain: {point.rain_in_hr ?? "N/A"} in/hr
                    <br />
                    Snow: {point.snow_in_hr ?? "N/A"} in/hr
                    <br />
                    Arrival: {point.arrival_time ?? "N/A"}
                  </Popup>
                </CircleMarker>
              ))}
            </Fragment>
          );
        })}

        <CircleMarker
          center={origin}
          radius={9}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#16a34a",
            fillOpacity: 1,
          }}
        >
          <Popup>Origin</Popup>
        </CircleMarker>

        <CircleMarker
          center={destination}
          radius={9}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#dc2626",
            fillOpacity: 1,
          }}
        >
          <Popup>Destination</Popup>
        </CircleMarker>
      </MapContainer>

      <div
        style={{
          marginTop: "12px",
          padding: "12px 16px",
          background: "#ffffff",
          color: "#1f2937",
          border: "1px solid #d1d5db",
          borderRadius: "8px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px 18px",
          fontSize: "13px",
        }}
      >
        <strong>Weather Risk Legend</strong>
        <span><span style={{ color: "#22c55e" }}>●</span> Low</span>
        <span><span style={{ color: "#eab308" }}>●</span> Moderate</span>
        <span><span style={{ color: "#f97316" }}>●</span> High</span>
        <span><span style={{ color: "#ef4444" }}>●</span> Severe</span>
        <span><span style={{ color: "#7f1d1d" }}>●</span> No Travel</span>
        <small style={{ color: "#6b7280" }}>
          Heatmap indicates weather risk intensity
        </small>
      </div>
    </>
  );
}
