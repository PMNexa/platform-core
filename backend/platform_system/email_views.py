"""Email preferences, unsubscribing, SES events and the suppression list.

- `GET|PUT /api/v1/email/preferences` - the caller's categories.
- `GET|PUT|POST /api/v1/email/unsubscribe/<token>` - no login: the token
  from an email's footer or `List-Unsubscribe` header. POST is the
  one-click unsubscribe (RFC 8058) from that token's category.
- `POST /api/v1/email/ses-events` - SNS notifications from Amazon SES
  (`platform_system.ses`).
- `/api/v1/email-suppressions` - the suppression list (admins, via RBAC).
"""

import json
import logging

from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core_api.system import audit
from core_api.viewsets import BaseViewSet

from platform_system import preferences, ses
from platform_system.models import Suppression, SuppressionReason
from platform_system.serializers import SuppressionSerializer

logger = logging.getLogger(__name__)


class EmailCategoryChoiceSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    help = serializers.CharField()
    enabled = serializers.BooleanField()


def _categories():
    return EmailCategoryChoiceSerializer(many=True)


_Preferences = inline_serializer("EmailPreferences", {"categories": _categories()})
_Save = inline_serializer("EmailPreferencesSave", {
    "categories": serializers.DictField(child=serializers.BooleanField(), help_text="`{category: on}` - leave out ones you don't change."),
})
_TOKEN = OpenApiParameter("token", str, OpenApiParameter.PATH, description="The token from the email's unsubscribe link.")


def _choices(request) -> dict:
    choices = request.data.get("categories") if isinstance(request.data, dict) else None
    if not isinstance(choices, dict):
        raise ValidationError({"categories": ["An object of category: true/false."]})
    return choices


class EmailPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="email_preferences_get", tags=["email"], summary="Your email preferences",
                   description="Every kind of email you can turn off, and whether it's on. Account mail "
                               "(confirmation, password reset, security) is always sent.",
                   responses={200: _Preferences})
    def get(self, request):
        return Response({"categories": preferences.preferences(request.user.id)})

    @extend_schema(operation_id="email_preferences_update", tags=["email"], summary="Change your email preferences",
                   request=_Save, responses={200: _Preferences})
    def put(self, request):
        return Response({"categories": preferences.save(request.user.id, _choices(request))})


class UnsubscribeView(APIView):
    """No login - the signed token is the credential (it names one user)."""

    authentication_classes = []
    permission_classes = []
    openapi_auth = {}
    openapi_errors = ("400", "404")

    def _token(self, token):
        data = preferences.read_token(token)
        if data is None:
            raise NotFound("This link isn't valid.")
        return data

    @extend_schema(operation_id="email_unsubscribe_get", tags=["email"], parameters=[_TOKEN],
                   summary="Email preferences from an unsubscribe link",
                   description="The categories of the link's user, and which one the email came under.",
                   responses={200: inline_serializer("EmailUnsubscribe", {
                       "category": serializers.CharField(), "categories": _categories()})})
    def get(self, request, token):
        data = self._token(token)
        return Response({"category": data["c"], "categories": preferences.preferences(data["u"])})

    @extend_schema(operation_id="email_unsubscribe_update", tags=["email"], parameters=[_TOKEN],
                   summary="Change email preferences from an unsubscribe link", request=_Save,
                   responses={200: _Preferences})
    def put(self, request, token):
        data = self._token(token)
        choices = _choices(request)
        result = preferences.save(data["u"], choices)
        for key, on in choices.items():
            if not on:
                preferences.unsubscribed.send(UnsubscribeView, user_id=data["u"], category=key,
                                              ref=data.get("r", "") if key == data["c"] else "")
        audit("email.preferences_changed", actor=_Actor(data["u"]), target_label=", ".join(
            f"{k}={'on' if v else 'off'}" for k, v in choices.items()))
        return Response({"categories": result})

    @extend_schema(operation_id="email_unsubscribe_one_click", tags=["email"], parameters=[_TOKEN],
                   summary="One-click unsubscribe",
                   description="What a mail client's Unsubscribe button sends (`List-Unsubscribe-Post`): "
                               "turns off the category the email came under.",
                   request=None, responses={200: _Preferences})
    def post(self, request, token):
        data = self._token(token)
        result = preferences.save(data["u"], {data["c"]: False})
        preferences.unsubscribed.send(UnsubscribeView, user_id=data["u"], category=data["c"], ref=data.get("r", ""))
        audit("email.unsubscribed", actor=_Actor(data["u"]), target_label=data["c"])
        return Response({"categories": result})


class _Actor:
    def __init__(self, user_id):
        self.id = user_id


class SesEventsView(APIView):
    """SNS posts JSON as text/plain, so the body is parsed here."""

    authentication_classes = []
    permission_classes = []
    parser_classes = []

    @extend_schema(exclude=True)
    def post(self, request):
        try:
            body = json.loads(request.body or b"{}")
        except ValueError:
            return Response({"detail": "Not JSON."}, status=400)
        try:
            ses.verify(body)
            return Response(ses.handle(body))
        except ses.Rejected as exc:
            logger.warning("Refused an SNS message: %s", exc)
            return Response({"detail": str(exc)}, status=403)


class SuppressionViewSet(BaseViewSet):
    """Addresses nothing is sent to. Adding or removing one is audited."""

    queryset = Suppression.objects.all()
    serializer_class = SuppressionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]
    search_fields = ["email", "detail"]
    mcp_enabled = False

    def get_queryset(self):
        return super().get_queryset().order_by("-created_at")

    def perform_create(self, serializer):
        row = serializer.save(email=serializer.validated_data["email"].strip().lower(),
                              reason=SuppressionReason.MANUAL)
        audit("email.suppressed", request=self.request, target=row)

    def perform_destroy(self, instance):
        audit("email.unsuppressed", request=self.request, target=instance, reason=instance.reason)
        instance.delete()
