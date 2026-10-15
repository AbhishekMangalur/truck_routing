
import json
import math
from datetime import datetime, timedelta, timezone

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from .services import get_routes, analyze_route_weather, recommend_route


@require_GET
def health_check(request):
    return JsonResponse({
        "status": "ok",
        "service": "Spotter Truck Routing API",
    })


@csrf_exempt
def routes_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "Use POST"}, status=405)

    # 1. Parse and validate the request before calling external APIs.
    try:
        payload = json.loads(request.body)

        if not isinstance(payload, dict):
            return JsonResponse(
                {"error": "Request body must be a JSON object."},
                status=400,
            )

        required = (
            "origin_lon",
            "origin_lat",
            "destination_lon",
            "destination_lat",
            "departure_datetime",
        )

        missing = [field for field in required if field not in payload]
        if missing:
            return JsonResponse(
                {"error": f"Missing required field: {missing[0]}"},
                status=400,
            )

        origin_lon = float(payload["origin_lon"])
        origin_lat = float(payload["origin_lat"])
        destination_lon = float(payload["destination_lon"])
        destination_lat = float(payload["destination_lat"])
        load_lb = float(payload.get("load_lb", 0))
        interval_value = float(payload.get("interval_miles", 10))
        forecast_offset_hours = float(
            payload.get("forecast_offset_hours", 0)
        )

        numbers = [
            origin_lon,
            origin_lat,
            destination_lon,
            destination_lat,
            load_lb,
            interval_value,
            forecast_offset_hours,
        ]

        if not all(math.isfinite(value) for value in numbers):
            return JsonResponse(
                {"error": "All numeric values must be finite."},
                status=400,
            )

        if not (-180 <= origin_lon <= 180 and
                -180 <= destination_lon <= 180):
            return JsonResponse(
                {"error": "Longitude must be between -180 and 180."},
                status=400,
            )

        if not (-90 <= origin_lat <= 90 and
                -90 <= destination_lat <= 90):
            return JsonResponse(
                {"error": "Latitude must be between -90 and 90."},
                status=400,
            )

        if load_lb < 0:
            return JsonResponse(
                {"error": "load_lb cannot be negative."},
                status=400,
            )

        if interval_value not in (10, 25, 50):
            return JsonResponse(
                {"error": "interval_miles must be 10, 25, or 50."},
                status=400,
            )

        if not 0 <= forecast_offset_hours <= 48:
            return JsonResponse(
                {"error": "forecast_offset_hours must be between 0 and 48."},
                status=400,
            )

        departure_text = payload["departure_datetime"]
        if not isinstance(departure_text, str) or not departure_text.strip():
            return JsonResponse(
                {"error": "departure_datetime must be a valid ISO datetime."},
                status=400,
            )

        departure = datetime.fromisoformat(
            departure_text.strip().replace("Z", "+00:00")
        )

        if departure.tzinfo is None:
            departure = departure.replace(tzinfo=timezone.utc)

        departure = departure.astimezone(timezone.utc)
        analysis_departure = departure + timedelta(
            hours=forecast_offset_hours
        )

    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Request body must contain valid JSON."},
            status=400,
        )
    except (ValueError, TypeError, OverflowError):
        return JsonResponse(
            {"error": "Invalid numeric value or datetime format."},
            status=400,
        )

    # 2. Fetch alternative routes.
    try:
        routes = get_routes(
            origin_lon,
            origin_lat,
            destination_lon,
            destination_lat,
        )

        if not routes:
            return JsonResponse(
                {"error": "The routing provider returned no routes."},
                status=502,
            )

    except Exception:
        print("Routing provider failed.")
        return JsonResponse(
            {"error": "Unable to retrieve routes. Check provider configuration and server logs."},
            status=502,
        )

    # 3. Analyze weather separately so forecast errors are identifiable.
    try:
        for route in routes:
            analyze_route_weather(
                route,
                analysis_departure,
                load_lb,
                interval_value,
            )

        routes = recommend_route(routes)

        if not routes:
            return JsonResponse(
                {"error": "No routes could be recommended."},
                status=502,
            )

    except ValueError as exc:
        print("Weather analysis unavailable:", str(exc))
        return JsonResponse(
            {
                "error": "Weather forecast unavailable for one or more route checkpoints.",
                "details": str(exc),
            },
            status=422,
        )
    except Exception:
        print("Weather analysis failed.")
        return JsonResponse(
            {"error": "Weather analysis failed. Check server logs."},
            status=502,
        )

    # 4. Return the successful analysis.
    return JsonResponse({
        "routes_count": len(routes),
        "recommended_route_id": routes[0]["route_id"],
        "forecast_offset_hours": forecast_offset_hours,
        "analysis_departure_datetime": (
            analysis_departure.isoformat().replace("+00:00", "Z")
        ),
        "routes": routes,
    })
