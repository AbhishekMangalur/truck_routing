
from django.test import SimpleTestCase

from .services import classify_threshold, classify_weather, RISK_LEVELS


class WeatherRiskTests(SimpleTestCase):

    def test_risk_levels_are_ordered(self):
        self.assertEqual(RISK_LEVELS["Low"], 1)
        self.assertEqual(RISK_LEVELS["No Travel"], 5)

    def test_rain_threshold_boundaries(self):
        thresholds = [0.10, 0.25, 0.50, 1.00]

        self.assertEqual(classify_threshold(0.099, thresholds), "Low")
        self.assertEqual(classify_threshold(0.10, thresholds), "Moderate")
        self.assertEqual(classify_threshold(0.25, thresholds), "High")
        self.assertEqual(classify_threshold(0.50, thresholds), "Severe")
        self.assertEqual(classify_threshold(1.00, thresholds), "No Travel")

    def test_wind_thresholds(self):
        self.assertEqual(classify_weather(wind_mph=24)["risk"], "Low")
        self.assertEqual(classify_weather(wind_mph=25)["risk"], "Moderate")
        self.assertEqual(classify_weather(wind_mph=35)["risk"], "High")
        self.assertEqual(classify_weather(wind_mph=45)["risk"], "Severe")
        self.assertEqual(classify_weather(wind_mph=55)["risk"], "No Travel")

    def test_heavy_load_increases_wind_risk(self):
        result = classify_weather(wind_mph=45, load_lb=35000)
        self.assertEqual(result["risk"], "No Travel")

    def test_worst_weather_condition_wins(self):
        result = classify_weather(
            wind_mph=10,
            rain_in_hr=0.60,
            snow_in_hr=0.0,
        )
        self.assertEqual(result["risk"], "Severe")
