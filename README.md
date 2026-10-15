
# Weather-Aware Truck Routing

A full-stack application that compares alternative truck routes, analyzes weather conditions along each route, and recommends a safer route based on weather risk and estimated travel time.

## Features

- **Multiple route options:** Generate up to three driving routes between an origin and destination.
- **Weather-aware checkpoints:** Analyze weather at configurable distance intervals along each route.
- **Weather risk classification:** Categorize conditions as Low, Moderate, High, Severe, or No Travel.
- **Load-aware risk assessment:** Account for truck cargo weight when evaluating wind-related risk.
- **Interactive map:** Display routes, checkpoints, origin, destination, and risk-colored route segments.
- **Weather heatmap:** Visualize weather risk intensity around sampled checkpoints.
- **Route recommendation:** Rank routes using severe-weather exposure, high-risk exposure, average risk, and estimated duration.
- **Forecast adjustment:** Change the forecast offset and recalculate weather conditions.
- **REST API:** Expose routing and weather analysis through a Django endpoint.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- React Leaflet
- Leaflet and leaflet.heat

### Backend
- Python
- Django
- Django REST Framework (if configured in the project)
- FreeRoute Directions API
- Open-Meteo weather forecast API

### Testing
- Django automated tests

## Project Structure

```text
spotter-truck-routing/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── RouteMap.tsx
│   │   │   └── leafletHeat.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   └── App.tsx
│   └── package.json
│
├── backend/
│   ├── config/
│   ├── routing/
│   │   ├── services.py
│   │   ├── views.py
│   │   ├── tests.py
│   │   └── urls.py
│   ├── manage.py
│   ├── requirements.txt
│   └── .env
│
└── README.md
```

## Prerequisites

- Python 3.10 or a compatible version supported by the project dependencies
- Node.js and npm
- A FreeRoute API key
- Internet access for routing, weather forecasts, and map tiles

## Setup Instructions

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd spotter-truck-routing
```

### 2. Configure the backend

Open a terminal in the project root:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create or update the backend `.env` file:

```env
FREE_ROUTE_API_KEY=your_free_route_api_key
```

Keep API keys private. Do not commit `.env` to GitHub.

Apply database migrations:

```bash
python manage.py migrate
```

Start the backend server:

```bash
python manage.py runserver
```

The backend should be available at:

```text
http://127.0.0.1:8000/
```

### 3. Configure the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173/
```

Ensure the frontend API URL points to:

```text
http://127.0.0.1:8000/api/routes/
```

## API Usage

### Health Check

```http
GET /api/health/
```

### Generate Routes

```http
POST /api/routes/
Content-Type: application/json
```

Example request body:

```json
{
  "origin_lon": -122.4194,
  "origin_lat": 37.7749,
  "destination_lon": -121.8863,
  "destination_lat": 37.3382,
  "departure_datetime": "2026-10-16T18:00:00Z",
  "load_lb": 35000,
  "interval_miles": 10,
  "forecast_offset_hours": 0
}
```

### Request Parameters

| Parameter | Description |
|---|---|
| `origin_lon` | Origin longitude |
| `origin_lat` | Origin latitude |
| `destination_lon` | Destination longitude |
| `destination_lat` | Destination latitude |
| `departure_datetime` | Planned departure time in ISO 8601 format |
| `load_lb` | Truck cargo weight in pounds |
| `interval_miles` | Checkpoint spacing: 10, 25, or 50 miles |
| `forecast_offset_hours` | Forecast adjustment from 0 to 48 hours |

The response includes the available routes, checkpoint weather information, risk summaries, estimated travel times, and recommended route ID.

## Weather Risk Assessment

The application evaluates wind, rainfall, and snowfall at route checkpoints.

Risk levels:

- **Low:** Relatively favorable conditions.
- **Moderate:** Conditions require attention.
- **High:** More challenging conditions.
- **Severe:** Significant weather-related risk.
- **No Travel:** Conditions meet the configured no-travel criteria.

Wind risk also considers the truck's cargo weight. The overall checkpoint risk reflects the most severe classified weather condition.

The recommendation logic prioritizes routes with less severe-weather exposure, less high-risk exposure, lower average risk, and shorter estimated duration.

Note: Risk thresholds are application rules and should not be interpreted as official road closures or professional safety guidance.

## Testing

From the backend directory, activate the virtual environment and run:

```powershell
python manage.py test routing
```

The current automated test suite covers five cases:

1. Risk-level ordering.
2. Rainfall threshold boundaries.
3. Wind-risk thresholds.
4. Load-dependent wind risk.
5. Selection of the worst weather condition.

## Limitations

- Weather analysis depends on the availability and coverage of the forecast provider.
- Forecast values are sampled at checkpoints; conditions between checkpoints may differ.
- The heatmap visualizes sampled risk levels and is not a live weather-radar overlay.
- Route availability and forecast accuracy depend on external services.
- Risk classifications are configurable heuristics and do not guarantee safe travel.

## Security

- Store API keys in environment variables.
- Never commit `.env`, access tokens, or other secrets.
- Configure appropriate CORS and allowed hosts before public deployment.
- Validate API inputs and handle external service failures.

## License

Add the license applicable to this project before distributing it publicly.
