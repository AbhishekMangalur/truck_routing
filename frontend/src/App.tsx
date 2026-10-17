import RouteMap from "./components/RouteMap";
import { useState } from "react";
import "./index.css";

const API_URL ="https://truckrouting-jbj5ernrf-abhisheks-projects-3c816ed5.vercel.app/api/routes/";

type Route = {
  route_id: number;
  distance_meters: number;
  duration_seconds: number;
  geometry: {
    coordinates: [number, number][];
  };
  checkpoints?: {
    distance_miles: number;
    coordinates: [number, number];
    risk: string;
    wind_mph?: number;
    rain_in_hr?: number;
    snow_in_hr?: number;
  }[];
  weather_status?: string;
  severe_miles?: number;
  high_miles?: number;
  average_risk?: number;
};


export default function App() {
  const [origin, setOrigin] = useState("-122.4194, 37.7749");
  const [destination, setDestination] = useState("-121.8863, 37.3382");
  const [departure, setDeparture] = useState("2026-10-16T18:00");
  const [load, setLoad] = useState("20000");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [recommended, setRecommended] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forecastOffsetHours, setForecastOffsetHours] = useState(0);
  const [intervalMiles, setIntervalMiles] = useState(10);

  
async function findRoutes(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setLoading(true);
  setError("");
  setRoutes([]);
  setRecommended(null);

  try {
    const [originLon, originLat] = origin.split(",").map(Number);
    const [destinationLon, destinationLat] = destination
      .split(",")
      .map(Number);

    if (
      ![originLon, originLat, destinationLon, destinationLat].every(
        Number.isFinite,
      ) ||
      originLon < -180 ||
      originLon > 180 ||
      destinationLon < -180 ||
      destinationLon > 180 ||
      originLat < -90 ||
      originLat > 90 ||
      destinationLat < -90 ||
      destinationLat > 90
    ) {
      throw new Error(
        "Enter valid coordinates as longitude, latitude.",
      );
    }

    if (!Number.isFinite(Number(load)) || Number(load) < 0) {
      throw new Error("Truck load must be zero or greater.");
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin_lon: originLon,
        origin_lat: originLat,
        destination_lon: destinationLon,
        destination_lat: destinationLat,
        departure_datetime: new Date(departure).toISOString(),
        load_lb: Number(load),
        interval_miles: intervalMiles,
        forecast_offset_hours: forecastOffsetHours,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.details
          ? `${data.error || "Request failed"} ${data.details}`
          : data.error || `Request failed (${response.status}).`,
      );
    }

    if (!Array.isArray(data.routes) || data.routes.length === 0) {
      throw new Error("No routes were returned. Try different coordinates.");
    }

    setRoutes(data.routes);
    setRecommended(data.recommended_route_id ?? null);
  } catch (err) {
    setError(
      err instanceof TypeError
        ? "Cannot connect to the routing server. Check that Django is running."
        : err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
    );
  } finally {
    setLoading(false);
  }
}


  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">SPOTTER · LOGISTICS INTELLIGENCE</p>
        <h1>Weather-aware truck routing</h1>
        <p>Compare routes, forecast conditions, and identify weather risks before departure.</p>
      </header>

      <section className="panel">
        <h2>Plan your trip</h2>
        <form onSubmit={findRoutes}>
          <label>
            Origin (longitude, latitude)
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} required />
          </label>
          <label>
            Destination (longitude, latitude)
            <input value={destination} onChange={(e) => setDestination(e.target.value)} required />
          </label>
          <div className="form-row">
            <label>
              Departure time
              <input
                type="datetime-local"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                required
              />
            </label>
            <label>
              Truck load (lb)
              <input
                type="number"
                min="0"
                value={load}
                onChange={(e) => setLoad(e.target.value)}
                required
              />
            </label>
          </div>

<label>
  Weather checkpoint interval
  <select
    value={intervalMiles}
    onChange={(e) => setIntervalMiles(Number(e.target.value))}
  >
    <option value={10}>Every 10 miles</option>
    <option value={25}>Every 25 miles</option>
    <option value={50}>Every 50 miles</option>
  </select>
</label>

          <label className="forecast-slider">
  Forecast offset: {forecastOffsetHours} hours
  <input
    type="range"
    min="0"
    max="48"
    step="1"
    value={forecastOffsetHours}
    onChange={(e) => setForecastOffsetHours(Number(e.target.value))}
  />
  <div className="slider-labels">
    <span>Now (0h)</span>
    <span>24h</span>
    <span>48h</span>
  </div>
</label>
          <button disabled={loading}>
            {loading ? "Analyzing routes…" : "Find safest routes"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="results">
        <h2>Route comparison</h2>
        {routes.length > 0 && (
          <RouteMap
            routes={routes}
            recommendedRouteId={recommended}
          />
        )}
        
{routes.length > 0 && (
  <p className="recommendation-note">
    Recommended route prioritizes lower weather risk, followed by shorter
    travel time.
  </p>
)}

        {!routes.length && !loading && (
          <p className="muted">Enter your trip details and find routes to see weather analysis.</p>
        )}
        {routes.map((route) => (
          <article className="route-card" key={route.route_id}>
            <div className="route-heading">
              <h3>Route {route.route_id}</h3>
              {route.route_id === recommended && <span className="recommended">Recommended</span>}
            </div>
            <div className="stats">
              <div><span>Distance</span><strong>{(route.distance_meters / 1609.344).toFixed(1)} mi</strong></div>
              <div><span>Driving time</span><strong>{Math.round(route.duration_seconds / 60)} min</strong></div>
              <div><span>Average risk</span><strong>{route.average_risk ?? "—"} / 5</strong></div>
            </div>
            <p>Weather analysis: {route.weather_status || "Pending"}</p>
            <p>High-risk miles: {route.high_miles ?? 0} · Severe-risk miles: {route.severe_miles ?? 0}</p>
            <h4>Weather checkpoints</h4>
            {route.checkpoints?.map((point, index) => (
              <div className="checkpoint" key={`${route.route_id}-${index}`}>
                <span>{point.distance_miles.toFixed(1)} mi</span>
                <span className={`risk risk-${point.risk.toLowerCase().replaceAll(" ", "-")}`}>
                  {point.risk}
                </span>
                <span>Wind {point.wind_mph ?? 0} mph</span>
                <span>Rain {point.rain_in_hr ?? 0} in/hr</span>
                <span>Snow {point.snow_in_hr ?? 0} in/hr</span>
              </div>
            ))}
          </article>
        ))}
      </section>
    </main>
  );
}
