
from typing import Any


RISK_LEVELS = {
    "Low": 1,
    "Moderate": 2,
    "High": 3,
    "Severe": 4,
    "No Travel": 5,
}


def classify_threshold(value: float, thresholds: list[float]) -> str:
    """Classify a measurement using ascending upper boundaries."""
    labels = ["Low", "Moderate", "High", "Severe", "No Travel"]

    for boundary, label in zip(thresholds, labels):
        if value < boundary:
            return label

    return labels[-1]


def classify_weather(
    wind_mph: float | None = None,
    rain_in_hr: float | None = None,
    snow_in_hr: float | None = None,
    load_lb: float = 0,
) -> dict[str, Any]:
    risks = []

    if wind_mph is not None:
        if wind_mph >= 55:
            wind_risk = "No Travel"
        elif wind_mph >= 45:
            wind_risk = (
                "No Travel" if load_lb > 30000 else "Severe"
            )
        elif wind_mph >= 35:
            wind_risk = (
                "Severe" if load_lb > 40000 else "High"
            )
        elif wind_mph >= 25:
            wind_risk = "Moderate"
        else:
            wind_risk = "Low"

        risks.append(wind_risk)

    if rain_in_hr is not None:
        risks.append(classify_threshold(
            rain_in_hr, [0.10, 0.25, 0.50, 1.00]
        ))

    if snow_in_hr is not None:
        risks.append(classify_threshold(
            snow_in_hr, [0.5, 1.0, 2.0, 3.0]
        ))

    if not risks:
        return {"risk": "Low", "risk_score": 1}

    worst_risk = max(risks, key=lambda risk: RISK_LEVELS[risk])

    return {
        "risk": worst_risk,
        "risk_score": RISK_LEVELS[worst_risk],
        "conditions": {
            "wind": wind_mph,
            "rain": rain_in_hr,
            "snow": snow_in_hr,
        },
    }


def recommend_route(routes: list[dict]) -> list[dict]:
    """Rank routes using the assignment's priority order."""
    return sorted(
        routes,
        key=lambda route: (
            route.get("severe_miles", 0),
            route.get("high_miles", 0),
            route.get("average_risk", 0),
            route.get("duration_seconds", float("inf")),
        ),
    )


import os
import requests
from dotenv import load_dotenv

load_dotenv()

FREEROUTE_BASE_URL = "https://api.maps.freeroute.org/v1"


def get_routes(
    origin_lon: float,
    origin_lat: float,
    destination_lon: float,
    destination_lat: float,
) -> list[dict]:
    api_key = os.getenv("FREE_ROUTE_API_KEY")

    if not api_key:
        raise ValueError("FREE_ROUTE_API_KEY is missing from backend/.env")

    url = f"{FREEROUTE_BASE_URL}/directions/driving-car"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    selected_routes = []
    max_attempts = 5
    max_overlap = 0.70

    for attempt in range(1, max_attempts + 1):
        # Vary the alternative-route settings between attempts.
        share_factor = max(0.1, 0.3 - (attempt - 1) * 0.05)
        weight_factor = 1.4 + (attempt - 1) * 0.3

        payload = {
            "coordinates": [
                [origin_lon, origin_lat],
                [destination_lon, destination_lat],
            ],
            "instructions": True,
            "alternative_routes": {
                "target_count": 3,
                "share_factor": share_factor,
                "weight_factor": weight_factor,
            },
        }

        print(
            f"Route generation attempt {attempt}/{max_attempts}: "
            f"share_factor={share_factor}, "
            f"weight_factor={weight_factor}"
        )

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=30,
            )
            print("Routing provider status:", response.status_code)
            response.raise_for_status()
            data = response.json()

        except requests.RequestException as exc:
            print("Routing provider request failed:", repr(exc))
            if not selected_routes:
                raise RuntimeError(
                    f"Routing provider request failed: {exc}"
                ) from exc
            continue

        features = data.get("features", [])

        for feature in features:
            geometry = feature.get("geometry") or {}
            properties = feature.get("properties") or {}
            segments = properties.get("segments") or []
            coordinates = geometry.get("coordinates") or []

            if len(coordinates) < 2:
                continue

            distance = sum(
                segment.get("distance", 0)
                for segment in segments
            )
            duration = sum(
                segment.get("duration", 0)
                for segment in segments
            )

            summary = properties.get("summary") or {}

            if not distance:
                distance = summary.get("distance", 0)

            if not duration:
                duration = summary.get("duration", 0)

            candidate = {
                "distance_meters": distance,
                "duration_seconds": duration,
                "geometry": geometry,
                "segments": segments,
            }

            if is_distinct_route(
                candidate,
                selected_routes,
                max_overlap=max_overlap,
            ):
                candidate["route_id"] = len(selected_routes) + 1
                selected_routes.append(candidate)

                print(
                    f"Accepted route {candidate['route_id']} "
                    f"on attempt {attempt}"
                )

            else:
                print("Rejected overlapping candidate; trying another.")

            if len(selected_routes) == 3:
                break

        if len(selected_routes) == 3:
            break

    if not selected_routes:
        raise ValueError("The routing API returned no valid routes.")

    if len(selected_routes) < 3:
        print(
            f"Warning: only {len(selected_routes)} distinct routes "
            f"were found after {max_attempts} attempts."
        )

    print(f"Distinct routes returned: {len(selected_routes)}")

    return selected_routes

import math
from datetime import datetime, timedelta, timezone


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def haversine_miles(a: list, b: list) -> float:
    """Calculate distance between [longitude, latitude] points."""
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)

    dlon = lon2 - lon1
    dlat = lat2 - lat1

    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )
    return 3958.7613 * 2 * math.asin(
        min(1.0, math.sqrt(value))
    )


def sample_route(
    coordinates: list[list[float]],
    interval_miles: float,
) -> list[dict]:
    """Sample route geometry at the requested distance interval."""
    if interval_miles not in (10, 25, 50):
        raise ValueError("Interval must be 10, 25, or 50 miles.")

    if len(coordinates) < 2:
        raise ValueError("Route geometry has insufficient coordinates.")

    points = []
    cumulative = 0.0

    for start, end in zip(coordinates, coordinates[1:]):
        segment_miles = haversine_miles(start, end)

        if segment_miles <= 0:
            continue

        next_distance = cumulative + segment_miles

        while (
            (len(points) + 1) * interval_miles
            <= next_distance + 1e-9
        ):
            target = (len(points) + 1) * interval_miles
            fraction = (target - cumulative) / segment_miles

            points.append({
                "distance_miles": round(target, 2),
                "coordinates": [
                    start[0] + fraction * (end[0] - start[0]),
                    start[1] + fraction * (end[1] - start[1]),
                ],
            })

        cumulative = next_distance

    # Always include the destination.
    total_miles = cumulative

    if not points or abs(
        points[-1]["distance_miles"] - total_miles
    ) > 0.01:
        points.append({
            "distance_miles": round(total_miles, 2),
            "coordinates": coordinates[-1],
        })

    return points

def get_weather(
    longitude: float,
    latitude: float,
    arrival: datetime,
    load_lb: float,
) -> dict:
    """Fetch the nearest available hourly forecast and classify risk."""
    if arrival.tzinfo is None:
        arrival = arrival.replace(tzinfo=timezone.utc)

    arrival = arrival.astimezone(timezone.utc)

    response = requests.get(
        OPEN_METEO_URL,
        params={
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "wind_speed_10m,rain,snowfall",
            "wind_speed_unit": "kmh",
            "timezone": "UTC",
            "forecast_days": 7,
        },
        timeout=20,
    )
    response.raise_for_status()
    hourly = response.json()["hourly"]

    times = hourly.get("time", [])

    if not times:
        raise ValueError("Weather provider returned no hourly forecast.")

    # Find the forecast hour closest to the estimated arrival.
    available_times = [
        datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        for t in times
    ]

    index = min(
        range(len(available_times)),
        key=lambda i: abs(
            (available_times[i] - arrival).total_seconds()
        ),
    )

    nearest_time = available_times[index]
    time_difference = abs((nearest_time - arrival).total_seconds())

    # Don't use a forecast that is too far from the estimated arrival.
    if time_difference > 90 * 60:
        first_time = available_times[0]
        last_time = available_times[-1]

        raise ValueError(
            f"Arrival {arrival.strftime('%Y-%m-%dT%H:%M')} UTC "
            f"is outside the usable forecast window "
            f"({first_time.strftime('%Y-%m-%dT%H:%M')} to "
            f"{last_time.strftime('%Y-%m-%dT%H:%M')} UTC)."
        )

    wind_kmh = hourly["wind_speed_10m"][index]
    rain_mm = hourly["rain"][index]
    snow_cm = hourly["snowfall"][index]

    # Missing weather must not be treated as safe.
    if wind_kmh is None or rain_mm is None or snow_cm is None:
        raise ValueError("Weather data is missing for this checkpoint.")

    wind_mph = wind_kmh / 1.609344
    rain_in_hr = rain_mm / 25.4
    snow_in_hr = snow_cm / 2.54

    result = classify_weather(
        wind_mph=wind_mph,
        rain_in_hr=rain_in_hr,
        snow_in_hr=snow_in_hr,
        load_lb=load_lb,
    )

    return {
        **result,
        "arrival_time": nearest_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "wind_mph": round(wind_mph, 2),
        "rain_in_hr": round(rain_in_hr, 4),
        "snow_in_hr": round(snow_in_hr, 4),
    }

def analyze_route_weather(
    route: dict,
    departure: datetime,
    load_lb: float,
    interval_miles: float = 10,
) -> dict:
    """Attach checkpoint weather and calculate route risk summaries."""

    checkpoints = sample_route(
        route["geometry"]["coordinates"],
        interval_miles,
    )

    duration = route["duration_seconds"]
    total_distance = route["distance_meters"] / 1609.344

    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=timezone.utc)

    departure = departure.astimezone(timezone.utc)

    # Calculate weather at each checkpoint using its estimated arrival time.
    for checkpoint in checkpoints:
        distance_miles = checkpoint["distance_miles"]

        fraction = (
            min(distance_miles / total_distance, 1.0)
            if total_distance > 0
            else 0.0
        )

        # Preserve seconds instead of rounding arrival to the nearest hour.
        arrival = departure + timedelta(
            seconds=duration * fraction
        )

        lon, lat = checkpoint["coordinates"]

        weather = get_weather(
            lon,
            lat,
            arrival,
            load_lb,
        )

        checkpoint.update(weather)
        checkpoint["arrival_time"] = arrival.isoformat().replace(
            "+00:00", "Z"
        )

    severe_miles = 0.0
    high_miles = 0.0
    weighted_risk = 0.0
    covered_miles = 0.0
    previous_distance = 0.0

    for checkpoint in checkpoints:
        segment_miles = max(
            0.0,
            min(
                interval_miles,
                checkpoint["distance_miles"] - previous_distance,
            ),
        )

        previous_distance = checkpoint["distance_miles"]
        risk = checkpoint["risk"]

        if risk in ("Severe", "No Travel"):
            severe_miles += segment_miles
        elif risk == "High":
            high_miles += segment_miles

        weighted_risk += checkpoint["risk_score"] * segment_miles
        covered_miles += segment_miles

    route["checkpoints"] = checkpoints
    route["severe_miles"] = round(severe_miles, 2)
    route["high_miles"] = round(high_miles, 2)
    route["average_risk"] = round(
        weighted_risk / covered_miles if covered_miles else 0,
        3,
    )

    route["weather_status"] = (
        "No Travel"
        if any(
            checkpoint["risk"] == "No Travel"
            for checkpoint in checkpoints
        )
        else "Analyzed"
    )

    return route

def route_overlap_ratio(
    route_a: dict,
    route_b: dict,
    precision: int = 4,
) -> float:
    """
    Estimate overlap using rounded road-coordinate points.
    Coordinates are GeoJSON [longitude, latitude].
    """
    coords_a = route_a.get("geometry", {}).get("coordinates", [])
    coords_b = route_b.get("geometry", {}).get("coordinates", [])

    if not coords_a or not coords_b:
        return 1.0

    points_a = {
        (round(point[0], precision), round(point[1], precision))
        for point in coords_a
        if len(point) >= 2
    }
    points_b = {
        (round(point[0], precision), round(point[1], precision))
        for point in coords_b
        if len(point) >= 2
    }

    if not points_a or not points_b:
        return 1.0

    shared = len(points_a & points_b)

    return shared / min(len(points_a), len(points_b))


def is_distinct_route(
    candidate: dict,
    selected_routes: list[dict],
    max_overlap: float = 0.70,
) -> bool:
    """Reject a candidate if it overlaps too much with any selected route."""
    for route in selected_routes:
        overlap = route_overlap_ratio(candidate, route)
        print(
            f"Candidate overlap with route "
            f"{route['route_id']}: {overlap:.1%}"
        )

        if overlap > max_overlap:
            return False

    return True