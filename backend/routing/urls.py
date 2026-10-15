from django.urls import path
from .views import health_check, routes_view

urlpatterns = [
    path("health/", health_check, name="health"),
    path("routes/", routes_view, name="routes"),
]