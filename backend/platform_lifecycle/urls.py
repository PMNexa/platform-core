"""Mount at `api/v1/`."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from core_api.registry import register_model_endpoint

from platform_lifecycle.models import LifecycleSend
from platform_lifecycle.views import ClickView, LifecycleSendViewSet

router = SimpleRouter(trailing_slash=False)
router.register("lifecycle-emails", LifecycleSendViewSet, basename="lifecycle-emails")
register_model_endpoint(LifecycleSend, "/api/v1/lifecycle-emails")

urlpatterns = [path("l/<str:token>", ClickView.as_view(), name="lifecycle-click"), *router.urls]
