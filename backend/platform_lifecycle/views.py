"""Lifecycle email APIs.

- `GET /api/v1/l/<token>` - an email's button: stamps the click, redirects.
- `/api/v1/lifecycle-emails` - every lifecycle step done (admins, RBAC):
  the list, plus `GET overview?days=` (journeys and per-step numbers),
  `GET for-user?user_id=` (one user's choices and messages), `POST
  preview` and `POST test` (one step rendered for a user / sent to the caller).
"""

from django.http import HttpResponseRedirect
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core_api.lifecycle import enabled, get_journey
from core_api.system import audit, email_configured, public_url
from core_api.viewsets import BaseViewSet

from platform_lifecycle import engine, layout
from platform_lifecycle.models import Enrollment, LifecycleSend
from platform_lifecycle.serializers import LifecycleSendSerializer


class ClickView(APIView):
    authentication_classes = []
    permission_classes = []

    @extend_schema(exclude=True)
    def get(self, request, token):
        found = layout.read_click(token)
        if found is None:
            raise NotFound("This link isn't valid.")
        send_id, url = found
        try:
            LifecycleSend.objects.filter(id=send_id, clicked_at__isnull=True).update(clicked_at=timezone.now())
        except (ValueError, TypeError):
            pass
        return HttpResponseRedirect(url)


_Pick = inline_serializer("LifecyclePreview", {
    "journey": serializers.CharField(),
    "step": serializers.CharField(),
    "user_id": serializers.CharField(required=False, help_text="Whose data to render with; default: yours."),
})


class LifecycleSendViewSet(BaseViewSet):
    queryset = LifecycleSend.objects.all()
    serializer_class = LifecycleSendSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]
    search_fields = ["subject", "journey", "step"]
    mcp_enabled = False

    def get_queryset(self):
        return super().get_queryset().order_by("-sent_at")

    def create(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @extend_schema(
        description="Every journey and step with its numbers over the last `days` days (1-365, default 30), "
                    "and what stops mail from going out.",
        responses={200: inline_serializer("LifecycleOverview", {
            "enabled": serializers.BooleanField(), "problems": serializers.ListField(child=serializers.CharField()),
            "days": serializers.IntegerField(), "journeys": serializers.ListField(child=serializers.DictField()),
        })},
    )
    @action(detail=False, methods=["get"])
    def overview(self, request):
        try:
            days = min(max(int(request.query_params.get("days") or 30), 1), 365)
        except ValueError:
            days = 30
        problems = []
        if not enabled():
            problems.append("Lifecycle email is off (System > Settings > Lifecycle email).")
        if not public_url():
            problems.append("PUBLIC_URL isn't set - emails need it for their links, so nothing is sent.")
        if not email_configured():
            problems.append("Email isn't configured (EMAIL_URL).")
        return Response({"enabled": enabled(), "problems": problems, **engine.overview(days)})

    @extend_schema(
        description="One user's lifecycle email: their category choices and the last 50 steps they got "
                    "(or, in the holdout, would have).",
        parameters=[OpenApiParameter("user_id", str, OpenApiParameter.QUERY, required=True)],
        responses={200: inline_serializer("LifecycleUser", {
            "categories": serializers.ListField(child=serializers.DictField()),
            "sends": LifecycleSendSerializer(many=True),
        })},
    )
    @action(detail=False, methods=["get"], url_path="for-user")
    def for_user(self, request):
        from platform_system.preferences import preferences

        user_id = str(request.query_params.get("user_id") or "")
        if not user_id:
            raise ValidationError({"user_id": ["Which user?"]})
        sends = LifecycleSend.objects.filter(user_id=user_id).order_by("-sent_at")[:50]
        return Response({"categories": preferences(user_id), "sends": LifecycleSendSerializer(sends, many=True).data})

    def _render(self, request):
        journey = get_journey(str(request.data.get("journey") or ""))
        if journey is None:
            raise ValidationError({"journey": ["Unknown journey."]})
        step = next((s for s in journey.steps if s.key == request.data.get("step")), None)
        if step is None:
            raise ValidationError({"step": ["Unknown step."]})
        user_id = str(request.data.get("user_id") or request.user.id)
        user = engine.users([user_id]).get(user_id)
        if user is None:
            raise ValidationError({"user_id": ["No such user."]})
        enrollment = Enrollment.objects.filter(user_id=user_id, journey=journey.key).order_by("-entered_at").first()
        ctx = engine.context(enrollment, user_id, user, timezone.now())
        return journey, step, ctx, step.render(ctx)

    @extend_schema(
        description="One step rendered with a user's current data - what they'd get now. `skipped` when the "
                    "step's condition doesn't hold for them.",
        request=_Pick,
        responses={200: inline_serializer("LifecyclePreviewResult", {
            "skipped": serializers.BooleanField(), "subject": serializers.CharField(),
            "text": serializers.CharField(), "html": serializers.CharField(),
        })},
    )
    @action(detail=False, methods=["post"])
    def preview(self, request):
        journey, step, ctx, message = self._render(request)
        if message is None:
            return Response({"skipped": True, "subject": "", "text": "", "html": ""})
        text, html = layout.render(message, ctx.first_name, f"{journey.key}.{step.key}")
        return Response({"skipped": False, "subject": message.subject, "text": text, "html": html})

    @extend_schema(
        description="Sends one step to you (with `user_id`: rendered with their data, still sent to you).",
        request=_Pick,
        responses={200: inline_serializer("LifecycleTestResult", {
            "to": serializers.CharField(), "status": serializers.CharField(), "error": serializers.CharField(),
        })},
    )
    @action(detail=False, methods=["post"])
    def test(self, request):
        from platform_system.mail import deliver

        journey, step, ctx, message = self._render(request)
        if message is None:
            raise ValidationError({"step": ["Skipped for this user - its condition doesn't hold."]})
        me = engine.users([str(request.user.id)]).get(str(request.user.id)) or {}
        to = me.get("email") or getattr(request.user, "email", "")
        ctx.email, ctx.user_id = to, str(request.user.id)
        email = engine.deliver_message(journey, step.key, message, ctx, None, kind="lifecycle-test")
        if email is None:
            raise ValidationError({"step": [f"You've turned off \"{journey.category}\" emails."]})
        deliver(email.id)
        email.refresh_from_db()
        audit("lifecycle.test_sent", request=request, target_label=f"{journey.key}.{step.key}")
        return Response({"to": to, "status": email.status, "error": email.last_error})
